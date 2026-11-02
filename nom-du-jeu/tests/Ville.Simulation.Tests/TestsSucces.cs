using Ville.Coeur;
using Ville.Succes;
using Xunit;

namespace Ville.Tests;

public class TestsSucces
{
    [Fact]
    public void IdentifiantsUniquesEtCompatiblesSteam()
    {
        var ids = CatalogueSucces.Tous.Select(d => d.Id).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());
        Assert.All(ids, id => Assert.Matches("^[A-Z0-9_]{3,64}$", id));
        Assert.All(CatalogueSucces.Tous, d => Assert.False(string.IsNullOrWhiteSpace(d.NomEn + d.DescriptionEn)));
    }

    [Fact]
    public void RienAuDepartPuisPremiereRueEtPaliers()
    {
        var p = Partie.NouvelleFondation(Fixtures.Reglages(), Fixtures.Annecy.Value, 3);
        Assert.Empty(CatalogueSucces.Verifier(p, new HashSet<string>()));
        var robot = new Robot(p);
        robot.Demarrer();
        var obtenus = new HashSet<string>(CatalogueSucces.Verifier(p, new HashSet<string>()));
        Assert.Contains("PREMIERE_RUE", obtenus);
        robot.Jouer(60, q => obtenus.UnionWith(CatalogueSucces.Verifier(q, obtenus)));
        Assert.Contains("PALIER_BOURG", obtenus);
        // un succès déjà obtenu n'est jamais redonné
        Assert.DoesNotContain("PREMIERE_RUE", CatalogueSucces.Verifier(p, obtenus));
    }

    [Fact]
    public void BacASableEtVilleReelleNeDonnentPasLesPaliers()
    {
        var sable = Partie.NouveauBacASable(Fixtures.Reglages(), Fixtures.Annecy.Value, 1);
        new Robot(sable).Demarrer();
        Assert.Empty(CatalogueSucces.Verifier(sable, new HashSet<string>()));
        var reelle = Partie.Nouvelle(Fixtures.Reglages(), Fixtures.Annecy.Value, ModeDepart.VilleReelle, 1);
        Assert.True(reelle.Palier >= 1);
        Assert.DoesNotContain(CatalogueSucces.Verifier(reelle, new HashSet<string>()), id => id.StartsWith("PALIER_"));
    }
}
