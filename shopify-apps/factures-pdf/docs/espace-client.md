# Remise de la facture au client

Le marchand choisit dans **Réglages → Comment vos clients reçoivent leur facture** :

| Mode | Marchand | Client |
|---|---|---|
| **E-mail avec le PDF** (`email`, par défaut) | rien | reçoit le PDF (2 e-mails : Shopify + facture) |
| **Bouton sur la page de commande** (`page`) | ajoute le bloc une fois dans l'éditeur (3 clics, aucun code) | « Afficher votre commande » dans l'e-mail Shopify → **Télécharger ma facture** |
| **Lien dans l'e-mail Shopify** (`link`) | colle une fois un code dans la notification « Confirmation de commande » | clique sur le lien dans l'e-mail |

Shopify ne permet à aucune appli de joindre un fichier à ses e-mails ni de modifier ses modèles
d'e-mail : d'où ces trois modes.

## Bouton sur la page de commande (mode `page`)

1. À la création de chaque facture, l'appli enregistre son lien sur la commande Shopify, dans
   le champ de l'appli `$app.invoice_url` (droit `write_orders`). Elle appelle pour cela
   `metafieldsSet`. Les factures dont le lien n'a pas pu être enregistré sont rattrapées à
   l'ouverture suivante de l'admin. C'est le cas par exemple tant que le marchand n'a pas
   accepté le droit.
2. L'extension `extensions/invoice-download` (cible `customer-account.order-status.block.render`)
   lit ce champ avec l'API Metafields et affiche le bouton. Elle ne fait aucun appel réseau et ne
   demande pas de connexion : Shopify ne fournit le champ qu'à la personne qui consulte cette
   commande, y compris depuis le lien de l'e-mail de confirmation, sans être connectée.
3. Le bouton ouvre `/f/<jeton de la commande>.pdf`. C'est le même secret que le lien
   « Afficher votre commande » de Shopify.

**Activation par le marchand (une fois)** : Paramètres › Paiement › Personnaliser, page
« Statut de la commande » › Ajouter un bloc (ou icône Applications) › Télécharger ma facture ›
Enregistrer. Les réglages de l'appli affichent ces étapes et un bouton qui ouvre les réglages
de paiement.

Il faut les comptes clients actuels de Shopify (par défaut). Les anciens « comptes classiques »
n'affichent pas les extensions : ces boutiques choisissent un autre mode.

## Mise en ligne

```
npx wrangler deploy
shopify app deploy
```

Ouvrez ensuite l'appli dans l'admin de la boutique et acceptez le nouveau droit (modifier les
commandes). Les liens des factures existantes sont alors enregistrés automatiquement.
