# Digital Wallet System

Digital Wallet System is a full-stack MERN wallet application with a React frontend, Node.js/Express backend, MongoDB database, Docker support, and Kubernetes deployment manifests for a self-managed kubeadm cluster on AWS EC2.

The application supports user registration, OTP verification, JWT authentication, wallet balance management, money transfer, add-money flows, Razorpay integration, QR-based payment flows, transaction history, CSV export, admin APIs, and real-time wallet updates through Socket.IO.

## Current Deployment Target

This repository is currently configured for:

- AWS EC2 instances
- Self-managed Kubernetes cluster created with kubeadm
- NGINX Ingress Controller
- React frontend served by Nginx on port `80`
- Node.js backend running on port `5000`
- MongoDB running as a StatefulSet with persistent storage
- Prometheus, Grafana, and Alertmanager installed with Helm

This setup does not use EKS, AWS ALB Ingress Controller, or AWS ALB annotations.

## Main Features

- User signup with OTP email verification
- Login with JWT access token and refresh token
- Refresh-token rotation with hashed refresh-token storage
- Forgot-password and reset-password flow
- Protected wallet routes for verified users only
- Wallet balance view
- Add money with mock payment mode or Razorpay
- Razorpay order creation and payment signature verification
- Razorpay webhook handling with duplicate-event protection
- Wallet-to-wallet money transfer
- Idempotency keys for add-money and transfer APIs
- Transaction history with filters
- CSV transaction export
- User QR code generation
- QR scan and prefilled send-money flow
- Admin endpoints
- Real-time transaction updates with Socket.IO
- Structured backend logging with Winston and Morgan
- Global error handling and request validation
- Docker Compose support for local full-stack runs
- Kubernetes deployment with Kustomize
- Helm-based monitoring stack

## Tech Stack

### Frontend

- React 18
- React Router v6
- Tailwind CSS
- Axios
- Socket.IO Client
- React Hot Toast
- Framer Motion
- `html5-qrcode`
- `qrcode.react`
- Nginx

### Backend

- Node.js
- Express
- MongoDB
- Mongoose
- JWT
- Express Validator
- Socket.IO
- Nodemailer
- Razorpay SDK
- Winston
- Morgan
- Jest
- Supertest

### DevOps

- Docker
- Docker Compose
- Kubernetes
- kubeadm
- Kustomize
- NGINX Ingress Controller
- Helm
- Prometheus
- Grafana
- Alertmanager
- GitHub Actions

## Project Structure

```text
digital-wallet-system/
  backend/
    controllers/
    middleware/
    models/
    routes/
    tests/
    utils/
    Dockerfile
    healthcheck.js
    package.json
    server.js
  frontend/
    public/
    src/
      components/
      context/
      pages/
      utils/
    Dockerfile
    nginx.conf
    package.json
  k8s/
    backend/
      configmap.yaml
      deployment.yaml
      secret.yaml
      service.yaml
    database/
      mongo.yaml
      storage.yaml
    frontend/
      deployment.yaml
      service.yaml
    ingress/
      helm-instructions.md
      ingress.yaml
    monitoring/
      helm-instructions.md
      values.yaml
    namespace.yaml
    kustomization.yaml
  .github/
    workflows/
      ci-cd.yml
  docker-compose.yml
  README.md
```

## Local Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Minimum local `.env` values:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/digital-wallet
JWT_SECRET=replace_with_a_long_random_secret
JWT_REFRESH_SECRET=replace_with_a_different_long_random_secret
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d
FRONTEND_URL=http://localhost:3000
```

Email is required for OTP and reset-password flows:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

Razorpay is optional. Mock payment mode works without Razorpay keys.

```env
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

Start backend:

```bash
npm run dev
```

Backend URL:

```text
http://localhost:5000
```

## Local Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Local frontend `.env` values:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SERVER_URL=http://localhost:5000
GENERATE_SOURCEMAP=false
```

Start frontend:

```bash
npm start
```

Frontend URL:

```text
http://localhost:3000
```

## Frontend Routes

Public routes:

- `/signup`
- `/signin`
- `/login`
- `/register`
- `/verify-otp`
- `/forgot-password`
- `/reset-password`

Protected routes:

- `/dashboard`
- `/add-money`
- `/send`
- `/send-money`
- `/transactions`
- `/profile`
- `/qr-code`
- `/scan-qr`

## API Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/verify-otp`
- `POST /api/auth/resend-otp`
- `POST /api/auth/login`
- `POST /api/auth/refresh-token`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/logout`

### Wallet

- `GET /api/wallet/balance`
- `GET /api/wallet/stats`
- `GET /api/wallet/analytics`
- `GET /api/wallet/transactions`
- `GET /api/wallet/transactions/export`
- `GET /api/wallet/search-users`
- `POST /api/wallet/transfer`

Supported transaction filters:

- `type`
- `startDate`
- `endDate`
- `minAmount`
- `maxAmount`

### Payment

- `GET /api/payment/methods`
- `POST /api/payment/create-order`
- `POST /api/payment/verify`
- `POST /api/payment/webhook`

### User

- `GET /api/user/profile`
- `GET /api/user/qr-code`

### Transaction

- `GET /api/transactions`
- `GET /api/transactions/:id`

### Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/users`
- `GET /api/admin/transactions`

### Health

- `GET /api/health`

## End-To-End Test Flow

1. Register a user.
2. Verify the user with OTP from email.
3. Login and store the access token.
4. Add money using mock payment or Razorpay.
5. Register and verify a second user.
6. Transfer money to the second user.
7. Check transaction history.
8. Export transactions as CSV.
9. Generate a QR code.
10. Scan a QR code and complete a send-money flow.

## Useful API Examples

Register:

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "name": "Test User",
  "email": "testuser@example.com",
  "phone": "9876543210",
  "password": "Password@123"
}
```

Verify OTP:

```http
POST /api/auth/verify-otp
Content-Type: application/json
```

```json
{
  "email": "testuser@example.com",
  "otp": "123456"
}
```

Login:

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "testuser@example.com",
  "password": "Password@123"
}
```

Add money with mock payment:

```http
POST /api/payment/create-order
Authorization: Bearer <access-token>
Content-Type: application/json
x-idempotency-key: add-money-001
```

```json
{
  "amount": 5000,
  "paymentGateway": "MOCK",
  "idempotencyKey": "add-money-001"
}
```

Transfer money:

```http
POST /api/wallet/transfer
Authorization: Bearer <access-token>
Content-Type: application/json
x-idempotency-key: transfer-001
```

```json
{
  "receiverEmail": "receiver@example.com",
  "amount": 500,
  "description": "Test transfer",
  "idempotencyKey": "transfer-001"
}
```

## Scripts

Backend:

```bash
cd backend
npm run dev
npm start
npm test
```

Frontend:

```bash
cd frontend
npm start
npm run build
npm test
```

## Testing

Run backend tests:

```bash
cd backend
npm test
```

Build frontend:

```bash
cd frontend
npm run build
```

Current backend test suites:

- `authController.test.js`
- `walletController.test.js`
- `paymentController.test.js`

## Docker Deployment

Run the full stack locally:

```bash
docker-compose up --build
```

Docker Compose services:

- Backend API on port `5000`
- Frontend Nginx server mapped to host port `3000`
- MongoDB on port `27017`

Access URLs:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:5000
Health:   http://localhost:5000/api/health
```

## Kubernetes Folder

The Kubernetes setup is under `k8s/` and supports:

```bash
kubectl apply -k k8s/
```

Resources included:

- Namespace: `wallet`
- Backend ConfigMap: `backend-config`
- Backend Secret: `backend-secret`
- Backend Deployment and ClusterIP Service
- Frontend Deployment and ClusterIP Service
- MongoDB PersistentVolume
- MongoDB StatefulSet and ClusterIP Service
- NGINX Ingress
- Helm instructions for NGINX Ingress Controller
- Helm values and instructions for Prometheus/Grafana

## kubeadm Deployment On AWS EC2

This deployment assumes:

- Kubernetes was created with kubeadm on EC2 instances.
- NGINX Ingress Controller is installed.
- EC2 security groups allow inbound traffic to NodePort `30080`.
- MongoDB local storage path exists or can be created at `/data/mongo`.

Required EC2 security group inbound rule for browser access:

```text
Type: Custom TCP
Port: 30080
Source: 0.0.0.0/0
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

Check NGINX Ingress Controller:

```bash
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

Update these files before production deployment:

- `k8s/backend/secret.yaml`
- `k8s/backend/configmap.yaml`

Keep `FRONTEND_URL` in `k8s/backend/configmap.yaml` as:

```text
/
```

Ingress handles browser routing, so do not hard-code the worker node IP in `FRONTEND_URL`.

Deploy the application:

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

Ingress routes:

- `/` goes to frontend
- `/api` goes to backend
- `/socket.io` goes to backend

## Monitoring With Helm

Install Prometheus, Grafana, and Alertmanager:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f k8s/monitoring/values.yaml
```

Check monitoring:

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
kubectl get pvc -n monitoring
```

Grafana is exposed on NodePort `32000`:

```text
http://<worker-node-public-ip>:32000
```

Get Grafana password:

```bash
kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 --decode
```

Default Grafana username:

```text
admin
```

## Debugging Commands

Check all wallet resources:

```bash
kubectl get all -n wallet
```

Check backend logs:

```bash
kubectl logs deployment/backend -n wallet
```

Check frontend logs:

```bash
kubectl logs deployment/frontend -n wallet
```

Check MongoDB pod:

```bash
kubectl describe pod -n wallet -l app.kubernetes.io/component=database
```

Check backend pod details:

```bash
kubectl describe pod -n wallet -l app.kubernetes.io/component=backend
```

Check service endpoints:

```bash
kubectl get endpoints -n wallet
```

Check ingress:

```bash
kubectl describe ingress wallet-ingress -n wallet
```

Check persistent storage:

```bash
kubectl get pv
kubectl get pvc -n wallet
kubectl describe pvc -n wallet
```

Restart backend:

```bash
kubectl rollout restart deployment/backend -n wallet
```

Restart frontend:

```bash
kubectl rollout restart deployment/frontend -n wallet
```

## CI/CD

GitHub Actions workflow:

```text
.github/workflows/ci-cd.yml
```

The workflow runs on pushes to `main` and performs:

- Checkout
- Node.js setup
- Backend dependency install
- Backend tests
- Backend Docker image build
- Frontend Docker image build
- Docker Hub login
- Docker image push

Required GitHub secrets:

- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`

## Security Checklist

- Do not commit real `.env` files.
- Replace placeholder values in `k8s/backend/secret.yaml`.
- Use strong unique values for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Use an app password or provider-specific SMTP credential for email.
- Keep Razorpay secrets private.
- Allow only required NodePorts in AWS security groups.
- Add TLS for production ingress.
- Rotate secrets if they are exposed.

## Production Checklist

- Build and push backend Docker image.
- Build and push frontend Docker image.
- Update image names in Kubernetes deployments if needed.
- Update backend secrets.
- Update `FRONTEND_URL`.
- Open EC2 security group inbound access for `30080`.
- Install NGINX Ingress Controller.
- Apply manifests with `kubectl apply -k k8s/`.
- Confirm MongoDB PVC is bound.
- Confirm all pods are running.
- Confirm frontend loads from browser.
- Confirm backend health endpoint works through ingress.
- Install monitoring with Helm.
- Verify registration, OTP, login, add-money, transfer, QR, and CSV export flows.

## License

This project is provided for learning, development, and deployment practice. Update this section with the final license before publishing a production release.
