using Ville.Donnees;

namespace Ville.Reseau;

public static class ConstructionGraphe
{
    /// <summary>Vitesses libres par gabarit (m/s). À déplacer dans un fichier de réglages au prototype.</summary>
    public static readonly IReadOnlyDictionary<string, double> VitessesParDefaut = new Dictionary<string, double>
    {
        ["voie_rapide"] = 90 / 3.6, ["avenue"] = 50 / 3.6, ["rue"] = 30 / 3.6, ["desserte"] = 20 / 3.6,
    };

    /// <summary>Graphe des routes carrossables d'un paquet (piétons et rail exclus).</summary>
    public static GrapheRoutier Voitures(Routes routes, IReadOnlyDictionary<string, double>? vitesses = null)
    {
        vitesses ??= VitessesParDefaut;
        var x = routes.Noeuds.Select(n => n.X).ToArray();
        var y = routes.Noeuds.Select(n => n.Y).ToArray();
        var aretes = new List<(int, int, double, double, int)>();
        foreach (var t in routes.Troncons)
            if (vitesses.TryGetValue(t.Gabarit, out var v) && t.A != t.B)
                aretes.Add((t.A, t.B, Math.Max(t.LongueurM, 0.5), v, t.Id));
        return new GrapheRoutier(x, y, aretes);
    }

    /// <summary>Grille régulière (pour les bancs d'essai), avec ~8 % de rues manquantes.</summary>
    public static GrapheRoutier Grille(int cote, double espacement, ulong graine)
    {
        var alea = new Outils.Alea(graine);
        var x = new double[cote * cote];
        var y = new double[cote * cote];
        var aretes = new List<(int, int, double, double, int)>();
        for (int j = 0; j < cote; j++)
            for (int i = 0; i < cote; i++)
            {
                int id = j * cote + i;
                x[id] = i * espacement; y[id] = j * espacement;
                if (i + 1 < cote && alea.Reel() > 0.08) aretes.Add((id, id + 1, espacement, 13.9, -1));
                if (j + 1 < cote && alea.Reel() > 0.08) aretes.Add((id, id + cote, espacement, 13.9, -1));
            }
        return new GrapheRoutier(x, y, aretes);
    }
}
