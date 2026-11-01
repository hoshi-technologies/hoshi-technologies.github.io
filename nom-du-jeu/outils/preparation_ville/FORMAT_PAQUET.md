# Format du « paquet de ville » (version 1)

Un paquet est un dossier qui contient tout ce qu'il faut pour jouer une ville **hors ligne**.
Il est produit par `construire.py` et lu par le jeu.

| Fichier | Contenu |
|---|---|
| `manifest.json` | Identité de la ville, repère, relief, sources, qualité, estimations, empreintes SHA-256 |
| `batiments.json.gz` | Liste de bâtiments : `contour` (polygone), `hauteur_m`, `etages`, `usage`, `source`, `estime` (liste de ce qui est estimé) |
| `routes.json.gz` | Graphe : `noeuds` (carrefours, `x`, `y`) et `troncons` (`a`, `b` = nœuds, `gabarit`, `nom`, `pont`, `tunnel`, `trace`) |
| `eau.json.gz` | `surfaces` (lacs, rivières larges) et `cours` (ruisseaux en lignes) |
| `sols.json.gz` | Occupation du sol (parcs, forêts, cultures, etc.) |
| `relief.f32` | Grille d'altitudes, float32 little-endian, ligne 0 = nord, colonne 0 = ouest, pas de 10 m |
| `CREDITS_DONNEES.txt` | Mentions obligatoires des sources et licence ODbL |
| `apercu.png` | Image de contrôle pour la vérification humaine (non incluse dans les empreintes) |

## Repère
- Unité : mètre. **x vers l'est, y vers le nord**, origine au centre de la zone.
- Dans Godot (Y vers le haut, -Z vers le nord) : `position = Vector3(x, altitude, -y)`.

## Gabarits de route
`voie_rapide`, `avenue`, `rue`, `desserte`, `pieton`, `rail`.

## Usages de bâtiment
`habitat`, `commerce`, `bureaux`, `activites`, `ecole`, `sante`, `culte`, `public`, `transport`, `annexe`, `agricole`.

## Compatibilité
- Tout changement incompatible du format augmente `version_format`.
- Le jeu doit savoir lire toutes les versions publiées (convertisseur version N vers N+1).
- Le paquet est une base de données dérivée d'OpenStreetMap : il est sous **ODbL** et doit rester redistribuable.
