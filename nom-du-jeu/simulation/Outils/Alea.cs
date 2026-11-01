namespace Ville.Outils;

/// <summary>
/// Générateur pseudo-aléatoire déterministe (PCG32). Même graine => même suite, sur toute machine
/// et toute version de .NET (contrairement à System.Random dont l'algorithme peut changer).
/// </summary>
public struct Alea
{
    private ulong _etat;
    private const ulong Mult = 6364136223846793005UL;
    private const ulong Inc = 1442695040888963407UL;

    public Alea(ulong graine)
    {
        _etat = 0;
        Suivant();
        _etat += graine;
        Suivant();
    }

    public uint Suivant()
    {
        ulong ancien = _etat;
        _etat = ancien * Mult + Inc;
        uint xorshifted = (uint)(((ancien >> 18) ^ ancien) >> 27);
        int rot = (int)(ancien >> 59);
        return (xorshifted >> rot) | (xorshifted << ((-rot) & 31));
    }

    /// <summary>Entier dans [min, max[.</summary>
    public int Entre(int min, int max) => min + (int)(Suivant() % (uint)(max - min));

    /// <summary>Réel dans [0, 1[.</summary>
    public double Reel() => Suivant() / 4294967296.0;
}
