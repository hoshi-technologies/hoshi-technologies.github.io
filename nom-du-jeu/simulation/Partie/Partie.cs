using Ville.Donnees;
using Ville.Outils;

namespace Ville.Coeur;

public enum Zone { Aucune, Habitat, Commerce, Activites }

/// <summary>Comment commence la partie.</summary>
public enum ModeDepart
{
    /// <summary>Seulement la vraie géographie : relief, eau. Aucune route.</summary>
    TerrainSeul,
    /// <summary>Géographie + grands axes réels (autoroutes, avenues).</summary>
    GrandsAxes,
    /// <summary>Géographie + toutes les vraies rues, sans bâtiments.</summary>
    RoutesReelles,
    /// <summary>La vraie ville complète : rues, bâtiments, population estimée.</summary>
    VilleReelle,
}

public sealed class Batiment
{
    public Zone Type { get; set; }
    public int Niveau { get; set; } = 1;
    /// <summary>Logements occupés (habitat) ou emplois occupés (commerce, activités).</summary>
    public double Occupants { get; set; }
    public int JoursChantier { get; set; }
    public int MoisDepuisNiveau { get; set; }
    public int MoisSansService { get; set; }
    public bool Eau { get; set; }
    public bool Elec { get; set; }
    public double Ecole { get; set; }
    // services recalculés (non sauvegardés)
    public bool Dechets { get; set; } = true;
    public double Sante { get; set; }
    public bool Police { get; set; }
    public bool Pompiers { get; set; }
    /// <summary>Bâtiment réel importé (mode Ville réelle) : capacité calculée depuis sa vraie surface.</summary>
    public bool Reel { get; set; }
    public int? CapaciteFixe { get; set; }
    public bool EnChantier => JoursChantier > 0;
}

public sealed class Parcelle
{
    public int Id { get; init; }
    public int Arete { get; set; }
    public V2 Centre { get; init; }
    /// <summary>Direction de la rue (unitaire).</summary>
    public V2 Dir { get; init; }
    /// <summary>Direction de la rue vers le fond de la parcelle (unitaire).</summary>
    public V2 Normale { get; init; }
    public Zone Zone { get; set; }
    public Batiment? Batiment { get; set; }
    public string? Service { get; set; }
    public double Attrait { get; set; } = 50;
    /// <summary>Contour réel (mode Ville réelle) ; null pour une parcelle de lotissement.</summary>
    public List<V2>? Contour { get; init; }
    public double HauteurReelle { get; set; }
    public int Variante { get; init; }
    public bool Libre => Batiment == null && Service == null;
}

public sealed class ArretBus
{
    public int Id { get; init; }
    public int Arete { get; set; }
    public V2 Pos { get; init; }
}

public sealed class MessageVille
{
    public int Jour { get; init; }
    public string Texte { get; init; } = "";
    /// <summary>info, habitant, alerte, palier</summary>
    public string Type { get; init; } = "info";
}

public sealed class Emprunt
{
    public double Restant { get; set; }
    public double Mensualite { get; set; }
    public int MoisRestants { get; set; }
}

public sealed record Resultat(bool Ok, string Message, double Cout = 0)
{
    public static Resultat Non(string m) => new(false, m);
}

public sealed record PointMois(int Mois, int Population, int Emplois, double Argent, double Recettes, double Depenses);

/// <summary>
/// Une partie : l'état complet de la ville et les règles qui la font vivre.
/// Aucune dépendance au moteur : tout est testable en ligne de commande.
/// Le temps avance par jours (<see cref="AvancerJour"/>) ; les comptes sont faits chaque fin de mois.
/// </summary>
public sealed partial class Partie
{
    public const int VersionSauvegarde = 1;

    public Reglages R { get; }
    public PaquetVille Paquet { get; }
    public ReseauVille Reseau { get; } = new();
    public GrilleOccupation Grille { get; }
    public SortedDictionary<int, Parcelle> Parcelles { get; } = new();
    public SortedDictionary<int, ArretBus> Arrets { get; } = new();
    public List<Emprunt> Emprunts { get; } = new();
    public List<MessageVille> Messages { get; } = new();
    public List<PointMois> Historique { get; } = new();

    public int Jour { get; private set; }
    public int Mois => Jour / R.JoursParMois;
    public double Argent { get; set; }
    public double ImpotHabitat { get; set; }
    public double ImpotCommerce { get; set; }
    public double ImpotActivites { get; set; }
    public int Palier { get; private set; }
    /// <summary>Mode bac à sable : argent illimité, tout est débloqué.</summary>
    public bool BacASable { get; set; }
    /// <summary>Mode Ville réelle : la vraie ville existe au départ, eau et énergie viennent du réseau régional.</summary>
    public bool ModeVilleReelle { get; set; }
    public ModeDepart Depart { get; set; } = ModeDepart.GrandsAxes;

    /// <summary>Rayon (m) autour du centre où l'on peut construire. Les petites cartes sont entièrement ouvertes.</summary>
    public double RayonConstructible
    {
        get
        {
            var r = R.Territoire.RayonsParPalierM;
            if (BacASable || Paquet.Manifest.Ville.CoteKm <= 5 || r.Length == 0) return double.PositiveInfinity;
            return r[Math.Min(Palier, r.Length - 1)];
        }
    }

    public bool Constructible(V2 p) => p.Longueur <= RayonConstructible;

    private string MessageTerritoire()
    {
        var r = R.Territoire.RayonsParPalierM;
        int suivant = Enumerable.Range(Palier + 1, Math.Max(0, Math.Min(r.Length, R.Paliers.Count) - Palier - 1)).FirstOrDefault(-1);
        return suivant > 0 ? $"Terrain pas encore ouvert à l'urbanisation : atteignez le palier « {R.Paliers[suivant].Nom} »." : "Terrain hors du territoire de la commune.";
    }

    /// <summary>Nouvelle partie selon le mode de départ choisi.</summary>
    public static Partie Nouvelle(Reglages r, PaquetVille p, ModeDepart mode, ulong graine = 1)
    {
        switch (mode)
        {
            case ModeDepart.VilleReelle: return NouvelleVilleReelle(r, p, graine);
            case ModeDepart.GrandsAxes: return NouvelleFondation(r, p, graine);
        }
        var partie = new Partie(r, p, graine)
        {
            Argent = mode == ModeDepart.RoutesReelles ? r.ArgentDepartRoutesReelles : r.ArgentDepart,
            ImpotHabitat = r.Demande.ImpotReference, ImpotCommerce = r.Demande.ImpotReference, ImpotActivites = r.Demande.ImpotReference,
            Depart = mode,
        };
        if (mode == ModeDepart.RoutesReelles)
        {
            partie.ImporterRoutesReelles(gratuites: true);
            foreach (var e in partie.Reseau.Aretes.Values.ToList()) partie.GenererParcelles(e);
            partie.Message("palier", "Les vraies rues sont là, mais la ville est vide. Zonez le long des rues, puis apportez l'eau et l'électricité.");
        }
        else
            partie.Message("palier", "Terrain vierge. Tracez une première rue depuis le bord de la carte : c'est par là qu'arriveront les habitants.");
        partie.MettreAJourServices();
        return partie;
    }

    // indicateurs (recalculés chaque jour)
    public int Population { get; private set; }
    public int Actifs { get; private set; }
    public int EmploisLocaux { get; private set; }
    public int Chomeurs { get; private set; }
    public int Enfants { get; private set; }
    public double DemandeHabitat { get; private set; }
    public double DemandeCommerce { get; private set; }
    public double DemandeActivites { get; private set; }
    public double EauProduite { get; private set; }
    public double EauConsommee { get; private set; }
    public double ElecProduite { get; private set; }
    public double ElecConsommee { get; private set; }
    public double RecettesMois { get; private set; }
    public double DepensesMois { get; private set; }
    public Dictionary<string, double> DetailRecettes { get; } = new();
    public Dictionary<string, double> DetailDepenses { get; } = new();
    public List<V2> LigneBus { get; private set; } = new();
    public int NbBus => Arrets.Count < 2 ? 0 : Math.Max(1, (int)Math.Ceiling(Arrets.Count / (double)R.Bus.ArretsParBus));

    /// <summary>Carrés de 250 m dont l'affichage doit être refait (vidé par le moteur de rendu).</summary>
    public HashSet<(int, int)> CarresModifies { get; } = new();
    public const double TailleCarre = 250;
    public int VersionServices { get; private set; }

    private Alea _alea;
    private int _prochaineParcelle, _prochainArret;
    private readonly Dictionary<int, List<(int i, int j)>> _cellulesRoute = new();
    private readonly Dictionary<int, List<(int i, int j)>> _cellulesParcelle = new();
    private readonly Dictionary<int, List<int>> _parcellesParArete = new();
    private readonly Dictionary<string, int> _dernierMessage = new();
    private bool _servicesAJour;

    public double DemiCote => Paquet.Manifest.Repere.DemiCoteM;

    private Partie(Reglages r, PaquetVille p, ulong graine)
    {
        R = r;
        Paquet = p;
        _alea = new Alea(graine);
        Grille = new GrilleOccupation(p.Manifest.Repere.DemiCoteM);
        foreach (var s in p.Eau.Surfaces)
            Grille.PolygoneEau(s.Contour.Select(c => new V2(c[0], c[1])).ToList());
    }

    /// <summary>Nouvelle partie en mode Fondation : vraie géographie, grands axes réels, terrain vierge.</summary>
    public static Partie NouveauBacASable(Reglages r, PaquetVille p, ulong graine = 1)
    {
        var partie = NouvelleFondation(r, p, graine);
        partie.BacASable = true;
        partie.Argent = 1_000_000_000;
        return partie;
    }

    public static Partie NouvelleFondation(Reglages r, PaquetVille p, ulong graine = 1)
    {
        var partie = new Partie(r, p, graine)
        {
            Argent = r.ArgentDepart,
            ImpotHabitat = r.Demande.ImpotReference,
            ImpotCommerce = r.Demande.ImpotReference,
            ImpotActivites = r.Demande.ImpotReference,
        };
        partie.ImporterAxesReels();
        partie.Depart = ModeDepart.GrandsAxes;
        partie.Message("palier", r.Paliers[0].Message);
        partie.MettreAJourServices();
        return partie;
    }

    private void ImporterAxesReels()
    {
        var garder = R.Routes.AxesReelsImportes.ToHashSet();
        var correspondance = new Dictionary<int, int>();
        int Noeud(int idPaquet)
        {
            if (!correspondance.TryGetValue(idPaquet, out var id))
            {
                var n = Paquet.Routes.Noeuds[idPaquet];
                var nr = Reseau.NouveauNoeud(new V2(n.X, n.Y));
                nr.Entree = Math.Max(Math.Abs(n.X), Math.Abs(n.Y)) > DemiCote - 25;
                correspondance[idPaquet] = id = nr.Id;
            }
            return id;
        }
        foreach (var t in Paquet.Routes.Troncons)
        {
            if (!garder.Contains(t.Gabarit) || t.A == t.B || t.Tunnel) continue;
            var trace = t.Trace.Select(c => new V2(c[0], c[1])).ToList();
            var e = Reseau.NouvelleArete(Noeud(t.A), Noeud(t.B), trace, t.Gabarit, departemental: true, nom: t.Nom);
            RasteriserRoute(e);
        }
        foreach (var e in Reseau.Aretes.Values.ToList()) GenererParcelles(e);
    }

    // ================================================================== routes
    private void RasteriserRoute(AreteRoute e)
    {
        var cellules = new List<(int, int)>();
        double demi = R.Route(e.Gabarit).LargeurM / 2 + 0.5;
        for (int i = 0; i + 1 < e.Trace.Count; i++) cellules.AddRange(Grille.CellulesSegment(e.Trace[i], e.Trace[i + 1], demi));
        _cellulesRoute[e.Id] = cellules;
        Grille.AjouterRoute(cellules, +1);
        foreach (var c in cellules) CarresModifies.Add(Carre(Grille.Centre(c.Item1, c.Item2)));
    }

    private void DerasteriserRoute(int areteId)
    {
        if (_cellulesRoute.Remove(areteId, out var cellules)) Grille.AjouterRoute(cellules, -1);
    }

    public sealed record ApercuRoute(bool Ok, string Raison, double Cout, V2 A, V2 B, double Longueur, bool Pont = false);

    public ApercuRoute PrevoirRoute(V2 a, V2 b, string gabarit)
    {
        var acc = R.Routes.AccrochageM;
        var pa = Reseau.Accrocher(a, acc).point;
        var pb = Reseau.Accrocher(b, acc).point;
        double l = V2.Distance(pa, pb);
        double cout = Math.Round(l * R.Route(gabarit).CoutParM);
        string? raison = null;
        if (gabarit is not ("rue" or "avenue")) raison = "Type de route inconnu.";
        else if (l < R.Routes.LongueurMinM) raison = "Route trop courte.";
        else if (!DansCarte(pa) || !DansCarte(pb)) raison = "Hors de la zone de jeu.";
        double surEau = 0;
        if (raison == null)
        {
            int n = Math.Max(2, (int)(l / 4));
            double zPrec = Paquet.Altitude(pa.X, pa.Y);
            for (int i = 1; i <= n && raison == null; i++)
            {
                var p = pa + (pb - pa) * (i / (double)n);
                double z = Paquet.Altitude(p.X, p.Y);
                if (Grille.Eau(p)) surEau += l / n;
                else if (Math.Abs(z - zPrec) / (l / n) > R.Routes.PenteMax) raison = "Pente trop forte.";
                zPrec = z;
            }
            if (surEau > R.Routes.Pont.LongueurEauMaxM) raison = $"Pont trop long ({surEau:F0} m au-dessus de l'eau, maximum {R.Routes.Pont.LongueurEauMaxM:F0} m).";
            cout = Math.Round((l + surEau * (R.Routes.Pont.CoutMultiplicateur - 1)) * R.Route(gabarit).CoutParM);
        }
        if (raison == null && (!Constructible(pa) || !Constructible(pb) || !Constructible((pa + pb) * 0.5))) raison = MessageTerritoire();
        if (raison == null)
        {
            var couloir = Grille.CellulesSegment(pa, pb, R.Route(gabarit).LargeurM / 2 + 0.5);
            if (Grille.ParcellesSous(couloir).Any(id => Parcelles.TryGetValue(id, out var x) && x.Service != null))
                raison = "La route traverse un équipement public : démolissez-le d'abord.";
        }
        if (BacASable) cout = 0;
        if (raison == null && cout > Argent) raison = "Pas assez d'argent.";
        return new ApercuRoute(raison == null, raison ?? "", cout, pa, pb, l, surEau > 0);
    }

    public Resultat ConstruireRoute(V2 a, V2 b, string gabarit)
    {
        var ap = PrevoirRoute(a, b, gabarit);
        if (!ap.Ok) return Resultat.Non(ap.Raison);
        var decoupes = new List<ReseauVille.Decoupe>();
        var na = NoeudPour(a, decoupes);
        var nb = NoeudPour(b, decoupes);
        // une route qui touche le bord de la carte est reliée au reste du monde
        foreach (var n in new[] { na, nb })
            if (Math.Max(Math.Abs(n.Pos.X), Math.Abs(n.Pos.Y)) > DemiCote - 25) n.Entree = true;
        if (na.Id == nb.Id) return Resultat.Non("Route trop courte.");
        var p = na.Pos; var q = nb.Pos;
        var sequence = new List<NoeudRoute> { na };
        foreach (var (arete, point, _) in Reseau.Croisements(p, q))
        {
            if (!Reseau.Aretes.ContainsKey(arete)) continue; // déjà coupée par un croisement précédent
            var n = Reseau.Couper(arete, point, decoupes);
            if (sequence[^1].Id != n.Id) sequence.Add(n);
        }
        if (sequence[^1].Id != nb.Id) sequence.Add(nb);
        AppliquerDecoupes(decoupes);
        var nouvelles = new List<AreteRoute>();
        for (int i = 0; i + 1 < sequence.Count; i++)
        {
            if (V2.Distance(sequence[i].Pos, sequence[i + 1].Pos) < 0.5) continue;
            var e = Reseau.NouvelleArete(sequence[i].Id, sequence[i + 1].Id, new List<V2> { sequence[i].Pos, sequence[i + 1].Pos }, gabarit);
            e.Pont = Enumerable.Range(1, 9).Any(k => Grille.Eau(sequence[i].Pos + (sequence[i + 1].Pos - sequence[i].Pos) * (k / 10.0)));
            RasteriserRoute(e);
            // une nouvelle route efface les parcelles qu'elle traverse
            foreach (var pid in Grille.ParcellesSous(_cellulesRoute[e.Id])) SupprimerParcelle(pid);
            nouvelles.Add(e);
        }
        foreach (var e in nouvelles) GenererParcelles(e);
        Argent -= ap.Cout;
        _servicesAJour = false;
        return new Resultat(true, ap.Pont ? $"Pont construit ({ap.Longueur:F0} m)." : $"Route construite ({ap.Longueur:F0} m).", ap.Cout);
    }

    /// <summary>Points d'une courbe (Bézier quadratique) découpée en tronçons d'environ 30 m.</summary>
    public static List<V2> PointsCourbe(V2 a, V2 controle, V2 b)
    {
        double l = V2.Distance(a, controle) + V2.Distance(controle, b);
        int n = Math.Max(2, (int)Math.Ceiling(l / 30));
        var pts = new List<V2>();
        for (int i = 0; i <= n; i++)
        {
            double t = i / (double)n, u = 1 - t;
            pts.Add(a * (u * u) + controle * (2 * u * t) + b * (t * t));
        }
        return pts;
    }

    public ApercuRoute PrevoirCourbe(V2 a, V2 controle, V2 b, string gabarit)
    {
        var pts = PointsCourbe(a, controle, b);
        double cout = 0, longueur = 0; bool pont = false;
        for (int i = 0; i + 1 < pts.Count; i++)
        {
            var ap = PrevoirRoute(pts[i], pts[i + 1], gabarit);
            if (!ap.Ok && !ap.Raison.Contains("argent")) return ap with { A = pts[0], B = pts[^1] };
            cout += ap.Cout; longueur += ap.Longueur; pont |= ap.Pont;
        }
        bool ok = BacASable || cout <= Argent;
        return new ApercuRoute(ok, ok ? "" : "Pas assez d'argent.", cout, pts[0], pts[^1], longueur, pont);
    }

    public Resultat ConstruireCourbe(V2 a, V2 controle, V2 b, string gabarit)
    {
        var ap = PrevoirCourbe(a, controle, b, gabarit);
        if (!ap.Ok) return Resultat.Non(ap.Raison);
        var pts = PointsCourbe(a, controle, b);
        double total = 0;
        for (int i = 0; i + 1 < pts.Count; i++)
        {
            var r = ConstruireRoute(pts[i], pts[i + 1], gabarit);
            if (!r.Ok) return new Resultat(i > 0, $"Courbe interrompue : {r.Message}", total);
            total += r.Cout;
        }
        return new Resultat(true, $"Route courbe construite ({ap.Longueur:F0} m).", total);
    }

    private NoeudRoute NoeudPour(V2 p, List<ReseauVille.Decoupe> decoupes)
    {
        var (noeud, arete, point) = Reseau.Accrocher(p, R.Routes.AccrochageM);
        if (noeud != null) return noeud;
        if (arete != null) return Reseau.Couper(arete.Id, point, decoupes);
        return Reseau.NouveauNoeud(p);
    }

    private void AppliquerDecoupes(List<ReseauVille.Decoupe> decoupes)
    {
        foreach (var d in decoupes)
        {
            DerasteriserRoute(d.Ancienne);
            var m1 = Reseau.Aretes.GetValueOrDefault(d.Morceau1);
            var m2 = Reseau.Aretes.GetValueOrDefault(d.Morceau2);
            if (m1 != null) RasteriserRoute(m1);
            if (m2 != null) RasteriserRoute(m2);
            if (_parcellesParArete.Remove(d.Ancienne, out var liste))
                foreach (var pid in liste)
                {
                    var par = Parcelles[pid];
                    par.Arete = PlusProche(par.Centre, m1, m2);
                    Ajouter(_parcellesParArete, par.Arete, pid);
                }
            foreach (var arr in Arrets.Values.Where(x => x.Arete == d.Ancienne)) arr.Arete = PlusProche(arr.Pos, m1, m2);
        }
    }

    private static int PlusProche(V2 p, AreteRoute? m1, AreteRoute? m2)
    {
        if (m1 == null) return m2!.Id;
        if (m2 == null) return m1.Id;
        return DistanceTrace(p, m1) <= DistanceTrace(p, m2) ? m1.Id : m2.Id;
    }

    private static double DistanceTrace(V2 p, AreteRoute e)
    {
        double d = double.MaxValue;
        for (int i = 0; i + 1 < e.Trace.Count; i++) { Geo.Projection(p, e.Trace[i], e.Trace[i + 1], out var q); d = Math.Min(d, V2.Distance(p, q)); }
        return d;
    }

    private bool DansCarte(V2 p) => Math.Abs(p.X) < DemiCote - 2 && Math.Abs(p.Y) < DemiCote - 2;

    // ================================================================== parcelles
    private static void Ajouter(Dictionary<int, List<int>> d, int cle, int val)
    {
        if (!d.TryGetValue(cle, out var l)) d[cle] = l = new List<int>();
        l.Add(val);
    }

    public static (int, int) Carre(V2 p) => ((int)Math.Floor(p.X / TailleCarre), (int)Math.Floor(p.Y / TailleCarre));

    private void GenererParcelles(AreteRoute e)
    {
        var route = R.Route(e.Gabarit);
        if (!route.Parcelles) return;
        double w = R.Parcelles.LargeurM, prof = R.Parcelles.ProfondeurM;
        double recul = route.LargeurM / 2 + R.Parcelles.EcartRouteM;
        for (int s = 0; s + 1 < e.Trace.Count; s++)
        {
            var a = e.Trace[s]; var b = e.Trace[s + 1];
            double l = V2.Distance(a, b);
            int nb = (int)Math.Floor((l - 4) / w);
            if (nb <= 0) continue;
            var dir = (b - a).Normalise();
            double debut = (l - nb * w) / 2 + w / 2;
            for (int k = 0; k < nb; k++)
                foreach (int cote in new[] { 1, -1 })
                {
                    var n = dir.Perp * cote;
                    var c = a + dir * (debut + k * w) + n * (recul + prof / 2);
                    EssayerParcelle(e.Id, c, dir, n);
                }
        }
    }

    private void EssayerParcelle(int arete, V2 c, V2 dir, V2 n)
    {
        double w = R.Parcelles.LargeurM, prof = R.Parcelles.ProfondeurM;
        var coins = new[] { c + dir * (w / 2) + n * (prof / 2), c - dir * (w / 2) + n * (prof / 2), c + dir * (w / 2) - n * (prof / 2), c - dir * (w / 2) - n * (prof / 2) };
        if (coins.Any(p => !DansCarte(p))) return;
        var alt = coins.Select(p => Paquet.Altitude(p.X, p.Y)).ToArray();
        if (alt.Max() - alt.Min() > R.Parcelles.DeniveleMaxM) return;
        var cellules = Grille.CellulesRectangle(c, dir, w / 2 - 0.6, prof / 2 - 0.6);
        if (!Grille.Libre(cellules)) return;
        var par = new Parcelle { Id = _prochaineParcelle++, Arete = arete, Centre = c, Dir = dir, Normale = n, Variante = (int)(_alea.Suivant() & 0xFFFF) };
        Parcelles[par.Id] = par;
        Grille.MarquerParcelle(cellules, par.Id);
        _cellulesParcelle[par.Id] = cellules;
        Ajouter(_parcellesParArete, arete, par.Id);
    }

    private void SupprimerParcelle(int id)
    {
        if (!Parcelles.Remove(id, out var p)) return;
        if (_cellulesParcelle.Remove(id, out var cellules)) Grille.MarquerParcelle(cellules, -1);
        if (_parcellesParArete.TryGetValue(p.Arete, out var l)) l.Remove(id);
        CarresModifies.Add(Carre(p.Centre));
        _servicesAJour = false;
    }

    public IEnumerable<Parcelle> ParcellesProches(V2 p, double rayon) =>
        Parcelles.Values.Where(x => V2.Distance(x.Centre, p) <= rayon);

    public Parcelle? ParcelleSous(V2 p)
    {
        var (i, j) = Grille.Cellule(p);
        if (!Grille.DansCarte(i, j)) return null;
        int id = Grille.Parcelle(i, j);
        return id >= 0 && Parcelles.TryGetValue(id, out var par) ? par : null;
    }

    // ================================================================== commandes du maire
    public Resultat Zoner(V2 centre, double rayon, Zone zone)
    {
        int n = 0;
        if (!Constructible(centre)) return Resultat.Non(MessageTerritoire());
        foreach (var p in ParcellesProches(centre, rayon))
        {
            if (p.Service != null || p.Zone == zone || !Constructible(p.Centre)) continue;
            if (p.Batiment != null) p.Batiment = null; // changer la zone d'un terrain bâti le fait démolir
            p.Zone = zone;
            CarresModifies.Add(Carre(p.Centre));
            n++;
        }
        if (n > 0) _servicesAJour = false;
        return new Resultat(n > 0, n > 0 ? $"{n} parcelle(s) modifiée(s)." : "Aucune parcelle ici : il faut une rue à côté.");
    }

    public bool ServiceDisponible(string type) => R.Services.TryGetValue(type, out var s) && (BacASable || s.Palier <= Palier);

    public Resultat PlacerService(string type, V2 p)
    {
        if (!R.Services.TryGetValue(type, out var s)) return Resultat.Non("Service inconnu.");
        if (!ServiceDisponible(type)) return Resultat.Non($"Disponible au palier « {R.Paliers[s.Palier].Nom} ».");
        if (!Constructible(p)) return Resultat.Non(MessageTerritoire());
        if (type == "arret_bus") return PlacerArret(p, s);
        if (!BacASable && s.Cout > Argent) return Resultat.Non("Pas assez d'argent.");
        var par = ParcelleSous(p) ?? ParcellesProches(p, 30).Where(x => x.Libre).OrderBy(x => V2.Distance(x.Centre, p)).FirstOrDefault();
        if (par == null) return Resultat.Non("Placez-le le long d'une rue.");
        if (!par.Libre) return Resultat.Non("Ce terrain est déjà occupé.");
        if (s.DistanceEauMaxM > 0 && Grille.DistanceEau(par.Centre) > s.DistanceEauMaxM)
            return Resultat.Non("La station de pompage doit être au bord de l'eau.");
        par.Service = type;
        par.Zone = Zone.Aucune;
        if (!BacASable) Argent -= s.Cout;
        CarresModifies.Add(Carre(par.Centre));
        _servicesAJour = false;
        VersionServices++;
        return new Resultat(true, $"{s.Nom} construit(e).", s.Cout);
    }

    private Resultat PlacerArret(V2 p, ReglagesService s)
    {
        if (!BacASable && s.Cout > Argent) return Resultat.Non("Pas assez d'argent.");
        var (_, arete, point) = Reseau.Accrocher(p, 20);
        if (arete == null)
        {
            var (noeud, _, pt) = Reseau.Accrocher(p, 20);
            if (noeud == null) return Resultat.Non("Placez l'arrêt sur une route.");
            arete = Reseau.Aretes.Values.First(e => e.A == noeud.Id || e.B == noeud.Id);
            point = pt;
        }
        if (Arrets.Values.Any(a => V2.Distance(a.Pos, point) < 60)) return Resultat.Non("Un arrêt existe déjà tout près.");
        var arr = new ArretBus { Id = _prochainArret++, Arete = arete.Id, Pos = point };
        Arrets[arr.Id] = arr;
        if (!BacASable) Argent -= s.Cout;
        _servicesAJour = false;
        VersionServices++;
        return new Resultat(true, Arrets.Count >= 2 ? "Arrêt ajouté à la ligne de bus." : "Premier arrêt posé : ajoutez-en un deuxième pour créer la ligne.", s.Cout);
    }

    public Resultat Demolir(V2 p)
    {
        var arr = Arrets.Values.FirstOrDefault(a => V2.Distance(a.Pos, p) < 15);
        if (arr != null) { Arrets.Remove(arr.Id); _servicesAJour = false; VersionServices++; return new Resultat(true, "Arrêt supprimé."); }
        var par = ParcelleSous(p);
        if (par != null && (par.Batiment != null || par.Service != null))
        {
            bool service = par.Service != null;
            par.Batiment = null; par.Service = null;
            CarresModifies.Add(Carre(par.Centre));
            _servicesAJour = false;
            if (service) VersionServices++;
            return new Resultat(true, service ? "Service démoli." : "Bâtiment démoli.");
        }
        var (_, arete, _) = Reseau.Accrocher(p, 8);
        if (arete == null) return Resultat.Non("Rien à démolir ici.");
        if (arete.Departemental) return Resultat.Non("C'est un grand axe départemental : la commune ne peut pas le démolir.");
        if (_parcellesParArete.Remove(arete.Id, out var liste))
            foreach (var pid in liste.ToList()) SupprimerParcelle(pid);
        foreach (var a in Arrets.Values.Where(x => x.Arete == arete.Id).ToList()) Arrets.Remove(a.Id);
        DerasteriserRoute(arete.Id);
        Reseau.SupprimerArete(arete.Id);
        _servicesAJour = false;
        return new Resultat(true, "Route démolie.");
    }

    public void ReglerImpot(Zone z, double taux)
    {
        taux = Math.Clamp(taux, R.Impots.TauxMin, R.Impots.TauxMax);
        if (z == Zone.Habitat) ImpotHabitat = taux;
        else if (z == Zone.Commerce) ImpotCommerce = taux;
        else if (z == Zone.Activites) ImpotActivites = taux;
        _servicesAJour = false;
    }

    public Resultat Emprunter()
    {
        if (Emprunts.Count >= R.Emprunt.Max) return Resultat.Non("La banque refuse : trop d'emprunts en cours.");
        double m = R.Emprunt.Montant, t = R.Emprunt.TauxAnnuel / 12;
        int n = R.Emprunt.DureeMois;
        double mensualite = Math.Round(m * t / (1 - Math.Pow(1 + t, -n)), 2);
        Emprunts.Add(new Emprunt { Restant = m, Mensualite = mensualite, MoisRestants = n });
        Argent += m;
        return new Resultat(true, $"Emprunt de {m:N0} € accordé : {mensualite:N0} € par mois pendant {n / 12} ans.");
    }

    private void Message(string type, string texte)
    {
        Messages.Add(new MessageVille { Jour = Jour, Type = type, Texte = texte });
        if (Messages.Count > 200) Messages.RemoveRange(0, Messages.Count - 200);
    }

    /// <summary>Envoie un message au plus une fois tous les « delai » jours pour une même clé.</summary>
    private void MessageLimite(string cle, int delai, string type, string texte)
    {
        if (_dernierMessage.TryGetValue(cle, out var j) && Jour - j < delai) return;
        _dernierMessage[cle] = Jour;
        Message(type, texte);
    }
}
