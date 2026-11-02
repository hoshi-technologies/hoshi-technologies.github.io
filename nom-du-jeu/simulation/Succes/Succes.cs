using Ville.Coeur;
using Ville.Gestion;

namespace Ville.Succes;

/// <summary>
/// Succès (« achievements ») du jeu. Les conditions ne regardent que l'état de la partie : aucune donnée
/// personnelle, aucune connexion. Le jeu les vérifie chaque fin de mois et les transmet à la plateforme
/// (Steam si présent, sinon un simple fichier local). Ce fichier ne fait pas partie du socle : il peut lire
/// les modules « vraie gestion » et « élections », mais le socle ne dépend pas de lui.
/// Les identifiants (API) doivent être recopiés à l'identique dans Steamworks.
/// </summary>
public static class CatalogueSucces
{
    public sealed record Definition(string Id, string Nom, string Description, string NomEn, string DescriptionEn, Func<Partie, bool> Condition);

    private static bool Construite(Partie p) => p.Depart != ModeDepart.VilleReelle;

    public static readonly Definition[] Tous =
    {
        new("PREMIERE_RUE", "Premier coup de crayon", "Tracer sa première rue.", "First stroke", "Build your first street.",
            p => p.Reseau.Aretes.Values.Any(e => !e.Importee && !e.Departemental)),
        new("PREMIER_PONT", "Trait d'union", "Construire un pont.", "Bridging the gap", "Build a bridge.",
            p => p.Reseau.Aretes.Values.Any(e => e.Pont && !e.Importee)),
        new("PALIER_BOURG", "Bourg", "Atteindre le palier Bourg en partant de zéro.", "Market town", "Reach the Market town tier from scratch.",
            p => Construite(p) && p.Palier >= 1),
        new("PALIER_VILLAGE", "Village", "Atteindre le palier Village en partant de zéro.", "Village", "Reach the Village tier from scratch.",
            p => Construite(p) && p.Palier >= 2),
        new("PALIER_PETITE_VILLE", "Petite ville", "Atteindre le palier Petite ville en partant de zéro.", "Small town", "Reach the Small town tier from scratch.",
            p => Construite(p) && p.Palier >= 3),
        new("PALIER_VILLE", "Ville", "Atteindre le palier Ville en partant de zéro.", "City", "Reach the City tier from scratch.",
            p => Construite(p) && p.Palier >= 4),
        new("PALIER_GRANDE_VILLE", "Grande ville", "Atteindre le palier Grande ville en partant de zéro.", "Big city", "Reach the Big city tier from scratch.",
            p => Construite(p) && p.Palier >= 5),
        new("RESEAUX_OK", "Tout coule de source", "1 000 habitants, assez d'eau et d'électricité pour tous.", "Everything flows", "1,000 residents with enough water and power for everyone.",
            p => p.Population >= 1000 && p.EauConsommee > 0 && p.EauProduite >= p.EauConsommee && p.ElecConsommee > 0 && p.ElecProduite >= p.ElecConsommee),
        new("PLEIN_EMPLOI", "Plein emploi", "Moins de 5 % de chômage avec au moins 3 000 habitants.", "Full employment", "Under 5% unemployment with at least 3,000 residents.",
            p => p.Population >= 3000 && p.Actifs > 0 && p.Chomeurs < 0.05 * p.Actifs),
        new("BUDGET_SAIN", "Comptes à l'équilibre", "Douze mois de suite avec plus de recettes que de dépenses (hors bac à sable).", "Balanced books", "Twelve months in a row with more income than spending.",
            p => p.Historique.Count >= 12 && p.Historique.TakeLast(12).All(h => h.Recettes >= h.Depenses) && p.Population > 0),
        new("VILLE_REELLE_10_ANS", "Dix ans à la mairie", "Gérer une ville réelle pendant dix ans.", "Ten years in office", "Run a real city for ten years.",
            p => p.Depart == ModeDepart.VilleReelle && p.Mois >= 120),
        new("REELU", "Réélu", "Gagner une élection municipale.", "Re-elected", "Win a municipal election.",
            p => p.Module<Elections>() is { } e && e.E.Mandat >= 2),
        new("PROMESSES_TENUES", "Parole tenue", "Tenir en même temps trois promesses de campagne.", "Promises kept", "Keep three campaign promises at the same time.",
            p => p.Module<Elections>() is { } e && e.E.Promesses.Count >= 3 && e.E.Promesses.All(id => e.PromesseTenue(p, id))),
        new("OBJECTIF_ATTEINT", "Cap tenu", "Atteindre un objectif de mandat (vraie gestion).", "On course", "Complete a term objective (real management).",
            p => p.Module<VraieGestion>() is { } g && g.E.ObjectifsAtteints.Count >= 1),
        new("CINQUANTE_ANS", "Une vie de maire", "Jouer cinquante ans dans la même partie.", "A lifetime as mayor", "Play fifty years in the same game.",
            p => p.Mois >= 600),
    };

    /// <summary>Succès nouvellement obtenus (le bac à sable n'en donne aucun).</summary>
    public static List<string> Verifier(Partie p, IReadOnlySet<string> dejaObtenus)
    {
        var res = new List<string>();
        if (p.BacASable) return res;
        foreach (var d in Tous)
            if (!dejaObtenus.Contains(d.Id) && d.Condition(p)) res.Add(d.Id);
        return res;
    }
}
