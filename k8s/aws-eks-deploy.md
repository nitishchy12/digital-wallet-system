# AWS EKS Deployment Guide

This folder deploys the wallet app with:

- React frontend served by Nginx
- Node.js backend API
- MongoDB with persistent EBS-backed storage
- AWS Application Load Balancer ingress
- Prometheus, Grafana, and Alertmanager through Helm

## 1. Prerequisites

You need these tools configured locally:

```bash
aws --version
kubectl version --client
eksctl version
helm version
```

Your `kubectl` context must point to your EKS cluster:

```bash
aws eks update-kubeconfig --region <aws-region> --name <cluster-name>
kubectl get nodes
```

## 2. Install AWS Load Balancer Controller

Skip this only if your cluster uses EKS Auto Mode with load balancing enabled.

```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.14.1/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json

eksctl create iamserviceaccount \
  --cluster=<cluster-name> \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::<aws-account-id>:policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --region <aws-region> \
  --approve

helm repo add eks https://aws.github.io/eks-charts
helm repo update eks

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=<cluster-name> \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --version 1.14.0

kubectl get deployment -n kube-system aws-load-balancer-controller
```

## 3. Configure App Secrets

Edit `k8s/secret.yaml` before deploying:

```yaml
JWT_SECRET: "use-a-long-random-value"
JWT_REFRESH_SECRET: "use-a-different-long-random-value"
EMAIL_USER: "your-email@gmail.com"
EMAIL_PASS: "your-gmail-app-password"
```

Signup and forgot-password need working SMTP credentials because OTP and reset links are sent by email.

## 4. Deploy The App

```bash
kubectl apply -k k8s
kubectl get pods -n wallet
kubectl get svc -n wallet
kubectl get ingress -n wallet
```

Wait for the ingress address:

```bash
kubectl get ingress wallet-ingress -n wallet --watch
```

When AWS creates the ALB DNS name, update `FRONTEND_URL` in `k8s/configmap.yaml`:

```yaml
FRONTEND_URL: "http://<alb-dns-name>"
```

Then apply and restart the backend:

```bash
kubectl apply -k k8s
kubectl rollout restart deployment/wallet-backend -n wallet
```

## 5. Install Monitoring

Follow `k8s/monitoring/helm-instructions.md`.

## 6. Useful Checks

```bash
kubectl describe ingress wallet-ingress -n wallet
kubectl logs deployment/wallet-backend -n wallet
kubectl logs deployment/wallet-frontend -n wallet
kubectl describe pod -n wallet -l app=wallet-backend
kubectl describe pvc -n wallet
```

If MongoDB stays pending, your EKS cluster likely needs a default EBS StorageClass or the EBS CSI driver.
