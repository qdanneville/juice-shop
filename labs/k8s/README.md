# Lab Kubernetes — chapitre 12

> On casse la chaîne **maillon par maillon** : on déploie Juice Shop avec des manifests
> **volontairement vulnérables**, on observe chaque défaut, puis on durcit l'un après
> l'autre et on **valide avec `trivy config`**.

## ⚠️ Avertissement — LOCAL UNIQUEMENT

Le dossier `vulnerable/` déploie un pod **`privileged`** qui **monte le système de
fichiers de l'hôte** (`hostPath: /`). Sur un cluster partagé, c'est une évasion de
conteneur offerte. **Ne faites ce TP que sur un cluster k3d jetable, sur votre poste.**
Vérifiez votre contexte avant toute commande : `kubectl config current-context`
(il doit afficher `k3d-juice-lab`).

## Prérequis

- Docker (démon lancé)
- `kubectl` — `brew install kubernetes-cli`
- `k3d` — installé automatiquement par `setup.sh` si absent (`brew install k3d`)
- `trivy` — `brew install trivy` (chapitre 11)

## Structure

```
labs/k8s/
├── setup.sh                 # crée le cluster k3d (localhost:3000 → NodePort 30000)
├── teardown.sh              # supprime le cluster
├── vulnerable/              # les 4 défauts (+ aucune NetworkPolicy)
│   ├── 00-namespace.yaml        # pas de Pod Security Standard
│   ├── 01-secret.yaml           # défaut 4a : secret base64 dans le dépôt
│   ├── 02-rbac.yaml             # défaut 2b : RBAC trop large (tous les secrets)
│   ├── 03-deployment.yaml       # défauts 1a/1b/2a/4b : privileged, hostPath, token monté, pas de limits
│   └── 04-service.yaml
└── hardened/                # le durcissement, maillon par maillon
    ├── 00-namespace.yaml        # PSS `restricted`
    ├── 01-secret.example.yaml   # secret HORS dépôt (CLI / coffre)
    ├── 02-rbac.yaml             # SA sans droits + automount off
    ├── 03-deployment.yaml       # securityContext complet + resources.limits
    ├── 04-service.yaml
    └── 05-networkpolicy.yaml    # default deny + autorisations explicites
```

## Les 4 défauts → les contre-mesures (rappel du chapitre)

| # | Défaut (`vulnerable/`) | Contre-mesure (`hardened/`) |
|---|---|---|
| 1 | Pod `privileged` + `hostPath` | PSS `restricted`, `securityContext` complet (`runAsNonRoot`, `readOnlyRootFilesystem`, `drop: [ALL]`, seccomp) |
| 2 | Jeton de ServiceAccount monté + RBAC trop large | `automountServiceAccountToken: false`, RBAC minimal (aucun droit) |
| 3 | Aucune NetworkPolicy | NetworkPolicy `default deny` puis flux explicites |
| 4 | Secret base64 dans le dépôt + pas de `resources.limits` | Secret hors dépôt (coffre, ch. 07), `requests`/`limits` CPU/mémoire |

---

## Pas-à-pas

### 0. Créer le cluster
```bash
cd labs/k8s
chmod +x setup.sh teardown.sh
./setup.sh
kubectl config current-context        # doit afficher k3d-juice-lab
```

### 1. Déployer la version vulnérable et constater la chaîne
```bash
kubectl apply -f vulnerable/
kubectl -n juice-shop-lab rollout status deploy/juice-shop
# → http://localhost:3000
```

Observer chaque maillon :

```bash
POD=$(kubectl -n juice-shop-lab get pod -l app=juice-shop -o name)

# Défaut 1 — évasion : le FS de l'hôte est monté dans le pod
kubectl -n juice-shop-lab exec -it "$POD" -- ls /host

# Défaut 2 — le jeton du SA est présent, et le RBAC permet de lire TOUS les secrets
kubectl -n juice-shop-lab exec -it "$POD" -- cat /var/run/secrets/kubernetes.io/serviceaccount/token | head -c 40; echo …
kubectl -n juice-shop-lab auth can-i list secrets \
  --as=system:serviceaccount:juice-shop-lab:juice-sa -n juice-shop-lab   # → yes

# Défaut 4a — le "secret" n'est que du base64
kubectl -n juice-shop-lab get secret juice-db-credentials \
  -o jsonpath='{.data.db-password}' | base64 -d; echo

# Défaut 4b — aucune limite de ressources
kubectl -n juice-shop-lab get pod -o jsonpath='{.items[0].spec.containers[0].resources}'; echo "  (vide)"

# Défaut 3 — aucune NetworkPolicy dans le namespace
kubectl -n juice-shop-lab get networkpolicy        # → No resources found
```

### 2. Valider AVANT avec Trivy (analyse statique des manifests)
```bash
trivy config vulnerable/
# ou, uniquement le sérieux :
trivy config --severity HIGH,CRITICAL vulnerable/
```
Trivy remonte : privileged, hostPath, pas de `runAsNonRoot`, capabilities non droppées,
pas de `limits`, etc. C'est la même logique que `trivy image` (ch. 11/12), appliquée à
la **configuration**.

### 3. Durcir, maillon par maillon
```bash
# Nettoyer la version vulnérable
kubectl delete -f vulnerable/

# Le secret ne vient PLUS d'un fichier versionné : on le crée à la volée
kubectl create namespace juice-shop-lab 2>/dev/null || true
kubectl -n juice-shop-lab create secret generic juice-db-credentials \
  --from-literal=db-password="$(openssl rand -base64 24)"

# Appliquer le durci (le namespace passe en PSS restricted)
kubectl apply -f hardened/
kubectl -n juice-shop-lab rollout status deploy/juice-shop
```

Preuve que l'admission bloque désormais le pod vulnérable :
```bash
kubectl apply -f vulnerable/03-deployment.yaml
# → refusé par Pod Security "restricted" (privileged, hostPath, runAsNonRoot…)
```

### 4. Valider APRÈS avec Trivy
```bash
trivy config --severity HIGH,CRITICAL hardened/
```
Les alertes HIGH/CRITICAL du durcissement doivent avoir disparu — c'est le **test de
non-régression de configuration**, exactement comme une alerte SAST qui s'éteint après
correction (ch. 10).

> Résultat attendu (vérifié) : `vulnerable/` → **2 CRITICAL** (RBAC wildcard) + **4 HIGH**
> (privileged, hostPath, `readOnlyRootFilesystem`, contexte root) ; `hardened/` → plus
> aucune HIGH/CRITICAL, il ne reste que `KSV-0125 (MEDIUM) untrusted registry`. Cette
> dernière n'est **pas** un des 4 défauts du lab : elle signale juste que l'image vient
> de Docker Hub (`bkimminich/juice-shop`). En entreprise on la clôt en tirant l'image
> depuis un **registre interne de confiance** (et `trivy config --compliance ...` ou une
> config `.trivyignore` sert à tracer l'exception).

### 5. Nettoyer
```bash
./teardown.sh
```

---

## Deux nuances « senior » (importantes)

- **`readOnlyRootFilesystem: true` vs app qui écrit.** Trivy l'exige, et c'est juste ;
  mais Juice Shop écrit dans plusieurs dossiers (logs, ftp, uploads). En durcissement
  réel, on monte un `emptyDir` **par chemin d'écriture nécessaire** (le lab n'en monte
  qu'un, `/tmp`). Si le pod durci refuse de démarrer pour cause de FS en lecture seule,
  ajoutez les `emptyDir` manquants — ou, pour seulement explorer le reste, passez
  temporairement `readOnlyRootFilesystem: false`. C'est le compromis sécurité ↔ réalité
  applicative, pas un détail à masquer.

- **NetworkPolicy inerte sous Flannel.** k3d/k3s embarque Flannel, qui **n'applique pas**
  les NetworkPolicy : `kubectl apply` les accepte mais elles ne filtrent rien. Pour que
  le maillon « segmentation » soit réellement actif, recréez le cluster sans Flannel et
  installez **Calico** (bloc commenté dans `setup.sh`).

## L'attaque en chaîne (le point clé du chapitre)

Aucun de ces défauts n'est « critique » seul. Enchaînés, ils le deviennent : une faille
applicative (ch. 02-05) donne l'exécution dans le pod → `privileged` + `hostPath`
donnent l'hôte → le **jeton monté** + le **RBAC large** donnent **tous les secrets du
namespace** → l'**absence de NetworkPolicy** permet de rebondir. Chaque maillon coupé
réduit l'impact du précédent : c'est la **défense en profondeur**.
