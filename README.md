# Hoshi Player : pages publiques

Pages servies par GitHub Pages pour l’appli Hoshi Player (Hoshi Technologies) :
connexion par QR code (`connect.html`), bandes-annonces (`trailer.html`) et administration
(`admin.html`). Sources dans le dépôt `kevin-player`, dossier `docs/`.

## Hoshi Turf (`hippique/`)

Analyse de courses hippiques : `hippique/index.html` (interface) et `hippique/engine.js`
(moteur, utilisable aussi sous Node). Chaque partant reçoit une note /20 calculée sur 8 critères
pondérables (forme, régularité, classe, jockey, entraîneur, aptitude, poids/recul/corde, fraîcheur).
Les probabilités de victoire combinent le modèle aux cotes, et la simulation Monte-Carlo de
l'arrivée donne les chances d'être placé (règle PMU) ainsi que les trios les plus probables.
