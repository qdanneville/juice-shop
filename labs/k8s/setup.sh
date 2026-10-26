#!/usr/bin/env bash
# Crée un cluster k3d LOCAL pour le lab Kubernetes du chapitre 12.
# ⚠️ LOCAL UNIQUEMENT : le lab déploie un pod `privileged` avec hostPath.
#    Ne JAMAIS pointer kubectl sur un cluster partagé pendant ce TP.
set -euo pipefail

CLUSTER="juice-lab"

# 1) Prérequis : docker (démon lancé), kubectl, k3d.
command -v docker >/dev/null || { echo "docker manquant"; exit 1; }
docker info >/dev/null 2>&1 || { echo "le démon docker n'est pas lancé"; exit 1; }
command -v kubectl >/dev/null || { echo "kubectl manquant (brew install kubernetes-cli)"; exit 1; }
if ! command -v k3d >/dev/null; then
  echo "k3d absent → installation via Homebrew…"
  brew install k3d
fi

# 2) Création du cluster. On mappe le NodePort 30000 (Service) sur localhost:3000.
#    Juice Shop sera alors joignable sur http://localhost:3000.
#    Le port est lié au LOOPBACK (127.0.0.1) : le lab vulnérable n'est JAMAIS
#    exposé aux autres machines du réseau, seulement à ton poste.
k3d cluster create "$CLUSTER" \
  --port "127.0.0.1:3000:30000@loadbalancer" \
  --wait

# --- Variante NetworkPolicy réellement appliquée (optionnelle) --------------
# k3d/k3s utilise Flannel, qui N'APPLIQUE PAS les NetworkPolicy. Pour que le
# maillon segmentation du lab soit actif, recréer le cluster SANS Flannel et
# installer Calico :
#
#   k3d cluster create "$CLUSTER" --port "127.0.0.1:3000:30000@loadbalancer" \
#     --k3s-arg "--flannel-backend=none@server:*" \
#     --k3s-arg "--disable-network-policy@server:*" --wait
#   kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/calico.yaml
# ---------------------------------------------------------------------------

echo
echo "Cluster '$CLUSTER' prêt. Contexte kubectl :"
kubectl config current-context
echo
echo "Étape suivante : déployer la version vulnérable →  kubectl apply -f vulnerable/"
