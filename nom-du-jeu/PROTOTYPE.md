# Prototype de plaisir (lot 5)

**But : savoir si le jeu donne envie de continuer à jouer.** Ce n'est pas encore le jeu, il n'y a ni sons ni graphismes définitifs.

## Lancer
- **Windows :** décompresser `Prototype_Annecy_Windows.zip`, lancer `Prototype.exe`.
- **Depuis les sources :** ouvrir `jeu/project.godot` avec Godot 4.7 .NET, puis F5.

## Ce que contient le prototype
| Système | Contenu |
|---|---|
| Carte | Annecy, 4 × 4 km, vrai relief, vrai lac et vraies rivières. Les grands axes réels sont présents ; la vraie ville est affichable en transparence (touche G). |
| Routes | Rues et avenues tracées librement, découpées automatiquement aux croisements, refusées sur l'eau ou les pentes trop fortes. |
| Zones | Habitat, commerce et activités, peintes au pinceau sur les parcelles créées le long des rues. |
| Croissance | Bâtiments en chantier puis construits, 3 niveaux (maison, petit collectif, immeuble), emménagements progressifs. |
| Réseaux | Eau (château d'eau, pompage dans le lac) et électricité (solaire, gaz), distribuées par les rues reliées. |
| Services | École (places limitées, rayon d'action), parc, ligne de bus avec bus animés. |
| Économie | Emplois et chômage, demande pour chaque zone, 3 taxes, entretien, emprunts, budget détaillé. |
| Attrait | Vue sur l'eau, parcs, bus, école ; nuisances des activités, de la centrale au gaz et des grands axes. |
| Paliers | Hameau, Bourg (300 hab.), Village (1 200), Petite ville (3 500), avec de nouveaux outils à chaque fois. |
| Vie | Messages d'habitants fictifs, alertes, journal local, objectifs « premiers pas ». |
| Temps | Pause et 3 vitesses (1 mois = 60 s en vitesse normale), cycle jour/nuit visuel. |
| Sauvegarde | Automatique tous les 3 mois de jeu, F5, bouton « Continuer ». |

## Ce qui a été testé
- **29 tests automatiques réussis (21 en C#, 8 en Python) :** simulation, budget, sauvegarde, compatibilité, données, réseau routier.
- **Une partie complète de 20 mois jouée par le « robot maire »** (`bench/Ville.Bench -- --robot`) :
  - la ville passe de 0 à environ 3 500 habitants ;
  - 3 paliers sont franchis ;
  - le budget reste positif ;
  - la croissance est freinée par le chômage (le robot crée peu d'emplois), comme prévu.
- **200 mois de jeu (environ 3 h 20) sans instabilité,** puis sauvegarde et rechargement identiques.
- **Une sauvegarde de la version 1 est conservée** (`tests/sauvegardes/`) : elle doit toujours se charger.
- **Images du jeu** prises en rendu logiciel sur le serveur : `mesures/lot5_prototype_*.png`.

## Ce qui n'a PAS été testé
- **Le jeu n'a pas été joué par un humain**, et la version Windows n'a pas été lancée sur un vrai Windows.
- **Pas de mesure des FPS sur une vraie carte graphique.**
- **Les clics et l'interface ont été vérifiés à l'image, pas à la main.**

## Limites connues (volontaires pour le prototype)
- Ni ponts, ni courbes, ni sens uniques.
- Pas de sons ni de musique, et des graphismes simples (boîtes et toits).
- Le trafic est décoratif : les bouchons n'ont pas encore d'effet sur la ville.
- Une seule ligne de bus.
- Un léger ralentissement possible une fois par mois de jeu, au recalcul des trajets des voitures.

## Questions pour le testeur (à remplir après 20 minutes)
1. Avais-tu envie de continuer après 20 minutes ? (oui / non / un peu)
2. À quel moment t'es-tu ennuyé ?
3. Qu'est-ce qui était confus ?
4. Le fait que ce soit la vraie Annecy t'a-t-il plu ? As-tu utilisé la touche G ?
5. Qu'aurais-tu voulu pouvoir faire et que tu n'as pas pu faire ?
