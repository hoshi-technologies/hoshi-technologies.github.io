using Godot;

namespace Jeu.Jeu;

/// <summary>
/// Météo et saisons (purement visuelles) : beau temps, nuageux, pluie, neige.
/// Le temps change tous les quelques jours de jeu, avec des probabilités qui dépendent du mois
/// (climat de type Annecy : pluie fréquente, neige l'hiver, orages l'été non simulés).
/// Pilote les paramètres globaux des shaders (saison, pluie, altitude de la neige) et les particules.
/// </summary>
public partial class Meteo : Node3D
{
    public enum Temps { Beau, Nuageux, Pluie, Neige }
    public Temps Actuel { get; private set; } = Temps.Beau;
    public float Intensite { get; private set; }          // 0 → 1, transition douce
    public string NomSaison { get; private set; } = "";
    private Temps _cible = Temps.Beau;
    private int _jourChangement = -1;
    private GpuParticles3D _pluie = null!, _neige = null!;
    private readonly Random _rnd = new(2027);

    // probabilités (pluie, neige, nuageux) par mois, janvier = 0
    private static readonly (double pluie, double neige, double nuages)[] Climat =
    {
        (0.10, 0.25, 0.35), (0.10, 0.20, 0.35), (0.20, 0.08, 0.30), (0.28, 0.02, 0.30), (0.30, 0, 0.25), (0.22, 0, 0.20),
        (0.18, 0, 0.15), (0.20, 0, 0.18), (0.22, 0, 0.25), (0.28, 0, 0.30), (0.28, 0.06, 0.35), (0.15, 0.22, 0.38),
    };

    public override void _Ready()
    {
        _pluie = Particules(new Vector3(0, -35, 0), new QuadMesh { Size = new Vector2(0.04f, 0.9f) }, new Color(0.7f, 0.75f, 0.85f, 0.55f), 9000);
        _neige = Particules(new Vector3(0, -2.5f, 0), new QuadMesh { Size = new Vector2(0.07f, 0.07f) }, new Color(1, 1, 1, 0.9f), 7000);
        AddChild(_pluie);
        AddChild(_neige);
    }

    private static GpuParticles3D Particules(Vector3 gravite, QuadMesh forme, Color couleur, int nombre)
    {
        var proc = new ParticleProcessMaterial
        {
            EmissionShape = ParticleProcessMaterial.EmissionShapeEnum.Box,
            EmissionBoxExtents = new Vector3(120, 2, 120),
            Gravity = gravite,
            InitialVelocityMin = 0, InitialVelocityMax = 2,
            Direction = new Vector3(0.2f, -1, 0),
        };
        forme.Material = new StandardMaterial3D
        {
            AlbedoColor = couleur, ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
            Transparency = BaseMaterial3D.TransparencyEnum.Alpha, BillboardMode = BaseMaterial3D.BillboardModeEnum.FixedY,
        };
        return new GpuParticles3D
        {
            Amount = nombre, Lifetime = gravite.Y < -10 ? 2.2 : 14, ProcessMaterial = proc, DrawPass1 = forme,
            Emitting = false, VisibilityAabb = new Aabb(new Vector3(-150, -200, -150), new Vector3(300, 220, 300)),
        };
    }

    /// <summary>Met à jour la météo. jour = jour de jeu, mois = 0..11, fraction = avancement dans le mois.</summary>
    /// <summary>Pour les captures d'écran et les tests : impose un mois et un temps.</summary>
    public int? MoisForce;
    public Temps? TempsForce;

    public void MettreAJour(double delta, int jour, int mois, double fraction, Vector3 camera, float altitudeSol, Godot.Environment env, ProceduralSkyMaterial ciel)
    {
        if (MoisForce is { } mf) mois = mf;
        if (TempsForce is { } tf) { _cible = tf; Actuel = tf; Intensite = 1; _jourChangement = int.MaxValue; }
        if (jour >= _jourChangement)
        {
            var (p, n, c) = Climat[mois % 12];
            double r = _rnd.NextDouble();
            _cible = r < n ? Temps.Neige : r < n + p ? Temps.Pluie : r < n + p + c ? Temps.Nuageux : Temps.Beau;
            _jourChangement = jour + 2 + _rnd.Next(4);
        }
        if (_cible != Actuel)
        {
            Intensite = Math.Max(0, Intensite - (float)delta * 0.5f);
            if (Intensite <= 0) Actuel = _cible;
        }
        else Intensite = Math.Min(1, Intensite + (float)delta * 0.3f);

        float saison = (float)((mois % 12 + fraction) / 12.0);
        RenderingServer.GlobalShaderParameterSet("saison", saison);
        bool pluie = Actuel == Temps.Pluie, neige = Actuel == Temps.Neige;
        RenderingServer.GlobalShaderParameterSet("pluie", pluie ? Intensite : 0f);
        // la neige tient en altitude l'hiver, et descend jusqu'à la ville quand il neige
        float hiver = Mathf.Clamp(1f - Mathf.Min(saison, 1f - saison) * 5f, 0f, 1f);
        float neigeAlt = Mathf.Lerp(5000f, 1000f, hiver);
        if (neige) neigeAlt = Mathf.Lerp(neigeAlt, altitudeSol - 50f, Intensite);
        RenderingServer.GlobalShaderParameterSet("neige_altitude", neigeAlt);

        _pluie.Emitting = pluie && Intensite > 0.2f;
        _neige.Emitting = neige && Intensite > 0.2f;
        _pluie.GlobalPosition = camera + new Vector3(0, 60, 0);
        _neige.GlobalPosition = camera + new Vector3(0, 40, 0);

        float couvert = Actuel switch { Temps.Nuageux => 0.5f, Temps.Pluie => 0.85f, Temps.Neige => 0.75f, _ => 0f } * Intensite;
        ciel.SkyTopColor = new Color(0.38f, 0.55f, 0.85f).Lerp(new Color(0.55f, 0.58f, 0.62f), couvert);
        ciel.SkyHorizonColor = new Color(0.70f, 0.78f, 0.88f).Lerp(new Color(0.72f, 0.73f, 0.75f), couvert);
        env.FogDensity = 0.00005f + couvert * 0.00035f;
        CouvertureNuageuse = couvert;
        NomSaison = mois switch { 11 or 0 or 1 => "Hiver", 2 or 3 or 4 => "Printemps", 5 or 6 or 7 => "Été", _ => "Automne" };
    }

    public float CouvertureNuageuse { get; private set; }

    public string Description => Actuel switch
    {
        Temps.Beau => "Beau temps", Temps.Nuageux => "Nuageux", Temps.Pluie => "Pluie", _ => "Neige",
    };
}
