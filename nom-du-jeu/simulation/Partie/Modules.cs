using System.Text.Json;

namespace Ville.Coeur;

/// <summary>
/// Un module optionnel (vraie gestion, élections…) qui se branche sur le socle sans le modifier.
/// Le socle ne connaît que cette interface : il fonctionne seul si aucun module n'est activé.
/// </summary>
public interface IModule
{
    string Id { get; }
    /// <summary>Appelé chaque fin de mois, après le budget du socle.</summary>
    void FinDeMois(Partie p);
    /// <summary>Permet d'ajuster l'attrait d'une parcelle (après le calcul du socle).</summary>
    double ModifierAttrait(Partie p, Parcelle parcelle, double attrait) => attrait;
    /// <summary>Facteur appliqué à la production d'un équipement (eau, électricité, déchets).</summary>
    double FacteurProduction(Partie p, Parcelle service) => 1;
    /// <summary>Ajuste la demande d'une zone (politiques publiques…).</summary>
    double ModifierDemande(Partie p, Zone z, double demande) => demande;
    /// <summary>Facteur appliqué au nombre de voitures à l'heure de pointe (transports, vélo…).</summary>
    double FacteurVoitures(Partie p) => 1;
    /// <summary>Le joueur répond à une décision proposée par ce module.</summary>
    void Choisir(Partie p, Decision d, int choix) { }
    JsonElement Sauvegarder();
    void Restaurer(JsonElement etat);
}

/// <summary>Une décision proposée au maire (événement) : un titre, un texte, des choix.</summary>
public sealed class Decision
{
    public int Id { get; set; }
    public string Module { get; set; } = "";
    public string Type { get; set; } = "";
    public string Titre { get; set; } = "";
    public string Texte { get; set; } = "";
    public List<string> Choix { get; set; } = new();
    public Dictionary<string, double> Parametres { get; set; } = new();
}

public sealed partial class Partie
{
    public List<IModule> Modules { get; } = new();
    public List<Decision> Decisions { get; } = new();
    private int _prochaineDecision;

    /// <summary>Fabriques des modules connus (remplies par chaque module), pour recharger une sauvegarde.</summary>
    public static readonly Dictionary<string, Func<Reglages, IModule>> FabriquesModules = new();

    public T? Module<T>() where T : class, IModule => Modules.OfType<T>().FirstOrDefault();

    /// <summary>Dépense ajoutée par un module, visible dans le budget du mois.</summary>
    public void Depense(string nom, double montant)
    {
        if (montant == 0) return;
        DetailDepenses[nom] = DetailDepenses.GetValueOrDefault(nom) + montant;
        DepensesMois += montant;
        Argent -= montant;
    }

    /// <summary>Recette ajoutée par un module (dotation de l'État…).</summary>
    public void Recette(string nom, double montant)
    {
        if (montant == 0) return;
        DetailRecettes[nom] = DetailRecettes.GetValueOrDefault(nom) + montant;
        RecettesMois += montant;
        Argent += montant;
    }

    public void Publier(string type, string texte) => Message(type, texte);
    public void PublierLimite(string cle, int delai, string type, string texte) => MessageLimite(cle, delai, type, texte);

    public Decision Proposer(string module, string type, string titre, string texte, IEnumerable<string> choix, Dictionary<string, double>? parametres = null)
    {
        var d = new Decision { Id = _prochaineDecision++, Module = module, Type = type, Titre = titre, Texte = texte, Choix = choix.ToList(), Parametres = parametres ?? new() };
        Decisions.Add(d);
        return d;
    }

    public void Repondre(int decisionId, int choix)
    {
        var d = Decisions.FirstOrDefault(x => x.Id == decisionId);
        if (d == null) return;
        Decisions.Remove(d);
        Modules.FirstOrDefault(m => m.Id == d.Module)?.Choisir(this, d, Math.Clamp(choix, 0, Math.Max(0, d.Choix.Count - 1)));
        _servicesAJour = false;
    }

    /// <summary>Accès en écriture pour les modules (événements).</summary>
    public void DetruireBatiment(Parcelle p) { p.Batiment = null; CarresModifies.Add(Carre(p.Centre)); _servicesAJour = false; }
    public void Invalider() => _servicesAJour = false;
    public double Aleatoire() => _alea.Reel();
}
