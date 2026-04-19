# 📊 MONITORING (PROMETHEUS + GRAFANA)

👉 For industry setup, don't write raw YAML manually.
Use Helm (IMPORTANT)

🔹 Install Helm (on master node later)
```bash
sudo apt install helm -y
```

🔹 Prometheus + Grafana (BEST PRACTICE)
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
--namespace monitoring --create-namespace
```

👉 This installs:
- Prometheus ✅
- Grafana ✅
- AlertManager ✅
