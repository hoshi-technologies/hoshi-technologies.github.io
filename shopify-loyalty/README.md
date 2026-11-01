# Hoshi Fidélité – application Shopify de programme de fidélité

Application Shopify intégrée à l'administration permettant de lancer un
programme de fidélité complet en quelques minutes : points, paliers VIP,
récompenses et widget sur la boutique.

![Widget sur la boutique](docs/widget.png)

## Fonctionnalités

**Pour le marchand (administration Shopify, Polaris)**

| Page | Rôle |
| --- | --- |
| Tableau de bord | Statistiques (membres, points distribués/échangés, récompenses), activité récente, liste « Bien démarrer » |
| Membres | Recherche, tri, import des clients existants en un clic, fiche client avec historique, ajustement manuel du solde, envoi d'une récompense |
| Récompenses | Montant fixe, pourcentage ou livraison offerte ; coût en points, minimum de commande, masquer/afficher |
| Paliers VIP | Bronze / Argent / Or… selon les points cumulés, avec multiplicateur de points |
| Réglages | Activation, points par euro, bonus de bienvenue et de première commande, couleur/titre/position du widget avec **aperçu en direct** |

Un programme prêt à l'emploi (3 paliers, 3 récompenses) est créé à la première ouverture.

**Pour les clients (extension de thème)**

- *Intégration d'application* « Fidélité Hoshi » : bouton flottant + panneau (solde, palier, progression, récompenses, codes obtenus).
- *Bloc d'application* « Carte fidélité » à placer dans n'importe quelle page.
- Échange en un clic : un code de réduction **personnel, à usage unique** est créé et peut être appliqué directement au panier.

**Automatique**

| Événement | Effet |
| --- | --- |
| `customers/create` | Création du membre + bonus de bienvenue |
| `orders/paid` | Points = sous-total × taux × multiplicateur du palier (+ bonus 1re commande) |
| `refunds/create` | Retrait proportionnel des points (plafonné à ce que la commande a rapporté) |
| Webhooks RGPD | Export / suppression des données client et boutique |

Tous les webhooks sont idempotents : un webhook rejoué ne crédite jamais deux fois.

## Architecture

```
app/
  loyalty.server.ts        logique métier (points, paliers, échanges, stats)
  routes/app.*.tsx         pages d'administration (Polaris web components)
  routes/webhooks.*.tsx    webhooks Shopify
  routes/proxy.$.tsx       API du widget via le proxy d'application (/apps/fidelite/loyalty)
extensions/loyalty-widget  extension de thème (Liquid + JS/CSS sans dépendance)
prisma/schema.prisma       Program, Member, Transaction, Reward, Tier, Redemption
```

Stack : React Router 7, `@shopify/shopify-app-react-router`, Polaris web components, Prisma (SQLite par défaut).

## Installation

Prérequis : Node.js ≥ 22.12, un [compte Partenaire Shopify](https://partners.shopify.com) et une boutique de développement.

```bash
cd shopify-loyalty
npm install
npm run config:link     # crée/associe l'application dans votre compte Partenaire
npm run dev             # lance l'app, le tunnel et l'extension de thème
```

Appuyez sur `p` pour ouvrir l'application dans votre boutique de test, puis :

1. Ouvrez **Réglages** pour ajuster le taux de points et la couleur.
2. Dans le tableau de bord, cliquez sur **Ouvrir l'éditeur de thème** et activez
   « Fidélité Hoshi » dans *Intégrations d'applications*.
3. Passez une commande test avec un compte client : les points apparaissent.

### Accès aux données client protégées

Les webhooks `orders/paid` et `customers/create` contiennent des données
personnelles. Dans le Partner Dashboard → *API access* → **Protected customer
data access**, demandez l'accès (nom, e-mail) avant de passer en production.
En développement sur une boutique de test, l'accès de niveau 1 suffit.

## Mise en production

1. Hébergez l'app (Fly.io, Render, Railway, Google Cloud Run…) avec le `Dockerfile` fourni.
2. Pour plusieurs instances, passez Prisma sur PostgreSQL ou MySQL (`prisma/schema.prisma`, `provider`), puis régénérez la migration.
3. Variables d'environnement : `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES=read_customers,read_orders,write_discounts`.
4. Mettez à jour `application_url`, `redirect_urls` et `app_proxy.url` dans `shopify.app.toml`, puis `npm run deploy`.

## Commandes utiles

| Commande | Description |
| --- | --- |
| `npm run dev` | Développement avec la CLI Shopify |
| `npm run build` | Build de production |
| `npm run typecheck` | Vérification TypeScript |
| `npm run deploy` | Publie la configuration et l'extension de thème |
| `npx prisma studio` | Explorer la base de données |
