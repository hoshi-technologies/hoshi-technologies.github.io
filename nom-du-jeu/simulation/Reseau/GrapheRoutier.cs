namespace Ville.Reseau;

/// <summary>
/// Réseau routier compact (format « CSR » : tous les voisins d'un carrefour sont rangés côte à côte
/// dans un seul tableau), conçu pour calculer très vite des milliers de trajets.
/// </summary>
public sealed class GrapheRoutier
{
    public int NbNoeuds { get; }
    public int NbArcs => _cible.Length;
    public readonly double[] X, Y;

    // arcs sortants du nœud n : indices [_debut[n], _debut[n+1])
    private readonly int[] _debut;
    private readonly int[] _cible;
    private readonly float[] _cout;      // temps de parcours (s)
    private readonly float[] _longueur;  // m
    private readonly int[] _troncon;     // tronçon d'origine (pour l'affichage), -1 si aucun
    private readonly double _vitesseMax;

    public GrapheRoutier(double[] x, double[] y, IReadOnlyList<(int a, int b, double longueur, double vitesse, int troncon)> aretes)
    {
        NbNoeuds = x.Length;
        X = x; Y = y;
        var degre = new int[NbNoeuds + 1];
        foreach (var e in aretes) { degre[e.a]++; degre[e.b]++; }
        _debut = new int[NbNoeuds + 1];
        for (int i = 0; i < NbNoeuds; i++) _debut[i + 1] = _debut[i] + degre[i];
        int n = _debut[NbNoeuds];
        _cible = new int[n]; _cout = new float[n]; _longueur = new float[n]; _troncon = new int[n];
        var pos = (int[])_debut.Clone();
        _vitesseMax = 1;
        foreach (var e in aretes)
        {
            _vitesseMax = Math.Max(_vitesseMax, e.vitesse);
            Ajouter(ref pos[e.a], e.b, e);
            Ajouter(ref pos[e.b], e.a, e);
        }
    }

    private void Ajouter(ref int p, int cible, (int a, int b, double longueur, double vitesse, int troncon) e)
    {
        _cible[p] = cible;
        _longueur[p] = (float)e.longueur;
        _cout[p] = (float)(e.longueur / e.vitesse);
        _troncon[p] = e.troncon;
        p++;
    }

    public int CibleArc(int arc) => _cible[arc];
    public float LongueurArc(int arc) => _longueur[arc];
    public float CoutArc(int arc) => _cout[arc];
    public int TronconArc(int arc) => _troncon[arc];
    public ReadOnlySpan<int> ArcsSortants(int n) => _cible.AsSpan(_debut[n], _debut[n + 1] - _debut[n]);
    public int PremierArc(int n) => _debut[n];

    /// <summary>
    /// Plus court chemin (en temps) par A*. Renvoie la liste des arcs, ou un tableau vide si impossible.
    /// Thread-safe : on peut calculer plusieurs trajets en parallèle avec un <see cref="EspaceCalcul"/> par fil.
    /// </summary>
    public int[] Chemin(int depart, int arrivee, EspaceCalcul es)
    {
        if (depart == arrivee) return Array.Empty<int>();
        es.Preparer(NbNoeuds);
        var file = es.File;
        file.Clear();
        es.Fixer(depart, 0, -1);
        file.Enqueue(depart, Heuristique(depart, arrivee));
        while (file.TryDequeue(out int n, out float prio))
        {
            if (n == arrivee) break;
            float g = es.G(n);
            if (prio > g + Heuristique(n, arrivee) + 1e-3f) continue; // entrée périmée
            for (int arc = _debut[n]; arc < _debut[n + 1]; arc++)
            {
                int v = _cible[arc];
                float ng = g + _cout[arc];
                if (ng < es.G(v))
                {
                    es.Fixer(v, ng, arc);
                    file.Enqueue(v, ng + Heuristique(v, arrivee));
                }
            }
        }
        if (es.ArcPrecedent(arrivee) < 0) return Array.Empty<int>();
        var res = new List<int>();
        for (int n = arrivee; n != depart;)
        {
            int arc = es.ArcPrecedent(n);
            res.Add(arc);
            n = SourceArc(arc);
        }
        res.Reverse();
        return res.ToArray();
    }

    private float Heuristique(int a, int b)
    {
        double dx = X[a] - X[b], dy = Y[a] - Y[b];
        return (float)(Math.Sqrt(dx * dx + dy * dy) / _vitesseMax);
    }

    /// <summary>Nœud de départ d'un arc (recherche dichotomique dans _debut).</summary>
    public int SourceArc(int arc)
    {
        int lo = 0, hi = NbNoeuds - 1;
        while (lo < hi)
        {
            int mid = (lo + hi + 1) / 2;
            if (_debut[mid] <= arc) lo = mid; else hi = mid - 1;
        }
        // plusieurs nœuds peuvent avoir le même début (degré 0) : prendre le dernier dont le début <= arc
        return lo;
    }

    /// <summary>Plus grande composante connexe (les trajets se font à l'intérieur).</summary>
    public bool[] PlusGrandeComposante()
    {
        var comp = new int[NbNoeuds];
        Array.Fill(comp, -1);
        int meilleure = -1, tailleMax = 0, id = 0;
        var pile = new Stack<int>();
        for (int s = 0; s < NbNoeuds; s++)
        {
            if (comp[s] >= 0) continue;
            int taille = 0;
            pile.Push(s); comp[s] = id;
            while (pile.Count > 0)
            {
                int n = pile.Pop(); taille++;
                for (int arc = _debut[n]; arc < _debut[n + 1]; arc++)
                    if (comp[_cible[arc]] < 0) { comp[_cible[arc]] = id; pile.Push(_cible[arc]); }
            }
            if (taille > tailleMax) { tailleMax = taille; meilleure = id; }
            id++;
        }
        return comp.Select(c => c == meilleure).ToArray();
    }
}

/// <summary>Mémoire de travail réutilisable pour A* (évite d'allouer à chaque trajet).</summary>
public sealed class EspaceCalcul
{
    private float[] _g = Array.Empty<float>();
    private int[] _prec = Array.Empty<int>();
    private int[] _marque = Array.Empty<int>();
    private int _generation;
    public PriorityQueue<int, float> File { get; } = new();

    public void Preparer(int n)
    {
        if (_g.Length < n) { _g = new float[n]; _prec = new int[n]; _marque = new int[n]; _generation = 0; }
        _generation++;
    }

    public float G(int n) => _marque[n] == _generation ? _g[n] : float.PositiveInfinity;
    public int ArcPrecedent(int n) => _marque[n] == _generation ? _prec[n] : -1;
    public void Fixer(int n, float g, int arc) { _g[n] = g; _prec[n] = arc; _marque[n] = _generation; }
}
