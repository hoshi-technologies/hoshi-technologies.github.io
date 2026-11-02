# Intégration Steam

> **Rien n'est publié ni envoyé.** Ce dossier prépare tout ; c'est vous qui créez le compte, la page et qui cliquez sur « publier ».
> Je ne remplis **aucune information légale, bancaire ou fiscale** : ces formulaires sont à faire par vous sur le site de Steam.

## 1. Ce qui est déjà dans le jeu

| Élément | État | Comment |
|---|---|---|
| Fonctionnement **sans Steam** | Fait, testé | Si aucun numéro d'application n'est renseigné (`donnees/steam.json`, valeur 0) ou si Steam ne répond pas, le jeu passe en mode hors ligne. Il ne dépend jamais de Steam. |
| **Succès** (15) | Fait : conditions testées ; envoi à Steam **non testé** (pas d'AppID) | `simulation/Succes/Succes.cs` (conditions, testées), `jeu/scripts/Plateforme/` (Steamworks.NET, licence MIT). Hors ligne, ils sont gardés dans un fichier et renvoyés à Steam au lancement suivant. |
| **Steam Cloud** (sauvegardes) | Prêt côté jeu ; **à régler sur le site Steamworks** | Les sauvegardes sont dans un dossier fixe : `%APPDATA%\NomDuJeu\sauvegardes\` (indépendant du futur nom du jeu). Steam « Auto-Cloud » les synchronise sans code. |
| **Démo** | Faite (voir `steam/DEMO.md`) | Même programme, réglage d'export « Windows Démo ». |
| Atelier Steam (**Workshop**) | **Pas recommandé pour le lancement** (voir § 4) | — |
| Clé secrète dans le jeu | **Aucune** | L'AppID est un numéro public. |

## 2. Les succès à créer sur Steamworks

Sur partner.steamgames.com > votre application > Statistiques et succès > Succès : créer chaque succès avec **exactement** l'identifiant API ci-dessous. Il faut aussi une icône 64 × 64 (version obtenue + version grisée) pour chacun : des icônes **provisoires**, dessinées par le code (`steam/fabriquer_icones_succes.py`), sont dans `steam/icones_succes/` ; à remplacer par de plus belles si vous le souhaitez.

| Identifiant API (à recopier tel quel) | Nom FR | Description FR | Nom EN | Description EN |
|---|---|---|---|---|
| `PREMIERE_RUE` | Premier coup de crayon | Tracer sa première rue. | First stroke | Build your first street. |
| `PREMIER_PONT` | Trait d'union | Construire un pont. | Bridging the gap | Build a bridge. |
| `PALIER_BOURG` | Bourg | Atteindre le palier Bourg en partant de zéro. | Market town | Reach the Market town tier from scratch. |
| `PALIER_VILLAGE` | Village | Atteindre le palier Village en partant de zéro. | Village | Reach the Village tier from scratch. |
| `PALIER_PETITE_VILLE` | Petite ville | Atteindre le palier Petite ville en partant de zéro. | Small town | Reach the Small town tier from scratch. |
| `PALIER_VILLE` | Ville | Atteindre le palier Ville en partant de zéro. | City | Reach the City tier from scratch. |
| `PALIER_GRANDE_VILLE` | Grande ville | Atteindre le palier Grande ville en partant de zéro. | Big city | Reach the Big city tier from scratch. |
| `RESEAUX_OK` | Tout coule de source | 1 000 habitants, assez d'eau et d'électricité pour tous. | Everything flows | 1,000 residents with enough water and power for everyone. |
| `PLEIN_EMPLOI` | Plein emploi | Moins de 5 % de chômage avec au moins 3 000 habitants. | Full employment | Under 5% unemployment with at least 3,000 residents. |
| `BUDGET_SAIN` | Comptes à l'équilibre | Douze mois de suite avec plus de recettes que de dépenses (hors bac à sable). | Balanced books | Twelve months in a row with more income than spending. |
| `VILLE_REELLE_10_ANS` | Dix ans à la mairie | Gérer une ville réelle pendant dix ans. | Ten years in office | Run a real city for ten years. |
| `REELU` | Réélu | Gagner une élection municipale. | Re-elected | Win a municipal election. |
| `PROMESSES_TENUES` | Parole tenue | Tenir en même temps trois promesses de campagne. | Promises kept | Keep three campaign promises at the same time. |
| `OBJECTIF_ATTEINT` | Cap tenu | Atteindre un objectif de mandat (vraie gestion). | On course | Complete a term objective (real management). |
| `CINQUANTE_ANS` | Une vie de maire | Jouer cinquante ans dans la même partie. | A lifetime as mayor | Play fifty years in the same game. |
Aucun succès dans le bac à sable. Les succès de palier ne comptent que si la ville a été construite (pas en mode « Ville réelle »).

## 3. Réglage Steam Cloud (Auto-Cloud)

Sur Steamworks > Application > Steam Cloud :
- Octets par utilisateur : 200 000 000 (200 Mo) ; nombre de fichiers : 500.
- Auto-Cloud, chemin racine **WinAppDataRoaming**, sous-dossier `NomDuJeu/sauvegardes`, motif `*`, récursif : non.
- Les options du joueur (`options.json`) et la liste des succès hors ligne (`succes.json`) restent locales, c'est voulu.

## 4. Atelier Steam (Workshop) : évaluation

Idée naturelle : partager des **paquets de villes** préparés par les joueurs. Je le déconseille pour le lancement :
1. **Licence des données** : les paquets contiennent des données OpenStreetMap (licence ODbL) ; chaque partage doit garder l'attribution et la même licence. Faisable, mais il faut l'expliquer et le vérifier.
2. **Qualité** : un paquet mal préparé donne une ville fausse, alors que le jeu promet de vraies villes (« liste de villes vérifiées »).
3. **Modération** : noms de bâtiments ou de lieux insultants, contenus hors sujet : il faut quelqu'un pour surveiller.
4. **Charge** : l'outil de préparation demande Python et un accès Internet ; ce n'est pas encore un outil grand public.

Recommandation : après la 1.0, ajouter un Workshop limité aux **sauvegardes et scénarios** (pas aux données de villes), puis réévaluer.

## 5. Ce que **vous** devez faire (dans l'ordre)

1. Créer un compte **Steamworks** (partner.steamgames.com) et payer les frais Steam Direct (100 $ par jeu, à vérifier sur le site au moment de l'inscription).
2. Remplir **vous-même** les informations légales, bancaires et fiscales (formulaire fiscal américain W-8BEN pour une personne en France, selon votre situation). Je ne les remplis pas.
3. Créer l'application (et une seconde pour la démo), noter les deux **AppID**, les écrire dans `donnees/steam.json` (`app_id`, `app_id_demo`) et l'adresse de la page dans `url_magasin`.
4. Télécharger le **SDK Steamworks** (sur le site partenaire), copier `redistributable_bin/win64/steam_api64.dll` dans `jeu/natif/` : le script d'export le placera à côté du .exe.
5. Créer les 15 succès (§ 2) avec leurs icônes (`steam/icones_succes/`) ; régler Steam Cloud (§ 3).
6. Remplir le **questionnaire sur l'IA** à partir de `conception/REGISTRE_IA.md` (texte proposé dans `steam/PAGE_STEAM.md`).
7. Compléter le **questionnaire de contenu** (classification) : pas de violence, pas de contenu adulte, pas d'achats en jeu, pas de publicité.
8. Envoyer la version avec **SteamPipe** (modèle `steam/app_build_MODELE.vdf`) : la connexion se fait avec votre compte au moment de l'envoi, aucun mot de passe n'est enregistré dans le projet.
9. Tester **sur votre PC** : lancement depuis Steam, un succès (ex. tracer une rue), une sauvegarde qui apparaît sur un 2e PC.
10. Relire la page (`steam/PAGE_STEAM.md`), ajouter les images (capsules, captures), puis demander la revue de Valve. **La publication, c'est vous qui la lancez.**
