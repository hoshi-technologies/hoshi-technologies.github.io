using System.Diagnostics;
using System.Text.Json;
using Godot;
using Jeu.Rendu;
using Ville.Donnees;
using Ville.Reseau;
using Ville.Trafic;

namespace Jeu.Banc;

/// <summary>
/// Banc d'essai d'affichage (lot 4) : vraie ville d'Annecy en 3D + 10 000 véhicules simulés.
/// Mesure le temps de chargement, puis les images par seconde (FPS) dans 3 vues de 10 s :
/// vue aérienne, vue de quartier, vue à hauteur d'habitant.
/// Options : --vehicules=N  --paquet=chemin  --capture (enregistre une image de chaque vue)
/// </summary>
public partial class BancAffichage : Node3D
{
    private readonly Dictionary<string, object> _res = new();
    private PaquetVille _paquet = null!;
    private SimTrafic? _sim;
    private MultiMesh? _vehicules;
    private float[] _tampon = Array.Empty<float>();
    private Camera3D _camera = null!;
    private int _vue = -1;
    private double _tempsVue;
    private readonly List<double> _fps = new();
    private bool _capture;
    private string _dossierSortie = "";

    private (string nom, Vector3 pos, Vector3 cible)[] Vues =
    {
        ("aerienne", new Vector3(1700, 1500, 1800), new Vector3(-200, 450, -100)),
        ("quartier", new Vector3(250, 640, 500), new Vector3(-350, 450, -150)),
        ("habitant", Vector3.Zero, Vector3.Zero), // calculée sur une vraie rue au chargement
    };

    /// <summary>Place la vue « habitant » à 1,7 m du sol, au milieu d'une vraie rue proche du centre.</summary>
    private void PreparerVueHabitant()
    {
        var rue = _paquet.Routes.Troncons
            .Where(t => t.Gabarit is "rue" or "avenue" && !t.Pont && !t.Tunnel && t.LongueurM > 80)
            .OrderBy(t => Math.Abs(t.Trace[0][0] + 300) + Math.Abs(t.Trace[0][1] - 100))
            .First();
        double[] a = rue.Trace[0], b = rue.Trace[^1];
        double dx = b[0] - a[0], dy = b[1] - a[1], l = Math.Sqrt(dx * dx + dy * dy);
        double px = a[0] + dx / l * 5, py = a[1] + dy / l * 5;
        Vues[2].pos = ConstructeurVille.VersGodot(px, py, _paquet.Altitude(px, py) + 2.0);
        Vues[2].cible = ConstructeurVille.VersGodot(px + dx / l * 60, py + dy / l * 60, _paquet.Altitude(px, py) + 3.0);
        _res["vue_habitant_rue"] = rue.Nom ?? "(sans nom)";
    }

    public override void _Ready()
    {
        var args = OS.GetCmdlineUserArgs();
        int nbVehicules = 10_000;
        // version exportée : dossier « villes » à côté du .exe ; dans l'éditeur : dossier donnees/ du projet
        string paquet = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(OS.GetExecutablePath()) ?? ".", "villes", "fr-annecy_quartier_v1");
        if (!System.IO.Directory.Exists(paquet))
            paquet = ProjectSettings.GlobalizePath("res://") + "../donnees/villes/fr-annecy_quartier_v1";
        foreach (var a in args)
        {
            if (a.StartsWith("--vehicules=")) nbVehicules = int.Parse(a["--vehicules=".Length..]);
            if (a.StartsWith("--paquet=")) paquet = a["--paquet=".Length..];
            if (a == "--capture") _capture = true;
        }
        _dossierSortie = OS.HasFeature("editor") ? ProjectSettings.GlobalizePath("user://")
            : System.IO.Path.GetDirectoryName(OS.GetExecutablePath()) ?? ProjectSettings.GlobalizePath("user://");
        bool sansEcran = DisplayServer.GetName() == "headless";
        _res["mode"] = sansEcran ? "sans affichage (headless)" : "affichage";
        _res["vehicules"] = nbVehicules;

        var sw = Stopwatch.StartNew();
        _paquet = PaquetVille.Charger(paquet);
        _res["chargement_paquet_ms"] = Math.Round(sw.Elapsed.TotalMilliseconds);

        sw.Restart();
        var constructeur = new ConstructeurVille(_paquet);
        AddChild(constructeur.Construire());
        _res["construction_3d_ms"] = Math.Round(sw.Elapsed.TotalMilliseconds);
        foreach (var (k, v) in constructeur.Mesures) _res[k] = v;

        sw.Restart();
        var graphe = ConstructionGraphe.Voitures(_paquet.Routes);
        _sim = new SimTrafic(graphe, nbVehicules, 12345);
        _res["trajets_ms"] = Math.Round(sw.Elapsed.TotalMilliseconds);
        _res["trajets_impossibles"] = _sim.TrajetsImpossibles;

        AjouterVehicules(nbVehicules);
        AjouterAmbiance();
        PreparerVueHabitant();
        _camera = new Camera3D { Far = 12000, Near = 0.5f, Fov = 60 };
        AddChild(_camera);
        ChangerVue(0);

        if (sansEcran)
        {
            // pas de carte graphique : on mesure seulement la simulation + mise à jour des véhicules
            sw.Restart();
            for (int i = 0; i < 100; i++) MettreAJour(1f / 60);
            _res["pas_sim_et_vehicules_ms"] = Math.Round(sw.Elapsed.TotalMilliseconds / 100, 3);
            Terminer();
        }
    }

    private void AjouterVehicules(int n)
    {
        var boite = new BoxMesh { Size = new Vector3(2.0f, 1.5f, 4.4f) };
        var mat = new StandardMaterial3D { AlbedoColor = new Color(0.85f, 0.25f, 0.20f), Roughness = 0.4f };
        boite.Material = mat;
        _vehicules = new MultiMesh
        {
            TransformFormat = MultiMesh.TransformFormatEnum.Transform3D,
            UseColors = false,
            Mesh = boite,
            InstanceCount = n,
        };
        _tampon = new float[n * 12];
        AddChild(new MultiMeshInstance3D { Name = "Vehicules", Multimesh = _vehicules });
    }

    private void AjouterAmbiance()
    {
        var env = new Godot.Environment
        {
            BackgroundMode = Godot.Environment.BGMode.Sky,
            Sky = new Sky { SkyMaterial = new ProceduralSkyMaterial() },
            TonemapMode = Godot.Environment.ToneMapper.Filmic,
            SsaoEnabled = true,
            FogEnabled = true,
            FogDensity = 0.00004f,
            FogLightColor = new Color(0.75f, 0.82f, 0.92f),
        };
        AddChild(new WorldEnvironment { Environment = env });
        AddChild(new DirectionalLight3D
        {
            RotationDegrees = new Vector3(-42, -35, 0),
            ShadowEnabled = true,
            LightEnergy = 1.1f,
            DirectionalShadowMaxDistance = 3000,
        });
    }

    private void ChangerVue(int v)
    {
        _vue = v;
        _tempsVue = 0;
        _fps.Clear();
        _camera.Position = Vues[v].pos;
        _camera.LookAt(Vues[v].cible, Vector3.Up);
    }

    private void MettreAJour(double dt)
    {
        if (_sim == null || _vehicules == null) return;
        _sim.Pas((float)dt);
        for (int i = 0; i < _sim.NbVehicules; i++)
        {
            var (x, y, cap) = _sim.Position(i);
            int o = i * 12;
            if (double.IsNaN(x)) { Array.Clear(_tampon, o, 12); continue; }
            float z = _paquet.Altitude(x, y) + 1.1f;
            // matrice de rotation autour de l'axe vertical (cap) + position, format Transform3D en lignes
            float c = (float)Math.Cos(cap), s = (float)Math.Sin(cap);
            // l'axe Z du véhicule (sa longueur) suit la direction (dx, -dy) dans Godot
            _tampon[o + 0] = -s; _tampon[o + 1] = 0; _tampon[o + 2] = c; _tampon[o + 3] = (float)x;
            _tampon[o + 4] = 0; _tampon[o + 5] = 1; _tampon[o + 6] = 0; _tampon[o + 7] = z;
            _tampon[o + 8] = -c; _tampon[o + 9] = 0; _tampon[o + 10] = -s; _tampon[o + 11] = (float)-y;
        }
        _vehicules.Buffer = _tampon;
    }

    public override void _Process(double delta)
    {
        if (_vue < 0 || DisplayServer.GetName() == "headless") return;
        MettreAJour(delta);
        _tempsVue += delta;
        if (_tempsVue > 2) _fps.Add(1.0 / Math.Max(delta, 1e-6));
        if (_tempsVue >= 10)
        {
            var tri = _fps.OrderBy(f => f).ToList();
            if (tri.Count > 0)
                _res[$"fps_{Vues[_vue].nom}"] = new
                {
                    mediane = Math.Round(tri[tri.Count / 2], 1),
                    pire_1pct = Math.Round(tri[(int)(tri.Count * 0.01)], 1),
                    images = tri.Count,
                };
            if (_capture)
                GetViewport().GetTexture().GetImage().SavePng(System.IO.Path.Combine(_dossierSortie, $"capture_{Vues[_vue].nom}.png"));
            if (_vue + 1 < Vues.Length) ChangerVue(_vue + 1);
            else Terminer();
        }
    }

    private void Terminer()
    {
        _res["carte_graphique"] = RenderingServer.GetVideoAdapterName();
        _res["pilote"] = RenderingServer.GetCurrentRenderingDriverName();
        _res["processeur"] = OS.GetProcessorName();
        _res["coeurs"] = OS.GetProcessorCount();
        _res["memoire_video_mo"] = Math.Round(Performance.GetMonitor(Performance.Monitor.RenderVideoMemUsed) / 1048576.0);
        _res["moteur"] = Engine.GetVersionInfo()["string"].AsString();
        var json = JsonSerializer.Serialize(_res, new JsonSerializerOptions { WriteIndented = true });
        GD.Print(json);
        var chemin = System.IO.Path.Combine(_dossierSortie, "resultats_affichage.json");
        System.IO.File.WriteAllText(chemin, json);
        GD.Print("Résultats écrits dans : ", chemin);
        GetTree().Quit();
    }
}
