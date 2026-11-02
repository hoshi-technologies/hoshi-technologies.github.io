# Dossier de conception : [NOM DU JEU]

> **Document vivant.** Toute session de travail commence par le relire et se termine par sa mise à jour : section « Journal des décisions » et sections modifiées.
> Version 0.2, du 1er novembre 2026. Statut : accepté par le propriétaire.

---

## 1. Le jeu en une phrase

**« Prends les commandes de ta vraie ville, partout dans le monde. »**
Le joueur choisit une vraie ville et en devient le maire. Il la construit et la transforme sur sa vraie géographie, et il gère tout ce qui la fait vivre.

### Les 4 piliers (toute idée doit en servir au moins un)

1. **C'est MA ville.** Vrai relief, vraies rivières, vraies rues, vrais quartiers. Le joueur reconnaît des lieux et les partage.
2. **Une ville vivante.** On voit ses décisions dans la rue : trafic, piétons, commerces qui ouvrent ou ferment, bâtiments qui grandissent, saisons.
3. **Des décisions de maire crédibles.** Budget, dette, services, environnement, satisfaction. Simplifié dès que ça nuit au plaisir.
4. **Toujours une nouvelle raison de jouer.** Chaque palier apporte un nouveau problème et un nouvel outil. Pas de partie « finie » au bout de 8 heures.

### Ce que le jeu n'est pas

- Ni un clone de Cities: Skylines : on ne copie ni son nom, ni ses visuels, ni son interface.
- Ni un outil de prédiction.
- Ni une simulation politique réelle.

C'est une **fiction inspirée de données réelles**.

---

## 2. Comment commence une partie

1. **Choisir sa ville.** Recherche directe, ou pays, puis région, puis ville. Pour les grandes villes, on choisit ensuite un quartier ou une zone sur une carte.
2. **Voir la note de qualité des données.** Exemple : « Bâtiments 97 % cartographiés, hauteurs 9 % (le reste estimé), relief 30 m ». Chaque estimation est signalée.
3. **Choisir la taille.** Quartier, Ville ou Grande zone, avec la configuration de PC recommandée pour chacune.
4. **Choisir le mode de départ** (proposition à valider, voir la question ouverte Q1) :
   - **Fondation** : la vraie géographie (relief, eau, littoral), les grands axes réels qui relient la zone au reste du monde, et un **calque fantôme** de la vraie ville qu'on peut afficher pour s'en inspirer. Le joueur bâtit tout. C'est le mode du **prototype**.
   - **Ville réelle** : la ville existe déjà avec ses vrais bâtiments, sa population et son budget de départ (vrais chiffres ou estimations signalées). Le joueur la transforme : densifier, rénover, étendre, réparer. Ce mode arrive avec le socle.
5. **Choisir la difficulté** (étape 4) : Découverte, Réaliste ou Crise. Activer ou non les élections (étape 5).

**Aucune mécanique n'empêche de construire au lancement.** Routes, zones et services de base sont disponibles dès la première minute.

---

## 3. La boucle de jeu

### Minute par minute (la boucle courte)

- **Observer :** un indicateur passe au rouge (« Manque d'eau à l'est »), une rue est bouchée, un message d'habitant arrive.
- **Agir :** tracer une route, poser une zone, placer un service, ajuster un impôt.
- **Voir le résultat en moins de 30 secondes :** les terrains se construisent, les voitures prennent la nouvelle route, la jauge se remplit. **Ce retour rapide est la priorité du prototype.**

### Heure par heure (la boucle moyenne)

- **Atteindre le palier suivant** : il débloque un nouveau problème et un nouvel outil (section 4).
- **Équilibrer le budget mensuel :** recettes, dépenses, et un emprunt si nécessaire.
- **Traiter un événement :** fermeture d'une usine, canicule, projet immobilier.
- **Façonner un quartier qui ressemble à quelque chose :** centre commerçant, zone d'activités au bord de la rivière, quartier résidentiel sur la colline.
- **Lire le journal local :** une page de « une » tous les quelques mois de jeu, qui raconte ce que la ville a vécu.

### Sur 50 heures (la boucle longue)

| Période de jeu | Ce qui occupe le joueur |
|---|---|
| 0 à 2 h | Fonder ou prendre en main la ville. Apprendre en jouant. Premiers paliers rapides. |
| 2 à 10 h | Croissance : services, transports en commun, premiers vrais problèmes (trafic, déchets, médecins). |
| 10 à 25 h | Spécialiser des quartiers, tenir un budget sous tension, faire face à l'environnement (bruit, pollution, inondations). Objectifs facultatifs. |
| 25 à 50 h et plus | Grands projets (tram, métro, université), dette et dotations, vieillissement des réseaux, crises rares, élections si activées. Recommencer dans une autre vraie ville. |

**Ce qui empêche l'ennui en milieu de partie** (les causes ont été identifiées dans le rapport de validation) :
- **L'argent reste une contrainte.** Les réseaux vieillissent et coûtent en entretien, les dotations de l'État varient, la dette a un coût réel. Un budget bien tenu permet d'investir, il ne rend jamais le jeu trivial.
- **Chaque palier apporte un problème qu'on n'avait pas avant.**
- **Des pressions extérieures :** événements, communes voisines qui attirent les habitants, climat.
- **Des objectifs facultatifs**, et en option un mandat avec des promesses à tenir.
- **« Recommencer ailleurs » a du sens :** une autre vraie ville, c'est une autre géographie et d'autres problèmes.

### Le temps

| Vitesse | Effet | Usage |
|---|---|---|
| Pause | Tout s'arrête, on peut construire | Planifier |
| Normale | **1 mois de jeu ≈ 1 minute réelle** | Jouer et regarder |
| Rapide | × 2 | Attendre la croissance |
| Très rapide | × 4 | Avancer sur une ville stable |

- **Le cycle jour/nuit est visuel**, découplé du calendrier : une journée dure environ 4 minutes réelles, sinon la nuit clignoterait.
- **Les saisons et la météo** suivent le calendrier de jeu.
- **Valeurs de départ, à régler pendant le prototype** dans un fichier de données : le prototype de 20 minutes couvre donc environ un an et demi de jeu.

---

## 4. Les paliers de ville

Les seuils de population se règlent dans un fichier de données. En mode Ville réelle, la partie démarre au palier qui correspond à la population de la zone. Les outils de ce palier sont débloqués, mais une « prise de fonction » guidée les présente un par un.

| Palier | Population (provisoire) | Nouveau problème | Nouveaux outils |
|---|---|---|---|
| 1. **Bourg** | 0 à 1 000 | Faire venir les premiers habitants, trouver de l'emploi | Routes, zones (habitat, commerce, activités), eau, électricité, budget simple |
| 2. **Village** | 1 000 à 5 000 | Les déchets s'accumulent, les eaux usées, l'école est pleine | École primaire, collecte des déchets, assainissement, pompiers |
| 3. **Petite ville** | 5 000 à 20 000 | Bouchons domicile-travail, pas assez de médecins, bruit | Bus, centre de santé, police, parcs, réglage des impôts locaux, premier emprunt |
| 4. **Ville** | 20 000 à 75 000 | Pollution, prix du logement, quartiers mécontents | Quartiers nommés, densité des zones, collège et lycée, hôpital, budget détaillé* |
| 5. **Grande ville** | 75 000 à 250 000 | Inondations, canicule, réseaux qui vieillissent, inégalités entre quartiers | Tramway, station d'épuration, politiques publiques*, plan d'urbanisme* |
| 6. **Métropole** | plus de 250 000 | Dette, grands projets, concurrence des voisins | Métro, université, grands équipements, coopération avec les communes voisines* |

\* Outils de l'étape 4 (vraie gestion). Sans eux, le palier reste jouable avec les outils du socle.

**Règle :** un palier ne doit **jamais** exiger un système de l'étape suivante. Les paliers 5 et 6 dépendent aussi de la taille de partie : une zone « Quartier » ne pourra peut-être pas atteindre la métropole. C'est voulu et annoncé au joueur.

---

## 5. Les systèmes

### 5.1 Le socle (étape 3 : le jeu doit être complet et amusant avec lui seul)

| Système | Contenu |
|---|---|
| Routes | Tracé libre (droites et courbes), intersections automatiques, 3 à 4 gabarits (chemin, rue, avenue, voie rapide), ponts sur l'eau, pentes limitées par le vrai relief |
| Zones | Habitat, commerce, activités (artisanat, industrie, bureaux), 2 à 3 niveaux de densité |
| Bâtiments | Poussent tout seuls dans les zones selon la demande ; formes au sol réelles en mode Ville réelle ; évoluent visiblement (rénovation, surélévation) |
| Population | **Ménages** (taille, âge, revenus, emploi), simulés par groupes logés dans les bâtiments. Un échantillon d'habitants est visible dans la rue |
| Emploi et trajets | Chaque ménage actif cherche un emploi accessible. Les trajets domicile-travail produisent le trafic |
| Réseaux | Eau, électricité, déchets, assainissement |
| Services | École, santé, sécurité (police, pompiers), parcs. Chacun a une zone desservie et une capacité |
| Transports | Voiture, bus, puis tram et métro aux paliers suivants |
| Budget simple | Recettes (impôts locaux, activité) moins dépenses (entretien, salaires des services) ; un emprunt simple |
| Croissance | La demande (habitat, commerce, activités) dépend des emplois, des services, du prix et de l'attractivité |
| Bac à sable | Argent illimité, tout débloqué, croissance instantanée en option |
| Tutoriel | Court, par la pratique, intégré aux premières minutes (pas un mode à part) |
| Sauvegardes | Automatiques (rotation), manuelles, cloud Steam, versionnées |

### 5.2 La vraie gestion (étape 4 : module activable qui se branche sur le socle)

- **Budget détaillé :** recettes par source, dépenses par service, investissement séparé du fonctionnement, dette (taux, durée), dotations de l'État selon les règles du pays.
- **Satisfaction** par quartier et par type d'habitant (familles, retraités, étudiants, actifs aisés ou modestes).
- **Politiques publiques :** logement (logement social, encadrement), transports (zones piétonnes, stationnement, tarifs), commerce, environnement.
- **Environnement :** bruit, pollution de l'air et de l'eau, inondations (à partir des vraies rivières et du relief), îlots de chaleur, espaces verts.
- **Événements :** tempête, fermeture d'usine, pénurie de médecins, projet immobilier, canicule. Chacun propose des choix, jamais une seule bonne réponse.
- **Objectifs facultatifs :** ville verte, attractive, solidaire, économe.
- **Difficultés :** Découverte, Réaliste, Crise. Elles changent les réglages, pas les règles.

### 5.3 Élections et conseil municipal (étape 5 : module désactivable)

- Mandat de 6 ans en France (règle par pays). Des promesses choisies en début de mandat servent d'objectifs.
- **Conseil municipal :** les grandes décisions (budget annuel, grands projets) sont votées. Il y a des groupes d'opposition **fictifs**, sans parti ni personne réels, et des compromis possibles.
- **Perdre une élection ne supprime jamais la partie.** Le joueur choisit une suite :
  - devenir chef de l'opposition pendant un mandat (il voit la ville évoluer et peut proposer) ;
  - reprendre la ville sous une nouvelle équipe, avec une pénalité de popularité ;
  - continuer en mode sans élections.

### 5.4 Règles génériques et règles par pays

- **Le simulateur utilise des règles génériques** : impôts, services, croissance.
- **Un fichier par pays les surcharge** : impôts locaux, dotations, mandat, seuils des services, sources de données.
- France et États-Unis d'abord. Ailleurs, on applique les règles génériques avec des estimations prudentes, signalées au joueur.

---

## 6. Tailles de partie

| Taille | Zone | Cible | Configuration recommandée |
|---|---|---|---|
| Quartier | 4 × 4 km | 2 000 à 50 000 bâtiments réels | **À mesurer** sur de vrais PC (le prototype servira de mesure) |
| Ville | 10 × 10 km | Jusqu'à environ 280 000 bâtiments réels | À mesurer |
| Grande zone | jusqu'à 20 × 20 km | À mesurer | **Rien n'est promis avant les mesures** |

- Seule la zone de jeu est chargée. Le paysage autour est un décor simplifié.
- **Les objets lointains sont simplifiés** : moins de détails, regroupement par pâtés de maisons.

---

## 7. Ambiance et immersion

- **Style visuel « maquette vivante » :** couleurs douces, formes nettes, belle lumière. Pas de faux photoréalisme. Une direction artistique sera écrite avant de choisir les assets.
- **Lumière :** jour, nuit (fenêtres allumées, éclairage des rues), 4 saisons, pluie, neige, brouillard.
- **Caméra :** caméra libre et vue à hauteur d'habitant (on se promène dans sa rue).
- **Sons :** ambiances différentes en ville, à la campagne, sur le littoral et à la montagne, qui changent avec l'heure et la météo.
- **Journal local, messages d'habitants et événements municipaux :** textes écrits à l'avance et assemblés par le jeu, **sans IA générative en direct**. Ils ne visent ni personne réelle ni élu réel.
- **Mode capture :** pas d'interface, caméra libre, réglage de l'heure et de la météo.

---

## 8. Ce qui est volontairement exclu de la V1

- Multijoueur, mobile, navigateur, consoles.
- IA générative en direct dans le jeu, publicité, microtransactions, minuteurs.
- Personnes réelles, élus réels, partis réels, données individuelles.
- Frontières nationales tracées, et villes dans des zones contestées majeures.
- **Gestion intérieure des bâtiments** et vie détaillée de chaque habitant : on simule des ménages, on montre un échantillon.
- Catastrophes fantaisistes (monstres, météorites). Seuls les risques crédibles sont simulés.
- **Simulation de toute une métropole d'un bloc :** les très grandes villes se jouent par zone.
- Préparation à la demande de n'importe quelle ville du monde au lancement : seule une **liste de villes vérifiées**, élargie progressivement, sera ouverte.

---

## 9. Règles techniques (résumé)

- **Moteur :** Godot 4.7 avec C#. La **simulation est en C# pur**, sans dépendre du moteur, **déterministe** (même entrée, même résultat) et testée automatiquement.
- **Réglages :** tous les chiffres d'équilibrage (coûts, seuils, vitesses) sont dans des fichiers JSON, pas dans le code.
- **Modules :** socle, puis vraie gestion, puis élections. Les modules suivants s'abonnent à des événements du socle (« fin de mois », « budget calculé »). Le socle ne les connaît pas.
- **Sauvegardes :**
  - elles portent un numéro de version, et un convertisseur fait passer chaque ancienne version à la suivante ;
  - les sauvegardes de chaque version publiée sont conservées comme tests ;
  - des sauvegardes vieillies artificiellement (plus de 50 heures simulées) sont testées en continu.
- **Données de ville :** paquet versionné et hors ligne, sous licence ODbL, avec un fichier de sources et la note de qualité.
- **Aucune clé secrète dans le jeu.** Aucun serveur n'est nécessaire pour jouer une ville déjà téléchargée.

---

## 10. Le prototype de plaisir (étape 2) : ce qu'il doit prouver

- **Ville :** Annecy (lac, montagne, données de bonne qualité). Paquet : `donnees/villes/fr-annecy_quartier_v1`.
- **Taille :** Quartier. **Mode :** Fondation, avec le calque fantôme de la vraie ville.
- **Contenu :** zones habitat, commerce et activités ; routes ; eau ; électricité ; école ; un bus simple ; budget de base ; croissance visible.
- **Durée :** 20 minutes de partie.
- **Question unique : est-ce que le propriétaire a envie de continuer à jouer ?** Si la réponse est non, on améliore la boucle avant d'ajouter du contenu.
- **Hors prototype :** saisons, météo, vue piéton détaillée, sons travaillés, menus complets.

---

## 11. Questions ouvertes (à trancher par le propriétaire)

- **Q1.** Mode de départ : garder les deux modes (Fondation et Ville réelle) ? Proposition : oui, Fondation pour le prototype, Ville réelle avec le socle.
- **Q2.** Ville du prototype : Annecy ? Lyon ? Ta ville ?
- **Q3.** Nom du jeu : parmi Maporia, Townfold, Mayorama, Civora, Hometown Mayor, après recherche de marque.
- **Q4.** Durée d'un mois de jeu en vitesse normale (1 minute proposé) : à régler en jouant au prototype.

---

## 12. Journal des décisions

| Date | Décision | Par |
|---|---|---|
| 2026-11-01 | Étape 0 validée (« Ok commence »). Passage à l'étape 1. | Propriétaire |
| 2026-11-01 | Outils et assets payants acceptés s'ils sont les meilleurs pour le projet. | Propriétaire |
| 2026-11-01 | Moteur : Godot 4.7 avec C#, simulation indépendante du moteur. | Recommandation acceptée avec l'étape 0 |
| 2026-11-01 | Données : Overture Maps et Copernicus partout ; IGN et INSEE (France) ; Census et USGS (États-Unis). Liste de villes vérifiées au lancement. | Recommandation acceptée avec l'étape 0 |
| 2026-11-01 | Dossier de conception accepté (« je te fais confiance ») : mode Fondation et Annecy pour le prototype. | Propriétaire |
| 2026-11-01 | Lot 3 : outil de préparation de ville (extraire hors moteur, construire déterministe), format de paquet v1, paquet Annecy Quartier produit. | Lot 3 |
| 2026-11-01 | Lot 4 : simulation C# (net8.0) séparée du moteur, projet Godot 4.7.2 .NET, banc d'affichage Annecy 3D + 10 000 véhicules ; export Windows produit. FPS réels à mesurer sur le PC du propriétaire. | Lot 4 |
| 2026-11-02 | Lot 5 : prototype de plaisir jouable (Annecy, Fondation) : routes, parcelles, zones, croissance à 3 niveaux, eau, électricité, école, parc, bus, budget, emprunts, paliers, messages, sauvegarde. Réglages dans donnees/reglages/prototype.json. **En attente du test de plaisir du propriétaire.** | Lot 5 |
| 2026-11-01 | Accès Anticipé recommandé, prix visé de 24,99 $ puis 29,99 $ à la 1.0. | Recommandation, **à confirmer à l'étape 7** |
