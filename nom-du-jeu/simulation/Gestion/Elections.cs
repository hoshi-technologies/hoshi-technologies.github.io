using System.Runtime.CompilerServices;
using System.Text.Json;
using Ville.Coeur;

namespace Ville.Gestion;

/// <summary>
/// Module « élections et conseil municipal » (désactivable) : mandats, promesses, popularité,
/// votes du conseil sur les politiques publiques, élections avec une suite en cas de défaite.
/// Tous les groupes sont fictifs : aucun parti ni personne réels.
/// </summary>
public sealed class Elections : IModule
{
    public const string Identifiant = "elections";
    public string Id => Identifiant;

#pragma warning disable CA2255 // enregistrement automatique du module au chargement de la bibliothèque
    [ModuleInitializer]
    internal static void Enregistrer() => Partie.FabriquesModules[Identifiant] = r => new Elections(r);
#pragma warning restore CA2255

    private readonly JsonElement _cfg;
    private double C(string cle) => _cfg.GetProperty(cle).GetDouble();

    public sealed class Etat
    {
        public int DebutMandat { get; set; }
        public int Mandat { get; set; } = 1;
        public List<string> Promesses { get; set; } = new();
        public double Popularite { get; set; } = 55;
        /// <summary>Sièges : « maire » puis chaque groupe d'opposition.</summary>
        public Dictionary<string, int> Sieges { get; set; } = new();
        public int PopulationDebutMandat { get; set; }
        public int MoisOppositionRestants { get; set; }
        public List<string> Historique { get; set; } = new();
        public bool CampagneAnnoncee { get; set; }
        /// <summary>Défaite annoncée, en attente du choix du joueur.</summary>
        public bool DefaiteEnAttente { get; set; }
    }
    public Etat E { get; private set; } = new();

    public Elections(Reglages r) =>
        _cfg = r.Extra.TryGetValue("elections", out var c) ? c : throw new InvalidDataException("Réglages « elections » absents.");

    public IEnumerable<(string id, string nom, string[] priorites)> Groupes() =>
        _cfg.GetProperty("groupes").EnumerateArray().Select(g => (g.GetProperty("id").GetString()!, g.GetProperty("nom").GetString()!,
            g.GetProperty("priorites").EnumerateArray().Select(x => x.GetString()!).ToArray()));

    public IEnumerable<(string id, string nom)> CataloguePromesses() =>
        _cfg.GetProperty("promesses").EnumerateArray().Select(g => (g.GetProperty("id").GetString()!, g.GetProperty("nom").GetString()!));

    public int MoisRestants(Partie p) => (int)C("duree_mandat_mois") - (p.Mois - E.DebutMandat);
    public bool PromessesModifiables(Partie p) => p.Mois - E.DebutMandat < C("mois_pour_choisir_promesses") && E.MoisOppositionRestants == 0;
    public int TotalSieges => E.Sieges.Values.Sum();
    public bool EnOpposition => E.MoisOppositionRestants > 0;

    /// <summary>À appeler au démarrage d'une partie avec ce module.</summary>
    public void Initialiser(Partie p)
    {
        E.DebutMandat = p.Mois;
        E.PopulationDebutMandat = p.Population;
        RepartirSieges(p, 0.58);
    }

    private void RepartirSieges(Partie p, double partMaire)
    {
        int total = (int)Math.Clamp(C("sieges_min") + p.Population * C("sieges_par_habitant"), C("sieges_min"), C("sieges_max"));
        // prime majoritaire simplifiée : la liste gagnante obtient la moitié des sièges + sa part du reste
        int maire = partMaire >= 0.5 ? (int)Math.Round(total / 2.0 + partMaire * total / 2.0) : (int)Math.Round(partMaire * total);
        maire = Math.Clamp(maire, 1, total - 1);
        var groupes = Groupes().ToList();
        E.Sieges = new Dictionary<string, int> { ["maire"] = maire };
        int reste = total - maire;
        for (int i = 0; i < groupes.Count; i++)
        {
            int s = i == groupes.Count - 1 ? reste : reste / (groupes.Count - i) + (i == 0 && reste % (groupes.Count - i) > 0 ? 1 : 0);
            E.Sieges[groupes[i].id] = s;
            reste -= s;
        }
    }

    public bool PromettreOuRetirer(Partie p, string id, bool promettre)
    {
        if (!PromessesModifiables(p)) return false;
        if (promettre && !E.Promesses.Contains(id) && E.Promesses.Count < C("promesses_max")) E.Promesses.Add(id);
        if (!promettre) E.Promesses.Remove(id);
        return true;
    }

    public bool PromesseTenue(Partie p, string id)
    {
        var g = p.Module<VraieGestion>();
        return id switch
        {
            "impots" => p.ImpotHabitat <= 0.09 + 1e-9,
            "ecole" => CouvertureEcole(p) >= 0.8,
            "bus" => p.Arrets.Count >= 4,
            "chomage" => p.Actifs == 0 || p.Chomeurs < 0.08 * p.Actifs,
            "satisfaction" => (g?.SatisfactionGlobale ?? 50) >= 60,
            "routes" => g == null || !p.Reseau.Aretes.Values.Any(e => !e.Departemental && g.UsureRoute(e.Id) > g.Seuil),
            "croissance" => p.Population >= E.PopulationDebutMandat * 1.2 && p.Population > 100,
            "dette" => p.Emprunts.Count == 0,
            _ => false,
        };
    }

    private static double CouvertureEcole(Partie p)
    {
        double enfants = 0, couverts = 0;
        foreach (var par in p.Parcelles.Values)
            if (par.Batiment is { Type: Zone.Habitat } b)
            {
                double e = b.Occupants * p.R.PersonnesParLogement * p.R.PartEnfants;
                enfants += e; couverts += e * b.Ecole;
            }
        return enfants <= 0 ? 1 : couverts / enfants;
    }

    // ------------------------------------------------------------------ vie du mandat
    public void FinDeMois(Partie p)
    {
        if (E.Sieges.Count == 0) Initialiser(p);
        if (E.DefaiteEnAttente) return;
        if (EnOpposition)
        {
            E.MoisOppositionRestants--;
            GererParNouvelleEquipe(p);
            if (E.MoisOppositionRestants == 0) Election(p, anticipee: true);
            return;
        }
        // popularité : satisfaction des habitants + promesses tenues, lissée dans le temps
        double satisfaction = p.Module<VraieGestion>()?.SatisfactionGlobale ?? Moyenne(p.Parcelles.Values.Where(x => x.Batiment != null).Select(x => x.Attrait));
        double promesses = E.Promesses.Sum(id => PromesseTenue(p, id) ? C("bonus_promesse_tenue") / 2 : -C("malus_promesse_rompue") / 4);
        double cible = Math.Clamp(satisfaction * 0.9 + 5 + promesses, 0, 100);
        E.Popularite = Math.Round(E.Popularite + (cible - E.Popularite) * 0.15, 2);

        int restants = MoisRestants(p);
        if (restants <= C("mois_campagne") && !E.CampagneAnnoncee)
        {
            E.CampagneAnnoncee = true;
            p.Publier("palier", $"Campagne électorale : élections municipales dans {restants} mois. Popularité actuelle : {E.Popularite:F0} %. Tenez vos promesses !");
        }
        if (restants <= 0) Election(p, anticipee: false);
        // le conseil vote chaque mois de janvier le budget de l'année
        if (p.Mois % 12 == 0 && p.Mois > E.DebutMandat) VoteBudget(p);
    }

    private static double Moyenne(IEnumerable<double> v) { var l = v.ToList(); return l.Count == 0 ? 50 : l.Average(); }

    private void Election(Partie p, bool anticipee)
    {
        double bonus = 0;
        if (!anticipee)
            foreach (var id in E.Promesses)
                bonus += PromesseTenue(p, id) ? C("bonus_promesse_tenue") : -C("malus_promesse_rompue");
        double score = Math.Clamp(E.Popularite + bonus + (p.Aleatoire() * 2 - 1) * C("bruit_vote"), 5, 95);
        string resume = $"Mandat {E.Mandat} : {score:F1} % des voix";
        E.Historique.Add(resume);
        E.CampagneAnnoncee = false;
        if (score >= 50)
        {
            E.Mandat++;
            E.DebutMandat = p.Mois;
            E.PopulationDebutMandat = p.Population;
            E.Promesses.Clear();
            RepartirSieges(p, score / 100);
            p.Verrou = null;
            p.Publier("palier", $"Réélection ! Votre liste obtient {score:F1} % des voix et {E.Sieges["maire"]} sièges sur {TotalSieges}. Choisissez vos promesses pour ce nouveau mandat (fenêtre Mairie).");
        }
        else
        {
            RepartirSieges(p, score / 100);
            E.DefaiteEnAttente = true;
            p.Proposer(Id, "defaite", "Défaite aux municipales",
                $"Votre liste n'obtient que {score:F1} % des voix. Une autre équipe (fictive) prend la mairie. Que faites-vous ?",
                new[]
                {
                    $"Siéger dans l'opposition {C("mois_opposition"):F0} mois, puis tenter de revenir (élection anticipée)",
                    "Reprendre la ville avec une nouvelle équipe (popularité remise à 50, une politique abandonnée)",
                    "Continuer sans élections (le module est désactivé)",
                });
        }
    }

    /// <summary>La nouvelle équipe gère la ville pendant l'opposition : elle baisse les impôts et réduit les dépenses.</summary>
    private void GererParNouvelleEquipe(Partie p)
    {
        p.Verrou = null;
        if (p.ImpotHabitat > 0.08) p.ReglerImpot(Zone.Habitat, p.ImpotHabitat - 0.005);
        p.Verrou = $"Vous êtes dans l'opposition encore {E.MoisOppositionRestants} mois : vous ne pouvez qu'observer la ville.";
        E.Popularite = Math.Min(60, E.Popularite + 1.2); // les électeurs regrettent un peu l'ancienne équipe
    }

    private void VoteBudget(Partie p)
    {
        bool deficit = p.RecettesMois < p.DepensesMois;
        bool impotsHauts = p.ImpotHabitat > 0.14;
        if (MajoritePropre || (!deficit && !impotsHauts)) return;
        p.Proposer(Id, "budget", "Vote du budget annuel",
            $"Sans majorité au conseil, votre budget est contesté ({(deficit ? "déficit" : "impôts jugés trop élevés")}). L'opposition propose un compromis.",
            new[] { "Accepter le compromis : taxe des habitants −1 point", "Passer en force (popularité −5)" });
    }

    public bool MajoritePropre => E.Sieges.GetValueOrDefault("maire") * 2 > TotalSieges;

    /// <summary>
    /// Le conseil vote une politique publique. Avec une majorité propre, elle passe ; sinon il faut le soutien
    /// d'un groupe d'opposition (s'il en fait une priorité) ou accepter un compromis.
    /// </summary>
    public Resultat VoterPolitique(Partie p, string politique, bool activer)
    {
        var g = p.Module<VraieGestion>();
        if (g == null) return Resultat.Non("Module « vraie gestion » requis.");
        if (EnOpposition) return Resultat.Non("Vous êtes dans l'opposition : la nouvelle équipe décide.");
        int pour = E.Sieges.GetValueOrDefault("maire");
        var soutiens = new List<string>();
        foreach (var (id, nom, priorites) in Groupes())
            if (priorites.Contains(politique) == activer) { pour += E.Sieges.GetValueOrDefault(id); soutiens.Add(nom); }
        if (pour * 2 > TotalSieges)
        {
            g.ActiverPolitique(p, politique, activer);
            return new Resultat(true, $"Le conseil adopte ({pour} voix sur {TotalSieges})" + (soutiens.Count > 0 ? $", avec le soutien de : {string.Join(", ", soutiens)}." : "."));
        }
        p.Proposer(Id, "compromis", "Le conseil municipal hésite",
            $"Pas de majorité ({pour} voix sur {TotalSieges}). L'opposition propose un compromis.",
            new[] { "Accepter le compromis : la mesure passe, mais coûte une prime de 20 000 € aux quartiers", "Retirer le projet" },
            new() { ["politique_index"] = Array.IndexOf(g.CataloguePolitiques().Select(x => x.id).ToArray(), politique), ["activer"] = activer ? 1 : 0 });
        return new Resultat(false, "Pas de majorité : une décision vous attend.");
    }

    public void Choisir(Partie p, Decision d, int choix)
    {
        switch (d.Type)
        {
            case "defaite":
                E.DefaiteEnAttente = false;
                if (choix == 0)
                {
                    E.MoisOppositionRestants = (int)C("mois_opposition");
                    E.Popularite = 42;
                    p.Verrou = $"Vous êtes dans l'opposition encore {E.MoisOppositionRestants} mois : vous ne pouvez qu'observer la ville.";
                    p.Publier("info", "Vous siégez dans l'opposition. Une élection anticipée aura lieu dans un an.");
                }
                else if (choix == 1)
                {
                    E.Mandat++;
                    E.DebutMandat = p.Mois;
                    E.PopulationDebutMandat = p.Population;
                    E.Promesses.Clear();
                    E.Popularite = 50;
                    RepartirSieges(p, 0.52);
                    var g = p.Module<VraieGestion>();
                    if (g != null && g.E.Politiques.Count > 0) g.ActiverPolitique(p, g.E.Politiques[0], false);
                    p.Publier("info", "Nouvelle équipe, nouveau départ : vous reprenez la ville.");
                }
                else
                {
                    p.Modules.Remove(this);
                    p.Verrou = null;
                    p.Publier("info", "Les élections sont désactivées pour cette partie.");
                }
                break;
            case "budget":
                if (choix == 0) p.ReglerImpot(Zone.Habitat, p.ImpotHabitat - 0.01);
                else E.Popularite = Math.Max(0, E.Popularite - 5);
                break;
            case "compromis":
                if (choix == 0 && p.Module<VraieGestion>() is { } vg)
                {
                    var id = vg.CataloguePolitiques().ElementAt((int)d.Parametres["politique_index"]).id;
                    vg.ActiverPolitique(p, id, d.Parametres["activer"] > 0);
                    p.Depense("Compromis au conseil municipal", 20000);
                    p.Publier("info", "Le compromis est voté.");
                }
                break;
        }
    }

    public JsonElement Sauvegarder() => JsonSerializer.SerializeToElement(E, Reglages.Json);
    public void Restaurer(JsonElement etat) => E = etat.Deserialize<Etat>(Reglages.Json) ?? new Etat();
}
