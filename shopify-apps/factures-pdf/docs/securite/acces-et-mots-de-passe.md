# Accès aux données et mots de passe – Hoshi Factures

Version 1.0 – à relire chaque année et à chaque arrivée ou départ d'une personne.

## Qui a accès aux données personnelles des clients
- Seules les personnes nommément autorisées par le gérant ont accès au serveur de
  production, à la base, aux sauvegardes et aux clés. Liste tenue à jour ci-dessous.
- Les marchands n'accèdent qu'aux factures de leur boutique (contrôle par le jeton de
  session Shopify sur chaque requête).
- Aucune donnée de production n'est copiée sur un poste de travail ni utilisée pour les
  tests (les tests utilisent des commandes fictives et une boutique de développement).

| Personne | Rôle | Accès | Depuis |
|---|---|---|---|
| [Nom] | Gérant | Hébergeur, Shopify Partners, GitHub, clés | [date] |

## Règles de mots de passe
- Mot de passe unique par service, d'au moins 14 caractères, stocké dans un gestionnaire
  de mots de passe.
- **Double authentification obligatoire** sur : l'hébergeur, Shopify Partners / Dev
  Dashboard, GitHub, le service d'envoi d'e-mails, la messagerie de support.
- Changement immédiat en cas de doute, de départ d'une personne ou d'incident.

## Journalisation des accès
- L'appli enregistre chaque accès aux données personnelles (liste et téléchargement des
  factures, envoi, ouverture par le client, effacements RGPD) dans `access_log`, avec
  l'utilisateur Shopify, la date et une adresse IP tronquée. Conservation : 12 mois.
- Les accès au serveur et à la console de l'hébergeur sont journalisés par l'hébergeur.

## Clés et secrets
- Les clés (`DATA_ENCRYPTION_KEY`, `SHOPIFY_API_SECRET`, `SMTP_URL`) sont stockées dans le
  gestionnaire de secrets de l'hébergeur, jamais dans le code ni dans GitHub.
- Une copie de `DATA_ENCRYPTION_KEY` est conservée hors ligne (coffre ou gestionnaire de
  mots de passe) : sans elle, la base et les sauvegardes sont illisibles.
