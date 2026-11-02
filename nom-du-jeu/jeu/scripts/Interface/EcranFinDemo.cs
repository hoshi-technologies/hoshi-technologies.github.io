using Godot;

namespace Jeu.Interface;

/// <summary>Écran affiché à la fin de la démo (limite de temps de jeu). Aucun lien n'est ouvert sans clic du joueur.</summary>
public partial class EcranFinDemo : Control
{
    public string UrlMagasin = "";
    public Action? MenuPrincipal;

    public override void _Ready()
    {
        SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        CallDeferred(Control.MethodName.SetSize, GetViewportRect().Size, false);
        var fond = new ColorRect { Color = new Color(0, 0, 0, 0.6f), MouseFilter = MouseFilterEnum.Stop };
        fond.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(fond);
        var centre = new CenterContainer();
        centre.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(centre);
        var pc = new PanelContainer { CustomMinimumSize = new Vector2(560, 0) };
        pc.AddThemeStyleboxOverride("panel", new StyleBoxFlat { BgColor = new Color(0.17f, 0.20f, 0.26f, 0.98f), ContentMarginLeft = 22, ContentMarginRight = 22, ContentMarginTop = 18, ContentMarginBottom = 18, CornerRadiusTopLeft = 8, CornerRadiusTopRight = 8, CornerRadiusBottomLeft = 8, CornerRadiusBottomRight = 8 });
        centre.AddChild(pc);
        var v = new VBoxContainer();
        v.AddThemeConstantOverride("separation", 12);
        pc.AddChild(v);
        var t = new Label { Text = "Fin de la démo", HorizontalAlignment = HorizontalAlignment.Center };
        t.AddThemeFontSizeOverride("font_size", 28);
        v.AddChild(t);
        v.AddChild(new Label
        {
            Text = "Merci d'avoir joué ! La démo s'arrête après 5 ans de mandat.\n" +
                   "Votre partie est sauvegardée : elle se charge dans le jeu complet, avec les autres villes de France et des États-Unis.",
            AutowrapMode = TextServer.AutowrapMode.WordSmart, HorizontalAlignment = HorizontalAlignment.Center,
        });
        if (UrlMagasin != "")
        {
            var b = new Button { Text = "Ajouter à ma liste de souhaits (page Steam)", CustomMinimumSize = new Vector2(0, 44) };
            b.Pressed += () => OS.ShellOpen(UrlMagasin);
            v.AddChild(b);
        }
        var m = new Button { Text = "Menu principal", CustomMinimumSize = new Vector2(0, 38) };
        m.Pressed += () => { MenuPrincipal?.Invoke(); QueueFree(); };
        v.AddChild(m);
        var q = new Button { Text = "Quitter", CustomMinimumSize = new Vector2(0, 34) };
        q.Pressed += () => GetTree().Quit();
        v.AddChild(q);
    }
}
