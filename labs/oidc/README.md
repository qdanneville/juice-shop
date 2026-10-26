# Lab OIDC — SIMULATION

> ⚠️ **SIMULATION.** Le realm s'appelle `nc-connect-sim`, jamais `nc-connect`. Rien ici n'affirme quoi que ce soit sur le vrai NC Connect.

Fournisseur d'identité **Keycloak** + application cliente **Node** (RP), en version **vulnérable** puis **corrigée**, pour le chapitre 06.

## Démarrer

```bash
cd labs/oidc
docker compose up -d        # Keycloak sur http://localhost:8080 (admin/admin)
# attendre ~30 s que le realm s'importe :
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:8080/realms/nc-connect-sim/.well-known/openid-configuration   # -> 200
```

Client (dans un second terminal) :

```bash
cd labs/oidc/client
npm install
npm run vuln     # version vulnérable sur http://localhost:3010
# ou
npm run fixed    # version corrigée
```

## Repères

| Élément | Valeur |
|---|---|
| Issuer | `http://localhost:8080/realms/nc-connect-sim` |
| Client (public) | `nc-connect-client` |
| Redirect URI du client | `http://localhost:3010/callback` |
| Console admin Keycloak | `http://localhost:8080` (admin / admin) |
| Utilisateur | `alice` / `alice123` (`alice@nc-sim.example`) |
| Utilisateur « victime » | `victim` / `victim123` (`victim@nc-sim.example`) |

Le client `nc-connect-client` est volontairement **mal configuré** (public, flux implicite activé, *direct access grants* activés, `redirect_uri` = `*`, PKCE non exigé).

> ⚠️ **Le login se fait au navigateur.** Keycloak pose ses cookies de session en `Secure; SameSite=None` ; un navigateur les accepte sur `http://localhost`, **curl non** (un login scripté en curl échoue avec `user session not found`). curl / rest-client ne servent que pour les appels back-channel : découverte, JWKS, ROPC, et l'échange d'un `code` récupéré après un login au navigateur.

## Arrêter

```bash
docker compose down         # ajouter -v pour tout supprimer
```
