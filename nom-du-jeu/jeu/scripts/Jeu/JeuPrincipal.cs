using Godot;
using Jeu.Interface;
using Jeu.Rendu;
using Ville.Coeur;
using Ville.Donnees;

namespace Jeu.Jeu;

/// <summary>
/// Scène principale du prototype : menu, partie, outils du maire, temps, sauvegardes.
/// Toute la logique de la ville est dans <see cref="Partie"/> (projet Ville.Simulation) ;
/// ici on ne fait que l'afficher et transmettre les clics.
/// </summary>
public partial class JeuPrincipal : Node3D
{
    private Reglages _reglages = null!;
    private PaquetVille _paquet = null!;
    private Partie? _partie;
    private CameraVille _camera = null!;
    private RenduVille _rendu = null!;
    private RenduTrafic _trafic = null!;
    private Hud _hud = null!;
    private Node3D? _fantome;
    private DirectionalLight3D _soleil = null!;
    private Godot.Environment _env = null!;
    private MeshInstance3D _apercu = null!;
    private ImmediateMesh _apercuMesh = new();
    private Control _menu = null!;

    private string _outil = "";
    private V2? _debutRoute;
    private bool _peinture;
    private int _vitesse = 1;
    private double _accumulateur;
    private double _heure = 10;     // heure de la journée (visuelle)
    private int _dernierMoisSauve;
    private string _dossierSauvegardes = "";
    private const double JoursParSeconde = 0.5;   // vitesse normale : 1 mois = 60 s
    private static readonly int[] Multiplicateurs = { 0, 1, 2, 4 };
    private string _optionAuto = "";

    private static string Racine()
    {
        // version exportée : à côté du .exe ; depuis l'éditeur : dossier parent du projet
        var exe = System.IO.Path.GetDirectoryName(OS.GetExecutablePath()) ?? ".";
        if (System.IO.Directory.Exists(System.IO.Path.Combine(exe, "donnees"))) return exe;
        return System.IO.Path.GetFullPath(System.IO.Path.Combine(ProjectSettings.GlobalizePath("res://"), ".."));
    }

    public override void _Ready()
    {
        var racine = Racine();
        _reglages = Reglages.Charger(System.IO.Path.Combine(racine, "donnees", "reglages", "prototype.json"));
        _paquet = PaquetVille.Charger(System.IO.Path.Combine(racine, "donnees", "villes", "fr-annecy_quartier_v1"));
        _dossierSauvegardes = ProjectSettings.GlobalizePath("user://sauvegardes");
        System.IO.Directory.CreateDirectory(_dossierSauvegardes);

        Ambiance();
        var decor = new ConstructeurVille(_paquet);
        AddChild(decor.ConstruireTerrain());
        AddChild(decor.ConstruireEau());

        _rendu = new RenduVille { Name = "RenduVille" };
        _trafic = new RenduTrafic { Name = "Trafic" };
        AddChild(_rendu);
        AddChild(_trafic);
        _apercu = new MeshInstance3D { Mesh = _apercuMesh, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off,
            MaterialOverride = new StandardMaterial3D { VertexColorUseAsAlbedo = true, ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded, Transparency = BaseMaterial3D.TransparencyEnum.Alpha, NoDepthTest = true } };
        AddChild(_apercu);

        _camera = new CameraVille { Demi = (float)_paquet.Manifest.Repere.DemiCoteM - 50, Altitude = (x, z) => _paquet.Altitude(x, -z) };
        AddChild(_camera);
        _camera.Cible = new Vector3(-700, 0, -390);
        _camera.Distance = 1100;

        var calque = new CanvasLayer();
        AddChild(calque);
        _hud = new Hud { Visible = false };
        calque.AddChild(_hud);
        _hud.OutilChoisi = ChoisirOutil;
        _hud.VitesseChoisie = v => _vitesse = v;
        _hud.CalqueBascule = BasculerFantome;
        _hud.Sauvegarder = () => Sauvegarder("rapide", true);
        _hud.VueSuivante = VueSuivante;
        _menu = Menu();
        calque.AddChild(_menu);

        foreach (var a in OS.GetCmdlineUserArgs())
            if (a.StartsWith("--auto=")) _optionAuto = a["--auto=".Length..];
        if (_optionAuto != "") CallDeferred(nameof(ModeAuto));
    }

    // ------------------------------------------------------------------ menu
    private Control Menu()
    {
        var fond = new ColorRect { Color = new Color(0.05f, 0.07f, 0.10f, 0.72f) };
        fond.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        var centre = new CenterContainer();
        centre.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        fond.AddChild(centre);
        var v = new VBoxContainer { CustomMinimumSize = new Vector2(620, 0) };
        v.AddThemeConstantOverride("separation", 12);
        centre.AddChild(v);
        var titre = new Label { Text = "[NOM DU JEU]", HorizontalAlignment = HorizontalAlignment.Center };
        titre.AddThemeFontSizeOverride("font_size", 44);
        v.AddChild(titre);
        v.AddChild(new Label { Text = "Prends les commandes de ta vraie ville.  —  Prototype de plaisir", HorizontalAlignment = HorizontalAlignment.Center });
        var q = _paquet.Manifest.Qualite;
        string Qv(string k) => q.TryGetProperty(k, out var e) ? e.ToString() : "?";
        var note = new Label
        {
            Text = $"\nVille : {_paquet.Manifest.Ville.Nom} (zone de {_paquet.Manifest.Ville.CoteKm} × {_paquet.Manifest.Ville.CoteKm} km) — mode Fondation\n" +
                   $"Qualité des données : {Qv("note_sur_100")}/100\n" +
                   $"  • {Qv("batiments")} bâtiments réels ({Qv("pct_batiments_osm")} % cartographiés à la main), hauteurs réelles : {Qv("pct_hauteur_reelle")} % (le reste est estimé)\n" +
                   $"  • relief Copernicus 30 m (sol estimé), {Qv("km_routes_carrossables")} km de routes réelles\n" +
                   "Vous partez de la vraie géographie et des grands axes réels. À vous de bâtir la ville.\n",
            AutowrapMode = TextServer.AutowrapMode.WordSmart,
        };
        v.AddChild(note);
        var nouvelle = new Button { Text = "Nouvelle partie", CustomMinimumSize = new Vector2(0, 44) };
        nouvelle.Pressed += () => Commencer(null);
        v.AddChild(nouvelle);
        var sable = new Button { Text = "Bac à sable (argent illimité, tout débloqué)", CustomMinimumSize = new Vector2(0, 36) };
        sable.Pressed += () => Commencer(null, bacASable: true);
        v.AddChild(sable);
        var auto = System.IO.Path.Combine(_dossierSauvegardes, "auto.json");
        var rapide = System.IO.Path.Combine(_dossierSauvegardes, "rapide.json");
        var derniere = new[] { auto, rapide }.Where(System.IO.File.Exists).OrderByDescending(System.IO.File.GetLastWriteTimeUtc).FirstOrDefault();
        if (derniere != null)
        {
            var cont = new Button { Text = "Continuer la dernière partie", CustomMinimumSize = new Vector2(0, 44) };
            cont.Pressed += () => Commencer(derniere);
            v.AddChild(cont);
        }
        var quitter = new Button { Text = "Quitter", CustomMinimumSize = new Vector2(0, 36) };
        quitter.Pressed += () => GetTree().Quit();
        v.AddChild(quitter);
        v.AddChild(new Label
        {
            Text = "\nFiction inspirée de données réelles, pas une prédiction.\nDonnées : © OpenStreetMap contributors, Overture Maps Foundation · Relief : Copernicus WorldDEM-30 © DLR/Airbus, ESA/UE",
            HorizontalAlignment = HorizontalAlignment.Center, AutowrapMode = TextServer.AutowrapMode.WordSmart,
        });
        return fond;
    }

    private void Commencer(string? sauvegarde, bool bacASable = false)
    {
        try
        {
            _partie = sauvegarde == null
                ? (bacASable ? Partie.NouveauBacASable(_reglages, _paquet, (ulong)DateTime.Now.Ticks) : Partie.NouvelleFondation(_reglages, _paquet, (ulong)DateTime.Now.Ticks))
                : Partie.Charger(System.IO.File.ReadAllText(sauvegarde), _reglages, _paquet);
        }
        catch (Exception ex)
        {
            GD.PrintErr(ex);
            _partie = Partie.NouvelleFondation(_reglages, _paquet, 1);
        }
        _rendu.Initialiser(_partie);
        _trafic.Initialiser(_partie);
        _hud.Attacher(_partie);
        _hud.Visible = true;
        _menu.Visible = false;
        _dernierMoisSauve = _partie.Mois;
        _vitesse = 1;
    }

    // ------------------------------------------------------------------ ambiance : jour, nuit
    private void Ambiance()
    {
        _env = new Godot.Environment
        {
            BackgroundMode = Godot.Environment.BGMode.Sky,
            Sky = new Sky { SkyMaterial = new ProceduralSkyMaterial() },
            TonemapMode = Godot.Environment.ToneMapper.Filmic,
            AmbientLightSource = Godot.Environment.AmbientSource.Sky,
            SsaoEnabled = true,
            FogEnabled = true,
            FogDensity = 0.00005f,
            GlowEnabled = true,
        };
        AddChild(new WorldEnvironment { Environment = _env });
        _soleil = new DirectionalLight3D { ShadowEnabled = true, DirectionalShadowMaxDistance = 1500, LightEnergy = 1.1f, ShadowBias = 0.08f, ShadowNormalBias = 2.5f };
        AddChild(_soleil);
    }

    private void MettreAJourCiel(double delta)
    {
        // une journée visuelle dure 4 minutes à vitesse normale ; la nuit reste lisible
        _heure = (_heure + delta * Multiplicateurs[_vitesse] * 24 / 240.0) % 24;
        double angle = (_heure - 6) / 12 * Math.PI; // 0 au lever, PI au coucher
        float hauteur = (float)Math.Sin(angle);
        float jour = Mathf.Clamp(hauteur * 2.5f + 0.3f, 0.18f, 1f);
        _soleil.RotationDegrees = new Vector3(-Mathf.Clamp(hauteur * 60, 8, 70), (float)(_heure * 15) - 90, 0);
        _soleil.LightEnergy = 1.15f * jour;
        _soleil.LightColor = new Color(1, 0.85f + 0.15f * jour, 0.7f + 0.3f * jour);
        _env.AmbientLightEnergy = 0.35f + 0.65f * jour;
        _env.BackgroundEnergyMultiplier = jour;
    }

    // ------------------------------------------------------------------ boucle
    public override void _Process(double delta)
    {
        MettreAJourCiel(delta);
        if (_partie == null) return;
        _accumulateur += delta * JoursParSeconde * Multiplicateurs[_vitesse];
        int n = 0;
        while (_accumulateur >= 1 && n < 4) { _partie.AvancerJour(); _accumulateur -= 1; n++; }
        if (_accumulateur > 4) _accumulateur = 0;
        _trafic.Vitesse = Multiplicateurs[_vitesse];
        if (_partie.Mois >= _dernierMoisSauve + 3) { Sauvegarder("auto", false); _dernierMoisSauve = _partie.Mois; }
        _hud.OutilActif = _outil;
        _hud.MettreAJour(delta, _vitesse);
        Survol();
    }

    // ------------------------------------------------------------------ outils
    private void ChoisirOutil(string outil)
    {
        _outil = outil;
        _debutRoute = null;
        _rendu.ParcellesVides = outil is "habitat" or "commerce" or "activites" or "dezoner";
        if (outil != "" && _vitesse == 0) { }
    }

    private V2? PointSouris()
    {
        var p = _camera.PointSol(GetViewport().GetMousePosition());
        return p == null ? null : new V2(p.Value.X, -p.Value.Z);
    }

    public override void _UnhandledInput(InputEvent e)
    {
        if (e is InputEventKey k && k.Pressed && !k.Echo)
        {
            switch (k.Keycode)
            {
                case Key.Escape:
                    if (_outil != "") ChoisirOutil("");
                    break;
                case Key.Space: _vitesse = _vitesse == 0 ? 1 : 0; break;
                case Key.Key1: case Key.Kp1: _vitesse = 1; break;
                case Key.Key2: case Key.Kp2: _vitesse = 2; break;
                case Key.Key3: case Key.Kp3: _vitesse = 3; break;
                case Key.F1: _hud.BasculerAide(); break;
                case Key.F5: Sauvegarder("rapide", true); break;
                case Key.G: BasculerFantome(); break;
                case Key.V: VueSuivante(); break;
                case Key.Equal: case Key.Plus: case Key.KpAdd: if (k.CtrlPressed) _hud.TailleTexte(+2); break;
                case Key.Minus: case Key.KpSubtract: if (k.CtrlPressed) _hud.TailleTexte(-2); break;
            }
        }
        if (_partie == null) return;
        if (e is InputEventMouseButton mb)
        {
            if (mb.ButtonIndex == MouseButton.Right && mb.Pressed && _debutRoute != null) { _debutRoute = null; return; }
            if (mb.ButtonIndex != MouseButton.Left) return;
            _peinture = mb.Pressed && _outil is "habitat" or "commerce" or "activites" or "dezoner";
            if (!mb.Pressed) return;
            var p = PointSouris();
            if (p == null) return;
            Cliquer(p.Value);
        }
        else if (e is InputEventMouseMotion && _peinture)
        {
            var p = PointSouris();
            if (p != null) Peindre(p.Value);
        }
    }

    private void Cliquer(V2 p)
    {
        var partie = _partie!;
        switch (_outil)
        {
            case "rue":
            case "avenue":
                if (_debutRoute == null) { _debutRoute = partie.Reseau.Accrocher(p, partie.R.Routes.AccrochageM).point; return; }
                var r = partie.ConstruireRoute(_debutRoute.Value, p, _outil);
                if (!r.Ok) { _hud.Toast(r); return; }
                _hud.Toast($"{r.Message} Coût : {r.Cout:N0} €");
                _debutRoute = partie.Reseau.Accrocher(p, partie.R.Routes.AccrochageM).point; // on enchaîne
                return;
            case "habitat":
            case "commerce":
            case "activites":
            case "dezoner":
                Peindre(p);
                return;
            case "demolir":
                _hud.Toast(partie.Demolir(p));
                return;
            case "":
                return;
            default:
                _hud.Toast(partie.PlacerService(_outil, p));
                return;
        }
    }

    private void Peindre(V2 p)
    {
        var z = _outil switch { "habitat" => Zone.Habitat, "commerce" => Zone.Commerce, "activites" => Zone.Activites, _ => Zone.Aucune };
        _partie!.Zoner(p, 22, z);
    }

    private void Survol()
    {
        var partie = _partie!;
        _apercuMesh.ClearSurfaces();
        var p = PointSouris();
        if (p == null) { _hud.Info(""); return; }
        if ((_outil is "rue" or "avenue") && _debutRoute != null)
        {
            var ap = partie.PrevoirRoute(_debutRoute.Value, p.Value, _outil);
            var col = ap.Ok ? new Color(0.3f, 0.9f, 0.4f, 0.8f) : new Color(1f, 0.3f, 0.25f, 0.8f);
            Ligne(ap.A, ap.B, (float)partie.R.Route(_outil).LargeurM / 2, col);
            _hud.Info(ap.Ok ? $"{ap.Longueur:F0} m — {ap.Cout:N0} €   (clic droit : arrêter)" : $"{ap.Raison}");
            return;
        }
        if (_outil is "habitat" or "commerce" or "activites" or "dezoner")
        {
            Cercle(p.Value, 22, _outil == "dezoner" ? new Color(1, 1, 1, 0.7f) : RenduVille.CouleurZone(_outil switch { "habitat" => Zone.Habitat, "commerce" => Zone.Commerce, _ => Zone.Activites }) with { A = 0.85f });
            _hud.Info("Maintenez le clic gauche pour peindre les parcelles le long des rues");
            return;
        }
        if (_outil is "rue" or "avenue") { Cercle(p.Value, 4, new Color(0.3f, 0.9f, 0.4f, 0.8f)); _hud.Info("Cliquez le point de départ de la route"); return; }
        var par = partie.ParcelleSous(p.Value);
        if (_outil != "" && _outil != "demolir" && partie.R.Services.TryGetValue(_outil, out var s))
        {
            Cercle(p.Value, (float)Math.Max(15, s.RayonM > 0 ? s.RayonM : 15), new Color(0.4f, 0.7f, 1f, 0.6f));
            _hud.Info($"{s.Nom} : {s.Cout:N0} € puis {s.Entretien:N0} €/mois" + (s.RayonM > 0 ? $" — rayon d'action {s.RayonM:F0} m" : ""));
            return;
        }
        if (par == null) { _hud.Info(_outil == "demolir" ? "Cliquez sur un bâtiment, un service ou une route" : ""); return; }
        var b = par.Batiment;
        string texte = par.Service != null ? partie.R.Services[par.Service].Nom
            : b == null ? $"Parcelle {Nom(par.Zone)} libre — attrait {par.Attrait:F0}/100"
            : $"{Nom(b.Type)} niveau {b.Niveau}{(b.EnChantier ? " (en construction)" : "")} — " +
              (b.Type == Zone.Habitat ? $"{b.Occupants * partie.R.PersonnesParLogement:F0} habitants / {partie.Capacite(b) * partie.R.PersonnesParLogement:F0}" : $"{partie.CapaciteActive(b)} emplois") +
              $"\nEau : {(b.Eau ? "oui" : "NON")} · Électricité : {(b.Elec ? "oui" : "NON")} · Attrait {par.Attrait:F0}/100" +
              (b.Type == Zone.Habitat ? $"\nÉcole : {b.Ecole * 100:F0} % · Santé : {b.Sante * 100:F0} %" : "\n") +
              $" · Déchets : {(b.Dechets ? "ramassés" : "NON")} · Pompiers : {(b.Pompiers ? "oui" : "non")} · Police : {(b.Police ? "oui" : "non")}" +
              (partie.Congestion.TryGetValue(par.Arete, out var cg) ? $"\nTrafic de la rue : {cg * 100:F0} % de sa capacité" : "");
        _hud.Info(texte);
    }

    private static string Nom(Zone z) => z switch { Zone.Habitat => "Habitat", Zone.Commerce => "Commerce", Zone.Activites => "Activités", _ => "non zonée" };

    private void Ligne(V2 a, V2 b, float demi, Color col)
    {
        var d = b - a;
        if (d.Longueur < 0.1) return;
        var n = d.Perp * (demi / d.Longueur);
        _apercuMesh.SurfaceBegin(Mesh.PrimitiveType.Triangles);
        int k = Math.Max(1, (int)(d.Longueur / 10));
        for (int i = 0; i < k; i++)
        {
            var p0 = a + d * (i / (double)k); var p1 = a + d * ((i + 1) / (double)k);
            Vector3 P(V2 q) => RenduVille.G(_partie!, q, 0.8);
            foreach (var q in new[] { p0 + n, p1 + n, p1 - n, p0 + n, p1 - n, p0 - n }) { _apercuMesh.SurfaceSetColor(col); _apercuMesh.SurfaceAddVertex(P(q)); }
        }
        _apercuMesh.SurfaceEnd();
    }

    private void Cercle(V2 c, float r, Color col)
    {
        _apercuMesh.SurfaceBegin(Mesh.PrimitiveType.Lines);
        const int n = 48;
        for (int i = 0; i < n; i++)
        {
            foreach (var t in new[] { i, i + 1 })
            {
                double a = Math.Tau * t / n;
                _apercuMesh.SurfaceSetColor(col);
                _apercuMesh.SurfaceAddVertex(RenduVille.G(_partie!, c + new V2(Math.Cos(a) * r, Math.Sin(a) * r), 1.0));
            }
        }
        _apercuMesh.SurfaceEnd();
    }

    private void VueSuivante()
    {
        if (_partie == null) return;
        _rendu.Vue = (RenduVille.Vues)(((int)_rendu.Vue + 1) % RenduVille.NomsVues.Length);
        _hud.Toast(RenduVille.NomsVues[(int)_rendu.Vue] + "   (V pour changer)");
    }

    private void BasculerFantome()
    {
        if (_fantome == null)
        {
            var mat = new StandardMaterial3D
            {
                AlbedoColor = new Color(0.85f, 0.9f, 1f, 0.28f),
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                CullMode = BaseMaterial3D.CullModeEnum.Back,
            };
            _fantome = new ConstructeurVille(_paquet).ConstruireBatiments(mat);
            foreach (var c in _fantome.GetChildren()) if (c is GeometryInstance3D g) g.CastShadow = GeometryInstance3D.ShadowCastingSetting.Off;
            _fantome.Visible = false;
            AddChild(_fantome);
        }
        _fantome.Visible = !_fantome.Visible;
        _hud.Toast(_fantome.Visible ? "Vraie ville affichée en transparence (G pour masquer)" : "Vraie ville masquée");
    }

    private void Sauvegarder(string nom, bool afficher)
    {
        if (_partie == null) return;
        try
        {
            _partie.SauvegarderFichier(System.IO.Path.Combine(_dossierSauvegardes, nom + ".json"));
            if (afficher) _hud.Toast("Partie sauvegardée.");
        }
        catch (Exception ex) { _hud.Toast("Échec de la sauvegarde : " + ex.Message, false); }
    }

    // ------------------------------------------------------------------ mode automatique (tests et captures)
    private async void ModeAuto()
    {
        // --auto=capture : le robot joue N mois, puis on prend des images de contrôle
        Commencer(null);
        var robot = new Robot(_partie!);
        robot.Demarrer();
        int mois = 24;
        for (int m = 0; m < mois; m++)
        {
            robot.Decider();
            for (int j = 0; j < _reglages.JoursParMois; j++) _partie!.AvancerJour();
        }
        var c = robot.Centre;
        var vues = new (string nom, float dist, float tangage, float lacet)[] { ("ensemble", 900, 0.75f, 0.6f), ("quartier", 260, 0.55f, 2.2f), ("rue", 7, 0.3f, 0.9f), ("trafic", 700, 1.1f, 0.6f), ("attrait", 700, 1.1f, 0.6f) };
        var dossier = ProjectSettings.GlobalizePath("user://");
        foreach (var (nom, dist, tangage, lacet) in vues)
        {
            _camera.Cible = new Vector3((float)c.X + (nom == "rue" ? 50 : 0), 0, (float)-c.Y);
            _camera.Distance = dist; _camera.Tangage = tangage; _camera.Lacet = lacet;
            _rendu.Vue = nom == "trafic" ? RenduVille.Vues.Trafic : nom == "attrait" ? RenduVille.Vues.Attrait : RenduVille.Vues.Normale;
            _camera.Appliquer();
            for (int i = 0; i < 30; i++) await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
            GetViewport().GetTexture().GetImage().SavePng(System.IO.Path.Combine(dossier, $"proto_{nom}.png"));
        }
        GD.Print($"AUTO population={_partie!.Population} argent={_partie.Argent:F0} palier={_partie.Palier} batiments={_partie.Parcelles.Values.Count(p => p.Batiment != null)}");
        GetTree().Quit();
    }
}
