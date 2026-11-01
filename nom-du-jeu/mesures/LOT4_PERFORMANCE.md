# Lot 4 : test de performance dans le moteur choisi (Godot 4.7.2 avec C#)

Date : 1er novembre 2026.

Machine de mesure : serveur cloud, Intel Xeon 2,1 GHz, 4 cœurs, **sans carte graphique**.
Les chiffres de simulation (processeur) sont fiables. **Les FPS (images par seconde) ne le sont pas** : ici, l'image est calculée par le processeur, pas par une carte graphique.

## 1. Simulation en C# (sans affichage)

Programme : `bench/Ville.Bench`, résultats bruts dans `lot4_bench_csharp.json`.

| Réseau | Véhicules | Calcul de tous les trajets | Un pas de trafic |
|---|---|---|---|
| Grille 20 × 20 km (40 000 carrefours) | 10 000 | 1,1 s | **0,27 ms** |
| Grille 20 × 20 km | 50 000 | 3,7 s | **1,4 ms** |
| Grille 20 × 20 km | 100 000 | 6,9 s | **2,2 ms** |
| **Vraie Annecy** (10 647 carrefours) | 10 000 | 0,6 s | **0,09 ms** |
| **Vraie Annecy** | 50 000 | 2,9 s | **1,1 ms** |

Comparaison avec le test GDScript de l'étape 0, pour 10 000 habitants :
- **Pas de trafic :** environ 13 fois plus rapide en C# (0,27 ms contre 3,5 à 4 ms).
- **Avec 50 000 habitants :** environ 22 fois plus rapide (1,4 ms contre 31 ms).
- **Trajets :** les chiffres ne sont pas directement comparables. Le C# calcule sur 4 cœurs, avec des trajets limités à 3 km au lieu de 8 km.

**Conclusion : même avec 100 000 véhicules, la simulation du trafic utilise moins de 15 % du temps d'une image à 60 FPS.** C'est le calcul des trajets qui coûte le plus. Il faudra le faire progressivement, uniquement pour les habitants concernés par un changement.

## 2. Ville d'Annecy en 3D dans Godot

Programme : `jeu/` (scène `BancAffichage`).

| Étape | Temps |
|---|---|
| Lecture du paquet de ville | 0,3 s |
| Construction 3D (terrain, eau, routes, bâtiments) | 0,35 s |
| Calcul des trajets de 10 000 véhicules | 0,9 s |
| **Total avant de pouvoir jouer** | **environ 1,6 s** |
| Mise à jour de la simulation et des 10 000 véhicules affichés, par image | 3,8 ms (*à optimiser*) |

Ce qui est affiché :
- **9 615 bâtiments**, soit 210 672 triangles regroupés en 57 objets. Aucun bâtiment n'a échoué au découpage en triangles.
- **Les routes :** 67 728 triangles.
- **Le terrain :** une grille de 401 × 401 points.
- **Le lac.**
- **10 000 véhicules.**

**FPS en rendu logiciel, sans carte graphique : 7,5 images par seconde.** Ce chiffre ne dit rien de ton PC : une carte graphique, même modeste, est des dizaines de fois plus rapide qu'un processeur pour cette tâche. **La vraie mesure doit être faite sur ton PC** avec `BancAffichage_Windows.zip`.

Captures, faites ici en rendu logiciel :
- `lot4_capture_quartier.png` : Jardins de l'Europe, canal du Vassé et lac.
- `lot4_capture_rue.png` : vue à hauteur d'habitant, rue Vaugelas.

**Ce sont des images de test brutes, pas le style visuel du jeu**, qui sera travaillé au lot 8.

## 3. Ce qui reste à mesurer

- **Les FPS sur ton PC :** lance `BancAffichage.exe` (30 secondes), puis envoie le fichier `resultats_affichage.json` créé à côté.
- **Une configuration modeste :** un PC portable avec une carte graphique intégrée, pour fixer la configuration minimale de la taille « Quartier ».
- **La taille « Ville » (10 × 10 km)** : environ 4 à 7 fois plus de bâtiments selon les villes. Ce sera fait quand le prototype fonctionnera.

## 4. Points à améliorer, repérés pendant le test

- **Mise à jour des véhicules (3,8 ms par image) :** elle coûte plus que la simulation elle-même. Il faudra envoyer les positions à Godot plus efficacement et n'afficher que les véhicules proches de la caméra.
- **L'éclairage des façades** est trop sombre : leur orientation est à corriger.
- **Le niveau de détail selon la distance** n'existe pas encore : objets lointains simplifiés, ombres limitées.
