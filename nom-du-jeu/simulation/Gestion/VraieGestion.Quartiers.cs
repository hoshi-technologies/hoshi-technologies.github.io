using Ville.Coeur;

namespace Ville.Gestion;

/// <summary>Satisfaction par quartier et par type d'habitant, politiques publiques, objectifs facultatifs.</summary>
public sealed partial class VraieGestion
{
    public enum Profil { Familles, JeunesActifs, Seniors }

    public sealed record Quartier((int, int) Cle, string Nom, int Population, double Familles, double JeunesActifs, double Seniors)
    {
        public double Satisfaction => Population == 0 ? 50 : (Familles + JeunesActifs + Seniors) / 3;
    }

    private Dictionary<(int, int), double>? _cacheSatisfaction;
    private Dictionary<(int, int), double> _satisfactionParQuartier => _cacheSatisfaction ??= Quartiers.ToDictionary(q => q.Cle, q => q.Satisfaction);
    public List<Quartier> Quartiers => E.Quartiers.Select(q => new Quartier((q.I, q.J), q.Nom, q.Population, q.Familles, q.JeunesActifs, q.Seniors)).ToList();
    public double SatisfactionGlobale => E.SatisfactionGlobale;

    private double TailleQuartier => C("quartier_taille_m");
    public (int, int) CleQuartier(V2 p) => ((int)Math.Floor(p.X / TailleQuartier), (int)Math.Floor(p.Y / TailleQuartier));

    /// <summary>Satisfaction du quartier où se trouve ce point, ou null si personne n'y habite.</summary>
    public double? SatisfactionEn(V2 p) => _satisfactionParQuartier.TryGetValue(CleQuartier(p), out var s) ? s : null;

    public bool Active(string politique) => E.Politiques.Contains(politique);

    /// <summary>Liste des politiques : identifiant, nom, coût par habitant et par mois, effet.</summary>
    public IEnumerable<(string id, string nom, double cout, string effet)> CataloguePolitiques()
    {
        foreach (var p in _cfg.GetProperty("politiques").EnumerateObject())
            yield return (p.Name, p.Value.GetProperty("nom").GetString()!, p.Value.GetProperty("cout_par_habitant").GetDouble(), p.Value.GetProperty("effet").GetString()!);
    }

    public void ActiverPolitique(Partie p, string id, bool active)
    {
        if (active && !E.Politiques.Contains(id)) { E.Politiques.Add(id); E.Politiques.Sort(); }
        if (!active) E.Politiques.Remove(id);
        p.Invalider();
    }

    private void PolitiquesDuMois(Partie p)
    {
        double total = 0;
        foreach (var (id, _, cout, _) in CataloguePolitiques())
            if (Active(id)) total += cout * p.Population;
        if (total > 0) p.Depense("Politiques publiques", Math.Round(total * D("couts")));
        else if (total < 0) p.Recette("Économies (politiques publiques)", Math.Round(-total));
    }

    public double ModifierDemande(Partie p, Zone z, double d) => z switch
    {
        Zone.Habitat => d + (Active("logement_social") ? 6 : 0) - (Active("encadrement_loyers") ? 10 : 0),
        Zone.Commerce => d + (Active("aide_commerces") ? 12 : 0) + (Active("zones_pietonnes") ? 8 : 0),
        _ => d,
    };

    public double FacteurVoitures(Partie p) =>
        (Active("transports_gratuits") ? 0.85 : 1) * (Active("plan_velo") ? 0.9 : 1) * (Active("zones_pietonnes") ? 1.03 : 1);

    // ------------------------------------------------------------------ satisfaction
    private void CalculerSatisfaction(Partie p)
    {
        var arrets = p.Arrets.Values.Select(a => a.Pos).ToList();
        double rayonBus = p.R.Services["arret_bus"].RayonM;
        var parcs = p.Parcelles.Values.Where(x => x.Service == "parc").Select(x => x.Centre).ToList();
        double emploi = p.Actifs <= 0 ? 1 : 1 - Math.Clamp(p.Chomeurs / (double)p.Actifs * 4, 0, 1);
        double impots = 1 - Math.Clamp((p.ImpotHabitat - 0.08) / 0.12, 0, 1);
        double commerces = p.DemandeCommerce < 25 ? 1 : 0.4;
        var cumul = new Dictionary<(int, int), double[]>(); // pop, familles, jeunes, seniors (pondérés)
        foreach (var par in p.Parcelles.Values)
        {
            if (par.Batiment is not { Type: Zone.Habitat } b || b.Occupants <= 0) continue;
            double hab = b.Occupants * p.R.PersonnesParLogement;
            bool bus = p.Arrets.Count >= 2 && arrets.Any(a => V2.Distance(a, par.Centre) <= rayonBus);
            bool parc = parcs.Any(c => V2.Distance(c, par.Centre) <= 300);
            double bouchon = 1 - Math.Clamp(p.Congestion.GetValueOrDefault(par.Arete) / 2, 0, 1);
            double cadre = par.Attrait / 100;
            double loyer = b.Niveau == 3 && !Active("encadrement_loyers") && !Active("logement_social") ? 0.4 : 1;
            double police = b.Police ? 1 : Active("eclairage_reduit") ? 0 : 0.3;
            double familles = 35 * b.Ecole + 15 * (parc ? 1 : 0) + 15 * police + 15 * cadre + 20 * impots
                              + (Active("logement_social") ? 6 : 0) + (Active("vegetalisation") ? 5 : 0) + (Active("zones_pietonnes") ? 4 : 0);
            double jeunes = 35 * emploi + 20 * (bus ? 1 : 0) + 15 * commerces + 15 * bouchon + 15 * loyer
                            + (Active("transports_gratuits") ? 8 : 0) + (Active("plan_velo") ? 5 : 0) + (Active("encadrement_loyers") ? 6 : 0);
            double seniors = 35 * b.Sante + 20 * police + 15 * bouchon + 15 * (bus ? 1 : 0) + 15 * impots
                             + (Active("transports_gratuits") ? 6 : 0) + (Active("aide_commerces") ? 5 : 0) + (Active("vegetalisation") ? 3 : 0);
            if (E.MoisPenurieMedecins > 0) seniors -= 10;
            var (pf, pj, ps) = b.Niveau switch { 1 => (0.45, 0.25, 0.30), 2 => (0.35, 0.35, 0.30), _ => (0.25, 0.50, 0.25) };
            var k = CleQuartier(par.Centre);
            if (!cumul.TryGetValue(k, out var c)) cumul[k] = c = new double[7];
            c[0] += hab;
            c[1] += Math.Clamp(familles, 0, 100) * hab * pf; c[4] += hab * pf;
            c[2] += Math.Clamp(jeunes, 0, 100) * hab * pj; c[5] += hab * pj;
            c[3] += Math.Clamp(seniors, 0, 100) * hab * ps; c[6] += hab * ps;
        }
        var noms = NomsQuartiers(p);
        E.Quartiers = cumul.OrderBy(kv => kv.Key)
            .Select(kv => new QuartierEtat(kv.Key.Item1, kv.Key.Item2, noms.GetValueOrDefault(kv.Key, $"Secteur {kv.Key.Item1},{kv.Key.Item2}"), (int)Math.Round(kv.Value[0]),
                Math.Round(kv.Value[1] / Math.Max(kv.Value[4], 1e-9), 3), Math.Round(kv.Value[2] / Math.Max(kv.Value[5], 1e-9), 3), Math.Round(kv.Value[3] / Math.Max(kv.Value[6], 1e-9), 3)))
            .ToList();
        _cacheSatisfaction = null;
        var quartiers = Quartiers;
        double pop = quartiers.Sum(q => q.Population);
        E.SatisfactionGlobale = pop > 0 ? Math.Round(quartiers.Sum(q => q.Satisfaction * q.Population) / pop, 3) : 50;
        var pire = quartiers.Where(q => q.Population > 200).OrderBy(q => q.Satisfaction).FirstOrDefault();
        if (pire != null && pire.Satisfaction < 40)
        {
            var (profil, valeur) = new[] { ("les familles", pire.Familles), ("les jeunes actifs", pire.JeunesActifs), ("les seniors", pire.Seniors) }.MinBy(x => x.Item2);
            p.PublierLimite("quartier_" + pire.Nom, 120, "habitant", $"Le journal local : « Colère dans le quartier {pire.Nom} : {profil} se sentent oubliés ({valeur:F0}/100). »");
        }
    }

    /// <summary>Nom d'un quartier : la rue nommée la plus longue qui le traverse.</summary>
    private static Dictionary<(int, int), string> NomsQuartiers(Partie p)
    {
        var g = p.Module<VraieGestion>()!;
        var longueurs = new Dictionary<(int, int), Dictionary<string, double>>();
        foreach (var e in p.Reseau.Aretes.Values)
        {
            if (e.Nom == null || e.Trace.Count == 0) continue;
            var k = g.CleQuartier(e.Trace[e.Trace.Count / 2]);
            if (!longueurs.TryGetValue(k, out var d)) longueurs[k] = d = new();
            d[e.Nom] = d.GetValueOrDefault(e.Nom) + e.Longueur;
        }
        return longueurs.ToDictionary(kv => kv.Key, kv => kv.Value.OrderByDescending(x => x.Value).ThenBy(x => x.Key).First().Key);
    }

    // ------------------------------------------------------------------ objectifs facultatifs
    public static readonly (string id, string nom)[] ListeObjectifs =
    {
        ("verte", "Ville verte"), ("attractive", "Ville attractive"), ("solidaire", "Ville solidaire"), ("econome", "Ville économe"),
    };

    public void ChoisirObjectif(string? id) => E.Objectif = id;

    /// <summary>Conditions d'un objectif, avec pour chacune son état.</summary>
    public List<(string condition, bool ok)> Conditions(Partie p, string id)
    {
        int parcs = p.Parcelles.Values.Count(x => x.Service == "parc");
        double croissance = E.PopulationParMois.Count >= 13 && E.PopulationParMois[^13] > 0
            ? E.PopulationParMois[^1] / (double)E.PopulationParMois[^13] - 1 : 0;
        return id switch
        {
            "verte" => new()
            {
                ($"Un parc pour 1 500 habitants ({parcs} / {Math.Max(1, p.Population / 1500)})", parcs >= Math.Max(1, p.Population / 1500)),
                ("Aucune centrale au gaz", !p.Parcelles.Values.Any(x => x.Service == "centrale_gaz")),
                ("Plan vélo ou végétalisation actif", Active("plan_velo") || Active("vegetalisation")),
                ($"Satisfaction moyenne ≥ 55 ({SatisfactionGlobale:F0})", SatisfactionGlobale >= 55),
            },
            "attractive" => new()
            {
                ($"Population en hausse de 10 % sur un an ({croissance * 100:F0} %)", croissance >= 0.10),
                ($"Demande d'habitat > 20 ({p.DemandeHabitat:F0})", p.DemandeHabitat > 20),
                ($"Au moins 3 000 habitants ({p.Population:N0})", p.Population >= 3000),
            },
            "solidaire" => new()
            {
                ("Logement social actif", Active("logement_social")),
                ($"Aucun quartier sous 50 de satisfaction", Quartiers.Where(q => q.Population > 200).All(q => q.Satisfaction >= 50)),
                ($"Chômage < 8 % ({(p.Actifs > 0 ? 100.0 * p.Chomeurs / p.Actifs : 0):F0} %)", p.Actifs > 0 && p.Chomeurs < 0.08 * p.Actifs),
            },
            "econome" => new()
            {
                ("Aucun emprunt en cours", p.Emprunts.Count == 0),
                ($"Taxe des habitants ≤ 9 % ({p.ImpotHabitat * 100:F1} %)", p.ImpotHabitat <= 0.09),
                ("Budget du mois positif", p.RecettesMois >= p.DepensesMois),
                ("Trésorerie positive", p.Argent > 0),
            },
            _ => new(),
        };
    }

    private void SuivreObjectifs(Partie p)
    {
        E.PopulationParMois.Add(p.Population);
        if (E.PopulationParMois.Count > 24) E.PopulationParMois.RemoveAt(0);
        foreach (var (id, nom) in ListeObjectifs)
        {
            if (E.ObjectifsAtteints.Contains(id) || p.Population < 500) continue;
            if (Conditions(p, id).All(c => c.ok))
            {
                E.ObjectifsAtteints.Add(id);
                p.Publier("palier", $"Objectif atteint : « {nom} » ! Le journal local salue la politique municipale.");
            }
        }
    }
}
