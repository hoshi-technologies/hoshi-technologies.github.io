using System.Text.Json;
using Godot;
using Jeu.Jeu;

namespace Jeu.Interface;

/// <summary>Menu pause (Échap) : reprendre, sauvegarder sous un nom, charger, options, menu principal, quitter.</summary>
public partial class MenuPause : Control
{
    public Action? Reprendre, MenuPrincipal;
    public Action<string>? Sauvegarder, Charger;
    public Action? OptionsModifiees;
    public Options Options = null!;
    public string DossierSauvegardes = "";
    private VBoxContainer _contenu = null!;

    public override void _Ready()
    {
        SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        CallDeferred(Control.MethodName.SetSize, GetViewportRect().Size, false);
        GetViewport().SizeChanged += () => CallDeferred(Control.MethodName.SetSize, GetViewportRect().Size, false);
        var fond = new ColorRect { Color = new Color(0, 0, 0, 0.45f), MouseFilter = MouseFilterEnum.Stop };
        fond.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(fond);
        var centre = new CenterContainer();
        centre.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(centre);
        var pc = new PanelContainer { CustomMinimumSize = new Vector2(520, 0) };
        pc.AddThemeStyleboxOverride("panel", new StyleBoxFlat { BgColor = new Color(0.17f, 0.20f, 0.26f, 0.98f), BorderColor = new Color(0.55f, 0.65f, 0.80f), BorderWidthLeft = 2, BorderWidthRight = 2, BorderWidthTop = 2, BorderWidthBottom = 2, ContentMarginLeft = 18, ContentMarginRight = 18, ContentMarginTop = 14, ContentMarginBottom = 14, CornerRadiusTopLeft = 8, CornerRadiusTopRight = 8, CornerRadiusBottomLeft = 8, CornerRadiusBottomRight = 8 });
        centre.AddChild(pc);
        _contenu = new VBoxContainer();
        _contenu.AddThemeConstantOverride("separation", 10);
        pc.AddChild(_contenu);
        Principal();
    }

    private void Vider() { foreach (var c in _contenu.GetChildren()) { _contenu.RemoveChild(c); c.QueueFree(); } }

    private Button Bouton(string texte, Action a)
    {
        var b = new Button { Text = texte, CustomMinimumSize = new Vector2(0, 40) };
        b.Pressed += a;
        _contenu.AddChild(b);
        return b;
    }

    private void Titre(string t)
    {
        var l = new Label { Text = t, HorizontalAlignment = HorizontalAlignment.Center };
        l.AddThemeFontSizeOverride("font_size", 24);
        _contenu.AddChild(l);
    }

    public void Principal()
    {
        Vider();
        Titre("Pause");
        Bouton("Reprendre", () => Reprendre?.Invoke());
        Bouton("Sauvegarder…", EcranSauvegarde);
        Bouton("Charger une partie…", EcranChargement);
        Bouton("Options…", EcranOptions);
        Bouton("Menu principal", () => MenuPrincipal?.Invoke());
        Bouton("Quitter le jeu", () => GetTree().Quit());
    }

    private void EcranSauvegarde()
    {
        Vider();
        Titre("Sauvegarder");
        var nom = new LineEdit { Text = $"Partie du {DateTime.Now:dd-MM-yyyy HH'h'mm}", CustomMinimumSize = new Vector2(0, 36) };
        _contenu.AddChild(nom);
        Bouton("Enregistrer", () =>
        {
            var propre = string.Concat(nom.Text.Select(ch => char.IsLetterOrDigit(ch) || ch is ' ' or '-' or '_' ? ch : '_')).Trim();
            if (propre.Length == 0) propre = "partie";
            Sauvegarder?.Invoke(propre);
            Principal();
        });
        Bouton("Retour", Principal);
    }

    /// <summary>Informations courtes d'une sauvegarde (fichier .info.json écrit à côté).</summary>
    public sealed record InfoSauvegarde(string Nom, string Ville, string Carte, string Mode, string Date, int Population, double Argent, DateTime Horodatage);

    private void EcranChargement()
    {
        Vider();
        Titre("Charger une partie");
        var liste = new ItemList { CustomMinimumSize = new Vector2(480, 260) };
        var fichiers = new List<string>();
        foreach (var f in System.IO.Directory.EnumerateFiles(DossierSauvegardes, "*.json").Where(f => !f.EndsWith(".info.json"))
                     .OrderByDescending(System.IO.File.GetLastWriteTimeUtc))
        {
            string texte = System.IO.Path.GetFileNameWithoutExtension(f);
            var info = f[..^5] + ".info.json";
            if (System.IO.File.Exists(info))
            {
                try
                {
                    var i = JsonSerializer.Deserialize<InfoSauvegarde>(System.IO.File.ReadAllText(info))!;
                    texte = $"{i.Nom} — {i.Ville} ({i.Carte}, {i.Mode}) — {i.Date} — {i.Population:N0} hab.";
                }
                catch { /* informations illisibles : on garde le nom du fichier */ }
            }
            liste.AddItem(texte);
            fichiers.Add(f);
        }
        _contenu.AddChild(liste);
        if (fichiers.Count == 0) _contenu.AddChild(new Label { Text = "Aucune sauvegarde pour l'instant." });
        Bouton("Charger la partie sélectionnée", () =>
        {
            var sel = liste.GetSelectedItems();
            if (sel.Length > 0) Charger?.Invoke(fichiers[sel[0]]);
        });
        Bouton("Retour", Principal);
    }

    private void EcranOptions()
    {
        Vider();
        Titre("Options");
        HBoxContainer Ligne(string nom)
        {
            var h = new HBoxContainer();
            h.AddChild(new Label { Text = nom, CustomMinimumSize = new Vector2(200, 0) });
            _contenu.AddChild(h);
            return h;
        }
        var vol = new HSlider { MinValue = 0, MaxValue = 1, Step = 0.05, Value = Options.Volume, CustomMinimumSize = new Vector2(240, 24) };
        vol.ValueChanged += v => { Options.Volume = (float)v; OptionsModifiees?.Invoke(); };
        Ligne("Volume").AddChild(vol);
        var muet = new CheckBox { Text = "Couper le son", ButtonPressed = Options.Muet };
        muet.Toggled += v => { Options.Muet = v; OptionsModifiees?.Invoke(); };
        Ligne("").AddChild(muet);
        var qual = new OptionButton();
        foreach (var q in new[] { "Basse (PC modeste)", "Moyenne", "Haute" }) qual.AddItem(q);
        qual.Selected = Options.Qualite;
        qual.ItemSelected += i => { Options.Qualite = (int)i; OptionsModifiees?.Invoke(); };
        Ligne("Qualité graphique").AddChild(qual);
        var taille = new SpinBox { MinValue = 12, MaxValue = 26, Step = 1, Value = Options.TailleTexte };
        taille.ValueChanged += v => { Options.TailleTexte = (int)v; OptionsModifiees?.Invoke(); };
        Ligne("Taille du texte").AddChild(taille);
        var dalto = new CheckBox { Text = "Couleurs adaptées au daltonisme", ButtonPressed = Options.Daltonisme };
        dalto.Toggled += v => { Options.Daltonisme = v; OptionsModifiees?.Invoke(); };
        Ligne("Accessibilité").AddChild(dalto);
        _contenu.AddChild(new Label { Text = "Manette : stick gauche = déplacer, stick droit = tourner, gâchettes = zoom.", AutowrapMode = TextServer.AutowrapMode.WordSmart });
        Bouton("Retour", () => { Options.Enregistrer(); Principal(); });
    }
}
