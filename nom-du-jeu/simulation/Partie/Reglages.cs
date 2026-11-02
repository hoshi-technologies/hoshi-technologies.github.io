using System.Text.Json;

namespace Ville.Coeur;

/// <summary>Réglages d'équilibrage, lus depuis donnees/reglages/*.json (aucun chiffre en dur dans le code).</summary>
public sealed class Reglages
{
    public double ArgentDepart { get; set; }
    public int JoursParMois { get; set; } = 30;
    public ReglagesRoutes Routes { get; set; } = new();
    public ReglagesParcelles Parcelles { get; set; } = new();
    public Dictionary<string, ReglagesZone> Zones { get; set; } = new();
    public double PersonnesParLogement { get; set; }
    public double PartActifs { get; set; }
    public double PartEnfants { get; set; }
    public int JoursConstruction { get; set; }
    public double EmmenagementsParJour { get; set; }
    public ReglagesDemande Demande { get; set; } = new();
    public ReglagesNiveaux Niveaux { get; set; } = new();
    public ReglagesImpots Impots { get; set; } = new();
    public ReglagesEmprunt Emprunt { get; set; } = new();
    public Dictionary<string, ReglagesService> Services { get; set; } = new();
    public ReglagesBus Bus { get; set; } = new();
    public ReglagesConsommation Consommation { get; set; } = new();
    public double PollutionActivitesRayonM { get; set; }
    public int MoisSansServiceAvantDepart { get; set; }
    public List<ReglagesPalier> Paliers { get; set; } = new();
    public ReglagesRisques Risques { get; set; } = new();
    public ReglagesVilleReelle VilleReelle { get; set; } = new();
    public ReglagesTerritoire Territoire { get; set; } = new();
    public ReglagesEvolution EvolutionBatimentsReels { get; set; } = new();
    public double ArgentDepartRoutesReelles { get; set; } = 400000;

    /// <summary>Sections propres aux modules (ex. « vraie_gestion »), lues par chaque module.</summary>
    [System.Text.Json.Serialization.JsonExtensionData]
    public Dictionary<string, JsonElement> Extra { get; set; } = new();

    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        ReadCommentHandling = JsonCommentHandling.Skip,
        WriteIndented = true,
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    public static Reglages Charger(string chemin) =>
        JsonSerializer.Deserialize<Reglages>(File.ReadAllText(chemin), Json) ?? throw new InvalidDataException("Réglages illisibles");

    public ReglagesRoute Route(string gabarit) => gabarit switch
    {
        "rue" => Routes.Rue, "avenue" => Routes.Avenue, _ => Routes.VoieRapide,
    };
}

public sealed class ReglagesRoutes
{
    public ReglagesRoute Rue { get; set; } = new();
    public ReglagesRoute Avenue { get; set; } = new();
    public ReglagesRoute VoieRapide { get; set; } = new();
    public double PenteMax { get; set; }
    public double AccrochageM { get; set; }
    public double LongueurMinM { get; set; }
    public List<string> AxesReelsImportes { get; set; } = new();
    public ReglagesPont Pont { get; set; } = new();
    public Dictionary<string, double> CapaciteVehicules { get; set; } = new();
    public double PartTrajetsVoiture { get; set; } = 0.65;
    public double PartHeureDePointe { get; set; } = 0.35;
}

public sealed class ReglagesTerritoire
{
    public double[] RayonsParPalierM { get; set; } = Array.Empty<double>();
}

public sealed class ReglagesEvolution
{
    public int MoisMinEntreRenovations { get; set; } = 12;
    public double DemandeMin { get; set; } = 15;
    public double FacteurCapacite { get; set; } = 1.4;
    public double HauteurAjouteeM { get; set; } = 6;
}

public sealed class ReglagesVilleReelle
{
    public double M2ParLogement { get; set; } = 70;
    public double M2ParEmploiCommerce { get; set; } = 40;
    public double M2ParEmploiActivites { get; set; } = 60;
    public double PartSurfaceUtile { get; set; } = 0.8;
    public double OccupationInitiale { get; set; } = 0.92;
    public double PrixEauRegionale { get; set; }
    public double PrixElecRegionale { get; set; }
    public double PrixDechetsRegionaux { get; set; }
    public double PartActifsTravaillantDehors { get; set; }
    public double ArgentDepartParHabitant { get; set; }
    public double ArgentDepartMin { get; set; }
    public double CoutSecoursPoliceParHabitant { get; set; }
    public double CoutServicesExistantsParHabitant { get; set; }
}

public sealed class ReglagesPont
{
    public double CoutMultiplicateur { get; set; } = 5;
    public double LongueurEauMaxM { get; set; } = 450;
}

public sealed class ReglagesRisques
{
    public double IncendieProbaMois { get; set; }
    public double IncendieProbaAvecPompiers { get; set; }
    public int PopulationSansPoliceMax { get; set; }
    public int PopulationSansSanteMax { get; set; }
}

public sealed class ReglagesRoute
{
    public double LargeurM { get; set; }
    public double CoutParM { get; set; }
    public double EntretienParKmMois { get; set; }
    public double VitesseKmh { get; set; }
    public bool Parcelles { get; set; }
}

public sealed class ReglagesParcelles
{
    public double LargeurM { get; set; }
    public double ProfondeurM { get; set; }
    public double EcartRouteM { get; set; }
    public double DeniveleMaxM { get; set; }
}

public sealed class ReglagesZone
{
    public int[] Capacite { get; set; } = Array.Empty<int>();
    public double[] HauteurM { get; set; } = Array.Empty<double>();
}

public sealed class ReglagesDemande
{
    public double AttraitRegion { get; set; }
    public double EmploisExterieurs { get; set; }
    public double ClientsParEmploiCommerce { get; set; }
    public double PartActifsActivites { get; set; }
    public double ImpotReference { get; set; }
    public double PenaliteParPointImpot { get; set; }
    public int ConstructionsMaxParJour { get; set; }
}

public sealed class ReglagesNiveaux
{
    public double AttraitNiveau2 { get; set; }
    public double AttraitNiveau3 { get; set; }
    public int MoisEntreNiveaux { get; set; }
}

public sealed class ReglagesImpots
{
    public double HabitatParHabitant { get; set; }
    public double CommerceParEmploi { get; set; }
    public double ActivitesParEmploi { get; set; }
    public double TauxMin { get; set; }
    public double TauxMax { get; set; }
}

public sealed class ReglagesEmprunt
{
    public double Montant { get; set; }
    public double TauxAnnuel { get; set; }
    public int DureeMois { get; set; }
    public int Max { get; set; }
}

public sealed class ReglagesService
{
    public string Nom { get; set; } = "";
    public double Cout { get; set; }
    public double Entretien { get; set; }
    public double Eau { get; set; }
    public double Electricite { get; set; }
    public double Eleves { get; set; }
    public double RayonM { get; set; }
    public int Emplois { get; set; }
    public double DistanceEauMaxM { get; set; }
    public double PollutionRayonM { get; set; }
    public double Dechets { get; set; }
    public double Patients { get; set; }
    public int Palier { get; set; }
}

public sealed class ReglagesBus
{
    public double CoutParBusMois { get; set; }
    public int ArretsParBus { get; set; }
}

public sealed class ReglagesConsommation
{
    public double EauParHabitant { get; set; }
    public double EauParEmploi { get; set; }
    public double ElecParHabitant { get; set; }
    public double ElecParEmploi { get; set; }
    public double DechetsParHabitant { get; set; }
    public double DechetsParEmploi { get; set; }
}

public sealed class ReglagesPalier
{
    public string Nom { get; set; } = "";
    public int Population { get; set; }
    public string Message { get; set; } = "";
}
