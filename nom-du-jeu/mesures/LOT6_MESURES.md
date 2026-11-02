# Lot 6 : mesures du socle

Machine de mesure : serveur cloud, 4 cœurs Xeon 2,1 GHz, **sans carte graphique**.

## Partie vieillie artificiellement : 50 heures de jeu

Commande : `dotnet run -c Release -- --vieillir <paquet> <réglages> 3000`. Journal complet : `lot6_vieillissement_50h.log`.

Méthode : le robot maire joue 3 000 mois (1 mois = 1 minute à vitesse normale, soit 50 heures).

| Mesure | Résultat |
|---|---|
| Temps de calcul de la simulation | 1,1 à 1,6 ms par jour de jeu une fois la ville installée (4,9 ms le tout premier mois) |
| Marge à vitesse ×4 (2 jours de jeu par seconde) | moins de 1 % du temps d'une seconde |
| Mémoire | entre 37 et 156 Mo : elle varie au gré du ramasse-miettes, sans croissance continue |
| Messages conservés | plafonnés à 200 |
| Sauvegarde finale | 0,27 Mo (compressée), écrite en 118 ms, relue en 145 ms, **identique à l'original** |
| Valeurs absurdes (NaN, négatives) | aucune |

**Ce que le test révèle sur le jeu (important).** Au bout d'environ 4 heures :
- la ville du robot cesse de grandir (19 000 habitants), parce qu'il n'agrandit plus son quartier ;
- **l'argent s'accumule sans limite** (337 millions au bout de 50 h).

C'est exactement l'« ennui de milieu de partie » relevé chez les concurrents. Le socle seul ne crée pas assez de pression en fin de partie. Les solutions prévues relèvent de la « vraie gestion » (lot 12) :
- vieillissement et renouvellement des réseaux ;
- dette et dotations de l'État ;
- attentes croissantes des habitants ;
- crises.

**C'est la priorité de conception suivante.**

## Mode Ville réelle (Annecy, 4 × 4 km)

Commande : `dotnet run -c Release -- --reelle <paquet> <réglages> 12`.

| Mesure | Résultat |
|---|---|
| Création de la ville | environ 2 s : 9 615 bâtiments réels, 8 876 tronçons, plus de 11 000 parcelles |
| Population estimée | environ 75 000 à 81 000 habitants (**estimation** à partir de la surface des bâtiments ; à remplacer par les données INSEE) |
| Stabilité sur 12 mois | population stable (±5 %), budget équilibré (environ +20 000 € par mois sur 900 000 € de recettes) |
| Calcul | 300 à 600 ms par mois de jeu, soit 10 à 20 ms par jour |
| Sauvegarde | 12 Mo en JSON, environ 3 Mo une fois compressée |

Images (rendu logiciel) : `lot6_ville_reelle_ensemble.png`, `lot6_ville_reelle_quartier.png`.
