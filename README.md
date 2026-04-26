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

- Kubernetes cluster: AWS EC2 with kubeadm
- Ingress: NGINX Ingress Controller through NodePort
- Monitoring: Prometheus and Grafana prepared through Helm

> Deployment is currently tested in a self-managed Kubernetes environment.
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
- Wallet-to-wallet money transfers with idempotency
- Razorpay integration with webhook validation
- Real-time transaction updates via Socket.IO
- CSV export and advanced transaction filtering
- QR-based payments and scanning
- Admin analytics and monitoring APIs

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
NGINX Ingress
  |
  +--> Frontend - React served by Nginx
  |
  +--> Backend - Node.js and Express
          |
          v
       MongoDB - StatefulSet with persistent storage

Monitoring:
Prometheus -> Grafana

CI/CD:
GitHub Actions -> Docker images -> Kubernetes
```

## System Design Highlights

- Idempotency handling for financial operations
- Separation of frontend, backend, and database layers
- Stateless backend with external persistent storage
- Real-time communication using Socket.IO
- Secure token lifecycle with refresh token rotation
- Service-based communication inside Kubernetes

## DevOps & Infrastructure

- Deployed on AWS EC2 using a self-managed Kubernetes cluster created with kubeadm
- Implemented ingress-based routing using NGINX Ingress Controller
- Configured MongoDB as a StatefulSet with persistent storage
- Used ConfigMaps and Secrets for environment management
- Integrated CI/CD pipeline using GitHub Actions
- Prepared monitoring stack using Helm for Prometheus, Grafana, and Alertmanager
- Used Kustomize so the application can be deployed with one command:

```bash
kubectl apply -k k8s/
```

## Project Structure

```text
digital-wallet-system/
  backend/
  frontend/
  k8s/
    backend/
    database/
    frontend/
    ingress/
    monitoring/
    namespace.yaml
    kustomization.yaml
  .github/workflows/
  docker-compose.yml
```

## Local Setup

Backend:

```bash
cd backend
npm install
cp .env.example .env
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

- Frontend Deployment and ClusterIP Service
- Backend Deployment and ClusterIP Service
- MongoDB StatefulSet and ClusterIP Service
- MongoDB PersistentVolume and PersistentVolumeClaim
- NGINX Ingress for `/`, `/api`, and `/socket.io`
- Backend ConfigMap and Secret

Important backend config:

```yaml
MONGODB_URI: "mongodb://mongo:27017/digital-wallet"
FRONTEND_URL: "/"
```

Install NGINX Ingress Controller:

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

AWS security group rule required for browser access:

```text
Type: Custom TCP
Port: 30080
Source: 0.0.0.0/0
```

Deploy application:

```bash
kubectl apply -k k8s/
```

Check deployment:

```bash
kubectl get pods -n wallet
kubectl get svc -n wallet
kubectl get ingress -n wallet
kubectl get pv
kubectl get pvc -n wallet
```

Application URL:

```text
http://<worker-node-public-ip>:30080
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

- Runs backend tests on every push
- Builds Docker images for frontend and backend
- Push images to Docker Hub
- Ready for Kubernetes deployment integration

This ensures consistency and reduces manual deployment effort.

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
kubectl get all -n wallet
kubectl logs deployment/backend -n wallet
kubectl logs deployment/frontend -n wallet
kubectl describe pod -n wallet -l app.kubernetes.io/component=database
kubectl get endpoints -n wallet
kubectl describe ingress wallet-ingress -n wallet
kubectl get pv
kubectl get pvc -n wallet
```

## Challenges & Learnings

- Handling MongoDB connectivity issues in Kubernetes by replacing localhost with service DNS
- Managing persistent storage using hostPath in kubeadm clusters
- Debugging NodePort and AWS security group networking issues
- Setting up ingress routing without managed cloud services such as EKS or ALB
- Separating sensitive and non-sensitive backend configuration with Secrets and ConfigMaps
- Keeping frontend, backend, database, ingress, and monitoring concerns separated in Kubernetes

## Future Improvements

- Add Horizontal Pod Autoscaler
- Enable HTTPS using cert-manager
- Migrate to managed Kubernetes with EKS for production environments
- Add centralized logging with an EFK or Loki stack
- Add frontend integration tests
- Add database-backed backend integration tests

## License

This project is provided for learning, development, and deployment practice.
