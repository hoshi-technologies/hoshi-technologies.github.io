using Ville.Outils;
using Ville.Reseau;

namespace Ville.Trafic;

/// <summary>
/// Trafic domicile-travail simplifié : chaque véhicule suit son trajet et ralentit selon
/// le nombre de véhicules sur le même arc. Données rangées dans des tableaux pour la vitesse.
/// </summary>
public sealed class SimTrafic
{
    private readonly GrapheRoutier _g;
    public int NbVehicules { get; }
    private readonly int[] _cheminDebut;   // trajets mis bout à bout dans _arcs
    private readonly int[] _cheminFin;
    private readonly int[] _arcs;
    private readonly int[] _pos;           // index courant dans _arcs
    private readonly float[] _avance;      // m parcourus sur l'arc courant
    private readonly int[] _charge;        // véhicules par arc (recalculé à chaque pas)
    public int TrajetsImpossibles { get; }

    public SimTrafic(GrapheRoutier g, int nbVehicules, ulong graine, double distanceMax = 3000)
        : this(g, PairesAleatoires(g, nbVehicules, graine, distanceMax), graine) { }

    private static (int, int)[] PairesAleatoires(GrapheRoutier g, int nbVehicules, ulong graine, double distanceMax)
    {
        var valide = g.PlusGrandeComposante();
        var noeuds = Enumerable.Range(0, g.NbNoeuds).Where(n => valide[n]).ToArray();
        var alea = new Alea(graine);
        var paires = new (int dom, int trav)[nbVehicules];
        for (int i = 0; i < nbVehicules; i++)
        {
            int d = noeuds[alea.Entre(0, noeuds.Length)];
            int t = d;
            for (int essai = 0; essai < 20; essai++)
            {
                t = noeuds[alea.Entre(0, noeuds.Length)];
                double dx = g.X[d] - g.X[t], dy = g.Y[d] - g.Y[t];
                if (dx * dx + dy * dy <= distanceMax * distanceMax && t != d) break;
            }
            paires[i] = (d, t);
        }
        return paires;
    }

    /// <summary>Trafic à partir de trajets donnés (départ, arrivée) en indices du graphe.</summary>
    public SimTrafic(GrapheRoutier g, IReadOnlyList<(int dom, int trav)> paires, ulong graine)
    {
        _g = g;
        int nbVehicules = paires.Count;
        NbVehicules = nbVehicules;
        var alea = new Alea(graine ^ 0x9E3779B97F4A7C15UL);
        // calcul des trajets en parallèle ; le résultat ne dépend pas de l'ordre (déterministe)
        var chemins = new int[nbVehicules][];
        Parallel.For(0, nbVehicules, () => new EspaceCalcul(),
            (i, _, es) => { chemins[i] = g.Chemin(paires[i].dom, paires[i].trav, es); return es; }, _ => { });
        TrajetsImpossibles = chemins.Count(c => c.Length == 0);
        _cheminDebut = new int[nbVehicules];
        _cheminFin = new int[nbVehicules];
        int total = chemins.Sum(c => c.Length);
        _arcs = new int[total];
        int p = 0;
        for (int i = 0; i < nbVehicules; i++)
        {
            _cheminDebut[i] = p;
            chemins[i].CopyTo(_arcs, p);
            p += chemins[i].Length;
            _cheminFin[i] = p;
        }
        _pos = (int[])_cheminDebut.Clone();
        _avance = new float[nbVehicules];
        // répartit les véhicules le long de leur trajet au départ
        for (int i = 0; i < nbVehicules; i++)
        {
            int n = _cheminFin[i] - _cheminDebut[i];
            if (n > 0) _pos[i] = _cheminDebut[i] + alea.Entre(0, n);
        }
        _charge = new int[g.NbArcs];
    }

    public double LongueurMoyenneArcs => NbVehicules == 0 ? 0 : (double)_arcs.Length / NbVehicules;

    /// <summary>Avance la simulation de dt secondes.</summary>
    public void Pas(float dt)
    {
        Array.Clear(_charge);
        for (int i = 0; i < NbVehicules; i++)
            if (_pos[i] < _cheminFin[i]) _charge[_arcs[_pos[i]]]++;
        for (int i = 0; i < NbVehicules; i++)
        {
            if (_pos[i] >= _cheminFin[i]) continue;
            int arc = _arcs[_pos[i]];
            float vLibre = _g.LongueurArc(arc) / Math.Max(_g.CoutArc(arc), 0.01f);
            float densite = _charge[arc] / Math.Max(_g.LongueurArc(arc), 5f) * 7.5f; // véhicules par place
            float v = vLibre / (1f + 4f * densite * densite);
            _avance[i] += v * dt;
            while (_pos[i] < _cheminFin[i] && _avance[i] >= _g.LongueurArc(_arcs[_pos[i]]))
            {
                _avance[i] -= _g.LongueurArc(_arcs[_pos[i]]);
                _pos[i]++;
            }
            if (_pos[i] >= _cheminFin[i]) { _pos[i] = _cheminDebut[i]; _avance[i] = 0; } // aller-retour simplifié
        }
    }

    /// <summary>Position (x, y) et cap du véhicule i, pour l'affichage.</summary>
    public (double x, double y, double cap) Position(int i)
    {
        if (_cheminFin[i] == _cheminDebut[i]) return (double.NaN, double.NaN, 0);
        int arc = _arcs[Math.Min(_pos[i], _cheminFin[i] - 1)];
        int a = _g.SourceArc(arc), b = _g.CibleArc(arc);
        double t = Math.Clamp(_avance[i] / Math.Max(_g.LongueurArc(arc), 0.01f), 0, 1);
        double dx = _g.X[b] - _g.X[a], dy = _g.Y[b] - _g.Y[a];
        return (_g.X[a] + dx * t, _g.Y[a] + dy * t, Math.Atan2(dy, dx));
    }

    public int ChargeMax() => _charge.Length == 0 ? 0 : _charge.Max();
}
