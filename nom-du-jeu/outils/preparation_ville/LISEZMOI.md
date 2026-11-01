# Préparation d'une ville

Transforme les données ouvertes d'une vraie ville en « paquet de ville » jouable hors ligne.

## Sous Windows
1. Installer Python 3.12+ (https://www.python.org/downloads/, cocher « Add to PATH »).
2. Ouvrir un terminal dans ce dossier, puis :
   ```
   pip install -r requirements.txt
   python extraire.py villes\annecy.json cache          (en ligne, ~30 s ; ~20 s de plus la toute première fois)
   python construire.py villes\annecy.json cache paquets (hors ligne, ~4 s)
   python apercu.py paquets\fr-annecy_quartier_v1      (image de contrôle)
   python -m pytest tests                               (tests automatiques)
   ```

## Ajouter une ville
Copier `villes/annecy.json`, changer `id`, `nom`, `pays`, `centre` et `cote_km`. Le champ `statut` passe à `verifiee` seulement après qu'un humain a regardé l'aperçu.

## Règles par pays
`regles_pays/generique.json` contient les valeurs par défaut ; `regles_pays/FR.json` les remplace pour la France.
