using Godot;
using Ville.Donnees;

namespace Jeu.Rendu;

/// <summary>
/// Fabrique les objets 3D d'une ville à partir d'un paquet : terrain, eau, bâtiments, routes.
/// Repère Godot : X = est, Y = haut, Z = sud (donc z = -y du paquet).
/// Les bâtiments et les routes sont regroupés par carrés de 500 m pour limiter le nombre d'objets à dessiner.
/// </summary>
public sealed class ConstructeurVille
{
    private const float TailleCarre = 500f;
    private readonly PaquetVille _p;
    public Dictionary<string, double> Mesures { get; } = new();

    public ConstructeurVille(PaquetVille paquet) => _p = paquet;

    public static Vector3 VersGodot(double x, double y, double alt) => new((float)x, (float)alt, (float)-y);

    private T Chrono<T>(string nom, Func<T> f)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var r = f();
        Mesures[nom] = Math.Round(sw.Elapsed.TotalMilliseconds, 1);
        return r;
    }

    public Node3D Construire()
    {
        var racine = new Node3D { Name = "Ville" };
        racine.AddChild(Chrono("terrain_ms", ConstruireTerrain));
        racine.AddChild(Chrono("eau_ms", ConstruireEau));
        racine.AddChild(Chrono("routes_ms", ConstruireRoutes));
        racine.AddChild(Chrono("batiments_ms", () => ConstruireBatiments()));
        return racine;
    }

    // ---------------------------------------------------------------- terrain
    public Node3D ConstruireTerrain()
    {
        var r = _p.Manifest.Relief;
        // grandes cartes : un point sur deux (grille de 20 m) pour garder un affichage fluide
        int pas = r.Colonnes > 600 ? 2 : 1;
        int nc = (r.Colonnes - 1) / pas + 1, nl = (r.Lignes - 1) / pas + 1;
        double demi = _p.Manifest.Repere.DemiCoteM;
        var sommets = new Vector3[nc * nl];
        var couleurs = new Color[nc * nl];
        float altMin = (float)r.AltMin, plage = Math.Max(1f, (float)(r.AltMax - r.AltMin));
        for (int l = 0; l < nl; l++)
            for (int c = 0; c < nc; c++)
            {
                int i = l * nc + c;
                float z = _p.Relief[l * pas * r.Colonnes + c * pas];
                sommets[i] = VersGodot(-demi + c * pas * r.PasM, demi - l * pas * r.PasM, z);
                float t = (z - altMin) / plage;
                couleurs[i] = new Color(0.55f, 0.66f, 0.42f).Lerp(new Color(0.62f, 0.60f, 0.52f), Mathf.Clamp(t * 1.5f, 0, 1));
            }
        var indices = new int[(nc - 1) * (nl - 1) * 6];
        int k = 0;
        for (int l = 0; l < nl - 1; l++)
            for (int c = 0; c < nc - 1; c++)
            {
                int a = l * nc + c, b = a + 1, d = a + nc, e = d + 1;
                indices[k++] = a; indices[k++] = b; indices[k++] = d;
                indices[k++] = b; indices[k++] = e; indices[k++] = d;
            }
        var mesh = Maillage(sommets, Normales(sommets, indices), couleurs, indices);
        return new MeshInstance3D { Name = "Terrain", Mesh = mesh, MaterialOverride = Materiau(rugosite: 1f) };
    }

    // ---------------------------------------------------------------- eau
    public Node3D ConstruireEau()
    {
        var sommets = new List<Vector3>();
        var indices = new List<int>();
        foreach (var s in _p.Eau.Surfaces)
        {
            var poly = s.Contour.Select(p => new Vector2((float)p[0], (float)p[1])).ToArray();
            var tri = Geometry2D.TriangulatePolygon(poly);
            // niveau de l'eau : altitude minimale du terrain sur le contour (le lac est déjà plat)
            // niveau de l'eau : altitude médiane du relief À L'INTÉRIEUR du plan d'eau (les lacs y sont aplanis)
            var interieur = PointsInterieurs(poly).Select(q => _p.Altitude(q.X, q.Y)).OrderBy(z => z).ToArray();
            float niveau = (interieur.Length > 0 ? interieur[interieur.Length / 2] : s.Contour.Min(p => _p.Altitude(p[0], p[1]))) + 0.5f;
            if (tri.Length == 0)
            {
                // forme trop complexe (grand lac) : remplissage par bandes de 10 m
                RemplirParBandes(poly, niveau, sommets, indices);
                continue;
            }
            int baseIdx = sommets.Count;
            sommets.AddRange(poly.Select(p => VersGodot(p.X, p.Y, niveau)));
            indices.AddRange(tri.Select(t => baseIdx + t));
        }
        var n = Enumerable.Repeat(Vector3.Up, sommets.Count).ToArray();
        var col = Enumerable.Repeat(new Color(0.42f, 0.64f, 0.80f), sommets.Count).ToArray();
        var mat = Materiau(rugosite: 0.08f);
        mat.Metallic = 0.1f;
        if (sommets.Count == 0) return new Node3D { Name = "Eau" };
        return new MeshInstance3D { Name = "Eau", Mesh = Maillage(sommets.ToArray(), n, col, indices.ToArray()), MaterialOverride = mat };
    }

    /// <summary>Quelques points à l'intérieur d'un polygone (milieux des bandes horizontales).</summary>
    private static List<Vector2> PointsInterieurs(Vector2[] poly)
    {
        var res = new List<Vector2>();
        float minY = poly.Min(p => p.Y), maxY = poly.Max(p => p.Y);
        float pas = Math.Max(5f, (maxY - minY) / 12f);
        var xs = new List<float>();
        for (float y = minY + pas / 2; y < maxY; y += pas)
        {
            xs.Clear();
            for (int k = 0, l = poly.Length - 1; k < poly.Length; l = k++)
            {
                var a = poly[k]; var b = poly[l];
                if ((a.Y > y) != (b.Y > y)) xs.Add(a.X + (y - a.Y) * (b.X - a.X) / (b.Y - a.Y));
            }
            xs.Sort();
            for (int k = 0; k + 1 < xs.Count; k += 2) res.Add(new Vector2((xs[k] + xs[k + 1]) / 2, y));
        }
        return res;
    }

    private static void RemplirParBandes(Vector2[] poly, float niveau, List<Vector3> sommets, List<int> indices)
    {
        const float pas = 10f;
        float minY = poly.Min(p => p.Y), maxY = poly.Max(p => p.Y);
        var xs = new List<float>();
        for (float y = minY + pas / 2; y < maxY; y += pas)
        {
            xs.Clear();
            for (int k = 0, l = poly.Length - 1; k < poly.Length; l = k++)
            {
                var a = poly[k]; var b = poly[l];
                if ((a.Y > y) != (b.Y > y)) xs.Add(a.X + (y - a.Y) * (b.X - a.X) / (b.Y - a.Y));
            }
            xs.Sort();
            for (int k = 0; k + 1 < xs.Count; k += 2)
            {
                int i = sommets.Count;
                sommets.Add(VersGodot(xs[k], y - pas / 2 - 0.2f, niveau));
                sommets.Add(VersGodot(xs[k + 1], y - pas / 2 - 0.2f, niveau));
                sommets.Add(VersGodot(xs[k + 1], y + pas / 2 + 0.2f, niveau));
                sommets.Add(VersGodot(xs[k], y + pas / 2 + 0.2f, niveau));
                indices.AddRange(new[] { i, i + 1, i + 2, i, i + 2, i + 3 });
            }
        }
    }

    // ---------------------------------------------------------------- routes
    private static readonly Dictionary<string, (float largeur, Color couleur)> StyleRoute = new()
    {
        ["voie_rapide"] = (14f, new Color(0.36f, 0.36f, 0.38f)),
        ["avenue"] = (10f, new Color(0.40f, 0.40f, 0.42f)),
        ["rue"] = (6.5f, new Color(0.45f, 0.45f, 0.46f)),
        ["desserte"] = (4f, new Color(0.52f, 0.51f, 0.50f)),
        ["pieton"] = (2f, new Color(0.74f, 0.70f, 0.64f)),
        ["rail"] = (3.5f, new Color(0.38f, 0.33f, 0.30f)),
    };

    private Node3D ConstruireRoutes()
    {
        var parCarre = new Dictionary<(int, int), Lots>();
        foreach (var t in _p.Routes.Troncons)
        {
            if (!StyleRoute.TryGetValue(t.Gabarit, out var style) || t.Tunnel) continue;
            var lot = Lot(parCarre, t.Trace[0][0], t.Trace[0][1]);
            float surelevation = t.Pont ? 6f : (t.Gabarit == "pieton" ? 0.25f : 0.35f);
            for (int i = 0; i < t.Trace.Length - 1; i++)
            {
                var a = new Vector2((float)t.Trace[i][0], (float)t.Trace[i][1]);
                var b = new Vector2((float)t.Trace[i + 1][0], (float)t.Trace[i + 1][1]);
                var dir = (b - a);
                if (dir.LengthSquared() < 0.01f) continue;
                var nrm = new Vector2(-dir.Y, dir.X).Normalized() * style.largeur / 2;
                float za = _p.Altitude(a.X, a.Y) + surelevation, zb = _p.Altitude(b.X, b.Y) + surelevation;
                lot.Quad(VersGodot(a.X + nrm.X, a.Y + nrm.Y, za), VersGodot(a.X - nrm.X, a.Y - nrm.Y, za),
                         VersGodot(b.X - nrm.X, b.Y - nrm.Y, zb), VersGodot(b.X + nrm.X, b.Y + nrm.Y, zb),
                         Vector3.Up, style.couleur);
            }
        }
        return Regrouper("Routes", parCarre, Materiau(rugosite: 0.9f));
    }

    // ---------------------------------------------------------------- bâtiments
    public static Color CouleurUsage(string usage) => usage switch
    {
        "habitat" => new Color(0.93f, 0.88f, 0.80f),
        "commerce" => new Color(0.95f, 0.78f, 0.62f),
        "bureaux" => new Color(0.75f, 0.82f, 0.90f),
        "activites" => new Color(0.80f, 0.78f, 0.86f),
        "ecole" or "sante" or "public" => new Color(0.98f, 0.92f, 0.62f),
        "culte" => new Color(0.86f, 0.80f, 0.72f),
        "annexe" => new Color(0.78f, 0.74f, 0.70f),
        _ => new Color(0.88f, 0.86f, 0.82f),
    };

    public Node3D ConstruireBatiments(Material? materiau = null)
    {
        var parCarre = new Dictionary<(int, int), Lots>();
        int echecs = 0;
        foreach (var bat in _p.Batiments)
        {
            var poly = bat.Contour.Select(p => new Vector2((float)p[0], (float)p[1])).ToArray();
            if (poly.Length < 3) continue;
            var tri = Geometry2D.TriangulatePolygon(poly);
            if (tri.Length == 0) { echecs++; continue; }
            // le bâtiment est posé au point le plus bas de son emprise (pas de bâtiment qui flotte)
            float sol = poly.Min(p => _p.Altitude(p.X, p.Y));
            float toit = sol + (float)bat.HauteurM;
            var couleur = CouleurUsage(bat.Usage);
            var lot = Lot(parCarre, poly[0].X, poly[0].Y);
            // murs
            for (int i = 0; i < poly.Length; i++)
            {
                var a = poly[i];
                var b = poly[(i + 1) % poly.Length];
                var d = b - a;
                var n = new Vector3(d.Y, 0, d.X).Normalized(); // normale horizontale (sens corrigé par l'éclairage double face)
                lot.Quad(VersGodot(a.X, a.Y, sol - 1), VersGodot(b.X, b.Y, sol - 1), VersGodot(b.X, b.Y, toit), VersGodot(a.X, a.Y, toit),
                         n, couleur * 0.92f);
            }
            // toit
            int baseIdx = lot.Sommets.Count;
            var couleurToit = couleur.Darkened(0.25f);
            foreach (var p in poly) { lot.Sommets.Add(VersGodot(p.X, p.Y, toit)); lot.Normales.Add(Vector3.Up); lot.Couleurs.Add(couleurToit); }
            foreach (var t in tri) lot.Indices.Add(baseIdx + t);
        }
        Mesures["batiments_non_triangules"] = echecs;
        return Regrouper("Batiments", parCarre, materiau ?? Materiau(rugosite: 0.85f));
    }

    // ---------------------------------------------------------------- outils
    private sealed class Lots
    {
        public readonly List<Vector3> Sommets = new();
        public readonly List<Vector3> Normales = new();
        public readonly List<Color> Couleurs = new();
        public readonly List<int> Indices = new();

        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n, Color col)
        {
            int i = Sommets.Count;
            Sommets.Add(a); Sommets.Add(b); Sommets.Add(c); Sommets.Add(d);
            for (int k = 0; k < 4; k++) { Normales.Add(n); Couleurs.Add(col); }
            Indices.Add(i); Indices.Add(i + 1); Indices.Add(i + 2);
            Indices.Add(i); Indices.Add(i + 2); Indices.Add(i + 3);
        }
    }

    private static Lots Lot(Dictionary<(int, int), Lots> d, double x, double y)
    {
        var cle = ((int)Math.Floor(x / TailleCarre), (int)Math.Floor(y / TailleCarre));
        if (!d.TryGetValue(cle, out var l)) d[cle] = l = new Lots();
        return l;
    }

    private Node3D Regrouper(string nom, Dictionary<(int, int), Lots> lots, Material mat)
    {
        var noeud = new Node3D { Name = nom };
        long triangles = 0;
        foreach (var (cle, l) in lots.OrderBy(kv => kv.Key))
        {
            if (l.Indices.Count == 0) continue;
            triangles += l.Indices.Count / 3;
            noeud.AddChild(new MeshInstance3D
            {
                Name = $"{nom}_{cle.Item1}_{cle.Item2}",
                Mesh = Maillage(l.Sommets.ToArray(), l.Normales.ToArray(), l.Couleurs.ToArray(), l.Indices.ToArray()),
                MaterialOverride = mat,
            });
        }
        Mesures[$"{nom.ToLowerInvariant()}_triangles"] = triangles;
        Mesures[$"{nom.ToLowerInvariant()}_objets"] = noeud.GetChildCount();
        return noeud;
    }

    private static ArrayMesh Maillage(Vector3[] sommets, Vector3[] normales, Color[] couleurs, int[] indices)
    {
        var arrays = new Godot.Collections.Array();
        arrays.Resize((int)Mesh.ArrayType.Max);
        arrays[(int)Mesh.ArrayType.Vertex] = sommets;
        arrays[(int)Mesh.ArrayType.Normal] = normales;
        arrays[(int)Mesh.ArrayType.Color] = couleurs;
        arrays[(int)Mesh.ArrayType.Index] = indices;
        var m = new ArrayMesh();
        m.AddSurfaceFromArrays(Mesh.PrimitiveType.Triangles, arrays);
        return m;
    }

    private static Vector3[] Normales(Vector3[] s, int[] idx)
    {
        var n = new Vector3[s.Length];
        for (int i = 0; i < idx.Length; i += 3)
        {
            var f = (s[idx[i + 2]] - s[idx[i]]).Cross(s[idx[i + 1]] - s[idx[i]]);
            n[idx[i]] += f; n[idx[i + 1]] += f; n[idx[i + 2]] += f;
        }
        for (int i = 0; i < n.Length; i++) n[i] = n[i].Y < 0 ? -n[i].Normalized() : n[i].Normalized();
        return n;
    }

    public static StandardMaterial3D Materiau(float rugosite) => new()
    {
        VertexColorUseAsAlbedo = true,
        VertexColorIsSrgb = true,
        Roughness = rugosite,
        CullMode = BaseMaterial3D.CullModeEnum.Disabled,
    };
}
