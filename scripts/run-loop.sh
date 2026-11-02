#!/usr/bin/env bash
# Boucle de mise à jour Hoshi Turf (GitHub Actions).
#
# Les horaires planifiés de GitHub ne sont pas garantis (retards, passages sautés). Cette boucle
# fait donc elle-même le travail à intervalle régulier pendant ~5 h 40, puis relance la tâche
# pour continuer : jour (8 h – 23 h, heure de Paris) toutes les 10 min, nuit toutes les heures.
# Les horaires planifiés ne servent plus qu'à redémarrer la boucle si elle s'est arrêtée.
set -u
cd "$(dirname "$0")/.."
START=$(date +%s)
LIMIT=$((5 * 3600 + 40 * 60))
TOPIC="${NTFY_TOPIC:-hoshi-turf-b12tj5jfgndm}"
HEALTH=hippique/data/health.json

# Une seule boucle à la fois (on laisse d'abord au passage précédent le temps de se terminer
# s'il vient de nous relancer).
sleep 45
others=$(gh run list --repo "$GITHUB_REPOSITORY" --workflow pmu-programme.yml --status in_progress \
  --json databaseId -q "[.[] | select(.databaseId != $GITHUB_RUN_ID)] | length" 2>/dev/null || echo 0)
if [ "${others:-0}" != "0" ]; then
  echo "Une boucle tourne déjà : rien à faire."
  exit 0
fi

notify() { # titre, message, tag
  curl -s -o /dev/null -H 'Content-Type: application/json' \
    -d "{\"topic\":\"$TOPIC\",\"title\":\"$1\",\"message\":\"$2\",\"tags\":[\"$3\"],\"priority\":4}" https://ntfy.sh/ || true
}
publish() {
  git add hippique/data
  git diff --cached --quiet && return 0
  git -c user.name="hoshi-turf-bot" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -qm "Hoshi Turf : programme PMU du $(TZ=Europe/Paris date +'%d/%m/%Y %Hh%M')"
  for i in 1 2 3; do
    # En cas de conflit sur un fichier de données, la version qui vient d'être calculée l'emporte.
    git pull -q --rebase -X theirs && git push -q && return 0
    sleep 5
  done
  return 1
}

prev_ok=$(node -e "try{console.log(require('./$HEALTH').ok===false?0:1)}catch(e){console.log(1)}")
last_full=0
while :; do
  now=$(date +%s)
  [ $((now - START)) -ge $LIMIT ] && break
  h=$((10#$(TZ=Europe/Paris date +%H)))
  if [ "$h" -ge 8 ] && [ "$h" -lt 23 ]; then interval=600; else interval=3600; fi
  ok=1
  if [ $((now - last_full)) -ge 3300 ]; then
    echo "::group::Passage complet $(TZ=Europe/Paris date +%H:%M)"
    node scripts/pmu-fetch.mjs || ok=0
    node scripts/calibrate.mjs || ok=0
    last_full=$now
  else
    echo "::group::Cotes des courses proches $(TZ=Europe/Paris date +%H:%M)"
    node scripts/pmu-fetch.mjs --quick || ok=0
  fi
  node scripts/pmu-alerts.mjs || ok=0
  echo "{\"ok\":$([ $ok = 1 ] && echo true || echo false),\"at\":\"$(date -u +%FT%TZ)\"}" > "$HEALTH"
  publish || ok=0
  echo "::endgroup::"
  # Panne : une notification au premier échec, une autre au retour à la normale.
  if [ $ok = 0 ] && [ "$prev_ok" = 1 ]; then
    notify "⚠️ Hoshi Turf : récupération en panne" "La mise à jour des courses a échoué (API du PMU modifiée ou indisponible ?). Les notifications sont suspendues jusqu'au retour à la normale." warning
  elif [ $ok = 1 ] && [ "$prev_ok" = 0 ]; then
    notify "✅ Hoshi Turf : de nouveau opérationnel" "La récupération des courses fonctionne à nouveau." white_check_mark
  fi
  prev_ok=$ok
  wait=$((interval - ($(date +%s) - now)))
  [ $wait -lt 60 ] && wait=60
  [ $(( $(date +%s) + wait - START )) -ge $LIMIT ] && break
  sleep "$wait"
done

echo "Relance de la boucle."
gh workflow run pmu-programme.yml --repo "$GITHUB_REPOSITORY" --ref "$GITHUB_REF_NAME" -f loop=true
