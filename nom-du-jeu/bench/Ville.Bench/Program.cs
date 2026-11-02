// Banc d'essai de la simulation en C# (sans affichage).
// Usage : dotnet run -c Release -- [dossier_paquet]
using System.Diagnostics;
using System.Text.Json;
using Ville.Donnees;
using Ville.Reseau;
using Ville.Trafic;

if (args.Length > 0 && args[0] == "--robot")
{
    // partie automatique : python-like sortie mois par mois pour régler l'équilibre
    var dossier = args[1];
    var reglages = Ville.Coeur.Reglages.Charger(args[2]);
    int mois = args.Length > 3 ? int.Parse(args[3]) : 20;
    var paquet = PaquetVille.Charger(dossier);
    var partie = Ville.Coeur.Partie.NouvelleFondation(reglages, paquet, 1);
    var robot = new Ville.Coeur.Robot(partie);
    robot.Demarrer();
    var chrono = Stopwatch.StartNew();
    robot.Jouer(mois, p => Console.WriteLine(
        $"mois {p.Mois,3} pop {p.Population,6} emplois {p.EmploisLocaux,5} chômeurs {p.Chomeurs,4} argent {p.Argent,10:N0} " +
        $"rec {p.RecettesMois,7:N0} dep {p.DepensesMois,7:N0} D(h/c/a) {p.DemandeHabitat,4:F0}/{p.DemandeCommerce,4:F0}/{p.DemandeActivites,4:F0} " +
        $"eau {p.EauConsommee,6:F0}/{p.EauProduite,6:F0} élec {p.ElecConsommee,6:F0}/{p.ElecProduite,6:F0} palier {p.Palier} bât {p.Parcelles.Values.Count(x => x.Batiment != null)} déch {p.DechetsProduits:F0}/{p.DechetsCapacite:F0} feux {p.Incendies} bouchon {(p.Congestion.Count > 0 ? p.Congestion.Values.Max() : 0):F2}"));
    if (args.Length > 4) { partie.SauvegarderFichier(args[4]); Console.WriteLine("Sauvegarde écrite : " + args[4]); }
    foreach (var l in robot.Journal) Console.WriteLine("  " + l);
    foreach (var m in partie.Messages) Console.WriteLine($"  [j{m.Jour} {m.Type}] {m.Texte}");
    Console.WriteLine($"Temps de simulation : {chrono.ElapsedMilliseconds} ms pour {mois} mois");
    return;
}

var resultats = new Dictionary<string, object>
{
    ["machine"] = $"{Environment.ProcessorCount} cœurs, {System.Runtime.InteropServices.RuntimeInformation.OSDescription}",
    [".net"] = Environment.Version.ToString(),
};

void Mesurer(string nom, GrapheRoutier g, int vehicules)
{
    var sw = Stopwatch.StartNew();
    var sim = new SimTrafic(g, vehicules, 12345);
    double trajetsMs = sw.Elapsed.TotalMilliseconds;
    for (int i = 0; i < 20; i++) sim.Pas(0.5f); // chauffe
    sw.Restart();
    const int pas = 200;
    for (int i = 0; i < pas; i++) sim.Pas(0.5f);
    double pasMs = sw.Elapsed.TotalMilliseconds / pas;
    resultats[$"{nom}_{vehicules}"] = new
    {
        trajets_ms = Math.Round(trajetsMs), pas_trafic_ms = Math.Round(pasMs, 3),
        trajets_impossibles = sim.TrajetsImpossibles, arcs_par_trajet = Math.Round(sim.LongueurMoyenneArcs, 1),
        charge_max = sim.ChargeMax(), memoire_mo = Math.Round(GC.GetTotalMemory(false) / 1048576.0),
    };
    Console.WriteLine($"{nom,-22} {vehicules,7} véhicules : trajets {trajetsMs,8:F0} ms, pas de trafic {pasMs,7:F3} ms");
}

var swg = Stopwatch.StartNew();
var grille = ConstructionGraphe.Grille(200, 100, 12345);
Console.WriteLine($"Grille 200x200 construite en {swg.ElapsedMilliseconds} ms ({grille.NbNoeuds} nœuds, {grille.NbArcs / 2} tronçons)");
foreach (var n in new[] { 10_000, 50_000, 100_000 }) Mesurer("grille_20km", grille, n);

if (args.Length > 0)
{
    swg.Restart();
    var p = PaquetVille.Charger(args[0]);
    double chargementMs = swg.Elapsed.TotalMilliseconds;
    var g = ConstructionGraphe.Voitures(p.Routes);
    resultats["paquet"] = new { ville = p.Manifest.Ville.Nom, chargement_ms = Math.Round(chargementMs), noeuds = g.NbNoeuds, arcs = g.NbArcs };
    Console.WriteLine($"Paquet {p.Manifest.Ville.Nom} chargé en {chargementMs:F0} ms ({p.Batiments.Length} bâtiments, {g.NbNoeuds} carrefours)");
    foreach (var n in new[] { 10_000, 50_000 }) Mesurer("annecy_reel", g, n);
}
var json = JsonSerializer.Serialize(resultats, new JsonSerializerOptions { WriteIndented = true });
File.WriteAllText("resultats_bench_csharp.json", json);
Console.WriteLine("Résultats écrits dans resultats_bench_csharp.json");
