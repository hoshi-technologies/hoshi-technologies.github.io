namespace Ville.Coeur;

public sealed partial class Partie
{
    private static readonly string[] Prenoms =
        { "Camille", "Lucas", "Inès", "Hugo", "Léa", "Nathan", "Chloé", "Yanis", "Manon", "Théo", "Sarah", "Malik", "Jeanne", "Paul", "Aïcha", "Tom" };

    private string Habitant() => Prenoms[_alea.Entre(0, Prenoms.Length)];

    public int Capacite(Batiment b) => b.CapaciteFixe ?? R.Zones[NomZone(b.Type)].Capacite[b.Niveau - 1];

    /// <summary>Capacité utilisable maintenant : pendant un agrandissement, l'ancien niveau reste en service.</summary>
    public int CapaciteActive(Batiment b) =>
        !b.EnChantier ? Capacite(b) : b.Niveau > 1 ? (b.CapaciteFixe ?? R.Zones[NomZone(b.Type)].Capacite[b.Niveau - 2]) : 0;

    /// <summary>Emplois accessibles hors de la zone (bassin d'emploi régional).</summary>
    private double EmploisExterieurs => ModeVilleReelle
        ? Math.Max(R.Demande.EmploisExterieurs, Actifs * R.VilleReelle.PartActifsTravaillantDehors)
        : R.Demande.EmploisExterieurs;
    public double Hauteur(Batiment b) => R.Zones[NomZone(b.Type)].HauteurM[b.Niveau - 1];

    public static string NomZone(Zone z) => z switch
    {
        Zone.Habitat => "habitat", Zone.Commerce => "commerce", Zone.Activites => "activites", _ => "",
    };

    /// <summary>Le nœud de route par lequel une parcelle est desservie.</summary>
    // cache (nœud, composante, reliée) par parcelle, invalidé quand le réseau change
    private readonly Dictionary<int, (int noeud, int comp, bool relie, int arete)> _infos = new();
    private int _versionInfos = -1;

    private (int noeud, int comp, bool relie) Infos(Parcelle p)
    {
        if (_versionInfos != Reseau.Version) { _infos.Clear(); _versionInfos = Reseau.Version; }
        if (_infos.TryGetValue(p.Id, out var i) && i.arete == p.Arete) return (i.noeud, i.comp, i.relie);
        int n = -1;
        if (Reseau.Aretes.TryGetValue(p.Arete, out var e))
            n = V2.Distance(Reseau.Noeuds[e.A].Pos, p.Centre) <= V2.Distance(Reseau.Noeuds[e.B].Pos, p.Centre) ? e.A : e.B;
        var r = (n, n >= 0 ? Reseau.Composante(n, R) : -1, n >= 0 && Reseau.Relie(n, R));
        _infos[p.Id] = (r.Item1, r.Item2, r.Item3, p.Arete);
        return r;
    }

    private int NoeudParcelle(Parcelle p) => Infos(p).noeud;

    public bool ParcelleReliee(Parcelle p) => Infos(p).relie;

    // ================================================================== un jour
    public void AvancerJour()
    {
        Jour++;
        if (!_servicesAJour || Jour % 3 == 0) MettreAJourServices();

        // chantiers et emménagements
        double facteur = DemandeHabitat > 0 ? 1 : DemandeHabitat > -40 ? 0.15 : -0.4;
        foreach (var p in Parcelles.Values)
        {
            var b = p.Batiment;
            if (b == null) continue;
            if (b.JoursChantier > 0)
            {
                if (--b.JoursChantier == 0) CarresModifies.Add(Carre(p.Centre));
                if (b.Niveau == 1) continue;
            }
            if (b.Type == Zone.Habitat && b.Eau && b.Elec)
                b.Occupants = Math.Clamp(b.Occupants + R.EmmenagementsParJour * facteur, 0, CapaciteActive(b));
        }

        Croissance();
        if (Jour % R.JoursParMois == 0) FinDeMois();
    }

    private readonly Dictionary<int, (double eau, double elec)> _resteParComposante = new();

    private void Croissance()
    {
        var demandes = new[] { (Zone.Habitat, DemandeHabitat), (Zone.Commerce, DemandeCommerce), (Zone.Activites, DemandeActivites) };
        foreach (var (zone, d) in demandes)
        {
            if (d <= 0) continue;
            int nb = (int)(d / 50) + (_alea.Reel() < (d % 50) / 50 ? 1 : 0);
            nb = Math.Min(nb, R.Demande.ConstructionsMaxParJour);
            if (nb == 0) continue;
            var cap = R.Zones[NomZone(zone)].Capacite[0];
            double besoinEau = cap * (zone == Zone.Habitat ? R.PersonnesParLogement * R.Consommation.EauParHabitant : R.Consommation.EauParEmploi);
            double besoinElec = cap * (zone == Zone.Habitat ? R.PersonnesParLogement * R.Consommation.ElecParHabitant : R.Consommation.ElecParEmploi);
            var candidats = new List<(Parcelle p, double score, int comp)>();
            foreach (var p in Parcelles.Values)
            {
                if (p.Zone != zone || !p.Libre) continue;
                var (n, comp, relie) = Infos(p);
                if (n < 0 || !relie) continue;
                if (!ModeVilleReelle && (!_resteParComposante.TryGetValue(comp, out var reste) || reste.eau < besoinEau || reste.elec < besoinElec)) continue;
                candidats.Add((p, p.Attrait + _alea.Reel() * 20, comp));
            }
            foreach (var (p, _, comp) in candidats.OrderByDescending(c => c.score).ThenBy(c => c.p.Id).Take(nb))
            {
                if (!ModeVilleReelle)
                {
                    var reste = _resteParComposante[comp];
                    if (reste.eau < besoinEau || reste.elec < besoinElec) continue;
                    _resteParComposante[comp] = (reste.eau - besoinEau, reste.elec - besoinElec);
                }
                p.Batiment = new Batiment { Type = zone, JoursChantier = R.JoursConstruction, Eau = true, Elec = true };
                CarresModifies.Add(Carre(p.Centre));
            }
        }
    }

    // ================================================================== services, emplois, demande
    public void MettreAJourServices()
    {
        _servicesAJour = true;
        var prodEau = new Dictionary<int, double>();
        var prodElec = new Dictionary<int, double>();
        var prodDechets = new Dictionary<int, double>();
        double totalEau = 0, totalElec = 0, totalDechets = 0;
        foreach (var p in Parcelles.Values)
        {
            if (p.Service == null) continue;
            var s = R.Services[p.Service];
            if (s.Eau <= 0 && s.Electricite <= 0 && s.Dechets <= 0) continue;
            var (n, c, _) = Infos(p);
            if (n < 0) continue;
            prodEau[c] = prodEau.GetValueOrDefault(c) + s.Eau;
            prodElec[c] = prodElec.GetValueOrDefault(c) + s.Electricite;
            prodDechets[c] = prodDechets.GetValueOrDefault(c) + s.Dechets;
            totalEau += s.Eau; totalElec += s.Electricite; totalDechets += s.Dechets;
        }

        // population et emplois
        double logements = 0, capCommerce = 0, capActivites = 0, capServices = 0;
        foreach (var p in Parcelles.Values)
        {
            if (p.Service != null) { capServices += R.Services[p.Service].Emplois; continue; }
            var b = p.Batiment;
            if (b == null) continue;
            if (b.Type == Zone.Habitat) logements += b.Occupants;
            else if (b.Type == Zone.Commerce) capCommerce += CapaciteActive(b);
            else capActivites += CapaciteActive(b);
        }
        Population = (int)Math.Round(logements * R.PersonnesParLogement);
        Actifs = (int)Math.Round(Population * R.PartActifs);
        Enfants = (int)Math.Round(Population * R.PartEnfants);
        double emploisTotal = capCommerce + capActivites + capServices;
        // emplois occupés : par les habitants, et par des travailleurs venus de l'extérieur (limités)
        double remplissage = emploisTotal <= 0 ? 0 : Math.Min(1, (Actifs + EmploisExterieurs) / emploisTotal);
        EmploisLocaux = (int)Math.Round(emploisTotal * remplissage);
        Chomeurs = (int)Math.Max(0, Actifs - emploisTotal - EmploisExterieurs);

        // distribution de l'eau et de l'électricité, bâtiment par bâtiment (ordre stable)
        var consEau = new Dictionary<int, double>();
        var consElec = new Dictionary<int, double>();
        var consDechets = new Dictionary<int, double>();
        double totalConsEau = 0, totalConsElec = 0, totalConsDechets = 0;
        bool dechetsActifs = Palier >= 1 && !BacASable;
        foreach (var p in Parcelles.Values)
        {
            var b = p.Batiment;
            if (b == null) continue;
            var (n, c, relieP) = Infos(p);
            double occ = b.Type == Zone.Habitat ? b.Occupants * R.PersonnesParLogement : CapaciteActive(b) * remplissage;
            double ce = occ * (b.Type == Zone.Habitat ? R.Consommation.EauParHabitant : R.Consommation.EauParEmploi);
            double cl = occ * (b.Type == Zone.Habitat ? R.Consommation.ElecParHabitant : R.Consommation.ElecParEmploi);
            double ue = consEau.GetValueOrDefault(c) + ce, ul = consElec.GetValueOrDefault(c) + cl;
            bool regional = ModeVilleReelle && relieP;
            b.Eau = c >= 0 && (regional || ue <= prodEau.GetValueOrDefault(c) + 1e-6);
            b.Elec = c >= 0 && (regional || ul <= prodElec.GetValueOrDefault(c) + 1e-6);
            if (b.Eau) consEau[c] = ue;
            if (b.Elec) consElec[c] = ul;
            double cd = occ * (b.Type == Zone.Habitat ? R.Consommation.DechetsParHabitant : R.Consommation.DechetsParEmploi);
            double ud = consDechets.GetValueOrDefault(c) + cd;
            b.Dechets = !dechetsActifs || regional || (c >= 0 && ud <= prodDechets.GetValueOrDefault(c) + 1e-6);
            if (b.Dechets && c >= 0) consDechets[c] = ud;
            totalConsEau += ce; totalConsElec += cl; totalConsDechets += cd;
        }
        _resteParComposante.Clear();
        foreach (var c in prodEau.Keys)
            _resteParComposante[c] = (prodEau[c] - consEau.GetValueOrDefault(c), prodElec.GetValueOrDefault(c) - consElec.GetValueOrDefault(c));
        EauProduite = totalEau; EauConsommee = totalConsEau;
        DechetsCapacite = totalDechets; DechetsProduits = totalConsDechets;
        ElecProduite = totalElec; ElecConsommee = totalConsElec;

        // demande
        double penal(double taux) => (taux - R.Demande.ImpotReference) * 100 * R.Demande.PenaliteParPointImpot;
        double w = Math.Max(Actifs, 150);
        double vacants = emploisTotal + EmploisExterieurs - Actifs;
        double h = R.Demande.AttraitRegion + 80 * vacants / w - penal(ImpotHabitat);
        if (Enfants > 120 && !Parcelles.Values.Any(p => p.Service == "ecole")) h -= 15;
        DemandeHabitat = Math.Clamp(h, -100, 100);
        double clientsBesoin = Population / R.Demande.ClientsParEmploiCommerce;
        DemandeCommerce = Math.Clamp(100 * (clientsBesoin - capCommerce) / Math.Max(clientsBesoin, 30) - penal(ImpotCommerce) + (Population < 150 ? -40 : 0), -100, 100);
        double besoinA = Chomeurs + Actifs * R.Demande.PartActifsActivites;
        DemandeActivites = Math.Clamp(25 + 100 * (besoinA - capActivites) / Math.Max(besoinA, 40) - 25 - penal(ImpotActivites) + (Population < 100 ? -30 : 0), -100, 100);

        if (LigneBusVersion != VersionServices + Reseau.Version) CalculerLigneBus();
    }

    private int LigneBusVersion = -1;
    public double DechetsCapacite { get; private set; }
    public double DechetsProduits { get; private set; }

    /// <summary>Taux d'occupation des routes à l'heure de pointe (identifiant d'arête → charge / capacité).</summary>
    public Dictionary<int, double> Congestion { get; } = new();
    public string? RueLaPlusChargee { get; private set; }
    public int Incendies { get; private set; }

    /// <summary>
    /// Heure de pointe : un échantillon de trajets domicile-travail est réparti sur le réseau
    /// (plus court chemin), puis ramené au nombre réel de voitures.
    /// </summary>
    private void CalculerCongestion()
    {
        Congestion.Clear();
        RueLaPlusChargee = null;
        if (Population < 50) return;
        // échantillon plus petit sur les très grands réseaux (le résultat est ramené à l'échelle)
        int echantillon = Math.Clamp(1200 * 8000 / Math.Max(Reseau.Noeuds.Count, 1), 300, 1200);
        var trajets = Deplacements(echantillon);
        if (trajets.Count == 0) return;
        var g = Reseau.Graphe(R);
        double habitantsBus = 0, habitantsTotal = 0;
        foreach (var p in Parcelles.Values)
            if (p.Batiment is { Type: Zone.Habitat } b)
            {
                habitantsTotal += b.Occupants;
                if (Arrets.Count >= 2 && Arrets.Values.Any(a => V2.Distance(a.Pos, p.Centre) <= R.Services["arret_bus"].RayonM)) habitantsBus += b.Occupants;
            }
        double partBus = habitantsTotal > 0 ? 0.3 * habitantsBus / habitantsTotal : 0;
        double echelle = Actifs * R.Routes.PartTrajetsVoiture * R.Routes.PartHeureDePointe * (1 - partBus) / trajets.Count;
        var chemins = new int[trajets.Count][];
        Parallel.For(0, trajets.Count, () => new Ville.Reseau.EspaceCalcul(),
            (i, _, es) => { chemins[i] = g.Chemin(trajets[i].depart, trajets[i].arrivee, es); return es; }, _ => { });
        var charge = new Dictionary<int, double>();
        foreach (var c in chemins)
            foreach (var arc in c)
            {
                int e = g.TronconArc(arc);
                charge[e] = charge.GetValueOrDefault(e) + echelle;
            }
        double pire = 0;
        foreach (var (e, ch) in charge.OrderBy(kv => kv.Key))
        {
            if (!Reseau.Aretes.TryGetValue(e, out var ar)) continue;
            double ratio = ch / R.Routes.CapaciteVehicules.GetValueOrDefault(ar.Gabarit, 500);
            Congestion[e] = ratio;
            if (ratio > pire) { pire = ratio; RueLaPlusChargee = ar.Nom ?? (ar.Departemental ? "un grand axe" : "une de vos rues"); }
        }
        if (pire < 1) RueLaPlusChargee = null;
    }

    private void IncendiesDuMois(List<V2> casernes)
    {
        Incendies = 0;
        if (Palier < 2 || BacASable) return; // ce risque apparaît avec le palier Village, en même temps que les pompiers
        int maitrises = 0;
        double rayon = R.Services["caserne_pompiers"].RayonM;
        foreach (var p in Parcelles.Values)
        {
            var b = p.Batiment;
            if (b == null || b.EnChantier) continue;
            bool couvert = ModeVilleReelle || casernes.Any(c => V2.Distance(c, p.Centre) <= rayon);
            // couvert par une caserne : le feu est maîtrisé ; sinon le bâtiment est perdu
            if (_alea.Reel() >= R.Risques.IncendieProbaMois) continue;
            if (couvert) { maitrises++; continue; }
            p.Batiment = null;
            Incendies++;
            CarresModifies.Add(Carre(p.Centre));
        }
        if (Incendies > 0)
            Message("alerte", Incendies == 1 ? "Le journal local : « Un incendie a détruit un bâtiment. Les pompiers étaient trop loin. »"
                                             : $"Le journal local : « {Incendies} incendies ce mois-ci. Le quartier réclame une caserne de pompiers. »");
        else if (maitrises > 0)
            MessageLimite("pompiers_ok", 180, "info", "Le journal local : « Départ de feu maîtrisé en quelques minutes grâce à la caserne. »");
    }

    private void CalculerLigneBus()
    {
        LigneBusVersion = VersionServices + Reseau.Version;
        LigneBus = new List<V2>();
        if (Arrets.Count < 2) return;
        var g = Reseau.Graphe(R);
        var es = new Ville.Reseau.EspaceCalcul();
        var arrets = Arrets.Values.ToList();
        for (int k = 0; k < arrets.Count; k++)
        {
            var a = arrets[k]; var b = arrets[(k + 1) % arrets.Count];
            if (!Reseau.Aretes.TryGetValue(a.Arete, out var ea) || !Reseau.Aretes.TryGetValue(b.Arete, out var eb)) continue;
            int na = Reseau.IndexGraphe(ea.A), nb = Reseau.IndexGraphe(eb.A);
            LigneBus.Add(a.Pos);
            foreach (var arc in g.Chemin(na, nb, es)) LigneBus.Add(new V2(g.X[g.CibleArc(arc)], g.Y[g.CibleArc(arc)]));
        }
        if (LigneBus.Count > 0) LigneBus.Add(LigneBus[0]);
    }

    // ================================================================== fin de mois
    /// <summary>Temps passé dans chaque étape de la dernière fin de mois (ms), pour repérer les lenteurs.</summary>
    public Dictionary<string, double> ChronoFinDeMois { get; } = new();

    private void Etape(string nom, Action a)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        a();
        ChronoFinDeMois[nom] = sw.Elapsed.TotalMilliseconds;
    }

    private void FinDeMois()
    {
        Etape("services", MettreAJourServices);
        // très grands réseaux : l'heure de pointe est recalculée tous les 3 mois (évite une saccade chaque mois)
        if (Reseau.Noeuds.Count < 15000 || Mois % 3 == 0 || Congestion.Count == 0) Etape("congestion", CalculerCongestion);
        Etape("attrait", CalculerAttrait);
        Etape("niveaux", NiveauxEtDeparts);
        Etape("incendies", () => IncendiesDuMois(Parcelles.Values.Where(p => p.Service == "caserne_pompiers").Select(p => p.Centre).ToList()));
        Etape("budget", Budget);
        Etape("services2", MettreAJourServices);
        Paliers();
        Etape("messages", MessagesDuMois);
        Historique.Add(new PointMois(Mois, Population, EmploisLocaux, Math.Round(Argent), Math.Round(RecettesMois), Math.Round(DepensesMois)));
    }

    private void CalculerAttrait()
    {
        // grille de 40 m des sources d'attrait et de nuisance (parcs, centrale au gaz, activités)
        const double pasG = 40;
        int nG = (int)Math.Ceiling(2 * DemiCote / pasG) + 1;
        var parcs = new byte[nG * nG];
        var gaz = new byte[nG * nG];
        var activ = new byte[nG * nG];
        void Tamponner(byte[] g, V2 c, double rayon)
        {
            int r = (int)Math.Ceiling(rayon / pasG);
            int ci = (int)((c.X + DemiCote) / pasG), cj = (int)((c.Y + DemiCote) / pasG);
            for (int j = Math.Max(0, cj - r); j <= Math.Min(nG - 1, cj + r); j++)
                for (int i = Math.Max(0, ci - r); i <= Math.Min(nG - 1, ci + r); i++)
                {
                    var centre = new V2(-DemiCote + i * pasG, -DemiCote + j * pasG);
                    if (V2.Distance(centre, c) <= rayon && g[j * nG + i] < 255) g[j * nG + i]++;
                }
        }
        foreach (var p in Parcelles.Values)
        {
            if (p.Service == "parc") Tamponner(parcs, p.Centre, R.Services["parc"].RayonM);
            else if (p.Service == "centrale_gaz") Tamponner(gaz, p.Centre, R.Services["centrale_gaz"].PollutionRayonM);
            else if (p.Batiment is { Type: Zone.Activites, EnChantier: false }) Tamponner(activ, p.Centre, R.PollutionActivitesRayonM);
        }
        int Cellule(V2 c) => Math.Clamp((int)Math.Round((c.Y + DemiCote) / pasG), 0, nG - 1) * nG + Math.Clamp((int)Math.Round((c.X + DemiCote) / pasG), 0, nG - 1);

        // index spatial des logements (carrés de 250 m)
        var logementsParCarre = new Dictionary<(int, int), List<Parcelle>>();
        foreach (var p in Parcelles.Values)
            if (p.Batiment is { Type: Zone.Habitat })
            {
                var c = Carre(p.Centre);
                if (!logementsParCarre.TryGetValue(c, out var l)) logementsParCarre[c] = l = new List<Parcelle>();
                l.Add(p);
            }
        IEnumerable<Parcelle> LogementsProches(V2 pos, double rayon)
        {
            int r = (int)Math.Ceiling(rayon / TailleCarre);
            var (cx, cy) = Carre(pos);
            for (int dx = -r; dx <= r; dx++)
                for (int dy = -r; dy <= r; dy++)
                    if (logementsParCarre.TryGetValue((cx + dx, cy + dy), out var l))
                        foreach (var p in l) if (V2.Distance(p.Centre, pos) <= rayon) yield return p;
        }

        // écoles : chaque école accueille un nombre limité d'élèves, en commençant par les plus proches
        foreach (var p in Parcelles.Values) if (p.Batiment != null) p.Batiment.Ecole = 0;
        foreach (var ecole in Parcelles.Values.Where(p => p.Service == "ecole"))
        {
            var s = R.Services["ecole"];
            double places = s.Eleves;
            foreach (var p in LogementsProches(ecole.Centre, s.RayonM)
                         .OrderBy(p => V2.Distance(p.Centre, ecole.Centre)).ThenBy(p => p.Id))
            {
                var b = p.Batiment!;
                double enfants = b.Occupants * R.PersonnesParLogement * R.PartEnfants;
                double besoin = enfants * (1 - b.Ecole);
                if (besoin <= 0 || places <= 0) continue;
                double pris = Math.Min(places, besoin);
                places -= pris;
                b.Ecole = enfants <= 0 ? 1 : Math.Min(1, b.Ecole + pris / enfants);
            }
        }

        // santé : places limitées, les plus proches d'abord (comme l'école)
        foreach (var p in Parcelles.Values) if (p.Batiment != null) p.Batiment.Sante = 0;
        foreach (var cs in Parcelles.Values.Where(p => p.Service == "centre_sante"))
        {
            var s = R.Services["centre_sante"];
            double places = s.Patients;
            foreach (var p in LogementsProches(cs.Centre, s.RayonM)
                         .OrderBy(p => V2.Distance(p.Centre, cs.Centre)).ThenBy(p => p.Id))
            {
                var b = p.Batiment!;
                double habitants = b.Occupants * R.PersonnesParLogement * (1 - b.Sante);
                if (habitants <= 0 || places <= 0) continue;
                double pris = Math.Min(places, habitants);
                places -= pris;
                b.Sante = Math.Min(1, b.Sante + pris / Math.Max(b.Occupants * R.PersonnesParLogement, 1e-9));
            }
        }
        var commissariats = Parcelles.Values.Where(p => p.Service == "commissariat").Select(p => p.Centre).ToList();
        var casernes = Parcelles.Values.Where(p => p.Service == "caserne_pompiers").Select(p => p.Centre).ToList();
        bool santeExigee = Population > R.Risques.PopulationSansSanteMax && !BacASable && !ModeVilleReelle;
        bool policeExigee = Population > R.Risques.PopulationSansPoliceMax && !BacASable && !ModeVilleReelle;

        foreach (var p in Parcelles.Values)
        {
            if (p.Zone == Zone.Aucune) continue;
            double a = 40;
            if (p.Batiment is { } bb)
            {
                // en Ville réelle, les secours et la police intercommunaux existants couvrent déjà la ville
                bb.Police = ModeVilleReelle || commissariats.Any(c => V2.Distance(c, p.Centre) <= R.Services["commissariat"].RayonM);
                bb.Pompiers = ModeVilleReelle || casernes.Any(c => V2.Distance(c, p.Centre) <= R.Services["caserne_pompiers"].RayonM);
                if (ModeVilleReelle) bb.Sante = Math.Max(bb.Sante, 0.8); // médecins de ville existants
                if (!bb.Dechets) a -= 12;
                if (p.Zone == Zone.Habitat) a += bb.Sante >= 0.8 ? 6 : santeExigee ? -6 : 0;
                a += bb.Police ? 4 : policeExigee ? -8 : 0;
            }
            if (Congestion.TryGetValue(p.Arete, out var bouchon) && bouchon > 1)
                a += p.Zone == Zone.Habitat ? -Math.Min(15, 10 * (bouchon - 1)) : p.Zone == Zone.Commerce ? Math.Min(8, 5 * bouchon) : -Math.Min(10, 6 * (bouchon - 1));
            double dEau = Grille.DistanceEau(p.Centre);
            if (dEau < 300) a += 14 * (1 - dEau / 300);                       // vue sur l'eau
            if (Reseau.Aretes.TryGetValue(p.Arete, out var e) && e.Gabarit is "avenue" or "voie_rapide")
                a += p.Zone == Zone.Habitat ? -6 : 6;                         // bruit / visibilité
            int cg = Cellule(p.Centre);
            a += 10 * parcs[cg];
            if (p.Zone == Zone.Habitat) a -= 22 * gaz[cg] + 4 * Math.Max(0, activ[cg] - (p.Batiment is { Type: Zone.Activites } ? 1 : 0));
            if (Arrets.Values.Any(s => V2.Distance(s.Pos, p.Centre) <= R.Services["arret_bus"].RayonM) && Arrets.Count >= 2) a += 9;
            if (p.Batiment != null)
            {
                if (p.Zone == Zone.Habitat)
                {
                    double enfants = p.Batiment.Occupants * R.PersonnesParLogement * R.PartEnfants;
                    if (enfants > 0.5) a += p.Batiment.Ecole >= 0.8 ? 12 : -6;
                }
                if (!p.Batiment.Eau || !p.Batiment.Elec) a -= 25;
            }
            if (p.Zone == Zone.Commerce) a += Math.Min(15, Population / 200.0);
            p.Attrait = Math.Clamp(a, 0, 100);
        }
    }

    private void NiveauxEtDeparts()
    {
        int niveauMax = Palier >= 3 ? 3 : 2;
        int departs = 0, renovations = 0;
        foreach (var p in Parcelles.Values)
        {
            var b = p.Batiment;
            if (b == null || b.EnChantier) continue;
            b.MoisDepuisNiveau++;
            if (!b.Eau || !b.Elec)
            {
                b.MoisSansService++;
                if (b.MoisSansService > R.MoisSansServiceAvantDepart)
                {
                    if (b.Type == Zone.Habitat) b.Occupants = Math.Floor(b.Occupants / 2);
                    if (b.Type != Zone.Habitat || b.Occupants < 1) { p.Batiment = null; departs++; CarresModifies.Add(Carre(p.Centre)); }
                }
                continue;
            }
            b.MoisSansService = 0;
            if (b.Reel)
            {
                // les vrais bâtiments évoluent aussi : rénovation et surélévation quand le quartier est recherché
                var ev = R.EvolutionBatimentsReels;
                if (b.Niveau >= niveauMax || b.MoisDepuisNiveau < ev.MoisMinEntreRenovations) continue;
                double demandeType = b.Type == Zone.Habitat ? DemandeHabitat : b.Type == Zone.Commerce ? DemandeCommerce : DemandeActivites;
                double seuilR = b.Niveau == 1 ? R.Niveaux.AttraitNiveau2 : R.Niveaux.AttraitNiveau3;
                if (p.Attrait >= seuilR && demandeType > ev.DemandeMin && (b.Type != Zone.Habitat || b.Occupants >= Capacite(b) * 0.9))
                {
                    b.Niveau++;
                    b.MoisDepuisNiveau = 0;
                    b.CapaciteFixe = (int)Math.Ceiling((b.CapaciteFixe ?? 1) * ev.FacteurCapacite);
                    p.HauteurReelle += ev.HauteurAjouteeM;
                    renovations++;
                    CarresModifies.Add(Carre(p.Centre));
                }
                continue;
            }
            if (b.Niveau >= niveauMax || b.MoisDepuisNiveau < R.Niveaux.MoisEntreNiveaux) continue;
            double seuil = b.Niveau == 1 ? R.Niveaux.AttraitNiveau2 : R.Niveaux.AttraitNiveau3;
            bool plein = b.Type != Zone.Habitat || b.Occupants >= Capacite(b) * 0.9;
            if (p.Attrait >= seuil && plein)
            {
                b.Niveau++;
                b.MoisDepuisNiveau = 0;
                b.JoursChantier = R.JoursConstruction / 2;
                CarresModifies.Add(Carre(p.Centre));
            }
        }
        if (renovations > 0)
            MessageLimite("renovations", 60, "info", $"Le journal local : « {renovations} immeuble(s) rénové(s) et surélevé(s) : le quartier attire. »");
        if (departs > 0)
            Message("alerte", $"{departs} bâtiment(s) abandonné(s) : sans eau ou sans électricité, les occupants sont partis.");
    }

    private void Budget()
    {
        DetailRecettes.Clear(); DetailDepenses.Clear();
        double empCommerce = 0, empActivites = 0;
        double emploisTotal = Math.Max(1, Parcelles.Values.Sum(p => p.Service != null ? R.Services[p.Service].Emplois : p.Batiment is { } b && b.Type != Zone.Habitat ? CapaciteActive(b) : 0));
        double remplissage = Math.Min(1, EmploisLocaux / emploisTotal);
        foreach (var p in Parcelles.Values)
        {
            var b = p.Batiment;
            if (b == null || !b.Eau || !b.Elec) continue;
            if (b.Type == Zone.Commerce) empCommerce += CapaciteActive(b) * remplissage;
            else if (b.Type == Zone.Activites) empActivites += CapaciteActive(b) * remplissage;
        }
        double refT = R.Demande.ImpotReference;
        DetailRecettes["Impôts des habitants"] = Population * R.Impots.HabitatParHabitant * ImpotHabitat / refT;
        DetailRecettes["Impôts des commerces"] = empCommerce * R.Impots.CommerceParEmploi * ImpotCommerce / refT;
        DetailRecettes["Impôts des activités"] = empActivites * R.Impots.ActivitesParEmploi * ImpotActivites / refT;

        double routes = Reseau.Aretes.Values.Where(e => !e.Departemental && !e.Importee).Sum(e => e.Longueur / 1000 * R.Route(e.Gabarit).EntretienParKmMois);
        DetailDepenses["Entretien des routes"] = routes;
        foreach (var g in Parcelles.Values.Where(p => p.Service != null).GroupBy(p => p.Service!).OrderBy(g => g.Key))
            DetailDepenses[R.Services[g.Key].Nom] = g.Count() * R.Services[g.Key].Entretien;
        if (Arrets.Count > 0) DetailDepenses["Arrêts de bus"] = Arrets.Count * R.Services["arret_bus"].Entretien;
        if (NbBus > 0) DetailDepenses["Bus"] = NbBus * R.Bus.CoutParBusMois;
        double remboursements = 0;
        foreach (var em in Emprunts)
        {
            double interets = em.Restant * R.Emprunt.TauxAnnuel / 12;
            em.Restant = Math.Max(0, em.Restant - (em.Mensualite - interets));
            em.MoisRestants--;
            remboursements += em.Mensualite;
        }
        Emprunts.RemoveAll(e => e.MoisRestants <= 0);
        if (remboursements > 0) DetailDepenses["Remboursement des emprunts"] = remboursements;
        if (ModeVilleReelle)
        {
            var v = R.VilleReelle;
            double achat = Math.Max(0, EauConsommee - EauProduite) * v.PrixEauRegionale
                         + Math.Max(0, ElecConsommee - ElecProduite) * v.PrixElecRegionale
                         + Math.Max(0, DechetsProduits - DechetsCapacite) * v.PrixDechetsRegionaux;
            if (achat > 0) DetailDepenses["Eau, électricité, déchets (réseau régional)"] = achat;
            DetailDepenses["Secours et police intercommunaux"] = Population * v.CoutSecoursPoliceParHabitant;
            DetailDepenses["Services municipaux existants (mairie, voirie, crèches…)"] = Population * v.CoutServicesExistantsParHabitant;
        }

        RecettesMois = DetailRecettes.Values.Sum();
        DepensesMois = DetailDepenses.Values.Sum();
        Argent += RecettesMois - DepensesMois;
    }

    private void Paliers()
    {
        while (Palier + 1 < R.Paliers.Count && Population >= R.Paliers[Palier + 1].Population)
        {
            Palier++;
            Message("palier", R.Paliers[Palier].Message);
        }
    }

    private void MessagesDuMois()
    {
        var zonesSansEau = Parcelles.Values.Count(p => p.Zone != Zone.Aucune && p.Libre && ParcelleReliee(p)) > 0 && EauProduite <= EauConsommee + 1;
        if (!ModeVilleReelle && Parcelles.Values.Any(p => p.Zone != Zone.Aucune) && EauProduite <= 0)
            MessageLimite("eau0", 60, "alerte", "Les promoteurs attendent : sans château d'eau relié aux rues, rien ne se construira.");
        else if (zonesSansEau)
            MessageLimite("eau", 90, "alerte", "L'eau manque : les nouveaux bâtiments ne peuvent plus être raccordés.");
        if (!ModeVilleReelle && Parcelles.Values.Any(p => p.Zone != Zone.Aucune) && ElecProduite <= 0)
            MessageLimite("elec0", 60, "alerte", "Pas d'électricité : construisez une centrale le long d'une rue reliée.");
        else if (ElecProduite > 0 && ElecConsommee > ElecProduite * 0.95)
            MessageLimite("elec", 90, "alerte", "Le réseau électrique est saturé : il faut une centrale de plus.");
        if (Parcelles.Values.Any(p => p.Zone != Zone.Aucune && !ParcelleReliee(p)))
            MessageLimite("relie", 120, "alerte", "Certaines rues ne sont reliées à aucun grand axe : personne ne peut y venir.");
        if (Actifs > 200 && Chomeurs > Actifs * 0.12)
            MessageLimite("chomage", 90, "habitant", $"{Habitant()} : « Je cherche du travail depuis des mois. Il faudrait des commerces ou des zones d'activités ici. »");
        if (DemandeCommerce > 50 && Population > 300)
            MessageLimite("commerce", 90, "habitant", $"{Habitant()} : « Il faut prendre la voiture pour acheter du pain ! »");
        if (Enfants > 120 && Parcelles.Values.Any(p => p.Batiment is { Type: Zone.Habitat, Ecole: < 0.5 } b && b.Occupants > 2))
            MessageLimite("ecole", 90, "habitant", $"{Habitant()} : « Nos enfants n'ont pas de place à l'école près de chez nous. »");
        if (DechetsProduits > DechetsCapacite + 1 && Palier >= 1 && !BacASable && !ModeVilleReelle)
            MessageLimite("dechets", 90, "habitant", $"{Habitant()} : « Les poubelles ne sont plus ramassées dans ma rue ! » (centre de tri saturé ou absent)");
        if (Population > R.Risques.PopulationSansSanteMax && !Parcelles.Values.Any(p => p.Service == "centre_sante") && !BacASable && !ModeVilleReelle)
            MessageLimite("sante", 120, "habitant", $"{Habitant()} : « Il faut attendre trois semaines pour voir un médecin. »");
        if (Population > R.Risques.PopulationSansPoliceMax && !Parcelles.Values.Any(p => p.Service == "commissariat") && !BacASable && !ModeVilleReelle)
            MessageLimite("police", 120, "habitant", $"{Habitant()} : « Des vols de vélos toutes les nuits, et pas de commissariat. »");
        if (RueLaPlusChargee != null)
            MessageLimite("bouchons", 120, "habitant", $"{Habitant()} : « Tous les matins, c'est bouché sur {RueLaPlusChargee}. »");
        if (ImpotHabitat > 0.15)
            MessageLimite("impots", 120, "habitant", $"{Habitant()} : « Avec ces impôts, je pense déménager. »");
        if (Argent < 0)
            MessageLimite("budget", 60, "alerte", "Les caisses sont vides : réduisez les dépenses, augmentez un peu les impôts ou empruntez.");
        if (Population > 50 && Parcelles.Values.Any(p => p.Batiment is { Type: Zone.Habitat } && Grille.DistanceEau(p.Centre) < 120))
            MessageLimite("lac", 100000, "info", "Le journal local : « Les terrains avec vue sur l'eau sont les plus recherchés de la commune. »");
        if (Population >= 800 && Arrets.Count == 0 && Palier >= 2)
            MessageLimite("bus", 150, "habitant", $"{Habitant()} : « Une ligne de bus éviterait de prendre la voiture pour tout. »");
    }

    // ================================================================== déplacements (pour l'affichage du trafic)
    /// <summary>Trajets domicile → travail (indices du graphe), proportionnels à la population.</summary>
    public List<(int depart, int arrivee)> Deplacements(int max)
    {
        var g = Reseau.Graphe(R);
        var maisons = new List<int>();
        var travail = new List<int>();
        foreach (var p in Parcelles.Values)
        {
            if (p.Batiment == null || p.Batiment.EnChantier) continue;
            int n = NoeudParcelle(p);
            if (n < 0 || !Reseau.Relie(n, R)) continue;
            if (p.Batiment.Type == Zone.Habitat)
                for (int k = 0; k < Math.Ceiling(p.Batiment.Occupants / 3); k++) maisons.Add(Reseau.IndexGraphe(n));
            else travail.Add(Reseau.IndexGraphe(n));
        }
        foreach (var n in Reseau.Noeuds.Values.Where(n => n.Entree && Reseau.Degre(n.Id) > 0)) travail.Add(Reseau.IndexGraphe(n.Id));
        var res = new List<(int, int)>();
        if (maisons.Count == 0 || travail.Count == 0) return res;
        var alea = new Ville.Outils.Alea((ulong)Jour + 7);
        int nb = Math.Min(max, maisons.Count);
        for (int i = 0; i < nb; i++) res.Add((maisons[alea.Entre(0, maisons.Count)], travail[alea.Entre(0, travail.Count)]));
        return res;
    }
}
