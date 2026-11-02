# Version de test : prototype (lot 5) + début du socle (lot 6)

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
| Services | École et centre de santé (places limitées, rayon d'action), pompiers (incendies réels à partir du palier Village), police (insécurité au-delà de 3 000 hab.), centre de tri des déchets, parc, ligne de bus avec bus animés. |
| Ponts et courbes | Les routes peuvent franchir l'eau (jusqu'à 450 m, 5 fois plus cher) et être courbes (départ, point de courbure, arrivée). |
| Départs | 4 façons de commencer : terrain seul (rue à relier au bord de la carte), terrain + grands axes, vraies rues sans bâtiments, ville réelle complète. |
| Cartes | Quartier (4 × 4 km) ou Ville (10 × 10 km, 37 641 bâtiments réels). Sur la grande carte, le territoire constructible s'agrandit à chaque palier (Ville à 10 000 habitants, Grande ville à 25 000). |
| Évolution | Les vrais bâtiments se rénovent et se surélèvent quand le quartier est recherché ; les bâtiments construits par le joueur montent de niveau. |
| Ville réelle | Mode : la vraie Annecy existe au départ (9 615 bâtiments réels, rues, écoles), population et emplois estimés depuis la surface des bâtiments ; eau, électricité et déchets achetés au réseau régional. |
| Trafic | Heure de pointe calculée chaque mois : les rues saturées font baisser l'attrait de l'habitat (et aident les commerces). Le bus réduit le nombre de voitures. |
| Vues (V) | Réseaux, attrait, trafic, services. |
| Bac à sable | Argent illimité, tout débloqué. |
| Tutoriel | « Premiers pas », puis « Conseils du moment » qui suivent les problèmes de la ville. |
| Accessibilité | Taille du texte réglable (Ctrl + / Ctrl -), clavier AZERTY et QWERTY. |
| Économie | Emplois et chômage, demande pour chaque zone, 3 taxes, entretien, emprunts, budget détaillé. |
| Attrait | Vue sur l'eau, parcs, bus, école ; nuisances des activités, de la centrale au gaz et des grands axes. |
| Paliers | Hameau, Bourg (300 hab.), Village (1 200), Petite ville (3 500), avec de nouveaux outils à chaque fois. |
| Vie | Messages d'habitants fictifs, alertes, journal local, objectifs « premiers pas ». |
| Temps | Pause et 3 vitesses (1 mois = 60 s en vitesse normale), cycle jour/nuit visuel. |
| Sauvegarde | Automatique tous les 3 mois de jeu, F5, bouton « Continuer ». |

## Ce qui a été testé
- **37 tests automatiques réussis (29 en C#, 8 en Python) :** simulation, budget, sauvegarde, compatibilité, données, réseau routier.
- **Une partie complète de 20 mois jouée par le « robot maire »** (`bench/Ville.Bench -- --robot`) :
  - la ville passe de 0 à environ 3 500 habitants ;
  - 3 paliers sont franchis ;
  - le budget reste positif ;
  - la croissance est freinée par le chômage (le robot crée peu d'emplois), comme prévu.
- **50 heures de jeu simulées (3 000 mois) sans instabilité**, puis sauvegarde et rechargement identiques (voir `mesures/LOT6_MESURES.md`).
- **Une sauvegarde de la version 1 est conservée** (`tests/sauvegardes/`) : elle doit toujours se charger.
- **Images du jeu** prises en rendu logiciel sur le serveur : `mesures/lot5_prototype_*.png`.

## Ce qui n'a PAS été testé
- **Le jeu n'a pas été joué par un humain**, et la version Windows n'a pas été lancée sur un vrai Windows.
- **Pas de mesure des FPS sur une vraie carte graphique.**
- **Les clics et l'interface ont été vérifiés à l'image, pas à la main.**

## Limites connues (volontaires pour le prototype)
- Ni ponts, ni courbes, ni sens uniques.
- Pas de sons ni de musique, et des graphismes simples (boîtes et toits).
- Les voitures affichées sont un échantillon ; le calcul des bouchons est séparé.
- Une seule ligne de bus.
- Le calcul de l'heure de pointe (une fois par mois de jeu) peut provoquer une très courte pause sur un PC lent.

## Questions pour le testeur (à remplir après 20 minutes)
1. Avais-tu envie de continuer après 20 minutes ? (oui / non / un peu)
2. À quel moment t'es-tu ennuyé ?
3. Qu'est-ce qui était confus ?
4. Le fait que ce soit la vraie Annecy t'a-t-il plu ? As-tu utilisé la touche G ?
5. Qu'aurais-tu voulu pouvoir faire et que tu n'as pas pu faire ?
