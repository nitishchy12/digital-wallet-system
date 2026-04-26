# Digital Wallet System

Digital Wallet System is a full-stack wallet application built with React, Node.js, Express, MongoDB, Socket.IO, Docker, and Kubernetes. It supports account registration, OTP verification, JWT authentication, wallet balance management, money transfer, add-money payments, QR-based payment flow, transaction history, CSV export, admin APIs, and AWS EKS deployment support.

The project is designed as a practical production-style wallet system. It includes API validation, refresh-token rotation, idempotency keys for financial operations, Razorpay payment verification, webhook reconciliation, Docker images, Kubernetes manifests, AWS Application Load Balancer ingress, and Prometheus/Grafana monitoring instructions through Helm.

## Current Status

- Backend tests pass with Jest.
- Frontend production build compiles successfully.
- Docker setup is available for local full-stack execution.
- Kubernetes manifests are organized with Kustomize.
- AWS EKS deployment guide is included.
- Prometheus, Grafana, and Alertmanager can be installed through Helm.
- Frontend routes are wired to work behind `/api` and `/socket.io` when deployed through Nginx or ingress.

## Main Features

- User registration with OTP email verification
- Login with JWT access token and refresh token
- Refresh-token rotation with hashed refresh token storage
- Forgot-password and reset-password flow
- Protected wallet routes for verified users only
- Wallet balance view
- Add money through mock payment mode or Razorpay
- Razorpay order creation and signature verification
- Razorpay webhook handling with duplicate-event protection
- Money transfer between users
- Idempotency keys for add-money and transfer requests
- Transaction history with filters
- CSV transaction export
- QR code generation for user payment details
- QR scan and prefilled send-money flow
- Dashboard, profile, transaction, QR, and admin endpoints
- Real-time transaction updates through Socket.IO
- Structured logging with Winston and request logging with Morgan
- Global error handling and validation middleware
- Kubernetes health probes and resource limits
- MongoDB StatefulSet with persistent storage for Kubernetes

## Tech Stack

### Frontend

- React 18
- React Router v6
- Tailwind CSS
- Axios
- Socket.IO client
- React Hot Toast
- Framer Motion
- `html5-qrcode`
- `qrcode.react`
- Nginx for production serving

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
- Kustomize
- AWS EKS
- AWS Load Balancer Controller
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
    frontend/
    ingress/
    monitoring/
    aws-eks-deploy.md
    configmap.yaml
    kustomization.yaml
    mongo.yaml
    namespace.yaml
    secret.yaml
  .github/
    workflows/
      ci-cd.yml
  docker-compose.yml
  README.md
```

## Backend Setup

Go to the backend folder and install dependencies:

```bash
cd backend
npm install
```

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Minimum local backend configuration:

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

Start the backend:

```bash
npm run dev
```

The backend runs on:

```text
http://localhost:5000
```

## Frontend Setup

Go to the frontend folder and install dependencies:

```bash
cd frontend
npm install
```

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Local frontend configuration:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SERVER_URL=http://localhost:5000
GENERATE_SOURCEMAP=false
```

Start the frontend:

```bash
npm start
```

The frontend runs on:

```text
http://localhost:3000
```

## Application Routes

### Public Routes

- `/signup`
- `/signin`
- `/login` redirects to `/signin`
- `/register` redirects to `/signup`
- `/verify-otp`
- `/forgot-password`
- `/reset-password`

### Protected Routes

- `/dashboard`
- `/add-money`
- `/send`
- `/send-money` redirects to `/send`
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

Supported transaction query filters:

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

Payment behavior:

- Mock mode can add money without external payment credentials.
- Razorpay mode creates an order and verifies the payment signature.
- Webhook handling verifies `x-razorpay-signature`.
- Duplicate webhook retries are recorded and ignored safely.

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

## Typical End-To-End Flow

1. Register a user with name, email, phone, and password.
2. Read the OTP from the configured email inbox.
3. Verify the OTP.
4. Login and store the access token and refresh token.
5. Add money through mock payment or Razorpay.
6. Register and verify a second user.
7. Transfer money to the second user.
8. View transaction history.
9. Export transactions as CSV.
10. Generate a QR code.
11. Scan a QR code and complete a send-money flow.

## Example API Test Flow

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

Use the access token for protected routes:

```http
Authorization: Bearer <access-token>
```

Add money with mock mode:

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

### Backend

```bash
npm run dev
npm start
npm test
```

### Frontend

```bash
npm start
npm run build
npm test
```

## Testing

Backend tests are located in `backend/tests`.

Current test suites:

- `authController.test.js`
- `walletController.test.js`
- `paymentController.test.js`

Run backend tests:

```bash
cd backend
npm test
```

Build the frontend:

```bash
cd frontend
npm run build
```

## Docker Deployment

Run the full stack locally with Docker Compose:

```bash
docker-compose up --build
```

Docker Compose services:

- Backend API on port `5000`
- Frontend Nginx server on port `3000`
- MongoDB on port `27017`

Access URLs:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:5000
Health:   http://localhost:5000/api/health
```

Docker files:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `docker-compose.yml`

## Kubernetes Deployment

The Kubernetes files are stored in `k8s/`.

The app can be rendered with Kustomize:

```bash
kubectl kustomize k8s
```

Deploy everything:

```bash
kubectl apply -k k8s
```

Check resources:

```bash
kubectl get pods -n wallet
kubectl get svc -n wallet
kubectl get ingress -n wallet
kubectl get pvc -n wallet
```

Kubernetes resources include:

- Namespace: `wallet`
- ConfigMap: `wallet-config`
- Secret: `wallet-secrets`
- Backend Deployment and Service
- Frontend Deployment and Service
- MongoDB StatefulSet and Service
- AWS ALB Ingress
- Persistent volume claim for MongoDB

Before deploying to a real cluster, update:

- `k8s/secret.yaml`
- `k8s/configmap.yaml`
- Docker image names in backend and frontend deployment files if needed

## AWS EKS Deployment

AWS EKS deployment instructions are documented in:

```text
k8s/aws-eks-deploy.md
```

The EKS guide covers:

- Updating kubeconfig
- Installing AWS Load Balancer Controller with Helm
- Applying the wallet manifests
- Getting the ALB DNS name
- Updating `FRONTEND_URL`
- Checking pods, services, ingress, logs, and persistent volume claims

The ingress is configured for the AWS Load Balancer Controller with:

- `ingressClassName: alb`
- internet-facing ALB
- IP target type
- `/api` routed to backend
- `/socket.io` routed to backend
- `/` routed to frontend

## Monitoring With Helm

Monitoring instructions are in:

```text
k8s/monitoring/helm-instructions.md
```

Monitoring values are stored in:

```text
k8s/monitoring/values.yaml
```

Install Prometheus, Grafana, and Alertmanager:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f k8s/monitoring/values.yaml
```

Check monitoring resources:

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
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

## Security Notes

- Do not commit real `.env` files.
- Replace placeholder values in `k8s/secret.yaml` before production deployment.
- Use strong unique values for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Use provider-specific app passwords for SMTP credentials.
- Keep Razorpay keys and webhook secrets private.
- Use HTTPS on production ingress.
- Restrict database access to internal cluster networking.
- Rotate secrets if they are exposed.

## Production Checklist

- Replace all placeholder secrets.
- Configure a real domain name.
- Add HTTPS to the AWS ALB ingress.
- Confirm AWS Load Balancer Controller is installed.
- Confirm EBS CSI driver and default StorageClass are available.
- Confirm MongoDB PVC is bound.
- Configure email provider credentials.
- Configure Razorpay credentials if real payments are required.
- Run backend tests.
- Build frontend production assets.
- Apply Kubernetes manifests.
- Install monitoring stack.
- Check backend logs and health endpoints.
- Verify registration, OTP, login, add-money, transfer, QR, and CSV export flows.

## Useful Commands

Render Kubernetes manifests:

```bash
kubectl kustomize k8s
```

Deploy Kubernetes manifests:

```bash
kubectl apply -k k8s
```

Restart backend:

```bash
kubectl rollout restart deployment/wallet-backend -n wallet
```

View backend logs:

```bash
kubectl logs deployment/wallet-backend -n wallet
```

View frontend logs:

```bash
kubectl logs deployment/wallet-frontend -n wallet
```

Describe ingress:

```bash
kubectl describe ingress wallet-ingress -n wallet
```

Check MongoDB storage:

```bash
kubectl get pvc -n wallet
```

## License

This project is provided for learning, development, and deployment practice. Update this section with the final license you want to use before publishing a production release.
