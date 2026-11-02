#!/usr/bin/env bash
# Fabrique la version Windows du jeu : build/Prototype_Annecy_Windows.zip
# Usage : outils/exporter_windows.sh /chemin/vers/Godot_v4.7.2-stable_mono (exécutable)
set -euo pipefail
GODOT="$1"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SORTIE="$RACINE/build/windows"
rm -rf "$SORTIE" && mkdir -p "$SORTIE/donnees/reglages" "$SORTIE/donnees/villes"
(cd "$RACINE/jeu" && dotnet build -c Release >/dev/null)
"$GODOT" --headless --path "$RACINE/jeu" --export-release "Windows" "$SORTIE/Prototype.exe"
cp "$RACINE/donnees/reglages/prototype.json" "$SORTIE/donnees/reglages/"
cp -r "$RACINE"/donnees/villes/fr-annecy_* "$SORTIE/donnees/villes/"
cp "$RACINE/outils/LISEZ-MOI_joueur.txt" "$SORTIE/LISEZ-MOI.txt"
rm -f "$RACINE/build/Prototype_Annecy_Windows.zip"
(cd "$SORTIE" && python3 -c "import shutil;shutil.make_archive('../Prototype_Annecy_Windows','zip','.')")
echo "OK : $RACINE/build/Prototype_Annecy_Windows.zip"
