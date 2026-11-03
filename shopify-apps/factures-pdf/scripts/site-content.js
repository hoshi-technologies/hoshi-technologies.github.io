// Textes du site public de l'appli (page de présentation, confidentialité, conditions).
// Les mentions entre crochets [ … ] sont à compléter : voir COMPANY dans build-site.js.

export const SITE = {
  fr: {
    htmlLang: 'fr',
    nav: { features: 'Fonctionnalités', pricing: 'Tarifs', guide: 'Guide', faq: 'FAQ', install: 'Installer' },
    hero: {
      title: 'Vos factures Shopify, automatiques et conformes.',
      text: 'Une facture PDF numérotée à chaque commande, envoyée à votre client par e-mail. Mentions légales, TVA multi-taux et Factur-X : tout est prêt pour la facture électronique.',
      cta: 'Installer gratuitement',
      secondary: 'Lire le guide',
      note: '{freeLimit} factures par mois offertes, sans carte bancaire.',
    },
    stepsTitle: 'Opérationnel en 3 minutes',
    steps: [
      ['Installez l’appli', 'Depuis l’App Store Shopify, en un clic. L’appli lit vos commandes sans pouvoir les modifier.'],
      ['Vérifiez votre entreprise', 'Nom, adresse, SIRET et n° de TVA sont remplis automatiquement depuis Shopify et le registre officiel des entreprises.'],
      ['C’est tout', 'À chaque commande payée, la facture est créée et envoyée au client. Vous recevez une copie pour vos archives.'],
    ],
    featuresTitle: 'Tout ce qu’il faut, rien de compliqué',
    features: [
      ['Une facture à chaque commande', 'Créée au paiement (ou à la commande), avec une numérotation continue sans trou ni doublon.'],
      ['Envoyée automatiquement', 'Le client reçoit son PDF par e-mail, au nom de votre boutique. Un bouton « Télécharger ma facture » peut aussi s’ajouter à la confirmation Shopify.'],
      ['Conforme', 'Mentions obligatoires, TVA par taux, remises, frais de port, franchise de TVA des micro-entreprises, pénalités de retard.'],
      ['Factur-X (EN 16931)', 'Chaque facture est aussi une facture électronique, validée sans erreur sur les règles européennes et françaises de la réforme.'],
      ['7 langues', 'Factures et e-mails dans la langue du client : français, anglais, allemand, espagnol, italien, néerlandais, portugais.'],
      ['Simple au quotidien', 'Suivi des envois, renvoi en un clic, aperçu avant enregistrement, guide pas à pas et FAQ intégrés.'],
    ],
    reform: {
      title: 'Prêt pour la facture électronique',
      text: 'En France, toutes les entreprises doivent pouvoir recevoir des factures électroniques depuis septembre 2026, et les émettre dès septembre 2026 (grandes entreprises et ETI) ou septembre 2027 (PME et micro-entreprises) pour leurs ventes entre professionnels. Le format Factur-X produit par l’appli est accepté par les plateformes de facturation électronique. Les ventes aux particuliers relèvent du e-reporting, pas de cette obligation.',
    },
    pricingTitle: 'Des tarifs simples',
    pricingNote: 'Facturé par Shopify avec votre abonnement. Sans engagement, résiliable à tout moment.',
    perMonth: '/ mois',
    plans: {
      free: ['Gratuit', '{freeLimit} factures par mois', 'Toutes les fonctionnalités'],
      essentiel: ['Essentiel', '{essentielLimit} factures par mois', '{trialDays} jours d’essai gratuit'],
      illimite: ['Illimité', 'Factures illimitées', '{trialDays} jours d’essai gratuit'],
    },
    faqTitle: 'Questions fréquentes',
    faqMore: 'Toutes les questions',
    footer: { privacy: 'Confidentialité', terms: 'Conditions d’utilisation', contact: 'Contact', by: 'Une appli de' },
  },
  en: {
    htmlLang: 'en',
    nav: { features: 'Features', pricing: 'Pricing', guide: 'Guide', faq: 'FAQ', install: 'Install' },
    hero: {
      title: 'Your Shopify invoices, automatic and compliant.',
      text: 'A numbered PDF invoice for every order, emailed to your customer. Legal details, multi-rate VAT and Factur-X: ready for e-invoicing.',
      cta: 'Install for free',
      secondary: 'Read the guide',
      note: '{freeLimit} free invoices per month, no credit card needed.',
    },
    stepsTitle: 'Up and running in 3 minutes',
    steps: [
      ['Install the app', 'One click from the Shopify App Store. The app reads your orders but can never change them.'],
      ['Check your business details', 'Name, address and registration numbers are filled in automatically from Shopify (and the official register for French companies).'],
      ['That’s it', 'For every paid order, the invoice is created and emailed to the customer. You get a copy for your records.'],
    ],
    featuresTitle: 'Everything you need, nothing complicated',
    features: [
      ['An invoice for every order', 'Created on payment (or when the order is placed), with gap-free sequential numbering.'],
      ['Sent automatically', 'Customers receive their PDF by email, on behalf of your store. A “Download my invoice” button can also be added to the Shopify confirmation.'],
      ['Compliant', 'Mandatory details, VAT by rate, discounts, shipping, VAT-exempt small businesses, late payment terms.'],
      ['Factur-X (EN 16931)', 'Every invoice is also an e-invoice, validated with zero errors against the European and French reform rules.'],
      ['7 languages', 'Invoices and emails in the customer’s language: English, French, German, Spanish, Italian, Dutch, Portuguese.'],
      ['Simple day to day', 'Sending status, one-click resend, preview before saving, built-in step-by-step guide and FAQ.'],
    ],
    reform: {
      title: 'Ready for e-invoicing',
      text: 'In France, all businesses must be able to receive e-invoices since September 2026, and issue them from September 2026 (large and mid-sized companies) or September 2027 (SMEs and micro-businesses) for business-to-business sales. The Factur-X format produced by the app is accepted by e-invoicing platforms. Sales to consumers are covered by e-reporting, not by this obligation.',
    },
    pricingTitle: 'Simple pricing',
    pricingNote: 'Billed by Shopify with your subscription. No commitment, cancel anytime.',
    perMonth: '/ month',
    plans: {
      free: ['Free', '{freeLimit} invoices per month', 'All features included'],
      essentiel: ['Essential', '{essentielLimit} invoices per month', '{trialDays}-day free trial'],
      illimite: ['Unlimited', 'Unlimited invoices', '{trialDays}-day free trial'],
    },
    faqTitle: 'Frequently asked questions',
    faqMore: 'All questions',
    footer: { privacy: 'Privacy', terms: 'Terms of service', contact: 'Contact', by: 'An app by' },
  },
};

// ---------- Politique de confidentialité ----------
// Chaque section : [titre, [paragraphes ou listes]] ; une liste est un tableau de chaînes.
export const PRIVACY = {
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : {date}',
    sections: [
      ['Qui sommes-nous ?', [
        '« {app} » est une application Shopify éditée par {company}, {legal}, dont l’établissement est situé au {address} (SIREN {siren}). Contact : {email}.',
      ]],
      ['Nos rôles au sens du RGPD', [
        'Pour les données des clients de votre boutique (acheteurs), vous êtes responsable de traitement et {company} agit comme sous-traitant (article 28 du RGPD) : nous traitons ces données uniquement pour établir et envoyer vos factures, sur vos instructions.',
        'Pour les données de votre compte marchand (boutique, réglages, abonnement, échanges avec le support), {company} est responsable de traitement.',
      ]],
      ['Données traitées', [[
        'Boutique : adresse myshopify.com, jeton d’accès fourni par Shopify, réglages de l’appli, informations de votre entreprise (raison sociale, adresse, SIRET, n° de TVA, coordonnées, logo).',
        'Commandes : numéro, dates, articles, quantités, prix, remises, taxes, frais de port, statut de paiement, langue, ainsi que le nom, l’adresse et l’e-mail de l’acheteur.',
        'Factures : les PDF émis et leur statut d’envoi.',
        'Données techniques : journaux du serveur (date, boutique, erreurs).',
        'Aucune donnée de carte bancaire : les paiements sont traités exclusivement par Shopify.',
      ]]],
      ['Finalités et bases légales', [[
        'Créer, conserver et envoyer les factures de vos commandes : exécution du contrat qui nous lie.',
        'Respecter les obligations de facturation : obligation légale.',
        'Assurer la sécurité et le bon fonctionnement du service, répondre au support : intérêt légitime.',
      ]]],
      ['Durées de conservation', [[
        'Données de la boutique, commandes et factures : tant que l’appli est installée. À la désinstallation, Shopify nous demande d’effacer vos données : elles le sont automatiquement 48 heures plus tard.',
        'Demandes d’effacement d’un acheteur transmises par Shopify : traitées automatiquement.',
        'Journaux techniques et journal des accès : 12 mois. Sauvegardes : 30 jours. Échanges avec le support : 3 ans après le dernier contact.',
        'Les factures devant être conservées 10 ans par le vendeur, vous recevez une copie de chacune et pouvez les télécharger à tout moment.',
      ]]],
      ['Destinataires et sous-traitants', [[
        'Shopify, plateforme sur laquelle fonctionne l’appli.',
        'Hébergement du service : {host}.',
        'Envoi des e-mails : {mailer}.',
        'API publique « Recherche d’entreprises » de l’État français, uniquement pour la recherche que vous lancez (SIRET ou nom d’entreprise) : aucune donnée d’acheteur n’y est transmise.',
        'Les données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.',
      ], '{transfers}']],
      ['Sécurité', [
        'Échanges chiffrés (HTTPS) ; données personnelles chiffrées au repos (AES-256) ; sauvegardes automatiques chiffrées, conservées 30 jours ; journal des accès aux données, consultable par le marchand et conservé 12 mois ; vérification de l’authenticité de chaque message de Shopify ; accès aux commandes en lecture seule ; accès aux serveurs limité aux personnes habilitées, avec double authentification ; procédure de réponse aux incidents de sécurité.',
      ]],
      ['Vos droits', [
        'Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de vos données. Écrivez-nous à {email}. Les acheteurs exercent leurs droits auprès du marchand, qui peut nous transmettre la demande.',
        'Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).',
      ]],
      ['Cookies et stockage local', [
        'L’appli n’utilise aucun cookie publicitaire ni de mesure d’audience. Elle enregistre dans votre navigateur quelques préférences, sans données personnelles : dernier onglet ouvert, aperçu déjà consulté, date de la dernière demande d’avis.',
      ]],
      ['Modifications', [
        'Nous pouvons mettre à jour cette politique ; la date de mise à jour figure en haut de la page. En cas de changement important, nous vous prévenons par e-mail ou dans l’appli.',
      ]],
    ],
  },
  en: {
    title: 'Privacy policy',
    updated: 'Last updated: {date}',
    sections: [
      ['Who we are', [
        '“{app}” is a Shopify app published by {company}, {legal}, with its business address at {address} (SIREN {siren}). Contact: {email}.',
      ]],
      ['Our roles under the GDPR', [
        'For the data of your store’s customers (buyers), you are the data controller and {company} acts as a processor (GDPR article 28): we only process this data to create and send your invoices, on your instructions.',
        'For your merchant account data (store, settings, subscription, support conversations), {company} is the data controller.',
      ]],
      ['Data we process', [[
        'Store: myshopify.com address, access token provided by Shopify, app settings, your business details (company name, address, registration and VAT numbers, contact details, logo).',
        'Orders: number, dates, items, quantities, prices, discounts, taxes, shipping, payment status, language, and the buyer’s name, address and email.',
        'Invoices: issued PDFs and their sending status.',
        'Technical data: server logs (date, store, errors).',
        'No card data: payments are handled exclusively by Shopify.',
      ]]],
      ['Purposes and legal bases', [[
        'Creating, storing and sending invoices for your orders: performance of our contract.',
        'Complying with invoicing obligations: legal obligation.',
        'Keeping the service secure and running, answering support requests: legitimate interest.',
      ]]],
      ['Retention', [[
        'Store data, orders and invoices: as long as the app is installed. When you uninstall, Shopify asks us to delete your data: it is deleted automatically 48 hours later.',
        'Buyer deletion requests sent by Shopify: handled automatically.',
        'Technical logs and access log: 12 months. Backups: 30 days. Support conversations: 3 years after the last contact.',
        'Sellers must keep invoices for 10 years: you receive a copy of each one and can download them at any time.',
      ]]],
      ['Recipients and processors', [[
        'Shopify, the platform the app runs on.',
        'Service hosting: {host}.',
        'Email delivery: {mailer}.',
        'The French government’s public “Recherche d’entreprises” API, only for searches you run (registration number or company name): no buyer data is sent to it.',
        'Data is never sold, rented or used for advertising.',
      ], '{transfers}']],
      ['Security', [
        'Encrypted connections (HTTPS); personal data encrypted at rest (AES-256); automatic encrypted backups kept for 30 days; access log for personal data, visible to the merchant and kept for 12 months; verification of every message from Shopify; read-only access to orders; server access restricted to authorised staff with two-factor authentication; security incident response procedure.',
      ]],
      ['Your rights', [
        'You have the right to access, rectify, erase, restrict, object to and port your data. Email us at {email}. Buyers exercise their rights with the merchant, who can forward the request to us.',
        'You can lodge a complaint with the French data protection authority, the CNIL (www.cnil.fr), or your local authority.',
      ]],
      ['Cookies and local storage', [
        'The app uses no advertising or analytics cookies. It stores a few preferences in your browser, with no personal data: last tab opened, preview already viewed, date of the last review request.',
      ]],
      ['Changes', [
        'We may update this policy; the update date is shown at the top of the page. For significant changes, we will notify you by email or in the app.',
      ]],
    ],
  },
};

// ---------- Conditions d'utilisation ----------
export const TERMS = {
  fr: {
    title: 'Conditions d’utilisation',
    updated: 'Dernière mise à jour : {date}',
    sections: [
      ['Objet', ['Les présentes conditions encadrent l’utilisation de l’application Shopify « {app} », éditée par {company} ({legal}, SIREN {siren}, {address}), qui crée et envoie des factures PDF pour les commandes de votre boutique.']],
      ['Accès au service', ['L’appli s’installe depuis l’App Store Shopify et nécessite une boutique Shopify active. L’installation vaut acceptation des présentes conditions.']],
      ['Formules et paiement', [
        'La formule Gratuite permet {freeLimit} factures par mois civil. Les formules payantes (Essentiel : {essentielPrice} par mois pour {essentielLimit} factures ; Illimité : {illimitePrice} par mois) sont facturées par Shopify, avec votre abonnement Shopify, après une période d’essai gratuite de {trialDays} jours.',
        'Lorsque la limite mensuelle est atteinte, les nouvelles commandes sont mises en attente ; leurs factures peuvent être générées après un changement de formule ou le mois suivant.',
        'Les prix peuvent évoluer ; tout changement vous est annoncé au moins 30 jours à l’avance et nécessite votre accord dans Shopify.',
      ]],
      ['Résiliation', ['Vous pouvez résilier à tout moment depuis l’onglet Abonnement ou en désinstallant l’appli. La période en cours n’est pas remboursée, sauf disposition contraire de Shopify. Nous pouvons suspendre l’accès en cas d’usage frauduleux ou contraire aux présentes conditions.']],
      ['Vos responsabilités', [[
        'Renseigner des informations d’entreprise exactes et complètes, et faire valider vos modèles de facture par votre expert-comptable.',
        'Vérifier le paramétrage des taxes dans Shopify : l’appli reprend les montants calculés par Shopify.',
        'Conserver vos factures pendant la durée légale (10 ans en France), par exemple grâce à la copie reçue par e-mail.',
        'Émettre les avoirs nécessaires en cas d’erreur ou de remboursement.',
      ]]],
      ['Disponibilité et support', ['Nous faisons nos meilleurs efforts pour assurer la disponibilité du service, sans garantie de fonctionnement ininterrompu. En cas d’interruption, Shopify renvoie les notifications de commande pendant plusieurs heures : les factures manquantes sont alors créées à la reprise. Support : {email}.']],
      ['Responsabilité', ['L’appli est un outil d’aide à la facturation : vous restez responsable de vos obligations fiscales et comptables. Notre responsabilité, si elle était engagée, est limitée aux sommes que vous nous avez versées au cours des 12 mois précédant le fait générateur, sauf faute lourde ou intentionnelle.']],
      ['Données personnelles', ['Le traitement des données est décrit dans notre politique de confidentialité ({privacyUrl}), qui fait partie des présentes conditions.']],
      ['Propriété intellectuelle', ['L’appli, ses textes et son code restent la propriété de {company}. Vous restez propriétaire de vos données et de vos factures.']],
      ['Modifications', ['Nous pouvons faire évoluer ces conditions ; la version en vigueur est publiée sur cette page. En cas de changement important, nous vous prévenons au moins 30 jours à l’avance.']],
      ['Droit applicable', ['Les présentes conditions sont soumises au droit français. À défaut d’accord amiable, tout litige relève des tribunaux compétents de {court}.']],
    ],
  },
  en: {
    title: 'Terms of service',
    updated: 'Last updated: {date}',
    sections: [
      ['Purpose', ['These terms govern the use of the Shopify app “{app}”, published by {company} ({legal}, SIREN {siren}, {address}), which creates and sends PDF invoices for your store’s orders.']],
      ['Access', ['The app is installed from the Shopify App Store and requires an active Shopify store. Installing the app means you accept these terms.']],
      ['Plans and payment', [
        'The Free plan includes {freeLimit} invoices per calendar month. Paid plans (Essential: {essentielPrice} per month for {essentielLimit} invoices; Unlimited: {illimitePrice} per month) are billed by Shopify with your Shopify subscription, after a {trialDays}-day free trial.',
        'When the monthly limit is reached, new orders are put on hold; their invoices can be generated after upgrading or the following month.',
        'Prices may change; any change is announced at least 30 days in advance and requires your approval in Shopify.',
      ]],
      ['Cancellation', ['You can cancel at any time from the Plan tab or by uninstalling the app. The current period is not refunded unless Shopify provides otherwise. We may suspend access in case of fraudulent use or breach of these terms.']],
      ['Your responsibilities', [[
        'Provide accurate and complete business details, and have your invoice templates checked by your accountant.',
        'Check your tax settings in Shopify: the app uses the amounts calculated by Shopify.',
        'Keep your invoices for the legal period (10 years in France), for example using the copy you receive by email.',
        'Issue the necessary credit notes in case of mistakes or refunds.',
      ]]],
      ['Availability and support', ['We do our best to keep the service available, without guaranteeing uninterrupted operation. During an outage, Shopify keeps resending order notifications for several hours, so missing invoices are created when service resumes. Support: {email}.']],
      ['Liability', ['The app is an invoicing tool: you remain responsible for your tax and accounting obligations. Our liability, if any, is limited to the amounts you paid us in the 12 months preceding the event, except in case of gross negligence or wilful misconduct.']],
      ['Personal data', ['Data processing is described in our privacy policy ({privacyUrl}), which forms part of these terms.']],
      ['Intellectual property', ['The app, its content and its code remain the property of {company}. You remain the owner of your data and invoices.']],
      ['Changes', ['We may update these terms; the current version is published on this page. For significant changes, we will notify you at least 30 days in advance.']],
      ['Governing law', ['These terms are governed by French law. Failing an amicable settlement, any dispute falls under the jurisdiction of the competent courts of {court}.']],
    ],
  },
};
