using Ville.Coeur;
using Ville.Gestion;
using Xunit;

namespace Ville.Tests;

public class TestsElections
{
    private static (Partie p, Robot r, Elections el) Partie()
    {
        var p = Ville.Coeur.Partie.NouvelleFondation(Fixtures.Reglages(), Fixtures.Annecy.Value, 5);
        p.Modules.Add(new VraieGestion(p.R));
        var el = new Elections(p.R);
        p.Modules.Add(el);
        el.Initialiser(p);
        var r = new Robot(p);
        r.Demarrer();
        return (p, r, el);
    }

    [Fact]
    public void UnMandatSeTermineParUneElection()
    {
        var (p, r, el) = Partie();
        Assert.True(el.PromettreOuRetirer(p, "bus", true));
        Assert.True(el.TotalSieges >= 15);
        Assert.True(el.MajoritePropre);
        r.Jouer(74);
        Assert.Single(el.E.Historique);
        Assert.Contains(p.Messages, m => m.Texte.Contains("Campagne électorale"));
    }

    [Fact]
    public void PerdreNEffacePasLaPartie()
    {
        var (p, r, el) = Partie();
        r.Jouer(70);
        el.E.Popularite = 5;
        for (int j = 0; j < 30 * 4; j++) p.AvancerJour();
        var defaite = Assert.Single(p.Decisions, d => d.Type == "defaite");
        Assert.Equal(3, defaite.Choix.Count);
        p.Repondre(defaite.Id, 0); // opposition
        Assert.True(el.EnOpposition);
        var refus = p.ConstruireRoute(new V2(-900, 300), new V2(-800, 300), "rue");
        Assert.False(refus.Ok);
        Assert.Contains("opposition", refus.Message);
        int habitants = p.Population;
        for (int j = 0; j < 30 * 13; j++) p.AvancerJour();
        Assert.False(el.EnOpposition);
        Assert.True(p.Population > 0, "la ville a continué de vivre");
        Assert.Equal(2, el.E.Historique.Count); // l'élection anticipée a eu lieu
    }

    [Fact]
    public void ContinuerSansElections()
    {
        var (p, r, el) = Partie();
        r.Jouer(70);
        el.E.Popularite = 5;
        for (int j = 0; j < 30 * 4; j++) p.AvancerJour();
        p.Repondre(p.Decisions.First(d => d.Type == "defaite").Id, 2);
        Assert.Null(p.Module<Elections>());
        Assert.Null(p.Verrou);
    }

    [Fact]
    public void LeConseilVote()
    {
        var (p, r, el) = Partie();
        r.Jouer(3);
        var g = p.Module<VraieGestion>()!;
        var ok = el.VoterPolitique(p, "plan_velo", true);
        Assert.True(ok.Ok, ok.Message);
        Assert.True(g.Active("plan_velo"));
        // sans majorité : il faut un compromis
        el.E.Sieges["maire"] = 2;
        var non = el.VoterPolitique(p, "eclairage_reduit", true);
        if (!non.Ok)
        {
            var d = Assert.Single(p.Decisions, x => x.Type == "compromis");
            p.Repondre(d.Id, 0);
            Assert.True(g.Active("eclairage_reduit"));
        }
    }

    [Fact]
    public void SauvegardeAvecElections()
    {
        var (p, r, el) = Partie();
        el.PromettreOuRetirer(p, "impots", true);
        r.Jouer(10);
        var q = Ville.Coeur.Partie.Charger(p.Sauvegarder(), Fixtures.Reglages(), Fixtures.Annecy.Value);
        Assert.Equal(p.Sauvegarder(), q.Sauvegarder());
        Assert.Contains("impots", q.Module<Elections>()!.E.Promesses);
        for (int j = 0; j < 60; j++) { p.AvancerJour(); q.AvancerJour(); }
        Assert.Equal(p.Sauvegarder(), q.Sauvegarder());
    }
}
