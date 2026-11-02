using Godot;
using Ville.Coeur;
using Ville.Trafic;

namespace Jeu.Rendu;

/// <summary>Voitures des trajets domicile-travail et bus de la ligne, animés en temps réel.</summary>
public partial class RenduTrafic : Node3D
{
    private Partie _p = null!;
    private SimTrafic? _sim;
    private MultiMesh _voitures = null!, _bus = null!;
    private float[] _tampon = Array.Empty<float>();
    private int _versionReseau = -1, _mois = -1, _popPrecedente = -1;
    private double _distanceBus;
    public float Vitesse { get; set; } = 1;
    public int MaxVoitures { get; set; } = 2500;

    private static readonly Color[] Teintes =
    {
        new(0.85f, 0.20f, 0.18f), new(0.20f, 0.35f, 0.75f), new(0.92f, 0.92f, 0.90f), new(0.15f, 0.15f, 0.17f),
        new(0.60f, 0.62f, 0.65f), new(0.95f, 0.75f, 0.20f), new(0.25f, 0.55f, 0.35f),
    };

    public void Initialiser(Partie p)
    {
        _p = p;
        foreach (var c in GetChildren()) c.QueueFree();
        var mat = new StandardMaterial3D { VertexColorUseAsAlbedo = true, Roughness = 0.35f };
        _voitures = new MultiMesh { TransformFormat = MultiMesh.TransformFormatEnum.Transform3D, UseColors = true, Mesh = new BoxMesh { Size = new Vector3(1.9f, 1.4f, 4.3f), Material = mat } };
        _bus = new MultiMesh
        {
            TransformFormat = MultiMesh.TransformFormatEnum.Transform3D,
            Mesh = new BoxMesh { Size = new Vector3(2.5f, 3.0f, 11f), Material = new StandardMaterial3D { AlbedoColor = new Color(0.15f, 0.45f, 0.85f) } },
        };
        AddChild(new MultiMeshInstance3D { Multimesh = _voitures, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off });
        AddChild(new MultiMeshInstance3D { Multimesh = _bus });
        _sim = null;
        _versionReseau = _mois = -1;
    }

    public override void _Process(double delta)
    {
        if (_p == null) return;
        if (_versionReseau != _p.Reseau.Version || _mois != _p.Mois || Math.Abs(_p.Population - _popPrecedente) > Math.Max(200, _popPrecedente / 5))
            Reconstruire();
        float dt = (float)delta * Vitesse;
        if (_sim != null && _sim.NbVehicules > 0 && dt > 0)
        {
            _sim.Pas(dt);
            for (int i = 0; i < _sim.NbVehicules; i++)
            {
                var (x, y, cap) = _sim.Position(i);
                int o = i * 16;
                if (double.IsNaN(x)) { Array.Clear(_tampon, o, 12); continue; }
                // roulage à droite : décalage de 2 m vers la droite du sens de marche
                double dx = Math.Sin(cap) * 2, dy = -Math.Cos(cap) * 2;
                float z = _p.Paquet.Altitude(x + dx, y + dy) + 1.0f;
                float c = (float)Math.Cos(cap), s = (float)Math.Sin(cap);
                _tampon[o + 0] = -s; _tampon[o + 1] = 0; _tampon[o + 2] = c; _tampon[o + 3] = (float)(x + dx);
                _tampon[o + 4] = 0; _tampon[o + 5] = 1; _tampon[o + 6] = 0; _tampon[o + 7] = z;
                _tampon[o + 8] = -c; _tampon[o + 9] = 0; _tampon[o + 10] = -s; _tampon[o + 11] = (float)-(y + dy);
            }
            _voitures.Buffer = _tampon;
        }
        AnimerBus(dt);
    }

    private void Reconstruire()
    {
        _versionReseau = _p.Reseau.Version;
        _mois = _p.Mois;
        _popPrecedente = _p.Population;
        int n = Math.Min(MaxVoitures, _p.Population / 4);
        var paires = n > 0 ? _p.Deplacements(n) : new List<(int, int)>();
        _sim = paires.Count > 0 ? new SimTrafic(_p.Reseau.Graphe(_p.R), paires, (ulong)_p.Jour) : null;
        int nb = _sim?.NbVehicules ?? 0;
        _voitures.InstanceCount = nb;
        _tampon = new float[nb * 16]; // 12 nombres pour la position/rotation + 4 pour la couleur
        for (int i = 0; i < nb; i++)
        {
            var c = Teintes[(i * 7 + 3) % Teintes.Length];
            _tampon[i * 16 + 12] = c.R; _tampon[i * 16 + 13] = c.G; _tampon[i * 16 + 14] = c.B; _tampon[i * 16 + 15] = 1;
        }
    }

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
                    _bus.SetInstanceTransform(b, new Transform3D(basis, RenduVille.G(_p, p, 1.8)));
                    break;
                }
                acc += seg;
            }
        }
    }
}
