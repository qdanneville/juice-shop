#!/usr/bin/env bash
# Crée un cluster k3d LOCAL pour le lab Kubernetes du chapitre 12.
# Cible : Ubuntu (latest). Installe docker / kubectl / k3d s'ils manquent.
#
# ⚠️ LOCAL UNIQUEMENT : le lab déploie un pod `privileged` avec hostPath.
#    Ne JAMAIS pointer kubectl sur un cluster partagé pendant ce TP.
set -euo pipefail

CLUSTER="juice-lab"
ARCH="$(dpkg --print-architecture)"   # amd64 | arm64

need_sudo() { if [ "$(id -u)" -ne 0 ]; then echo "sudo"; fi; }
SUDO="$(need_sudo)"

# 1) Docker (moteur + démon). Sur Ubuntu : paquet docker.io.
if ! command -v docker >/dev/null; then
  echo "docker absent → installation (apt)…"
  $SUDO apt-get update -y
  $SUDO apt-get install -y docker.io
fi
$SUDO systemctl enable --now docker 2>/dev/null || true
# k3d parle au socket docker ; sans appartenance au groupe `docker`, il faut sudo.
if ! docker info >/dev/null 2>&1; then
  if ! groups "$USER" | grep -q '\bdocker\b'; then
    echo "→ Ajout de $USER au groupe docker (nécessite une reconnexion ou 'newgrp docker')."
    $SUDO usermod -aG docker "$USER" || true
    echo "   Puis relancez ce script dans une nouvelle session (ou: newgrp docker && ./setup.sh)."
    exit 1
  fi
  echo "le démon docker n'est pas joignable"; exit 1
fi

# 2) kubectl (binaire officiel, version stable).
if ! command -v kubectl >/dev/null; then
  echo "kubectl absent → installation (binaire officiel)…"
  KVER="$(curl -L -s https://dl.k8s.io/release/stable.txt)"
  curl -fsSLO "https://dl.k8s.io/release/${KVER}/bin/linux/${ARCH}/kubectl"
  $SUDO install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
  rm -f kubectl
fi

# 3) k3d (script d'installation officiel).
if ! command -v k3d >/dev/null; then
  echo "k3d absent → installation (script officiel)…"
  curl -fsSL https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | $SUDO bash
fi

# 4) Création du cluster. On mappe le NodePort 30000 (Service) sur le LOOPBACK
#    (127.0.0.1) → le lab vulnérable n'est jamais exposé aux autres machines,
#    seulement à ce poste, sur http://localhost:3000.
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
