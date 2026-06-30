# Déploiement backend Abby pour Karbonn

Ce backend Node.js/Express sert de proxy sécurisé entre l'intranet Karbonn et l'API Abby.

## Prérequis

1. Compte [Render](https://render.com) (Web Service gratuit disponible).
2. Clé API Abby générée depuis `Paramètres > Intégrations` sur [app.abby.fr](https://app.abby.fr).
3. Compte de service Firebase téléchargé depuis la console Firebase (`Paramètres > Comptes de service > Générer une nouvelle clé privée`).

## Variables d'environnement Render

Dans le dashboard Render, ajoutez ces variables d'environnement :

| Variable | Description |
|----------|-------------|
| `ABBY_API_KEY` | Votre clé API Abby (format `suk_...`) |
| `ABBY_API_URL` | `https://api.app-abby.com` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Contenu JSON complet du compte de service Firebase (sur une seule ligne) |
| `ALLOWED_ORIGINS` | Domaines autorisés, séparés par des virgules. Ex : `https://votre-domaine.com,http://localhost`. Pour autoriser tout le monde en test : `*` |
| `PORT` | Render le définit automatiquement sur `10000` |

> ⚠️ **Ne jamais** commiter `ABBY_API_KEY` ou `FIREBASE_SERVICE_ACCOUNT_JSON` dans le repo. Utilisez uniquement les variables d'environnement de Render.

## Déploiement sur Render

1. Créez un **Web Service** sur Render.
2. Connectez votre repository Git.
3. Configurez :
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
4. Renseignez les variables d'environnement ci-dessus.
5. Déployez.

Une fois déployé, notez l'URL de l'API (ex : `https://karbonn-abby-api.onrender.com`).

## Configuration du frontend

Dans `intranet.js`, remplacez l'URL du backend :

```js
const API_BASE_URL = 'https://votre-url-render.onrender.com';
```

## Synchronisation des clients existants

Dans l'intranet, ouvrez la section **Facturation & Devis** et cliquez sur **Synchroniser clients Abby**. Cela envoie tous les clients existants vers Abby et enregistre les `abbyCustomerId` dans Firestore.

## Synchronisation automatique

Chaque nouveau client créé dans la section **Clients** est automatiquement synchronisé avec Abby après sa création dans Firestore.

> **Adresse client** : pour créer un devis ou une facture, Abby exige une adresse complète (rue, code postal, ville). Vérifiez l'adresse du client avant de créer un document.

## Endpoints API

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/sync-client` | Synchronise un client vers Abby |
| POST | `/api/sync-all-clients` | Synchronise tous les clients existants |
| POST | `/api/create-estimate` | Crée un devis |
| POST | `/api/create-invoice` | Crée une facture |
| DELETE | `/api/client/:id` | Supprime un client (Abby + Firestore) |
| PATCH | `/api/billing/:id/finalize` | Finalise un document |
| PATCH | `/api/billing/:id/sign` | Signe un devis |
| PATCH | `/api/billing/:id/unsign` | Annule la signature |
| PATCH | `/api/billing/:id/refuse` | Refuse un devis |
| PATCH | `/api/billing/:id/unrefuse` | Annule le refus |
| PATCH | `/api/billing/:id/mark-paid` | Marque une facture payée |
| PATCH | `/api/billing/:id/mark-unpaid` | Marque une facture non payée |
| GET | `/api/billing/:id/download` | Retourne le lien PDF |
| GET | `/api/billing/:id/status` | Retourne l'état du document |

## Sécurité

- Tous les endpoints `/api` nécessitent un token Firebase valide.
- Seuls les utilisateurs ayant le rôle `Manager` dans Firestore peuvent accéder aux endpoints.
- La clé API Abby reste côté serveur et n'est jamais exposée au navigateur.
