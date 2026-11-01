# Factures PDF : appli Shopify

Une facture PDF numérotée est créée automatiquement à chaque commande et envoyée au client
par e-mail, en pièce jointe. Le marchand règle tout depuis l'administration Shopify
(appli intégrée) : informations légales, logo, couleur, texte de l'e-mail, numérotation.

## Fonctionnalités

- **Facture à chaque commande** : au paiement (par défaut) ou dès la création de la commande.
- **Numérotation continue et chronologique** (`F-2026-00001`, `F-2026-00002`…), sans trou
  ni doublon, même si Shopify renvoie plusieurs fois le même webhook. Le compteur peut être
  avancé (reprise d'une numérotation existante) mais jamais reculé.
- **Calcul HT / TVA / TTC** au centime, à partir des montants de Shopify : prix TTC ou HT,
  remises (codes promo, remises automatiques), frais de livraison, plusieurs taux de TVA
  (récapitulatif par taux), articles retirés de la commande ignorés.
- **Mentions légales** : raison sociale, forme juridique et capital, adresse, SIRET, RCS,
  n° de TVA, mention « TVA non applicable, art. 293 B du CGI » pour les micro-entreprises,
  conditions de paiement et pénalités de retard, « Facture acquittée » si la commande est payée.
- **E-mail au client** avec le PDF en pièce jointe (objet et message personnalisables),
  copie cachée au marchand pour ses archives, bouton « Renvoyer » dans l'admin.
- **Lien de téléchargement** à coller dans la notification « Confirmation de commande » de
  Shopify (code Liquid fourni dans l'admin) : le client retrouve aussi sa facture depuis
  l'e-mail habituel de la boutique.
- **Historique** des factures émises, téléchargement du PDF, statut d'envoi.
- **Aperçu** du PDF avec une commande fictive avant d'enregistrer les réglages.
- **RGPD** : webhooks obligatoires de Shopify (`customers/data_request`, `customers/redact`,
  `shop/redact`) gérés.

Aperçu d'une facture : `npm run preview` génère `apercu-facture.pdf`.

## Pourquoi un e-mail séparé ?

Les notifications natives de Shopify (confirmation de commande, etc.) **n'acceptent pas de
pièce jointe**, et une appli ne peut pas les modifier. L'appli envoie donc son propre e-mail,
avec le PDF attaché, via un fournisseur SMTP. En complément, le code Liquid fourni ajoute un
bouton « Télécharger ma facture » dans la confirmation de commande de Shopify.

## Architecture

```
src/
  server.js     serveur Express : webhooks, API de l'admin, lien public /f/<jeton>
  service.js    création de la facture (file d'attente → numérotation sans trou) et envoi
  invoice.js    commande Shopify → lignes HT, remises, TVA par taux, totaux (centimes)
  pdf.js        mise en page A4 (pdfkit), multi-pages, pied de page légal
  mailer.js     e-mail HTML + texte, PDF en pièce jointe (nodemailer)
  shopify.js    signature des webhooks, jetons de session App Bridge, échange de jeton
  db.js         SQLite intégré à Node (aucune dépendance native)
  settings.js   réglages par boutique et valeurs par défaut
public/admin.html  interface intégrée à l'admin Shopify (App Bridge)
shopify.app.toml   configuration Shopify CLI : droits, webhooks
```

Trois dépendances seulement : `express`, `pdfkit`, `nodemailer`. Node 22.5 ou plus.

L'installation est **gérée par Shopify** (pas d'écran OAuth à coder) : à la première ouverture
de l'appli, le jeton de session App Bridge est échangé contre un jeton d'accès hors ligne, et
les réglages sont pré-remplis avec les informations de la boutique (nom, adresse, e-mail).

Les PDF sont stockés tels qu'émis : une facture n'est jamais regénérée après coup, même si
les réglages changent.

## Mise en route

1. **Créer l'appli** dans le [Dev Dashboard Shopify](https://dev.shopify.com/) (ou le
   Partner Dashboard), et noter l'identifiant client et le secret.
2. **Données client protégées** : les webhooks de commande contiennent nom, adresse et
   e-mail du client. Dans le tableau de bord de l'appli, section *Accès aux données client
   protégées*, demander l'accès aux champs **nom, e-mail, adresse** (obligatoire, sinon
   Shopify n'envoie pas les webhooks de commande en production).
3. **Configurer** : copier `.env.example` en `.env` et le remplir ; dans
   `shopify.app.toml`, renseigner `client_id` et remplacer `https://factures.exemple.fr`
   par l'URL du serveur.
4. **Déployer le serveur** (HTTPS obligatoire) avec un disque persistant pour la base
   SQLite, par ex. Fly.io, Render, Railway ou un VPS :
   ```sh
   docker build -t factures-pdf .
   docker run -p 3000:3000 -v factures-data:/data --env-file .env factures-pdf
   ```
5. **Publier la configuration** (droits et webhooks) : `shopify app deploy`.
6. **Installer** l'appli sur une boutique de développement, ouvrir *Applis › Factures PDF*,
   compléter les informations légales, puis passer une commande de test.

Développement local : `npm install`, `npm test`, `npm run dev` (avec un tunnel HTTPS, par ex.
`shopify app dev` ou `cloudflared`, pointé sur le port 3000).

## Conformité (France) : à valider avec un expert-comptable

- Mentions obligatoires d'une facture : renseigner toutes les informations légales dans
  l'admin. Pour les clients professionnels, le numéro de TVA et le SIREN du client ne sont
  pas encore repris (voir « Prochaines étapes »).
- **Conservation** : les factures doivent être conservées 10 ans. L'appli les garde tant
  qu'elle est installée, mais une demande d'effacement RGPD ou la désinstallation (après
  48 h, `shop/redact`) les supprime de l'appli : la copie cachée envoyée au marchand lui
  sert d'archive. Prévoir un export (voir ci-dessous) avant une mise en production large.
- **Facturation électronique** : la réforme impose progressivement la réception (depuis
  septembre 2026) puis l'émission (septembre 2026 pour les grandes entreprises et ETI,
  septembre 2027 pour les PME et micro-entreprises) de factures électroniques **entre
  professionnels**, via une plateforme agréée. Les ventes aux particuliers relèvent du
  *e-reporting*, pas de la facture électronique. Un PDF simple reste adapté au B2C.
- **Remboursements** : une facture émise ne se modifie pas ; un remboursement doit donner
  lieu à un avoir (non géré dans cette première version).

## Prochaines étapes envisagées

- Avoirs automatiques sur remboursement (`refunds/create`).
- Clients professionnels : n° de TVA / SIREN du client (via les attributs de commande ou
  Shopify B2B), autoliquidation intracommunautaire.
- Export ZIP / CSV des factures par période (pour le comptable) et archivage externe.
- Bouton « Télécharger la facture » dans le compte client (extension Customer Account).
- Factures en plusieurs langues selon la langue de la commande.
- Facturation de l'appli (Shopify Billing API) et fiche App Store (politique de
  confidentialité, captures d'écran).
