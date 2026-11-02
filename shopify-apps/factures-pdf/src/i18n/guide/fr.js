// Guide utilisateur. Chaque chapitre : titre, introduction, étapes numérotées, conseils.
// Variables : {freeLimit}, {essentielPrice}, {essentielLimit}, {illimitePrice}, {trialDays}.
export default [
  {
    id: 'install',
    title: "Installer l'appli",
    intro: "L'installation prend une minute et ne modifie ni votre boutique ni vos commandes.",
    steps: [
      "Sur l'App Store Shopify, ouvrez la page de l'appli et cliquez sur « Installer ».",
      "Acceptez l'accès en lecture à vos commandes : l'appli en a besoin pour établir les factures, mais ne peut pas les modifier.",
      "L'appli s'ouvre dans votre administration Shopify, menu Applis › Hoshi Factures. Le nom, l'adresse et l'e-mail de votre boutique sont déjà pré-remplis.",
      "Sur l'onglet Accueil, suivez la liste « Pour bien démarrer » : elle disparaît une fois les trois étapes terminées.",
    ],
    tips: ["Vous démarrez avec la formule Gratuite ({freeLimit} factures par mois), sans carte bancaire."],
  },
  {
    id: 'company',
    title: 'Renseigner votre entreprise',
    intro: 'Ces informations apparaissent sur chaque facture. Elles sont obligatoires pour une facture valable.',
    steps: [
      'Ouvrez l’onglet Réglages, carte « Votre entreprise ».',
      'Le plus rapide : dans « Remplissage automatique », tapez votre SIRET (ou le nom de l\'entreprise et la ville), cliquez sur « Rechercher » puis « Utiliser ». Raison sociale, adresse du siège, SIRET, forme juridique et n° de TVA sont repris du registre officiel. Vous pouvez aussi cliquer sur « Reprendre les infos de Shopify ».',
      "Vérifiez la raison sociale et l'e-mail : c'est à cette adresse que vos clients répondent et que vous recevez la copie des factures.",
      "Saisissez l'adresse sur plusieurs lignes, avec le code postal et la ville sur la même ligne (par exemple « 69002 Lyon »), puis choisissez le pays.",
      'Renseignez le SIRET et le n° de TVA intracommunautaire.',
      'Micro-entrepreneur sans TVA : cochez « Franchise en base de TVA ». La TVA disparaît des factures et la mention légale est ajoutée.',
      'Ouvrez « Informations complémentaires » pour la forme juridique et le capital, le RCS, le téléphone, le site web et le type de vente (biens, services ou les deux).',
      'Cliquez sur « Enregistrer » dans la barre qui apparaît en bas de l’écran.',
    ],
    tips: [
      "Faites valider une première facture par votre expert-comptable : il connaît les mentions propres à votre activité.",
      "Si vous êtes en franchise de TVA, vérifiez aussi que Shopify ne facture pas de taxes à vos clients (Paramètres › Taxes et droits de douane).",
    ],
  },
  {
    id: 'look',
    title: 'Personnaliser et vérifier la facture',
    intro: 'Donnez à vos factures l’apparence de votre marque, puis contrôlez le résultat avant la première commande.',
    steps: [
      'Dans Shopify, ouvrez Contenu › Fichiers, importez votre logo (PNG ou JPEG) et copiez son lien.',
      "Dans Réglages › Apparence, collez ce lien dans « Adresse du logo » et choisissez la couleur principale.",
      'Si besoin, modifiez les mentions en bas de facture et le message de remerciement. Laissés vides, ils sont traduits automatiquement dans la langue du client.',
      'Cliquez sur « Aperçu du PDF » : une facture d’exemple est téléchargée avec vos réglages, même non enregistrés.',
      'Enregistrez quand le résultat vous convient.',
    ],
    tips: ['Les réglages ne s’appliquent qu’aux factures suivantes : une facture déjà émise ne change jamais.'],
  },
  {
    id: 'sending',
    title: 'Choisir quand et comment envoyer les factures',
    intro: 'Par défaut, la facture est créée au paiement de la commande et envoyée aussitôt au client par e-mail.',
    steps: [
      "Dans Réglages › Fonctionnement, choisissez quand créer la facture : quand la commande est payée (recommandé) ou dès qu'elle est passée.",
      "Dans « Comment vos clients reçoivent leur facture », choisissez : pas d’e-mail en plus (le client clique sur « Voir ma commande » dans l’e-mail de confirmation de Shopify, puis sur « Télécharger ma facture »), ou un e-mail séparé avec le PDF en pièce jointe. Pour le bouton, une seule activation en 3 clics : Paramètres › Paiement › Personnaliser › page « Statut de la commande » › Applications › Télécharger ma facture › Enregistrer.",
      "Cochez « M'envoyer une copie de chaque facture » pour recevoir chaque facture et constituer vos archives.",
      "Pour personnaliser l'e-mail, ouvrez « E-mail au client » : objet et message acceptent les variables {{first_name}}, {{name}}, {{invoice_number}}, {{order}} et {{shop}}.",
    ],
    tips: [
      "Shopify n'autorise pas les pièces jointes dans ses propres e-mails : la facture part dans un e-mail séparé, envoyé au nom de votre boutique.",
    ],
  },
  {
    id: 'shopify-link',
    title: 'Ajouter le lien de facture dans la confirmation de commande Shopify (facultatif)',
    intro: 'Vos clients retrouvent aussi leur facture depuis l’e-mail de confirmation habituel de votre boutique.',
    steps: [
      "Dans Réglages, ouvrez « Lien dans l'e-mail de confirmation de Shopify » et cliquez sur « Copier le code ».",
      'Dans Shopify, allez dans Paramètres › Notifications › Notifications client › Confirmation de commande, puis « Modifier le code ».',
      "Collez le code à l'endroit où le bouton doit apparaître, par exemple juste après le récapitulatif de commande.",
      'Cliquez sur « Aperçu » pour vérifier, puis sur « Enregistrer ».',
    ],
    tips: [
      "Si le client clique avant le paiement, une page lui indique que la facture sera disponible dans quelques minutes.",
    ],
  },
  {
    id: 'daily',
    title: 'Suivre vos factures au quotidien',
    intro: "L'onglet Accueil liste les dernières factures émises, avec leur statut d'envoi.",
    steps: [
      'Chaque ligne indique le numéro, la commande, le client, la date, le total et le statut de l’e-mail.',
      '« Envoyé » : le client a reçu la facture. « Non envoyé » : l’envoi automatique est désactivé. « Échec » : passez la souris sur le statut pour voir la cause.',
      'Cliquez sur « PDF » pour télécharger une facture, ou sur « Renvoyer » pour l’envoyer de nouveau au client.',
      "Le badge Factur-X indique que la facture contient aussi les données pour la facture électronique.",
    ],
    tips: ["En cas d'échec, vérifiez l'adresse du client sur la commande Shopify et demandez-lui de regarder ses courriers indésirables."],
  },
  {
    id: 'numbering',
    title: 'Numérotation et langues',
    intro: 'Les numéros se suivent sans trou, comme la loi l’exige, et chaque client reçoit sa facture dans sa langue.',
    steps: [
      'Dans Réglages › Numérotation et langue, choisissez le préfixe des numéros (par défaut « F- », soit F-2026-00001).',
      "Si vous aviez déjà émis des factures avec un autre outil, indiquez le prochain numéro : il peut augmenter mais jamais diminuer.",
      'Choisissez la langue des factures : celle du client (français, anglais, allemand, espagnol, italien, néerlandais ou portugais) ou une langue unique.',
      "Avec « Langue du client », choisissez aussi la langue de repli utilisée si la langue du client n'est pas disponible.",
    ],
    tips: [],
  },
  {
    id: 'facturx',
    title: 'Factur-X : la facture électronique',
    intro:
      "Avec Factur-X, le PDF contient aussi les données de la facture, lisibles par les logiciels comptables et les plateformes de facturation électronique, obligatoires entre entreprises en France à partir de 2026–2027.",
    steps: [
      'Ouvrez Réglages › Factur-X : l’option est activée par défaut.',
      "Si le message « Factur-X en pause » s'affiche, complétez l'information indiquée (souvent l'adresse, le pays ou le n° de TVA) et enregistrez.",
      "Quand l'indicateur passe au ✓, toutes les factures suivantes sont au format Factur-X, sans rien changer pour vos clients.",
    ],
    tips: ['Votre expert-comptable peut importer directement ces factures dans son logiciel.'],
  },
  {
    id: 'billing',
    title: 'Gérer votre abonnement',
    intro:
      'Formule Gratuite : {freeLimit} factures par mois. Essentiel : {essentielLimit} factures pour {essentielPrice} par mois. Illimité : {illimitePrice} par mois. Essai gratuit de {trialDays} jours sur les formules payantes.',
    steps: [
      "L'onglet Abonnement (et l'Accueil) indique le nombre de factures utilisées ce mois-ci. Le compteur repart à zéro le 1er de chaque mois.",
      'Pour changer de formule, cliquez sur « Choisir » puis validez sur la page Shopify : le montant est ajouté à votre facture Shopify.',
      "Si la limite est atteinte, les nouvelles commandes sont mises en attente et vous êtes prévenu par e-mail. Après être passé à une formule supérieure, cliquez sur « Générer leurs factures » sur l'Accueil.",
      'Pour revenir à la formule Gratuite, cliquez sur « Résilier ».',
    ],
    tips: [],
  },
  {
    id: 'best-practices',
    title: 'Bonnes pratiques',
    intro: 'Quelques réflexes pour être serein avec votre comptabilité.',
    steps: [
      'Passez une commande de test après la configuration (avec le mode test de Shopify Payments) et vérifiez la facture reçue.',
      "Conservez vos factures 10 ans : gardez la copie reçue par e-mail ou téléchargez-les chaque mois. Elles sont supprimées de l'appli 48 heures après une désinstallation.",
      "Une facture émise ne se modifie pas : en cas d'erreur ou de remboursement, établissez un avoir avec votre outil comptable.",
      "Une question ? Consultez la FAQ dans l'onglet Aide.",
    ],
    tips: [],
  },
];
