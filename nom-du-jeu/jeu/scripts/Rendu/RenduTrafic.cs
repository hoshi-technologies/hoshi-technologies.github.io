using Godot;
using Ville.Coeur;
using Ville.Trafic;

namespace Jeu.Rendu;

/// <summary>
/// La ville qui bouge : voitures, camionnettes et camions des trajets domicile-travail, bus de la ligne,
/// bateaux sur l'eau et piétons sur les trottoirs. Tout est décoratif sauf le trafic, calculé par la simulation.
/// </summary>
public partial class RenduTrafic : Node3D
{
    private Partie _p = null!;
    private SimTrafic? _sim;
    private System.Threading.Tasks.Task<SimTrafic?>? _calcul;
    private MultiMesh _bus = null!, _pietons = null!, _vedettes = null!, _voiliers = null!;
    private readonly MultiMesh[] _vehicules = new MultiMesh[3];          // 0 voiture, 1 camionnette, 2 camion
    private readonly float[][] _tampons = { Array.Empty<float>(), Array.Empty<float>(), Array.Empty<float>() };
    private int[] _type = Array.Empty<int>(), _rang = Array.Empty<int>();
    private int _versionReseau = -1, _mois = -1, _popPrecedente = -1;
    private double _distanceBus, _temps;
    public float Vitesse { get; set; } = 1;
    public int MaxVoitures { get; set; } = 2500;

    private static readonly Color[] Teintes =
    {
        new(0.80f, 0.18f, 0.16f), new(0.18f, 0.32f, 0.70f), new(0.92f, 0.92f, 0.90f), new(0.16f, 0.16f, 0.18f),
        new(0.60f, 0.62f, 0.65f), new(0.92f, 0.72f, 0.20f), new(0.22f, 0.50f, 0.32f), new(0.45f, 0.30f, 0.55f),
    };
    private static readonly Color[] Vetements =
    {
        new(0.85f, 0.35f, 0.30f), new(0.30f, 0.50f, 0.85f), new(0.95f, 0.85f, 0.40f), new(0.40f, 0.70f, 0.45f),
        new(0.95f, 0.95f, 0.95f), new(0.55f, 0.40f, 0.70f), new(0.95f, 0.60f, 0.30f),
    };

    // piétons : (arête, position, sens, décalage)
    private (V2 a, V2 b, double t, double v, double cote)[] _marcheurs = Array.Empty<(V2, V2, double, double, double)>();
    // bateaux : position, cible, vitesse
    private (V2 pos, V2 cible, double v)[] _bateaux = Array.Empty<(V2, V2, double)>();
    private List<V2> _pointsEau = new();

    private static MultiMesh Multi(Mesh m, bool couleurs) =>
        new() { TransformFormat = MultiMesh.TransformFormatEnum.Transform3D, UseColors = couleurs, Mesh = m };

    public void Initialiser(Partie p)
    {
        _p = p;
        foreach (var c in GetChildren()) c.QueueFree();
        _vehicules[0] = Multi(Modeles.Voiture(), true);
        _vehicules[1] = Multi(Modeles.Camionnette(), true);
        _vehicules[2] = Multi(Modeles.Camion(), true);
        _bus = Multi(Modeles.Bus(), false);
        _pietons = Multi(Modeles.Pieton(), true);
        _vedettes = Multi(Modeles.Vedette(), false);
        _voiliers = Multi(Modeles.Voilier(), false);
        foreach (var m in _vehicules.Append(_pietons))
            AddChild(new MultiMeshInstance3D { Multimesh = m, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off });
        foreach (var m in new[] { _bus, _vedettes, _voiliers }) AddChild(new MultiMeshInstance3D { Multimesh = m });
        _sim = null;
        _versionReseau = _mois = -1;
        PreparerBateaux();
    }

    public override void _Process(double delta)
    {
        if (_p == null) return;
        if (_calcul != null && _calcul.IsCompleted)
        {
            if (_calcul.IsCompletedSuccessfully) Installer(_calcul.Result);
            _calcul = null;
        }
        if (_calcul == null && (_versionReseau != _p.Reseau.Version || _mois != _p.Mois || Math.Abs(_p.Population - _popPrecedente) > Math.Max(200, _popPrecedente / 5)))
            Reconstruire();
        float dt = (float)delta * Vitesse;
        _temps += dt;
        if (_sim != null && _sim.NbVehicules > 0 && dt > 0)
        {
            _sim.Pas(dt);
            for (int i = 0; i < _sim.NbVehicules; i++)
            {
                var buf = _tampons[_type[i]];
                int o = _rang[i] * 16;
                var (x, y, cap) = _sim.Position(i);
                if (double.IsNaN(x)) { Array.Clear(buf, o, 12); continue; }
                // roulage à droite : décalage de 2 m vers la droite du sens de marche
                double dx = Math.Sin(cap) * 2, dy = -Math.Cos(cap) * 2;
                Placer(buf, o, x + dx, y + dy, _p.Paquet.Altitude(x + dx, y + dy) + 0.32f, cap);
            }
            for (int k = 0; k < 3; k++) if (_vehicules[k].InstanceCount > 0) _vehicules[k].Buffer = _tampons[k];
        }
        AnimerBus(dt);
        AnimerPietons(dt);
        AnimerBateaux(dt);
    }

    /// <summary>Écrit la position et l'orientation (cap en radians, 0 = vers l'est) d'un exemplaire dans le tampon.</summary>
    private static void Placer(float[] buf, int o, double x, double y, float z, double cap, float bascule = 0)
    {
        float c = (float)Math.Cos(cap), s = (float)Math.Sin(cap);
        buf[o + 0] = -s; buf[o + 1] = 0; buf[o + 2] = c; buf[o + 3] = (float)x;
        buf[o + 4] = 0; buf[o + 5] = 1; buf[o + 6] = bascule; buf[o + 7] = z;
        buf[o + 8] = -c; buf[o + 9] = 0; buf[o + 10] = -s; buf[o + 11] = (float)-y;
    }

    private void Reconstruire()
    {
        _versionReseau = _p.Reseau.Version;
        _mois = _p.Mois;
        _popPrecedente = _p.Population;
        int n = Math.Min(MaxVoitures, _p.Population / 4);
        var paires = n > 0 ? _p.Deplacements(n) : new List<(int, int)>();
        var graphe = _p.Reseau.Graphe(_p.R);
        ulong graine = (ulong)_p.Jour;
        // le calcul des trajets se fait en arrière-plan : pas de saccade à l'écran
        _calcul = System.Threading.Tasks.Task.Run(() => paires.Count > 0 ? new SimTrafic(graphe, paires, graine) : (SimTrafic?)null);
        PreparerPietons();
    }

    private void Installer(SimTrafic? sim)
    {
        _sim = sim;
        int nb = _sim?.NbVehicules ?? 0;
        _type = new int[nb];
        _rang = new int[nb];
        var compte = new int[3];
        for (int i = 0; i < nb; i++)
        {
            int k = i % 10;
            _type[i] = k == 0 ? 2 : k <= 2 ? 1 : 0;
            _rang[i] = compte[_type[i]]++;
        }
        for (int t = 0; t < 3; t++)
        {
            _vehicules[t].InstanceCount = compte[t];
            _tampons[t] = new float[compte[t] * 16];
        }
        for (int i = 0; i < nb; i++)
        {
            var c = _type[i] == 2 ? new Color(0.85f, 0.85f, 0.88f) : Teintes[(i * 7 + 3) % Teintes.Length];
            int o = _rang[i] * 16;
            var buf = _tampons[_type[i]];
            buf[o + 12] = c.R; buf[o + 13] = c.G; buf[o + 14] = c.B; buf[o + 15] = 1;
        }
    }

    // ------------------------------------------------------------------ bus
    private void AnimerBus(float dt)
    {
        var l = _p.LigneBus;
        int nb = l.Count >= 2 ? _p.NbBus : 0;
        if (_bus.InstanceCount != nb) _bus.InstanceCount = nb;
        if (nb == 0) return;
        double total = 0;
        for (int i = 0; i + 1 < l.Count; i++) total += V2.Distance(l[i], l[i + 1]);
        if (total < 1) return;
        _distanceBus = (_distanceBus + dt * 9) % total;
        for (int b = 0; b < nb; b++)
        {
            double cible = (_distanceBus + total * b / nb) % total, acc = 0;
            for (int i = 0; i + 1 < l.Count; i++)
            {
                double seg = V2.Distance(l[i], l[i + 1]);
                if (acc + seg >= cible && seg > 0)
                {
                    var p = l[i] + (l[i + 1] - l[i]) * ((cible - acc) / seg);
                    double cap = Math.Atan2(l[i + 1].Y - l[i].Y, l[i + 1].X - l[i].X);
                    float c = (float)Math.Cos(cap), s = (float)Math.Sin(cap);
                    var basis = new Basis(new Vector3(-s, 0, -c), Vector3.Up, new Vector3(c, 0, -s));
                    _bus.SetInstanceTransform(b, new Transform3D(basis, RenduVille.G(_p, p, 0.32)));
                    break;
                }
                acc += seg;
            }
        }
    }

    // ------------------------------------------------------------------ piétons
    private void PreparerPietons()
    {
        int n = Math.Min(900, _p.Population / 25);
        var rues = _p.Reseau.Aretes.Values.Where(e => e.Gabarit is "rue" or "avenue" && e.Longueur > 20).ToList();
        if (n == 0 || rues.Count == 0) { _marcheurs = Array.Empty<(V2, V2, double, double, double)>(); _pietons.InstanceCount = 0; return; }
        // les piétons se promènent là où il y a des bâtiments
        var animees = rues.Where(e => _p.ParcellesProches(e.Trace[0], 40).Any(x => x.Batiment != null)).ToList();
        if (animees.Count > 0) rues = animees;
        var rnd = new Random(_p.Mois * 31 + 7);
        _marcheurs = new (V2, V2, double, double, double)[n];
        for (int i = 0; i < n; i++)
        {
            var e = rues[rnd.Next(rues.Count)];
            int s = rnd.Next(e.Trace.Count - 1);
            double cote = (_p.R.Route(e.Gabarit).LargeurM / 2 + 1.0) * (rnd.Next(2) == 0 ? 1 : -1);
            _marcheurs[i] = (e.Trace[s], e.Trace[s + 1], rnd.NextDouble(), (1.0 + rnd.NextDouble() * 0.6) * (rnd.Next(2) == 0 ? 1 : -1), cote);
        }
        _pietons.InstanceCount = n;
        for (int i = 0; i < n; i++) _pietons.SetInstanceColor(i, Vetements[i % Vetements.Length]);
    }

    private float[] _tamponPietons = Array.Empty<float>();

    private void AnimerPietons(float dt)
    {
        int n = _marcheurs.Length;
        if (n == 0) return;
        if (_tamponPietons.Length != n * 16)
        {
            _tamponPietons = new float[n * 16];
            for (int i = 0; i < n; i++) { var c = Vetements[i % Vetements.Length]; _tamponPietons[i * 16 + 12] = c.R; _tamponPietons[i * 16 + 13] = c.G; _tamponPietons[i * 16 + 14] = c.B; _tamponPietons[i * 16 + 15] = 1; }
        }
        for (int i = 0; i < n; i++)
        {
            var (a, b, t, v, cote) = _marcheurs[i];
            double l = Math.Max(V2.Distance(a, b), 1);
            t += v * dt / l;
            if (t > 1 || t < 0) { v = -v; t = Math.Clamp(t, 0, 1); }   // demi-tour au bout du trottoir
            _marcheurs[i] = (a, b, t, v, cote);
            var d = (b - a) * (1 / l);
            var p = a + (b - a) * t + d.Perp * cote;
            double cap = Math.Atan2(d.Y, d.X) + (v < 0 ? Math.PI : 0);
            float sautille = (float)Math.Abs(Math.Sin(_temps * 6 + i)) * 0.05f;
            Placer(_tamponPietons, i * 16, p.X, p.Y, _p.Paquet.Altitude(p.X, p.Y) + 0.35f + sautille, cap);
        }
        _pietons.Buffer = _tamponPietons;
    }

    // ------------------------------------------------------------------ bateaux
    private void PreparerBateaux()
    {
        // points d'eau loin des berges (tous les 60 m), pour y faire naviguer quelques bateaux
        _pointsEau = new List<V2>();
        double demi = _p.DemiCote;
        for (double x = -demi + 60; x < demi - 60; x += 60)
            for (double y = -demi + 60; y < demi - 60; y += 60)
            {
                var q = new V2(x, y);
                if (_p.Grille.Eau(q) && _p.Grille.Eau(q + new V2(40, 0)) && _p.Grille.Eau(q - new V2(40, 0)) && _p.Grille.Eau(q + new V2(0, 40)) && _p.Grille.Eau(q - new V2(0, 40)))
                    _pointsEau.Add(q);
            }
        int n = Math.Min(24, _pointsEau.Count / 15);
        var rnd = new Random(11);
        _bateaux = new (V2, V2, double)[n];
        for (int i = 0; i < n; i++)
            _bateaux[i] = (_pointsEau[rnd.Next(_pointsEau.Count)], _pointsEau[rnd.Next(_pointsEau.Count)], i % 2 == 0 ? 5.0 : 2.5);
        _vedettes.InstanceCount = (n + 1) / 2;
        _voiliers.InstanceCount = n / 2;
    }

    private bool TrajetSurLEau(V2 a, V2 b)
    {
        double l = V2.Distance(a, b);
        for (double s = 0; s <= l; s += 20)
            if (!_p.Grille.Eau(a + (b - a) * (s / Math.Max(l, 1)))) return false;
        return true;
    }

    private readonly Random _rndBateaux = new(5);

    private void AnimerBateaux(float dt)
    {
        for (int i = 0; i < _bateaux.Length; i++)
        {
            var (pos, cible, v) = _bateaux[i];
            var d = cible - pos;
            double l = d.Longueur;
            if (l < 5)
            {
                // nouvelle destination atteignable en ligne droite sur l'eau
                for (int essai = 0; essai < 8; essai++)
                {
                    var c = _pointsEau[_rndBateaux.Next(_pointsEau.Count)];
                    if (V2.Distance(c, pos) > 100 && TrajetSurLEau(pos, c)) { cible = c; break; }
                }
                _bateaux[i] = (pos, cible, v);
                continue;
            }
            pos = pos + d * Math.Min(1, v * dt / l);
            _bateaux[i] = (pos, cible, v);
            double cap = Math.Atan2(d.Y, d.X);
            float c2 = (float)Math.Cos(cap), s2 = (float)Math.Sin(cap);
            var basis = new Basis(new Vector3(-s2, 0, -c2), Vector3.Up, new Vector3(c2, 0, -s2));
            float houle = (float)Math.Sin(_temps * 1.5 + i) * 0.12f;
            var t = new Transform3D(basis, new Vector3((float)pos.X, _p.Paquet.Altitude(pos.X, pos.Y) + 0.1f + houle, (float)-pos.Y));
            if (i % 2 == 0) _vedettes.SetInstanceTransform(i / 2, t); else _voiliers.SetInstanceTransform(i / 2, t);
        }
    }
}
