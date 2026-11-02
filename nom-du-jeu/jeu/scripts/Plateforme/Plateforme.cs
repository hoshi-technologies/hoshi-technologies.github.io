using System.Text.Json;
using Godot;

namespace Jeu.Plateforme;

/// <summary>
/// Ce que le jeu demande à la plateforme de distribution. Le jeu marche entièrement sans elle (hors ligne) :
/// si Steam n'est pas là, on utilise <see cref="PlateformeLocale"/> qui garde les succès dans un fichier.
/// Aucune clé secrète ici : le numéro d'application Steam (AppID) est public.
/// </summary>
public interface IPlateforme
{
    string Nom { get; }
    IReadOnlySet<string> SuccesObtenus { get; }
    void DebloquerSucces(string id);
    /// <summary>À appeler à chaque image (traite les messages de Steam).</summary>
    void Traiter();
    void Fermer();
}

/// <summary>Sans Steam : les succès sont gardés dans user://succes.json.</summary>
public sealed class PlateformeLocale : IPlateforme
{
    private readonly HashSet<string> _obtenus = new();
    private readonly string _fichier = ProjectSettings.GlobalizePath("user://succes.json");
    public string Nom => "hors ligne";
    public IReadOnlySet<string> SuccesObtenus => _obtenus;

    public PlateformeLocale()
    {
        try
        {
            if (System.IO.File.Exists(_fichier))
                _obtenus.UnionWith(JsonSerializer.Deserialize<List<string>>(System.IO.File.ReadAllText(_fichier)) ?? new());
        }
        catch (Exception e) { GD.PrintErr($"succes.json illisible : {e.Message}"); }
    }

    public void DebloquerSucces(string id)
    {
        if (!_obtenus.Add(id)) return;
        try { System.IO.File.WriteAllText(_fichier, JsonSerializer.Serialize(_obtenus.Order().ToList())); }
        catch (Exception e) { GD.PrintErr($"succes.json non écrit : {e.Message}"); }
    }

    public void Traiter() { }
    public void Fermer() { }
}

/// <summary>Réglages Steam lus dans donnees/steam.json (fichier public, sans secret).</summary>
public sealed record ReglagesSteam(uint AppId, uint AppIdDemo, string UrlMagasin)
{
    public static ReglagesSteam Lire(string racine)
    {
        var f = System.IO.Path.Combine(racine, "donnees", "steam.json");
        if (!System.IO.File.Exists(f)) return new(0, 0, "");
        using var d = JsonDocument.Parse(System.IO.File.ReadAllText(f));
        var r = d.RootElement;
        return new(r.GetProperty("app_id").GetUInt32(), r.GetProperty("app_id_demo").GetUInt32(), r.GetProperty("url_magasin").GetString() ?? "");
    }
}

public static class Plateformes
{
    /// <summary>Choisit Steam si un AppID est renseigné et que Steam répond ; sinon le mode hors ligne.
    /// Renvoie null si Steam demande de relancer le jeu par son intermédiaire (le jeu doit alors se fermer).</summary>
    public static IPlateforme? Creer(string racine, bool demo)
    {
        var locale = new PlateformeLocale();
        ReglagesSteam r;
        try { r = ReglagesSteam.Lire(racine); }
        catch (Exception e) { GD.PrintErr($"steam.json illisible : {e.Message}"); return locale; }
        uint appId = demo ? r.AppIdDemo : r.AppId;
        if (appId == 0) return locale;            // pas encore de page Steam : hors ligne
        try
        {
            return PlateformeSteam.Demarrer(appId, locale);
        }
        catch (Exception e) when (e is DllNotFoundException or EntryPointNotFoundException or BadImageFormatException or TypeInitializationException)
        {
            GD.PrintErr($"Steam indisponible ({e.GetType().Name}) : mode hors ligne.");
            return locale;
        }
    }
}
