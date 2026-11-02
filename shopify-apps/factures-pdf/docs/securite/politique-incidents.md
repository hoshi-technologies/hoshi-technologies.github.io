# Politique de réponse aux incidents de sécurité – Hoshi Factures

Éditeur : Hoshi Technologies. Responsable sécurité : le gérant (à défaut de délégation écrite).
Version 1.0 – à relire et approuver chaque année.

## 1. Ce qu'est un incident
Tout événement qui compromet ou peut compromettre la confidentialité, l'intégrité ou la
disponibilité des données traitées par l'appli : accès non autorisé au serveur, à la base ou
aux sauvegardes, fuite ou perte d'une clé (`DATA_ENCRYPTION_KEY`, secret Shopify, mot de
passe SMTP), envoi de factures au mauvais destinataire, perte de données, vulnérabilité
exploitée dans une dépendance.

## 2. Détection
- Alertes de l'hébergeur et de GitHub (Dependabot), erreurs dans les journaux du serveur.
- Journal des accès de l'appli (table `access_log`) : accès anormaux.
- Signalements des marchands ou de Shopify (adresse de support).

## 3. Réaction (dans l'ordre)
1. **Contenir (immédiatement)** : couper l'accès compromis (révoquer les jetons et mots de
   passe, régénérer le secret de l'appli dans le tableau de bord Shopify, isoler le serveur).
2. **Évaluer (sous 24 h)** : quelles données, quelles boutiques, combien de clients, depuis
   quand ; consigner les faits dans le registre des incidents (§ 5).
3. **Notifier** :
   - **Shopify** : sans délai, par le support partenaires, conformément aux conditions de
     l'API Shopify (vérifier le délai exact dans les conditions en vigueur).
   - **Marchands concernés** (responsables de traitement) : sans délai injustifié
     (article 33.2 du RGPD), avec la nature de l'incident, les données touchées et les
     mesures prises, pour leur permettre de notifier la CNIL sous 72 h.
   - **CNIL** : sous 72 h pour les données dont Hoshi Technologies est responsable
     (comptes marchands), si l'incident présente un risque pour les personnes.
4. **Corriger** : appliquer le correctif, faire tourner les clés (voir § 4), restaurer depuis
   une sauvegarde saine si nécessaire (voir `sauvegardes.md`).
5. **Analyser (sous 15 jours)** : cause, chronologie, mesures pour éviter la récidive.

## 4. Rotation des clés
- Secret Shopify : régénérer dans le tableau de bord, mettre à jour `SHOPIFY_API_SECRET`.
- Jetons d'accès des boutiques : ils sont renouvelés à la prochaine ouverture de l'appli.
- `DATA_ENCRYPTION_KEY` : générer une nouvelle clé (`npm run key`), restaurer la dernière
  sauvegarde saine puis réenregistrer les données avec la nouvelle clé.
- Mot de passe SMTP et accès hébergeur/GitHub/Shopify : changer immédiatement.

## 5. Registre des incidents
Tenir un registre (même vide) : date, description, données concernées, personnes et
boutiques touchées, notifications faites (qui, quand), mesures prises. Le conserver 5 ans.

## 6. Contacts
- Support Hoshi Factures : [adresse de support]
- Shopify : support partenaires (partners.shopify.com)
- CNIL : notifications.cnil.fr
