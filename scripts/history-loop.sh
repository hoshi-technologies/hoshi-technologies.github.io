#!/usr/bin/env bash
# Récupération de l'historique PMU (GitHub Actions) : par tranches de 40 minutes, publie
# l'archive après chaque tranche, et se relance tant que l'historique n'est pas complet.
set -u
cd "$(dirname "$0")/.."
START=$(date +%s)
LIMIT=$((5 * 3600 + 20 * 60))
BR="${GITHUB_REF_NAME:-main}"
git config user.name "hoshi-turf-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Publication : seule l'archive est concernée (jamais les fichiers du site).
publish() {
  git rebase --abort >/dev/null 2>&1 || true
  git add -A hippique/data/archive
  git diff --cached --quiet && return 0
  local msg="Hoshi Turf : historique PMU ($(node -e "try{const s=require('./hippique/data/archive/state.json');console.log(s.days+' journées, depuis le '+s.oldest)}catch(e){console.log('archive')}"))"
  git commit -qm "$msg" || return 1
  for i in 1 2 3 4 5; do
    git push -q origin "HEAD:$BR" && return 0
    sleep $((i * 8))
    git fetch -q origin "$BR" || continue
    if ! git rebase -q "origin/$BR" >/dev/null 2>&1; then
      git rebase --abort >/dev/null 2>&1 || true
      local mine
      mine=$(git rev-parse HEAD)
      git reset -q --hard "origin/$BR"
      git checkout "$mine" -- hippique/data/archive
      git add -A hippique/data/archive
      git diff --cached --quiet && return 0
      git commit -qm "$msg" || return 1
    fi
  done
  return 1
}

done_flag() { node -e "try{process.exit(require('./hippique/data/archive/state.json').done?0:1)}catch(e){process.exit(1)}"; }

empty=0
while :; do
  left=$((LIMIT - ($(date +%s) - START)))
  [ $left -lt 300 ] && break
  mins=$(( left / 60 - 3 )); [ $mins -gt 40 ] && mins=40
  echo "::group::Tranche de $mins min"
  node scripts/pmu-history.mjs --minutes "$mins" || echo "Tranche en échec."
  if [ -z "$(git status --porcelain hippique/data/archive)" ]; then empty=$((empty + 1)); else empty=0; fi
  publish || echo "Publication en échec (nouvel essai à la tranche suivante)."
  echo "::endgroup::"
  done_flag && break
  if [ $empty -ge 6 ]; then
    echo "Six tranches sans aucune journée récupérée : arrêt (API du PMU indisponible ?)."
    exit 1
  fi
  # Petite pause si la tranche a échoué très vite (panne de l'API).
  sleep 20
done

if done_flag; then
  echo "Historique complet."
else
  echo "Relance de la récupération."
  gh workflow run pmu-history.yml --repo "$GITHUB_REPOSITORY" --ref "$GITHUB_REF_NAME"
fi
