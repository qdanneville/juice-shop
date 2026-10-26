#!/usr/bin/env bash
# Supprime le cluster k3d du lab (et donc tout ce qui y tourne).
set -euo pipefail
CLUSTER="juice-lab"
k3d cluster delete "$CLUSTER"
echo "Cluster '$CLUSTER' supprimé."
