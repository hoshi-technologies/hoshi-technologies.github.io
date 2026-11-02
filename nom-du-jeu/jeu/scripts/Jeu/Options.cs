using System.Text.Json;
using Godot;

namespace Jeu.Jeu;

/// <summary>Réglages du joueur, enregistrés dans user://options.json et rechargés au démarrage.</summary>
public sealed class Options
{
    public float Volume { get; set; } = 0.8f;
    public bool Muet { get; set; }
    public int TailleTexte { get; set; } = 15;
    /// <summary>0 = basse, 1 = moyenne, 2 = haute.</summary>
    public int Qualite { get; set; } = 1;
    /// <summary>Couleurs adaptées aux daltoniens (zones et vues d'information).</summary>
    public bool Daltonisme { get; set; }
    public bool TutorielTermine { get; set; }

    private static string Chemin => ProjectSettings.GlobalizePath("user://options.json");

    public static Options Charger()
    {
        try
        {
            if (System.IO.File.Exists(Chemin))
                return JsonSerializer.Deserialize<Options>(System.IO.File.ReadAllText(Chemin)) ?? new Options();
        }
        catch (Exception e) { GD.PrintErr("Options illisibles : " + e.Message); }
        return new Options();
    }

    public void Enregistrer()
    {
        try { System.IO.File.WriteAllText(Chemin, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true })); }
        catch (Exception e) { GD.PrintErr("Options non enregistrées : " + e.Message); }
    }

    /// <summary>Applique la qualité graphique : ombres, occlusion, lueur, anticrénelage, résolution.</summary>
    public void AppliquerQualite(Godot.Environment env, DirectionalLight3D soleil, Viewport vue)
    {
        env.SsaoEnabled = Qualite >= 2;
        env.GlowEnabled = Qualite >= 1;
        soleil.ShadowEnabled = Qualite >= 1;
        soleil.DirectionalShadowMaxDistance = Qualite >= 2 ? 2500 : 1200;
        vue.Msaa3D = Qualite >= 2 ? Viewport.Msaa.Msaa4X : Qualite == 1 ? Viewport.Msaa.Msaa2X : Viewport.Msaa.Disabled;
        vue.Scaling3DScale = Qualite == 0 ? 0.75f : 1f;
    }
}
