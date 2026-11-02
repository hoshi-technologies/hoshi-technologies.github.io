#!/usr/bin/env bash
# Fabrique la version Windows du jeu.
# Usage : outils/exporter_windows.sh /chemin/vers/Godot_v4.7.2-stable_mono [complet|demo]
#   complet (par défaut) : build/Prototype_Windows.zip, toutes les villes de donnees/villes
#   demo                 : build/Demo_Windows.zip, Annecy et Lyon (quartier), limite de 5 ans de jeu
set -euo pipefail
GODOT="$1"
VARIANTE="${2:-complet}"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$VARIANTE" = "demo" ]; then PRESET="Windows Demo"; NOM="Demo_Windows"; else PRESET="Windows"; NOM="Prototype_Windows"; fi
SORTIE="$RACINE/build/$VARIANTE"
rm -rf "$SORTIE" && mkdir -p "$SORTIE/donnees/reglages" "$SORTIE/donnees/villes"
(cd "$RACINE/jeu" && dotnet build -c Release >/dev/null)
"$GODOT" --headless --path "$RACINE/jeu" --export-release "$PRESET" "$SORTIE/Prototype.exe"
cp -r "$RACINE/donnees/reglages/." "$SORTIE/donnees/reglages/"
if [ "$VARIANTE" = "demo" ]; then
  cp -r "$RACINE"/donnees/villes/fr-annecy_quartier_v1 "$RACINE"/donnees/villes/fr-lyon_quartier_v1 "$SORTIE/donnees/villes/"
else
  cp -r "$RACINE"/donnees/villes/*_v1 "$SORTIE/donnees/villes/"
fi
cp "$RACINE/donnees/steam.json" "$SORTIE/donnees/"
if [ -f "$RACINE/jeu/natif/steam_api64.dll" ]; then
  # à côté du .exe et à côté des bibliothèques .NET (les deux endroits où Windows le cherche)
  cp "$RACINE/jeu/natif/steam_api64.dll" "$SORTIE/"
  cp "$RACINE/jeu/natif/steam_api64.dll" "$SORTIE"/data_*_x86_64/
else
  echo "(steam_api64.dll absent : version sans Steam, le jeu fonctionne hors ligne)"
fi
cp "$RACINE/outils/LISEZ-MOI_joueur.txt" "$SORTIE/LISEZ-MOI.txt"
rm -f "$RACINE/build/$NOM.zip"
(cd "$SORTIE" && python3 -c "import shutil,sys;shutil.make_archive('../$NOM','zip','.')")
echo "OK : $RACINE/build/$NOM.zip"
