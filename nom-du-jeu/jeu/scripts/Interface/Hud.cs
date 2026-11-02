using Godot;
using Ville.Coeur;

namespace Jeu.Interface;

/// <summary>Interface du maire : barre d'état, outils, messages, objectifs, budget, aide.</summary>
public partial class Hud : Control
{
    public Action<string>? OutilChoisi;
    public Action<int>? VitesseChoisie;
    public Action? CalqueBascule;
    public Action? Sauvegarder;
    public Action? VueSuivante;

    /// <summary>Taille du texte (accessibilité) : Ctrl + / Ctrl -.</summary>
    public void TailleTexte(int delta)
    {
        int t = Math.Clamp(Theme.DefaultFontSize + delta, 12, 26);
        Theme.DefaultFontSize = t;
        Toast($"Taille du texte : {t}");
    }

    private Partie? _p;
    private Label _date = null!, _pop = null!, _argent = null!, _palier = null!, _emplois = null!, _info = null!, _toast = null!, _objectifs = null!;
    private ProgressBar _dh = null!, _dc = null!, _da = null!;
    private VBoxContainer _messages = null!;
    private HBoxContainer _sousMenu = null!;
    private PanelContainer _budget = null!, _aide = null!;
    private Label _budgetDetail = null!;
    private HSlider _ih = null!, _ic = null!, _ia = null!;
    private Label _ihL = null!, _icL = null!, _iaL = null!;
    private readonly Dictionary<string, Button> _boutonsOutils = new();
    private readonly Button[] _vitesses = new Button[4];
    private double _toastTemps;
    private int _nbMessages = -1, _moisMessages = -1;
    private string _categorie = "";
    public string OutilActif { get; set; } = "";

    public static readonly Color Fond = new(0.10f, 0.12f, 0.15f, 0.88f);

    public override void _Ready()
    {
        SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        Size = GetViewportRect().Size;
        GetViewport().SizeChanged += () => Size = GetViewportRect().Size;
        MouseFilter = MouseFilterEnum.Ignore;
        Theme = new Theme { DefaultFontSize = 15 };
        ConstruireBarreHaut();
        ConstruireBarreBas();
        ConstruireMessages();
        ConstruireObjectifs();
        ConstruireBudget();
        ConstruireAide();
        _info = new Label { Position = new Vector2(12, 0), AutowrapMode = TextServer.AutowrapMode.Off };
        _info.SetAnchorsPreset(LayoutPreset.BottomLeft);
        _info.Position = new Vector2(14, -150);
        _info.AddThemeColorOverride("font_shadow_color", Colors.Black);
        _info.AddThemeConstantOverride("shadow_offset_x", 1);
        _info.AddThemeConstantOverride("shadow_offset_y", 1);
        AddChild(_info);
        _toast = new Label { HorizontalAlignment = HorizontalAlignment.Center, Visible = false };
        _toast.SetAnchorsPreset(LayoutPreset.CenterTop);
        _toast.Position = new Vector2(-300, 60);
        _toast.Size = new Vector2(600, 30);
        _toast.AddThemeFontSizeOverride("font_size", 18);
        _toast.AddThemeColorOverride("font_shadow_color", Colors.Black);
        _toast.AddThemeConstantOverride("shadow_offset_x", 2);
        _toast.AddThemeConstantOverride("shadow_offset_y", 2);
        AddChild(_toast);
    }

    public void Attacher(Partie p) { _p = p; _nbMessages = -1; foreach (var c in _messages.GetChildren()) c.QueueFree(); }

    private static PanelContainer Panneau()
    {
        var pc = new PanelContainer();
        pc.AddThemeStyleboxOverride("panel", new StyleBoxFlat { BgColor = Fond, CornerRadiusBottomLeft = 6, CornerRadiusBottomRight = 6, CornerRadiusTopLeft = 6, CornerRadiusTopRight = 6, ContentMarginLeft = 10, ContentMarginRight = 10, ContentMarginTop = 6, ContentMarginBottom = 6 });
        return pc;
    }

    private void ConstruireBarreHaut()
    {
        var pc = Panneau();
        pc.SetAnchorsPreset(LayoutPreset.TopWide);
        AddChild(pc);
        var h = new HBoxContainer();
        h.AddThemeConstantOverride("separation", 22);
        pc.AddChild(h);
        _date = new Label(); _pop = new Label(); _argent = new Label(); _palier = new Label(); _emplois = new Label();
        foreach (var l in new[] { _date, _palier, _pop, _emplois, _argent }) h.AddChild(l);
        var demandes = new HBoxContainer();
        demandes.AddChild(new Label { Text = "Demande :" });
        _dh = Barre(new Color(0.45f, 0.78f, 0.42f), "Habitat"); _dc = Barre(new Color(0.38f, 0.60f, 0.92f), "Commerce"); _da = Barre(new Color(0.95f, 0.78f, 0.30f), "Activités");
        foreach (var b in new[] { _dh, _dc, _da }) demandes.AddChild(b);
        h.AddChild(demandes);
        var esp = new Control { SizeFlagsHorizontal = SizeFlags.ExpandFill, MouseFilter = MouseFilterEnum.Ignore };
        h.AddChild(esp);
        string[] noms = { "II", ">", ">>", ">>>" };
        for (int i = 0; i < 4; i++)
        {
            int v = i;
            _vitesses[i] = new Button { Text = noms[i], ToggleMode = true, TooltipText = new[] { "Pause (Espace)", "Vitesse normale (1)", "Rapide (2)", "Très rapide (3)" }[i], CustomMinimumSize = new Vector2(44, 0) };
            _vitesses[i].Pressed += () => VitesseChoisie?.Invoke(v);
            h.AddChild(_vitesses[i]);
        }
        var aide = new Button { Text = "?", TooltipText = "Aide (F1)" };
        aide.Pressed += () => _aide.Visible = !_aide.Visible;
        h.AddChild(aide);
    }

    private static ProgressBar Barre(Color c, string nom)
    {
        var b = new ProgressBar { MinValue = -100, MaxValue = 100, CustomMinimumSize = new Vector2(70, 18), ShowPercentage = false, TooltipText = $"Demande {nom}" };
        b.AddThemeStyleboxOverride("fill", new StyleBoxFlat { BgColor = c });
        b.AddThemeStyleboxOverride("background", new StyleBoxFlat { BgColor = new Color(0.25f, 0.25f, 0.28f) });
        return b;
    }

    private static readonly (string cat, string nom, (string id, string texte)[] outils)[] Categories =
    {
        ("routes", "Routes", new[] { ("rue", "Rue"), ("avenue", "Avenue"), ("rue_courbe", "Rue courbe"), ("avenue_courbe", "Avenue courbe") }),
        ("zones", "Zones", new[] { ("habitat", "Habitat"), ("commerce", "Commerce"), ("activites", "Activités"), ("dezoner", "Dézoner") }),
        ("reseaux", "Eau & énergie", new[] { ("chateau_eau", "Château d'eau"), ("pompage_lac", "Pompage (lac)"), ("centrale_solaire", "Centrale solaire"), ("centrale_gaz", "Centrale au gaz") }),
        ("services", "Services", new[] { ("ecole", "École"), ("centre_sante", "Santé"), ("caserne_pompiers", "Pompiers"), ("commissariat", "Police"), ("centre_tri", "Déchets"), ("parc", "Parc"), ("arret_bus", "Arrêt de bus") }),
    };

    private void ConstruireBarreBas()
    {
        var bas = new VBoxContainer { MouseFilter = MouseFilterEnum.Ignore };
        bas.SetAnchorsPreset(LayoutPreset.CenterBottom);
        bas.GrowHorizontal = GrowDirection.Both;
        bas.GrowVertical = GrowDirection.Begin;
        bas.Position = new Vector2(0, -12);
        AddChild(bas);
        var pcSous = Panneau();
        _sousMenu = new HBoxContainer();
        _sousMenu.AddThemeConstantOverride("separation", 8);
        pcSous.AddChild(_sousMenu);
        pcSous.Visible = false;
        bas.AddChild(pcSous);
        var pc = Panneau();
        var h = new HBoxContainer();
        h.AddThemeConstantOverride("separation", 8);
        pc.AddChild(h);
        bas.AddChild(pc);
        foreach (var (cat, nom, outils) in Categories)
        {
            var b = new Button { Text = nom, CustomMinimumSize = new Vector2(110, 38) };
            b.Pressed += () =>
            {
                if (_categorie == cat && pcSous.Visible) { pcSous.Visible = false; _categorie = ""; return; }
                _categorie = cat;
                pcSous.Visible = true;
                foreach (var c in _sousMenu.GetChildren()) { _sousMenu.RemoveChild(c); c.QueueFree(); }
                _boutonsOutils.Clear();
                foreach (var (id, texte) in outils)
                {
                    var bo = new Button { Text = texte + Cout(id), ToggleMode = true, CustomMinimumSize = new Vector2(120, 34) };
                    bo.Pressed += () => OutilChoisi?.Invoke(OutilActif == id ? "" : id);
                    _sousMenu.AddChild(bo);
                    _boutonsOutils[id] = bo;
                }
            };
            h.AddChild(b);
        }
        var demolir = new Button { Text = "Démolir", CustomMinimumSize = new Vector2(100, 38), ToggleMode = true };
        demolir.Pressed += () => OutilChoisi?.Invoke(OutilActif == "demolir" ? "" : "demolir");
        _boutonsOutils["demolir"] = demolir;
        h.AddChild(demolir);
        var budget = new Button { Text = "Budget", CustomMinimumSize = new Vector2(100, 38) };
        budget.Pressed += () => _budget.Visible = !_budget.Visible;
        h.AddChild(budget);
        var vues = new Button { Text = "Vues", TooltipText = "Vues d'information : réseaux, attrait, trafic, services (V)", CustomMinimumSize = new Vector2(80, 38) };
        vues.Pressed += () => VueSuivante?.Invoke();
        h.AddChild(vues);
        var calque = new Button { Text = "Ville réelle", TooltipText = "Afficher/masquer la vraie ville en transparence (G)", CustomMinimumSize = new Vector2(110, 38) };
        calque.Pressed += () => CalqueBascule?.Invoke();
        h.AddChild(calque);
        var save = new Button { Text = "Sauver", TooltipText = "Sauvegarder (F5)", CustomMinimumSize = new Vector2(90, 38) };
        save.Pressed += () => Sauvegarder?.Invoke();
        h.AddChild(save);
    }

    private string Cout(string id)
    {
        if (_p == null) return "";
        if (_p.R.Services.TryGetValue(id, out var s)) return $"\n{s.Cout:N0} €";
        if (id is "rue" or "avenue" or "rue_courbe" or "avenue_courbe") return $"\n{_p.R.Route(id.Replace("_courbe", "")).CoutParM:N0} €/m";
        return "";
    }

    private void ConstruireMessages()
    {
        _messages = new VBoxContainer { MouseFilter = MouseFilterEnum.Ignore };
        _messages.SetAnchorsPreset(LayoutPreset.TopRight);
        _messages.Position = new Vector2(-430, 60);
        _messages.CustomMinimumSize = new Vector2(415, 0);
        AddChild(_messages);
    }

    private void ConstruireObjectifs()
    {
        var pc = Panneau();
        pc.Position = new Vector2(10, 56);
        pc.MouseFilter = MouseFilterEnum.Ignore;
        _objectifs = new Label { CustomMinimumSize = new Vector2(330, 0), AutowrapMode = TextServer.AutowrapMode.WordSmart };
        pc.AddChild(_objectifs);
        AddChild(pc);
    }

    private void ConstruireBudget()
    {
        _budget = Panneau();
        _budget.SetAnchorsPreset(LayoutPreset.Center);
        _budget.Position = new Vector2(-260, -230);
        _budget.CustomMinimumSize = new Vector2(520, 0);
        _budget.Visible = false;
        var v = new VBoxContainer();
        _budget.AddChild(v);
        v.AddChild(new Label { Text = "Budget de la commune", HorizontalAlignment = HorizontalAlignment.Center });
        (HSlider, Label) Impot(string nom, Zone z)
        {
            var h = new HBoxContainer();
            h.AddChild(new Label { Text = nom, CustomMinimumSize = new Vector2(190, 0) });
            var s = new HSlider { MinValue = 2, MaxValue = 25, Step = 0.5, CustomMinimumSize = new Vector2(220, 20) };
            var l = new Label { CustomMinimumSize = new Vector2(60, 0) };
            s.ValueChanged += val => { _p?.ReglerImpot(z, val / 100); l.Text = $"{val:F1} %"; };
            h.AddChild(s); h.AddChild(l);
            v.AddChild(h);
            return (s, l);
        }
        (_ih, _ihL) = Impot("Taxe des habitants", Zone.Habitat);
        (_ic, _icL) = Impot("Taxe des commerces", Zone.Commerce);
        (_ia, _iaL) = Impot("Taxe des activités", Zone.Activites);
        _budgetDetail = new Label();
        v.AddChild(_budgetDetail);
        var h2 = new HBoxContainer();
        var emprunt = new Button { Text = "Emprunter" };
        emprunt.Pressed += () => { if (_p != null) Toast(_p.Emprunter()); };
        var fermer = new Button { Text = "Fermer" };
        fermer.Pressed += () => _budget.Visible = false;
        h2.AddChild(emprunt); h2.AddChild(fermer);
        v.AddChild(h2);
        AddChild(_budget);
    }

    private void ConstruireAide()
    {
        _aide = Panneau();
        _aide.SetAnchorsPreset(LayoutPreset.Center);
        _aide.Position = new Vector2(-330, -220);
        _aide.Visible = false;
        _aide.AddChild(new Label
        {
            Text = "COMMANDES\n\n" +
                   "Se déplacer : Z Q S D (ou W A S D, ou flèches)        Tourner : A / E ou clic droit maintenu\n" +
                   "Incliner : R / F        Zoom : molette (zoomez au maximum pour la vue à hauteur d'habitant)\n" +
                   "Glisser la carte : clic molette maintenu\n\n" +
                   "Routes : cliquez le point de départ, puis le point d'arrivée. Clic droit ou Échap pour arrêter.\n" +
                   "Routes courbes : départ, puis point de courbure, puis arrivée.\n" +
                   "Zones : maintenez le clic gauche et peignez le long des rues.\n" +
                   "Services : cliquez sur un terrain libre le long d'une rue.\n\n" +
                   "Temps : Espace = pause, 1 / 2 / 3 = vitesses        G : vraie ville en transparence\n" +
                   "F5 : sauvegarder        Échap : annuler l'outil        V : vues d'information\n" +
                   "Ctrl + / Ctrl - : taille du texte\n\n" +
                   "Pour que la ville grandisse : une rue reliée à un grand axe, des zones, de l'eau et de l'électricité.\n" +
                   "Ce jeu est une fiction inspirée de données réelles. Ce n'est pas une prédiction.",
        });
        AddChild(_aide);
    }

    public void BasculerAide() => _aide.Visible = !_aide.Visible;

    public void Toast(Resultat r) => Toast(r.Message, r.Ok);

    public void Toast(string texte, bool ok = true)
    {
        _toast.Text = texte;
        _toast.AddThemeColorOverride("font_color", ok ? new Color(0.85f, 1f, 0.85f) : new Color(1f, 0.6f, 0.55f));
        _toast.Visible = true;
        _toastTemps = 3.5;
    }

    public void Info(string texte) => _info.Text = texte;

    public void MettreAJour(double delta, int vitesse)
    {
        if (_toastTemps > 0 && (_toastTemps -= delta) <= 0) _toast.Visible = false;
        for (int i = 0; i < 4; i++) _vitesses[i].ButtonPressed = i == vitesse;
        foreach (var (id, b) in _boutonsOutils)
        {
            b.ButtonPressed = id == OutilActif;
            if (_p != null && _p.R.Services.TryGetValue(id, out var s))
            {
                b.Disabled = s.Palier > _p.Palier;
                b.TooltipText = b.Disabled ? $"Débloqué au palier « {_p.R.Paliers[s.Palier].Nom} »" : s.Nom;
            }
        }
        if (_p == null) return;
        var p = _p;
        int annee = 2027 + p.Mois / 12;
        string[] mois = { "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre" };
        _date.Text = $"{p.Paquet.Manifest.Ville.Nom} · {p.Jour % 30 + 1} {mois[p.Mois % 12]} {annee}";
        _palier.Text = p.R.Paliers[p.Palier].Nom;
        _pop.Text = $"{p.Population:N0} habitants";
        _emplois.Text = $"Emplois {p.EmploisLocaux:N0} · chômeurs {p.Chomeurs:N0}";
        double solde = p.RecettesMois - p.DepensesMois;
        _argent.Text = $"{p.Argent:N0} € ({(solde >= 0 ? "+" : "")}{solde:N0}/mois)";
        _argent.AddThemeColorOverride("font_color", p.Argent < 0 ? new Color(1, 0.5f, 0.45f) : Colors.White);
        _dh.Value = p.DemandeHabitat; _dc.Value = p.DemandeCommerce; _da.Value = p.DemandeActivites;
        if (_budget.Visible) MettreAJourBudget();
        if (_nbMessages != p.Messages.Count || p.Mois != _moisMessages) { _moisMessages = p.Mois; MettreAJourMessages(); }
        MettreAJourObjectifs();
    }

    private void MettreAJourBudget()
    {
        var p = _p!;
        _ih.SetValueNoSignal(p.ImpotHabitat * 100); _ihL.Text = $"{p.ImpotHabitat * 100:F1} %";
        _ic.SetValueNoSignal(p.ImpotCommerce * 100); _icL.Text = $"{p.ImpotCommerce * 100:F1} %";
        _ia.SetValueNoSignal(p.ImpotActivites * 100); _iaL.Text = $"{p.ImpotActivites * 100:F1} %";
        var t = new System.Text.StringBuilder("\nLe mois dernier :\n");
        foreach (var (k, v) in p.DetailRecettes) t.AppendLine($"  + {k} : {v:N0} €");
        foreach (var (k, v) in p.DetailDepenses) t.AppendLine($"  − {k} : {v:N0} €");
        t.AppendLine($"  = Solde : {p.RecettesMois - p.DepensesMois:N0} €");
        t.AppendLine($"\nEau : {p.EauConsommee:N0} / {p.EauProduite:N0}    Électricité : {p.ElecConsommee:N0} / {p.ElecProduite:N0}");
        if (p.Emprunts.Count > 0) t.AppendLine($"Emprunts : {p.Emprunts.Count} ({p.Emprunts.Sum(e => e.Restant):N0} € restant à rembourser)");
        _budgetDetail.Text = t.ToString();
    }

    private void MettreAJourMessages()
    {
        var p = _p!;
        _nbMessages = p.Messages.Count;
        foreach (var c in _messages.GetChildren()) c.QueueFree();
        // 4 derniers messages des 4 derniers mois, sans doublon de texte
        var recents = p.Messages.Where(m => p.Jour - m.Jour < 120).Reverse()
            .DistinctBy(m => m.Texte.Contains('«') ? m.Texte[m.Texte.IndexOf('«')..] : m.Texte).Take(4).Reverse();
        foreach (var m in recents)
        {
            var pc = Panneau();
            pc.MouseFilter = MouseFilterEnum.Ignore;
            var col = m.Type switch { "alerte" => new Color(1f, 0.75f, 0.55f), "palier" => new Color(1f, 0.92f, 0.5f), "habitant" => new Color(0.75f, 0.9f, 1f), _ => Colors.White };
            var l = new Label { Text = m.Texte, AutowrapMode = TextServer.AutowrapMode.WordSmart, CustomMinimumSize = new Vector2(395, 0) };
            l.AddThemeColorOverride("font_color", col);
            l.AddThemeFontSizeOverride("font_size", 14);
            pc.AddChild(l);
            _messages.AddChild(pc);
        }
    }

    /// <summary>Tutoriel continu : les 3 problèmes les plus urgents, avec la solution.</summary>
    private static string Conseils(Partie p)
    {
        var c = new List<string>();
        bool A(string s) => p.ServiceDisponible(s);
        bool Existe(string s) => p.Parcelles.Values.Any(x => x.Service == s);
        if (p.Argent < 0) c.Add("Budget négatif : augmentez un peu les taxes (Budget) ou empruntez.");
        if (p.EauProduite > 0 && p.EauConsommee > p.EauProduite * 0.9) c.Add("L'eau va manquer : ajoutez un château d'eau ou une station de pompage.");
        if (p.ElecProduite > 0 && p.ElecConsommee > p.ElecProduite * 0.9) c.Add("L'électricité va manquer : ajoutez une centrale.");
        if (A("centre_tri") && p.DechetsProduits > p.DechetsCapacite * 0.9) c.Add("Les déchets s'accumulent : construisez un centre de tri.");
        if (p.Actifs > 150 && p.Chomeurs > p.Actifs * 0.1) c.Add($"{p.Chomeurs:N0} chômeurs : zonez des activités ou des commerces.");
        if (p.DemandeHabitat > 40 && !p.Parcelles.Values.Any(x => x.Zone == Zone.Habitat && x.Libre)) c.Add("Les gens veulent s'installer : zonez plus d'habitat.");
        if (p.DemandeCommerce > 40 && !p.Parcelles.Values.Any(x => x.Zone == Zone.Commerce && x.Libre)) c.Add("Les habitants manquent de commerces : zonez du commerce.");
        if (A("ecole") && p.Enfants > 60 && !Existe("ecole")) c.Add("Des enfants sans école : construisez une école.");
        if (A("centre_sante") && p.Population > p.R.Risques.PopulationSansSanteMax && !Existe("centre_sante")) c.Add("Pas de médecin : construisez un centre de santé.");
        if (A("caserne_pompiers") && !Existe("caserne_pompiers") && p.Palier >= 2) c.Add("Risque d'incendie : construisez une caserne de pompiers.");
        if (A("commissariat") && p.Population > p.R.Risques.PopulationSansPoliceMax && !Existe("commissariat")) c.Add("Insécurité : construisez un commissariat.");
        if (p.RueLaPlusChargee != null) c.Add($"Bouchons sur {p.RueLaPlusChargee} : une rue parallèle ou une ligne de bus aidera (vue trafic : V).");
        return c.Count == 0 ? "" : "\n\nCONSEILS DU MOMENT\n• " + string.Join("\n• ", c.Take(3));
    }

    private void MettreAJourObjectifs()
    {
        var p = _p!;
        bool rue = p.Reseau.Aretes.Values.Any(e => !e.Departemental);
        bool hab = p.Parcelles.Values.Any(x => x.Zone == Zone.Habitat);
        bool eau = p.EauProduite > 0, elec = p.ElecProduite > 0;
        bool emplois = p.Parcelles.Values.Any(x => x.Zone is Zone.Commerce or Zone.Activites);
        var suivant = p.Palier + 1 < p.R.Paliers.Count ? p.R.Paliers[p.Palier + 1] : null;
        string c(bool ok) => ok ? "[x]" : "[  ]";
        _objectifs.Text = !p.ModeVilleReelle && !(rue && hab && eau && elec && emplois)
            ? "PREMIERS PAS\n" +
              $"{c(rue)} Tracer une rue reliée à un grand axe (gris clair)\n" +
              $"{c(hab)} Zoner de l'habitat le long de la rue\n" +
              $"{c(eau)} Construire un château d'eau\n" +
              $"{c(elec)} Construire une centrale solaire\n" +
              $"{c(emplois)} Zoner des commerces ou des activités (emplois)"
            : (suivant != null
                ? $"PROCHAIN PALIER : {suivant.Nom}\n{p.Population:N0} / {suivant.Population:N0} habitants"
                : "Tous les paliers sont atteints. Bravo !") + Conseils(p);
    }
}
