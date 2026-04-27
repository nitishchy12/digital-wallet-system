# Digital Wallet System

A production-style MERN fintech application with JWT authentication, idempotent wallet transfers, Razorpay payments, and real-time Socket.IO notifications — deployed on a self-managed Kubernetes cluster on AWS EC2.

---

## What This Project Covers

Most fintech demos are basic CRUD. This one goes further:

- Complete auth lifecycle: OTP verification, JWT + refresh token rotation, hashed token storage
- Idempotent financial transactions — safe to retry, guaranteed no double-debit
- Razorpay integration with HMAC webhook signature verification and webhook deduplication
- MongoDB multi-document transaction fallback for standalone deployments (no replica set needed)
- Real-time balance and transaction updates via Socket.IO per-user rooms
- Full dashboard analytics: monthly spend/receive, sent vs received ratio, top receivers

---

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | React 18, React Router, Tailwind CSS, Axios, Socket.IO Client |
| Backend | Node.js, Express, Mongoose, JWT, Socket.IO, Nodemailer, Winston |
| Database | MongoDB 6 |
| Payments | Razorpay (orders + webhooks), mock payment mode |
| Testing | Jest, Supertest |
| DevOps | Docker, Docker Compose, Kubernetes (kubeadm), Kustomize, Helm |
| Infrastructure | AWS EC2 (t3.medium, Ubuntu 22.04, ap-south-1), Calico VXLAN, NGINX Ingress |
| Monitoring | Prometheus, Grafana, Alertmanager |
| CI/CD | GitHub Actions, Docker Hub |

---

## Application Features

### Authentication & Security
- **Register → OTP → Login** — email OTP sent on registration, verified before wallet access is granted
- **JWT access token (15m) + refresh token (7d)** — access token is short-lived; refresh token is stored as a SHA-256 hash, never as plaintext
- **Refresh token rotation** — every refresh issues a new token pair and invalidates the old one
- **Silent token refresh** — Axios interceptor catches 401 responses, refreshes silently, and replays the original request; concurrent requests queue behind a single refresh call
- **Forgot password** — time-limited reset link (15m) sent via email, token stored as SHA-256 hash
- **Rate limiting** — global 200 req/15m, stricter 20 req/15m on auth routes
- **Helmet, CORS, express-validator** — security headers, origin restriction, input sanitization on all routes

### Wallet & Transfers
- **Wallet created automatically** on first OTP verification
- **Transfer flow** — 3-step UI: search user by name/email → set amount + description → confirm
- **Idempotency** — frontend generates a UUID key (`crypto.randomUUID`) per action; backend checks for a matching key before executing; duplicate requests return the original result with no side effects
- **Atomic debit guard** — MongoDB `updateOne` with `{ balance: { $gte: amount } }` ensures the debit only applies when funds exist — no negative balance possible
- **Balance snapshot** — every transaction stores sender and receiver balances at time of execution for audit

### Payments (Razorpay + Mock)
- **Mock mode** — instant wallet credit for testing without real credentials
- **Razorpay mode** — creates an order, opens Razorpay checkout, verifies `HMAC-SHA256` signature client-side before crediting wallet
- **Webhook handler** — server-side payment confirmation via Razorpay webhook; signature verified with `crypto.timingSafeEqual`
- **Webhook deduplication** — `PaymentWebhookEvent` collection tracks every webhook by `eventId`; replayed events are acknowledged without re-processing

### MongoDB Transaction Handling
- Standalone MongoDB (no replica set) does not support multi-document ACID transactions
- Transfer and payment flows attempt a Mongoose session first; if MongoDB returns error code 20 (`IllegalOperation`), the code retries in non-transactional mode using atomic `$inc` operations with balance guards
- This makes the application deployable on both single-node and replica-set MongoDB without code changes

### Real-Time (Socket.IO)
- On login, frontend joins a personal room: `user-<id>`
- On transfer, sender receives `TRANSFER_SENT` event; receiver receives `MONEY_RECEIVED` event — both get instant balance update and a toast notification
- On payment, `MONEY_ADDED` event fires after wallet credit
- Dashboard listens to a `walletUpdate` custom DOM event and re-fetches data automatically

### Dashboard & Analytics
- Wallet balance card with show/hide toggle and quick action buttons
- **Monthly chart** — last 6 months of sent vs received as a bar chart
- **Sent vs received ratio** — visual proportional bar with totals
- **Top 5 receivers** — aggregated by total amount across all transfers
- **Recent transactions** — last 5 with direction, counterparty name, status badge

### Transactions
- Paginated list with sent/received filter
- Date range filter and amount range filter
- **CSV export** — downloads filtered transactions with full metadata (date, ID, type, counterparty, amount, status, description)

### Admin
- Platform stats: total users, verified users, transaction count, total wallet balance across all users
- Paginated user list and transaction list
- Protected by `requireAdmin` middleware (role-based)

---

## Architecture

```
Browser
   │
   ▼
NGINX Ingress (NodePort 30080)
   ├── /api        ──►  backend:5000  ──►  mongo:27017 (StatefulSet)
   ├── /socket.io  ──►  backend:5000  ──►  per-user Socket.IO room
   └── /           ──►  frontend:80   ──►  React SPA (Nginx)

Kubernetes: 1 master + 2 workers · kubeadm v1.29 · Calico VXLAN · AWS ap-south-1
```

---

## Project Structure

```
digital-wallet-system/
├── backend/
│   ├── controllers/     authController, walletController, paymentController
│   ├── middleware/      auth (JWT verify), validation, errorHandler, asyncHandler
│   ├── models/          User, Wallet, Transaction, PaymentWebhookEvent
│   ├── routes/          auth, wallet, payment, transaction, user, admin
│   ├── utils/           logger (Winston), emailService, qrService, tokenSecurity
│   ├── tests/           authController, walletController, paymentController
│   └── server.js        Express + Socket.IO setup, MongoDB connection with retry
├── frontend/
│   ├── src/
│   │   ├── context/     AuthContext (useReducer + 5 actions), SocketContext
│   │   ├── pages/       Dashboard, SendMoney, AddMoney, Transactions, Profile,
│   │   │                QRCode, ScanQR, Login, Register, VerifyOTP,
│   │   │                ForgotPassword, ResetPassword
│   │   ├── components/  Layout, ProtectedRoute, LoadingSpinner
│   │   └── utils/       api.js (Axios + silent refresh), idempotency.js, socket.js
│   └── nginx.conf
├── k8s/
│   ├── backend/         Deployment (1 replica), Service, ConfigMap, Secret
│   ├── database/        StatefulSet, Service, PV (hostPath + nodeAffinity), PVC
│   ├── frontend/        Deployment (2 replicas), Service
│   ├── ingress/         NGINX Ingress, Helm instructions
│   ├── monitoring/      kube-prometheus-stack Helm values
│   └── kustomization.yaml
├── .github/workflows/   ci-cd.yml
└── docker-compose.yml
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register user, send OTP |
| POST | `/api/auth/verify-otp` | — | Verify OTP, create wallet, issue tokens |
| POST | `/api/auth/login` | — | Login, rotate refresh token |
| POST | `/api/auth/refresh-token` | — | Silent token refresh |
| POST | `/api/auth/forgot-password` | — | Send password reset link |
| POST | `/api/auth/reset-password` | — | Reset with hashed token |
| POST | `/api/auth/logout` | JWT | Invalidate refresh token |
| GET | `/api/wallet/balance` | JWT | Current balance |
| POST | `/api/wallet/transfer` | JWT | Idempotent wallet-to-wallet transfer |
| GET | `/api/wallet/transactions` | JWT | Paginated + filtered history |
| GET | `/api/wallet/transactions/export` | JWT | CSV download |
| GET | `/api/wallet/analytics` | JWT | Monthly chart, ratio, top receivers |
| GET | `/api/wallet/search-users` | JWT | Search verified users by name/email |
| POST | `/api/payment/create-order` | JWT | Razorpay order or mock payment |
| POST | `/api/payment/verify` | JWT | Verify payment signature, credit wallet |
| POST | `/api/payment/webhook` | — | Razorpay webhook (signature verified) |
| GET | `/api/admin/dashboard` | JWT+Admin | Platform stats |
| GET | `/api/admin/users` | JWT+Admin | Paginated user list |
| GET | `/api/admin/transactions` | JWT+Admin | Paginated transaction list |

---

## Local Setup

```bash
# Backend
cd backend && cp .env.example .env
# Fill: JWT_SECRET, JWT_REFRESH_SECRET, EMAIL_USER, EMAIL_PASS
npm install && npm run dev        # http://localhost:5000

# Frontend
cd frontend && cp .env.example .env
npm install && npm start          # http://localhost:3000

# Full stack
docker-compose up --build
```

Health check: `http://localhost:5000/api/health`

---

## Kubernetes Deployment

Self-managed kubeadm cluster — 1 master + 2 workers on AWS EC2 (t3.medium, ap-south-1).

**Before deploying:**
1. Set real values in `k8s/backend/secret.local.yaml` (gitignored — never committed)
2. Set `FRONTEND_URL: "http://<worker-public-ip>:30080"` in `k8s/backend/configmap.yaml`
3. Set `nodeAffinity` hostname in `k8s/database/storage.yaml` to your worker-1 node name

```bash
kubectl apply -f k8s/backend/secret.local.yaml
kubectl apply -k k8s/
kubectl get pods -n wallet        # all Running
```

**NGINX Ingress via Helm (NodePort 30080):**
```bash
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080
```

App: `http://<worker-node-public-ip>:30080`

---

## CI/CD

GitHub Actions on every push to `main`:
- Runs Jest backend tests
- Builds and pushes Docker images tagged `:latest` + `:<git-sha>` to Docker Hub

SHA tagging keeps `kubectl rollout undo` functional — rollback re-pulls the exact previous image.

Required secrets: `DOCKER_USERNAME`, `DOCKER_PASSWORD`

---

## Monitoring

```bash
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace -f k8s/monitoring/values.yaml
```

Grafana: `http://<worker-node-public-ip>:32000` · Prometheus: `http://<worker-node-public-ip>:30090`

---

## Challenges & Learnings

- **Refresh token race condition** — multiple parallel 401 responses each triggered a refresh. Fixed by queuing requests behind a single in-flight refresh promise in the Axios interceptor.

- **MongoDB transaction fallback** — standalone MongoDB rejects sessions with error code 20. Added a `startSessionSafe` helper that detects this and retries with atomic `$inc` + balance guard instead of aborting the request.

- **Webhook idempotency** — Razorpay can replay webhooks. Added a `PaymentWebhookEvent` collection with a unique `eventId` index; `updateOne` with `$setOnInsert` makes duplicate webhook handling atomic.

- **Calico VXLAN on AWS** — Default Calico install uses BGP which AWS VPC blocks between EC2 instances. Fixed by patching the `Installation` CR with `bgp: Disabled` and `encapsulation: VXLAN`.

- **Socket.IO and replicas** — `global.io` is per-process. Scaling backend to 2 replicas caused ~50% of real-time events to be silently dropped. Reduced to 1 replica; Redis pub/sub adapter is the correct production path.

- **hostPath PV scheduling** — Without `nodeAffinity`, MongoDB pod was scheduled on a node without `/data/mongo`, causing permanent `Pending`. Fixed with a `nodeSelectorTerm` pinned to worker-1.

- **kubeadm join + Calico Felix** — Two separate security group issues: port 6443 blocked worker TLS bootstrap, port 5473 blocked Felix→Typha health probes. Diagnosed via `kubeadm join` hang and Felix pod crash logs respectively.

---

## Future Improvements

- Redis pub/sub adapter for Socket.IO → horizontal backend scaling
- HTTPS via cert-manager + Let's Encrypt
- Horizontal Pod Autoscaler for frontend
- Replace hostPath PV with EBS CSI driver (proper cloud-native persistence)
- Centralized logging with Loki
- Database-backed integration tests (current tests mock MongoDB)
