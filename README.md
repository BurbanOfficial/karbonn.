# Karbonn — Backend API (Qonto)

Backend Node.js/Express servant de proxy sécurisé entre l'intranet Karbonn et l'API Qonto.

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `QONTO_API_TOKEN` | Token API Qonto (depuis Paramètres > Intégrations) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Contenu JSON du compte de service Firebase (sur une seule ligne) |
| `ALLOWED_ORIGINS` | Domaines autorisés, séparés par des virgules |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (préfixée par `sk_test_` ou `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook Stripe pour `invoice.payment_succeeded` et `invoice.upcoming` |
| `PORT` | Render le définit automatiquement |

## Déploiement sur Render

1. Créez un **Web Service** sur Render.
2. Connectez votre repository Git.
3. Configurez :
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
4. Renseignez les variables d'environnement ci-dessus.

## Configuration du frontend

Dans `espace-commercial.js`, l'URL du backend est définie via `window.API_BASE_URL` ou par défaut `http://localhost:3000`.

Pour la production, ajoutez dans votre HTML avant le script :

```html
<script>window.API_BASE_URL = 'https://votre-url-render.onrender.com';</script>
```

## Endpoints API

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/clients` | Liste tous les clients |
| POST | `/api/clients` | Crée un client (Qonto + Firestore) |
| GET | `/api/clients/:id` | Récupère un client |
| PUT | `/api/clients/:id` | Met à jour un client (Qonto + Firestore) |
| DELETE | `/api/clients/:id` | Supprime un client (Qonto + Firestore) |
| POST | `/api/admin/sync-renewal-prices` | Force la mise à jour des prix des abonnements Stripe Billing actifs (manager) |

## Webhooks Stripe

Le endpoint `/stripe/webhook` écoute :
- `invoice.payment_succeeded` : prolonge la date d’expiration du domaine après un renouvellement automatique.
- `invoice.upcoming` : met à jour le prix de l’abonnement sur la prochaine facture si les tarifs ont changé.

## Sécurité

- Tous les endpoints `/api` nécessitent un token Firebase valide.
- Seuls les utilisateurs avec le rôle `Manager` dans Firestore peuvent accéder aux endpoints.
- Le token Qonto reste côté serveur et n'est jamais exposé au navigateur.
