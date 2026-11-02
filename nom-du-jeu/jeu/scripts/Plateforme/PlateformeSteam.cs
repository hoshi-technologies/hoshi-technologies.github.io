using Godot;
using Steamworks;

namespace Jeu.Plateforme;

/// <summary>
/// Steam via Steamworks.NET : succès uniquement (les sauvegardes passent par Steam Auto-Cloud, réglé sur le
/// site Steamworks, sans code). Tout échec de Steam ramène au mode hors ligne : le jeu ne dépend jamais de Steam.
/// </summary>
public sealed class PlateformeSteam : IPlateforme
{
    private readonly PlateformeLocale _locale;
    private bool _aEnvoyer;
    public string Nom => "Steam";
    public IReadOnlySet<string> SuccesObtenus => _locale.SuccesObtenus;

    private PlateformeSteam(PlateformeLocale locale) { _locale = locale; }

    public static IPlateforme? Demarrer(uint appId, PlateformeLocale locale)
    {
        // lancé hors de Steam : Steam relance le jeu proprement (version commerciale uniquement)
        if (SteamAPI.RestartAppIfNecessary(new AppId_t(appId))) return null;
        if (!SteamAPI.Init())
        {
            GD.Print("Steam ne répond pas : mode hors ligne.");
            return locale;
        }
        var p = new PlateformeSteam(locale);
        // succès gagnés hors ligne : on les rattrape sur Steam
        foreach (var id in locale.SuccesObtenus) SteamUserStats.SetAchievement(id);
        p._aEnvoyer = locale.SuccesObtenus.Count > 0;
        return p;
    }

    public void DebloquerSucces(string id)
    {
        _locale.DebloquerSucces(id);
        SteamUserStats.SetAchievement(id);
        _aEnvoyer = true;
    }

    public void Traiter()
    {
        SteamAPI.RunCallbacks();
        if (_aEnvoyer) { _aEnvoyer = !SteamUserStats.StoreStats(); }
    }

    public void Fermer() => SteamAPI.Shutdown();
}
