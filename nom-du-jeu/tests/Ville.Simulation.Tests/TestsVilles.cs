using Ville.Coeur;
using Ville.Donnees;
using Xunit;

namespace Ville.Tests;

/// <summary>Règles par pays et chargement de toutes les villes livrées avec le jeu.</summary>
public class TestsVilles
{
    private static string Base => Fixtures.Chemin("donnees", "reglages", "prototype.json");

    [Fact]
    public void ReglesEtatsUnisFusionnees()
    {
        var fr = Reglages.ChargerPourPays(Base, "FR");
        var us = Reglages.ChargerPourPays(Base, "US");
        Assert.Equal("€", fr.Monnaie);
        Assert.Equal("$", us.Monnaie);
        Assert.Equal(2.5, us.PersonnesParLogement);
        Assert.Contains("Emma", us.Prenoms);
        Assert.DoesNotContain("Emma", fr.Prenoms);
        // ce que le fichier pays ne touche pas reste identique
        Assert.Equal(fr.ArgentDepart, us.ArgentDepart);
        Assert.Equal(fr.JoursParMois, us.JoursParMois);
        // section de module fusionnée en profondeur : mandat de 4 ans, groupes conservés
        var mandat = us.Extra["elections"].GetProperty("duree_mandat_mois").GetDouble();
        Assert.Equal(48, mandat);
        Assert.True(us.Extra["elections"].GetProperty("groupes").GetArrayLength() > 0);
        Assert.Equal(72, fr.Extra["elections"].GetProperty("duree_mandat_mois").GetDouble());
    }

    [Fact]
    public void PaysInconnuDonneLesReglagesDeBase()
    {
        var x = Reglages.ChargerPourPays(Base, "ZZ");
        var b = Reglages.Charger(Base);
        Assert.Equal(b.Monnaie, x.Monnaie);
        Assert.Equal(b.PersonnesParLogement, x.PersonnesParLogement);
    }

    public static IEnumerable<object[]> Paquets() =>
        Directory.EnumerateDirectories(Fixtures.Chemin("donnees", "villes")).Where(d => d.EndsWith("_quartier_v1")).Order().Select(d => new object[] { Path.GetFileName(d) });

    [Theory]
    [MemberData(nameof(Paquets))]
    public void ChaqueVilleSeChargeEtSeJoue(string dossier)
    {
        var paquet = PaquetVille.Charger(Fixtures.Chemin("donnees", "villes", dossier));
        Assert.True(paquet.Batiments.Length > 100, "trop peu de bâtiments");
        var r = Reglages.ChargerPourPays(Base, paquet.Manifest.Ville.Pays);
        var p = Partie.Nouvelle(r, paquet, ModeDepart.VilleReelle, 7);
        Assert.True(p.Population > 0);
        for (int j = 0; j < r.JoursParMois * 3; j++) p.AvancerJour();
        Assert.True(p.Population > 0);
        Assert.False(double.IsNaN(p.Argent));
        // la vraie commune démarre à peu près à l'équilibre (recette ou charge d'équilibre estimée)
        Assert.NotNull(p.RecetteEquilibreParHabitant);
        Assert.InRange(p.RecettesMois - p.DepensesMois, -0.15 * p.DepensesMois, 0.15 * p.DepensesMois);
        // sauvegarde / chargement sur cette ville
        var copie = Partie.Charger(p.Sauvegarder(), r, paquet);
        Assert.Equal(p.Population, copie.Population);
    }
}
