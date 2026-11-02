using Ville.Donnees;
using Ville.Coeur;
using Xunit;

namespace Ville.Tests;

public static class Fixtures
{
    private static string Racine()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
            if (Directory.Exists(Path.Combine(d.FullName, "donnees", "reglages"))) return d.FullName;
        throw new DirectoryNotFoundException("dossier nom-du-jeu introuvable");
    }

    public static readonly Lazy<PaquetVille> Annecy = new(() =>
        PaquetVille.Charger(Path.Combine(Racine(), "donnees", "villes", "fr-annecy_quartier_v1")));

    public static Reglages Reglages() => Ville.Coeur.Reglages.Charger(Path.Combine(Racine(), "donnees", "reglages", "prototype.json"));

    public static string Chemin(params string[] p) => Path.Combine(new[] { Racine() }.Concat(p).ToArray());
}

public class TestsPartie
{
    private static Partie Nouvelle() => Partie.NouvelleFondation(Fixtures.Reglages(), Fixtures.Annecy.Value, 1);

    [Fact]
    public void FondationImporteLesGrandsAxes()
    {
        var p = Nouvelle();
        Assert.True(p.Reseau.Aretes.Count > 100);
        Assert.All(p.Reseau.Aretes.Values, e => Assert.True(e.Departemental));
        Assert.Contains(p.Reseau.Noeuds.Values, n => n.Entree);
        Assert.Equal(0, p.Population);
        Assert.Equal(p.R.ArgentDepart, p.Argent);
    }

    [Fact]
    public void RouteSurLEauRefusee()
    {
        var p = Nouvelle();
        // centre du lac d'Annecy dans ce paquet (est de la zone)
        var r = p.ConstruireRoute(new V2(700, -600), new V2(1950, -600), "rue");
        Assert.False(r.Ok);
        Assert.Contains("Pont trop long", r.Message);
    }

    [Fact]
    public void PontSurLaRiviereCouteDavantage()
    {
        var p = Nouvelle();
        // cherche une traversée courte d'un cours d'eau (moins de 450 m d'eau)
        V2? depart = null;
        for (double x = -1900; x < 1900 && depart == null; x += 40)
            for (double y = -1900; y < 1900 && depart == null; y += 40)
            {
                var a = new V2(x, y); var b = new V2(x + 120, y);
                if (!p.Grille.Eau(a) && !p.Grille.Eau(b) && p.Grille.Eau(new V2(x + 60, y)))
                {
                    var ap = p.PrevoirRoute(a, b, "rue");
                    if (ap.Ok && ap.Pont) depart = a;
                }
            }
        Assert.NotNull(depart);
        var apercu = p.PrevoirRoute(depart!.Value, depart.Value + new V2(120, 0), "rue");
        Assert.True(apercu.Cout > apercu.Longueur * p.R.Route("rue").CoutParM, "un pont coûte plus cher qu'une rue");
        var r = p.ConstruireRoute(depart.Value, depart.Value + new V2(120, 0), "rue");
        Assert.True(r.Ok, r.Message);
        Assert.Contains(p.Reseau.Aretes.Values, e => e.Pont);
        var q = Partie.Charger(p.Sauvegarder(), Fixtures.Reglages(), Fixtures.Annecy.Value);
        Assert.Contains(q.Reseau.Aretes.Values, e => e.Pont);
    }

    [Fact]
    public void BacASableGratuitEtToutDebloque()
    {
        var p = Partie.NouveauBacASable(Fixtures.Reglages(), Fixtures.Annecy.Value, 1);
        double avant = p.Argent;
        new Robot(p).Demarrer();
        Assert.Equal(avant, p.Argent);
        Assert.True(p.ServiceDisponible("commissariat"));
    }

    [Fact]
    public void ServicesDuSocleEtBouchons()
    {
        var p = Nouvelle();
        var r = new Robot(p);
        r.Demarrer();
        r.Jouer(26);
        Assert.True(p.Palier >= 2);
        var services = string.Join(",", p.Parcelles.Values.Where(x => x.Service != null).Select(x => x.Service).Distinct());
        Assert.True(services.Contains("centre_tri") && services.Contains("caserne_pompiers"), services + " | " + string.Join(" / ", r.Journal.TakeLast(8)));
        Assert.True(p.DechetsCapacite > 0);
        Assert.NotEmpty(p.Congestion);
        Assert.All(p.Congestion.Values, c => Assert.True(c >= 0 && !double.IsNaN(c)));
    }

    [Fact]
    public void RouteCreeDesParcellesEtCouteDeLArgent()
    {
        var p = Nouvelle();
        var robot = new Robot(p);
        double avant = p.Argent;
        int parcellesAvant = p.Parcelles.Count;
        robot.Demarrer();
        Assert.True(p.Argent < avant);
        Assert.True(p.Parcelles.Count > parcellesAvant);
        Assert.Contains(p.Parcelles.Values, x => x.Zone == Zone.Habitat);
    }

    [Fact]
    public void CroisementCoupeLesRoutes()
    {
        var p = Nouvelle();
        var c = new V2(-711, 388);
        Assert.True(p.ConstruireRoute(c + new V2(-100, 0), c + new V2(100, 0), "rue").Ok);
        int noeuds = p.Reseau.Noeuds.Count;
        var r2 = p.ConstruireRoute(c + new V2(0, -100), c + new V2(0, 100), "rue");
        Assert.True(r2.Ok, r2.Message);
        var proches = string.Join(" ; ", p.Reseau.Noeuds.Values.Where(n => V2.Distance(n.Pos, c) < 120).Select(n => $"{n.Pos} d{p.Reseau.Degre(n.Id)}"));
        Assert.True(p.Reseau.Noeuds.Values.Any(n => V2.Distance(n.Pos, c) < 5 && p.Reseau.Degre(n.Id) == 4), $"c={c} : {proches}");
        // le croisement crée un nœud partagé de degré 4
        
        Assert.True(p.Reseau.Noeuds.Count >= noeuds + 3);
    }

    [Fact]
    public void Prototype20MinutesFaitGrandirLaVille()
    {
        var p = Nouvelle();
        var robot = new Robot(p);
        robot.Demarrer();
        var pops = new List<int>();
        robot.Jouer(20, x => pops.Add(x.Population));
        Assert.True(pops[1] > 0, "la ville doit commencer à grandir dès les deux premiers mois");
        Assert.InRange(pops[^1], 1500, 15000);
        Assert.True(p.Palier >= 2, "au moins deux paliers franchis en 20 minutes");
        Assert.True(p.Argent > -50000, "le budget ne doit pas s'effondrer avec un jeu raisonnable");
        Assert.Contains(p.Parcelles.Values, x => x.Service == "ecole");
        Assert.Contains(p.Messages, m => m.Type == "palier");
    }

    [Fact]
    public void SimulationDeterministe()
    {
        string Jouer()
        {
            var p = Nouvelle();
            var r = new Robot(p);
            r.Demarrer();
            r.Jouer(6);
            return p.Sauvegarder();
        }
        Assert.Equal(Jouer(), Jouer());
    }

    [Fact]
    public void SauvegardeRechargeeContinueAPareil()
    {
        var p = Nouvelle();
        var robot = new Robot(p);
        robot.Demarrer();
        robot.Jouer(5);
        string json = p.Sauvegarder();
        var q = Partie.Charger(json, Fixtures.Reglages(), Fixtures.Annecy.Value);
        Assert.Equal(json, q.Sauvegarder());
        for (int i = 0; i < 90; i++) { p.AvancerJour(); q.AvancerJour(); }
        Assert.Equal(p.Population, q.Population);
        Assert.Equal(p.Argent, q.Argent, 6);
        Assert.Equal(p.Sauvegarder(), q.Sauvegarder());
    }

    [Fact]
    public void SauvegardeV1FigeeResteLisible()
    {
        // Ce fichier a été produit par la version 1 du jeu. Il ne doit JAMAIS cesser de se charger.
        var chemin = Fixtures.Chemin("tests", "sauvegardes", "v1_annecy_mois12.json");
        var q = Partie.Charger(File.ReadAllText(chemin), Fixtures.Reglages(), Fixtures.Annecy.Value);
        Assert.True(q.Population > 0);
        for (int i = 0; i < 60; i++) q.AvancerJour();
        Assert.True(q.Population > 0);
    }

    [Fact]
    public void RefuseUneSauvegardeDuFutur()
    {
        var p = Nouvelle();
        var json = p.Sauvegarder().Replace("\"version\": 1", "\"version\": 999");
        Assert.Throws<InvalidDataException>(() => Partie.Charger(json, Fixtures.Reglages(), Fixtures.Annecy.Value));
    }

    [Fact]
    public void PartieVieillieStable()
    {
        // 200 mois de jeu (environ 3 h 20 à vitesse normale) : aucune valeur absurde, temps par jour borné.
        // Le test de 50 h complet est dans le banc (dotnet run -- --vieillir).
        var p = Nouvelle();
        var robot = new Robot(p);
        robot.Demarrer();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        robot.Jouer(200);
        double msParJour = sw.Elapsed.TotalMilliseconds / (200 * 30);
        Assert.True(msParJour < 20, $"{msParJour:F1} ms par jour de jeu");
        Assert.False(double.IsNaN(p.Argent) || double.IsInfinity(p.Argent));
        Assert.InRange(p.Population, 1, 200000);
        Assert.True(p.Messages.Count <= 200);
        Assert.Equal(200, p.Historique.Count);
        var q = Partie.Charger(p.Sauvegarder(), Fixtures.Reglages(), Fixtures.Annecy.Value);
        Assert.Equal(p.Population, q.Population);
    }

    [Fact]
    public void EmpruntRembourseAvecInterets()
    {
        var p = Nouvelle();
        double avant = p.Argent;
        Assert.True(p.Emprunter().Ok);
        Assert.Equal(avant + p.R.Emprunt.Montant, p.Argent);
        var em = p.Emprunts[0];
        double total = em.Mensualite * p.R.Emprunt.DureeMois;
        Assert.True(total > p.R.Emprunt.Montant && total < p.R.Emprunt.Montant * 1.3);
        for (int i = 0; i < p.R.Emprunt.Max - 1; i++) p.Emprunter();
        Assert.False(p.Emprunter().Ok);
    }

    [Fact]
    public void ImpotsHautsFontBaisserLaDemande()
    {
        var p = Nouvelle();
        var r = new Robot(p);
        r.Demarrer();
        r.Jouer(8);
        p.MettreAJourServices();
        double normal = p.DemandeHabitat;
        p.ReglerImpot(Zone.Habitat, 0.25);
        p.MettreAJourServices();
        Assert.True(p.DemandeHabitat < normal);
    }
}
