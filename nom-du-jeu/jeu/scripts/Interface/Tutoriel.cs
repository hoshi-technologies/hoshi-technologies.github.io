using Ville.Coeur;

namespace Jeu.Interface;

/// <summary>
/// Tutoriel court par la pratique : chaque étape se valide quand le joueur a fait l'action demandée.
/// </summary>
public sealed class Tutoriel
{
    public sealed record Etape(string Titre, string Consigne, Func<Etat, bool> Fini);

    /// <summary>Ce que le tutoriel observe (rempli par le jeu à chaque image).</summary>
    public sealed class Etat
    {
        public Partie P = null!;
        public double DeplacementCamera;
        public bool BudgetOuvert;
        public bool VueChangee;
        public int Vitesse;
    }

    public static readonly Etape[] Etapes =
    {
        new("Regarder autour de soi", "Déplacez la caméra avec Z Q S D (ou les flèches), tournez avec A / E ou le clic droit, zoomez avec la molette.", e => e.DeplacementCamera > 250),
        new("Tracer une rue", "Routes > Rue. Cliquez sur un grand axe gris, puis un peu plus loin sur un terrain plat. Clic droit pour arrêter.", e => e.P.Reseau.Aretes.Values.Any(a => !a.Departemental && !a.Importee)),
        new("Zoner de l'habitat", "Zones > Habitat. Maintenez le clic gauche le long de votre rue : les parcelles deviennent vertes.", e => e.P.Parcelles.Values.Count(x => x.Zone == Zone.Habitat) >= 10),
        new("Apporter l'eau", "Eau & énergie > Château d'eau. Cliquez sur un terrain libre au bord de votre rue.", e => e.P.Parcelles.Values.Any(x => x.Service is "chateau_eau" or "pompage_lac")),
        new("Apporter l'électricité", "Eau & énergie > Centrale solaire, toujours le long d'une rue reliée.", e => e.P.Parcelles.Values.Any(x => x.Service is "centrale_solaire" or "centrale_gaz")),
        new("Laisser vivre la ville", "Lancez le temps (bouton > ou touche 1) et regardez les premières maisons sortir de terre.", e => e.P.Parcelles.Values.Count(x => x.Batiment is { EnChantier: false }) >= 5),
        new("Créer des emplois", "Zones > Commerce ou Activités : sans emplois, les habitants finissent par partir.", e => e.P.Parcelles.Values.Count(x => x.Zone is Zone.Commerce or Zone.Activites) >= 6),
        new("Regarder le budget", "Ouvrez « Budget » : recettes, dépenses, taxes et emprunt.", e => e.BudgetOuvert),
        new("Les vues d'information", "Appuyez sur V pour voir l'eau et l'électricité, l'attrait, le trafic, les services et l'usure.", e => e.VueChangee),
        new("À vous de jouer", "Vous savez l'essentiel ! Atteignez 300 habitants pour débloquer l'école et les parcs. Les « conseils du moment » vous guideront.", e => e.P.Population >= 300),
    };

    public int Index { get; private set; }
    public bool Termine => Index >= Etapes.Length;
    public Etape? Courante => Termine ? null : Etapes[Index];

    /// <summary>Renvoie vrai si une étape vient d'être validée.</summary>
    public bool Avancer(Etat e)
    {
        if (Termine || !Etapes[Index].Fini(e)) return false;
        Index++;
        return true;
    }

    public void Passer() => Index = Etapes.Length;

    public string Texte()
    {
        if (Termine) return "";
        var et = Etapes[Index];
        return $"TUTORIEL — étape {Index + 1} / {Etapes.Length}\n{et.Titre.ToUpperInvariant()}\n{et.Consigne}";
    }
}
