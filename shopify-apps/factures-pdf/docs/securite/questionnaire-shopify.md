# Questionnaire « Détails sur la protection des données » (Shopify Partners)

Réponses de Hoshi Factures et justification. Chaque « Oui » correspond à une mesure en
place dans le code ou dans les documents de ce dossier.

| Question | Réponse | Justification |
|---|---|---|
| Traitez-vous le minimum de données personnelles ? | Oui | Nom, e-mail, adresse et contenu des commandes, uniquement pour la facture. Téléphone non demandé. |
| Informez-vous les marchands des données traitées et des finalités ? | Oui | Politique de confidentialité (site, section « Données traitées »). |
| Limitez-vous l'utilisation à cette finalité ? | Oui | Données utilisées uniquement pour créer et envoyer les factures. |
| Accords de confidentialité et de protection des données avec les marchands ? | Oui | Conditions d'utilisation + politique de confidentialité (rôle de sous-traitant, art. 28 RGPD). |
| Respect des décisions de consentement des clients ? | Non applicable | Aucun marketing, suivi ou profilage. |
| Respect du refus de vente des données ? | Non applicable | Aucune donnée vendue ni partagée. |
| Décisions automatisées avec effets juridiques ? | Non applicable | Aucune. |
| Durées de rétention limitées ? | Oui | Effacement 48 h après désinstallation, effacements RGPD automatiques, journal 12 mois, sauvegardes 30 jours. |
| Chiffrement au repos et en transit ? | Oui | AES-256-GCM dans la base (`src/crypto.js`) ; HTTPS pour toutes les connexions. |
| Sauvegardes chiffrées ? | Oui | Cloudflare : historique de 30 jours avec restauration à un instant donné, données chiffrées par l'appli et par Cloudflare. Serveur Node : sauvegardes chiffrées AES-256-GCM (`src/backup.js`). Voir `sauvegardes.md`. |
| Séparation test / production ? | Oui | Boutique de développement et bases de test ; aucune donnée de production en test. |
| Stratégie de prévention de la perte de données ? | Oui | Sauvegardes quotidiennes externalisées, test mensuel de restauration (`sauvegardes.md`). |
| Accès des employés limité ? | Oui | Accès nominatif et limité (`acces-et-mots-de-passe.md`). |
| Mots de passe robustes ? | Oui | Règles de mots de passe + double authentification obligatoire. |
| Enregistrement des accès aux données personnelles ? | Oui | Journal `access_log`, visible par le marchand dans Réglages › Journal des accès. |
| Politique de réponse aux incidents ? | Oui | `politique-incidents.md`. |
| Audits et certifications | (laisser vide) | Aucun audit externe à ce jour : ne rien déclarer. |

**Avant la soumission**, vérifier que ces engagements sont bien appliqués en production :
`DATA_ENCRYPTION_KEY` enregistré comme secret Cloudflare (et copié hors ligne), double
authentification activée partout, tableau des accès rempli, politique d'incident approuvée.
