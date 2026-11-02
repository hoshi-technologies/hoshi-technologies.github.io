# Sauvegardes et prévention de la perte de données – Hoshi Factures

## Ce qui est en place dans l'appli
- **Chiffrement au repos** : les données personnelles (PDF des factures, nom et e-mail des
  clients, commandes en attente, jetons d'accès Shopify) sont chiffrées en AES-256-GCM dans
  la base, avec `DATA_ENCRYPTION_KEY`.
- **Sauvegardes automatiques** toutes les `BACKUP_INTERVAL_HOURS` heures (24 par défaut) :
  copie cohérente de la base (`VACUUM INTO`), compressée, **chiffrée en AES-256-GCM**, dans
  `BACKUP_DIR`. Conservation `BACKUP_RETENTION_DAYS` jours (30 par défaut), purge automatique.
- **Séparation test / production** : développement et tests sur une boutique de
  développement et des bases locales ou en mémoire ; jamais de données de production.

## Règles d'exploitation
1. `BACKUP_DIR` doit être sur un **autre disque ou volume** que la base, et copié chaque jour
   vers un stockage externe (par ex. stockage objet chiffré chez un autre prestataire ou
   dans une autre région) avec un outil comme `rclone`.
2. Activer en plus les instantanés de disque de l'hébergeur, s'il les propose.
3. **Tester la restauration une fois par mois** (et après chaque changement important) :
   ```
   npm run restore -- /backups/factures-AAAAMMJJ-HHMMSS.sqlite.gz.enc /tmp/test.sqlite
   ```
   La commande vérifie l'intégrité et affiche le nombre de factures. Noter le résultat.
4. Garder une copie hors ligne de la clé de chiffrement (voir `acces-et-mots-de-passe.md`).

## Restaurer en production
1. Arrêter le serveur.
2. `npm run restore -- <sauvegarde> /data/factures-restauree.sqlite`
3. Vérifier le nombre de factures affiché, renommer le fichier en `DATABASE_PATH`.
4. Redémarrer. Les commandes passées entre la sauvegarde et la panne sont renvoyées par
   Shopify pendant quelques heures ; au-delà, les facturer depuis l'appli.
