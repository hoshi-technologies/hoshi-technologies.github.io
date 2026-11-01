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
- **Factur-X (EN 16931)** : chaque PDF est un PDF/A-3 qui embarque le fichier
  `factur-x.xml`, lisible par les logiciels comptables et les plateformes de facturation
  électronique (voir ci-dessous).
- **7 langues** : français, anglais, allemand, espagnol, italien, néerlandais, portugais
  (Brésil), pour la facture, l'e-mail, la page publique et l'interface d'administration.
- **Historique** des factures émises, téléchargement du PDF, statut d'envoi.
- **Aperçu** du PDF avec une commande fictive avant d'enregistrer les réglages.
- **RGPD** : webhooks obligatoires de Shopify (`customers/data_request`, `customers/redact`,
  `shop/redact`) gérés.

## Informations d'entreprise remplies automatiquement

- **Depuis Shopify** (à l'installation, et bouton « Reprendre les infos de Shopify ») :
  raison sociale et adresse légale de l'entité principale (`businessEntity`), sinon nom
  et adresse de la boutique ; e-mail de contact, téléphone, site, pays, fuseau horaire.
  Une valeur déjà saisie n'est jamais écrasée à l'installation.
- **Shopify ne fournit ni SIRET ni n° de TVA.** Pour les entreprises françaises, la
  recherche « Remplissage automatique » interroge le registre officiel SIRENE via l'API
  publique et gratuite [Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr)
  (sans clé) : par SIRET, SIREN ou nom + ville. Elle remplit raison sociale, adresse du
  siège, SIRET, forme juridique et n° de TVA intracommunautaire (calculé depuis le SIREN).
  Le capital social et la ville du RCS ne sont pas fournis par l'API : à compléter à la main.
- Rien n'est enregistré automatiquement : le marchand vérifie puis clique sur Enregistrer.
- Le serveur de l'appli doit pouvoir joindre `recherche-entreprises.api.gouv.fr`. Le format
  de réponse a été codé d'après la documentation de l'API et testé avec des réponses
  simulées : à vérifier sur l'API réelle avant la mise en production.

## Interface et aide

- **4 onglets** : Accueil (checklist de démarrage en 3 étapes, état de l'appli, dernières
  factures), Réglages, Abonnement, Aide.
- **Réglages en deux niveaux** : l'essentiel visible (entreprise, envoi), le reste replié
  (informations complémentaires, numérotation et langue, Factur-X, apparence, e-mail,
  lien Shopify). Barre « Modifications non enregistrées » avec Enregistrer / Annuler.
- **Guide utilisateur** en 10 chapitres (installation, entreprise, apparence, envoi, lien
  Shopify, suivi au quotidien, numérotation et langues, Factur-X, abonnement, bonnes
  pratiques), avec étapes numérotées et conseils, dans les 7 langues :
  - dans l'onglet Aide de l'appli (et lien depuis la checklist de démarrage) ;
  - en page publique `/guide?lang=fr`, avec sommaire, imprimable ou enregistrable en PDF.
  Textes dans `src/i18n/guide/` ; les libellés cités correspondent exactement à l'interface.
- **FAQ complète** (22 questions en 6 thèmes : démarrer, obligations légales, Factur-X,
  langues, abonnement, problèmes) dans les 7 langues, avec recherche :
  - dans l'onglet Aide de l'appli ;
  - en page publique `/faq?lang=fr` (langue du navigateur par défaut), à indiquer comme
    lien d'aide dans la fiche App Store.
  Les prix et quotas affichés viennent de `src/plans.js` ; la question « Comment contacter
  le support ? » n'apparaît que si `SUPPORT_EMAIL` est configuré. Textes dans `src/i18n/faq/`.

## Formules et abonnement

| Formule | Prix | Factures | Essai |
|---|---|---|---|
| Gratuit | 0 $ | 10 par mois | – |
| Essentiel | 7,90 $ / mois | 200 par mois | 7 jours |
| Illimité | 12,90 $ / mois | illimitées | 7 jours |

- Le paiement passe par la **Billing API de Shopify** (obligatoire sur l'App Store) : le
  marchand valide l'abonnement sur une page Shopify et le retrouve sur sa facture Shopify.
  Prix en dollars US, la devise des applis de l'App Store.
- Le quota se compte par **mois civil** (factures émises depuis le 1er du mois, UTC).
- Quota atteint : les nouvelles commandes sont **mises en attente** (pas de facture ni
  d'e-mail) et le marchand est prévenu par e-mail une fois par mois. Après être passé à une
  formule supérieure, ou le mois suivant, le bouton « Générer leurs factures » les facture.
- La formule est synchronisée à l'ouverture de l'appli et par le webhook
  `app_subscriptions/update` ; Shopify annule l'abonnement à la désinstallation.
- `BILLING_TEST=true` crée des abonnements de test (aucun prélèvement), obligatoire sur les
  boutiques de développement : **à passer à `false` en production**.
- Prix et quotas se modifient dans `src/plans.js`.

Positionnement face à la concurrence (fiches App Store, fin 2026) :

| Appli | Gratuit | Payant |
|---|---|---|
| Sufio | – | 7 $ / 15 factures, 19 $ / 50, 49 $ / 5 000 |
| ZenFisc Factures France | – | 9,99 $ / 50 |
| MiniFacture | 10 / mois | 14 $ / 200 (Factur-X) |
| Facturio | 10 / mois | 14,90 $ illimité (Factur-X) |
| FF Factures Client en France | 20 / mois | 19 $ illimité (Factur-X) |
| Order Printer Pro | 50 / mois | 10 $ / 500 |

Les concurrents français proposent presque tous **Factur-X** : c'est désormais aussi le
cas de l'appli, ce qui permettrait de remonter les prix vers ceux du marché.

Aperçu d'une facture : `npm run preview` génère `apercu-facture.pdf`.

## Factur-X

- Profil **EN 16931** (syntaxe CII), PDF/A-3b avec polices embarquées (Liberation Sans,
  licence SIL OFL, dans `assets/fonts/`), XML joint en relation « Alternative » et
  métadonnées XMP Factur-X.
- Produit automatiquement dès que la raison sociale, l'adresse, le pays et le n° de TVA
  (ou, en franchise de TVA, le SIRET) sont renseignés ; sinon la facture reste un PDF
  simple et l'admin indique ce qui manque.
- Conforme aux règles françaises de la réforme 2026 (schematron BR-FR) : SIREN du vendeur,
  cadre de facturation (B1/B2 biens, S1/S2 services, M1/M2 mixte selon le réglage « Vous
  vendez » et le paiement), mentions codées pénalités (PMD), indemnité de 40 € (PMT) et
  escompte (AAB), date d'échéance.
- La TVA est calculée par taux sur le total HT (règle BR-CO-17) ; l'écart d'arrondi de
  Shopify (calcul ligne par ligne) est reporté sur une ligne, sans jamais changer le TTC payé.
- Validation effectuée sur 12 cas (prix TTC et HT, arrondis, micro-entreprise, commande
  impayée, client sans adresse, 7 langues) avec la bibliothèque Python `factur-x` : XSD
  officiel + schematron EN 16931 + schematron français BR-FR, **0 erreur**. La conformité
  PDF/A elle-même n'a pas été vérifiée par veraPDF.

  ```sh
  pip install factur-x saxonche
  npm run preview -- facture.pdf fr
  python scripts/validate-facturx.py facture.pdf
  ```

## Langues

- **Interface d'administration** : dans la langue de l'administrateur Shopify (paramètre
  `locale` transmis par Shopify), anglais par défaut.
- **Factures et e-mails** : dans la langue du client (`customer_locale` de la commande),
  sinon dans la langue de repli choisie ; ou une langue fixe pour toutes les factures.
- Les textes laissés vides (mentions, remerciement, objet et corps de l'e-mail) utilisent le
  texte par défaut traduit ; un texte personnalisé est utilisé tel quel dans toutes les langues.
- Variables d'e-mail : `{{first_name}}`, `{{name}}`, `{{invoice_number}}`, `{{order}}`,
  `{{shop}}` (les anciens noms `{{prenom}}`, `{{numero_facture}}`… restent acceptés).
- Japonais, chinois et coréen ne sont pas encore proposés : il faudrait embarquer une police
  CJK de plus de 10 Mo. Ajouter une langue latine = un fichier dans `src/i18n/`, un test
  vérifie qu'il a toutes les clés.

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
  pdf.js        mise en page A4 PDF/A-3 (pdfkit), multi-pages, Factur-X embarqué
  facturx.js    XML Factur-X EN 16931 (CII) et métadonnées XMP
  docs-page.js  pages publiques du guide et de la FAQ
  company-lookup.js  recherche d'entreprise dans le registre SIRENE
  i18n/         traductions (fr, en, de, es, it, nl, pt-BR)
  mailer.js     e-mail HTML + texte, PDF en pièce jointe (nodemailer)
  plans.js      formules d'abonnement (prix, quotas, essai)
  shopify.js    signature des webhooks, jetons de session, échange de jeton, Billing API
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
- SIREN et n° de TVA du client professionnel dans le Factur-X (B2B).
- Japonais / chinois / coréen (police CJK).
- Fiche App Store (politique de confidentialité, captures d'écran).
