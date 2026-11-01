# Applis Shopify Hoshi Technologies

Applis (plugins) pour simplifier la gestion d'une boutique Shopify et de l'entreprise derrière.
Chaque appli est autonome dans son dossier (serveur Node.js, configuration Shopify CLI).

| Appli | Statut | Rôle |
|---|---|---|
| [`factures-pdf`](factures-pdf/) : **Hoshi Factures** | v0.1 | Facture PDF et Factur-X à chaque commande, envoyée au client par e-mail |

Les briques communes de `factures-pdf/src/shopify.js` (vérification des webhooks, jetons de
session, échange de jeton, GraphQL Admin) pourront être extraites dans un module partagé
quand une deuxième appli arrivera.
