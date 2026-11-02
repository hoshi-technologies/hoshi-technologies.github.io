using System.Runtime.CompilerServices;
using System.Text.Json;
using Ville.Coeur;

namespace Ville.Gestion;

/// <summary>
/// Module « vraie gestion » : vieillissement des réseaux, dotations de l'État, attentes des habitants,
/// événements avec décisions, niveaux de difficulté. Activable : le socle fonctionne sans lui.
/// Tous les chiffres viennent de donnees/reglages/*.json (section « vraie_gestion »).
/// </summary>
public sealed partial class VraieGestion : IModule
{
    public const string Identifiant = "vraie_gestion";
    public string Id => Identifiant;

#pragma warning disable CA2255 // enregistrement automatique du module au chargement de la bibliothèque
    [ModuleInitializer]
    internal static void Enregistrer() => Partie.FabriquesModules[Identifiant] = r => new VraieGestion(r);
#pragma warning restore CA2255

    private static double Mille(double x) => Math.Round(x / 1000) * 1000;

    private readonly JsonElement _cfg;
    public sealed class Etat
    {
        public string Difficulte { get; set; } = "realiste";
        public Dictionary<int, double> UsureRoutes { get; set; } = new();
        public Dictionary<int, double> UsureServices { get; set; } = new();
        public double FacteurDotation { get; set; } = 1;
        public int MoisPenurieMedecins { get; set; }
        public int MoisCanicule { get; set; }
        public int Evenements { get; set; }
        public bool ReservesExcessives { get; set; }
        public List<string> Politiques { get; set; } = new();
        public string? Objectif { get; set; }
        public List<string> ObjectifsAtteints { get; set; } = new();
        public List<int> PopulationParMois { get; set; } = new();
        /// <summary>Satisfaction du dernier mois par quartier (sauvegardée : la simulation reprend à l'identique).</summary>
        public List<QuartierEtat> Quartiers { get; set; } = new();
        public double SatisfactionGlobale { get; set; } = 50;
    }
    public sealed record QuartierEtat(int I, int J, string Nom, int Population, double Familles, double JeunesActifs, double Seniors);
    public Etat E { get; private set; } = new();

    public VraieGestion(Reglages r, string difficulte = "realiste")
    {
        _cfg = r.Extra.TryGetValue("vraie_gestion", out var c) ? c : throw new InvalidDataException("Réglages « vraie_gestion » absents.");
        E.Difficulte = difficulte;
    }

    private double C(string cle) => _cfg.GetProperty(cle).GetDouble();
    private double D(string cle) => _cfg.GetProperty("difficultes").GetProperty(E.Difficulte).GetProperty(cle).GetDouble();
    public string NomDifficulte => _cfg.GetProperty("difficultes").GetProperty(E.Difficulte).GetProperty("nom").GetString() ?? E.Difficulte;
    public double Seuil => C("seuil_degradation");

    public double UsureRoute(int arete) => E.UsureRoutes.GetValueOrDefault(arete);
    public double UsureService(int parcelle) => E.UsureServices.GetValueOrDefault(parcelle);

    // ------------------------------------------------------------------ fin de mois
    public void FinDeMois(Partie p)
    {
        Vieillir(p);
        double couts = D("couts");
        // entretien renforcé des réseaux usés
        double surcout = 0;
        foreach (var e in p.Reseau.Aretes.Values)
            if (!e.Departemental)
                surcout += e.Longueur / 1000 * p.R.Route(e.Gabarit).EntretienParKmMois * UsureRoute(e.Id);
        foreach (var par in p.Parcelles.Values)
            if (par.Service is { } s && s != "existant" && p.R.Services.TryGetValue(s, out var rs))
                surcout += rs.Entretien * UsureService(par.Id);
        p.Depense("Usure des réseaux et équipements", Math.Round(surcout * couts));

        // dotation de l'État, revue chaque année
        if (p.Mois > 0 && p.Mois % 12 == 0)
        {
            double avant = E.FacteurDotation;
            E.FacteurDotation = Math.Clamp(E.FacteurDotation * (1 + (p.Aleatoire() * 2 - 1) * C("variation_dotation")), 0.6, 1.3);
            p.Publier("info", E.FacteurDotation < avant
                ? $"Le journal local : « L'État baisse sa dotation à la commune ({(E.FacteurDotation / avant - 1) * 100:F0} %). Il va falloir faire des choix. »"
                : $"Le journal local : « Bonne nouvelle : la dotation de l'État augmente (+{(E.FacteurDotation / avant - 1) * 100:F0} %). »");
        }
        // personnel et administration : plus la ville est grande, plus elle coûte par habitant
        p.Depense("Personnel et administration", Math.Round(p.Population * C("cout_administration_par_habitant") * (1 + C("hausse_administration_par_palier") * p.Palier) * couts));
        // réserves excessives : l'État ne verse plus sa dotation, les habitants réclament une baisse d'impôts
        double reserves = p.Argent / Math.Max(p.RecettesMois, 1);
        bool tropRiche = p.Population > 500 && reserves > C("reserves_max_en_mois_de_recettes");
        if (!tropRiche)
            p.Recette("Dotation de l'État", Math.Round(p.Population * C("dotation_par_habitant") * E.FacteurDotation * D("dotation")));
        else
            p.PublierLimite("reserves", 120, "alerte", $"Le journal local : « La commune dort sur {p.Argent:N0} {p.R.Monnaie} de réserves. L'État suspend sa dotation et les habitants demandent une baisse des impôts, ou des investissements. »");
        E.ReservesExcessives = tropRiche;

        PolitiquesDuMois(p);
        CalculerSatisfaction(p);
        SuivreObjectifs(p);
        if (E.MoisPenurieMedecins > 0) E.MoisPenurieMedecins--;
        if (E.MoisCanicule > 0) E.MoisCanicule--;

        int degradees = p.Reseau.Aretes.Values.Count(e => !e.Departemental && UsureRoute(e.Id) > Seuil);
        if (degradees > 0)
            p.PublierLimite("usure", 90, "habitant", $"{Prenom(p)} : « Les nids-de-poule se multiplient : {degradees} rue(s) sont en mauvais état. » (outil Rénover)");

        if (p.Decisions.Count < 2 && p.Population > 300 && p.Aleatoire() < C("evenements_proba_mois") * D("evenements"))
            Evenement(p);
    }

    private void Vieillir(Partie p)
    {
        double ur = C("usure_routes_par_mois"), us = C("usure_services_par_mois");
        foreach (var e in p.Reseau.Aretes.Values)
            if (!e.Departemental) E.UsureRoutes[e.Id] = Math.Min(1, UsureRoute(e.Id) + ur);
        foreach (var par in p.Parcelles.Values)
            if (par.Service is { } s && s != "existant") E.UsureServices[par.Id] = Math.Min(1, UsureService(par.Id) + us);
        // oublie les éléments disparus (routes démolies ou découpées)
        foreach (var id in E.UsureRoutes.Keys.Where(id => !p.Reseau.Aretes.ContainsKey(id)).ToList()) E.UsureRoutes.Remove(id);
        foreach (var id in E.UsureServices.Keys.Where(id => !p.Parcelles.TryGetValue(id, out var x) || x.Service == null).ToList()) E.UsureServices.Remove(id);
    }

    // ------------------------------------------------------------------ effets sur la ville
    public double ModifierAttrait(Partie p, Parcelle par, double a)
    {
        if (UsureRoute(par.Arete) > Seuil) a -= 6;
        if (par.Zone == Zone.Commerce && Active("zones_pietonnes")) a += 5;
        if (par.Zone == Zone.Habitat && par.Batiment is { } b)
        {
            // plus la ville grandit, plus les habitants attendent des services
            if (p.Palier >= 2)
            {
                double couverture = ((b.Ecole >= 0.8 ? 1 : 0) + (b.Sante >= 0.8 ? 1 : 0) + (b.Police ? 1 : 0) + (b.Pompiers ? 1 : 0)) / 4.0;
                a -= C("attentes_par_palier") * (p.Palier - 1) * (1 - couverture);
            }
            if (E.MoisPenurieMedecins > 0) a -= 6;
            if (E.ReservesExcessives && p.ImpotHabitat > C("impot_juge_raisonnable")) a -= 6;
            if (E.MoisCanicule > 0) a -= Active("vegetalisation") ? 2 : 5;
            if (_satisfactionParQuartier.TryGetValue(CleQuartier(par.Centre), out var sq))
                a += (sq - 50) * C("effet_satisfaction_sur_attrait");
        }
        return a;
    }

    public double FacteurProduction(Partie p, Parcelle service) => UsureService(service.Id) > 0.85 ? 0.7 : 1;

    // ------------------------------------------------------------------ rénovation
    public double CoutRenovationRoute(Partie p, AreteRoute e) => Math.Round(e.Longueur * C("cout_renovation_route_par_m") * UsureRoute(e.Id) * D("couts"));
    public double CoutRenovationService(Partie p, Parcelle par) =>
        par.Service != null && p.R.Services.TryGetValue(par.Service, out var s) ? Math.Round(s.Cout * C("part_cout_renovation_service") * UsureService(par.Id) * D("couts")) : 0;

    public Resultat Renover(Partie p, V2 point)
    {
        var par = p.ParcelleSous(point);
        if (par?.Service is { } s && s != "existant")
        {
            double c = CoutRenovationService(p, par);
            if (c > p.Argent && !p.BacASable) return Resultat.Non("Pas assez d'argent.");
            if (!p.BacASable) p.Argent -= c;
            E.UsureServices[par.Id] = 0;
            p.Invalider();
            return new Resultat(true, $"Équipement rénové ({c:N0} {p.R.Monnaie}).", c);
        }
        var arete = p.Reseau.AreteProche(point, 10);
        if (arete == null || arete.Departemental) return Resultat.Non("Cliquez sur une rue ou un équipement de la commune.");
        double cr = CoutRenovationRoute(p, arete);
        if (cr > p.Argent && !p.BacASable) return Resultat.Non("Pas assez d'argent.");
        if (!p.BacASable) p.Argent -= cr;
        E.UsureRoutes[arete.Id] = 0;
        return new Resultat(true, $"Rue rénovée ({cr:N0} {p.R.Monnaie}).", cr);
    }

    /// <summary>Rénove les éléments les plus usés dans la limite d'un budget. Renvoie le montant dépensé.</summary>
    public double RenoverUrgent(Partie p, double budget)
    {
        double depense = 0;
        var routes = p.Reseau.Aretes.Values.Where(e => !e.Departemental && UsureRoute(e.Id) > Seuil * 0.8)
            .OrderByDescending(e => UsureRoute(e.Id)).ThenBy(e => e.Id).ToList();
        foreach (var e in routes)
        {
            double c = CoutRenovationRoute(p, e);
            if (depense + c > budget) break;
            depense += c; E.UsureRoutes[e.Id] = 0;
        }
        foreach (var par in p.Parcelles.Values.Where(x => x.Service is { } s && s != "existant" && UsureService(x.Id) > 0.7).OrderByDescending(x => UsureService(x.Id)).ToList())
        {
            double c = CoutRenovationService(p, par);
            if (depense + c > budget) break;
            depense += c; E.UsureServices[par.Id] = 0;
        }
        if (!p.BacASable) p.Argent -= depense;
        p.Invalider();
        return depense;
    }

    // ------------------------------------------------------------------ événements
    private static string Prenom(Partie p) => p.R.Prenoms[(int)(p.Aleatoire() * p.R.Prenoms.Length) % p.R.Prenoms.Length];

    private void Evenement(Partie p)
    {
        E.Evenements++;
        double couts = D("couts");
        var possibles = new List<string> { "tempete", "projet_immobilier" };
        if (p.Parcelles.Values.Any(x => x.Batiment is { Type: Zone.Activites, EnChantier: false })) possibles.Add("fermeture_usine");
        if (p.Population > 1500) possibles.Add("penurie_medecins");
        if (p.Mois % 12 is 5 or 6 or 7) { possibles.Add("canicule"); possibles.Add("canicule"); }
        string type = possibles[(int)(p.Aleatoire() * possibles.Count) % possibles.Count];
        switch (type)
        {
            case "tempete":
            {
                double cout = Mille((20000 + p.Population * 3) * couts);
                p.Proposer(Id, type, "Tempête sur la commune",
                    "Une violente tempête a arraché des arbres et abîmé plusieurs rues. Les services techniques attendent vos ordres.",
                    new[] { $"Réparer tout de suite ({cout:N0} {p.R.Monnaie})", "Réparer plus tard (les rues restent abîmées)" },
                    new() { ["cout"] = cout });
                break;
            }
            case "fermeture_usine":
            {
                var usine = p.Parcelles.Values.Where(x => x.Batiment is { Type: Zone.Activites, EnChantier: false })
                    .OrderByDescending(x => p.Capacite(x.Batiment!)).ThenBy(x => x.Id).First();
                double emplois = p.Capacite(usine.Batiment!);
                double aide = Mille(emplois * 900 * couts);
                p.Proposer(Id, type, "Une entreprise menace de fermer",
                    $"La plus grande entreprise de la commune ({emplois:N0} emplois) annonce sa fermeture. Elle resterait avec une aide publique.",
                    new[] { $"Verser une aide ({aide:N0} {p.R.Monnaie})", "Laisser fermer" },
                    new() { ["cout"] = aide, ["parcelle"] = usine.Id });
                break;
            }
            case "penurie_medecins":
            {
                double cout = Mille((15000 + p.Population * 2) * couts);
                p.Proposer(Id, type, "Pénurie de médecins",
                    "Trois médecins partent à la retraite sans successeur. Les habitants s'inquiètent.",
                    new[] { $"Financer une maison de santé ({cout:N0} {p.R.Monnaie})", "Ne rien faire (attrait en baisse pendant un an)" },
                    new() { ["cout"] = cout });
                break;
            }
            case "projet_immobilier":
            {
                double gain = Mille(30000 + p.Population * 4);
                p.Proposer(Id, type, "Projet immobilier",
                    $"Un promoteur propose de construire un ensemble de logements. Il verserait {gain:N0} {p.R.Monnaie} à la commune pour les équipements, mais le quartier serait plus dense.",
                    new[] { $"Accepter (+{gain:N0} {p.R.Monnaie}, des terrains deviennent constructibles)", "Refuser" },
                    new() { ["gain"] = gain });
                break;
            }
            case "canicule":
            {
                double cout = Mille((8000 + p.Population * 1.5) * couts);
                p.Proposer(Id, type, "Canicule",
                    "Une vague de chaleur s'annonce. Les personnes âgées sont les plus exposées.",
                    new[] { $"Ouvrir des salles rafraîchies et des fontaines ({cout:N0} {p.R.Monnaie})", "Se contenter de conseils de prudence" },
                    new() { ["cout"] = cout });
                break;
            }
        }
    }

    public void Choisir(Partie p, Decision d, int choix)
    {
        double cout = d.Parametres.GetValueOrDefault("cout");
        bool paye = choix == 0 && d.Type != "projet_immobilier";
        if (paye && cout > p.Argent && !p.BacASable)
        {
            p.Publier("alerte", "Pas assez d'argent : la décision n'a pas pu être financée.");
            paye = false;
            choix = 1;
        }
        if (paye) p.Depense($"Décision : {d.Titre}", cout);
        switch (d.Type)
        {
            case "tempete":
                if (!paye)
                    foreach (var e in p.Reseau.Aretes.Values.Where(e => !e.Departemental).OrderBy(e => (e.Id * 7919) % 101).Take(12))
                        E.UsureRoutes[e.Id] = Math.Min(1, UsureRoute(e.Id) + 0.45);
                p.Publier("info", paye ? "Le journal local : « Rues réparées en un temps record après la tempête. »" : "Le journal local : « Les rues abîmées par la tempête attendront. »");
                break;
            case "fermeture_usine":
                if (!paye && p.Parcelles.TryGetValue((int)d.Parametres["parcelle"], out var usine) && usine.Batiment != null)
                {
                    p.DetruireBatiment(usine);
                    p.Publier("alerte", "Le journal local : « L'entreprise ferme ses portes. Des dizaines d'emplois perdus. »");
                }
                else p.Publier("info", "Le journal local : « L'entreprise reste : soulagement des salariés. »");
                break;
            case "penurie_medecins":
                if (!paye) E.MoisPenurieMedecins = 12;
                p.Publier("info", paye ? "Le journal local : « Une maison de santé ouvrira ses portes. »" : "Le journal local : « Les habitants devront aller consulter plus loin. »");
                break;
            case "projet_immobilier":
                if (choix == 0)
                {
                    p.Recette("Participation du promoteur", d.Parametres["gain"]);
                    int n = 0;
                    foreach (var par in p.Parcelles.Values.Where(x => x.Zone == Zone.Aucune && x.Libre && p.ParcelleReliee(x) && p.Constructible(x.Centre)).Take(12).ToList())
                    { par.Zone = Zone.Habitat; p.CarresModifies.Add(Partie.Carre(par.Centre)); n++; }
                    p.Publier("info", $"Le journal local : « Le projet immobilier est lancé : {n} terrains ouverts au logement. »");
                }
                else p.Publier("info", "Le journal local : « Le maire refuse le projet immobilier. »");
                break;
            case "canicule":
                if (!paye) E.MoisCanicule = 2;
                p.Publier("info", paye ? "Le journal local : « Salles rafraîchies et fontaines : la commune a tenu bon. »" : "Le journal local : « Canicule difficile : des habitants se plaignent du manque d'arbres et de fraîcheur. »");
                break;
        }
    }

    public JsonElement Sauvegarder() => JsonSerializer.SerializeToElement(E, Reglages.Json);
    public void Restaurer(JsonElement etat) { E = etat.Deserialize<Etat>(Reglages.Json) ?? new Etat(); _cacheSatisfaction = null; }
}
