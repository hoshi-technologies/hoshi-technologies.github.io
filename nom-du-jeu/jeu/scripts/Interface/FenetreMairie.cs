using Godot;
using Ville.Coeur;
using Ville.Gestion;

namespace Jeu.Interface;

/// <summary>Fenêtre « Mairie » : satisfaction des quartiers, politiques publiques, objectifs facultatifs.</summary>
public partial class FenetreMairie : PanelContainer
{
    private Partie? _p;
    private TabContainer _onglets = null!;
    private VBoxContainer _quartiers = null!, _politiques = null!, _objectifs = null!, _conseil = null!;
    public Action<string, bool>? Toast;
    private int _moisAffiche = -1;

    public override void _Ready()
    {
        AddThemeStyleboxOverride("panel", new StyleBoxFlat { BgColor = new Color(0.14f, 0.17f, 0.22f, 0.97f), BorderColor = new Color(0.55f, 0.65f, 0.80f), BorderWidthLeft = 2, BorderWidthRight = 2, BorderWidthTop = 2, BorderWidthBottom = 2, ContentMarginLeft = 12, ContentMarginRight = 12, ContentMarginTop = 10, ContentMarginBottom = 10, CornerRadiusTopLeft = 6, CornerRadiusTopRight = 6, CornerRadiusBottomLeft = 6, CornerRadiusBottomRight = 6 });
        CustomMinimumSize = new Vector2(680, 520);
        var v = new VBoxContainer();
        AddChild(v);
        var titre = new HBoxContainer();
        var l = new Label { Text = "Mairie", SizeFlagsHorizontal = SizeFlags.ExpandFill };
        l.AddThemeFontSizeOverride("font_size", 22);
        titre.AddChild(l);
        var fermer = new Button { Text = "Fermer" };
        fermer.Pressed += () => Visible = false;
        titre.AddChild(fermer);
        v.AddChild(titre);
        _onglets = new TabContainer { SizeFlagsVertical = SizeFlags.ExpandFill };
        v.AddChild(_onglets);
        _quartiers = Onglet("Quartiers");
        _politiques = Onglet("Politiques publiques");
        _objectifs = Onglet("Objectifs");
        _conseil = Onglet("Conseil et élections");
    }

    private VBoxContainer Onglet(string nom)
    {
        var defil = new ScrollContainer { Name = nom, HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled };
        var v = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        v.AddThemeConstantOverride("separation", 6);
        defil.AddChild(v);
        _onglets.AddChild(defil);
        return v;
    }

    public void Onglet(int i) => _onglets.CurrentTab = i;

    public void Afficher(Partie p)
    {
        _p = p;
        Visible = true;
        var taille = new Vector2(Math.Max(Size.X, CustomMinimumSize.X), Math.Max(Size.Y, CustomMinimumSize.Y));
        Position = ((GetViewportRect().Size - taille) / 2).Floor();
        _moisAffiche = -1;
        Rafraichir();
    }

    public override void _Process(double delta)
    {
        if (Visible && _p != null && _p.Mois != _moisAffiche) Rafraichir();
    }

    private static void Vider(Container c) { foreach (var n in c.GetChildren()) { c.RemoveChild(n); n.QueueFree(); } }

    private void RemplirConseil()
    {
        var el = _p!.Module<Elections>();
        if (el == null)
        {
            _conseil.AddChild(new Label { Text = "Les élections ne sont pas activées dans cette partie (option à cocher au lancement).", AutowrapMode = TextServer.AutowrapMode.WordSmart });
            return;
        }
        var e = el.E;
        _conseil.AddChild(new Label
        {
            Text = el.EnOpposition
                ? $"Vous êtes dans l'opposition : élection anticipée dans {e.MoisOppositionRestants} mois."
                : $"Mandat n° {e.Mandat} — élections dans {Math.Max(0, el.MoisRestants(_p) / 12)} an(s) et {Math.Max(0, el.MoisRestants(_p) % 12)} mois.",
        });
        var pop = new Label { Text = $"Popularité : {e.Popularite:F0} %   (il faut 50 % pour être réélu)" };
        pop.AddThemeColorOverride("font_color", Rendu.RenduVille.EchelleCouleur((e.Popularite - 35) / 30));
        _conseil.AddChild(pop);
        _conseil.AddChild(new Label { Text = $"Conseil municipal : {el.TotalSieges} sièges — {(el.MajoritePropre ? "vous avez la majorité" : "PAS de majorité : il faudra des alliances")}" });
        var noms = el.Groupes().ToDictionary(g => g.id, g => g);
        foreach (var (id, n) in e.Sieges)
        {
            string nom = id == "maire" ? "Votre liste" : noms[id].nom;
            string prio = id == "maire" ? "" : "  — soutient : " + string.Join(", ", noms[id].priorites.Select(x => _p.Module<VraieGestion>()?.CataloguePolitiques().FirstOrDefault(c => c.id == x).nom ?? x));
            _conseil.AddChild(new Label { Text = $"   {nom} : {n} siège{(n > 1 ? "s" : "")}{prio}", AutowrapMode = TextServer.AutowrapMode.WordSmart });
        }
        _conseil.AddChild(new Label { Text = "Les politiques publiques sont votées par le conseil : sans majorité, il faut le soutien d'un groupe ou un compromis.", AutowrapMode = TextServer.AutowrapMode.WordSmart });
        bool modifiable = el.PromessesModifiables(_p);
        _conseil.AddChild(new Label { Text = modifiable ? "Vos promesses (3 au maximum, à choisir dans les 6 premiers mois du mandat) :" : "Vos promesses de campagne :" });
        foreach (var (id, nom) in el.CataloguePromesses())
        {
            bool promis = e.Promesses.Contains(id);
            if (!modifiable && !promis) continue;
            var c = new CheckBox { Text = $"{nom}   {(promis ? (el.PromesseTenue(_p, id) ? "(tenue pour l'instant)" : "(pas encore tenue)") : "")}", ButtonPressed = promis, Disabled = !modifiable };
            string ident = id;
            c.Toggled += on => { el.PromettreOuRetirer(_p!, ident, on); CallDeferred(MethodName.Rafraichir); };
            _conseil.AddChild(c);
        }
        if (e.Historique.Count > 0) _conseil.AddChild(new Label { Text = "Résultats passés : " + string.Join(" ; ", e.Historique) });
        _conseil.AddChild(new Label { Text = "Toutes les listes et personnes sont fictives.", Modulate = new Color(1, 1, 1, 0.6f) });
    }

    private void Rafraichir()
    {
        if (_p == null) return;
        _moisAffiche = _p.Mois;
        var g = _p.Module<VraieGestion>();
        Vider(_quartiers); Vider(_politiques); Vider(_objectifs); Vider(_conseil);
        RemplirConseil();
        if (g == null)
        {
            foreach (var c in new[] { _quartiers, _politiques, _objectifs })
                c.AddChild(new Label { Text = "Le module « vraie gestion » n'est pas activé dans cette partie (à cocher au lancement).", AutowrapMode = TextServer.AutowrapMode.WordSmart });
            return;
        }
        // --- quartiers
        _quartiers.AddChild(new Label { Text = $"Satisfaction moyenne : {g.SatisfactionGlobale:F0} / 100   (mise à jour chaque fin de mois ; vue « Satisfaction » avec V)" });
        var grille = new GridContainer { Columns = 5 };
        foreach (var t in new[] { "Quartier", "Habitants", "Familles", "Jeunes actifs", "Seniors" })
            grille.AddChild(new Label { Text = t, CustomMinimumSize = new Vector2(t == "Quartier" ? 230 : 95, 0) });
        foreach (var q in g.Quartiers.Where(q => q.Population > 20).OrderByDescending(q => q.Population).Take(40))
        {
            grille.AddChild(new Label { Text = q.Nom, ClipText = true, CustomMinimumSize = new Vector2(230, 0) });
            grille.AddChild(new Label { Text = q.Population.ToString("N0") });
            foreach (var s in new[] { q.Familles, q.JeunesActifs, q.Seniors })
            {
                var l = new Label { Text = $"{s:F0}" };
                l.AddThemeColorOverride("font_color", Rendu.RenduVille.EchelleCouleur((s - 25) / 50));
                grille.AddChild(l);
            }
        }
        _quartiers.AddChild(grille);
        _quartiers.AddChild(new Label
        {
            Text = "Familles : école, parcs, sécurité, cadre de vie, impôts.  Jeunes actifs : emploi, bus, commerces, bouchons, loyers.  Seniors : médecins, sécurité, calme, bus, impôts.",
            AutowrapMode = TextServer.AutowrapMode.WordSmart,
        });
        // --- politiques
        _politiques.AddChild(new Label { Text = "Chaque politique a un coût mensuel par habitant et des effets sur la ville.", AutowrapMode = TextServer.AutowrapMode.WordSmart });
        foreach (var (id, nom, cout, effet) in g.CataloguePolitiques())
        {
            var c = new CheckBox
            {
                Text = $"{nom}  ({(cout >= 0 ? "" : "économie ")}{Math.Abs(cout * _p.Population):N0} {_p.R.Monnaie}/mois)",
                ButtonPressed = g.Active(id),
            };
            string ident = id;
            c.Toggled += on =>
            {
                if (_p!.Module<Elections>() is { } el)
                {
                    var r = el.VoterPolitique(_p, ident, on);
                    Toast?.Invoke(r.Message, r.Ok);
                    CallDeferred(MethodName.Rafraichir);
                }
                else g.ActiverPolitique(_p, ident, on);
            };
            _politiques.AddChild(c);
            var e = new Label { Text = "      " + effet, AutowrapMode = TextServer.AutowrapMode.WordSmart };
            e.AddThemeColorOverride("font_color", new Color(0.75f, 0.8f, 0.88f));
            e.AddThemeFontSizeOverride("font_size", 13);
            _politiques.AddChild(e);
        }
        // --- objectifs
        _objectifs.AddChild(new Label { Text = "Objectifs facultatifs : choisissez un cap pour votre mandat. Tous sont suivis ; celui choisi est mis en avant.", AutowrapMode = TextServer.AutowrapMode.WordSmart });
        var choix = new OptionButton();
        choix.AddItem("Aucun objectif particulier");
        foreach (var (_, nom) in VraieGestion.ListeObjectifs) choix.AddItem(nom);
        choix.Selected = g.E.Objectif == null ? 0 : 1 + Array.FindIndex(VraieGestion.ListeObjectifs, o => o.id == g.E.Objectif);
        choix.ItemSelected += i => { g.ChoisirObjectif(i == 0 ? null : VraieGestion.ListeObjectifs[i - 1].id); Rafraichir(); };
        _objectifs.AddChild(choix);
        foreach (var (id, nom) in VraieGestion.ListeObjectifs)
        {
            bool atteint = g.E.ObjectifsAtteints.Contains(id);
            var t = new Label { Text = (id == g.E.Objectif ? "► " : "") + nom + (atteint ? "   — ATTEINT" : "") };
            t.AddThemeFontSizeOverride("font_size", 17);
            if (atteint) t.AddThemeColorOverride("font_color", new Color(1f, 0.88f, 0.45f));
            _objectifs.AddChild(t);
            foreach (var (cond, ok) in g.Conditions(_p, id))
                _objectifs.AddChild(new Label { Text = $"    {(ok ? "[x]" : "[  ]")} {cond}" });
        }
    }
}
