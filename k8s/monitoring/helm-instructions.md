# Monitoring With Helm

Use Helm for Prometheus, Grafana, and Alertmanager instead of writing raw monitoring YAML by hand.

## 1. Install Helm

On your local machine or CI runner:

```bash
helm version
```

If Helm is missing, install it from https://helm.sh/docs/intro/install/.

## 2. Add The Chart Repository

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

## 3. Install Prometheus And Grafana

```bash
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f k8s/monitoring/values.yaml
```

## 4. Get Grafana Login

```bash
kubectl get svc -n monitoring monitoring-grafana
kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 --decode
```

Default username:

```text
admin
```

## 5. Check Monitoring Pods

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
```


