# Digital Wallet System

A production-style MERN fintech platform that handles wallet-to-wallet transfers, Razorpay payments, KYC tiered limits, transaction disputes, scheduled transfers, split-bill requests, fraud detection queues, and real-time notifications — deployed on a self-managed Kubernetes cluster (kubeadm v1.29, 1 master + 2 workers, AWS EC2 t3.medium, ap-south-1) with a monolith-to-microservice architecture, OpenTelemetry distributed tracing, Prometheus/Grafana observability, Redis-backed distributed locking and rate limiting, BullMQ async job processing, and mTLS between internal services via cert-manager.

---

## What Makes This Different

**1. Distributed lock before every wallet debit (Redis SETNX + TTL)**
A single `SETNX wallet:<id>:lock` with a 5-second TTL precedes every debit operation. This serializes concurrent transfers from the same wallet across multiple pods without holding a database-level lock for the full transaction duration, making the lock safe even on pod crash.

**2. Silent token refresh with concurrent-request queuing**
The Axios interceptor stores a single in-flight refresh `Promise`. Every 401 that arrives while a refresh is in-progress appends to a queue rather than issuing its own `/refresh-token` call. On success, all queued requests replay with the new access token in a single pass, eliminating N refresh calls for N simultaneous expired requests.

**3. MongoDB transaction fallback via error code 20 detection**
`startSessionSafe()` wraps every multi-document operation. On `MongoServerError` code 20 (`IllegalOperation` — no replica set), it retries the same transfer using atomic `$inc` with a `{ balance: { $gte: amount } }` guard, making the service deployable on standalone MongoDB without changing the call site or splitting the code path.

**4. Webhook idempotency with atomic `$setOnInsert`**
`PaymentWebhookEvent.updateOne({ eventId }, { $setOnInsert: payload }, { upsert: true })` combined with a unique index on `eventId` makes duplicate Razorpay webhook delivery atomic — the second write is a no-op at the database level, not a race-prone application-layer check.

**5. Redis sliding-window rate limiting in a single pipeline**
`ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE` executes in one TCP round trip via `redis.pipeline().exec()`. All pods share the same sorted-set counter per `userId:route` key, so rate limits are consistent across rolling deploys and pod restarts where in-memory counters would reset.

**6. Redis pub/sub adapter for horizontal Socket.IO scaling**
Without `@socket.io/redis-adapter`, ~50% of real-time events silently drop because the emitting pod may not hold the target client's socket. The adapter broadcasts every emission through Redis pub/sub so all pods receive and route it regardless of which pod the WebSocket connected to.

**7. Calico VXLAN instead of BGP on AWS EC2**
AWS VPC blocks BGP (TCP 179) between EC2 instances, causing Calico's default networking mode to fail pod-to-pod routing silently. Patching the `Installation` CR with `bgp: Disabled` and `encapsulation: VXLAN` routes all inter-pod traffic through UDP 4789 tunnels that the VPC allows.

**8. SHA-tagged Docker images for rollback fidelity**
Every CI build pushes both `:latest` and `:<git-sha>` to Docker Hub, and Kubernetes deployments reference the SHA tag. This makes `kubectl rollout undo` re-pull the exact previous image rather than re-pulling `:latest`, which may have moved forward.

**9. Double-entry ledger with per-transaction balance snapshots**
Every transfer writes `senderBalanceBefore`, `senderBalanceAfter`, `receiverBalanceBefore`, `receiverBalanceAfter` into the `Transaction` document at execution time. Reconciliation can verify any historical balance without replaying the full transaction chain.

**10. Atomic cache invalidation of sender and receiver balances**
After every transfer, `redis.pipeline().del(senderKey).del(receiverKey).exec()` invalidates both cached balances in a single round trip. Sequential `DEL` calls would leave a window where one counterparty reads a stale cached balance between the two invalidations.

---

## Architecture

```
                          ┌─────────────┐
                          │   Browser   │
                          └──────┬──────┘
                                 │ HTTPS
                                 ▼
                       ┌──────────────────┐
                       │  CDN / Cloudflare │  DDoS mitigation, WAF
                       └────────┬─────────┘
                                │
                                ▼
                          ┌──────────┐
                          │ AWS ALB  │  TCP 443 → NodePort 30080
                          └────┬─────┘
                               │
                               ▼
          ┌────────────────────────────────────────────┐
          │               NGINX Ingress                │
          │  /api      → EWMA least-connections        │
          │  /socket.io → IP-hash (room consistency)   │
          │  Health probes pull unhealthy pods < 10s   │
          └───────────────────┬────────────────────────┘
                              │
                              ▼
          ┌────────────────────────────────────────────┐
          │                API Gateway                 │
          │  JWT verify · x-user-id / x-user-role      │
          │  Redis sliding-window rate limit           │
          │  x-correlation-id injection                │
          │  opossum circuit breaker per downstream    │
          │  Connection draining on rolling deploys    │
          └──────────┬─────────────┬──────────┬────────┘
                     │             │           │
           ┌─────────▼──┐  ┌──────▼─────┐  ┌─▼──────────────┐
           │    Auth    │  │   Wallet   │  │   Payment      │
           │  Service   │  │  Service   │  │   Service      │
           │  :3001     │  │   :3002    │  │    :3003       │
           └─────────┬──┘  └──────┬─────┘  └─┬─────────────-┘
                     │             │           │
          ───────────┴─────────────┴───────────┴────────────
                          │                       │
              ┌───────────▼──────┐    ┌───────────▼─────────┐
              │   MongoDB 6      │    │      Redis 7         │
              │   Replica Set    │    │  ┌─ BullMQ broker    │
              │                  │    │  ├─ Cache (30s TTL)  │
              │  Users           │    │  ├─ Rate limiter     │
              │  Wallets         │    │  ├─ Dist. lock SETNX │
              │  Transactions    │    │  └─ Socket.IO adapter│
              │  LedgerEntries   │    └───────────┬──────────┘
              │  Disputes ...    │                │
              └──────────────────┘      BullMQ async jobs
                                                  │
                                                  ▼
                                  ┌───────────────────────────┐
                                  │    Notification Service   │
                                  │    BullMQ consumer        │
                                  │    notification.queue     │
                                  │    audit.queue            │
                                  │    fraud.queue            │
                                  └──────────┬────────────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              ▼                              ▼
                       Nodemailer                       Socket.IO
                       OTP, alerts,               per-user rooms
                       confirmations             user-<id> events

          ┌──────────────────────────────────────────────────┐
          │                  Observability                   │
          │  OpenTelemetry SDK → Jaeger  (trace waterfall)   │
          │  Prometheus scrape → Grafana (p50/p95/p99)       │
          │  Alertmanager (error rate > 1%, p99 > 500ms)     │
          │  Winston structured logs (x-correlation-id)      │
          └──────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, React Router v6 | SPA routing, component model |
| | Tailwind CSS | Utility-first styling |
| | Axios + interceptor | HTTP client with silent refresh and request queuing |
| | Socket.IO client | Real-time event reception |
| | Recharts | Bar chart (monthly spend), donut chart (spend distribution) |
| | html5-qrcode, qrcode.react | QR code generation and scanning |
| | pdfkit | Client-side PDF transaction receipts with HMAC verification code |
| **API Gateway** | Express, http-proxy-middleware | Request routing to downstream services |
| | opossum | Per-service circuit breaker with half-open probe |
| | Redis (ioredis) | Sliding-window rate limiting, correlation ID store |
| **Auth Service** | Node.js, Express, Mongoose | Registration, OTP, login, refresh, KYC |
| | jsonwebtoken, bcrypt | JWT signing, password hashing |
| | Nodemailer | OTP email, password reset links |
| **Wallet Service** | Node.js, Express, Mongoose | Transfers, ledger, disputes, scheduled jobs |
| | BullMQ (producer) | Enqueue post-transfer notification and audit jobs |
| | ioredis | Distributed lock (SETNX), balance cache, analytics cache |
| **Payment Service** | Node.js, Express, Mongoose | Razorpay order/verify/webhook, outgoing webhooks |
| | razorpay (SDK) | Order creation, HMAC-SHA256 signature verification |
| | crypto | `timingSafeEqual` webhook signature check |
| **Notification Service** | Node.js, BullMQ (consumer) | Process notification, audit, fraud queues |
| | Socket.IO (server) | Emit real-time events to per-user rooms |
| | Nodemailer | Transfer alerts, low-balance notifications |
| **Shared Infra** | MongoDB 6 (replica set) | Primary data store, multi-document ACID transactions |
| | Redis 7 | Cache, rate limiting, distributed locking, BullMQ, Socket.IO adapter |
| | BullMQ | Async job queues, delayed jobs, DLQ with exponential backoff |
| **Observability** | OpenTelemetry SDK | Auto-instrument HTTP, MongoDB, Redis; W3C trace context |
| | Jaeger | Distributed trace storage and UI |
| | Prometheus + Grafana | Metrics collection, dashboards, alerting |
| | Alertmanager | Error-rate and latency threshold alerts |
| | Winston + Morgan | Structured JSON logs with correlation ID per line |
| **DevOps** | Docker, Docker Compose | Multi-stage builds, non-root user in all images |
| | Kubernetes kubeadm v1.29 | Self-managed cluster: 1 master + 2 workers |
| | AWS EC2 t3.medium | Compute nodes, ap-south-1 |
| | Calico VXLAN | Pod networking (BGP disabled, UDP 4789 encapsulation) |
| | NGINX Ingress | L7 load balancing, IP-hash for WebSocket, EWMA for API |
| | cert-manager | mTLS certificates between internal services |
| | Kustomize + Helm | Kubernetes manifest management |
| | GitHub Actions | CI/CD: test → lint → build → push SHA-tagged images |

---

## Project Structure

```
digital-wallet-system/
├── services/
│   ├── api-gateway/
│   │   ├── src/
│   │   │   ├── middleware/
│   │   │   │   ├── jwtVerify.js          # Verifies JWT, injects x-user-id + x-user-role
│   │   │   │   ├── rateLimiter.js        # Redis sliding-window ZREMRANGEBYSCORE pipeline
│   │   │   │   └── correlationId.js      # Generates/propagates x-correlation-id
│   │   │   ├── proxy/
│   │   │   │   ├── routes.js             # http-proxy-middleware route table
│   │   │   │   └── circuitBreaker.js     # opossum instance per downstream service
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── auth-service/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   │   ├── authController.js     # register, verifyOtp, login, refresh, logout
│   │   │   │   └── kycController.js      # submitDocument, getStatus, adminReview
│   │   │   ├── middleware/
│   │   │   │   ├── validation.js         # express-validator schemas
│   │   │   │   └── errorHandler.js
│   │   │   ├── models/
│   │   │   │   ├── User.js               # role, kycTier, walletId, otpHash, otpExpiry
│   │   │   │   ├── AuditLog.js           # append-only: action, userId, ip, timestamp
│   │   │   │   └── KYCDocument.js        # docType, s3Key, status, reviewedBy
│   │   │   ├── routes/
│   │   │   │   ├── auth.js
│   │   │   │   └── kyc.js
│   │   │   ├── utils/
│   │   │   │   ├── emailService.js       # Nodemailer OTP + reset link templates
│   │   │   │   └── tokenSecurity.js      # SHA-256 hash, constant-time compare
│   │   │   └── server.js
│   │   ├── tests/
│   │   │   ├── auth.unit.test.js
│   │   │   └── auth.integration.test.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── wallet-service/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   │   ├── walletController.js
│   │   │   │   ├── transferController.js
│   │   │   │   ├── disputeController.js
│   │   │   │   ├── scheduledController.js
│   │   │   │   └── analyticsController.js
│   │   │   ├── models/
│   │   │   │   ├── Wallet.js             # balance, currency, status, kycTier, dailySpent
│   │   │   │   ├── Transaction.js        # type, amount, balanceSnapshots, idempotencyKey
│   │   │   │   ├── LedgerEntry.js        # double-entry: walletId, credit/debit, txnRef
│   │   │   │   ├── Dispute.js            # status, escrowAmount, compensatingTxnId
│   │   │   │   ├── ScheduledTransfer.js  # cronExpr, nextRunAt, BullMQ jobId
│   │   │   │   ├── PaymentRequest.js     # state machine, TTL index (24h expiry)
│   │   │   │   ├── SplitBill.js          # participants[], partialState per participant
│   │   │   │   ├── Beneficiary.js        # savedUserId, nickname, lastUsedAt
│   │   │   │   ├── Referral.js           # referrerId, refereeId, rewardStatus
│   │   │   │   └── NotificationPreference.js  # eventType → { email, inApp }
│   │   │   ├── queues/
│   │   │   │   ├── transferQueue.js      # BullMQ producer: notification + audit events
│   │   │   │   └── scheduledQueue.js     # BullMQ delayed job producer
│   │   │   ├── routes/
│   │   │   │   ├── wallet.js
│   │   │   │   ├── transfer.js
│   │   │   │   ├── dispute.js
│   │   │   │   ├── scheduled.js
│   │   │   │   └── paymentRequest.js
│   │   │   ├── utils/
│   │   │   │   ├── distributedLock.js    # SETNX with TTL, retry, auto-release
│   │   │   │   ├── balanceCache.js       # cache-aside, 30s TTL, pipeline invalidation
│   │   │   │   └── ledger.js             # double-entry write helpers
│   │   │   └── server.js
│   │   ├── tests/
│   │   │   ├── transfer.unit.test.js
│   │   │   ├── transfer.integration.test.js
│   │   │   └── transfer.concurrency.test.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── payment-service/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   │   ├── paymentController.js  # createOrder, verifyPayment, mockCredit
│   │   │   │   └── webhookController.js  # inbound Razorpay + outbound business webhooks
│   │   │   ├── models/
│   │   │   │   └── PaymentWebhookEvent.js  # eventId (unique index), payload, processedAt
│   │   │   ├── routes/
│   │   │   │   ├── payment.js
│   │   │   │   └── webhook.js
│   │   │   ├── utils/
│   │   │   │   ├── razorpay.js           # SDK wrapper, order creation
│   │   │   │   ├── hmac.js               # timingSafeEqual signature verify + outgoing sign
│   │   │   │   └── sessionSafe.js        # startSessionSafe: replica set vs standalone branch
│   │   │   └── server.js
│   │   ├── tests/
│   │   │   ├── payment.unit.test.js
│   │   │   └── webhook.idempotency.test.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── notification-service/
│       ├── src/
│       │   ├── consumers/
│       │   │   ├── notificationConsumer.js  # processes notification.queue
│       │   │   ├── auditConsumer.js         # processes audit.queue
│       │   │   └── fraudConsumer.js         # processes fraud.queue
│       │   ├── handlers/
│       │   │   ├── emailHandler.js          # Nodemailer templates per event type
│       │   │   └── socketHandler.js         # io.to(user-<id>).emit per event
│       │   ├── models/
│       │   │   └── NotificationPreference.js
│       │   └── server.js                    # Socket.IO server + Redis adapter init
│       ├── Dockerfile
│       └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── context/
│   │   │   ├── AuthContext.jsx       # useReducer: LOGIN, LOGOUT, UPDATE_KYC, SET_LOADING, SET_ERROR
│   │   │   └── SocketContext.jsx     # Socket.IO connection lifecycle, room join on auth
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx         # balance card, charts, recent transactions
│   │   │   ├── SendMoney.jsx         # 3-step flow: search → amount → confirm
│   │   │   ├── AddMoney.jsx          # Razorpay checkout or mock
│   │   │   ├── Transactions.jsx      # paginated list, filters, CSV export
│   │   │   ├── TransactionReceipt.jsx  # PDF download with HMAC verify code
│   │   │   ├── Disputes.jsx          # raise dispute, view status, escrow indicator
│   │   │   ├── ScheduledTransfers.jsx
│   │   │   ├── RequestMoney.jsx      # payment link creation and management
│   │   │   ├── SplitBill.jsx         # group request with per-participant status
│   │   │   ├── Beneficiaries.jsx
│   │   │   ├── Profile.jsx           # KYC upload, notification preferences
│   │   │   ├── QRCode.jsx
│   │   │   ├── ScanQR.jsx
│   │   │   ├── Admin.jsx             # platform stats, flagged transactions, KYC queue
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── VerifyOTP.jsx
│   │   │   ├── ForgotPassword.jsx
│   │   │   └── ResetPassword.jsx
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── AdminRoute.jsx
│   │   │   ├── WalletCard.jsx        # balance with show/hide, quick actions
│   │   │   ├── NotificationBell.jsx  # in-app notification drawer
│   │   │   ├── TransactionItem.jsx
│   │   │   └── charts/
│   │   │       ├── MonthlyBarChart.jsx
│   │   │       └── SpendDonutChart.jsx
│   │   └── utils/
│   │       ├── api.js                # Axios instance + silent refresh interceptor
│   │       ├── idempotency.js        # crypto.randomUUID key generation and storage
│   │       ├── socket.js             # Socket.IO singleton
│   │       └── pdf.js                # pdfkit receipt generation
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
│
├── k8s/
│   ├── api-gateway/         Deployment, Service, HPA (CPU 60%), ConfigMap, Secret
│   ├── auth-service/        Deployment, Service, ConfigMap, Secret
│   ├── wallet-service/      Deployment, Service, ConfigMap, Secret
│   ├── payment-service/     Deployment, Service, ConfigMap, Secret
│   ├── notification-service/  Deployment, Service
│   ├── frontend/            Deployment (2 replicas), Service, HPA
│   ├── database/            StatefulSet, Service, PV (hostPath + nodeAffinity), PVC
│   ├── redis/               Deployment, Service, ConfigMap
│   ├── ingress/             Ingress resource, helm-values.yaml
│   ├── monitoring/          kube-prometheus-stack Helm values
│   ├── cert-manager/        ClusterIssuer, Certificate per service pair
│   └── kustomization.yaml
│
├── .github/
│   └── workflows/
│       └── ci-cd.yml
│
├── docker-compose.yml         # Full stack: all services + MongoDB + Redis + Jaeger
└── docker-compose.dev.yml     # Hot-reload variant with volume mounts
```

---

## Features

### Authentication & Security

- **Register → OTP → Login flow**: Registration enqueues an HMAC-truncated 6-digit OTP via Nodemailer. `/verify-otp` checks the OTP against its SHA-256 hash and expiry timestamp, then creates the wallet and issues the first token pair atomically.
- **JWT access token (15 min) + refresh token (7 days)**: Access token carries `userId` and `role` claims. Refresh token is stored in the `User` document as `SHA-256(token)` — plaintext is never persisted; comparison uses `crypto.timingSafeEqual`.
- **Refresh token rotation**: Every `/auth/refresh-token` call invalidates the current hashed token and writes a new SHA-256 hash. Re-use of a superseded refresh token returns `401` and invalidates the entire token family.
- **Silent refresh with request queuing**: The Axios interceptor stores `refreshPromise` on first `401`. Subsequent `401`s subscribe to that promise rather than issuing parallel refresh calls. On resolution, all queued requests replay with the new `Authorization` header.
- **Forgot password**: `POST /auth/forgot-password` generates a `crypto.randomBytes(32)` token, stores `SHA-256(token)` with a 15-minute expiry in the `User` document, and emails the raw token as a URL parameter. `/reset-password` validates hash and expiry before accepting the new password.
- **Rate limiting**: Auth routes: 5 req/15 min per IP. Transfer routes: 20 req/min per `userId`. Global: 200 req/15 min per IP. All limits use Redis sorted sets with a pipeline of `ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE`. Response headers include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on `429`.
- **Audit log**: Every sensitive action (login, logout, password change, transfer, wallet freeze, admin action) is written to the `AuditLog` collection with `userId`, `ip`, `userAgent`, `action`, `metadata`, and `timestamp`. The collection is append-only — no update or delete indexes defined.
- **mTLS between internal services**: cert-manager issues service-scoped certificates from a self-signed `ClusterIssuer`. API Gateway presents its certificate to downstream services; each downstream validates the CA before accepting the connection.
- **Helmet + CORS + express-validator**: `helmet()` sets `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`. CORS origin is restricted to `FRONTEND_URL`. All route handlers validate request bodies via `express-validator` schemas; invalid input returns `422` with field-level error messages.

### Wallet & Transfers

- **Wallet auto-creation**: The wallet document is created inside the same Mongoose session as OTP verification — either both commit or neither does. Initial balance is ₹0, `status: active`, `kycTier: 0`.
- **KYC tier limits**:
  - Tier 0 (email verified): ₹10,000 per-transfer cap, ₹10,000 daily limit
  - Tier 1 (phone verified): ₹50,000 per-transfer cap, ₹50,000 daily limit
  - Tier 2 (documents approved): ₹2,00,000 per-transfer cap, ₹2,00,000 daily limit
- **Wallet status enforcement**: `active / frozen / suspended` checked before every debit via `Wallet.findOne({ _id, status: 'active' })`. A `frozen` or `suspended` wallet returns `403` with the freeze reason from the audit log.
- **Transfer flow**: Three-step UI — (1) search verified users by name/email via debounced `GET /wallet/search-users`; (2) enter amount, description, and optional scheduled time; (3) review confirmation screen before submitting.
- **Idempotency**: Frontend generates a `crypto.randomUUID()` key per transfer action and stores it in `sessionStorage`. Backend checks `Transaction.findOne({ idempotencyKey })` before executing; a match returns the original transaction with `200` and no side effects.
- **Distributed lock + atomic debit guard**: `SETNX wallet:<senderId>:lock 1 PX 5000` must succeed before the debit begins. After acquiring the lock, `Wallet.updateOne({ _id: senderId, balance: { $gte: amount } }, { $inc: { balance: -amount } })` guarantees atomicity; a `modifiedCount` of `0` means insufficient funds and returns `400`.
- **Double-entry ledger**: Every transfer writes two `LedgerEntry` documents — one debit for the sender and one credit for the receiver — both referencing the same `transactionId`.
- **Daily spending limit**: A rolling 24-hour aggregation sums `Transaction.amount` for the sender since `Date.now() - 86400000`. The result is checked against the user's configured limit and the platform hard limit for their KYC tier before the lock is acquired.
- **Balance snapshot**: `Transaction` stores `senderBalanceBefore`, `senderBalanceAfter`, `receiverBalanceBefore`, `receiverBalanceAfter` at commit time for full auditability.
- **Transaction dispute system**: Disputes can be raised within 24 hours of transfer via `POST /wallet/disputes`. The disputed amount is held in escrow by freezing it in the sender's wallet. Admin reviews via the KYC/dispute queue; approval executes a compensating transaction to return funds; rejection releases the escrow freeze. The original transaction is never modified.
- **Scheduled and recurring transfers**: `POST /wallet/scheduled-transfers` persists a `ScheduledTransfer` document and enqueues a BullMQ delayed job. On execution, the job runs the standard transfer logic, writes the result back to the `ScheduledTransfer` document, and enqueues a `SCHEDULED_TRANSFER_EXECUTED` notification event. Failed jobs retry with exponential backoff before moving to the DLQ.
- **Request money / payment links**: `POST /wallet/payment-requests` creates a `PaymentRequest` document with a 24-hour MongoDB TTL index. The requester shares a link; the payer approves or rejects. States: `pending → approved → completed` or `pending → rejected` or auto-expired by TTL.
- **Split bill**: `POST /wallet/split-bill` creates one `SplitBill` document referencing N `PaymentRequest` documents, one per participant. The UI shows per-participant completion status in real time via Socket.IO `PAYMENT_REQUEST_APPROVED` events.
- **Beneficiaries**: Saved contacts stored in the `Beneficiary` collection with user-defined nicknames. `lastUsedAt` updated on each transfer for recently-used sorting.
- **Transaction fees**: 0.5% per transfer, capped at ₹10, credited atomically to the platform wallet in the same `updateOne` batch as the receiver credit. The fee debit, receiver credit, and platform credit are three operations within the same distributed lock scope.
- **Multi-currency**: Wallets carry a `currency` field (`INR`, `USD`, `EUR`). Transfers between wallets enforce same-currency. Mock forex rate service converts display amounts; actual settlement is same-currency only.
- **Referral system**: `POST /auth/register` accepts an optional `referralCode`. After the referee's first successful transfer, the referrer's wallet receives the referral reward via a BullMQ delayed job.
- **Low balance alert**: A post-debit hook in the transfer controller checks `newBalance < user.lowBalanceThreshold`. If true, it enqueues a `LOW_BALANCE_ALERT` job to `notification.queue`; the notification is sent via the user's configured channel (email, in-app, or both).

### Payments

- **Mock mode**: `PAYMENT_MODE=mock` in environment skips Razorpay and directly credits the wallet, enabling full end-to-end testing without real credentials.
- **Razorpay full flow**: `POST /payment/create-order` calls `razorpay.orders.create()` and returns the order ID. Client opens Razorpay checkout. On success, `POST /payment/verify` reconstructs the HMAC-SHA256 signature from `orderId + '|' + paymentId` and compares via `crypto.timingSafeEqual` before crediting the wallet.
- **Webhook handler**: Razorpay POSTs to `/payment/webhook`. Signature is `HMAC-SHA256(rawBody, webhookSecret)` verified with `crypto.timingSafeEqual`. Raw body is preserved via `express.raw({ type: 'application/json' })` before JSON parsing.
- **Webhook deduplication**: `PaymentWebhookEvent.updateOne({ eventId }, { $setOnInsert: { eventId, payload, processedAt } }, { upsert: true })` — `$setOnInsert` with a unique index on `eventId` means a second webhook for the same event inserts nothing and returns `200` without re-crediting.
- **Outgoing webhooks for business accounts**: On payment received, the service POSTs to the business's registered URL with a JSON body signed via `HMAC-SHA256(payload, businessWebhookSecret)`. The business verifies the signature on their end.

### Real-Time

- **Per-user Socket.IO rooms**: On authenticated connection, the client emits `join` with its JWT. The server verifies the token and calls `socket.join('user-<userId>')`.
- **Redis pub/sub adapter**: `@socket.io/redis-adapter` configured on the notification service server ensures that `io.to('user-<id>').emit(...)` reaches the correct socket regardless of which pod it connected to.
- **Events**: `TRANSFER_SENT` (sender), `MONEY_RECEIVED` (receiver), `MONEY_ADDED` (after Razorpay credit), `DISPUTE_RAISED`, `DISPUTE_RESOLVED`, `LOW_BALANCE_ALERT`, `SCHEDULED_TRANSFER_EXECUTED`, `PAYMENT_REQUEST_APPROVED`, `PAYMENT_REQUEST_REJECTED`.
- **Notification preferences**: `NotificationPreference` document per user maps each event type to `{ email: boolean, inApp: boolean }`. The notification consumer reads this before dispatching.

### Dashboard & Analytics

- **Wallet balance card**: Shows masked or full balance with a toggle. Quick action buttons for send, add money, and QR code.
- **Monthly bar chart**: MongoDB aggregation pipeline groups transactions by `createdAt` month for the last 6 months, bucketed by `type: sent` vs `received`. Rendered via Recharts `BarChart`. Result cached in Redis for 5 minutes.
- **Spend distribution donut chart**: Aggregates outgoing transactions by counterparty, takes the top 6 receivers, groups the rest into "Other". Recharts `PieChart` with `innerRadius`. Cache TTL: 5 minutes.
- **Sent vs received ratio bar**: Total sent and total received amounts since wallet creation, rendered as a proportional horizontal bar with absolute values.
- **Top 5 receivers**: `$group` by `receiverId`, `$sort` by total amount descending, `$limit 5`, `$lookup` user display names. Cached 5 minutes.
- **Recent transactions**: Last 5 transactions inline with counterparty name, direction indicator, amount, and status badge. Refetched automatically on `walletUpdate` Socket.IO event.
- **Admin real-time volume graph**: Aggregates transactions by hour for the last 24 hours. Recharts `LineChart`, updates on each new transaction event via Socket.IO broadcast to admin room.

### Transactions

- **Paginated list**: `GET /wallet/transactions?page=1&limit=20&type=sent&from=2024-01-01&to=2024-12-31&minAmount=100&maxAmount=5000`. MongoDB index on `{ walletId, createdAt }` covers the query.
- **CSV export**: `GET /wallet/transactions/export` streams a CSV with columns: `txnId`, `date`, `type`, `counterparty`, `amount`, `currency`, `fee`, `status`, `description`, `idempotencyKey`. Uses Node.js `Transform` stream to avoid buffering the full result set.
- **PDF receipt**: `GET /wallet/transactions/:id/receipt` generates a PDF via pdfkit with transaction metadata, balance snapshots, and an HMAC-SHA256 verification code. The code is `HMAC(txnId + amount + timestamp, RECEIPT_SECRET)` — verifiable by support without a database lookup.
- **Scheduled transfers list**: Separate UI section listing pending scheduled jobs with their `nextRunAt`, recurrence, and status. Supports cancellation via `DELETE /wallet/scheduled-transfers/:id`, which calls `BullMQ.remove(jobId)` and updates the document status.

### Admin

- **Platform stats**: Total registered users, email-verified users, KYC tier distribution (0/1/2), 24-hour transaction count, total platform wallet balance, total fee revenue since inception.
- **Real-time transaction volume**: Admin room receives a `NEW_TRANSACTION` event after every transfer; the admin dashboard aggregates these into a per-hour count updated live.
- **Flagged transaction queue**: Transactions with `fraudScore > threshold` (set by the fraud detection consumer) appear in the admin review queue. Admin can approve or escalate.
- **Wallet freeze/unfreeze**: `POST /admin/wallet/freeze` requires a mandatory `reason` field written to the audit log. The wallet `status` field changes to `frozen`; the freeze timestamp and admin ID are recorded.
- **KYC approval queue**: Lists pending `KYCDocument` records with uploaded files. Admin approves or rejects with a rejection reason. On approval, the `User.kycTier` is incremented and a `KYC_APPROVED` notification is queued.
- **Platform revenue report**: Aggregates `fee` field from all `Transaction` documents by day or month. Exported as CSV.

---

## API Reference

### Auth Service

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create user, hash OTP, send via Nodemailer |
| POST | `/api/auth/verify-otp` | — | Validate OTP hash + expiry, create wallet, issue JWT pair |
| POST | `/api/auth/login` | — | bcrypt compare, rotate refresh token, return JWT pair |
| POST | `/api/auth/refresh-token` | Cookie/Bearer | Validate SHA-256 hash, issue new pair, invalidate old |
| POST | `/api/auth/logout` | JWT | Set `refreshTokenHash: null` on User document |
| POST | `/api/auth/forgot-password` | — | Store `SHA-256(resetToken)` with 15-min expiry, email raw token |
| POST | `/api/auth/reset-password` | — | Validate hash + expiry, bcrypt new password, invalidate token |
| POST | `/api/auth/kyc/submit` | JWT | Upload KYC document reference, set status to `pending` |
| GET | `/api/auth/kyc/status` | JWT | Return current KYC tier and document review status |

### Wallet Service

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/wallet/balance` | JWT | Cache-aside balance read (30s TTL), fallback to DB |
| POST | `/api/wallet/transfer` | JWT | Distributed lock → atomic debit → ledger write → BullMQ event |
| GET | `/api/wallet/transactions` | JWT | Paginated + filtered by type, date range, amount range |
| GET | `/api/wallet/transactions/export` | JWT | Streamed CSV of filtered transactions |
| GET | `/api/wallet/transactions/:id/receipt` | JWT | pdfkit PDF with HMAC verification code |
| GET | `/api/wallet/analytics` | JWT | Monthly chart, ratio, top receivers (5-min Redis cache) |
| GET | `/api/wallet/search-users` | JWT | Search verified users by name or email (excludes requester) |
| GET | `/api/wallet/beneficiaries` | JWT | List saved contacts sorted by `lastUsedAt` |
| POST | `/api/wallet/beneficiaries` | JWT | Save contact with nickname |
| DELETE | `/api/wallet/beneficiaries/:id` | JWT | Remove saved contact |
| POST | `/api/wallet/disputes` | JWT | Raise dispute within 24h, freeze escrow amount |
| GET | `/api/wallet/disputes` | JWT | List disputes for authenticated user |
| GET | `/api/wallet/disputes/:id` | JWT | Single dispute detail with timeline |
| POST | `/api/wallet/scheduled-transfers` | JWT | Create BullMQ delayed job + ScheduledTransfer document |
| GET | `/api/wallet/scheduled-transfers` | JWT | List pending and completed scheduled jobs |
| DELETE | `/api/wallet/scheduled-transfers/:id` | JWT | Cancel job via BullMQ.remove, update document status |
| POST | `/api/wallet/payment-requests` | JWT | Create PaymentRequest with 24h TTL |
| GET | `/api/wallet/payment-requests` | JWT | List incoming and outgoing requests |
| PATCH | `/api/wallet/payment-requests/:id` | JWT | Approve (trigger transfer) or reject |
| POST | `/api/wallet/split-bill` | JWT | Create SplitBill with N PaymentRequest sub-documents |
| GET | `/api/wallet/split-bill/:id` | JWT | Per-participant completion status |
| GET | `/api/wallet/notification-preferences` | JWT | Read per-event-type delivery preferences |
| PUT | `/api/wallet/notification-preferences` | JWT | Update email/in-app toggle per event type |

### Payment Service

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/payment/create-order` | JWT | Razorpay `orders.create()` or mock instant credit |
| POST | `/api/payment/verify` | JWT | HMAC-SHA256 signature verify, credit wallet, enqueue event |
| POST | `/api/payment/webhook` | HMAC | `timingSafeEqual` verify, `$setOnInsert` deduplication, credit |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/dashboard` | JWT + Admin | Platform stats: users, KYC breakdown, fee revenue |
| GET | `/api/admin/users` | JWT + Admin | Paginated user list with KYC tier and wallet balance |
| GET | `/api/admin/transactions` | JWT + Admin | Paginated all-platform transaction list |
| GET | `/api/admin/transactions/flagged` | JWT + Admin | Transactions with `fraudScore` above threshold |
| POST | `/api/admin/wallet/freeze` | JWT + Admin | Set `status: frozen`, write mandatory reason to AuditLog |
| POST | `/api/admin/wallet/unfreeze` | JWT + Admin | Set `status: active`, write audit entry |
| GET | `/api/admin/kyc/queue` | JWT + Admin | Pending KYCDocument records for review |
| PATCH | `/api/admin/kyc/:id` | JWT + Admin | Approve (increment `kycTier`) or reject with reason |
| GET | `/api/admin/revenue` | JWT + Admin | Fee aggregation by day/month, CSV export |

---

## Local Development

### Prerequisites

- Node.js 20, Docker Desktop, MongoDB 6 (or `docker-compose` handles it)

### Environment Files

```bash
# Each service has its own .env.example
cp services/auth-service/.env.example      services/auth-service/.env
cp services/wallet-service/.env.example    services/wallet-service/.env
cp services/payment-service/.env.example   services/payment-service/.env
cp services/notification-service/.env.example services/notification-service/.env
cp services/api-gateway/.env.example       services/api-gateway/.env
cp frontend/.env.example                   frontend/.env
```

Minimum required values across services:

```env
# Auth Service
JWT_SECRET=<32-byte-hex>
JWT_REFRESH_SECRET=<32-byte-hex>
RECEIPT_SECRET=<32-byte-hex>
EMAIL_USER=<smtp-user>
EMAIL_PASS=<smtp-password>
MONGO_URI=mongodb://localhost:27017/wallet

# Payment Service
RAZORPAY_KEY_ID=<rzp-key>
RAZORPAY_KEY_SECRET=<rzp-secret>
RAZORPAY_WEBHOOK_SECRET=<webhook-secret>
PAYMENT_MODE=mock   # or "razorpay"

# API Gateway
AUTH_SERVICE_URL=http://localhost:3001
WALLET_SERVICE_URL=http://localhost:3002
PAYMENT_SERVICE_URL=http://localhost:3003

# All services
REDIS_URL=redis://localhost:6379
```

### Run Individually

```bash
# Start MongoDB and Redis
docker run -d -p 27017:27017 mongo:6
docker run -d -p 6379:6379 redis:7

# Auth Service
cd services/auth-service && npm install && npm run dev    # :3001

# Wallet Service
cd services/wallet-service && npm install && npm run dev  # :3002

# Payment Service
cd services/payment-service && npm install && npm run dev # :3003

# Notification Service
cd services/notification-service && npm install && npm run dev

# API Gateway
cd services/api-gateway && npm install && npm run dev     # :4000

# Frontend
cd frontend && npm install && npm start                   # :3000
```

### Full Stack via Docker Compose

```bash
docker-compose up --build
```

This starts: api-gateway (4000), auth-service (3001), wallet-service (3002), payment-service (3003), notification-service, frontend (3000), MongoDB (27017), Redis (6379), Jaeger UI (16686), Prometheus (9090), Grafana (3001→mapped to 3030).

Health check:

```bash
curl http://localhost:4000/health
# {"status":"ok","services":{"auth":"up","wallet":"up","payment":"up"}}
```

---

## Kubernetes Deployment

Self-managed kubeadm cluster: 1 master + 2 workers, AWS EC2 t3.medium, Ubuntu 22.04, ap-south-1.

### 1. Cluster Bootstrap

```bash
# On master — after kubeadm init
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/tigera-operator.yaml

# Patch Installation CR to force VXLAN (BGP is blocked by AWS VPC)
kubectl patch installation default --type=merge -p '
{
  "spec": {
    "calicoNetwork": {
      "bgp": "Disabled",
      "ipPools": [{"cidr": "192.168.0.0/16", "encapsulation": "VXLAN"}]
    }
  }
}'

# Verify Felix is running on all nodes
kubectl get pods -n calico-system
```

### 2. AWS Security Group Rules (required before kubeadm join)

| Port | Protocol | Direction | Purpose |
|---|---|---|---|
| 6443 | TCP | Worker → Master | kubeadm TLS bootstrap |
| 5473 | TCP | All nodes | Calico Felix → Typha health probes |
| 4789 | UDP | All nodes | Calico VXLAN inter-pod traffic |
| 10250 | TCP | All nodes | kubelet API |
| 30080 | TCP | 0.0.0.0/0 | NGINX Ingress NodePort (app traffic) |
| 32000 | TCP | 0.0.0.0/0 | Grafana NodePort |
| 30090 | TCP | 0.0.0.0/0 | Prometheus NodePort |

### 3. Secrets and Config

```bash
# Create namespace
kubectl create namespace wallet

# Create secrets (never committed — gitignored)
cp k8s/auth-service/secret.example.yaml k8s/auth-service/secret.local.yaml
# Edit secret.local.yaml with base64-encoded real values

kubectl apply -f k8s/auth-service/secret.local.yaml    -n wallet
kubectl apply -f k8s/wallet-service/secret.local.yaml  -n wallet
kubectl apply -f k8s/payment-service/secret.local.yaml -n wallet

# Update ConfigMaps with your worker node's public IP
sed -i 's/WORKER_IP/<your-worker-public-ip>/g' k8s/api-gateway/configmap.yaml
kubectl apply -k k8s/ -n wallet
```

### 4. MongoDB StatefulSet

MongoDB uses a hostPath PV pinned to worker-1 via `nodeAffinity`. Before applying:

```bash
# Confirm your worker-1 hostname
kubectl get nodes -o wide

# Edit storage.yaml to match
# spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values: ["worker-1-hostname"]
```

```bash
kubectl apply -f k8s/database/ -n wallet
kubectl get pvc -n wallet       # Bound
kubectl get pods -n wallet -l app=mongodb  # Running
```

### 5. Redis

```bash
kubectl apply -f k8s/redis/ -n wallet
```

### 6. Service Deployments

```bash
kubectl apply -k k8s/ -n wallet
kubectl get pods -n wallet      # All Running; ~60s for all readiness probes to pass
```

### 7. NGINX Ingress via Helm

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080 \
  --set controller.config.upstream-hash-by='$remote_addr'

kubectl apply -f k8s/ingress/ -n wallet
```

The Ingress resource configures:
- `/api` → `api-gateway` service, `nginx.ingress.kubernetes.io/upstream-hash-by: ""` (EWMA)
- `/socket.io` → `notification-service` service, `nginx.ingress.kubernetes.io/upstream-hash-by: "$remote_addr"` (IP-hash)

### 8. cert-manager for mTLS

```bash
helm repo add jetstack https://charts.jetstack.io
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

kubectl apply -f k8s/cert-manager/ -n wallet
```

### 9. Monitoring Stack

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f k8s/monitoring/values.yaml
```

`values.yaml` configures NodePort 32000 for Grafana and 30090 for Prometheus. ServiceMonitor resources in each service namespace are picked up automatically via label selector.

### 10. Verify

```bash
kubectl get pods -n wallet -n monitoring -n ingress-nginx

# App
curl http://<worker-public-ip>:30080/api/health

# Grafana
open http://<worker-public-ip>:32000   # admin / prom-operator (default, change on first login)

# Jaeger
kubectl port-forward svc/jaeger-query 16686:16686 -n monitoring
open http://localhost:16686
```

### Rolling Updates

```bash
# CI pushes :latest and :<git-sha> — deployments reference the SHA tag
# Update a single service after a new image push:
kubectl set image deployment/wallet-service \
  wallet-service=<dockerhub-user>/wallet-service:<new-sha> -n wallet

# Rollback to previous image (SHA tag guarantees exact artifact)
kubectl rollout undo deployment/wallet-service -n wallet
```

---

## Microservices

### API Gateway — Port 4000

**Responsibility**: Edge service. Every inbound request passes through here before reaching any backend service. Verifies the JWT and injects `x-user-id` and `x-user-role` as headers so downstream services trust these values without re-verifying the token. Applies rate limiting at the user + route level. Injects `x-correlation-id` (UUID v4) for distributed tracing. Maintains an opossum circuit breaker per downstream — after 5 consecutive failures, the breaker opens for 30 seconds and returns `503` without attempting the downstream call. Handles connection draining by refusing new connections during `SIGTERM` and waiting for in-flight requests to complete.

**Data store**: Redis (rate limiting sorted sets, correlation ID propagation).
**Communication**: Synchronous HTTP proxy to Auth, Wallet, Payment services.

### Auth Service — Port 3001

**Responsibility**: User identity lifecycle. Handles registration, OTP verification, login, refresh token rotation, password reset, and KYC document submission. Owns the `User`, `AuditLog`, and `KYCDocument` MongoDB collections. Issues JWT pairs; stores only SHA-256 hashes of refresh and reset tokens. Emits no async events — all operations complete synchronously.

**Data store**: MongoDB (`users`, `audit_logs`, `kyc_documents`).
**Communication**: Synchronous only. Called by API Gateway.

### Wallet Service — Port 3002

**Responsibility**: Financial operations. Owns the double-entry ledger, all transfer logic, dispute lifecycle, scheduled transfers, payment requests, split-bill, beneficiaries, and analytics aggregations. Acquires a Redis distributed lock before every debit. Publishes `TRANSFER_SENT`, `MONEY_RECEIVED`, `LOW_BALANCE_ALERT`, `SCHEDULED_TRANSFER_EXECUTED`, and audit events to BullMQ after every successful state change.

**Data store**: MongoDB (`wallets`, `transactions`, `ledger_entries`, `disputes`, `scheduled_transfers`, `payment_requests`, `split_bills`, `beneficiaries`, `referrals`, `notification_preferences`). Redis (balance cache, distributed lock, analytics cache).
**Communication**: Synchronous HTTP for read/write endpoints. Async BullMQ producer for post-transfer side effects.

### Payment Service — Port 3003

**Responsibility**: All money-in flows. Creates Razorpay orders, verifies HMAC-SHA256 payment signatures, processes inbound webhooks with deduplication, and calls the Wallet Service to credit the user's balance. For business accounts, signs and delivers outgoing webhooks. Handles the `startSessionSafe` fallback for MongoDB standalone deployments.

**Data store**: MongoDB (`payment_webhook_events`).
**Communication**: Synchronous HTTP from API Gateway. Calls Wallet Service synchronously to credit wallets. No BullMQ producer — Wallet Service handles post-credit events.

### Notification Service — No HTTP port (worker process)

**Responsibility**: Async event consumer. Processes three BullMQ queues: `notification.queue` (user-facing events), `audit.queue` (append-only audit writes), `fraud.queue` (score flagging). For each job, reads the user's `NotificationPreference` document and dispatches via Nodemailer (email) and/or Socket.IO (in-app). Failed jobs retry with exponential backoff: 100ms → 200ms → 400ms. After 3 failures, the job moves to the dead-letter queue and an admin alert fires via Alertmanager.

**Data store**: MongoDB (`notification_preferences`, read-only). Redis (Socket.IO pub/sub adapter).
**Communication**: Async only. Consumes from BullMQ. Emits to Socket.IO rooms.

---

## CI/CD Pipeline

Every push to `main` triggers the GitHub Actions workflow at `.github/workflows/ci-cd.yml`.

```yaml
# Condensed view of the pipeline steps
jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start test dependencies
        run: docker-compose -f docker-compose.test.yml up -d mongodb redis

      - name: Run Jest tests
        run: |
          cd services/auth-service    && npm ci && npm test
          cd services/wallet-service  && npm ci && npm test
          cd services/payment-service && npm ci && npm test

      - name: Lint
        run: |
          cd services/auth-service    && npm run lint
          cd services/wallet-service  && npm run lint
          cd services/payment-service && npm run lint

      - name: Build and push Docker images
        env:
          SHA: ${{ github.sha }}
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin

          for service in api-gateway auth-service wallet-service payment-service notification-service; do
            docker build -t ${{ secrets.DOCKER_USERNAME }}/$service:latest \
                         -t ${{ secrets.DOCKER_USERNAME }}/$service:${SHA::8} \
                         services/$service/
            docker push ${{ secrets.DOCKER_USERNAME }}/$service:latest
            docker push ${{ secrets.DOCKER_USERNAME }}/$service:${SHA::8}
          done

          docker build -t ${{ secrets.DOCKER_USERNAME }}/wallet-frontend:latest \
                       -t ${{ secrets.DOCKER_USERNAME }}/wallet-frontend:${SHA::8} \
                       frontend/
          docker push ${{ secrets.DOCKER_USERNAME }}/wallet-frontend:latest
          docker push ${{ secrets.DOCKER_USERNAME }}/wallet-frontend:${SHA::8}
```

**SHA tagging rationale**: Kubernetes deployments reference `image: user/wallet-service:<sha>`. `kubectl rollout undo` re-pulls the exact image from that commit, not `:latest` which may have moved forward. `kubectl rollout history` maps each revision to a readable git SHA.

**Required secrets**: `DOCKER_USERNAME`, `DOCKER_PASSWORD`.

**Missing step (in-progress)**: Automatic `kubectl set image` step after push — currently a manual step using the SHA printed in the CI summary.

---

## Observability

### Distributed Tracing — Jaeger

OpenTelemetry SDK auto-instruments HTTP (incoming + outgoing), MongoDB (via `@opentelemetry/instrumentation-mongodb`), and Redis (via `@opentelemetry/instrumentation-ioredis`) in every service.

The API Gateway generates an `x-correlation-id` (W3C `traceparent` format) and forwards it in all proxy requests. Each downstream service reads `traceparent` from the incoming header and creates child spans under the same trace. The result is a full waterfall in Jaeger: `NGINX → API Gateway → Wallet Service → MongoDB + Redis` with timing for each hop.

```bash
# Access Jaeger UI
kubectl port-forward svc/jaeger-query 16686:16686 -n monitoring
# http://localhost:16686 → search by service name or x-correlation-id
```

**What to look for**: Transfer traces with MongoDB write latency > 100ms indicate index pressure. Rate limit pipeline latency spikes indicate Redis CPU saturation.

### Metrics — Prometheus + Grafana

Each service exposes `/metrics` in Prometheus text format. `kube-prometheus-stack` scrapes via `ServiceMonitor` resources.

**Metrics per service**:
- `http_requests_total{service, method, route, status_code}` — request rate and error rate
- `http_request_duration_seconds{service, method, route}` — latency histogram (p50, p95, p99)
- `bullmq_jobs_processed_total{queue, status}` — job throughput and failure rate
- `redis_lock_acquired_total` / `redis_lock_failed_total` — distributed lock contention
- `wallet_transfer_amount_sum` — total transfer volume

**Alertmanager rules** (defined in `values.yaml`):
- Error rate `> 1%` over 5-minute window → PagerDuty/Slack alert
- `http_request_duration_seconds` p99 `> 500ms` over 5-minute window → alert
- BullMQ DLQ depth `> 10` → alert
- MongoDB replication lag `> 30s` → alert

```bash
# Grafana: http://<worker-public-ip>:32000
# Default login: admin / prom-operator (change immediately)
# Prometheus: http://<worker-public-ip>:30090
```

Dashboards include: per-service request rate + error rate, transfer volume, BullMQ queue depth, Redis memory and hit rate, MongoDB operation latency, and Kubernetes node resource utilization.

### Structured Logging — Winston + Morgan

Every log line is JSON with `level`, `message`, `service`, `correlationId`, `timestamp`, and optional `userId`, `walletId`, `txnId`. `correlationId` matches the Jaeger trace ID, making it possible to jump from a log line to the trace waterfall.

Morgan HTTP logs are written at `info` level with `method`, `url`, `status`, `responseTime`, and `correlationId`.

---

## Testing

### Unit Tests

Located in `tests/*.unit.test.js` within each service. No database or network dependencies — Redis and MongoDB calls are mocked.

| Test | What it verifies |
|---|---|
| `tokenSecurity.hashToken` | SHA-256 output is 64-character hex; two calls with the same input return identical output |
| `tokenSecurity.compare` | Returns `false` when hashes differ without leaking timing information (constant-time via `timingSafeEqual`) |
| `distributedLock.acquire` | Returns `true` on `SETNX` success; returns `false` without retrying when `SETNX` returns 0 and retries exhausted |
| `balanceCache.get` | Returns cached value on hit; calls `Wallet.findOne` on miss and writes result to cache |
| `balanceCache.invalidate` | Calls `pipeline().del(senderKey).del(receiverKey).exec()` in a single pipeline, not two sequential `DEL` calls |
| `hmac.verifyWebhook` | Returns `true` when `timingSafeEqual(computed, received)` matches; `false` on any byte difference |
| `sessionSafe.startSessionSafe` | On `MongoServerError` code 20, retries with atomic `$inc` path; on replica-set success, uses session path |
| `rateLimiter` | Pipeline contains exactly 4 commands (ZREMRANGEBYSCORE, ZADD, ZCARD, EXPIRE) in correct order |

### Integration Tests

Located in `tests/*.integration.test.js`. Spin up a real MongoDB instance (via `mongodb-memory-server`) and a real Redis instance (`ioredis-mock` or test Redis container). Test full HTTP request → response cycles via Supertest.

| Test | What it verifies |
|---|---|
| `POST /api/auth/register` | Creates User document, stores OTP hash (not plaintext), sends email |
| `POST /api/auth/verify-otp` | Correct OTP creates Wallet, returns `201` with JWT pair; wrong OTP returns `400` |
| `POST /api/wallet/transfer` | Valid transfer debits sender, credits receiver, writes LedgerEntry pair, returns `201` |
| `POST /api/wallet/transfer` (idempotency) | Second request with same `idempotencyKey` returns `200` with original transaction, no second debit |
| `POST /api/wallet/transfer` (insufficient) | Transfer exceeding balance returns `400`; both wallet balances unchanged |
| `POST /api/wallet/transfer` (frozen wallet) | Transfer from `status: frozen` wallet returns `403`; no debit attempted |
| `POST /api/payment/webhook` | First webhook credits wallet, second with same `eventId` returns `200` without second credit |
| `POST /api/payment/webhook` (bad sig) | Invalid HMAC returns `401` before any DB write |
| KYC tier limit | Transfer of ₹15,000 from Tier 0 wallet returns `400` with `TRANSFER_LIMIT_EXCEEDED` |
| Daily limit | 3 transfers totalling above daily limit; third returns `400` with `DAILY_LIMIT_EXCEEDED` |

### Concurrency Tests

Located in `tests/*.concurrency.test.js`. Use `Promise.all` to fire simultaneous requests against a running test server backed by real MongoDB and Redis.

| Test | What it verifies |
|---|---|
| 10 simultaneous transfers with same `idempotencyKey` | Exactly 1 `Transaction` document created; sender balance decremented exactly once |
| 2 simultaneous debits from same wallet (different `idempotencyKey`) | Only 1 acquires the Redis lock; second receives `409 LOCK_CONTENTION` and retries; total debit equals exactly the two amounts or fails cleanly — balance never goes negative |
| 5 simultaneous `/auth/refresh-token` calls with same token | Exactly 1 refresh succeeds with `200`; remaining 4 receive `401 TOKEN_REUSE` (rotation invalidated the token on first use) |
| Rate limiter at 5 req/15 min (auth route) | First 5 requests succeed; 6th and beyond receive `429` with `Retry-After` header |

---

## Engineering Challenges

### 1. Refresh Token Race Condition — Concurrent 401 Responses

**Problem**: Multiple parallel API calls with an expired access token each independently received a `401`, each triggered a `/auth/refresh-token` call, and each call received a new token pair — but each successful refresh also invalidated the previous pair. The second refresh call arrived with a token that the first refresh had already superseded, returning `401` and logging the user out.

**Solution**: The Axios interceptor stores a module-level `refreshPromise` variable. The first `401` handler sets `refreshPromise = authApi.post('/refresh-token').finally(() => refreshPromise = null)`. Every subsequent `401` checks `if (refreshPromise)` and subscribes to the existing promise instead of creating a new one. All queued requests receive the same new access token in their `Authorization` header once the single refresh resolves.

### 2. MongoDB Standalone Transaction Fallback — Error Code 20

**Problem**: Multi-document transfers require an ACID session for atomicity, but `mongod` running as a standalone instance (no replica set) returns `MongoServerError: Transaction numbers are only allowed on a replica set member or mongos (code: 20)` when `session.startTransaction()` is called, aborting the transfer.

**Solution**: `startSessionSafe()` wraps every transactional operation. It calls `session.startTransaction()` inside a `try` block. On `MongoServerError` with `code === 20`, it retries the operation in non-session mode using atomic operators: `Wallet.updateOne({ _id: senderId, balance: { $gte: amount } }, { $inc: { balance: -amount } })` followed by `Wallet.updateOne({ _id: receiverId }, { $inc: { balance: amount } })`. The `$gte` guard on the debit prevents negative balance even without a session. The same function handles both execution paths transparently to the caller.

### 3. Webhook Idempotency — Razorpay Replay

**Problem**: Razorpay retries webhook delivery on network failures or non-`2xx` responses. A replay of a `payment.captured` event would re-credit the user's wallet for the same payment.

**Solution**: `PaymentWebhookEvent.updateOne({ eventId: payload.event_id }, { $setOnInsert: { eventId, payload, processedAt: new Date() } }, { upsert: true })`. A unique index on `eventId` makes this operation atomic at the MongoDB level. If `upsertedCount === 0`, the event was already processed — the handler returns `200` immediately without touching the wallet. The `$setOnInsert` operator ensures that a matched document is never overwritten, making the idempotency check and the insert a single atomic database operation rather than a read-then-write race.

### 4. Calico VXLAN on AWS EC2 — BGP Blocked by VPC

**Problem**: The default Calico installation uses BGP (TCP 179) to advertise pod CIDR routes between nodes. AWS VPC does not allow BGP between EC2 instances unless using Transit Gateway with BGP support. Pod-to-pod traffic across nodes was silently dropped — connections timed out rather than being refused, making the failure hard to distinguish from a workload bug.

**Solution**: After confirming inter-pod connectivity failure with `kubectl exec` ping tests and ruling out security groups for non-BGP ports, the root cause was confirmed by checking Calico's `BGPPeer` status showing zero established peers. The `Installation` CR was patched: `bgp: Disabled` disables all BGP peering; `encapsulation: VXLAN` routes all inter-pod traffic through VXLAN tunnels on UDP 4789, which the VPC allows. After adding UDP 4789 to the security group inbound rule and restarting calico-node pods, cross-node ping resolved and pod-to-pod latency normalized.

### 5. Socket.IO Events Dropped Across Replicas

**Problem**: Scaling the notification service to 2 replicas caused ~50% of real-time events to be silently dropped. A `TRANSFER_SENT` event emitted by replica-A used its in-process `io` instance, which only holds sockets connected to replica-A. If the recipient's browser had connected to replica-B, the emit was discarded with no error.

**Solution**: `@socket.io/redis-adapter` was added to the notification service. `io.adapter(createAdapter(pubClient, subClient))` replaces the default in-memory adapter with one backed by Redis pub/sub. When replica-A calls `io.to('user-<id>').emit(...)`, the event is published to a Redis channel. All replicas subscribe to this channel and each attempts to deliver to any matching socket in their local socket map. The socket connected to replica-B receives and delivers the event. This made horizontal scaling of the notification service safe.

### 6. hostPath PV Scheduling — Pod Scheduled on Wrong Node

**Problem**: The MongoDB StatefulSet used a `hostPath` PersistentVolume pointing to `/data/mongo` on worker-1. Without a `nodeAffinity` constraint on the PV, the scheduler occasionally placed the MongoDB pod on worker-2 where the directory did not exist. The PVC remained in `Pending` state with `no matching PersistentVolumes` error, and the pod never started.

**Solution**: A `nodeAffinity.required.nodeSelectorTerms` block was added to the PV spec:
```yaml
nodeAffinity:
  required:
    nodeSelectorTerms:
      - matchExpressions:
          - key: kubernetes.io/hostname
            operator: In
            values: ["worker-1-hostname"]
```
This pins the PV to worker-1. The PVC binds only when the pod is also scheduled on worker-1, which the `nodeAffinity` on the StatefulSet's pod spec ensures. The directory must be pre-created on worker-1: `mkdir -p /data/mongo && chown 999:999 /data/mongo`.

### 7. kubeadm Join Hang + Calico Felix Crash — Ports 6443 and 5473

**Problem**: `kubeadm join` on the worker nodes would hang at `[preflight] Running pre-flight checks` for several minutes before timing out. Separately, `calico-node` pods on worker nodes were in `CrashLoopBackOff` with Felix logs showing `Failed to connect to Typha`.

**Solution**: Two separate AWS security group deficiencies diagnosed sequentially:

1. `kubeadm join --v=5` showed the hang at TLS dial to `master-ip:6443` — the control-plane API server port was blocked. Added inbound TCP 6443 rule from the worker security group to the master security group. Join completed immediately after.

2. Calico Felix on workers connects to Typha on the master over TCP 5473. This port was also blocked. `kubectl logs calico-node-<worker> -n calico-system | grep Typha` showed `connection refused`. Added inbound TCP 5473 rule. Felix pods became `Running` and pod networking stabilized.

### 8. Concurrent Double-Spend — Two Simultaneous Transfers

**Problem**: Two simultaneous debit requests from the same wallet could both pass the `{ balance: { $gte: amount } }` check before either committed. If balance was ₹1,000 and both requests debited ₹800, the second write would drive the balance negative because MongoDB's `updateOne` is atomic per-document but the read and write are not serialized across two concurrent requests.

**Solution**: A Redis distributed lock precedes every debit: `SET wallet:<senderId>:lock 1 NX PX 5000`. Only the request that sets the key proceeds to the debit. The second request polls with a 50ms retry interval up to 3 attempts. If the lock is not released within the retry window, it returns `409` with `LOCK_CONTENTION`. The lock is explicitly released after the MongoDB write commits. The `PX 5000` TTL auto-releases the lock on pod crash, preventing indefinite lockout.

### 9. Rate Limit Inconsistency Across Pods — In-Memory Counters

**Problem**: Each API Gateway pod maintained its own in-memory rate limit counter. A user routing through different pods (due to EWMA load balancing) effectively had N times the allowed rate. Restarting a pod reset its counter. Rate limits were unenforceable across a multi-pod deployment.

**Solution**: Rate limit state moved entirely to Redis sorted sets. For each request, a pipeline executes atomically:
```
ZREMRANGEBYSCORE key 0 (now - windowMs)   # remove expired entries
ZADD key now now                           # add current request timestamp
ZCARD key                                  # count requests in window
EXPIRE key windowMs/1000                   # slide expiry
```
All pods share the same key per `userId:route`. The pipeline executes in one TCP round trip, making it cheaper than two sequential commands while being consistent. `X-RateLimit-Remaining` is computed as `max(0, limit - count)` from the ZCARD result.

### 10. Cache Invalidation Atomicity — Sender/Receiver Balance Stale Window

**Problem**: After a transfer, the code performed two sequential Redis `DEL` calls: `del(senderBalanceKey)` then `del(receiverBalanceKey)`. Between these two calls, a concurrent read for the receiver's balance would hit the cache and return the pre-transfer stale value. On a busy cluster with many transfers per second, this window produced observable incorrect balance displays.

**Solution**: Both invalidations moved into a single Redis pipeline: `redis.pipeline().del(senderKey).del(receiverKey).exec()`. The pipeline sends both commands in a single TCP packet and Redis executes them without interleaving other commands between them. After this, any cache miss on either key forces a fresh DB read and re-populates the cache with the post-transfer balance. The atomic pipeline eliminated the interleaved-read window entirely.

---

## Future Improvements

- **EBS CSI driver** to replace `hostPath` PV — removes the `nodeAffinity` constraint and enables MongoDB pod rescheduling across any worker node with persistent storage intact.
- **Loki + Promtail** for centralized log aggregation — correlate log lines across all services by `x-correlation-id` in a single Grafana query rather than `kubectl logs` per pod.
- **Fraud scoring model** — replace the static threshold in the fraud consumer with a lightweight ML model (scikit-learn or ONNX) scoring transaction amount, velocity, and geolocation delta. Scoring is async in BullMQ so it does not block the transfer response.
- **Kafka** to replace BullMQ for event streaming — enables event replay, consumer group partitioning, and durable audit trail without MongoDB append semantics.
- **OpenID Connect (OIDC)** for social login — replace the OTP-only flow with Google/GitHub OIDC while keeping the OTP path as a fallback.
- **Automated `kubectl set image` in CI** — extend the GitHub Actions pipeline to patch the Kubernetes deployment image after each successful push, removing the manual rollout step.
- **Database-backed integration tests in CI** — replace `mongodb-memory-server` with a Docker Compose test environment that includes a real MongoDB replica set and Redis, eliminating the standalone-vs-replica-set divergence from the test environment.
