using Godot;

namespace Jeu.Rendu;

/// <summary>
/// Modèles 3D fabriqués par le code du jeu (aucun fichier externe, aucune licence tierce) :
/// véhicules, bateaux, piétons, arbres, mobilier urbain. Style « maquette » cohérent avec les bâtiments.
/// Repère local : X = largeur, Y = hauteur, Z = longueur (avant vers +Z), posé au sol en y = 0.
/// Les parties blanches prennent la couleur de chaque exemplaire (couleur d'instance).
/// </summary>
public static class Modeles
{
    private static readonly Color Blanc = new(1, 1, 1);
    private static ShaderMaterial? _objets;
    /// <summary>Matériau commun : couleurs par sommet et par exemplaire, phares et lampes lumineux la nuit.</summary>
    public static ShaderMaterial Objets => _objets ??= new ShaderMaterial { Shader = GD.Load<Shader>("res://shaders/objets.gdshader") };
    private static readonly Color Vitre = new(0.12f, 0.16f, 0.22f);
    private static readonly Color Pneu = new(0.08f, 0.08f, 0.09f);

    private static ArrayMesh Fin(Maillage m, Material? mat = null)
    {
        var mesh = m.VersMesh()!;
        mesh.SurfaceSetMaterial(0, mat ?? Objets);
        return mesh;
    }

    private static void Roues(Maillage m, float demiLargeur, float avant, float arriere, float r = 0.34f)
    {
        foreach (var z in new[] { avant, arriere })
            foreach (var x in new[] { -demiLargeur, demiLargeur })
                m.Boite(new Vector3(x, 0, z), Vector3.Right, 0.13f, r, 0, r * 2, Pneu);
    }

    public static ArrayMesh Voiture()
    {
        var m = new Maillage();
        m.Boite(Vector3.Zero, Vector3.Right, 0.88f, 2.1f, 0.28f, 0.95f, Blanc);                         // caisse
        m.Boite(new Vector3(0, 0, -0.25f), Vector3.Right, 0.78f, 1.05f, 0.95f, 1.45f, Vitre, Blanc);   // habitacle vitré, toit coloré
        m.Boite(new Vector3(0, 0, 2.08f), Vector3.Right, 0.7f, 0.04f, 0.55f, 0.72f, new Color(1, 0.95f, 0.75f)); // phares
        Roues(m, 0.86f, 1.3f, -1.3f);
        return Fin(m);
    }

    public static ArrayMesh Camionnette()
    {
        var m = new Maillage();
        m.Boite(new Vector3(0, 0, -0.4f), Vector3.Right, 0.95f, 1.9f, 0.3f, 2.3f, Blanc);
        m.Boite(new Vector3(0, 0, 1.85f), Vector3.Right, 0.92f, 0.55f, 0.3f, 1.25f, Blanc);
        m.Boite(new Vector3(0, 0, 1.6f), Vector3.Right, 0.9f, 0.35f, 1.25f, 1.95f, Vitre);
        Roues(m, 0.93f, 1.6f, -1.6f, 0.38f);
        return Fin(m);
    }

    public static ArrayMesh Camion()
    {
        var m = new Maillage();
        m.Boite(new Vector3(0, 0, 2.6f), Vector3.Right, 1.15f, 0.95f, 0.5f, 2.9f, new Color(0.85f, 0.85f, 0.88f));
        m.Boite(new Vector3(0, 0, 3.0f), Vector3.Right, 1.1f, 0.5f, 1.8f, 2.6f, Vitre);
        m.Boite(new Vector3(0, 0, -1.2f), Vector3.Right, 1.25f, 2.7f, 0.9f, 3.6f, Blanc);
        Roues(m, 1.1f, 2.6f, -2.6f, 0.48f);
        return Fin(m);
    }

    public static ArrayMesh Bus()
    {
        var m = new Maillage();
        var bleu = new Color(0.15f, 0.45f, 0.85f);
        m.Boite(Vector3.Zero, Vector3.Right, 1.25f, 5.6f, 0.4f, 1.4f, bleu);
        m.Boite(Vector3.Zero, Vector3.Right, 1.24f, 5.55f, 1.4f, 2.6f, Vitre);
        m.Boite(Vector3.Zero, Vector3.Right, 1.25f, 5.6f, 2.6f, 3.1f, new Color(0.95f, 0.96f, 0.97f), new Color(0.85f, 0.86f, 0.88f));
        Roues(m, 1.2f, 3.8f, -3.6f, 0.5f);
        return Fin(m);
    }

    /// <summary>Coque de bateau : plus étroite à l'avant et au fond.</summary>
    private static void Coque(Maillage m, float demiL, float longueur, float h, Color coque, Color pont)
    {
        float z0 = -longueur / 2, z1 = longueur / 2, zp = z1 + longueur * 0.18f;
        var a = new Vector3(-demiL, h, z0); var b = new Vector3(demiL, h, z0); var c = new Vector3(demiL, h, z1); var d = new Vector3(-demiL, h, z1);
        var proue = new Vector3(0, h, zp);
        var fa = new Vector3(-demiL * 0.6f, 0, z0); var fb = new Vector3(demiL * 0.6f, 0, z0);
        var fc = new Vector3(demiL * 0.5f, 0, z1); var fd = new Vector3(-demiL * 0.5f, 0, z1);
        var fp = new Vector3(0, 0.1f, zp - 0.3f);
        m.Quad(a, b, c, d, Vector3.Up, pont);
        m.Triangle(d, c, proue, Vector3.Up, pont);
        m.Quad(b, fb, fc, c, Vector3.Right, coque);
        m.Quad(fa, a, d, fd, Vector3.Left, coque);
        m.Quad(a, fa, fb, b, Vector3.Back, coque);
        m.Quad(c, fc, fp, proue, (Vector3.Right + Vector3.Forward * -1).Normalized(), coque);
        m.Quad(fd, d, proue, fp, (Vector3.Left + Vector3.Forward * -1).Normalized(), coque);
        m.Quad(fa, fd, fc, fb, Vector3.Down, coque.Darkened(0.3f));
    }

    public static ArrayMesh Vedette()
    {
        var m = new Maillage();
        Coque(m, 1.2f, 5.5f, 0.9f, Blanc, new Color(0.75f, 0.62f, 0.45f));
        m.Boite(new Vector3(0, 0, -0.4f), Vector3.Right, 0.9f, 1.2f, 0.9f, 1.9f, new Color(0.95f, 0.95f, 0.95f), Vitre);
        return Fin(m);
    }

    public static ArrayMesh Voilier()
    {
        var m = new Maillage();
        Coque(m, 1.0f, 5f, 0.7f, Blanc, new Color(0.75f, 0.62f, 0.45f));
        m.Boite(new Vector3(0, 0, 0.6f), Vector3.Right, 0.07f, 0.07f, 0.7f, 8.5f, new Color(0.85f, 0.85f, 0.85f)); // mât
        var voile = new Color(0.98f, 0.97f, 0.93f);
        var p0 = new Vector3(0, 1.4f, 0.55f); var p1 = new Vector3(0, 8.3f, 0.55f); var p2 = new Vector3(0, 1.4f, -2.3f);
        m.Triangle(p0, p1, p2, Vector3.Right, voile);
        m.Triangle(p0, p2, p1, Vector3.Left, voile);
        return Fin(m);
    }

    public static ArrayMesh Pieton()
    {
        var m = new Maillage();
        var jambes = new Color(0.22f, 0.24f, 0.30f);
        m.Boite(new Vector3(-0.1f, 0, 0), Vector3.Right, 0.08f, 0.1f, 0, 0.85f, jambes);
        m.Boite(new Vector3(0.1f, 0, 0), Vector3.Right, 0.08f, 0.1f, 0, 0.85f, jambes);
        m.Boite(Vector3.Zero, Vector3.Right, 0.22f, 0.13f, 0.85f, 1.45f, Blanc);                     // haut (couleur d'instance)
        m.Boite(Vector3.Zero, Vector3.Right, 0.11f, 0.11f, 1.5f, 1.74f, new Color(0.93f, 0.80f, 0.68f)); // tête
        return Fin(m);
    }

    public static ArrayMesh Arbre(bool conifere)
    {
        var m = new Maillage();
        var feuillage = conifere ? new Color(0.20f, 0.40f, 0.26f) : new Color(0.33f, 0.55f, 0.27f);
        m.Arbre(Vector3.Zero, conifere ? 1f : 0.85f, feuillage);
        if (!conifere) m.Arbre(new Vector3(0, 0.25f, 0), 0.7f, feuillage.Lightened(0.08f));
        var mat = new ShaderMaterial { Shader = GD.Load<Shader>("res://shaders/arbres.gdshader") };
        mat.SetShaderParameter("persistant", conifere);
        return Fin(m, mat);
    }

    public static ArrayMesh Lampadaire()
    {
        var m = new Maillage();
        var metal = new Color(0.25f, 0.27f, 0.30f);
        m.Boite(Vector3.Zero, Vector3.Right, 0.07f, 0.07f, 0, 5.5f, metal);
        m.Boite(new Vector3(0, 0, 0.6f), Vector3.Right, 0.06f, 0.6f, 5.4f, 5.55f, metal);
        m.Boite(new Vector3(0, 0, 1.1f), Vector3.Right, 0.2f, 0.25f, 5.2f, 5.4f, new Color(1f, 0.92f, 0.7f));
        return Fin(m);
    }

    public static ArrayMesh Banc()
    {
        var m = new Maillage();
        var bois = new Color(0.55f, 0.38f, 0.22f);
        m.Boite(Vector3.Zero, Vector3.Right, 0.9f, 0.22f, 0.42f, 0.5f, bois);
        m.Boite(new Vector3(0, 0, -0.2f), Vector3.Right, 0.9f, 0.04f, 0.5f, 0.9f, bois);
        m.Boite(new Vector3(-0.8f, 0, 0), Vector3.Right, 0.04f, 0.2f, 0, 0.42f, new Color(0.2f, 0.2f, 0.22f));
        m.Boite(new Vector3(0.8f, 0, 0), Vector3.Right, 0.04f, 0.2f, 0, 0.42f, new Color(0.2f, 0.2f, 0.22f));
        return Fin(m);
    }
}
