# Fiche App Store : Hoshi Factures

Textes prêts à coller dans le formulaire de la fiche (Partner Dashboard › Applis › Distribution
› Fiche de l'App Store). Les longueurs ont été vérifiées par rapport aux limites habituelles du
formulaire (nom 30, introduction 100, description 500, fonctionnalités 80 caractères) : le
formulaire affiche les limites exactes en vigueur.

## Français (langue principale)

**Nom de l'appli** (30 caractères)
> Hoshi Factures: PDF & Factur-X

**Introduction** (97 caractères)
> Factures PDF conformes créées et envoyées à chaque commande. Prêtes pour la facture électronique.

**Description** (419 caractères)
> Chaque commande payée reçoit sa facture PDF numérotée, envoyée au client par e-mail au nom de
> votre boutique. Mentions légales, TVA par taux, remises, frais de port et micro-entreprise sont
> gérés. Chaque facture est aussi au format Factur-X (EN 16931), prête pour la réforme de la
> facture électronique. Votre entreprise est remplie automatiquement depuis Shopify et le registre
> SIRENE. 7 langues, guide et FAQ intégrés.

**Fonctionnalités**
1. Facture PDF créée et envoyée au client à chaque commande
2. Numérotation continue, TVA par taux, mentions légales françaises
3. Factur-X EN 16931 validé : prêt pour la facture électronique
4. SIRET, adresse et n° de TVA remplis depuis le registre officiel
5. Factures et e-mails en 7 langues, selon la langue du client

**Termes de recherche** : facture, facture PDF, Factur-X, facture électronique, TVA

## English

**App name** (30 characters)
> Hoshi Factures: PDF & Factur-X

**Introduction** (82 characters)
> Compliant PDF invoices created and emailed for every order. Ready for e-invoicing.

**Details** (413 characters)
> Every paid order gets a numbered PDF invoice, emailed to the customer on behalf of your store.
> Legal details, VAT by rate, discounts, shipping and VAT-exempt small businesses are handled.
> Each invoice is also a Factur-X e-invoice (EN 16931), ready for the French e-invoicing reform.
> Business details are filled in automatically from Shopify (and the French business register).
> 7 languages, built-in guide and FAQ.

**Features**
1. PDF invoice created and emailed to the customer for every order
2. Gap-free numbering, VAT by rate, French and EU legal details
3. Validated Factur-X EN 16931: ready for e-invoicing
4. Business details auto-filled from Shopify and the official register
5. Invoices and emails in 7 languages, in the customer’s language

**Search terms**: invoice, PDF invoice, Factur-X, e-invoicing, VAT invoice

## Autres champs

| Champ | Valeur |
|---|---|
| Catégorie | Commandes et expédition › Factures et reçus (à confirmer dans la liste du formulaire) |
| Tarification | Gratuit : 10 factures/mois · Essentiel : 7,90 $/mois, 200 factures · Illimité : 12,90 $/mois · essai de 7 jours |
| Langues de l'appli | Français, anglais, allemand, espagnol, italien, néerlandais, portugais (Brésil) |
| Politique de confidentialité | https://hoshi-technologies.github.io/factures-pdf/confidentialite.html (EN : `privacy.html`) |
| Conditions d'utilisation | https://hoshi-technologies.github.io/factures-pdf/conditions.html (EN : `terms.html`) |
| Page de l'appli | https://hoshi-technologies.github.io/factures-pdf/ |
| Guide (FAQ / documentation) | https://hoshi-technologies.github.io/factures-pdf/aide/guide-fr.html |
| FAQ | https://hoshi-technologies.github.io/factures-pdf/aide/faq-fr.html |
| E-mail de support | à compléter (même adresse que `SUPPORT_EMAIL`) |
| Captures d'écran (1600 × 900) | `docs/app-store/fr/` et `docs/app-store/en/` : accueil, réglages, facture, abonnement, aide |
| Icône (1200 × 1200) | à créer |
| Vidéo de démonstration | facultative : 30 à 60 s, installation → commande → facture reçue |

Les captures se régénèrent avec `npm run screenshots`, le site avec `npm run site`.

## Instructions de test pour l'équipe de vérification Shopify

À coller dans le champ « Instructions de test » (en anglais, langue des vérificateurs) :

> 1. Install the app on the review store and open it (Apps › Hoshi Factures).
> 2. Settings tab: business details are pre-filled from the store. For a French company, type a
>    SIRET (e.g. 40483304800022) in “Auto-fill”, click “Search” then “Use”, and click “Save”.
> 3. Click “Preview PDF” to download a sample invoice.
> 4. Enable the Bogus test gateway and place an order paid with card number “1”.
>    The invoice appears on the Home tab within seconds; click “PDF” to download it.
>    The customer email is sent with the PDF attached (and a copy to the store email).
> 5. Plan tab: choose “Essential” to test billing (test charge, 7-day trial), then “Cancel”.
> 6. Help tab: user guide and FAQ. Public pages: /guide and /faq on the app domain.
> The app only needs read access to orders. GDPR webhooks are implemented.

## Avant d'envoyer la fiche

- [ ] Appli hébergée en production (HTTPS), `BILLING_TEST=false`, `SUPPORT_EMAIL` renseigné
- [ ] Informations de l'éditeur complétées puis `npm run site` relancé (plus aucun texte surligné)
- [ ] Politique de confidentialité et conditions relues par un juriste
- [ ] Accès aux données client protégées demandé (nom, e-mail, adresse) avec la justification :
      « Le nom, l'adresse et l'e-mail de l'acheteur figurent obligatoirement sur la facture et
      l'e-mail sert à lui envoyer sa facture. »
- [ ] Test complet sur une boutique de développement (voir README, « Tester l'appli »)
- [ ] Icône 1200 × 1200 et, si possible, vidéo de démonstration
- [ ] `APP_STORE_URL` renseigné et site régénéré une fois l'appli publiée
