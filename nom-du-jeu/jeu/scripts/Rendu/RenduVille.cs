using Godot;
using Ville.Coeur;

namespace Jeu.Rendu;

/// <summary>
/// Affiche ce que le joueur construit : routes, parcelles zonées, bâtiments qui poussent, services, bus.
/// Ne reconstruit que ce qui a changé (carrés de 250 m signalés par la simulation).
/// </summary>
public partial class RenduVille : Node3D
{
    private Partie _p = null!;
    private MeshInstance3D _routes = null!;
    private MeshInstance3D _ligneBus = null!;
    private readonly Dictionary<(int, int), MeshInstance3D> _carres = new();
    private int _versionReseau = -1, _versionServices = -1;
    private readonly StandardMaterial3D _matBatiments = Maillage.Materiau(0.9f);
    private readonly StandardMaterial3D _matSol = Maillage.Materiau(1f, doubleFace: true);
    private bool _parcellesVides;

    public static Vector3 G(Partie p, V2 q, double dz = 0) => new((float)q.X, p.Paquet.Altitude(q.X, q.Y) + (float)dz, (float)-q.Y);

    public void Initialiser(Partie p)
    {
        _p = p;
        foreach (var c in GetChildren()) c.QueueFree();
        _carres.Clear();
        _routes = new MeshInstance3D { Name = "Routes", MaterialOverride = Maillage.Materiau(0.95f, doubleFace: true) };
        _ligneBus = new MeshInstance3D { Name = "LigneBus", MaterialOverride = Maillage.Materiau(0.6f, doubleFace: true) };
        AddChild(_routes);
        AddChild(_ligneBus);
        _versionReseau = _versionServices = -1;
        foreach (var par in p.Parcelles.Values) p.CarresModifies.Add(Partie.Carre(par.Centre));
    }

    /// <summary>Montre aussi les parcelles non zonées (quand un outil de zonage est actif).</summary>
    public bool ParcellesVides
    {
        get => _parcellesVides;
        set
        {
            if (_parcellesVides == value) return;
            _parcellesVides = value;
            foreach (var par in _p.Parcelles.Values) _p.CarresModifies.Add(Partie.Carre(par.Centre));
        }
    }

    public override void _Process(double delta)
    {
        if (_p == null) return;
        if (_versionReseau != _p.Reseau.Version || _versionServices != _p.VersionServices)
        {
            _versionReseau = _p.Reseau.Version;
            _versionServices = _p.VersionServices;
            _routes.Mesh = ConstruireRoutes();
            _ligneBus.Mesh = ConstruireLigneBus();
        }
        if (_p.CarresModifies.Count > 0)
        {
            var aFaire = _p.CarresModifies.ToList();
            _p.CarresModifies.Clear();
            var parCarre = new Dictionary<(int, int), List<Parcelle>>();
            var voulus = aFaire.ToHashSet();
            foreach (var par in _p.Parcelles.Values)
            {
                var c = Partie.Carre(par.Centre);
                if (!voulus.Contains(c)) continue;
                if (!parCarre.TryGetValue(c, out var l)) parCarre[c] = l = new List<Parcelle>();
                l.Add(par);
            }
            foreach (var c in aFaire) ReconstruireCarre(c, parCarre.GetValueOrDefault(c));
        }
    }

    // ------------------------------------------------------------------ routes
    private static readonly Color Bitume = new(0.30f, 0.30f, 0.32f);
    private static readonly Color BitumeAxe = new(0.36f, 0.35f, 0.36f);
    private static readonly Color Trottoir = new(0.70f, 0.68f, 0.64f);

    private ArrayMesh? ConstruireRoutes()
    {
        var m = new Maillage();
        foreach (var e in _p.Reseau.Aretes.Values)
        {
            float l = (float)_p.R.Route(e.Gabarit).LargeurM / 2;
            var col = e.Departemental ? BitumeAxe : Bitume;
            for (int i = 0; i + 1 < e.Trace.Count; i++)
                Ruban(m, e.Trace[i], e.Trace[i + 1], l + 1.2f, 0.18, Trottoir);
            for (int i = 0; i + 1 < e.Trace.Count; i++)
                Ruban(m, e.Trace[i], e.Trace[i + 1], l, 0.30, col);
        }
        // disques aux carrefours pour boucher les jointures
        foreach (var n in _p.Reseau.Noeuds.Values)
        {
            int d = _p.Reseau.Degre(n.Id);
            if (d == 0) continue;
            Disque(m, n.Pos, d >= 3 ? 7.5f : 4.5f, 0.31, Bitume);
        }
        foreach (var a in _p.Arrets.Values)
        {
            var c = G(_p, a.Pos, 0.3);
            m.Boite(c, Vector3.Right, 1.5f, 0.6f, c.Y, c.Y + 2.6f, new Color(0.15f, 0.45f, 0.85f));
        }
        return m.VersMesh();
    }

    private void Ruban(Maillage m, V2 a, V2 b, float demi, double dz, Color col)
    {
        var d = (b - a);
        double l = d.Longueur;
        if (l < 0.01) return;
        var n = d.Perp * (demi / l);
        // découpe en morceaux de 10 m pour suivre le relief
        int k = Math.Max(1, (int)(l / 10));
        for (int i = 0; i < k; i++)
        {
            var p0 = a + d * (i / (double)k);
            var p1 = a + d * ((i + 1) / (double)k);
            m.Quad(G(_p, p0 + n, dz), G(_p, p1 + n, dz), G(_p, p1 - n, dz), G(_p, p0 - n, dz), Vector3.Up, col);
        }
    }

    private void Disque(Maillage m, V2 c, float r, double dz, Color col)
    {
        const int cotes = 10;
        var centre = G(_p, c, dz);
        for (int k = 0; k < cotes; k++)
        {
            double a0 = Math.Tau * k / cotes, a1 = Math.Tau * (k + 1) / cotes;
            var p0 = G(_p, c + new V2(Math.Cos(a0) * r, Math.Sin(a0) * r), dz);
            var p1 = G(_p, c + new V2(Math.Cos(a1) * r, Math.Sin(a1) * r), dz);
            p0.Y = p1.Y = centre.Y;
            m.Triangle(centre, p0, p1, Vector3.Up, col);
        }
    }

    private ArrayMesh? ConstruireLigneBus()
    {
        var m = new Maillage();
        var l = _p.LigneBus;
        for (int i = 0; i + 1 < l.Count; i++) Ruban(m, l[i], l[i + 1], 1.0f, 0.45, new Color(0.15f, 0.45f, 0.85f));
        return m.VersMesh();
    }

    // ------------------------------------------------------------------ parcelles et bâtiments
    public static Color CouleurZone(Zone z) => z switch
    {
        Zone.Habitat => new Color(0.45f, 0.78f, 0.42f),
        Zone.Commerce => new Color(0.38f, 0.60f, 0.92f),
        Zone.Activites => new Color(0.95f, 0.78f, 0.30f),
        _ => new Color(0.85f, 0.85f, 0.85f),
    };

    private static readonly Color[] FacadesHabitat =
    {
        new(0.95f, 0.91f, 0.82f), new(0.93f, 0.85f, 0.74f), new(0.88f, 0.82f, 0.78f), new(0.96f, 0.93f, 0.88f),
        new(0.90f, 0.78f, 0.66f), new(0.85f, 0.87f, 0.84f),
    };
    private static readonly Color[] Tuiles = { new(0.70f, 0.36f, 0.26f), new(0.55f, 0.30f, 0.25f), new(0.42f, 0.42f, 0.46f) };

    private void ReconstruireCarre((int, int) cle, List<Parcelle>? parcelles)
    {
        if (_carres.Remove(cle, out var ancien)) ancien.QueueFree();
        if (parcelles == null || parcelles.Count == 0) return;
        var sol = new Maillage();
        var bat = new Maillage();
        foreach (var p in parcelles) Parcelle(p, sol, bat);
        var noeud = new MeshInstance3D { Name = $"Carre_{cle.Item1}_{cle.Item2}" };
        var ms = sol.VersMesh();
        var mb = bat.VersMesh();
        if (ms == null && mb == null) return;
        if (mb != null) { noeud.Mesh = mb; noeud.MaterialOverride = _matBatiments; }
        if (ms != null)
            noeud.AddChild(new MeshInstance3D { Mesh = ms, MaterialOverride = _matSol, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off });
        AddChild(noeud);
        _carres[cle] = noeud;
    }

    private void Parcelle(Parcelle p, Maillage sol, Maillage bat)
    {
        var r = _p.R.Parcelles;
        float w = (float)r.LargeurM / 2 - 0.6f, prof = (float)r.ProfondeurM / 2 - 0.6f;
        var u = new Vector3((float)p.Dir.X, 0, (float)-p.Dir.Y);
        var c = G(_p, p.Centre);
        // sol de la parcelle (couleur de la zone), un peu au-dessus du terrain
        if (p.Zone != Zone.Aucune || p.Service != null || _parcellesVides)
        {
            var col = p.Service != null ? new Color(0.62f, 0.66f, 0.55f) : CouleurZone(p.Zone);
            if (p.Batiment != null && !p.Batiment.EnChantier) col = col.Lerp(new Color(0.55f, 0.62f, 0.45f), 0.6f);
            if (p.Zone == Zone.Aucune && p.Service == null) col = new Color(1, 1, 1);
            var coins = new[] { new V2(-w, -prof), new V2(w, -prof), new V2(w, prof), new V2(-w, prof) }
                .Select(o => G(_p, p.Centre + p.Dir * o.X + p.Normale * o.Y, 0.22)).ToArray();
            sol.Quad(coins[0], coins[1], coins[2], coins[3], Vector3.Up, col);
        }
        if (p.Service != null) { Service(p, c, u, bat); return; }
        var b = p.Batiment;
        if (b == null) return;
        float y0 = Math.Min(Math.Min(Alt(p, -w, -prof), Alt(p, w, -prof)), Math.Min(Alt(p, w, prof), Alt(p, -w, prof))) - 0.5f;
        // la façade donne sur la rue : la rue est du côté -Normale
        var v = new Vector3((float)p.Normale.X, 0, (float)-p.Normale.Y);
        var rnd = new Random(p.Variante);
        float h = (float)_p.Hauteur(b);
        if (b.EnChantier && b.Niveau == 1)
        {
            float avancement = 1 - b.JoursChantier / (float)_p.R.JoursConstruction;
            var cc = c + v * 1.5f;
            bat.Boite(cc, u, w - 2, prof - 4, y0, y0 + 0.3f + h * avancement, new Color(0.80f, 0.70f, 0.52f), new Color(0.95f, 0.55f, 0.15f));
            return;
        }
        switch (b.Type)
        {
            case Zone.Habitat:
            {
                var facade = FacadesHabitat[rnd.Next(FacadesHabitat.Length)];
                if (b.Niveau == 1)
                {
                    float dw = 4.5f + (float)rnd.NextDouble() * 1.5f, dp = 4.5f + (float)rnd.NextDouble() * 1.5f;
                    var cc = c - v * (prof - dp - 4f);
                    bat.Boite(cc, u, dw, dp, y0, y0 + h - 2.5f, facade);
                    bat.ToitDeuxPans(cc, u, dw + 0.4f, dp + 0.4f, y0 + h - 2.5f, 2.8f, Tuiles[rnd.Next(Tuiles.Length)], facade);
                    if (rnd.NextDouble() < 0.7) bat.Arbre(c + v * (prof - 3) + u * (float)(rnd.NextDouble() * 8 - 4), 6 + (float)rnd.NextDouble() * 3, new Color(0.30f, 0.52f, 0.28f));
                }
                else if (b.Niveau == 2)
                {
                    var cc = c - v * 1.5f;
                    bat.Boite(cc, u, w - 0.8f, prof - 4.5f, y0, y0 + h - 2.5f, facade);
                    bat.ToitDeuxPans(cc, u, w - 0.4f, prof - 4.1f, y0 + h - 2.5f, 3.2f, Tuiles[rnd.Next(Tuiles.Length)], facade);
                }
                else
                {
                    var cc = c - v * 0.5f;
                    bat.Boite(cc, u, w - 0.6f, prof - 2.5f, y0, y0 + h, facade, new Color(0.55f, 0.55f, 0.58f));
                    bat.Boite(cc, u, w - 3, prof - 5, y0 + h, y0 + h + 2.5f, new Color(0.72f, 0.72f, 0.74f));
                }
                break;
            }
            case Zone.Commerce:
            {
                var facade = new Color(0.93f, 0.90f, 0.86f).Lerp(new Color(0.8f, 0.85f, 0.95f), (float)rnd.NextDouble() * 0.6f);
                var store = new[] { new Color(0.85f, 0.25f, 0.22f), new Color(0.20f, 0.50f, 0.80f), new Color(0.25f, 0.62f, 0.35f), new Color(0.95f, 0.65f, 0.15f) }[rnd.Next(4)];
                var cc = c - v * 2f;
                bat.Boite(cc, u, w - 0.5f, prof - 3, y0, y0 + h, facade, new Color(0.62f, 0.62f, 0.64f));
                bat.Boite(cc - v * (prof - 3), u, w - 0.5f, 1.4f, y0 + 3.0f, y0 + 3.5f, store); // auvent côté rue
                break;
            }
            default:
            {
                var murs = new Color(0.78f, 0.76f, 0.72f).Lerp(new Color(0.70f, 0.74f, 0.80f), (float)rnd.NextDouble());
                bat.Boite(c, u, w - 0.3f, prof - 1.5f, y0, y0 + h, murs, new Color(0.48f, 0.50f, 0.52f));
                bat.Cylindre(c + u * (w - 3) + v * (prof - 4), 0.8f, y0 + h, y0 + h + 6, new Color(0.55f, 0.50f, 0.48f), 6);
                break;
            }
        }
    }

    private float Alt(Parcelle p, float dx, float dy)
    {
        var q = p.Centre + p.Dir * dx + p.Normale * dy;
        return _p.Paquet.Altitude(q.X, q.Y);
    }

    private void Service(Parcelle p, Vector3 c, Vector3 u, Maillage m)
    {
        var v = new Vector3((float)p.Normale.X, 0, (float)-p.Normale.Y);
        float y0 = c.Y - 0.5f;
        switch (p.Service)
        {
            case "chateau_eau":
                m.Cylindre(c, 1.6f, y0, y0 + 16, new Color(0.80f, 0.80f, 0.78f), 8);
                m.Cylindre(c, 5.5f, y0 + 16, y0 + 22, new Color(0.88f, 0.90f, 0.92f), 12);
                break;
            case "pompage_lac":
                m.Boite(c, u, 6, 5, y0, y0 + 5, new Color(0.70f, 0.82f, 0.90f), new Color(0.30f, 0.45f, 0.60f));
                m.Cylindre(c + u * 4 + v * 6, 1.2f, y0, y0 + 3, new Color(0.25f, 0.45f, 0.70f), 8);
                break;
            case "centrale_solaire":
                for (int i = -3; i <= 3; i++)
                    for (int j = -2; j <= 2; j++)
                        m.Boite(c + u * (i * 2.1f) + v * (j * 4.5f), u, 0.95f, 1.8f, y0 + 1, y0 + 1.3f, new Color(0.15f, 0.22f, 0.40f), new Color(0.20f, 0.30f, 0.55f));
                break;
            case "centrale_gaz":
                m.Boite(c, u, 7, 8, y0, y0 + 9, new Color(0.70f, 0.68f, 0.64f), new Color(0.45f, 0.45f, 0.47f));
                m.Cylindre(c + u * 4 + v * 5, 1.4f, y0, y0 + 30, new Color(0.82f, 0.80f, 0.78f), 8);
                m.Cylindre(c - u * 4 + v * 5, 1.4f, y0, y0 + 30, new Color(0.82f, 0.80f, 0.78f), 8);
                break;
            case "ecole":
                m.Boite(c - v * 5, u, 7, 3.5f, y0, y0 + 7, new Color(0.96f, 0.88f, 0.70f), new Color(0.72f, 0.35f, 0.25f));
                m.Boite(c + u * 4.5f + v * 2, u, 2.5f, 5, y0, y0 + 7, new Color(0.96f, 0.88f, 0.70f), new Color(0.72f, 0.35f, 0.25f));
                m.Boite(c - u * 2 + v * 6, u, 4, 3, y0, y0 + 0.3f, new Color(0.75f, 0.45f, 0.30f)); // cour
                break;
            case "parc":
                var rnd = new Random(p.Variante);
                for (int k = 0; k < 7; k++)
                    m.Arbre(c + u * (float)(rnd.NextDouble() * 12 - 6) + v * (float)(rnd.NextDouble() * 18 - 9), 7 + (float)rnd.NextDouble() * 5,
                        new Color(0.25f + (float)rnd.NextDouble() * 0.1f, 0.50f + (float)rnd.NextDouble() * 0.1f, 0.25f));
                break;
        }
    }
}
