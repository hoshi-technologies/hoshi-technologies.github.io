using System.Text.Json;
using Ville.Donnees;

namespace Ville.Coeur;

// Format de sauvegarde versionné. Règle : on ne supprime jamais un champ ; tout changement
// incompatible augmente VersionSauvegarde et ajoute une étape dans Migrer().

public sealed class SauvegardeDto
{
    public int Version { get; set; }
    public string VilleId { get; set; } = "";
    public int Jour { get; set; }
    public double Argent { get; set; }
    public double ImpotHabitat { get; set; }
    public double ImpotCommerce { get; set; }
    public double ImpotActivites { get; set; }
    public int Palier { get; set; }
    public ulong Alea { get; set; }
    public int ProchainNoeud { get; set; }
    public int ProchaineArete { get; set; }
    public int ProchaineParcelle { get; set; }
    public int ProchainArret { get; set; }
    public List<NoeudDto> Noeuds { get; set; } = new();
    public List<AreteDto> Aretes { get; set; } = new();
    public List<ParcelleDto> Parcelles { get; set; } = new();
    public List<ArretDto> Arrets { get; set; } = new();
    public List<Emprunt> Emprunts { get; set; } = new();
    public List<MessageVille> Messages { get; set; } = new();
    public List<PointMois> Historique { get; set; } = new();
    public Dictionary<string, int> DernierMessage { get; set; } = new();
    // ajoutés après la v1 (champs facultatifs : les anciennes sauvegardes restent lisibles)
    public bool BacASable { get; set; }
    public bool ModeVilleReelle { get; set; }
    public ModeDepart Depart { get; set; } = ModeDepart.GrandsAxes;
    /// <summary>Taille de la carte (quartier, ville…) : choisit le bon paquet au chargement.</summary>
    public string Taille { get; set; } = "quartier";
}

public sealed record NoeudDto(int Id, double X, double Y, bool Entree);
public sealed record AreteDto(int Id, int A, int B, double[] Trace, string Gabarit, bool Departemental, string? Nom, bool Pont = false, bool Importee = false);
public sealed record ArretDto(int Id, int Arete, double X, double Y);
public sealed record BatimentDto(Zone Type, int Niveau, double Occupants, int JoursChantier, int MoisDepuisNiveau, int MoisSansService, bool Reel = false, int? CapaciteFixe = null);
public sealed record ParcelleDto(int Id, int Arete, double[] Geo, Zone Zone, string? Service, double Attrait, int Variante, BatimentDto? Batiment, double[]? Contour = null, double HauteurReelle = 0);

public sealed partial class Partie
{
    public SauvegardeDto VersDto() => new()
    {
        Version = VersionSauvegarde,
        VilleId = Paquet.Manifest.Ville.Id,
        Jour = Jour, Argent = Argent, ImpotHabitat = ImpotHabitat, ImpotCommerce = ImpotCommerce, ImpotActivites = ImpotActivites,
        Palier = Palier, Alea = _alea.Etat,
        ProchainNoeud = Reseau.ProchainNoeud, ProchaineArete = Reseau.ProchaineArete,
        ProchaineParcelle = _prochaineParcelle, ProchainArret = _prochainArret,
        Noeuds = Reseau.Noeuds.Values.Select(n => new NoeudDto(n.Id, n.Pos.X, n.Pos.Y, n.Entree)).ToList(),
        Aretes = Reseau.Aretes.Values.Select(e => new AreteDto(e.Id, e.A, e.B, e.Trace.SelectMany(p => new[] { p.X, p.Y }).ToArray(), e.Gabarit, e.Departemental, e.Nom, e.Pont, e.Importee)).ToList(),
        Parcelles = Parcelles.Values.Select(p => new ParcelleDto(p.Id, p.Arete,
            new[] { p.Centre.X, p.Centre.Y, p.Dir.X, p.Dir.Y, p.Normale.X, p.Normale.Y }, p.Zone, p.Service, p.Attrait, p.Variante,
            p.Batiment == null ? null : new BatimentDto(p.Batiment.Type, p.Batiment.Niveau, p.Batiment.Occupants, p.Batiment.JoursChantier, p.Batiment.MoisDepuisNiveau, p.Batiment.MoisSansService, p.Batiment.Reel, p.Batiment.CapaciteFixe),
            p.Contour?.SelectMany(c => new[] { c.X, c.Y }).ToArray(), p.HauteurReelle)).ToList(),
        Arrets = Arrets.Values.Select(a => new ArretDto(a.Id, a.Arete, a.Pos.X, a.Pos.Y)).ToList(),
        Emprunts = Emprunts.ToList(),
        Messages = Messages.TakeLast(50).ToList(),
        Historique = Historique.ToList(),
        DernierMessage = new Dictionary<string, int>(_dernierMessage),
        BacASable = BacASable,
        ModeVilleReelle = ModeVilleReelle,
        Depart = Depart,
        Taille = Paquet.Manifest.Ville.Taille,
    };

    public string Sauvegarder() => JsonSerializer.Serialize(VersDto(), Reglages.Json);

    /// <summary>Écrit la sauvegarde compressée (gzip), de façon atomique : jamais de fichier à moitié écrit.</summary>
    public void SauvegarderFichier(string chemin)
    {
        var tmp = chemin + ".tmp";
        using (var f = File.Create(tmp))
        using (var gz = new System.IO.Compression.GZipStream(f, System.IO.Compression.CompressionLevel.Fastest))
        using (var w = new StreamWriter(gz))
            w.Write(Sauvegarder());
        File.Move(tmp, chemin, overwrite: true);
    }

    /// <summary>Lit un fichier de sauvegarde, compressé ou non.</summary>
    public static string LireFichier(string chemin)
    {
        var octets = File.ReadAllBytes(chemin);
        if (octets.Length > 2 && octets[0] == 0x1f && octets[1] == 0x8b)
        {
            using var gz = new System.IO.Compression.GZipStream(new MemoryStream(octets), System.IO.Compression.CompressionMode.Decompress);
            using var r = new StreamReader(gz);
            return r.ReadToEnd();
        }
        return System.Text.Encoding.UTF8.GetString(octets);
    }

    public static Partie Charger(string json, Reglages r, PaquetVille paquet)
    {
        var dto = JsonSerializer.Deserialize<SauvegardeDto>(json, Reglages.Json) ?? throw new InvalidDataException("Sauvegarde illisible.");
        Migrer(dto);
        if (dto.Taille != paquet.Manifest.Ville.Taille) throw new InvalidDataException($"Cette sauvegarde utilise la carte « {dto.Taille} ».");
        if (dto.VilleId != paquet.Manifest.Ville.Id) throw new InvalidDataException($"Cette sauvegarde concerne la ville « {dto.VilleId} ».");
        var p = new Partie(r, paquet, 1)
        {
            Jour = dto.Jour, Argent = dto.Argent, ImpotHabitat = dto.ImpotHabitat, ImpotCommerce = dto.ImpotCommerce,
            ImpotActivites = dto.ImpotActivites, Palier = dto.Palier, BacASable = dto.BacASable, ModeVilleReelle = dto.ModeVilleReelle, Depart = dto.Depart,
        };
        p._alea.Etat = dto.Alea;
        foreach (var n in dto.Noeuds) p.Reseau.RestaurerNoeud(new NoeudRoute { Id = n.Id, Pos = new V2(n.X, n.Y), Entree = n.Entree });
        foreach (var e in dto.Aretes)
        {
            var trace = new List<V2>();
            for (int i = 0; i + 1 < e.Trace.Length; i += 2) trace.Add(new V2(e.Trace[i], e.Trace[i + 1]));
            var a = new AreteRoute { Id = e.Id, A = e.A, B = e.B, Trace = trace, Gabarit = e.Gabarit, Departemental = e.Departemental, Nom = e.Nom, Pont = e.Pont, Importee = e.Importee };
            p.Reseau.RestaurerArete(a);
            p.RasteriserRoute(a);
        }
        p.Reseau.ProchainNoeud = dto.ProchainNoeud;
        p.Reseau.ProchaineArete = dto.ProchaineArete;
        foreach (var d in dto.Parcelles)
        {
            var par = new Parcelle
            {
                Id = d.Id, Arete = d.Arete, Centre = new V2(d.Geo[0], d.Geo[1]), Dir = new V2(d.Geo[2], d.Geo[3]), Normale = new V2(d.Geo[4], d.Geo[5]),
                Zone = d.Zone, Service = d.Service, Attrait = d.Attrait, Variante = d.Variante, HauteurReelle = d.HauteurReelle,
                Contour = d.Contour == null ? null : Enumerable.Range(0, d.Contour.Length / 2).Select(i => new V2(d.Contour[2 * i], d.Contour[2 * i + 1])).ToList(),
            };
            if (d.Batiment is { } b)
                par.Batiment = new Batiment { Type = b.Type, Niveau = b.Niveau, Occupants = b.Occupants, JoursChantier = b.JoursChantier, MoisDepuisNiveau = b.MoisDepuisNiveau, MoisSansService = b.MoisSansService, Reel = b.Reel, CapaciteFixe = b.CapaciteFixe };
            p.Parcelles[par.Id] = par;
            var cellules = par.Contour != null ? p.Grille.CellulesPolygone(par.Contour)
                : p.Grille.CellulesRectangle(par.Centre, par.Dir, r.Parcelles.LargeurM / 2 - 0.6, r.Parcelles.ProfondeurM / 2 - 0.6);
            p.Grille.MarquerParcelle(cellules, par.Id);
            p._cellulesParcelle[par.Id] = cellules;
            if (par.Arete >= 0) Ajouter(p._parcellesParArete, par.Arete, par.Id);
        }
        foreach (var a in dto.Arrets) p.Arrets[a.Id] = new ArretBus { Id = a.Id, Arete = a.Arete, Pos = new V2(a.X, a.Y) };
        p._prochaineParcelle = dto.ProchaineParcelle;
        p._prochainArret = dto.ProchainArret;
        p.Emprunts.AddRange(dto.Emprunts);
        p.Messages.AddRange(dto.Messages);
        p.Historique.AddRange(dto.Historique);
        foreach (var (k, v) in dto.DernierMessage) p._dernierMessage[k] = v;
        p.MettreAJourServices();
        // recalcule les couvertures (école, santé…) sans toucher à l'attrait sauvegardé
        var attraits = p.Parcelles.Values.ToDictionary(x => x.Id, x => x.Attrait);
        p.CalculerAttraitPublic();
        foreach (var x in p.Parcelles.Values) x.Attrait = attraits[x.Id];
        return p;
    }

    internal void CalculerAttraitPublic() => CalculerAttrait();

    /// <summary>Lit seulement la ville et la taille d'une sauvegarde (pour charger la bonne carte).</summary>
    public static (string villeId, string taille) LireEntete(string json)
    {
        var dto = JsonSerializer.Deserialize<SauvegardeDto>(json, Reglages.Json) ?? throw new InvalidDataException("Sauvegarde illisible.");
        return (dto.VilleId, dto.Taille);
    }

    /// <summary>Fait passer une ancienne sauvegarde au format actuel, version par version.</summary>
    private static void Migrer(SauvegardeDto dto)
    {
        if (dto.Version > VersionSauvegarde)
            throw new InvalidDataException("Cette sauvegarde vient d'une version plus récente du jeu.");
        // exemple pour l'avenir :
        // if (dto.Version == 1) { /* convertir v1 -> v2 */ dto.Version = 2; }
        dto.Version = VersionSauvegarde;
    }
}
