namespace Ville.Coeur;

/// <summary>
/// Grille de 4 m qui sait ce qui occupe le sol : eau, routes, parcelles.
/// Sert à refuser une parcelle dans le lac ou sur une route.
/// </summary>
public sealed class GrilleOccupation
{
    public const double Pas = 4.0;
    public readonly int N;
    public readonly double Demi;
    private readonly bool[] _eau;
    private readonly ushort[] _routes;
    private readonly int[] _parcelle;
    private float[]? _distanceEau;

    public GrilleOccupation(double demiCote)
    {
        Demi = demiCote;
        N = (int)Math.Ceiling(2 * demiCote / Pas);
        _eau = new bool[N * N];
        _routes = new ushort[N * N];
        _parcelle = new int[N * N];
        Array.Fill(_parcelle, -1);
    }

    public bool DansCarte(int i, int j) => i >= 0 && j >= 0 && i < N && j < N;
    public (int i, int j) Cellule(V2 p) => ((int)Math.Floor((p.X + Demi) / Pas), (int)Math.Floor((p.Y + Demi) / Pas));
    public V2 Centre(int i, int j) => new(-Demi + (i + 0.5) * Pas, -Demi + (j + 0.5) * Pas);
    public bool Eau(int i, int j) => _eau[j * N + i];
    public bool Eau(V2 p) { var (i, j) = Cellule(p); return DansCarte(i, j) && _eau[j * N + i]; }
    public int Parcelle(int i, int j) => _parcelle[j * N + i];
    public bool Route(int i, int j) => _routes[j * N + i] > 0;

    /// <summary>Remplit les cellules dont le centre est dans le polygone (balayage ligne par ligne).</summary>
    public void PolygoneEau(IReadOnlyList<V2> poly, IReadOnlyList<IReadOnlyList<V2>>? trous = null)
    {
        var cellules = new List<(int, int)>();
        CellulesPolygone(poly, cellules);
        var dedans = new HashSet<(int, int)>(cellules);
        if (trous != null)
            foreach (var t in trous)
            {
                var c = new List<(int, int)>();
                CellulesPolygone(t, c);
                foreach (var x in c) dedans.Remove(x);
            }
        foreach (var (i, j) in dedans) _eau[j * N + i] = true;
        _distanceEau = null;
    }

    public List<(int i, int j)> CellulesPolygone(IReadOnlyList<V2> poly)
    {
        var l = new List<(int, int)>();
        CellulesPolygone(poly, l);
        return l;
    }

    private void CellulesPolygone(IReadOnlyList<V2> poly, List<(int, int)> sortie)
    {
        double minY = poly.Min(p => p.Y), maxY = poly.Max(p => p.Y);
        int j0 = Math.Max(0, (int)Math.Floor((minY + Demi) / Pas)), j1 = Math.Min(N - 1, (int)Math.Ceiling((maxY + Demi) / Pas));
        var xs = new List<double>();
        for (int j = j0; j <= j1; j++)
        {
            double y = -Demi + (j + 0.5) * Pas;
            xs.Clear();
            for (int k = 0, l = poly.Count - 1; k < poly.Count; l = k++)
            {
                var a = poly[k]; var b = poly[l];
                if ((a.Y > y) != (b.Y > y)) xs.Add(a.X + (y - a.Y) * (b.X - a.X) / (b.Y - a.Y));
            }
            xs.Sort();
            for (int k = 0; k + 1 < xs.Count; k += 2)
            {
                int i0 = Math.Max(0, (int)Math.Ceiling((xs[k] + Demi) / Pas - 0.5));
                int i1 = Math.Min(N - 1, (int)Math.Floor((xs[k + 1] + Demi) / Pas - 0.5));
                for (int i = i0; i <= i1; i++) sortie.Add((i, j));
            }
        }
    }

    /// <summary>Cellules couvertes par un rectangle orienté (centre, axe u unitaire, demi-largeurs).</summary>
    public List<(int i, int j)> CellulesRectangle(V2 centre, V2 u, double demiU, double demiV)
    {
        var v = u.Perp;
        var res = new List<(int, int)>();
        double r = Math.Sqrt(demiU * demiU + demiV * demiV);
        var (i0, j0) = Cellule(centre - new V2(r, r));
        var (i1, j1) = Cellule(centre + new V2(r, r));
        for (int j = Math.Max(0, j0); j <= Math.Min(N - 1, j1); j++)
            for (int i = Math.Max(0, i0); i <= Math.Min(N - 1, i1); i++)
            {
                var d = Centre(i, j) - centre;
                if (Math.Abs(V2.Dot(d, u)) <= demiU && Math.Abs(V2.Dot(d, v)) <= demiV) res.Add((i, j));
            }
        return res;
    }

    public List<(int i, int j)> CellulesSegment(V2 a, V2 b, double demiLargeur)
    {
        var d = b - a;
        double l = d.Longueur;
        if (l < 1e-6) return CellulesRectangle(a, new V2(1, 0), demiLargeur, demiLargeur);
        return CellulesRectangle((a + b) * 0.5, d * (1 / l), l / 2 + demiLargeur * 0.5, demiLargeur);
    }

    public void AjouterRoute(List<(int i, int j)> cellules, int delta)
    {
        foreach (var (i, j) in cellules)
            _routes[j * N + i] = (ushort)Math.Max(0, _routes[j * N + i] + delta);
    }

    public bool Libre(List<(int i, int j)> cellules) =>
        cellules.Count > 0 && cellules.All(c => _routes[c.j * N + c.i] == 0 && !_eau[c.j * N + c.i] && _parcelle[c.j * N + c.i] < 0);

    public void MarquerParcelle(List<(int i, int j)> cellules, int id)
    {
        foreach (var (i, j) in cellules) _parcelle[j * N + i] = id;
    }

    public HashSet<int> ParcellesSous(List<(int i, int j)> cellules)
    {
        var res = new HashSet<int>();
        foreach (var (i, j) in cellules) if (_parcelle[j * N + i] >= 0) res.Add(_parcelle[j * N + i]);
        return res;
    }

    /// <summary>Distance (m) à l'eau la plus proche, calculée une fois (transformée de distance en 2 passes).</summary>
    public double DistanceEau(V2 p)
    {
        if (_distanceEau == null) CalculerDistanceEau();
        var (i, j) = Cellule(p);
        if (!DansCarte(i, j)) return 1e9;
        return _distanceEau![j * N + i];
    }

    private void CalculerDistanceEau()
    {
        var d = new float[N * N];
        const float inf = 1e9f, a = (float)Pas, b = (float)(Pas * 1.41421356);
        for (int k = 0; k < d.Length; k++) d[k] = _eau[k] ? 0 : inf;
        for (int j = 0; j < N; j++)
            for (int i = 0; i < N; i++)
            {
                int k = j * N + i; float v = d[k];
                if (i > 0) v = Math.Min(v, d[k - 1] + a);
                if (j > 0) v = Math.Min(v, d[k - N] + a);
                if (i > 0 && j > 0) v = Math.Min(v, d[k - N - 1] + b);
                if (i < N - 1 && j > 0) v = Math.Min(v, d[k - N + 1] + b);
                d[k] = v;
            }
        for (int j = N - 1; j >= 0; j--)
            for (int i = N - 1; i >= 0; i--)
            {
                int k = j * N + i; float v = d[k];
                if (i < N - 1) v = Math.Min(v, d[k + 1] + a);
                if (j < N - 1) v = Math.Min(v, d[k + N] + a);
                if (i < N - 1 && j < N - 1) v = Math.Min(v, d[k + N + 1] + b);
                if (i > 0 && j < N - 1) v = Math.Min(v, d[k + N - 1] + b);
                d[k] = v;
            }
        _distanceEau = d;
    }
}
