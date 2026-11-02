# Démo (environ 1 heure)

## Contenu
- Villes : **Annecy** (avec le tutoriel) et **Lyon**, carte Quartier (4 × 4 km).
- Tous les modes de départ, vraie gestion et élections disponibles.
- Pas de carte Ville 10 × 10 km, pas de bac à sable.
- **Limite : 5 ans de jeu** (60 mois). À vitesse normale, un mois dure une minute : la démo dure donc environ une heure
  (moins si le joueur accélère). Ensuite, un écran de fin remercie le joueur et propose d'ajouter le jeu à sa liste de souhaits
  (le bouton n'apparaît que si l'adresse de la page est renseignée dans `donnees/steam.json`).
- **Les sauvegardes de la démo se chargent dans le jeu complet** (même format, même dossier).

## Fabriquer la démo
```
outils/exporter_windows.sh /chemin/vers/Godot_v4.7.2-stable_mono demo
```
Produit `build/Demo_Windows.zip` (réglage d'export « Windows Démo », étiquette `demo`). Seuls les paquets d'Annecy (quartier)
et de Lyon sont copiés.

## Sur Steam
La démo est une application séparée (AppID de démo, à écrire dans `donnees/steam.json` > `app_id_demo`). Valve demande qu'elle soit
liée à la page du jeu principal. **Rien n'est publié par moi.**
