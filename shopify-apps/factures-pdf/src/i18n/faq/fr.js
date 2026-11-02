// FAQ. Variables remplacées à l'affichage : {freeLimit}, {essentielPrice}, {essentielLimit},
// {illimitePrice}, {trialDays}, {support}.
export default [
  {
    title: 'Démarrer',
    items: [
      [
        'Comment démarrer ?',
        "Ouvrez l'onglet Réglages, renseignez votre entreprise (nom, adresse, SIRET, n° de TVA) et enregistrez. C'est tout : dès la prochaine commande, la facture est créée et envoyée automatiquement au client. Vous pouvez vérifier le rendu avec le bouton « Aperçu du PDF ».",
      ],
      [
        'Puis-je remplir les informations de mon entreprise automatiquement ?',
        'Oui. À l\'installation, l\'appli reprend de Shopify le nom, l\'adresse légale, l\'e-mail et le téléphone de votre boutique. Shopify ne connaît pas le SIRET ni le n° de TVA : dans Réglages › Remplissage automatique, saisissez votre SIRET ou le nom de votre entreprise pour compléter le reste depuis le registre officiel des entreprises. Vérifiez puis enregistrez.',
      ],
      [
        'Quand la facture est-elle créée ?',
        "Par défaut, dès que la commande est payée (paiement par carte : immédiatement). Vous pouvez choisir de la créer dès que la commande est passée, mais une commande annulée ensuite devra alors faire l'objet d'un avoir.",
      ],
      [
        'Mon client reçoit-il sa facture automatiquement ?',
        "Oui : un e-mail lui est envoyé avec la facture en PDF en pièce jointe. Il est envoyé au nom de votre boutique, et si le client y répond, la réponse arrive à l'adresse e-mail de votre entreprise. Vous pouvez désactiver l'envoi automatique dans les réglages. S'il a un compte client, il trouve aussi un bouton « Télécharger ma facture » sur chacune de ses commandes, sans aucun réglage de votre part.",
      ],
      [
        'Pourquoi la facture ne figure-t-elle pas dans l’e-mail de confirmation de Shopify ?',
        "Shopify ne permet pas aux applis d’ajouter une pièce jointe à ses propres e-mails. Pour éviter un deuxième e-mail, choisissez « Pas d’e-mail en plus » : le client télécharge sa facture avec le bouton « Télécharger ma facture » de son compte client, sans aucun réglage. Facultatif : le même bouton peut être ajouté à l’e-mail de confirmation de Shopify (section « avancé » des réglages).",
      ],
      [
        'Comment recevoir une copie de mes factures ?',
        "Cochez « M'envoyer une copie de chaque facture » : chaque facture vous est aussi envoyée, à l'adresse e-mail de votre entreprise. Toutes les factures restent par ailleurs téléchargeables dans l'onglet Accueil.",
      ],
    ],
  },
  {
    title: 'Factures et obligations légales',
    items: [
      [
        'Mes factures sont-elles conformes ?',
        "Les factures reprennent les mentions obligatoires en France : numéro unique, dates, identité et SIRET du vendeur, n° de TVA, détail des articles, taux et montants de TVA, totaux, pénalités de retard et indemnité de recouvrement. Renseignez toutes les informations de votre entreprise et faites valider le modèle par votre expert-comptable, qui connaît votre situation.",
      ],
      [
        'Comment fonctionne la numérotation ?',
        'Les numéros se suivent sans trou ni doublon (par exemple F-2026-00001, F-2026-00002…), comme la loi l’exige. Si vous aviez déjà des factures, indiquez le prochain numéro dans les réglages : il peut être augmenté mais jamais diminué.',
      ],
      [
        'Je suis micro-entrepreneur, je ne facture pas la TVA.',
        "Cochez « Franchise en base de TVA » dans les réglages : la mention « TVA non applicable, art. 293 B du CGI » est ajoutée et la TVA n'apparaît plus. Vérifiez aussi que Shopify ne facture pas de taxes à vos clients (Paramètres › Taxes et droits de douane).",
      ],
      [
        'Puis-je modifier ou supprimer une facture ?',
        "Non : une facture émise ne doit plus changer, c'est une obligation légale. Si elle comporte une erreur ou si la commande est remboursée, il faut émettre un avoir. Les avoirs automatiques arrivent dans une prochaine version ; en attendant, établissez-le avec votre outil comptable.",
      ],
      [
        'Combien de temps mes factures sont-elles conservées ?',
        "Elles restent disponibles dans l'appli tant qu'elle est installée. La loi impose de les conserver 10 ans : gardez la copie reçue par e-mail ou téléchargez-les régulièrement. Si vous désinstallez l'appli, Shopify nous demande d'effacer vos données 48 heures plus tard.",
      ],
    ],
  },
  {
    title: 'Factur-X et facture électronique',
    items: [
      [
        "Qu'est-ce que Factur-X ?",
        "C'est un PDF qui contient aussi les données de la facture dans un fichier lisible par les logiciels comptables. C'est un format accepté par les plateformes de la facture électronique, obligatoire entre entreprises en France : toutes doivent pouvoir en recevoir depuis septembre 2026, et les émettre dès septembre 2026 (grandes entreprises et ETI) ou septembre 2027 (PME et micro-entreprises). Les ventes aux particuliers ne sont pas concernées par cette obligation. Vos clients voient un PDF normal : rien ne change pour eux.",
      ],
      [
        'Pourquoi est-il indiqué « Factur-X en pause » ?',
        "Il manque une information obligatoire pour Factur-X, indiquée à côté du message (souvent le n° de TVA ou le pays). Complétez-la et enregistrez : les factures suivantes seront au format Factur-X. En attendant, elles sont créées en PDF simple.",
      ],
    ],
  },
  {
    title: 'Langues',
    items: [
      [
        'Dans quelle langue sont les factures et les e-mails ?',
        "Dans la langue de votre client, s'il commande en français, anglais, allemand, espagnol, italien, néerlandais ou portugais. Sinon, dans la langue de repli que vous choisissez. Vous pouvez aussi imposer une seule langue pour toutes les factures.",
      ],
      [
        'Puis-je personnaliser les textes ?',
        "Oui : objet et message de l'e-mail, mentions en bas de facture et message de remerciement. Laissés vides, ils sont traduits automatiquement dans la langue de la facture ; un texte personnalisé est utilisé tel quel, quelle que soit la langue.",
      ],
    ],
  },
  {
    title: 'Abonnement',
    items: [
      [
        'Combien ça coûte ?',
        "La formule Gratuite permet {freeLimit} factures par mois. La formule Essentiel ({essentielPrice} par mois) en permet {essentielLimit}, la formule Illimité ({illimitePrice} par mois) n'a pas de limite. Les formules payantes ont {trialDays} jours d'essai gratuit et sont facturées par Shopify, avec votre abonnement Shopify.",
      ],
      [
        'Que se passe-t-il quand la limite mensuelle est atteinte ?',
        "Les nouvelles commandes sont mises en attente et vous êtes prévenu par e-mail. Dès que vous passez à une formule supérieure, ou au début du mois suivant, cliquez sur « Générer leurs factures » : aucune commande n'est perdue. Le compteur repart à zéro le 1er de chaque mois.",
      ],
      [
        'Comment changer de formule ou résilier ?',
        "Dans l'onglet Abonnement : choisissez une formule et validez sur la page Shopify, ou cliquez sur « Résilier » pour revenir à la formule gratuite. Désinstaller l'appli arrête aussi l'abonnement.",
      ],
    ],
  },
  {
    title: 'Problèmes',
    items: [
      [
        "Un client n'a pas reçu sa facture.",
        "Dans l'onglet Accueil, regardez la colonne E-mail : « Échec » indique un problème (passez la souris dessus pour le détail). Vérifiez l'adresse du client et demandez-lui de regarder ses courriers indésirables, puis cliquez sur « Renvoyer ». Vous pouvez aussi télécharger le PDF et le lui transmettre.",
      ],
      [
        "Mon logo ne s'affiche pas.",
        "Le logo doit être une image PNG ou JPEG accessible en https. Le plus simple : importez-le dans Shopify (Contenu › Fichiers), copiez son lien et collez-le dans les réglages. Utilisez l'aperçu pour vérifier.",
      ],
      [
        'Que deviennent mes données et celles de mes clients ?',
        "L'appli lit vos commandes sans pouvoir les modifier, et ne conserve que ce qui sert à la facture (nom, adresse, e-mail du client, articles). Les données ne sont ni revendues ni partagées. Les demandes de suppression transmises par Shopify (RGPD) sont traitées automatiquement.",
      ],
      [
        'Comment contacter le support ?',
        'Écrivez-nous à {support}, en indiquant le nom de votre boutique. Nous répondons en général sous un jour ouvré.',
      ],
    ],
  },
];
