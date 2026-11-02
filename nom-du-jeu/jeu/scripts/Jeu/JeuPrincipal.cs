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
    private RenduNature _nature = null!;
    private Hud _hud = null!;
    private Node3D? _fantome;
    private DirectionalLight3D _soleil = null!;
    private Godot.Environment _env = null!;
    private MeshInstance3D _apercu = null!;
    private ImmediateMesh _apercuMesh = new();
    private Control _menu = null!;

    private string _outil = "";
    private V2? _debutRoute;
    private V2? _controleCourbe;
    private bool _peinture;
    private int _vitesse = 1;
    private double _accumulateur;
    private double _heure = 10;     // heure de la journée (visuelle)
    private int _dernierMoisSauve;
    private string _dossierSauvegardes = "";
    private const double JoursParSeconde = 0.5;   // vitesse normale : 1 mois = 60 s
    private static readonly int[] Multiplicateurs = { 0, 1, 2, 4 };
    private string _optionAuto = "";
    private readonly List<Node3D> _decor = new();
    private bool _vraieGestion = true;
    private string _difficulte = "realiste";
    private int _vitesseAvantDecision = 1;
    private MeshInstance3D _territoire = null!;
    private readonly ImmediateMesh _territoireMesh = new();
    private double _rayonAffiche = -1;
    private CanvasLayer _calque = null!;

    /// <summary>Charge la carte d'une taille (quartier 4 km, ville 10 km) et reconstruit le décor.</summary>
    private void ChargerCarte(string taille)
    {
        if (_paquet != null && _paquet.Manifest.Ville.Taille == taille) return;
        _paquet = PaquetVille.Charger(System.IO.Path.Combine(Racine(), "donnees", "villes", $"fr-annecy_{taille}_v1"));
        foreach (var n in _decor) n.QueueFree();
        _decor.Clear();
        var decor = new ConstructeurVille(_paquet);
        _decor.Add(decor.ConstruireTerrain());
        _decor.Add(decor.ConstruireEau());
        foreach (var n in _decor) AddChild(n);
        _fantome?.QueueFree();
        _fantome = null;
        if (_camera != null)
        {
            _camera.Demi = (float)_paquet.Manifest.Repere.DemiCoteM - 50;
            _camera.Altitude = (x, z) => _paquet.Altitude(x, -z);
        }
    }

    public static bool CarteDisponible(string taille) =>
        System.IO.Directory.Exists(System.IO.Path.Combine(Racine(), "donnees", "villes", $"fr-annecy_{taille}_v1"));

    private void DessinerTerritoire()
    {
        double r = _partie?.RayonConstructible ?? double.PositiveInfinity;
        if (r == _rayonAffiche) return;
        _rayonAffiche = r;
        _territoireMesh.ClearSurfaces();
        if (double.IsInfinity(r) || _partie == null) return;
        _territoireMesh.SurfaceBegin(Mesh.PrimitiveType.Triangles);
        int n = 180;
        for (int i = 0; i < n; i++)
        {
            double a0 = Math.Tau * i / n, a1 = Math.Tau * (i + 1) / n;
            var p0 = new V2(Math.Cos(a0) * r, Math.Sin(a0) * r); var p1 = new V2(Math.Cos(a1) * r, Math.Sin(a1) * r);
            if (p0.Longueur > _partie.DemiCote * 1.4) continue;
            var q0 = RenduVille.G(_partie, p0, 1); var q1 = RenduVille.G(_partie, p1, 1);
            var col = new Color(1f, 0.95f, 0.6f, 0.75f);
            foreach (var q in new[] { q0, q1, q1 + Vector3.Up * 8, q0, q1 + Vector3.Up * 8, q0 + Vector3.Up * 8 })
            {
                _territoireMesh.SurfaceSetColor(q.Y - Mathf.Min(q0.Y, q1.Y) > 4 ? col with { A = 0 } : col);
                _territoireMesh.SurfaceAddVertex(q);
            }
        }
        _territoireMesh.SurfaceEnd();
    }

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
        _dossierSauvegardes = ProjectSettings.GlobalizePath("user://sauvegardes");
        System.IO.Directory.CreateDirectory(_dossierSauvegardes);

        Ambiance();
        ChargerCarte("quartier");

        _rendu = new RenduVille { Name = "RenduVille" };
        _trafic = new RenduTrafic { Name = "Trafic" };
        _nature = new RenduNature { Name = "Nature" };
        AddChild(_nature);
        _rendu.Nature = _nature;
        AddChild(_rendu);
        AddChild(_trafic);
        _apercu = new MeshInstance3D { Mesh = _apercuMesh, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off,
            MaterialOverride = new StandardMaterial3D { VertexColorUseAsAlbedo = true, ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded, Transparency = BaseMaterial3D.TransparencyEnum.Alpha, NoDepthTest = true } };
        AddChild(_apercu);

        _camera = new CameraVille { Demi = (float)_paquet.Manifest.Repere.DemiCoteM - 50, Altitude = (x, z) => _paquet.Altitude(x, -z) };
        _territoire = new MeshInstance3D { Mesh = _territoireMesh, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off,
            MaterialOverride = new StandardMaterial3D { VertexColorUseAsAlbedo = true, ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded, Transparency = BaseMaterial3D.TransparencyEnum.Alpha } };
        AddChild(_territoire);
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
        _hud.PasserTutoriel = () => { _tutoriel = null; _hud.TexteTutoriel = ""; _options.TutorielTermine = true; _options.Enregistrer(); };
        _options = Options.Charger();
        AppliquerOptions();
        _pause = new MenuPause { Visible = false, Options = _options, DossierSauvegardes = _dossierSauvegardes };
        _pause.Reprendre = FermerPause;
        _pause.Sauvegarder = nom => { Sauvegarder(nom, true); };
        _pause.Charger = f => { FermerPause(); Commencer(f); };
        _pause.MenuPrincipal = () => { FermerPause(); RetourMenu(); };
        _pause.OptionsModifiees = AppliquerOptions;
        calque.AddChild(_pause);
        _calque = calque;
        _menu = Menu();
        calque.AddChild(_menu);

        foreach (var a in OS.GetCmdlineUserArgs())
        {
            if (a.StartsWith("--auto=")) _optionAuto = a["--auto=".Length..];
            if (a.StartsWith("--carte=")) ChargerCarte(a["--carte=".Length..]);
        }
        if (_optionAuto != "") CallDeferred(nameof(ModeAuto));
    }

    // ------------------------------------------------------------------ menu
    private Control Menu()
    {
        var fond = new ColorRect { Color = new Color(0.05f, 0.07f, 0.10f, 0.72f) };
        fond.SetAnchorsAndOffsetsPreset(Control.LayoutPreset.FullRect);
        fond.Ready += () => fond.CallDeferred(Control.MethodName.SetSize, fond.GetViewportRect().Size, false);
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
        // taille de la carte
        var tailles = new HBoxContainer();
        tailles.AddChild(new Label { Text = "Carte : " });
        foreach (var (t, nom) in new[] { ("quartier", "Quartier (4 × 4 km)"), ("ville", "Ville (10 × 10 km)") })
        {
            if (!CarteDisponible(t)) continue;
            var b = new Button { Text = nom, ToggleMode = true, ButtonPressed = _paquet.Manifest.Ville.Taille == t };
            b.Pressed += () => { ChargerCarte(t); ReconstruireMenu(); };
            tailles.AddChild(b);
        }
        v.AddChild(tailles);
        var q = _paquet.Manifest.Qualite;
        string Qv(string k) => q.TryGetProperty(k, out var e) ? e.ToString() : "?";
        var note = new Label
        {
            Text = $"Ville : {_paquet.Manifest.Ville.Nom} (zone de {_paquet.Manifest.Ville.CoteKm} × {_paquet.Manifest.Ville.CoteKm} km)" +
                   (_paquet.Manifest.Ville.CoteKm > 5 ? " — le territoire constructible s'agrandit à chaque palier\n" : "\n") +
                   $"Qualité des données : {Qv("note_sur_100")}/100\n" +
                   $"  • {Qv("batiments")} bâtiments réels ({Qv("pct_batiments_osm")} % cartographiés à la main), hauteurs réelles : {Qv("pct_hauteur_reelle")} % (le reste est estimé)\n" +
                   $"  • relief Copernicus 30 m (sol estimé), {Qv("km_routes_carrossables")} km de routes réelles\n" +
                   (_paquet.Manifest.Ville.CoteKm > 5 ? "Grande carte : un PC récent est conseillé pour le mode « Ville réelle ».\n" : ""),
            AutowrapMode = TextServer.AutowrapMode.WordSmart,
        };
        v.AddChild(note);
        var options = new HBoxContainer();
        var gestion = new CheckBox { Text = "Vraie gestion (usure, dotations, événements)", ButtonPressed = _vraieGestion };
        gestion.Toggled += on => _vraieGestion = on;
        options.AddChild(gestion);
        var diff = new OptionButton();
        foreach (var (id, nom) in new[] { ("decouverte", "Découverte"), ("realiste", "Réaliste"), ("crise", "Crise") }) diff.AddItem(nom);
        diff.Selected = Array.IndexOf(new[] { "decouverte", "realiste", "crise" }, _difficulte);
        diff.ItemSelected += i => _difficulte = new[] { "decouverte", "realiste", "crise" }[i];
        options.AddChild(new Label { Text = "   Difficulté :" });
        options.AddChild(diff);
        v.AddChild(options);
        v.AddChild(new Label { Text = "Comment voulez-vous commencer ?" });
        foreach (var (mode, texte) in new[]
                 {
                     (ModeDepart.TerrainSeul, "Terrain seul — la vraie géographie, aucune route"),
                     (ModeDepart.GrandsAxes, "Terrain et grands axes réels — à vous de bâtir la ville"),
                     (ModeDepart.RoutesReelles, "Vraies rues, sans bâtiments — urbanisez le vrai plan"),
                     (ModeDepart.VilleReelle, $"Ville réelle — {_paquet.Manifest.Ville.Nom} telle qu'elle est (population estimée)"),
                 })
        {
            var b = new Button { Text = texte, CustomMinimumSize = new Vector2(0, 40) };
            b.Pressed += () => Commencer(null, mode);
            v.AddChild(b);
        }
        var tuto = new Button { Text = _options.TutorielTermine ? "Tutoriel (5 minutes)" : "Tutoriel (5 minutes) — conseillé pour commencer", CustomMinimumSize = new Vector2(0, 40) };
        tuto.Pressed += DemarrerTutoriel;
        v.AddChild(tuto);
        var sable = new Button { Text = "Bac à sable (argent illimité, tout débloqué)", CustomMinimumSize = new Vector2(0, 34) };
        sable.Pressed += () => Commencer(null, ModeDepart.GrandsAxes, bacASable: true);
        v.AddChild(sable);
        var derniere = System.IO.Directory.EnumerateFiles(_dossierSauvegardes, "*.json").Where(f => !f.EndsWith(".info.json"))
            .OrderByDescending(System.IO.File.GetLastWriteTimeUtc).FirstOrDefault();
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

    private void ReconstruireMenu()
    {
        var ancien = _menu;
        _menu = Menu();
        _calque.AddChild(_menu);
        ancien.QueueFree();
    }

    private void Commencer(string? sauvegarde, ModeDepart mode = ModeDepart.GrandsAxes, bool bacASable = false)
    {
        try
        {
            if (sauvegarde != null)
            {
                var json = Partie.LireFichier(sauvegarde);
                ChargerCarte(Partie.LireEntete(json).taille);
                _partie = Partie.Charger(json, _reglages, _paquet);
            }
            else
            {
                ulong graine = (ulong)DateTime.Now.Ticks;
                _partie = bacASable ? Partie.NouveauBacASable(_reglages, _paquet, graine) : Partie.Nouvelle(_reglages, _paquet, mode, graine);
                if (_vraieGestion && !bacASable) _partie.Modules.Add(new Ville.Gestion.VraieGestion(_reglages, _difficulte));
            }
        }
        catch (Exception ex)
        {
            GD.PrintErr(ex);
            _partie = Partie.NouvelleFondation(_reglages, _paquet, 1);
            _hud.Toast("La sauvegarde n'a pas pu être chargée : nouvelle partie.", false);
        }
        _rayonAffiche = -1;
        _camera.Cible = new Vector3(-400, 0, -150);
        _camera.Distance = _paquet.Manifest.Ville.CoteKm > 5 ? 2200 : 1100;
        _rendu.Initialiser(_partie);
        _trafic.Initialiser(_partie);
        _nature.Initialiser(_partie);
        _hud.Attacher(_partie);
        _rendu.Visible = _trafic.Visible = _nature.Visible = true;
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
            Sky = new Sky { SkyMaterial = _ciel },
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
        _meteo = new Meteo { Name = "Meteo" };
        AddChild(_meteo);
        _son = new AmbianceSonore { Name = "Son" };
        AddChild(_son);
    }

    private readonly ProceduralSkyMaterial _ciel = new();
    private Meteo _meteo = null!;
    private AmbianceSonore _son = null!;
    private double _minuterieSon;
    private float _nuit;

    /// <summary>Météo, saison et ambiance sonore selon ce que regarde la caméra.</summary>
    private void MettreAJourAmbiance(double delta)
    {
        int jour = _partie?.Jour ?? 150, mois = (_partie?.Mois ?? 5) % 12;
        double fraction = (_partie?.Jour ?? 150) % 30 / 30.0;
        var cible = _camera.Cible;
        float sol = _paquet.Altitude(cible.X, -cible.Z);
        _meteo.MettreAJour(delta, jour, mois, fraction, _camera.GlobalPosition, sol, _env, _ciel);
        _soleil.LightEnergy *= 1 - 0.6f * _meteo.CouvertureNuageuse;
        _hud.MeteoTexte = $"{_meteo.NomSaison} · {_meteo.Description}";
        if ((_minuterieSon -= delta) > 0) return;
        _minuterieSon = 0.5;
        var c = new V2(cible.X, -cible.Z);
        float ville = 0, eau = 0;
        if (_partie != null)
        {
            ville = Mathf.Clamp(_partie.ParcellesProches(c, 300).Count(p => p.Batiment != null) / 60f, 0, 1);
            double d = _partie.Grille.DistanceEau(c);
            eau = d < 250 ? (float)(1 - d / 250) : 0;
        }
        float hauteurCam = _camera.GlobalPosition.Y - sol;
        float loin = Mathf.Clamp(1 - (_camera.Distance - 800) / 2500f, 0.25f, 1);
        bool pluie = _meteo.Actuel == Meteo.Temps.Pluie;
        float jourF = 1 - _nuit;
        _son.Ville = ville * (0.55f + 0.45f * jourF) * loin;
        _son.Eau = eau * loin;
        _son.Vent = Mathf.Clamp(hauteurCam / 1500f, 0, 0.6f) + Mathf.Clamp((sol - (float)_paquet.Manifest.Relief.AltMin) / 400f, 0, 0.5f) + (pluie ? 0.2f : 0);
        bool hiver = mois is 11 or 0 or 1;
        _son.Oiseaux = !pluie && !hiver ? (1 - ville) * 0.8f * jourF * loin : 0;
        _son.Grillons = !pluie && mois is >= 5 and <= 8 ? (1 - ville * 0.7f) * 0.7f * _nuit * loin : 0;
        _son.Pluie = pluie ? _meteo.Intensite : 0;
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
        _nuit = Mathf.Clamp((0.35f - hauteur) * 2.2f, 0, 1);
        RenderingServer.GlobalShaderParameterSet("nuit", _nuit);
    }

    // ------------------------------------------------------------------ boucle
    public override void _Process(double delta)
    {
        MettreAJourCiel(delta);
        MettreAJourAmbiance(delta);
        if (_partie == null) return;
        _accumulateur += delta * JoursParSeconde * Multiplicateurs[_vitesse];
        int n = 0;
        while (_accumulateur >= 1 && n < 4) { _partie.AvancerJour(); _accumulateur -= 1; n++; }
        if (_accumulateur > 4) _accumulateur = 0;
        _trafic.Vitesse = Multiplicateurs[_vitesse];
        if (_partie.Mois >= _dernierMoisSauve + 3) { Sauvegarder("auto", false); _dernierMoisSauve = _partie.Mois; }
        _hud.OutilActif = _outil;
        // une décision attend le maire : pause et fenêtre
        if (_partie.Decisions.Count > 0 && !_hud.DecisionAffichee)
        {
            _vitesseAvantDecision = Math.Max(1, _vitesse);
            _vitesse = 0;
            var d = _partie.Decisions[0];
            _hud.AfficherDecision(d, c => { _partie?.Repondre(d.Id, c); _vitesse = _vitesseAvantDecision; });
        }
        if (_tutoriel != null) SuivreTutoriel();
        _hud.MettreAJour(delta, _vitesse);
        DessinerTerritoire();
        Survol();
    }

    // ------------------------------------------------------------------ outils
    private void ChoisirOutil(string outil)
    {
        _outil = outil;
        _debutRoute = null;
        _controleCourbe = null;
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
                    else if (_partie != null && _menu.Visible == false) { if (_pause.Visible) FermerPause(); else OuvrirPause(); }
                    break;
                case Key.Space: _vitesse = _vitesse == 0 ? 1 : 0; break;
                case Key.Key1: case Key.Kp1: _vitesse = 1; break;
                case Key.Key2: case Key.Kp2: _vitesse = 2; break;
                case Key.Key3: case Key.Kp3: _vitesse = 3; break;
                case Key.F1: _hud.BasculerAide(); break;
                case Key.F5: Sauvegarder("rapide", true); break;
                case Key.G: BasculerFantome(); break;
                case Key.M: _son.Muet = !_son.Muet; _hud.Toast(_son.Muet ? "Son coupé (M)" : "Son rétabli (M)"); break;
                case Key.V: VueSuivante(); break;
                case Key.Equal: case Key.Plus: case Key.KpAdd: if (k.CtrlPressed) { _options.TailleTexte = _hud.TailleTexte(+2); _options.Enregistrer(); } break;
                case Key.Minus: case Key.KpSubtract: if (k.CtrlPressed) { _options.TailleTexte = _hud.TailleTexte(-2); _options.Enregistrer(); } break;
            }
        }
        if (_partie == null) return;
        if (e is InputEventMouseButton mb)
        {
            if (mb.ButtonIndex == MouseButton.Right && mb.Pressed && _debutRoute != null) { _debutRoute = null; _controleCourbe = null; return; }
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
            case "rue_courbe":
            case "avenue_courbe":
            {
                string g = _outil.Replace("_courbe", "");
                if (_debutRoute == null) { _debutRoute = partie.Reseau.Accrocher(p, partie.R.Routes.AccrochageM).point; return; }
                if (_controleCourbe == null) { _controleCourbe = p; return; }
                var rc = partie.ConstruireCourbe(_debutRoute.Value, _controleCourbe.Value, p, g);
                _hud.Toast(rc.Ok ? $"{rc.Message} Coût : {rc.Cout:N0} €" : rc.Message, rc.Ok);
                if (rc.Ok) { _debutRoute = partie.Reseau.Accrocher(p, partie.R.Routes.AccrochageM).point; _controleCourbe = null; }
                return;
            }
            case "demolir":
                _hud.Toast(partie.Demolir(p));
                return;
            case "renover":
                if (partie.Module<Ville.Gestion.VraieGestion>() is { } vg) _hud.Toast(vg.Renover(partie, p));
                else _hud.Toast("Le module « vraie gestion » n'est pas activé dans cette partie.", false);
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
        if ((_outil is "rue_courbe" or "avenue_courbe") && _debutRoute != null)
        {
            string g = _outil.Replace("_courbe", "");
            var ctrl = _controleCourbe ?? p.Value;
            var pts = Partie.PointsCourbe(_debutRoute.Value, ctrl, _controleCourbe == null ? p.Value : p.Value);
            var apc = _controleCourbe == null ? partie.PrevoirRoute(_debutRoute.Value, p.Value, g) : partie.PrevoirCourbe(_debutRoute.Value, ctrl, p.Value, g);
            var colc = apc.Ok ? new Color(0.3f, 0.9f, 0.4f, 0.8f) : new Color(1f, 0.3f, 0.25f, 0.8f);
            for (int i = 0; i + 1 < pts.Count; i++) Ligne(pts[i], pts[i + 1], (float)partie.R.Route(g).LargeurM / 2, colc);
            _hud.Info(_controleCourbe == null ? "Cliquez le point de courbure" : apc.Ok ? $"{apc.Longueur:F0} m — {apc.Cout:N0} € — cliquez l'arrivée" : apc.Raison);
            return;
        }
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
        if (_outil is "rue" or "avenue" or "rue_courbe" or "avenue_courbe") { Cercle(p.Value, 4, new Color(0.3f, 0.9f, 0.4f, 0.8f)); _hud.Info("Cliquez le point de départ de la route"); return; }
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
              (partie.Congestion.TryGetValue(par.Arete, out var cg) ? $"\nTrafic de la rue : {cg * 100:F0} % de sa capacité" : "") +
              (partie.Module<Ville.Gestion.VraieGestion>() is { } gu ? $" · Usure de la rue : {gu.UsureRoute(par.Arete) * 100:F0} %" : "");
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

    private Options _options = null!;
    private MenuPause _pause = null!;
    private Interface.Tutoriel? _tutoriel;
    private Interface.Tutoriel.Etat? _etatTuto;
    private Vector3 _dernierePositionCamera;
    private float _derniereDistance;
    private int _vitesseAvantPause = 1;

    private void AppliquerOptions()
    {
        _son.Volume = _options.Volume;
        _son.Muet = _options.Muet;
        _hud.DefinirTailleTexte(_options.TailleTexte);
        _options.AppliquerQualite(_env, _soleil, GetViewport());
        if (RenduVille.Daltonisme != _options.Daltonisme)
        {
            RenduVille.Daltonisme = _options.Daltonisme;
            if (_partie != null) foreach (var par in _partie.Parcelles.Values) _partie.CarresModifies.Add(Partie.Carre(par.Centre));
        }
        _rendu?.ForcerRoutes();
    }

    private void OuvrirPause() { _vitesseAvantPause = Math.Max(1, _vitesse); _vitesse = 0; _pause.Visible = true; _pause.Principal(); }
    private void FermerPause() { _pause.Visible = false; _vitesse = _vitesseAvantPause; }

    private void RetourMenu()
    {
        Sauvegarder("auto", false);
        _partie = null;
        _tutoriel = null;
        _hud.TexteTutoriel = "";
        _hud.Visible = false;
        _rendu.Visible = _trafic.Visible = _nature.Visible = false;
        ReconstruireMenu();
        _menu.Visible = true;
    }

    private void DemarrerTutoriel()
    {
        ChargerCarte("quartier");
        Commencer(null, ModeDepart.GrandsAxes);
        _tutoriel = new Interface.Tutoriel();
        _etatTuto = new Interface.Tutoriel.Etat { P = _partie! };
        _camera.Cible = new Vector3(-711, 0, -388);
        _camera.Distance = 700;
        _dernierePositionCamera = _camera.Cible;
        _derniereDistance = _camera.Distance;
        _vitesse = 0;
    }

    private void SuivreTutoriel()
    {
        var e = _etatTuto!;
        e.P = _partie!;
        var dep = _camera.Cible - _dernierePositionCamera;
        e.DeplacementCamera += new Vector2(dep.X, dep.Z).Length() + Math.Abs(_camera.Distance - _derniereDistance) * 0.5f;
        _derniereDistance = _camera.Distance;
        _dernierePositionCamera = _camera.Cible;
        e.BudgetOuvert |= _hud.BudgetVisible;
        e.VueChangee |= _rendu.Vue != RenduVille.Vues.Normale;
        if (_tutoriel!.Avancer(e)) _hud.Toast(_tutoriel.Termine ? "Tutoriel terminé ! Bonne partie, Madame ou Monsieur le Maire." : "Étape réussie !");
        _hud.TexteTutoriel = _tutoriel.Texte();
        if (_tutoriel.Termine)
        {
            _tutoriel = null;
            _options.TutorielTermine = true;
            _options.Enregistrer();
        }
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
            string[] moisNoms = { "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre" };
            var info = new MenuPause.InfoSauvegarde(nom, _paquet.Manifest.Ville.Nom, _paquet.Manifest.Ville.Taille, _partie.Depart.ToString(),
                $"{moisNoms[_partie.Mois % 12]} {2027 + _partie.Mois / 12}", _partie.Population, Math.Round(_partie.Argent), DateTime.Now);
            System.IO.File.WriteAllText(System.IO.Path.Combine(_dossierSauvegardes, nom + ".info.json"), System.Text.Json.JsonSerializer.Serialize(info));
            if (afficher) _hud.Toast("Partie sauvegardée.");
        }
        catch (Exception ex) { _hud.Toast("Échec de la sauvegarde : " + ex.Message, false); }
    }

    // ------------------------------------------------------------------ mode automatique (tests et captures)
    /// <summary>Joue le tutoriel de bout en bout comme le ferait un joueur, et vérifie chaque étape.</summary>
    private async System.Threading.Tasks.Task TesterTutoriel()
    {
        DemarrerTutoriel();
        async System.Threading.Tasks.Task Images(int n) { for (int i = 0; i < n; i++) await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame); }
        await Images(10);
        GetViewport().GetTexture().GetImage().SavePng(ProjectSettings.GlobalizePath("user://tutoriel_etape1.png"));
        var etapes = new List<string>();
        void Note() => etapes.Add($"{_tutoriel?.Index ?? Interface.Tutoriel.Etapes.Length}");
        _camera.Cible += new Vector3(300, 0, 0); await Images(5); Note();          // 1. caméra
        var robot = new Robot(_partie!); robot.Demarrer(); await Images(5); Note(); // 2-5. rue, zones, eau, électricité
        _vitesse = 3;
        for (int i = 0; i < 400 && (_tutoriel?.Index ?? 99) <= 5; i++) await Images(1);
        Note();                                                                      // 6. premières maisons (+7 : le robot a zoné commerces et activités)
        _hud.OuvrirBudget(); await Images(5); Note();                                // 8. budget
        VueSuivante(); await Images(5); Note();                                      // 9. vues
        for (int m = 0; m < 6; m++) for (int j = 0; j < 30; j++) _partie!.AvancerJour();
        await Images(5); Note();                                                     // 10. 300 habitants
        Sauvegarder("Ma ville de test", false);
        OuvrirPause();
        await Images(5);
        GetViewport().GetTexture().GetImage().SavePng(ProjectSettings.GlobalizePath("user://pause.png"));
        bool info = System.IO.File.Exists(System.IO.Path.Combine(_dossierSauvegardes, "Ma ville de test.info.json"));
        GD.Print($"PAUSE vitesse={_vitesse} info_sauvegarde={info}");
        GD.Print($"TUTORIEL étapes franchies après chaque action : {string.Join(" → ", etapes)} ; terminé = {_tutoriel == null}");
        GetTree().Quit();
    }

    private async void ModeAuto()
    {
        if (_optionAuto == "tutoriel") { await TesterTutoriel(); return; }
        // --auto=capture : le robot joue N mois, puis on prend des images de contrôle
        // --auto=reelle : la vraie ville, 2 mois de simulation
        V2 c;
        if (_optionAuto == "reelle")
        {
            Commencer(null, ModeDepart.VilleReelle);
            for (int j = 0; j < 60; j++) _partie!.AvancerJour();
            c = new V2(-350, 150);
        }
        else
        {
            Commencer(null);
            var robot = new Robot(_partie!);
            robot.Demarrer();
            for (int m = 0; m < 24; m++)
            {
                robot.Decider();
                for (int j = 0; j < _reglages.JoursParMois; j++) _partie!.AvancerJour();
            }
            c = robot.Centre;
        }
        var vues = new (string nom, float dist, float tangage, float lacet)[] { ("ensemble", 900, 0.75f, 0.6f), ("quartier", 260, 0.55f, 2.2f), ("rue", 7, 0.3f, 0.9f), ("trafic", 700, 1.1f, 0.6f), ("attrait", 700, 1.1f, 0.6f), ("lac", 260, 0.3f, 2.4f), ("pietons", 45, 0.35f, 0.9f) };
        var dossier = ProjectSettings.GlobalizePath("user://");
        foreach (var d in _partie!.Decisions.ToList()) _partie.Repondre(d.Id, 1);
        foreach (var (nom, dist, tangage, lacet) in vues)
        {
            _camera.Cible = new Vector3((float)c.X + (nom == "rue" ? 50 : 0), 0, (float)-c.Y);
            if (nom == "lac") _camera.Cible = new Vector3(1150, 0, 450);
            _camera.Distance = dist; _camera.Tangage = tangage; _camera.Lacet = lacet;
            _rendu.Vue = nom == "trafic" ? RenduVille.Vues.Trafic : nom == "attrait" ? RenduVille.Vues.Attrait : RenduVille.Vues.Normale;
            _camera.Appliquer();
            for (int i = 0; i < 30; i++) await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
            GetViewport().GetTexture().GetImage().SavePng(System.IO.Path.Combine(dossier, $"{_optionAuto}_{nom}.png"));
        }
        // nuit, automne, hiver sous la neige, pluie
        foreach (var (nom, heure, moisF, temps) in new (string, double, int, Meteo.Temps)[]
                 { ("nuit", 22.5, 6, Meteo.Temps.Beau), ("automne", 15, 9, Meteo.Temps.Beau), ("hiver", 13, 0, Meteo.Temps.Neige), ("pluie", 11, 3, Meteo.Temps.Pluie) })
        {
            _heure = heure; _meteo.MoisForce = moisF; _meteo.TempsForce = temps;
            _camera.Cible = new Vector3((float)c.X, 0, (float)-c.Y);
            _camera.Distance = nom == "hiver" ? 1600 : 330; _camera.Tangage = nom == "hiver" ? 0.35f : 0.5f; _camera.Lacet = nom == "hiver" ? 2.6f : 2.2f;
            _camera.Appliquer();
            for (int i = 0; i < 60; i++) await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
            GetViewport().GetTexture().GetImage().SavePng(System.IO.Path.Combine(dossier, $"{_optionAuto}_{nom}.png"));
        }
        _meteo.MoisForce = null; _meteo.TempsForce = null;
        if (_partie!.Module<Ville.Gestion.VraieGestion>() != null)
        {
            _rendu.Vue = RenduVille.Vues.Normale;
            _partie.Proposer(Ville.Gestion.VraieGestion.Identifiant, "tempete", "Tempête sur la commune",
                "Une violente tempête a arraché des arbres et abîmé plusieurs rues. Les services techniques attendent vos ordres.",
                new[] { "Réparer tout de suite (31 000 €)", "Réparer plus tard (les rues restent abîmées)" }, new() { ["cout"] = 31000 });
            for (int i = 0; i < 20; i++) await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
            GetViewport().GetTexture().GetImage().SavePng(System.IO.Path.Combine(dossier, $"{_optionAuto}_decision.png"));
        }
        GD.Print($"AUTO population={_partie!.Population} argent={_partie.Argent:F0} palier={_partie.Palier} batiments={_partie.Parcelles.Values.Count(p => p.Batiment != null)}");
        GetTree().Quit();
    }
}
