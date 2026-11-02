# Registre des graphismes, sons et polices

**Règle : aucun fichier graphique, sonore ou de police n'entre dans le jeu sans une ligne ici.**
Un test automatique (`tests/Ville.Simulation.Tests/TestsRegistre.cs`) échoue si un fichier `.glb`, `.gltf`, `.obj`, `.fbx`, `.png`, `.jpg`, `.webp`, `.ogg`, `.wav`, `.mp3`, `.ttf` ou `.otf` du dossier `jeu/` n'est pas listé.

Licences acceptées : CC0, domaine public, MIT, CC-BY (avec crédit), licence commerciale achetée (facture conservée).
Licences refusées : NC (non commercial), ND (pas de modification), « gratuit » sans licence écrite, toute marque ou logo réel.

## Fichiers externes

| Fichier (dans `jeu/`) | Source | Auteur | Licence | Date | Crédit obligatoire |
|---|---|---|---|---|---|
| — | Aucun fichier externe pour l'instant | — | — | — | — |

## Contenus fabriqués par le code du jeu (aucun fichier, aucune licence tierce)

| Contenu | Code | Données utilisées |
|---|---|---|
| Voitures, camionnettes, camions, bus, vedettes, voiliers, piétons, arbres, lampadaires, bancs | `jeu/scripts/Rendu/Modeles.cs` | aucune |
| Maisons, petits collectifs, immeubles, commerces, activités, équipements publics | `jeu/scripts/Rendu/RenduVille.cs` | aucune |
| Bâtiments réels (forme, hauteur) | `jeu/scripts/Rendu/RenduVille.cs` | OpenStreetMap / Overture (ODbL), voir les crédits de chaque ville |
| Arbres réels, bois, lampadaires et bancs réels (positions) | `jeu/scripts/Rendu/RenduNature.cs` | OpenStreetMap / Overture (ODbL) |
| Terrain, eau | `jeu/scripts/Rendu/ConstructeurVille.cs` | Copernicus DEM, OpenStreetMap / Overture |

## Sources repérées pour plus tard (vérifiées le 2 novembre 2026, non utilisées)

| Source | Licence | Remarque |
|---|---|---|
| Kenney (kenney.nl) | CC0 | Ne pas utiliser son logo. Site inaccessible depuis l'environnement de développement. |
| Kits Kenney sur GitHub (Starter-Kit-City-Builder, Racing) | MIT | Copier la notice de licence. Peu de modèles. |
| Quaternius (quaternius.com) | CC0 (vérifier pack par pack) | Les copies sur OpenGameArt peuvent avoir une autre licence. |
| Poly Haven, ambientCG | CC0 | Textures, ciels. |
| Mixamo (Adobe) | Gratuit, sans redevance, dans un jeu | Revente des fichiers seuls interdite ; compte Adobe nécessaire. |
| **Interdits** : Google Earth / 3D / Street View, Apple Plans, photos Mapillary comme textures, modèles de vraies marques de voitures. | | |
