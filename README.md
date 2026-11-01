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

### Récupération automatique des courses

La tâche GitHub Actions `.github/workflows/pmu-programme.yml` lance `scripts/pmu-fetch.mjs`
toutes les heures (de 6 h à 23 h environ, heure de Paris). Elle publie dans `hippique/data/` le programme PMU d'hier,
d'aujourd'hui et de demain (réunions, courses, partants, musiques, gains, cotes, arrivées). Elle tient aussi
des statistiques cumulées (taux de victoire des jockeys/drivers et des entraîneurs, dernière sortie de chaque
cheval) qui servent à remplir automatiquement ces colonnes. À l'ouverture, la page charge la prochaine course
du jour. Si le navigateur peut joindre l'API PMU, elle actualise les cotes toutes les 5 minutes.
Pour lancer la tâche à la main : onglet *Actions* du dépôt → *Programme PMU* → *Run workflow*.
