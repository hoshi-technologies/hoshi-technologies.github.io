# Mise en ligne sur Cloudflare Workers

L'appli tourne sur Cloudflare Workers, avec un **Durable Object par boutique** (base SQLite
isolée, chiffrée par l'appli, restaurable à n'importe quel instant des 30 derniers jours grâce à
la récupération à un instant donné de Cloudflare) et un Durable Object « annuaire » pour les
liens de téléchargement des factures.

## Offre gratuite ou payante ?

- **Développement et tests** : gratuit. `npx wrangler dev` fait tourner l'appli sur votre PC
  avec le même moteur que Cloudflare, sans limite.
- **Production** : offre **Workers Paid (5 $/mois)** indispensable. L'offre gratuite limite
  chaque requête à 10 ms de calcul ; créer une facture PDF en demande environ 100 à 200 ms
  (mesuré), elle échouerait.

## Première mise en ligne (Windows, invite de commandes)

Dans le dossier du dépôt `hoshi-factures` :

1. **Se connecter à Cloudflare**
   ```
   npx wrangler login
   ```
2. **Choisir l'adresse de l'appli** : à la première publication, Cloudflare donne une adresse
   `https://hoshi-factures.<votre-sous-domaine>.workers.dev`. Publier une première fois :
   ```
   npx wrangler deploy
   ```
   puis reporter l'adresse affichée dans `wrangler.toml` (`SHOPIFY_APP_URL`) et dans
   `shopify.app.toml` (`application_url` et `redirect_urls`).
3. **Enregistrer les secrets** (chaque commande demande la valeur) :
   ```
   npx wrangler secret put SHOPIFY_API_SECRET
   npx wrangler secret put DATA_ENCRYPTION_KEY
   npx wrangler secret put BREVO_API_KEY
   ```
   - `SHOPIFY_API_SECRET` : tableau de bord développeur Shopify › Hoshi Factures › Paramètres
     › Secret client.
   - `DATA_ENCRYPTION_KEY` : générer avec `npm run key`, **et en garder une copie hors ligne**.
   - `BREVO_API_KEY` : Brevo › SMTP et API › Clés API.
4. **Renseigner `MAIL_FROM`** (adresse d'expédition validée dans Brevo) et `SUPPORT_EMAIL` dans
   `wrangler.toml`, puis republier : `npx wrangler deploy`.
5. **Envoyer la configuration à Shopify** (URL, webhooks) :
   ```
   shopify app deploy
   ```
6. **Production** : passer `BILLING_TEST = "false"` dans `wrangler.toml` au moment de la mise
   en vente, puis `npx wrangler deploy`.

## Vérifier

- `https://<adresse>/health` répond `{"ok":true}`.
- Dans le tableau de bord Cloudflare › Workers › hoshi-factures › Journaux : les requêtes et
  erreurs en direct.
- `npm run test:worker` rejoue en local un scénario complet (commande signée, facture,
  Factur-X, lien public, journal des accès, chiffrement au repos).

## Sauvegardes et restauration

- Les Durable Objects SQLite de Cloudflare conservent l'historique des 30 derniers jours :
  une boutique peut être restaurée à un instant précis (fonction « point-in-time recovery »
  de l'API Durable Objects). Les données y sont chiffrées par l'appli (AES-256-GCM) en plus du
  chiffrement de Cloudflare.
- Procédure en cas d'incident : voir `docs/securite/politique-incidents.md`.
