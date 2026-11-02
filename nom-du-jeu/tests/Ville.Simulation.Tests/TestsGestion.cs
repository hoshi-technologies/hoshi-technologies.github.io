using Ville.Coeur;
using Ville.Gestion;
using Xunit;

namespace Ville.Tests;

public class TestsGestion
{
    private static (Partie p, Robot r, VraieGestion g) Partie(string difficulte = "realiste")
    {
        var p = Ville.Coeur.Partie.NouvelleFondation(Fixtures.Reglages(), Fixtures.Annecy.Value, 3);
        var g = new VraieGestion(p.R, difficulte);
        p.Modules.Add(g);
        var r = new Robot(p);
        r.Demarrer();
        return (p, r, g);
    }

    [Fact]
    public void LeSocleFonctionneSansModule()
    {
        var p = Ville.Coeur.Partie.NouvelleFondation(Fixtures.Reglages(), Fixtures.Annecy.Value, 3);
        Assert.Empty(p.Modules);
        var r = new Robot(p); r.Demarrer(); r.Jouer(6);
        Assert.True(p.Population > 0);
        Assert.False(p.DetailRecettes.ContainsKey("Dotation de l'État"));
    }

    [Fact]
    public void LesRuesSUsentEtSeRenovent()
    {
        var (p, _, g) = Partie();
        for (int j = 0; j < 30 * 24; j++) p.AvancerJour(); // 2 ans sans rénover
        var rue = p.Reseau.Aretes.Values.First(e => !e.Departemental);
        Assert.InRange(g.UsureRoute(rue.Id), 0.05, 0.1);
        Assert.True(p.DetailDepenses.ContainsKey("Usure des réseaux et équipements"));
        Assert.True(p.DetailRecettes.ContainsKey("Dotation de l'État") || g.E.ReservesExcessives);
        p.Argent += 1_000_000;
        var milieu = rue.Trace[0] + (rue.Trace[^1] - rue.Trace[0]) * 0.5;
        var res = g.Renover(p, milieu);
        Assert.True(res.Ok, res.Message);
        Assert.Contains(p.Reseau.Aretes.Values, e => !e.Departemental && g.UsureRoute(e.Id) == 0);
    }

    [Fact]
    public void EvenementsEtDecisions()
    {
        var (p, r, g) = Partie("crise");
        r.Jouer(60); // le robot répond aux décisions
        Assert.True(g.E.Evenements > 0, "des événements sont survenus en 5 ans de crise");
        Assert.Empty(p.Decisions);
        Assert.Contains(p.Messages, m => m.Texte.Contains("journal local"));
    }

    [Fact]
    public void SauvegardeAvecModuleEtDecision()
    {
        var (p, r, g) = Partie();
        r.Jouer(12);
        p.Proposer(VraieGestion.Identifiant, "canicule", "Test", "Texte", new[] { "A", "B" }, new() { ["cout"] = 10 });
        var json = p.Sauvegarder();
        var q = Ville.Coeur.Partie.Charger(json, Fixtures.Reglages(), Fixtures.Annecy.Value);
        Assert.Equal(json, q.Sauvegarder());
        var gq = q.Module<VraieGestion>();
        Assert.NotNull(gq);
        Assert.Equal(g.E.UsureRoutes.Count, gq!.E.UsureRoutes.Count);
        var test = Assert.Single(q.Decisions, d => d.Titre == "Test");
        q.Repondre(test.Id, 1);
        Assert.Equal(2, gq.E.MoisCanicule);
        // et la partie continue à l'identique (y compris satisfaction et politiques)
        p.Repondre(p.Decisions.First(d => d.Titre == "Test").Id, 1);
        g.ActiverPolitique(p, "plan_velo", true); gq.ActiverPolitique(q, "plan_velo", true);
        for (int j = 0; j < 60; j++) { p.AvancerJour(); q.AvancerJour(); }
        Assert.Equal(p.Sauvegarder(), q.Sauvegarder());
    }

    [Fact]
    public void SatisfactionParQuartierEtParProfil()
    {
        var (p, r, g) = Partie();
        r.Jouer(18);
        Assert.NotEmpty(g.Quartiers);
        Assert.All(g.Quartiers, q =>
        {
            Assert.InRange(q.Familles, 0, 100); Assert.InRange(q.JeunesActifs, 0, 100); Assert.InRange(q.Seniors, 0, 100);
            Assert.False(string.IsNullOrWhiteSpace(q.Nom));
        });
        Assert.InRange(g.SatisfactionGlobale, 0, 100);
        Assert.Equal(p.Population, g.Quartiers.Sum(q => q.Population), 0.05 * p.Population + 5);
    }

    [Fact]
    public void LesPolitiquesOntUnEffet()
    {
        var (p, r, g) = Partie();
        r.Jouer(12);
        p.MettreAJourServices();
        double commerce = p.DemandeCommerce, habitat = p.DemandeHabitat;
        g.ActiverPolitique(p, "aide_commerces", true);
        g.ActiverPolitique(p, "encadrement_loyers", true);
        p.MettreAJourServices();
        Assert.True(p.DemandeCommerce > commerce || p.DemandeCommerce == 100);
        Assert.True(p.DemandeHabitat < habitat || habitat == -100);
        Assert.Equal(1.0, g.FacteurVoitures(p));
        g.ActiverPolitique(p, "transports_gratuits", true);
        Assert.True(g.FacteurVoitures(p) < 1);
        double avant = p.Argent;
        for (int j = 0; j < 30; j++) p.AvancerJour();
        Assert.True(p.DetailDepenses.ContainsKey("Politiques publiques"));
        Assert.Contains(VraieGestion.ListeObjectifs, o => g.Conditions(p, o.id).Count > 0);
    }

    [Fact]
    public void LArgentNeSAccumulePlusSansFin()
    {
        var (p, r, _) = Partie();
        r.Jouer(300);
        Assert.True(p.Argent < 12 * Math.Max(p.RecettesMois, 1) * 2, $"réserves {p.Argent:N0} € pour {p.RecettesMois:N0} € de recettes mensuelles");
        Assert.True(p.Population > 5000);
    }
}
