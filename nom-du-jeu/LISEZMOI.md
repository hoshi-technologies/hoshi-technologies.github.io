# [NOM DU JEU] : dossier du projet

Jeu solo de simulation de ville pour PC Windows, destiné à Steam.
Promesse : « Prends les commandes de ta vraie ville, partout dans le monde. »

## État actuel : jeu jouable, 10 villes, gestion, élections, Steam préparé (lot 15) — voir PROTOTYPE.md

Fabriquer la version Windows : `outils/exporter_windows.sh <chemin de Godot 4.7 .NET>` (ajouter `demo` pour la démo).

| Dossier | Contenu |
|---|---|
| `conception/DOSSIER_CONCEPTION.md` | Le dossier de conception (référence pour tout le projet) |
| `outils/preparation_ville/` | L'outil qui prépare une vraie ville (voir son LISEZMOI) |
| `donnees/villes/` | Les paquets des 10 villes (Annecy aussi en 10 × 10 km) |
| `donnees/reglages/` | Les réglages du jeu (`prototype.json`) et les règles par pays (`pays/`) |
| `steam/` | Intégration Steam, textes de la page (FR/EN), démo, icônes des succès : **ce que vous devez faire** est dans `steam/INTEGRATION_STEAM.md` |
| `simulation/` | Le cœur du jeu en C#, indépendant du moteur |
| `tests/` | Tests automatiques de la simulation (`dotnet test jeu/Jeu.sln`) |
| `bench/` | Banc d'essai de la simulation en C# |
| `jeu/` | Le projet Godot (ouvrir `jeu/project.godot` avec Godot 4.7 .NET) |
| `mesures/LOT4_PERFORMANCE.md` | Résultats du test de performance |

Étape 0 :

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
