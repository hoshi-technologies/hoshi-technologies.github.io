# Rapport de validation (étape 0)

Date : 1er novembre 2026. Nom provisoire : **[NOM DU JEU]**.

> Ce rapport sépare toujours **ce qui a été mesuré**, **ce qui a été vérifié sur une source officielle**, et **ce qui est une estimation**. Rien n'est inventé. Les éléments marqués « NON VÉRIFIÉ » restent à confirmer.

---

## 0. Résumé en une page

**Ma recommandation : y aller, sous condition.** Commence par le dossier de conception et le prototype de plaisir (étapes 1 et 2). Ils coûtent presque rien en argent. Ne t'engage dans la grosse production (étape 3 et suivantes) que si le prototype est amusant.

Pourquoi oui :
- **La promesse est rare.** Aucun jeu trouvé ne permet de devenir le maire de n'importe quelle vraie ville du monde. Les plus proches sont des jeux de survie, de rail ou de métro sur carte réelle (Infection Free Zone, NIMBY Rails, Subway Builder), ou des mods Cities: Skylines qui demandent beaucoup de travail manuel.
- **Les données tiennent la route, mesures à l'appui.** 20 villes réelles ont été préparées sur 5 continents, dont des zones mal cartographiées. Résultats :
  - toutes les villes ont des bâtiments, des routes, de l'eau et du relief ;
  - en moyenne 3,6 Mo et 14 secondes par quartier de 4 × 4 km ;
  - un coût serveur proche de zéro.
- **Le moteur tient la charge, mesures à l'appui.** Le test sur Godot fait tourner 10 000 habitants qui circulent sur un réseau de 40 000 carrefours en 3,5 à 4 ms par pas de simulation. C'est le langage le plus lent du moteur, sur un petit processeur de serveur.
- **Le marché existe.** Cities: Skylines s'est vendu à 12 millions d'exemplaires (Paradox), Manor Lords à 3 millions (Hooded Horse). Les joueurs se plaignent toujours des mêmes choses : ennui en milieu de partie, performances quand la ville grandit, économie trop facile.

Pourquoi « sous condition » :
- **Le projet est énorme pour un débutant**, même assisté par une IA. Compte de façon réaliste **18 à 30 mois avant l'Accès Anticipé** à environ 20 h par semaine, et plus pour la version 1.0.
- **La qualité visuelle sera le facteur le plus risqué.** Sur Steam, les captures d'écran font vendre. Une « belle maquette » demande du temps d'artiste ou des assets achetés.
- **La traduction en 9 langues coûte cher.** C'est le poste le plus lourd du budget, il peut être étalé.

**Moteur recommandé : Godot 4.7 avec C#.** La simulation est écrite à part, en C# pur, sans dépendre du moteur.

**Données recommandées pour la V1 :**
- Overture Maps (bâtiments, routes, eau, occupation du sol) et relief Copernicus GLO-30 pour le monde entier ;
- IGN et INSEE pour la France, USGS et Census pour les États-Unis ;
- une liste de villes vérifiées à la main, ouverte progressivement.

**Budget de départ jusqu'au prototype : 100 à 300 €.** Le détail est en section 7.

---

## 1. Steam : ce qui a été vérifié

Sources : documentation Steamworks officielle (partner.steamgames.com) et annonces de Valve. Le site partenaire n'était pas lisible en entier depuis cet environnement, les règles ont donc été vérifiées sur les extraits officiels. **Relis en entier les pages marquées ★ avant de payer quoi que ce soit.**

| Sujet | Règle | Source |
|---|---|---|
| ★ Frais d'inscription | **100 $ par jeu**, non remboursables. Récupérés quand le jeu atteint 1 000 $ de revenus bruts ajustés. | [appfee](https://partner.steamgames.com/doc/gettingstarted/appfee) |
| ★ Partage des revenus | **Steam prend 30 %.** Au-delà de 10 M$ de ventes, 25 % sur la partie qui dépasse ; au-delà de 50 M$, 20 %. | [annonce Valve](https://steamcommunity.com/groups/steamworks/announcements/detail/1697191267930157838) |
| ★ Identité, banque, impôts | Signature électronique du contrat, compte bancaire **au nom légal exact**, questionnaire fiscal en ligne (W-8BEN pour un non-Américain) et vérification d'identité. La convention fiscale France–États-Unis prévoit en principe 0 % de retenue américaine sur les droits de logiciel, si tu donnes ton numéro fiscal français (taux exact appliqué par Valve : NON VÉRIFIÉ). | [onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding), [taxfaq](https://partner.steamgames.com/doc/finance/taxfaq), [convention IRS](https://www.irs.gov/pub/irs-trty/france.pdf) |
| Délais | **30 jours minimum** entre le paiement et la sortie. La page « Prochainement » doit être publique **au moins 2 semaines** avant la sortie. Revue de la page et revue du jeu : 3 à 5 jours ouvrés chacune (prévoir 7). | [releasing](https://partner.steamgames.com/doc/store/releasing), [review_process](https://partner.steamgames.com/doc/store/review_process) |
| Règles de page | Captures d'écran : **uniquement du jeu réel**, ni concept art ni rendu cinématique. Capsules : image, nom et sous-titre seulement, sans note, prix, récompense ni « Wishlist now ». | [assets/rules](https://partner.steamgames.com/doc/store/assets/rules) |
| Démo | Application séparée, liée au jeu. Steam ajoute de lui-même le bouton « liste de souhaits ». Une seule notification aux personnes qui ont le jeu en liste de souhaits, dans les 14 jours suivant la sortie de la démo. | [demos](https://partner.steamgames.com/doc/store/application/demos) |
| Next Fest | **Une seule participation par jeu, à vie.** Jeu non sorti, démo publique avant l'événement, page publique. Février 2027 : du 22/02 au 01/03, inscription avant le 10/01. Juin 2027 : du 14 au 21/06, inscription avant le 25/04. Octobre 2027 : dates non publiées. | [nextfest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest) |
| Accès Anticipé | Le jeu doit déjà être jouable et amusant. Ce n'est pas une précommande. Bande-annonce de jeu réel et questionnaire Accès Anticipé obligatoires. Interdit aux jeux déjà finis. | [earlyaccess](https://partner.steamgames.com/doc/store/earlyaccess) |
| Workshop | **Gratuit à intégrer.** Chaque créateur doit accepter l'accord légal du Workshop avant que ses objets soient visibles. Les objets payants existent, mais ne sont pas utiles pour nous. | [workshop](https://partner.steamgames.com/doc/features/workshop) |
| ★ Usage de l'IA | Se déclare dans le **questionnaire de contenu**, avant la revue. Deux cas : contenu **pré-généré** (créé pendant le développement : images, sons, textes, traductions, page Steam) et contenu **généré en direct** (exclu chez nous). Les outils internes, comme une IA qui aide à écrire du code, ne sont pas visés par cette section depuis la mise à jour de janvier 2026 (date : NON VÉRIFIÉE). | [contentsurvey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) |
| Cloud, succès | Fonctions gratuites. Jusqu'à 5 000 succès. | [cloud](https://partner.steamgames.com/doc/features/cloud), [achievements](https://partner.steamgames.com/doc/features/achievements) |

### Ce que tu dois faire toi-même (personne ne peut le faire à ta place)

| Quand | Action | Durée réaliste |
|---|---|---|
| Maintenant, gratuit | Décider sous quel statut tu vends : particulier, micro-entreprise ou société. **Demande à un comptable** ; je ne remplis aucune information légale ou fiscale. | 1 à 4 semaines |
| Avant de payer Steam | Ouvrir un compte bancaire au nom légal exact qui sera déclaré à Steam. | 1 à 2 semaines |
| Après le prototype validé (vers le mois 3 à 4) | Créer le compte Steamworks, signer, payer les 100 $, remplir le questionnaire fiscal et la vérification d'identité. | 1 à 3 semaines |
| Avant la page Steam | Choisir le nom définitif et faire une **recherche de marque** (INPI, EUIPO, USPTO), idéalement avec un conseil en propriété industrielle. | 2 à 6 semaines |
| Page Steam (vers le mois 6 à 9) | Relire et valider la page, les textes et la déclaration IA, puis cliquer toi-même sur « publier ». | 1 à 2 semaines de revue |
| Next Fest | T'inscrire avant la date limite, environ 6 semaines avant le festival. | — |

---

## 2. Moteur : comparaison et mesure

### 2.1 Ce qui a été réellement mesuré

Le test est dans `bench_godot/`. Il simule :
- un réseau de **200 × 200 carrefours** (40 000 nœuds, 73 225 tronçons), soit une carte de **20 km × 20 km** ;
- **10 000 habitants**, chacun avec un domicile et un travail à moins de 8 km ;
- le calcul de leurs **trajets** avec un algorithme de plus court chemin (A*) ;
- un **trafic** où chaque véhicule ralentit selon le nombre de véhicules sur son tronçon.

Machine de mesure : serveur cloud, processeur Intel Xeon à 2,1 GHz, 4 cœurs, **sans carte graphique**. Langage : GDScript, le langage simple et lent de Godot.

| Mesure (Godot 4.7.2) | 10 000 habitants | 50 000 habitants |
|---|---|---|
| Construction du réseau | 64 à 165 ms | 70 ms |
| Calcul de tous les trajets | 4,7 à 4,9 s, une seule fois au chargement | 26 s |
| **Un pas de trafic** | **3,5 à 4,1 ms** | **31 ms** |
| Mémoire | 46 Mo | 75 Mo |

Ce que ça veut dire :
- **10 000 habitants, c'est confortable**, même dans le langage le plus lent : un pas de simulation prend moins d'un quart du temps d'une image à 60 FPS.
- **50 000 habitants coûtent huit fois plus, pas cinq fois.** Il faudra une simulation optimisée en C#, avec des calculs étalés sur plusieurs images. C'est prévu dans l'architecture (section 2.4).
- **Le calcul des trajets doit être incrémental** : on ne recalcule que les habitants concernés par une nouvelle route, jamais les 10 000 d'un coup.

**Ce qui n'a pas été mesuré, et pourquoi :**
- **L'affichage 3D (FPS).** Le serveur n'a pas de carte graphique. Le test contient un mode visuel qui affiche 10 000 véhicules et mesure les FPS pendant 30 secondes : **lance-le sur ton PC Windows**, mode d'emploi dans `../LISEZMOI.md`.
- **Unity et Unreal.** Ils demandent une installation Windows avec un compte, et plusieurs dizaines de Go pour Unreal, impossible dans cet environnement. Leurs performances brutes sont connues et suffisantes. Ce qui les départage, c'est le coût, la licence et la facilité pour un débutant assisté par IA.
- **Le C# dans Godot.** Le kit .NET n'était pas installable ici. Le C# est généralement nettement plus rapide que le GDScript sur ce genre de boucles, mais **je ne l'ai pas mesuré**. Ce sera la première chose mesurée à l'étape 4 de l'ordre de livraison.

### 2.2 Comparaison

| Critère | **Godot 4.7** | Unity 6 | Unreal 5 |
|---|---|---|---|
| Prix | **Gratuit, licence MIT**, aucune redevance | Gratuit sous 200 000 $ de revenus annuels, puis **2 310 $ par an et par poste** (Unity Pro, tarif 2026) | Gratuit jusqu'à 1 M$ de revenus du jeu, puis **5 % de redevance** |
| Sources | [godotengine.org](https://godotengine.org/license/) | [unity.com](https://unity.com/products/unity-personal) | [unrealengine.com](https://www.unrealengine.com/en-US/license) |
| Fichiers de projet | **Texte lisible** : l'IA peut tout lire et modifier, et l'historique Git reste clair | Scènes en YAML difficile à lire, éditeur indispensable | Fichiers binaires, Blueprints visuels que l'IA ne peut pas éditer |
| Langage | C# ou GDScript | C# | C++ ou Blueprints |
| Beaucoup d'agents | À faire soi-même, en C# avec des données compactes | Système DOTS/ECS très performant, mais complexe | Mass Entity, puissant mais complexe |
| Rendu 3D stylisé | Bon pour un style maquette | Très bon | Excellent mais lourd, exige un gros PC |
| Taille de l'éditeur | Environ 80 Mo | Plusieurs Go | Plus de 50 Go |
| Mods | Packs de ressources (.pck) et données JSON/glTF faciles à charger ; DLL C# possibles | Mods par injection de code (communauté) | Possible mais lourd |
| Steam | GodotSteam ou Steamworks.NET, gratuits et libres | Steamworks.NET | Intégré |
| Risque principal | Moins d'assets prêts à l'emploi ; performance à construire soi-même | Changements de prix passés (épisode « Runtime Fee » de 2023, abandonné en 2024) | Trop lourd pour un débutant, PC requis élevé |

### 2.3 Recommandation : **Godot 4.7 avec C#**

1. **Aucun coût ni redevance, jamais.** Tu gardes 100 % de ta part après Steam.
2. **Tout est en texte.** C'est décisif pour un débutant qui travaille avec une IA : je peux lire, écrire et vérifier chaque scène et chaque réglage.
3. **Un PC modeste suffit**, pour toi comme pour les joueurs.
4. Les performances mesurées suffisent pour la taille Quartier ; le C# donnera la marge pour Ville et Grande zone.

### 2.4 Architecture prévue

L'architecture sépare trois couches pour pouvoir ajouter des systèmes sans refaire le jeu :

```
Simulation (C# pur, sans moteur)  ← testée seule, déterministe, réglages dans des fichiers JSON
   │  socle | vraie gestion | élections : modules indépendants, activables
   ▼
Données de ville (paquet préparé hors ligne, format versionné)
   ▼
Godot (affichage, sons, interface, Steam)
```

- **Le socle ne connaît pas les modules suivants.** La vraie gestion et les élections s'y branchent par des « événements » : « budget calculé », « fin de mois », etc. S'ils sont désactivés, le socle fonctionne seul.
- **Les sauvegardes portent un numéro de version.** À chaque mise à jour, un convertisseur fait passer les anciennes sauvegardes de version N à N+1, et des tests les vérifient automatiquement.

---

## 3. Données : licences et test sur 20 villes

### 3.1 Licences (vérifiées sur les sites officiels)

| Source | Licence | Vente sur Steam ? | Ce qu'elle impose |
|---|---|---|---|
| **OpenStreetMap** | ODbL 1.0 | Oui | Mention **« © OpenStreetMap contributors »** visible (écran de démarrage, crédits ou coin de l'écran de jeu) et lien vers openstreetmap.org/copyright. **Nos paquets de ville sont une « base dérivée » : ils doivent rester sous ODbL et être téléchargeables par tous.** Le code et les graphismes du jeu ne sont pas concernés. [FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ) |
| **Overture Maps** | Bâtiments, routes, base : ODbL. Lieux (Places) : CDLA-Permissive 2.0 | Oui | « © OpenStreetMap contributors, Overture Maps Foundation » et les mentions par source. [attribution](https://docs.overturemaps.org/attribution/) |
| **Copernicus DEM GLO-30** | Licence gratuite Copernicus (instance « F ») | Oui, l'usage commercial n'est pas exclu | Mention « produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved ». Ne pas laisser croire à un soutien officiel. [licence PDF](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf) |
| **WorldPop** | CC BY 4.0, certaines couches en ODbL | Oui | Citer WorldPop. Pas d'usage discriminatoire. [licence](https://hub.worldpop.org/data/licence.txt) |
| **GHSL (JRC)** | CC BY 4.0 | Oui | Citer la publication de la version utilisée et indiquer les modifications. [FAQ](https://human-settlement.emergency.copernicus.eu/faq.php) |
| **IGN : BD TOPO, RGE ALTI, Admin Express** | Licence Ouverte Etalab 2.0 | Oui | Citer « IGN » et la date de mise à jour. [data.gouv](https://www.data.gouv.fr/pages/legal/licences) |
| **INSEE** | Licence Ouverte 2.0 | Oui | « Source : Insee » et la date. Ne pas utiliser le logo. [insee.fr](https://www.insee.fr/fr/information/2008466) |
| **US Census (TIGER, ACS)** | Œuvre fédérale, pas de droit d'auteur aux États-Unis | Oui | Citer le Census Bureau. Ne pas utiliser la marque « TIGER/Line ». |
| **USGS 3DEP (relief)** | Domaine public | Oui | Crédit suggéré : « U.S. Geological Survey ». |
| **Natural Earth** | Domaine public | Oui | Aucune obligation. |

**Interdit dans le jeu :**
- Interroger les **serveurs publics** d'OpenStreetMap (Nominatim, Overpass, tuiles) depuis le jeu des joueurs. Leurs règles d'usage l'interdisent pour un produit.
- **Notre solution :** préparer les villes sur notre propre machine à partir des fichiers Overture, et livrer des paquets déjà prêts.

**Affichage des sources dans le jeu :**
- un écran « Sources des données » propre à chaque ville, accessible depuis le menu ;
- une ligne courte et permanente en bas de la carte : « © OpenStreetMap contributors, Overture Maps Foundation, Copernicus » ;
- un fichier `CREDITS_DONNEES.txt` dans chaque paquet.

### 3.2 Test réel sur 20 villes

**Méthode** (scripts dans `test_donnees/`, tu peux les relancer) :
- Données : Overture Maps, version du 21/10/2026 (bâtiments, routes et voies ferrées, eau, occupation du sol), et relief Copernicus GLO-30.
- Pour chaque ville, une zone de **4 × 4 km** (taille « Quartier ») est découpée, compressée et mesurée.
- Machine : serveur cloud à 4 cœurs, données lues à distance sur le stockage public d'Overture.

| Ville | Pays | Bâtiments | dont saisis à la main (OSM) | dont détectés par IA (Microsoft/Google) | avec hauteur | Relief (m) | Paquet | Temps | Note* |
|---|---|---|---|---|---|---|---|---|---|
| Paris (Le Marais) | FR | 23 321 | 99 % | 1 % | 68 % | 20 – 110 | 6,6 Mo | 15 s | 80 |
| Lyon (Presqu'île) | FR | 18 578 | 100 % | 0 % | 32 % | 160 – 319 | 4,4 Mo | 12 s | 75 |
| Annecy | FR | 10 005 | 97 % | 3 % | 7 % | 415 – 751 | 2,2 Mo | 12 s | 73 |
| Saint-Malo | FR | 8 343 | 96 % | 4 % | 8 % | 0 – 46 | 2,5 Mo | 18 s | 75 |
| Gordes (village) | FR | 2 698 | 93 % | 7 % | 32 % | 164 – 519 | 0,9 Mo | 15 s | 58 |
| New York (Midtown) | US | 11 724 | 100 % | 0 % | 99 % | -5 – 186 | 3,6 Mo | 11 s | 85 |
| Austin | US | 9 867 | 96 % | 4 % | 89 % | 128 – 193 | 2,6 Mo | 12 s | 82 |
| Denver | US | 13 728 | 99 % | 1 % | 83 % | 1573 – 1640 | 4,4 Mo | 12 s | 81 |
| Marfa (rural) | US | 1 845 | 49 % | 51 % | 45 % | 1415 – 1457 | 0,3 Mo | 9 s | 58 |
| Berlin (Mitte) | DE | 12 297 | 99 % | 1 % | 82 % | 16 – 88 | 6,6 Mo | 12 s | 80 |
| Tokyo (Shibuya) | JP | 36 345 | 97 % | 1 % | 13 % | 6 – 69 | 9,1 Mo | 19 s | 70 |
| São Paulo | BR | 34 181 | 95 % | 5 % | 94 % | 715 – 847 | 5,0 Mo | 16 s | 88 |
| Lagos | NG | 12 512 | 55 % | 45 % | 15 % | 0 – 22 | 1,6 Mo | 16 s | 68 |
| Kinshasa | CD | 21 362 | 22 % | 78 % | 2 % | 266 – 303 | 2,5 Mo | 14 s | 64 |
| Dhaka | BD | 37 394 | 92 % | 8 % | 34 % | -7 – 33 | 3,9 Mo | 18 s | 79 |
| Le Caire | EG | 15 491 | 39 % | 61 % | 1 % | -2 – 65 | 2,8 Mo | 15 s | 68 |
| La Paz | BO | 49 446 | 6 % | 94 % | 1 % | 3400 – 4072 | 5,1 Mo | 11 s | 57 |
| Port Moresby | PG | 2 092 | 100 % | 0 % | 76 % | 33 – 266 | 0,6 Mo | 11 s | 69 |
| Oulan-Bator | MN | 14 299 | 74 % | 14 % | 9 % | 1278 – 1413 | 2,5 Mo | 12 s | 64 |
| Reykjavik | IS | 7 802 | 95 % | 5 % | 19 % | -4 – 63 | 4,5 Mo | 14 s | 73 |

**Moyenne : 3,6 Mo et 14 s par quartier. Maximum : 9,1 Mo (Tokyo) et 19 s.**

Résultats complets (km de routes, rails, éléments d'eau…) : `test_donnees/resultats_4km.json`. Taille « Ville » (10 × 10 km) : `resultats_10km.json` (voir 3.3).

*Comment lire la **note de qualité** (0 à 100). C'est un indicateur simple et transparent, pas une vérité :
- 25 points pour la densité de bâtiments ;
- 20 points pour la part de bâtiments saisis à la main dans OSM (plus riches en informations) ;
- 15 points pour la part de bâtiments avec hauteur ;
- 20 points pour la part de rues nommées ;
- 20 points pour la densité de routes.

**Ce que le test montre :**
1. **Aucune ville n'est vide.** Là où OpenStreetMap est pauvre (Kinshasa, La Paz, Le Caire, Marfa), Overture comble avec des bâtiments **détectés par IA sur images satellite**. On a la forme au sol, mais rarement la hauteur ni l'usage (logement, commerce…). Le jeu devra les **compléter par estimation et l'afficher au joueur**, comme demandé.
2. **La hauteur des bâtiments est très inégale** : 99 % à New York, 7 % à Annecy, 1 % à La Paz. Un estimateur de hauteur sera nécessaire, à partir de la surface, du quartier et de la densité de population GHSL/WorldPop.
3. **Le relief Copernicus est un modèle « de surface » : il inclut les toits et les arbres.** Il faudra le lisser pour le terrain de jeu. En France et aux États-Unis, on pourra utiliser à la place un relief « sol nu » plus fin (IGN RGE ALTI, USGS 3DEP), exactement comme le prévoit la séparation entre règles génériques et règles par pays.
4. **La note seule ne suffit pas.** Port Moresby obtient 69 avec seulement 2 092 bâtiments, alors que la ville est probablement incomplète. **Chaque ville de la liste vérifiée devra être regardée par un humain** dans un aperçu 3D avant d'être ouverte.
5. **Limites du test :**
   - les longueurs de routes et de rails ne sont pas découpées au bord de la zone : elles sont surestimées, mais restent utiles pour comparer les villes entre elles ;
   - les données de population (INSEE, Census, WorldPop) n'ont pas encore été testées, ce sera l'étape 3 de l'ordre de livraison ;
   - les serveurs IGN et Census n'étaient pas accessibles depuis cet environnement.

### 3.3 Taille « Ville » (10 × 10 km)

Même test sur 20 villes, en zones de 10 × 10 km :

| | Moyenne | Maximum |
|---|---|---|
| Bâtiments | 106 000 | 277 000 (Tokyo) |
| Paquet de ville | 15,8 Mo | 35 Mo (Tokyo) |
| Temps de préparation | 18 s | 60 s (Tokyo) |

Ce que ça veut dire :
- **La taille « Ville » ne pose aucun problème côté données.** La limite viendra de l'affichage 3D et de la simulation de plusieurs centaines de milliers de bâtiments.
- **La taille « Grande zone » ne sera promise qu'après mesure sur de vrais PC.**

**Limites de taille provisoires**, à confirmer par des mesures sur de vrais PC :

| Taille | Zone | Bâtiments (selon nos tests) | Usage prévu |
|---|---|---|---|
| Quartier | 4 × 4 km | 2 000 à 50 000 | PC modeste |
| Ville | 10 × 10 km | 2 000 à 280 000 | PC milieu de gamme |
| Grande zone | 20 × 20 km maximum | à mesurer | PC puissant, non garanti |

### 3.4 Coût serveur et plafond mensuel

- **Préparation des villes :** environ 15 s par quartier, sur une petite machine. Préparer **1 000 quartiers prend environ 4 heures** de calcul : quelques euros sur un serveur loué à l'heure, ou ton propre PC.
- **Stockage et téléchargement :** 1 000 villes × 4 Mo = **4 Go**. Chez un hébergeur sans frais de sortie de données (par exemple Cloudflare R2), cela coûte quelques centimes par mois. Les tarifs exacts sont à revérifier au moment du choix.
- **La V1 n'a besoin d'aucun serveur de calcul en ligne.** Les villes vérifiées sont préparées à l'avance et téléchargées comme de simples fichiers. Une fois téléchargée, la ville se joue **hors ligne**.
- **Plafond proposé : 30 € par mois**, avec une alerte automatique à 20 €. La préparation à la demande de n'importe quelle ville viendra plus tard, avec une file d'attente et une limite de villes par jour, pour ne jamais dépasser ce plafond.

### 3.5 Frontières et territoires contestés

- **Le jeu n'affiche aucune frontière nationale tracée.** Le choix se fait par recherche texte et par liste pays, région, ville ; le globe ne montre que des points de villes.
- **Noms des pays et régions :** noms courts et neutres. Pour les territoires contestés, la ville est rangée sous un nom de région neutre et une note indique : « le statut de ce territoire est contesté ; le jeu ne prend pas position ».
- **Pour la V1, aucune ville située dans une zone contestée majeure n'entre dans la liste vérifiée.** On s'appuie sur la couche « zones contestées » de Natural Earth (domaine public) pour les repérer automatiquement.

---

## 4. Marché

Sources : communiqués des éditeurs pour les ventes officielles. Les autres chiffres viennent d'estimateurs (Gamalytic, VG Insights, Raijin, Vaporlens), qui calculent à partir du nombre d'avis : ce sont des **estimations**. Le magasin Steam n'était pas consultable directement d'ici.

| Jeu | Prix | Avis Steam | Ventes | Ce qu'on aime / ce qu'on reproche |
|---|---|---|---|---|
| Cities: Skylines (2015) | — | Très positif (NON VÉRIFIÉ ici) | **12 M**, toutes plateformes (Paradox, 2022) | Liberté, mods / devient trop facile, fin de partie vers 8 h |
| Cities: Skylines II (2023) | — | ≈ 55 % positifs, « Mitigé » | **> 1 M** (Paradox, fin 2023) | Outils de routes / performances, économie confuse, trafic |
| Manor Lords (Accès Anticipé, 2024) | 39,99 $ | 84 % | **3 M** (Hooded Horse, février 2025) | Ambiance, beauté / plus rien à faire en milieu de partie |
| Workers & Resources (1.0 en 2024) | — | 92 % | Environ 600 à 900 k (estimation) | Profondeur, réalisme / difficile d'accès |
| TheoTown | 9,99 $ | ≈ 93 % | Inconnu sur Steam (plus de 10 M sur mobile) | Simple, charmant / graphismes 2D |
| Timeburg | — | — | **Introuvable** : peux-tu me donner le nom exact ? | — |
| Against the Storm | 29,99 $ | ≈ 95 % | **2 M** (communiqué, août 2026) | Parties courtes renouvelées / — |
| Farthest Frontier (1.0 en 2025) | 29,99 $ puis 34,99 $ | — | **> 1 M** (Crate) | Survie, beauté / — |
| Frostpunk 2 | — | 74 % | 1 M (11 bit) | Narration / gestion abstraite |
| Anno 117 (2025) | — | ≈ 70 % | Estimation 350 à 700 k | Beauté / images générées par IA critiquées |
| Subway Builder (2026), **vraies villes** | ≈ 40 $ | ≈ 50 à 60 % | Estimation 10 à 14 k | Concept / prix, connexion obligatoire, interface |
| NIMBY Rails, **carte OSM mondiale** | — | 90 % | Estimation environ 51 k | Monde entier / niche ferroviaire |
| Infection Free Zone, **ta vraie ville** | — | — | NON VÉRIFIÉ | Accroche « ma ville » très virale / bâtiments approximatifs |

### Ce qui provoque l'ennui en milieu de partie

1. **Plus de contrainte d'argent** une fois le budget positif : Cities: Skylines 1 et 2.
2. **Plus rien de nouveau à débloquer, pas d'objectif** : Manor Lords.
3. **La ville ralentit en grandissant**, et le trafic devient frustrant : Cities: Skylines 2.
4. **Aucune pression extérieure** : pas de crise, pas d'État, pas d'élections.

### Ce qui distinguerait notre jeu

- **Ta vraie ville, prête en moins d'une minute, sans mod.** La promesse se comprend en une phrase et se partage facilement : « regarde ce que j'ai fait de ma ville ».
- **De vrais problèmes de maire** contre l'ennui : dette, dotations de l'État, vieillissement des réseaux, canicules, élections facultatives. Chaque palier de ville apporte un problème nouveau.
- **Des performances maîtrisées par conception** : zone de jeu limitée et taille choisie selon le PC.
- **Un jeu honnête** : données sourcées, estimations signalées, hors ligne, pas de connexion obligatoire. C'est l'inverse de ce qui a été reproché à Subway Builder.

**Concurrents à surveiller :**
- Citystate Metropolis : en partie sur vrais terrains, sortie prévue en 2026.
- MapCity : bac à sable en Accès Anticipé, sans économie.
- Le mod « CS2 OSM Toolkit » pour Cities: Skylines 2.

### Langues

Langues des utilisateurs Steam (enquête de mars 2026) : anglais 39 %, chinois simplifié 23 %, russe 9 %, espagnol 5 %, portugais du Brésil 4 %, allemand 3 %, français 2,5 %, japonais 2 %, polonais 2 %.

**Proposition :**
- Page Steam et démo : **anglais et français**.
- Accès Anticipé : ajouter **allemand, espagnol, portugais du Brésil et chinois simplifié**.
- Version 1.0 : ajouter **russe, japonais, polonais et coréen**.

Les noms de rues et de lieux viennent des données (champs `name:fr`, `name:en`…) : il faut prévoir des polices compatibles avec le chinois, le japonais et le coréen dès le départ.

### 5 noms internationaux

Méthode : recherche web et recherche de pages Steam indexées. Aucun jeu ni application trouvé sous ces noms exacts. **Les bases de marques (INPI, EUIPO, USPTO) n'étaient pas consultables d'ici. Une recherche de marque officielle reste obligatoire avant tout dépôt.**

| Nom | Pourquoi | Vérification |
|---|---|---|
| **Maporia** (mon préféré) | « Map » + « utopie », se prononce facilement en FR, EN, DE et ES | Aucun jeu ni application trouvé |
| **Townfold** | « Ville » + « déplier la carte » | Aucun résultat exact. Proche de « TownsFolk » (jeu mobile) : risque faible |
| **Mayorama** | « Maire » + « panorama », ludique | Aucun résultat. Proche de « Mekorama » et « Mayor Match » : risque modéré |
| **Civora** | Court, évoque la cité | Aucun jeu. Une demande de marque américaine existe pour une entreprise de nettoyage (classe 37, hors jeux vidéo). Le préfixe « Civ » rappelle Civilization : avis juridique conseillé |
| **Hometown Mayor** | Très clair sur la promesse | Aucun jeu trouvé. Nom descriptif, donc difficile à protéger |

Noms écartés : Townkeeper (jeu « Town Keeper » sur Steam), Civitas Terra (plusieurs « Civitas »), Mapolis (marque Mapopolis), Real Mayor (trop générique).

---

## 5. Prix et modèle économique (aperçu de l'étape 7)

- **Prix proposé : 24,99 $ (environ 24,99 €) en Accès Anticipé, puis 29,99 $ en 1.0.** Les jeux indépendants comparables se vendent entre 25 et 35 $.
- **Exemple de revenu net par copie.** Ce calcul repose sur des **hypothèses** à confirmer avec un comptable :
  - prix moyen réellement payé après promotions et prix régionaux : environ 18 $ ;
  - TVA moyenne retirée par Steam : environ 15 %, soit environ 15,30 $ ;
  - remboursements : environ 10 % (médiane du secteur selon une enquête GameDiscoverCo de 2025), soit environ 13,80 $ ;
  - part de Steam (30 %) : il reste **environ 9,60 $ par copie avant tes impôts et cotisations françaises**.
- **Scénarios (hypothèses, pas des prévisions) :**

| Copies vendues | Revenu avant tes impôts et cotisations |
|---|---|
| 2 000 | ≈ 19 000 $ |
| 10 000 | ≈ 96 000 $ |
| 50 000 | ≈ 480 000 $ |

  Beaucoup de jeux Steam vendent moins de 2 000 copies. Le scénario bas est réaliste si la qualité visuelle n'est pas au rendez-vous.
- **Accès Anticipé ou sortie directe :** je recommande **l'Accès Anticipé**. Le genre s'y prête : Manor Lords, Farthest Frontier, Workers & Resources. Les villes vérifiées et les langues peuvent s'élargir progressivement, et les retours des joueurs corrigent la boucle de jeu. **Condition :** le socle doit être déjà amusant et stable au lancement de l'Accès Anticipé, car les premiers avis restent.

---

## 6. Plan et calendrier réaliste

Hypothèse : **toi environ 20 h par semaine, assisté par une IA pour le code.** Les graphismes, la musique et les traductions sont achetés ou commandés.

| Période | Lot | Résultat attendu |
|---|---|---|
| Mois 1 | Dossier de conception, préparation des données d'une ville, test de performance en C# et en 3D sur ton PC | Les tailles de partie mesurées |
| Mois 2 à 3 | **Prototype de plaisir** (une ville, taille Quartier, 20 minutes) | **Ta décision : on continue ou on corrige la boucle de jeu** |
| Mois 4 à 9 | Socle de construction, liste de 10 à 20 villes vérifiées (France et États-Unis d'abord) | Jeu jouable de bout en bout |
| Mois 6 à 9 | **Page Steam « Prochainement »**, avec de vraies captures | Les listes de souhaits commencent |
| Mois 10 à 14 | Interface, ambiance, tutoriel, démo d'environ 1 h | Démo publique |
| Mois 12 à 18 | **Next Fest** : octobre 2027 au plus tôt, février 2028 plus probable | Pic de listes de souhaits |
| Mois 18 à 24 | Intégration Steam, finitions, **Accès Anticipé** | Première vente |
| Mois 24 à 40 | Vraie gestion, élections, plus de villes et de langues, puis **1.0** | Version complète |

**Ce calendrier est prudent mais incertain.** Il pourra glisser de 30 à 50 %, ce qui est courant pour un premier jeu.

---

## 7. Coûts estimés

| Poste | Montant | Quand |
|---|---|---|
| Steam Direct | 100 $ (récupérés après 1 000 $ de ventes) | Mois 3 à 4 |
| Moteur Godot | 0 € | — |
| Serveur de données | 0 à 30 € par mois (plafond) | À partir du mois 4 |
| Graphismes 3D : packs libres (Kenney, Quaternius, CC0) et packs achetés | 0 à 1 500 € | Mois 4 à 14 |
| Musique d'ambiance (licence ou commande) | 500 à 3 000 € | Mois 10 à 14 |
| Sons (banques libres de droits) | 0 à 300 € | Mois 10 à 14 |
| Polices (licence OFL gratuite, Noto pour le chinois, le japonais et le coréen) | 0 € | — |
| Recherche et dépôt de marque (INPI, 1 classe) | environ 190 € (tarif à vérifier), plus éventuellement EUIPO (environ 850 €) | Avant la page Steam |
| Comptable ou conseil | 300 à 1 500 € par an | Avant les ventes |
| Traductions humaines (8 langues) | **Ordre de grandeur : 10 000 à 40 000 €** selon le volume de texte, à confirmer par devis | Étalées de l'Accès Anticipé à la 1.0 |
| Bande-annonce (montage par un prestataire) | 0 à 2 000 € | Mois 6 à 14 |
| PC de test modeste (pour mesurer la configuration minimale) | 0 à 600 € | Mois 1 à 6 |

- **Jusqu'au prototype : 100 à 300 €.**
- **Jusqu'à l'Accès Anticipé : environ 2 000 à 8 000 €.**
- **Jusqu'à la 1.0, traductions comprises : environ 15 000 à 50 000 €.**

---

## 8. Risques principaux

| Risque | Gravité | Ce qu'on fait |
|---|---|---|
| Ampleur du projet pour un débutant | Élevée | Lots courts, arrêt après chaque lot, prototype de plaisir avant tout |
| Qualité visuelle insuffisante pour se vendre | Élevée | Style « maquette » stylisé, bâtiments générés à partir des vraies formes au sol, packs d'assets cohérents |
| Performance des grandes villes | Moyenne | Tailles choisies selon le PC, mesures réelles, simulation en C# étalée sur plusieurs images |
| Données incomplètes ou fausses | Moyenne | Estimations signalées, note de qualité, liste de villes vérifiées par un humain |
| Licence ODbL mal respectée | Moyenne | Paquets de ville publiés sous ODbL, écran des sources, attributions automatiques |
| Un concurrent sort le même concept | Moyenne | Aller vite jusqu'à la page Steam ; se différencier par le rôle de maire et la vraie gestion |
| Coût des traductions | Moyenne | Langues ajoutées progressivement, selon les ventes |
| Sujet politique (élections, frontières) | Faible à moyenne | Aucune personne ni parti réel, aucune frontière tracée, fiction clairement indiquée |
| Mauvais premiers avis en Accès Anticipé | Élevée | Ne lancer l'Accès Anticipé que si la démo est bien notée pendant le Next Fest |

---

## 9. Ce qui a été testé, ce qui ne l'a pas été

**Testé ici, avec des mesures réelles :**
- le banc de test Godot 4.7.2, sans affichage, avec 10 000 puis 50 000 habitants ;
- la préparation de 20 villes réelles en taille Quartier et en taille Ville (poids, temps, contenu, relief).

**Vérifié sur des sources officielles :** règles Steam, licences des données, prix des moteurs.

**Non testé :**
- l'affichage 3D et les FPS (à faire sur ton PC) ;
- Unity et Unreal (non installables ici) ;
- le C# (non installable ici) ;
- les données de population ;
- les données IGN et Census (serveurs inaccessibles d'ici) ;
- les bases de marques ;
- les pages Steam en direct.

**Non fait volontairement :** aucun jeu n'a été créé, rien n'a été publié ni envoyé, rien n'a été poussé sur GitHub.

---

## 10. Ce que j'attends de toi

1. **Ton accord** (ou non) pour passer à l'étape 1 (dossier de conception) puis à l'étape 2 (prototype).
2. **Le nom exact de « Timeburg »**, que je n'ai pas trouvé.
3. **Le test moteur sur ton PC** : lance `bench_godot` en mode visuel, comme expliqué dans `../LISEZMOI.md`, et envoie-moi le fichier de résultats. Cela donnera la première vraie mesure des FPS.
4. **La ville du prototype.** Je propose une ville française bien cartographiée et de taille moyenne, par exemple Annecy (lac, montagne, centre historique) ou Lyon. Tu peux aussi choisir ta propre ville.
5. **Ton avis sur le nom** parmi les 5 propositions, ou d'autres pistes.
6. **Ton accord pour pousser sur GitHub.** Pour l'instant tout est seulement enregistré en local, comme demandé. Note : ce dossier se trouve dans le dépôt de ton site web. Il serait plus propre de créer un **dépôt privé dédié au jeu** avant l'étape 1.
