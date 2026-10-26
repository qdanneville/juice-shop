/*
 * Lab OIDC — application cliente (RP). SIMULATION, realm nc-connect-sim.
 * MODE=vuln  -> intègre les 5 défauts (A state, B PKCE, C id_token, D email, E logout)
 * MODE=fixed -> version durcie
 */
const express = require('express')
const session = require('express-session')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const jwksClient = require('jwks-rsa')

const MODE = process.env.MODE === 'fixed' ? 'fixed' : 'vuln'
const PORT = 3010
const ISSUER = 'http://localhost:8080/realms/nc-connect-sim'
const CLIENT_ID = 'nc-connect-client'
const REDIRECT_URI = `http://localhost:${PORT}/callback`
const AUTH = `${ISSUER}/protocol/openid-connect/auth`
const TOKEN = `${ISSUER}/protocol/openid-connect/token`
const LOGOUT = `${ISSUER}/protocol/openid-connect/logout`
const JWKS = `${ISSUER}/protocol/openid-connect/certs`

const accounts = {} // base de comptes locale (la clé dépend du mode)
const jwks = jwksClient({ jwksUri: JWKS })
function getKey (header, cb) {
  jwks.getSigningKey(header.kid, (err, key) => cb(err, key && key.getPublicKey()))
}
const b64url = (b) => Buffer.from(b).toString('base64url')

const app = express()
app.use(session({ secret: 'lab', resave: false, saveUninitialized: true }))

app.get('/', (req, res) => {
  res.type('text/plain').send(`Lab OIDC (${MODE})\nConnecté: ${req.session.user || '(personne)'}\n/login pour démarrer, /logout pour sortir`)
})

app.get('/login', (req, res) => {
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'openid email profile' })
  if (MODE === 'fixed') {
    const state = crypto.randomBytes(16).toString('hex')
    const nonce = crypto.randomBytes(16).toString('hex')
    const verifier = crypto.randomBytes(32).toString('base64url')
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
    req.session.state = state; req.session.nonce = nonce; req.session.verifier = verifier
    params.set('state', state); params.set('nonce', nonce)
    params.set('code_challenge', challenge); params.set('code_challenge_method', 'S256')
  }
  // MODE vuln : ni state, ni nonce, ni PKCE
  res.redirect(`${AUTH}?${params.toString()}`)
})

app.get('/callback', async (req, res) => {
  const { code, state } = req.query
  if (MODE === 'fixed' && (!req.session.state || state !== req.session.state)) {
    return res.status(400).send('state invalide (CSRF bloqué)')
  }
  try {
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, code: String(code), redirect_uri: REDIRECT_URI })
    if (MODE === 'fixed') body.set('code_verifier', req.session.verifier)
    const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    const tokens = await r.json()
    if (!tokens.id_token) return res.status(401).send('échec échange: ' + JSON.stringify(tokens))

    let claims
    if (MODE === 'vuln') {
      claims = jwt.decode(tokens.id_token) // AUCUNE vérification de signature/claims
    } else {
      claims = await new Promise((resolve, reject) =>
        jwt.verify(tokens.id_token, getKey, { issuer: ISSUER, audience: CLIENT_ID, algorithms: ['RS256'] },
          (e, d) => e ? reject(e) : resolve(d)))
      if (claims.nonce !== req.session.nonce) return res.status(400).send('nonce invalide')
    }

    // rattachement du compte
    const key = MODE === 'vuln' ? claims.email : `${claims.iss}#${claims.sub}`
    accounts[key] = accounts[key] || { email: claims.email, sub: claims.sub }
    req.session.user = `${claims.email} (clé=${key})`
    res.redirect('/')
  } catch (e) {
    res.status(500).send('erreur callback: ' + e.message)
  }
})

app.get('/logout', (req, res) => {
  req.session.destroy(() => {})
  if (MODE === 'fixed') {
    return res.redirect(`${LOGOUT}?client_id=${CLIENT_ID}&post_logout_redirect_uri=http://localhost:${PORT}/`)
  }
  res.send('déconnexion locale seulement (session IdP intacte)')
})

app.listen(PORT, () => console.log(`client ${MODE} sur http://localhost:${PORT}`))
