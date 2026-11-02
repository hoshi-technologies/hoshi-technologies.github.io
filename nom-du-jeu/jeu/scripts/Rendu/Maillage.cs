using Godot;

namespace Jeu.Rendu;

/// <summary>
/// Petit outil pour fabriquer des objets 3D (boîtes, toits, prismes) avec des couleurs par sommet.
/// Les faces sont orientées automatiquement vers l'extérieur (normale fournie).
/// </summary>
public sealed class Maillage
{
    public readonly List<Vector3> Sommets = new();
    public readonly List<Vector3> Normales = new();
    public readonly List<Color> Couleurs = new();
    public readonly List<int> Indices = new();

    public bool Vide => Indices.Count == 0;

    /// <summary>Quadrilatère a-b-c-d (dans l'ordre du contour) de normale n.</summary>
    public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n, Color col)
    {
        int i = Sommets.Count;
        Sommets.Add(a); Sommets.Add(b); Sommets.Add(c); Sommets.Add(d);
        for (int k = 0; k < 4; k++) { Normales.Add(n); Couleurs.Add(col); }
        // Godot considère comme « face avant » les triangles dans le sens des aiguilles d'une montre vus de face
        bool inverse = (b - a).Cross(c - a).Dot(n) > 0;
        if (inverse) { Indices.Add(i); Indices.Add(i + 2); Indices.Add(i + 1); Indices.Add(i); Indices.Add(i + 3); Indices.Add(i + 2); }
        else { Indices.Add(i); Indices.Add(i + 1); Indices.Add(i + 2); Indices.Add(i); Indices.Add(i + 2); Indices.Add(i + 3); }
    }

    public void Triangle(Vector3 a, Vector3 b, Vector3 c, Vector3 n, Color col)
    {
        int i = Sommets.Count;
        Sommets.Add(a); Sommets.Add(b); Sommets.Add(c);
        for (int k = 0; k < 3; k++) { Normales.Add(n); Couleurs.Add(col); }
        if ((b - a).Cross(c - a).Dot(n) > 0) { Indices.Add(i); Indices.Add(i + 2); Indices.Add(i + 1); }
        else { Indices.Add(i); Indices.Add(i + 1); Indices.Add(i + 2); }
    }

    /// <summary>
    /// Boîte orientée posée au sol : centre (x, z Godot), axe u horizontal unitaire, demi-dimensions, de y0 à y1.
    /// </summary>
    public void Boite(Vector3 centre, Vector3 u, float demiU, float demiV, float y0, float y1, Color murs, Color? toit = null, bool fond = false)
    {
        u = new Vector3(u.X, 0, u.Z).Normalized();
        var v = new Vector3(-u.Z, 0, u.X);
        Vector3 P(float su, float sv, float y) => new(centre.X + u.X * su * demiU + v.X * sv * demiV, y, centre.Z + u.Z * su * demiU + v.Z * sv * demiV);
        var t = toit ?? murs;
        Quad(P(-1, -1, y1), P(1, -1, y1), P(1, 1, y1), P(-1, 1, y1), Vector3.Up, t);
        Quad(P(1, -1, y0), P(1, 1, y0), P(1, 1, y1), P(1, -1, y1), u, murs);
        Quad(P(-1, 1, y0), P(-1, -1, y0), P(-1, -1, y1), P(-1, 1, y1), -u, murs);
        Quad(P(1, 1, y0), P(-1, 1, y0), P(-1, 1, y1), P(1, 1, y1), v, murs.Darkened(0.08f));
        Quad(P(-1, -1, y0), P(1, -1, y0), P(1, -1, y1), P(-1, -1, y1), -v, murs.Darkened(0.08f));
        if (fond) Quad(P(-1, -1, y0), P(-1, 1, y0), P(1, 1, y0), P(1, -1, y0), Vector3.Down, murs);
    }

    /// <summary>Toit à deux pans dont le faîtage suit l'axe u.</summary>
    public void ToitDeuxPans(Vector3 centre, Vector3 u, float demiU, float demiV, float y0, float hauteur, Color tuiles, Color pignon)
    {
        u = new Vector3(u.X, 0, u.Z).Normalized();
        var v = new Vector3(-u.Z, 0, u.X);
        Vector3 P(float su, float sv, float y) => new(centre.X + u.X * su * demiU + v.X * sv * demiV, y, centre.Z + u.Z * su * demiU + v.Z * sv * demiV);
        float y1 = y0 + hauteur;
        var n1 = (v * hauteur + Vector3.Up * demiV).Normalized();
        var n2 = (-v * hauteur + Vector3.Up * demiV).Normalized();
        Quad(P(-1, 1.05f, y0), P(1, 1.05f, y0), P(1, 0, y1), P(-1, 0, y1), n1, tuiles);
        Quad(P(1, -1.05f, y0), P(-1, -1.05f, y0), P(-1, 0, y1), P(1, 0, y1), n2, tuiles.Darkened(0.12f));
        Triangle(P(1, -1, y0), P(1, 1, y0), P(1, 0, y1), u, pignon);
        Triangle(P(-1, 1, y0), P(-1, -1, y0), P(-1, 0, y1), -u, pignon);
    }

    /// <summary>Prisme vertical à n côtés (cylindre simplifié), de l'altitude y0 à y1.</summary>
    public void Cylindre(Vector3 centre, float rayon, float y0, float y1, Color col, int cotes = 10)
    {
        centre = new Vector3(centre.X, 0, centre.Z);
        for (int k = 0; k < cotes; k++)
        {
            float a0 = Mathf.Tau * k / cotes, a1 = Mathf.Tau * (k + 1) / cotes;
            var p0 = new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)) * rayon;
            var p1 = new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1)) * rayon;
            var n = ((p0 + p1) / 2).Normalized();
            Quad(centre + p0 + Vector3.Up * y0, centre + p1 + Vector3.Up * y0, centre + p1 + Vector3.Up * y1, centre + p0 + Vector3.Up * y1, n, col);
            Triangle(centre + Vector3.Up * y1, centre + p1 + Vector3.Up * y1, centre + p0 + Vector3.Up * y1, Vector3.Up, col.Lightened(0.1f));
        }
    }

    /// <summary>Arbre stylisé : tronc + cône de feuillage.</summary>
    public void Arbre(Vector3 pied, float hauteur, Color feuillage)
    {
        Cylindre(pied, hauteur * 0.06f, pied.Y, pied.Y + hauteur * 0.35f, new Color(0.42f, 0.30f, 0.20f), 5);
        const int cotes = 7;
        float r = hauteur * 0.32f, y0 = pied.Y + hauteur * 0.25f, y1 = pied.Y + hauteur;
        for (int k = 0; k < cotes; k++)
        {
            float a0 = Mathf.Tau * k / cotes, a1 = Mathf.Tau * (k + 1) / cotes;
            var p0 = new Vector3(pied.X + Mathf.Cos(a0) * r, y0, pied.Z + Mathf.Sin(a0) * r);
            var p1 = new Vector3(pied.X + Mathf.Cos(a1) * r, y0, pied.Z + Mathf.Sin(a1) * r);
            var sommet = new Vector3(pied.X, y1, pied.Z);
            var n = ((p0 + p1) / 2 - new Vector3(pied.X, y0, pied.Z)).Normalized() + Vector3.Up * 0.5f;
            Triangle(p0, p1, sommet, n.Normalized(), feuillage);
        }
    }

    public ArrayMesh? VersMesh()
    {
        if (Vide) return null;
        var arrays = new Godot.Collections.Array();
        arrays.Resize((int)Mesh.ArrayType.Max);
        arrays[(int)Mesh.ArrayType.Vertex] = Sommets.ToArray();
        arrays[(int)Mesh.ArrayType.Normal] = Normales.ToArray();
        arrays[(int)Mesh.ArrayType.Color] = Couleurs.ToArray();
        arrays[(int)Mesh.ArrayType.Index] = Indices.ToArray();
        var m = new ArrayMesh();
        m.AddSurfaceFromArrays(Mesh.PrimitiveType.Triangles, arrays);
        return m;
    }

    public static StandardMaterial3D Materiau(float rugosite = 0.85f, bool doubleFace = false, float alpha = 1f)
    {
        var m = new StandardMaterial3D
        {
            VertexColorUseAsAlbedo = true,
            VertexColorIsSrgb = true,
            Roughness = rugosite,
            CullMode = doubleFace ? BaseMaterial3D.CullModeEnum.Disabled : BaseMaterial3D.CullModeEnum.Back,
        };
        if (alpha < 1)
        {
            m.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
            m.AlbedoColor = new Color(1, 1, 1, alpha);
            m.ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded;
        }
        return m;
    }
}
