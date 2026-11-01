// Banc d'essai de la simulation en C# (sans affichage).
// Usage : dotnet run -c Release -- [dossier_paquet]
using System.Diagnostics;
using System.Text.Json;
using Ville.Donnees;
using Ville.Reseau;
using Ville.Trafic;

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
