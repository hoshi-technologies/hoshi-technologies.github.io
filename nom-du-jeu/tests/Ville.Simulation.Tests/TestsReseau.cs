using Ville.Donnees;
using Ville.Outils;
using Ville.Reseau;
using Ville.Trafic;
using Xunit;

namespace Ville.Tests;

public class TestsAlea
{
    [Fact]
    public void MemeGraineMemeSuite()
    {
        var a = new Alea(42); var b = new Alea(42);
        for (int i = 0; i < 1000; i++) Assert.Equal(a.Suivant(), b.Suivant());
    }

    [Fact]
    public void ValeursFigees()
    {
        // Si ce test casse, l'aléatoire a changé : les anciennes sauvegardes ne se rejoueraient plus pareil.
        var a = new Alea(12345);
        var premiers = Enumerable.Range(0, 3).Select(_ => a.Suivant()).ToArray();
        Assert.Equal(new uint[] { 1411482639u, 3165192603u, 3360792183u }, premiers);
    }

    [Fact]
    public void EntreResteDansLesBornes()
    {
        var a = new Alea(7);
        for (int i = 0; i < 10000; i++) { int v = a.Entre(3, 9); Assert.InRange(v, 3, 8); }
    }
}

public class TestsGraphe
{
    // petit réseau : 0 -1- 1 -1- 2, et un raccourci lent 0 -10- 2
    private static GrapheRoutier Petit() => new(
        new double[] { 0, 1, 2 }, new double[] { 0, 0, 0 },
        new List<(int, int, double, double, int)> { (0, 1, 1, 1, 0), (1, 2, 1, 1, 1), (0, 2, 2, 0.2, 2) });

    [Fact]
    public void CheminLePlusRapide()
    {
        var g = Petit();
        var c = g.Chemin(0, 2, new EspaceCalcul());
        Assert.Equal(2, c.Length);
        Assert.Equal(0, g.SourceArc(c[0]));
        Assert.Equal(2, g.CibleArc(c[^1]));
    }

    [Fact]
    public void CheminsEnchaines_SurGrille()
    {
        var g = ConstructionGraphe.Grille(40, 100, 1);
        var es = new EspaceCalcul();
        var alea = new Alea(3);
        for (int k = 0; k < 200; k++)
        {
            int a = alea.Entre(0, g.NbNoeuds), b = alea.Entre(0, g.NbNoeuds);
            var c = g.Chemin(a, b, es);
            if (c.Length == 0) continue;
            Assert.Equal(a, g.SourceArc(c[0]));
            Assert.Equal(b, g.CibleArc(c[^1]));
            for (int i = 1; i < c.Length; i++) Assert.Equal(g.CibleArc(c[i - 1]), g.SourceArc(c[i]));
        }
    }

    [Fact]
    public void AEtoileEgaleDijkstra()
    {
        var g = ConstructionGraphe.Grille(25, 100, 9);
        var es = new EspaceCalcul();
        var alea = new Alea(5);
        for (int k = 0; k < 50; k++)
        {
            int a = alea.Entre(0, g.NbNoeuds), b = alea.Entre(0, g.NbNoeuds);
            var c = g.Chemin(a, b, es);
            double cout = c.Sum(arc => (double)g.CoutArc(arc));
            double attendu = Dijkstra(g, a, b);
            if (double.IsInfinity(attendu)) Assert.True(c.Length == 0 || a == b);
            else Assert.Equal(attendu, cout, 2);
        }
    }

    private static double Dijkstra(GrapheRoutier g, int a, int b)
    {
        var d = Enumerable.Repeat(double.PositiveInfinity, g.NbNoeuds).ToArray();
        var fait = new bool[g.NbNoeuds];
        d[a] = 0;
        for (int it = 0; it < g.NbNoeuds; it++)
        {
            int u = -1;
            for (int i = 0; i < g.NbNoeuds; i++) if (!fait[i] && (u < 0 || d[i] < d[u])) u = i;
            if (u < 0 || double.IsInfinity(d[u])) break;
            fait[u] = true;
            int deb = g.PremierArc(u);
            var voisins = g.ArcsSortants(u);
            for (int k = 0; k < voisins.Length; k++)
                d[voisins[k]] = Math.Min(d[voisins[k]], d[u] + g.CoutArc(deb + k));
        }
        return d[b];
    }

    [Fact]
    public void TraficDeterministe()
    {
        var g = ConstructionGraphe.Grille(60, 100, 2);
        var s1 = new SimTrafic(g, 2000, 77);
        var s2 = new SimTrafic(g, 2000, 77);
        for (int t = 0; t < 100; t++) { s1.Pas(0.5f); s2.Pas(0.5f); }
        for (int i = 0; i < 2000; i++) Assert.Equal(s1.Position(i), s2.Position(i));
    }
}

public class TestsPaquetAnnecy
{
    private static string? Dossier()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
        {
            var p = Path.Combine(d.FullName, "donnees", "villes", "fr-annecy_quartier_v1");
            if (Directory.Exists(p)) return p;
        }
        return null;
    }

    [Fact]
    public void ChargeLePaquetReel()
    {
        var dossier = Dossier();
        Assert.NotNull(dossier);
        var p = PaquetVille.Charger(dossier!);
        Assert.Equal("Annecy", p.Manifest.Ville.Nom);
        Assert.Equal(9615, p.Batiments.Length);
        Assert.Equal(401 * 401, p.Relief.Length);
        Assert.Contains(p.Eau.Surfaces, s => s.Nom == "Lac d'Annecy");
        // au-dessus du lac, l'altitude est celle de l'eau (~447 m)
        Assert.InRange(p.Altitude(1500, -500), 444, 450);
        var g = ConstructionGraphe.Voitures(p.Routes);
        double part = g.PlusGrandeComposante().Count(b => b) / (double)g.NbNoeuds;
        Assert.True(part > 0.5, $"composante principale trop petite : {part:P0}");
    }

    [Fact]
    public void RefuseUnPaquetTropRecent()
    {
        var dossier = Dossier()!;
        var tmp = Directory.CreateTempSubdirectory().FullName;
        foreach (var f in Directory.GetFiles(dossier)) File.Copy(f, Path.Combine(tmp, Path.GetFileName(f)));
        var m = File.ReadAllText(Path.Combine(tmp, "manifest.json")).Replace("\"version_format\": 1", "\"version_format\": 99");
        File.WriteAllText(Path.Combine(tmp, "manifest.json"), m);
        Assert.Throws<InvalidDataException>(() => PaquetVille.Charger(tmp));
    }
}
