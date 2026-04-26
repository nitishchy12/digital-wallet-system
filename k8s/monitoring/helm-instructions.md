# Monitoring With Helm

Use Helm to install Prometheus, Grafana, and Alertmanager on the kubeadm cluster.

## Add Helm Repository

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

## Install Or Upgrade Monitoring

Run this command from the repository root:

```bash
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f k8s/monitoring/values.yaml
```

## Access Grafana

Grafana is exposed through NodePort `32000`.

```bash
kubectl get svc -n monitoring monitoring-grafana
```

Open this URL in a browser:

```text
http://<worker-node-public-ip>:32000
```

Default username:

```text
admin
```

Get the generated admin password:

```bash
kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 --decode
```

## Check Monitoring

```bash
kubectl get pods -n monitoring
kubectl get pvc -n monitoring
kubectl get svc -n monitoring
```
