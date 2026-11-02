# Version de test : prototype (lot 5) + début du socle (lot 6)

**But : savoir si le jeu donne envie de continuer à jouer.** Ce n'est pas encore le jeu, il n'y a ni sons ni graphismes définitifs.

## Lancer
- **Windows :** décompresser `Prototype_Windows.zip`, lancer `Prototype.exe`.
- **Depuis les sources :** ouvrir `jeu/project.godot` avec Godot 4.7 .NET, puis F5.

## Ce que contient le prototype
| Système | Contenu |
|---|---|
| Villes | 10 villes réelles : France (Annecy, Lyon, Paris – Le Marais, Bordeaux, Strasbourg, Saint-Malo) et États-Unis (New York – Midtown, Austin, Denver, Seattle), vrai relief, vraie eau, vraies rues et vrais bâtiments ; choix dans le menu avec la note de qualité des données. Règles par pays : monnaie (€ / $), mandat (6 ans en France, 4 ans aux États-Unis), taille des ménages. La vraie ville est affichable en transparence (touche G). |
| Steam | Succès (15), sauvegardes prêtes pour Steam Cloud, démo d'environ 1 h : préparés, **inactifs tant que l'application Steam n'existe pas** (voir steam/INTEGRATION_STEAM.md). Le jeu fonctionne entièrement hors ligne. |
| Routes | Rues et avenues tracées librement, découpées automatiquement aux croisements, refusées sur l'eau ou les pentes trop fortes. |
| Zones | Habitat, commerce et activités, peintes au pinceau sur les parcelles créées le long des rues. |
| Croissance | Bâtiments en chantier puis construits, 3 niveaux (maison, petit collectif, immeuble), emménagements progressifs. |
| Réseaux | Eau (château d'eau, pompage dans le lac) et électricité (solaire, gaz), distribuées par les rues reliées. |
| Services | École et centre de santé (places limitées, rayon d'action), pompiers (incendies réels à partir du palier Village), police (insécurité au-delà de 3 000 hab.), centre de tri des déchets, parc, ligne de bus avec bus animés. |
| Ponts et courbes | Les routes peuvent franchir l'eau (jusqu'à 450 m, 5 fois plus cher) et être courbes (départ, point de courbure, arrivée). |
| Départs | 4 façons de commencer : terrain seul (rue à relier au bord de la carte), terrain + grands axes, vraies rues sans bâtiments, ville réelle complète. |
| Cartes | Quartier (4 × 4 km) ou Ville (10 × 10 km, 37 641 bâtiments réels). Sur la grande carte, le territoire constructible s'agrandit à chaque palier (Ville à 10 000 habitants, Grande ville à 25 000). |
| Évolution | Les vrais bâtiments se rénovent et se surélèvent quand le quartier est recherché ; les bâtiments construits par le joueur montent de niveau. |
| Graphismes | Véhicules (voitures, camionnettes, camions, bus), vedettes et voiliers sur le lac, piétons sur les trottoirs, arbres (4 822 vrais arbres isolés + bois réels comme la forêt du Semnoz), lampadaires et bancs réels le long des rues. Tout est fabriqué par le code du jeu (aucune licence tierce) ; registre : conception/REGISTRE_ASSETS.md. |
| Ambiance | Fenêtres sur tous les bâtiments, allumées la nuit ; phares et lampadaires lumineux ; 4 saisons (herbe, feuillage roux en automne, arbres nus et neige en altitude l'hiver) ; météo (beau, nuageux, pluie, neige) selon un climat de type Annecy ; sons d'ambiance fabriqués en direct qui changent selon l'endroit regardé (ville, campagne, bord du lac, montagne) et l'heure (oiseaux le jour, grillons les nuits d'été). M : couper le son. |
| Mairie (vraie gestion) | Satisfaction par quartier (quartiers nommés d'après leur rue principale) et par type d'habitant (familles, jeunes actifs, seniors), avec effet sur l'attrait ; vue « Satisfaction » ; 8 politiques publiques (transports gratuits, zones piétonnes, encadrement des loyers, logement social, aide aux commerces, plan vélo, végétalisation, éclairage réduit) avec coût et effets réels ; 4 objectifs facultatifs (ville verte, attractive, solidaire, économe) avec conditions affichées. |
| Élections (module désactivable) | Mandat de 6 ans, 3 promesses à choisir, popularité (satisfaction + promesses tenues), campagne, élections ; conseil municipal (prime majoritaire, 3 listes d'opposition fictives aux priorités différentes) qui vote les politiques publiques : sans majorité, alliance ou compromis ; vote du budget annuel. Défaite : opposition 12 mois puis élection anticipée, ou reprise avec une nouvelle équipe, ou poursuite sans élections. |
| Tutoriel | 10 étapes par la pratique (caméra, rue, habitat, eau, électricité, croissance, emplois, budget, vues, 300 habitants), chacune validée par l'action réelle ; « Passer le tutoriel ». Vérifié de bout en bout par une partie automatique. |
| Menu pause (Échap) | Reprendre, sauvegarder sous un nom, charger une partie (liste avec ville, carte, mode, date et population), options, menu principal, quitter. |
| Options (enregistrées) | Volume, couper le son, qualité graphique (basse / moyenne / haute : ombres, occlusion, lueur, anticrénelage, résolution), taille du texte, couleurs adaptées au daltonisme (zones et vues). Manette : déplacement, rotation, zoom. |
| Vraie gestion (module activable) | Usure des rues et équipements (outil Rénover, « Rénover le plus urgent », vue Usure), dotation de l'État revue chaque année, frais de personnel croissants avec la taille, réserves excessives pénalisées (plus de dotation, habitants qui réclament une baisse d'impôts), habitants plus exigeants à chaque palier, événements avec décision (tempête, fermeture d'entreprise, pénurie de médecins, projet immobilier, canicule). Difficultés : Découverte, Réaliste, Crise. |
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
- **65 tests automatiques réussis (57 en C#, 8 en Python) :** simulation, budget, sauvegarde, compatibilité, données, réseau routier, règles par pays, succès, et **chacune des 10 villes** chargée, jouée 3 mois en « Ville réelle » et resauvegardée.
- **Lyon et Seattle lancées dans le jeu** (rendu logiciel) en « Ville réelle » : affichage, monnaie ($ à Seattle), budget de départ à l'équilibre.
- **Démo jouée automatiquement jusqu'au bout** (`--demo --auto=demo`) : menu limité à Annecy et Lyon, écran de fin après 5 ans, 8 succès obtenus et gardés hors ligne.
- **Exports Windows complet et démo fabriqués** (`build/Prototype_Windows.zip`, `build/Demo_Windows.zip`), avec Steamworks.NET.
- **Une partie complète de 20 mois jouée par le « robot maire »** (`bench/Ville.Bench -- --robot`) :
  - la ville passe de 0 à environ 3 500 habitants ;
  - 3 paliers sont franchis ;
  - le budget reste positif ;
  - la croissance est freinée par le chômage (le robot crée peu d'emplois), comme prévu.
- **50 heures de jeu simulées (3 000 mois) sans instabilité**, puis sauvegarde et rechargement identiques (voir `mesures/LOT6_MESURES.md`).
- **Une sauvegarde de la version 1 est conservée** (`tests/sauvegardes/`) : elle doit toujours se charger.
- **Images du jeu** prises en rendu logiciel sur le serveur : `mesures/lot5_prototype_*.png`.

## Ce qui n'a PAS été testé
- **Steam n'a pas été testé** : il faut d'abord l'application Steam (AppID) et le fichier steam_api64.dll (voir steam/INTEGRATION_STEAM.md).
- **Les 9 nouvelles villes n'ont été vérifiées qu'à l'image** (aperçus et captures), pas jouées par un humain.
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
