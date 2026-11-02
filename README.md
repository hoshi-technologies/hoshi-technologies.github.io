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
Une fois par jour, `scripts/calibrate.mjs` rejoue les courses terminées archivées (90 jours). Il ajuste les réglages
du modèle (poids des critères, dispersion, part du marché, correctif des places) pour que les probabilités
correspondent aux arrivées réelles. Le résultat est écrit dans `hippique/data/calibration.json`, que la page applique
automatiquement et détaille dans « Fiabilité du modèle ». Il faut au moins 150 courses terminées, soit environ 3 jours.
Pour lancer la tâche à la main : onglet *Actions* du dépôt → *Programme PMU* → *Run workflow*.

### Précision, simulation de paris et conseils de mise

- **Données enrichies** : pour chaque course, la tâche récupère aussi les performances détaillées. Elles donnent
  le repos réel, l'aptitude à la distance et à l'hippodrome, la meilleure réduction kilométrique au trot et le
  niveau des courses récentes. Elle récupère aussi la cote du matin (pour mesurer le mouvement des cotes),
  l'avis de l'entraîneur, la ferrure, puis les rapports définitifs simple gagnant et simple placé.
- **Historique** : *Actions* → *Programme PMU* → *Run workflow* avec `backfill` = 60 récupère les 60 derniers jours.
- **Modèle appris** : `scripts/calibrate.mjs` ajuste des réglages séparés pour le trot et le galop. Dès 600 courses
  d'entraînement, il apprend aussi un logit conditionnel directement sur les résultats. Pour chaque groupe, il garde
  le modèle qui prévoit le mieux les courses récentes.
- **Simulation de paris** : les stratégies (favoris, base placée, paris « valeur » gagnant et placé) sont rejouées
  sur les 25 % de courses les plus récentes avec les vrais rapports, en mise fixe et en Kelly fractionné. Une
  stratégie n'est « validée » que si son ROI reste positif après retrait de deux erreurs-types.
- **Conseils de mise et journal** : la page ne conseille une mise non nulle que si une stratégie est validée.
  La mise suit ¼ de Kelly, avec un plafond par pari et une perte maximale par jour. Le journal (stocké dans le
  navigateur, exportable) règle automatiquement les paris avec les rapports définitifs.


### Mises à jour fréquentes et alertes

- En plus du passage complet chaque heure, la tâche relit toutes les 10 minutes (de 9 h à 23 h environ) les cotes
  des courses qui partent dans les 2 heures (`pmu-fetch.mjs --quick`).
- `scripts/pmu-alerts.mjs` cherche ensuite, dans les courses qui partent dans les 45 minutes, un pari qui
  correspond à une stratégie **validée** par la simulation. Tant qu'aucune n'est validée, aucune alerte ne part.
  Les alertes sont écrites dans `hippique/data/alerts.json` (affichées et notifiées par la page) et envoyées sur le
  téléphone via [ntfy](https://ntfy.sh) si le secret de dépôt `NTFY_TOPIC` est défini.
- Test : *Actions* → *Programme PMU* → *Run workflow*, case « Envoyer une notification de test ».
- Notifications sans ouvrir la page (ntfy, sujet par défaut `hoshi-turf-b12tj5jfgndm`, remplaçable par le secret
  `NTFY_TOPIC`) : 📋 sélection du jour vers 9 h (favori placé ≥ 60 %, 10 courses maximum, en France),
  ⏰ rappel 10 à 40 min avant chaque course sélectionnée avec la cote à jour, 🔔 pari validé (prioritaire).
  Une notification ouvre la course concernée (`#AAAA-MM-JJ/R1C2`).

### Bonnes pratiques appliquées

- **Simulation réaliste** : les décisions de pari utilisent la cote disponible au moment de parier (`coteT`,
  dernière cote vue au moins 20 min avant le départ, figée ensuite), sinon la cote du matin, jamais la cote finale.
  Les gains sont calculés avec les rapports définitifs réels.
- **Pas de biais de sélection** : les courses sont découpées en trois périodes chronologiques. Les modèles sont
  ajustés sur la première (60 %), le modèle de chaque groupe et la meilleure stratégie sont choisis sur la
  deuxième (20 %), et la stratégie n'est « validée » que si elle reste rentable sur la troisième (20 %),
  au-delà de deux erreurs-types.
- **Biais favori-outsider** : les probabilités du marché sont corrigées par `p ∝ (1/cote)^k`, avec `k` appris.
- **Note Elo** de chaque cheval, rejouée course après course sur l'historique (`hippique/data/ratings.json`).
- **Réglages par type de course** : trot, plat et obstacle, handicap ou non, avec repli sur le groupe plus général
  quand les données manquent.
- **Tests automatiques** du moteur (`node --test tests/*.test.mjs`), lancés à chaque modification et avant chaque
  passage de la tâche planifiée.
- **Surveillance** : notification « ⚠️ récupération en panne » au premier échec, puis « ✅ de nouveau opérationnel ».
  Un programme sans aucun partant fait échouer la tâche, car c'est le signe d'un changement de l'API.
- **Taille du dépôt** : mesurée à environ 0,6 Mo par jour (environ 220 Mo par an). Si un jour elle approche 1 Go,
  il faudra publier les données sur une branche dédiée remise à zéro régulièrement, avec GitHub Pages en mode
  « GitHub Actions ».
- **Rapports probables au placé** : la tâche enregistre un exemplaire de la réponse de l'API
  (`hippique/data/_sample-combinaisons.json`) pour pouvoir les exploiter une fois leur format connu.
