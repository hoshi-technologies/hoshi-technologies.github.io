# Publier Hoshi Club sur l'App Store Shopify

Ce guide liste ce qui est prêt dans le code, ce qu'il reste à faire dans le Partner Dashboard,
le tarif retenu, et les textes à copier-coller pour la fiche et la validation.

## 1. État de préparation

| Exigence Shopify | État |
| --- | --- |
| App intégrée à l'admin (App Bridge, jetons de session) | ✅ |
| Installation et OAuth sans saisie manuelle du domaine | ✅ (formulaire masqué en production) |
| Facturation via l'API Shopify | ✅ tarification gérée (à configurer, voir §2) |
| Webhooks RGPD obligatoires (`customers/data_request`, `customers/redact`, `shop/redact`) | ✅ |
| Nettoyage à la désinstallation (`app/uninstalled`) | ✅ |
| Intégration au thème par extension (pas de modification du code du thème, pas de ScriptTag) | ✅ |
| Application traduite (36 langues de l'admin Shopify, droite-à-gauche compris) | ✅ |
| Politique de confidentialité publique, traduite | ✅ `https://VOTRE-DOMAINE/privacy` |
| Page d'aide / contact, traduite | ✅ `https://VOTRE-DOMAINE/support` (hoshi.technologies@gmail.com) |
| Accès aux données client protégées justifié | ⏳ à demander (§4) |
| Fiche de l'app (textes, captures, icône) | ⏳ à remplir (§3, §5) |
| Hébergement en production (Cloudflare) | ⏳ voir le README, section « Déploiement » |
| Test complet sur une boutique de développement | ⏳ avant soumission |

> Shopify met en avant les applications traduites dans l'App Store et dans l'admin : pensez à
> publier la fiche dans plusieurs langues (au minimum anglais, français, allemand, espagnol,
> japonais) en reprenant les descriptions du §3.

## 2. Tarification

### Concurrence (relevé de novembre 2026)

Sources : comparatifs publiés en 2026 (sites de Joy, 99minds, Charle, Loyalo, Keystone…). Les prix
varient d'une source à l'autre ; vérifiez les fiches App Store avant de publier.

| Application | Gratuit | Formule d'entrée | Niveaux VIP disponibles à partir de |
| --- | --- | --- | --- |
| Smile.io | ~200 commandes/mois | ~15–39 $/mois (volume limité) | **199 $/mois** |
| LoyaltyLion | ~400 commandes/mois | 199 $/mois | **199 $/mois** et plus |
| Yotpo Loyalty | limité | — | ~199 $/mois |
| BON Loyalty | ~150 commandes/mois | ~15–29 $/mois | **129 $/mois** |
| Joy | ~150–250 commandes | ~25–29 $/mois | **129 $/mois** |
| Rivo | ~200 commandes/mois | ~15 $/mois | **49 $/mois** (400 commandes, puis frais par commande) |
| Growave | ~200 commandes/mois | ~15–39 $/mois | formules supérieures |

Constats :
- les versions gratuites sont plafonnées (150 à 400 commandes par mois) ;
- la plupart facturent au **volume de commandes** ;
- les **niveaux VIP** (et souvent le parrainage avancé) sont réservés aux formules à 49–199 $/mois.

### Prix retenu : 29 $/mois, tout compris, 14 jours d'essai

- Hoshi Club inclut **tout** (niveaux VIP avec remises automatiques au paiement, parrainage,
  anniversaire, réseaux sociaux, campagnes bonus, statistiques, 36 langues), **sans limite de
  commandes ni de membres**.
- À 29 $, c'est le prix d'une formule d'entrée chez les concurrents, et **40 % à 85 % moins cher**
  que leurs formules donnant accès aux niveaux VIP (49 à 199 $).
- Un prix unique et sans frais à la commande est facile à comprendre et rassure les marchands
  qui grandissent.
- Nos coûts d'hébergement (Cloudflare) sont très faibles et ne dépendent presque pas du volume :
  la marge reste confortable même pour de grosses boutiques.
- Option conseillée : **290 $/an** (2 mois offerts) proposé en plus du mensuel.

### Configuration (Partner Dashboard)

*Apps → Hoshi Club → Distribution → Shopify App Store → Pricing* : choisissez **Managed pricing**,
puis créez la formule « Hoshi Club » : 29 USD tous les 30 jours, essai de 14 jours (et
éventuellement la variante annuelle à 290 USD).

- Le « handle » de l'app doit correspondre à `SHOPIFY_APP_HANDLE` dans `wrangler.jsonc`
  (`hoshi-club`).
- Le prix affiché sur la page d'accueil est défini dans `app/pricing.ts` : gardez-le identique.
- Les boutiques de développement reçoivent automatiquement des abonnements de test, gratuits.

## 3. Fiche de l'app (textes à copier)

**Nom** : Hoshi Club: Loyalty & Rewards

**Accroche (EN)** : VIP tiers with automatic discounts, points, referrals and birthday rewards.

**Accroche (FR)** : Niveaux VIP avec remises automatiques, points, parrainage et anniversaires.

**Description (EN)**

> Turn one-time buyers into loyal customers with a loyalty program that takes minutes to set up.
> One simple price, everything included, no order limits.
>
> - **Points on every order**, plus welcome, first-order, birthday and social follow bonuses
> - **VIP tiers** earned with points or assigned by you, with **automatic discounts at checkout**
>   (percentage, fixed amount, free shipping) and points multipliers
> - **Rewards** customers redeem for personal, single-use discount codes
> - **Referral program**: friends get a welcome discount, referrers earn points
> - **Bonus campaigns** (double points) and optional points expiration
> - A beautiful **storefront widget** and an "earn X points" badge on product pages
> - **Dashboard** with revenue generated by rewards and referrals
> - **36 languages**: the app follows your admin language, the widget follows your store language

**Description (FR)**

> Transformez vos acheteurs occasionnels en clients fidèles grâce à un programme de fidélité prêt
> en quelques minutes. Un prix unique, tout compris, sans limite de commandes.
>
> - **Des points à chaque commande**, et des bonus de bienvenue, de première commande,
>   d'anniversaire et pour vous suivre sur les réseaux
> - **Des niveaux VIP** atteints avec les points ou attribués par vous, avec des **remises
>   automatiques au paiement** (pourcentage, montant fixe, livraison offerte) et des multiplicateurs
> - **Des récompenses** échangées contre des codes de réduction personnels à usage unique
> - **Le parrainage** : l'ami reçoit une réduction, le parrain gagne des points
> - **Des campagnes bonus** (points doublés) et l'expiration des points en option
> - **Un widget élégant** sur la boutique et un badge « gagnez X points » sur les fiches produit
> - **Un tableau de bord** avec le chiffre d'affaires généré par les récompenses et le parrainage
> - **36 langues** : l'application suit la langue de votre admin, le widget celle de votre boutique

**URLs** : politique de confidentialité `/privacy`, support `/support`, e-mail de support
`hoshi.technologies@gmail.com`.

## 4. Accès aux données client protégées

*Partner Dashboard → API access → Protected customer data access* : sélectionnez
« Protected customer data », puis les champs **Name** et **Email**. Justifications proposées :

| Question | Réponse |
| --- | --- |
| Pourquoi l'app a-t-elle besoin des données client ? | To run the merchant's loyalty program: each customer is a member with a points balance, tier and reward history. |
| Name | Displayed to the merchant in the member list and to the customer in the storefront widget ("Hello Ana"). |
| Email | Lets the merchant search and identify members, and prevents referral abuse (one referral per email, no self-referral). |
| Traitement minimal | Only the fields above are stored; no payment or address data. |
| Conservation | Data is deleted on `customers/redact`, and 48 h after uninstall on `shop/redact`. |
| Chiffrement / sécurité | Hosted on Cloudflare (encryption at rest and in transit); access limited to the app's server. |

## 5. Éléments visuels

- **Icône** 1200 × 1200 px (étoile ★ sur fond violet `#5C6AC4`, cohérent avec l'app).
- **Captures** 1600 × 900 px (3 à 6) : tableau de bord, niveaux clients, fiche membre, réglages
  avec aperçu, widget sur la boutique (`docs/widget.png`), fenêtre de parrainage
  (`docs/parrainage.png`). Faites-en aussi dans d'autres langues pour les fiches traduites.
- Vidéo de démonstration facultative mais recommandée (1 à 2 minutes).

## 6. Instructions pour l'équipe de validation

À coller dans le champ « Testing instructions » :

> 1. Install the app; you will be asked to start the free trial (managed pricing).
> 2. Open the app: a ready-to-use program is created (3 tiers, 3 rewards), in your admin language.
> 3. Online Store → Themes → Customize → App embeds: enable "Hoshi Club". Optionally add the
>    "Product points" block to the product template.
> 4. On the storefront, create a customer account: the widget shows the welcome bonus.
> 5. Place a test order with that customer: points are credited when the order is paid.
> 6. In the widget, redeem "Free shipping" (300 points): a personal discount code is created.
> 7. In the app, Members → open the customer → assign the "Gold" tier: an automatic discount for
>    that tier is created in Discounts and applies at checkout.
> 8. Change your admin language (or the store language): the app and the widget follow it.

## 7. Avant de soumettre

- [ ] App déployée sur Cloudflare avec un domaine définitif, `npm run deploy` exécuté
- [ ] Tarification gérée configurée (29 $/mois, 14 jours d'essai), essai testé sur une boutique de développement
- [ ] Accès aux données protégées accordé
- [ ] Parcours complet testé (§6), y compris désinstallation puis réinstallation
- [ ] Boîte hoshi.technologies@gmail.com surveillée
- [ ] Fiche, captures et icône prêtes (dans plusieurs langues)
