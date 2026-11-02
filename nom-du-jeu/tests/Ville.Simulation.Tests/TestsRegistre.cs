using Xunit;

namespace Ville.Tests;

public class TestsRegistre
{
    private static readonly string[] Extensions = { ".glb", ".gltf", ".obj", ".fbx", ".png", ".jpg", ".jpeg", ".webp", ".ogg", ".wav", ".mp3", ".ttf", ".otf" };

    [Fact]
    public void ChaqueFichierGraphiqueOuSonoreEstAuRegistre()
    {
        var registre = File.ReadAllText(Fixtures.Chemin("conception", "REGISTRE_ASSETS.md"));
        var jeu = Fixtures.Chemin("jeu");
        var manquants = Directory.EnumerateFiles(jeu, "*", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}.godot{Path.DirectorySeparatorChar}") && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}") && !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}"))
            .Where(f => Extensions.Contains(Path.GetExtension(f).ToLowerInvariant()))
            .Select(f => Path.GetRelativePath(jeu, f).Replace('\\', '/'))
            .Where(f => !registre.Contains(f))
            .ToList();
        Assert.True(manquants.Count == 0, "Fichiers absents de conception/REGISTRE_ASSETS.md : " + string.Join(", ", manquants));
    }
}
