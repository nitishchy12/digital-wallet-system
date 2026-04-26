# NGINX Ingress Controller

Use NGINX Ingress Controller for the self-managed kubeadm cluster.

## Install With Helm

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

## Check Controller

```bash
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

## Application URL

Open the application through the worker node public IP and the NGINX NodePort:

```text
http://<worker-node-public-ip>:30080
```
