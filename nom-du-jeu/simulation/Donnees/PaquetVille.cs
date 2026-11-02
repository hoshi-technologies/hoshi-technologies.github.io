using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Ville.Donnees;

// Lecture d'un « paquet de ville » (format décrit dans outils/preparation_ville/FORMAT_PAQUET.md).
// Repère : x vers l'est, y vers le nord, en mètres, origine au centre.

public sealed record Manifest(
    [property: JsonPropertyName("format")] string Format,
    [property: JsonPropertyName("version_format")] int VersionFormat,
    [property: JsonPropertyName("ville")] InfoVille Ville,
    [property: JsonPropertyName("repere")] Repere Repere,
    [property: JsonPropertyName("relief")] InfoRelief Relief,
    [property: JsonPropertyName("qualite")] JsonElement Qualite,
    [property: JsonPropertyName("estimations")] JsonElement Estimations);

public sealed record InfoVille(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("nom")] string Nom,
    [property: JsonPropertyName("pays")] string Pays,
    [property: JsonPropertyName("taille")] string Taille,
    [property: JsonPropertyName("cote_km")] double CoteKm);

public sealed record Repere([property: JsonPropertyName("demi_cote_m")] double DemiCoteM);

public sealed record InfoRelief(
    [property: JsonPropertyName("fichier")] string Fichier,
    [property: JsonPropertyName("colonnes")] int Colonnes,
    [property: JsonPropertyName("lignes")] int Lignes,
    [property: JsonPropertyName("pas_m")] double PasM,
    [property: JsonPropertyName("alt_min_m")] double AltMin,
    [property: JsonPropertyName("alt_max_m")] double AltMax);

public sealed record Batiment(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("contour")] double[][] Contour,
    [property: JsonPropertyName("hauteur_m")] double HauteurM,
    [property: JsonPropertyName("etages")] int Etages,
    [property: JsonPropertyName("usage")] string Usage,
    [property: JsonPropertyName("estime")] string[] Estime,
    [property: JsonPropertyName("source")] string Source,
    [property: JsonPropertyName("surface_m2")] double SurfaceM2,
    [property: JsonPropertyName("toit_forme")] string? ToitForme = null,
    [property: JsonPropertyName("toit_couleur")] string? ToitCouleur = null,
    [property: JsonPropertyName("toit_materiau")] string? ToitMateriau = null,
    [property: JsonPropertyName("facade_couleur")] string? FacadeCouleur = null,
    [property: JsonPropertyName("facade_materiau")] string? FacadeMateriau = null);

public sealed record Bois(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("classe")] string? Classe,
    [property: JsonPropertyName("contour")] double[][] Contour);

public sealed record Nature(
    [property: JsonPropertyName("arbres")] double[][] Arbres,
    [property: JsonPropertyName("bois")] Bois[] Bois);

public sealed record Mobilier(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("x")] double X,
    [property: JsonPropertyName("y")] double Y);

public sealed record Noeud(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("x")] double X,
    [property: JsonPropertyName("y")] double Y);

public sealed record Troncon(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("a")] int A,
    [property: JsonPropertyName("b")] int B,
    [property: JsonPropertyName("gabarit")] string Gabarit,
    [property: JsonPropertyName("nom")] string? Nom,
    [property: JsonPropertyName("pont")] bool Pont,
    [property: JsonPropertyName("tunnel")] bool Tunnel,
    [property: JsonPropertyName("trace")] double[][] Trace,
    [property: JsonPropertyName("longueur_m")] double LongueurM);

public sealed record Routes(
    [property: JsonPropertyName("noeuds")] Noeud[] Noeuds,
    [property: JsonPropertyName("troncons")] Troncon[] Troncons);

public sealed record Surface(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("type")] string? Type,
    [property: JsonPropertyName("classe")] string? Classe,
    [property: JsonPropertyName("nom")] string? Nom,
    [property: JsonPropertyName("contour")] double[][] Contour);

public sealed record CoursEau(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("classe")] string? Classe,
    [property: JsonPropertyName("trace")] double[][] Trace);

public sealed record Eau(
    [property: JsonPropertyName("surfaces")] Surface[] Surfaces,
    [property: JsonPropertyName("cours")] CoursEau[] Cours);

public sealed class PaquetVille
{
    public const int VersionFormatMax = 1;

    public required Manifest Manifest { get; init; }
    public required Batiment[] Batiments { get; init; }
    public required Routes Routes { get; init; }
    public required Eau Eau { get; init; }
    public required Surface[] Sols { get; init; }
    /// <summary>Arbres isolés et bois (facultatif : absent des paquets plus anciens).</summary>
    public Nature Nature { get; init; } = new(Array.Empty<double[]>(), Array.Empty<Bois>());
    public Mobilier[] Mobilier { get; init; } = Array.Empty<Mobilier>();
    /// <summary>Altitudes, ligne 0 = nord, colonne 0 = ouest.</summary>
    public required float[] Relief { get; init; }

    public static PaquetVille Charger(string dossier)
    {
        var manifest = JsonSerializer.Deserialize<Manifest>(File.ReadAllText(Path.Combine(dossier, "manifest.json")))
                       ?? throw new InvalidDataException("manifest.json illisible");
        if (manifest.Format != "paquet_ville")
            throw new InvalidDataException("Ce dossier n'est pas un paquet de ville.");
        if (manifest.VersionFormat > VersionFormatMax)
            throw new InvalidDataException($"Paquet de version {manifest.VersionFormat}, trop récent pour ce jeu.");

        var r = manifest.Relief;
        var octets = File.ReadAllBytes(Path.Combine(dossier, r.Fichier));
        var relief = new float[r.Colonnes * r.Lignes];
        if (octets.Length != relief.Length * 4)
            throw new InvalidDataException("Taille du relief incohérente.");
        for (int i = 0; i < relief.Length; i++)
            relief[i] = BitConverter.ToSingle(octets, i * 4); // little-endian (Windows, Linux x86/ARM)

        return new PaquetVille
        {
            Manifest = manifest,
            Batiments = LireGz<Batiment[]>(dossier, "batiments.json.gz"),
            Routes = LireGz<Routes>(dossier, "routes.json.gz"),
            Eau = LireGz<Eau>(dossier, "eau.json.gz"),
            Sols = LireGz<Surface[]>(dossier, "sols.json.gz"),
            Nature = File.Exists(Path.Combine(dossier, "nature.json.gz")) ? LireGz<Nature>(dossier, "nature.json.gz") : new(Array.Empty<double[]>(), Array.Empty<Bois>()),
            Mobilier = File.Exists(Path.Combine(dossier, "mobilier.json.gz")) ? LireGz<Mobilier[]>(dossier, "mobilier.json.gz") : Array.Empty<Mobilier>(),
            Relief = relief,
        };
    }

    private static T LireGz<T>(string dossier, string nom)
    {
        using var f = File.OpenRead(Path.Combine(dossier, nom));
        using var gz = new GZipStream(f, CompressionMode.Decompress);
        return JsonSerializer.Deserialize<T>(gz) ?? throw new InvalidDataException($"{nom} illisible");
    }

    /// <summary>Altitude interpolée en (x, y) mètres.</summary>
    public float Altitude(double x, double y)
    {
        var r = Manifest.Relief;
        double demi = Manifest.Repere.DemiCoteM;
        double c = Math.Clamp((x + demi) / r.PasM, 0, r.Colonnes - 1.001);
        double l = Math.Clamp((demi - y) / r.PasM, 0, r.Lignes - 1.001);
        int c0 = (int)c, l0 = (int)l;
        double dc = c - c0, dl = l - l0;
        float z00 = Relief[l0 * r.Colonnes + c0], z01 = Relief[l0 * r.Colonnes + c0 + 1];
        float z10 = Relief[(l0 + 1) * r.Colonnes + c0], z11 = Relief[(l0 + 1) * r.Colonnes + c0 + 1];
        return (float)(z00 * (1 - dc) * (1 - dl) + z01 * dc * (1 - dl) + z10 * (1 - dc) * dl + z11 * dc * dl);
    }
}
