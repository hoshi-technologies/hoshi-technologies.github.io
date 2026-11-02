namespace Ville.Coeur;

/// <summary>Point ou vecteur 2D en mètres (x = est, y = nord). En double pour la précision et le déterminisme.</summary>
public readonly record struct V2(double X, double Y)
{
    public static V2 operator +(V2 a, V2 b) => new(a.X + b.X, a.Y + b.Y);
    public static V2 operator -(V2 a, V2 b) => new(a.X - b.X, a.Y - b.Y);
    public static V2 operator *(V2 a, double k) => new(a.X * k, a.Y * k);
    public double Longueur => Math.Sqrt(X * X + Y * Y);
    public V2 Normalise() { double l = Longueur; return l < 1e-12 ? new V2(0, 0) : new V2(X / l, Y / l); }
    public V2 Perp => new(-Y, X);
    public static double Dot(V2 a, V2 b) => a.X * b.X + a.Y * b.Y;
    public static double Cross(V2 a, V2 b) => a.X * b.Y - a.Y * b.X;
    public static double Distance(V2 a, V2 b) => (a - b).Longueur;
    public override string ToString() => $"({X:F1}, {Y:F1})";
}

public static class Geo
{
    /// <summary>Intersection stricte de deux segments [a,b] et [c,d] ; renvoie t sur [a,b] et u sur [c,d].</summary>
    public static bool Intersection(V2 a, V2 b, V2 c, V2 d, out double t, out double u)
    {
        var r = b - a; var s = d - c;
        double den = V2.Cross(r, s);
        t = u = 0;
        if (Math.Abs(den) < 1e-9) return false;
        t = V2.Cross(c - a, s) / den;
        u = V2.Cross(c - a, r) / den;
        return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
    }

    /// <summary>Point le plus proche de p sur le segment [a,b] ; renvoie t dans [0,1].</summary>
    public static double Projection(V2 p, V2 a, V2 b, out V2 proche)
    {
        var ab = b - a;
        double l2 = V2.Dot(ab, ab);
        double t = l2 < 1e-12 ? 0 : Math.Clamp(V2.Dot(p - a, ab) / l2, 0, 1);
        proche = a + ab * t;
        return t;
    }

    public static double LongueurPolyligne(IReadOnlyList<V2> pts)
    {
        double l = 0;
        for (int i = 1; i < pts.Count; i++) l += V2.Distance(pts[i - 1], pts[i]);
        return l;
    }

    public static bool DansPolygone(V2 p, IReadOnlyList<V2> poly)
    {
        bool dedans = false;
        for (int i = 0, j = poly.Count - 1; i < poly.Count; j = i++)
        {
            if ((poly[i].Y > p.Y) != (poly[j].Y > p.Y) &&
                p.X < (poly[j].X - poly[i].X) * (p.Y - poly[i].Y) / (poly[j].Y - poly[i].Y) + poly[i].X)
                dedans = !dedans;
        }
        return dedans;
    }
}
