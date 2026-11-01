# [NOM DU JEU] : dossier du projet

Jeu solo de simulation de ville pour PC Windows, destiné à Steam.
Promesse : « Prends les commandes de ta vraie ville, partout dans le monde. »

## État actuel : étape 0 (validation), en attente de ton accord

Aucun jeu n'a encore été créé. Ce dossier ne contient que :

| Dossier | Contenu |
|---|---|
| `etape0/RAPPORT_VALIDATION.md` | Le rapport complet : Steam, moteur, données, marché, recommandation, plan, coûts, risques. |
| `etape0/bench_godot/` | Petit test de performance moteur (10 000 habitants, 40 000 carrefours, trafic). |
| `etape0/test_donnees/` | Test de préparation des données sur 20 villes réelles (Overture Maps + relief Copernicus). |

## Relancer les tests sous Windows

Test moteur :
1. Télécharger Godot 4.7 (version standard) sur https://godotengine.org/download/windows/
2. Ouvrir Godot, « Importer », choisir `etape0/bench_godot/project.godot`, puis lancer (F5).
3. Laisser tourner 30 secondes. Les résultats (dont les FPS et la carte graphique) sont affichés et enregistrés.

Test des données :
1. Installer Python 3.12+ depuis https://www.python.org/downloads/ (cocher « Add to PATH »).
2. Dans un terminal ouvert dans `etape0/test_donnees` :
   ```
   pip install pyarrow shapely numpy tifffile
   python index_overture.py 2026-10-21.0 cache
   python test_villes.py 4 cache sortie
   ```
