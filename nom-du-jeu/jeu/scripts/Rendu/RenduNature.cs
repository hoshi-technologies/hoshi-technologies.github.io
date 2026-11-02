using Godot;
using Ville.Coeur;

namespace Jeu.Rendu;

/// <summary>
/// Arbres (vrais arbres isolés + bois, d'après OpenStreetMap/Overture) et mobilier urbain réel
/// (lampadaires, bancs). Regroupés par carrés de 1 km. Un arbre disparaît quand on construit à sa place ;
/// un lampadaire réel n'apparaît que s'il y a une rue à côté.
/// </summary>
public partial class RenduNature : Node3D
{
    private const double Carre = 1000;
    private Partie _p = null!;
    private readonly Dictionary<(int, int), Node3D> _carres = new();
    private readonly Dictionary<(int, int), List<(V2 pos, byte genre, float taille)>> _arbres = new();
    private readonly Dictionary<(int, int), List<(V2 pos, string type)>> _mobilier = new();
    private Mesh _feuillu = null!, _conifere = null!, _lampadaire = null!, _banc = null!;
    private readonly HashSet<(int, int)> _aFaire = new();

    private static (int, int) Cle(V2 p) => ((int)Math.Floor(p.X / Carre), (int)Math.Floor(p.Y / Carre));

    public void Initialiser(Partie p)
    {
        _p = p;
        foreach (var c in GetChildren()) c.QueueFree();
        _carres.Clear(); _arbres.Clear(); _mobilier.Clear();
        _feuillu = Modeles.Arbre(false); _conifere = Modeles.Arbre(true);
        _lampadaire = Modeles.Lampadaire(); _banc = Modeles.Banc();
        var rnd = new Random(42);
        void Arbre(V2 q, byte genre)
        {
            var k = Cle(q);
            if (!_arbres.TryGetValue(k, out var l)) _arbres[k] = l = new();
            l.Add((q, genre, 6f + (float)rnd.NextDouble() * 7f));
        }
        foreach (var a in p.Paquet.Nature.Arbres) Arbre(new V2(a[0], a[1]), (byte)(rnd.NextDouble() < 0.8 ? 0 : 1));
        // bois : un arbre tous les ~350 m², placé de façon stable
        foreach (var b in p.Paquet.Nature.Bois)
        {
            var poly = b.Contour.Select(c => new V2(c[0], c[1])).ToList();
            double minX = poly.Min(c => c.X), maxX = poly.Max(c => c.X), minY = poly.Min(c => c.Y), maxY = poly.Max(c => c.Y);
            for (double x = minX; x < maxX; x += 19)
                for (double y = minY; y < maxY; y += 19)
                {
                    var q = new V2(x + rnd.NextDouble() * 12 - 6, y + rnd.NextDouble() * 12 - 6);
                    if (Geo.DansPolygone(q, poly)) Arbre(q, (byte)(b.Classe == "forest" && rnd.NextDouble() < 0.5 ? 1 : 0));
                }
        }
        foreach (var m in p.Paquet.Mobilier)
        {
            if (m.Type is not ("lampadaire" or "banc")) continue;
            var k = Cle(new V2(m.X, m.Y));
            if (!_mobilier.TryGetValue(k, out var l)) _mobilier[k] = l = new();
            l.Add((new V2(m.X, m.Y), m.Type));
        }
        foreach (var k in _arbres.Keys.Concat(_mobilier.Keys).Distinct()) _aFaire.Add(k);
    }

    /// <summary>Signale qu'une zone (carré de 250 m de la simulation) a changé.</summary>
    public void Signaler((int, int) carre250)
    {
        var centre = new V2((carre250.Item1 + 0.5) * Partie.TailleCarre, (carre250.Item2 + 0.5) * Partie.TailleCarre);
        _aFaire.Add(Cle(centre));
    }

    public override void _Process(double delta)
    {
        if (_p == null || _aFaire.Count == 0) return;
        // quelques carrés par image, pour rester fluide
        foreach (var k in _aFaire.Take(4).ToList()) { _aFaire.Remove(k); Reconstruire(k); }
    }

    private bool Libre(V2 q)
    {
        var (i, j) = _p.Grille.Cellule(q);
        if (!_p.Grille.DansCarte(i, j) || _p.Grille.Eau(i, j) || _p.Grille.Route(i, j)) return false;
        int id = _p.Grille.Parcelle(i, j);
        if (id < 0) return true;
        return _p.Parcelles.TryGetValue(id, out var par) && par.Batiment == null && par.Service is null or "parc" && par.Zone == Zone.Aucune && par.Contour == null;
    }

    private bool RueProche(V2 q)
    {
        var (i, j) = _p.Grille.Cellule(q);
        for (int dj = -3; dj <= 3; dj++)
            for (int di = -3; di <= 3; di++)
                if (_p.Grille.DansCarte(i + di, j + dj) && _p.Grille.Route(i + di, j + dj)) return true;
        return false;
    }

    private void Reconstruire((int, int) k)
    {
        if (_carres.Remove(k, out var ancien)) ancien.QueueFree();
        var noeud = new Node3D();
        var groupes = new Dictionary<Mesh, List<Transform3D>>();
        void Ajouter(Mesh m, Transform3D t)
        {
            if (!groupes.TryGetValue(m, out var l)) groupes[m] = l = new();
            l.Add(t);
        }
        if (_arbres.TryGetValue(k, out var arbres))
            foreach (var (pos, genre, taille) in arbres)
            {
                if (!Libre(pos)) continue;
                var basis = new Basis(Vector3.Up, (float)(pos.X * 0.37 + pos.Y * 0.11)).Scaled(new Vector3(taille, taille, taille));
                Ajouter(genre == 0 ? _feuillu : _conifere, new Transform3D(basis, RenduVille.G(_p, pos, -0.2)));
            }
        if (_mobilier.TryGetValue(k, out var mob))
            foreach (var (pos, type) in mob)
            {
                if (!RueProche(pos)) continue;
                var basis = new Basis(Vector3.Up, (float)(pos.X * 0.91 + pos.Y * 0.53));
                Ajouter(type == "lampadaire" ? _lampadaire : _banc, new Transform3D(basis, RenduVille.G(_p, pos, 0.2)));
            }
        foreach (var (mesh, liste) in groupes)
        {
            var mm = new MultiMesh { TransformFormat = MultiMesh.TransformFormatEnum.Transform3D, Mesh = mesh, InstanceCount = liste.Count };
            for (int i = 0; i < liste.Count; i++) mm.SetInstanceTransform(i, liste[i]);
            noeud.AddChild(new MultiMeshInstance3D
            {
                Multimesh = mm,
                CastShadow = mesh == _lampadaire || mesh == _banc ? GeometryInstance3D.ShadowCastingSetting.Off : GeometryInstance3D.ShadowCastingSetting.On,
            });
        }
        AddChild(noeud);
        _carres[k] = noeud;
    }
}
