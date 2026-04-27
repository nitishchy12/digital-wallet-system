# Digital Wallet System

A production-style MERN fintech application deployed on a self-managed Kubernetes cluster (kubeadm) on AWS EC2 — no EKS, no managed services.

---

## What Makes This Different

Most fintech demos stop at CRUD. This one goes further: idempotent financial transactions, refresh token rotation with hashed storage, Razorpay webhook deduplication, and real-time balance updates via Socket.IO. The infrastructure is entirely self-managed — Kubernetes bootstrapped with kubeadm, Calico CNI with VXLAN, NGINX Ingress via Helm, and a full monitoring stack. Every component was debugged at the network and system level.

---

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | React, Tailwind CSS, Axios, Socket.IO Client, Nginx |
| Backend | Node.js, Express, Mongoose, JWT, Socket.IO, Nodemailer |
| Database | MongoDB 6 (StatefulSet, hostPath PV, nodeAffinity) |
| Payments | Razorpay (orders + webhooks), mock payment mode |
| Testing | Jest, Supertest |
| Infrastructure | AWS EC2 (t3.medium, Ubuntu 22.04, ap-south-1) |
| Kubernetes | kubeadm v1.29, Calico CNI (VXLAN), NGINX Ingress, Kustomize |
| Monitoring | kube-prometheus-stack (Prometheus, Grafana, Alertmanager) |
| CI/CD | GitHub Actions, Docker Hub |

---

## Architecture

```
Internet
    │
    ▼
NGINX Ingress Controller (NodePort 30080)
    │
    ├── /api, /socket.io  ──►  backend:5000  ──►  mongo:27017
    │                               │
    │                        Socket.IO rooms
    │                        (per-user: user-<id>)
    │
    └── /  ──►  frontend:80  (React SPA, Nginx)


Cluster: 1 master + 2 workers (t3.medium, Ubuntu 22.04)
CNI: Calico VXLAN (BGP disabled — AWS VPC does not support BGP between EC2 instances)
Storage: hostPath PV with nodeAffinity pinned to worker-1
```

---

## Infrastructure

### Cluster

| Component | Detail |
|---|---|
| Kubernetes | v1.29.15, bootstrapped with kubeadm |
| CNI | Calico v3.x, VXLAN mode, BGP disabled |
| Storage | local-path-provisioner + manual hostPath PV for MongoDB |
| Ingress | NGINX Ingress Controller (Helm), NodePort 30080 |
| Monitoring | kube-prometheus-stack (Helm) |

### NodePorts

| Port | Service |
|---|---|
| 30080 | Application (NGINX Ingress HTTP) |
| 30090 | Prometheus |
| 32000 | Grafana |

### AWS Security Group (inbound)

| Port | Source | Purpose |
|---|---|---|
| 22 | Your IP | SSH |
| 6443 | 0.0.0.0/0 | Kubernetes API server |
| 5473 | Both nodes | Calico Typha (Felix → Typha) |
| 4789/UDP | Both nodes | Calico VXLAN encapsulation |
| 10250 | Both nodes | kubelet API |
| 30080 | 0.0.0.0/0 | Application |
| 30090, 32000 | Your IP | Prometheus, Grafana |

### Calico VXLAN

AWS VPC does not support BGP peering between EC2 instances, so Calico's default BGP mode (`BIRD`) fails. VXLAN encapsulates pod traffic in UDP packets (port 4789), bypassing the VPC routing requirement entirely.

```yaml
# k8s/calico/installation.yaml
spec:
  calicoNetwork:
    bgp: Disabled
    ipPools:
      - cidr: 10.244.0.0/16
        encapsulation: VXLAN
```

---

## Key Engineering Decisions

- **Single backend replica** — `global.io` is per-process. Two backend pods means Socket.IO events emitted from pod-2 never reach sockets connected to pod-1. Kept at 1 replica; Redis pub/sub adapter is the correct production fix.

- **MongoDB transaction fallback** — Single-node MongoDB doesn't support multi-document transactions (no replica set). The wallet transfer and payment flows detect `IllegalOperation` (error code 20) and retry in non-transactional mode, keeping atomic balance updates via `$inc` with a balance guard (`$gte: amount`).

- **Idempotency on financial ops** — Every transfer and add-money call accepts an `X-Idempotency-Key` header. Duplicate requests within the same user context return the original result without re-executing. Enforced with a sparse unique index on `(idempotencyUserId, idempotencyKey)`.

- **Refresh token hashing** — Refresh tokens are stored as SHA-256 hashes, compared with `crypto.timingSafeEqual`. A compromised database does not expose valid refresh tokens.

- **secret.local.yaml workflow** — `k8s/backend/secret.yaml` contains dummy placeholders and is committed. Real credentials live in `secret.local.yaml` (gitignored), applied manually: `kubectl apply -f k8s/backend/secret.local.yaml`.

---

## Deployment

### Prerequisites

- 3 EC2 instances (t3.medium, Ubuntu 22.04) with security group rules above
- Docker Hub account + GitHub secrets `DOCKER_USERNAME`, `DOCKER_PASSWORD`
- Helm 3 installed on master node

### Bootstrap cluster (master)

```bash
sudo kubeadm init --pod-network-cidr=10.244.0.0/16

mkdir -p $HOME/.kube
sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config

# Install Calico
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml
# Apply VXLAN patch (bgp: Disabled) — see k8s/calico/installation.yaml
```

### Join workers

```bash
# Run the kubeadm join command printed by kubeadm init on each worker
sudo kubeadm join <master-private-ip>:6443 --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

### Storage — create hostPath directory on worker-1

```bash
# On worker-1 only
sudo mkdir -p /data/mongo
```

Update `k8s/database/storage.yaml` — set `nodeAffinity.hostname` to your worker-1 node name (`kubectl get nodes`).

### Install NGINX Ingress

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx && helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080 \
  --set controller.service.nodePorts.https=30443
```

### Apply secrets and deploy

```bash
# Fill real credentials
cp k8s/backend/secret.yaml k8s/backend/secret.local.yaml
# Edit secret.local.yaml with real values, then:
kubectl apply -f k8s/backend/secret.local.yaml

# Set FRONTEND_URL in configmap to http://<worker-node-public-ip>:30080

# Deploy everything
kubectl apply -k k8s/
```

### Verify

```bash
kubectl get pods -n wallet       # backend, frontend (x2), mongo-0 → Running
kubectl get pvc -n wallet        # mongo-data-mongo-0 → Bound
kubectl get ingress -n wallet
```

App: `http://<worker-node-public-ip>:30080`
Health: `http://<worker-node-public-ip>:30080/api/health`

---

## Monitoring

Deployed via Helm using `kube-prometheus-stack`. Includes Prometheus, Grafana, and Alertmanager.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts && helm repo update

helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f k8s/monitoring/values.yaml
```

| Endpoint | URL |
|---|---|
| Grafana | `http://<worker-node-public-ip>:32000` |
| Prometheus | `http://<worker-node-public-ip>:30090` |

Default Grafana credentials: `admin / prom-operator`

---

## CI/CD

GitHub Actions runs on every push to `main`: installs dependencies, runs backend tests, builds Docker images for both services, tags each image with `:latest` and `:<git-sha>`, and pushes to Docker Hub. SHA tagging keeps `kubectl rollout undo` functional — rolling back re-pulls the exact previous image, not whatever `:latest` currently points to.

---

## Local Development

```bash
# Backend
cd backend && cp .env.example .env && npm install && npm run dev

# Frontend
cd frontend && cp .env.example .env && npm install && npm start

# Full stack via Docker Compose
docker-compose up --build
```

Local: `http://localhost:3000` · API: `http://localhost:5000`

---

## Challenges & Learnings

- **Calico Felix 503 on readiness** — Felix probes Typha on port 5473. AWS security group was missing this inbound rule between nodes. Diagnosed via `kubectl logs -n calico-system -l k8s-app=calico-node` — Felix logs showed repeated TLS dial failures to Typha before the pod crashed.

- **kubeadm join hanging at TLS bootstrap** — Port 6443 in the security group was restricted to a single IP (the admin machine). Worker nodes couldn't reach the API server. Fixed by opening 6443 to `0.0.0.0/0`.

- **Calico "BIRD not ready"** — Default Calico installation attempts BGP peering. AWS VPC drops BGP traffic between EC2 instances. Switched to VXLAN mode by patching the Calico `Installation` CR with `bgp: Disabled`.

- **MongoDB cross-pod DNS** — Backend connecting to `localhost:27017` works locally but fails in Kubernetes. Replaced with Kubernetes service DNS (`mongo:27017`), which resolves to the MongoDB ClusterIP service within the namespace.

- **Socket.IO horizontal scaling** — Discovered that `global.io` is bound to the Node.js process, not the cluster. Scaling to 2 backend replicas caused ~50% of real-time events to be silently dropped (emitted on the wrong pod). Kept at 1 replica; proper fix is a Redis pub/sub adapter (`socket.io-redis`).

- **hostPath PV scheduling** — Without `nodeAffinity`, Kubernetes scheduled the MongoDB pod on a node where `/data/mongo` didn't exist, causing a `volume node affinity conflict` and permanent `Pending` state. Fixed with a `nodeSelectorTerm` pinning the PV to worker-1.

---

## Future Improvements

- Redis pub/sub adapter for Socket.IO → enables horizontal backend scaling
- cert-manager + Let's Encrypt for HTTPS
- Horizontal Pod Autoscaler for frontend
- Replace hostPath PV with EBS CSI driver (StorageClass) for proper cloud-native persistence
- Centralized logging with Loki + Grafana
- Database-backed integration tests (current tests mock MongoDB)
- Migrate to EKS for managed control plane

---

## Screenshots

> _Coming soon — dashboard, transaction flow, Grafana metrics_

---

## License

MIT
