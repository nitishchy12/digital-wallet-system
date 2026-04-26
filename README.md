# Digital Wallet System

A production-style MERN fintech application with Kubernetes-based deployment and real-time wallet operations.

## About This Project

This is a full-stack digital wallet system I built to simulate real-world fintech architecture.
The goal was to design a scalable, deployment-ready system using secure backend flows, real-time communication, Docker, and Kubernetes-based DevOps practices.

This project is designed to simulate production-grade architecture and DevOps workflows. It is not a managed banking product, but it follows patterns commonly used in production systems such as token rotation, idempotency, ingress routing, persistent database storage, and infrastructure separation.

Key focus areas:

- Distributed system design
- Secure payment and wallet flows
- Scalable infrastructure using Kubernetes
- Real-time communication with Socket.IO
- Monitoring-ready infrastructure using Prometheus and Grafana

## Deployment Status

- Kubernetes cluster: AWS EC2 with kubeadm (1 master + 1 worker)
- Ingress: NGINX Ingress Controller through NodePort 30080
- Monitoring: Prometheus and Grafana prepared through Helm

> Deployment is tested in a self-managed Kubernetes environment using kubeadm.
> Production deployment with domain and HTTPS is planned.

## Why I Built This

Most wallet or fintech demos focus only on frontend screens or basic backend CRUD logic.
I built this project to go beyond that by implementing:

- Real-world authentication flows with OTP and refresh tokens
- Idempotent financial transactions
- Event-driven updates using WebSockets
- Production-like infrastructure using Kubernetes and DevOps practices

The goal was to simulate how a real fintech system is structured, deployed, and operated.

## Key Features

- JWT-based authentication with refresh token rotation
- OTP email verification on registration and login
- Wallet-to-wallet money transfers with idempotency
- Razorpay integration with webhook signature validation
- Mock payment mode for testing without real credentials
- Real-time transaction updates via Socket.IO
- CSV export and advanced transaction filtering
- QR-based payments and scanning
- Admin analytics and monitoring APIs
- MongoDB transaction fallback for standalone deployments without a replica set

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | React, React Router, Tailwind CSS, Axios, Socket.IO Client, Nginx |
| Backend | Node.js, Express, MongoDB, Mongoose, JWT, Socket.IO, Nodemailer |
| Payments | Razorpay, webhook signature validation, mock payment mode |
| Testing | Jest, Supertest |
| DevOps | Docker, Docker Compose, Kubernetes, kubeadm, Kustomize, Helm |
| Infrastructure | AWS EC2, NGINX Ingress Controller, MongoDB StatefulSet |
| Monitoring | Prometheus, Grafana, Alertmanager |
| CI/CD | GitHub Actions, Docker Hub |

## Architecture

```text
User
  |
  v
NGINX Ingress (NodePort 30080)
  |
  +--> /api, /socket.io --> Backend - Node.js and Express (1 replica)
  |                               |
  |                               v
  |                          MongoDB - StatefulSet with persistent storage
  |
  +--> /  --> Frontend - React served by Nginx
```

Real-time flow:
```text
Backend --> Socket.IO --> Browser (per-user room: user-<userId>)
```

Monitoring:
```text
Prometheus -> Grafana (NodePort 32000)
```

CI/CD:
```text
GitHub Actions -> Docker images (tagged :latest and :<git-sha>) -> Docker Hub
```

## System Design Highlights

- Idempotency handling for all financial operations (transfers and add-money)
- MongoDB session and transaction support with graceful fallback for standalone deployments
- Separation of frontend, backend, and database layers
- Stateless backend with external persistent storage
- Real-time communication using Socket.IO with per-user rooms
- Secure token lifecycle with refresh token rotation and hashed storage
- Razorpay webhook deduplication using a PaymentWebhookEvent log
- Service-based communication inside Kubernetes using ClusterIP

## DevOps & Infrastructure

- Deployed on AWS EC2 using a self-managed Kubernetes cluster created with kubeadm
- Implemented ingress-based routing using NGINX Ingress Controller via NodePort
- Configured MongoDB as a StatefulSet with PersistentVolume using hostPath and nodeAffinity
- Used ConfigMaps and Secrets for environment management
- Integrated CI/CD pipeline using GitHub Actions with SHA-tagged Docker images
- Prepared monitoring stack using Helm for Prometheus, Grafana, and Alertmanager
- Used Kustomize so the application can be deployed with one command:

```bash
kubectl apply -k k8s/
```

## Project Structure

```text
digital-wallet-system/
  backend/
    controllers/
    middleware/
    models/
    routes/
    utils/
    tests/
    server.js
    Dockerfile
  frontend/
    src/
      components/
      context/
      pages/
      utils/
    nginx.conf
    Dockerfile
  k8s/
    backend/
      configmap.yaml
      secret.yaml
      deployment.yaml
      service.yaml
    database/
      mongo.yaml
      storage.yaml
    frontend/
      deployment.yaml
      service.yaml
    ingress/
      ingress.yaml
      helm-instructions.md
    monitoring/
      values.yaml
      helm-instructions.md
    namespace.yaml
    kustomization.yaml
  .github/workflows/
    ci-cd.yml
  docker-compose.yml
```

## Local Setup

Backend:

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your local values
npm run dev
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Docker:

```bash
docker-compose up --build
```

Local URLs:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:5000
Health:   http://localhost:5000/api/health
```

## Kubernetes Deployment

This Kubernetes setup is built for a self-managed kubeadm cluster on AWS EC2.
It does not use EKS, AWS ALB Ingress Controller, or ALB annotations.

Main Kubernetes components:

- Frontend Deployment (2 replicas) and ClusterIP Service
- Backend Deployment (1 replica) and ClusterIP Service
- MongoDB StatefulSet (1 replica) and ClusterIP Service
- MongoDB PersistentVolume (hostPath with nodeAffinity) and PersistentVolumeClaim
- NGINX Ingress for `/`, `/api`, and `/socket.io`
- Backend ConfigMap and Secret

### Required configuration before deploying

**1. Fill real values in `k8s/backend/secret.yaml`:**

```yaml
stringData:
  JWT_SECRET: "<run: openssl rand -hex 64>"
  JWT_REFRESH_SECRET: "<run: openssl rand -hex 64>"
  EMAIL_HOST: "smtp.gmail.com"
  EMAIL_PORT: "587"
  EMAIL_USER: "your-email@gmail.com"
  EMAIL_PASS: "your-gmail-app-password"
  RAZORPAY_KEY_ID: ""
  RAZORPAY_KEY_SECRET: ""
  RAZORPAY_WEBHOOK_SECRET: ""
```

**2. Set the real frontend URL in `k8s/backend/configmap.yaml`:**

```yaml
data:
  NODE_ENV: "production"
  PORT: "5000"
  MONGODB_URI: "mongodb://mongo:27017/digital-wallet"
  FRONTEND_URL: "http://<worker-node-public-ip>:30080"
  JWT_EXPIRE: "15m"
  JWT_REFRESH_EXPIRE: "7d"
  RUNNING_IN_DOCKER: "true"
  LOG_LEVEL: "info"
```

This is required for password reset email links to work correctly.

**3. Set `nodeAffinity` in `k8s/database/storage.yaml`:**

Without this, MongoDB will be stuck in `Pending` on a 2-node cluster because the `hostPath` directory only exists on one node.

```yaml
spec:
  ...
  hostPath:
    path: /data/mongo
    type: DirectoryOrCreate
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values:
                - <worker-node-hostname>   # from: kubectl get nodes
```

Create the directory on the worker node before deploying:

```bash
sudo mkdir -p /data/mongo
```

### Install NGINX Ingress Controller

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080 \
  --set controller.service.nodePorts.https=30443
```

AWS security group rules required:

```text
Port 22    - TCP - Your IP        - SSH
Port 6443  - TCP - Both nodes     - Kubernetes API
Port 10250 - TCP - Both nodes     - kubelet
Port 30080 - TCP - 0.0.0.0/0     - Application (NGINX NodePort)
Port 32000 - TCP - Your IP        - Grafana (optional)
All traffic - All - Security group self-reference - Pod-to-pod communication
```

### Deploy application

```bash
kubectl apply -k k8s/
```

### Check deployment

```bash
kubectl get pods -n wallet
kubectl get svc -n wallet
kubectl get ingress -n wallet
kubectl get pv
kubectl get pvc -n wallet
```

Expected healthy state:

```text
NAME                  READY   STATUS    RESTARTS
backend-<hash>        1/1     Running   0
frontend-<hash>       1/1     Running   0
frontend-<hash>       1/1     Running   0
mongo-0               1/1     Running   0

NAME                    STATUS   VOLUME     CAPACITY
mongo-data-mongo-0      Bound    mongo-pv   10Gi
```

### Application URL

```text
http://<worker-node-public-ip>:30080
```

Health check:

```text
http://<worker-node-public-ip>:30080/api/health
```

## Monitoring

Monitoring stack is prepared using Helm for Prometheus, Grafana, and Alertmanager.
It is configured in `k8s/monitoring/`, but it is only deployed after running the Helm command below.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f k8s/monitoring/values.yaml
```

Grafana is exposed through NodePort `32000`:

```text
http://<worker-node-public-ip>:32000
```

## CI/CD Pipeline

Automated pipeline using GitHub Actions:

- Runs backend tests on every push to main
- Builds Docker images for frontend and backend
- Tags images with both `:latest` and `:<git-sha>` for rollback support
- Pushes images to Docker Hub

SHA tagging ensures that `kubectl rollout undo` works correctly because each deployment references a unique image tag.

Workflow file:

```text
.github/workflows/ci-cd.yml
```

Required GitHub secrets:

- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`

## Testing

Backend tests:

```bash
cd backend
npm test
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Debugging Commands

```bash
# Pod status
kubectl get all -n wallet

# Logs
kubectl logs deployment/backend -n wallet
kubectl logs deployment/frontend -n wallet
kubectl logs statefulset/mongo -n wallet

# Describe for events and errors
kubectl describe pod -n wallet -l app.kubernetes.io/component=database
kubectl describe pod -n wallet -l app.kubernetes.io/component=backend
kubectl describe ingress wallet-ingress -n wallet

# Storage
kubectl get pv
kubectl get pvc -n wallet

# Network
kubectl get endpoints -n wallet
kubectl get svc -n ingress-nginx
```

## Challenges & Learnings

- Handling MongoDB connectivity in Kubernetes by replacing `localhost` with the service DNS name (`mongo`)
- Managing persistent storage using `hostPath` with `nodeAffinity` to pin the volume to a specific node in a multi-node cluster
- Debugging NodePort and AWS security group networking to expose services correctly
- Setting up ingress routing without managed cloud services such as EKS or ALB
- Understanding that Socket.IO requires a single backend replica without a Redis pub/sub adapter because `global.io` is per-process
- Separating sensitive and non-sensitive backend configuration with Secrets and ConfigMaps
- Implementing MongoDB transaction fallback so financial operations work on standalone MongoDB without a replica set
- Keeping frontend, backend, database, ingress, and monitoring concerns separated in Kubernetes

## Future Improvements

- Add Horizontal Pod Autoscaler for frontend
- Enable HTTPS using cert-manager and Let's Encrypt
- Add Redis pub/sub adapter for Socket.IO to allow multiple backend replicas with correct real-time delivery
- Migrate to managed Kubernetes with EKS for production environments
- Add centralized logging with EFK or Loki stack
- Add frontend integration tests
- Add database-backed backend integration tests
- Replace `hostPath` persistent volume with a proper StorageClass (EBS CSI driver on EKS)

## License

This project is provided for learning, development, and deployment practice.
