# Mise en ligne sur Cloudflare Workers

Hoshi Club tourne sur Cloudflare Workers, avec une base **D1** (SQLite) partagée par toutes les
boutiques et une **tâche horaire** (Cron Trigger) pour les anniversaires et l'expiration des points.
Adresse : `https://hoshi-club.hoshi-technologies.workers.dev` (même compte et même sous-domaine
que Hoshi Factures).

## Offre gratuite ou payante ?

- **Développement et tests** : gratuit. `shopify app dev` fait tourner l'appli sur votre PC avec
  le même moteur que Cloudflare (workerd) et une base D1 locale.
- **Production** : le Worker (≈ 1,3 Mo compressé) tient dans l'offre gratuite, mais l'offre
  **Workers Paid (5 $/mois)**, déjà utilisée pour Hoshi Factures, est conseillée pour une appli
  publique (plus de temps de calcul par requête et de requêtes par jour).

## Première mise en ligne (Windows, invite de commandes)

Dans le dossier de l'appli (`shopify-loyalty`) :

1. **Installer les dépendances et créer l'appli chez Shopify** (si ce n'est pas déjà fait) :
   ```
   npm install
   shopify app config link
   ```
   Choisissez « Créer une nouvelle appli » et nommez-la **Hoshi Club**. Copiez ensuite le
   `client_id` affiché dans `shopify.app.toml` vers `SHOPIFY_API_KEY` dans `wrangler.jsonc`.
2. **Se connecter à Cloudflare** :
   ```
   npx wrangler login
   ```
3. **Créer la base de données** :
   ```
   npx wrangler d1 create hoshi-club
   ```
   puis reporter le `database_id` affiché dans `wrangler.jsonc`, et créer les tables :
   ```
   npm run db:migrate:remote
   ```
4. **Enregistrer le secret Shopify** (la commande demande la valeur) :
   ```
   npx wrangler secret put SHOPIFY_API_SECRET
   ```
   `SHOPIFY_API_SECRET` : tableau de bord développeur Shopify › Hoshi Club › Paramètres › Secret client.
5. **Publier** :
   ```
   npm run deploy:worker
   ```
   L'adresse affichée doit être `https://hoshi-club.hoshi-technologies.workers.dev`
   (déjà renseignée dans `wrangler.jsonc` et `shopify.app.toml`).
6. **Envoyer la configuration à Shopify** (URL, webhooks, proxy d'appli, extension de thème) :
   ```
   shopify app deploy
   ```
7. **Facturation** : `BILLING_REQUIRED = "true"` dans `wrangler.jsonc` (déjà le cas). Les
   boutiques de développement, dont celles des testeurs de Shopify, reçoivent un abonnement de
   test, jamais facturé. La formule (29 $/mois, 14 jours d'essai) se règle dans le tableau de bord
   Shopify › Hoshi Club › Distribution › Tarification gérée.

## Mises à jour

```
npm run db:migrate:remote   # seulement si de nouveaux fichiers sont apparus dans migrations/
npm run deploy:worker
shopify app deploy          # seulement si shopify.app.toml ou l'extension de thème ont changé
```

## Vérifier

- `https://hoshi-club.hoshi-technologies.workers.dev/` affiche la page de présentation, et
  `/privacy` la politique de confidentialité.
- Tableau de bord Cloudflare › Workers › hoshi-club › Journaux : requêtes et erreurs en direct
  (ou `npx wrangler tail`).
- Tableau de bord Cloudflare › Workers › hoshi-club › Déclencheurs : la tâche horaire.

## Sauvegardes

D1 conserve automatiquement l'historique des 30 derniers jours (« Time Travel ») :
```
npx wrangler d1 time-travel info hoshi-club
npx wrangler d1 time-travel restore hoshi-club --timestamp=2026-11-03T10:00:00Z
```
