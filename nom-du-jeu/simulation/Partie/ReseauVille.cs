using Ville.Reseau;

namespace Ville.Coeur;

public sealed class NoeudRoute
{
    public int Id { get; init; }
    public V2 Pos { get; set; }
    /// <summary>Relié au monde extérieur (bord de la carte sur un grand axe).</summary>
    public bool Entree { get; set; }
}

public sealed class AreteRoute
{
    public int Id { get; init; }
    public int A { get; set; }
    public int B { get; set; }
    public List<V2> Trace { get; set; } = new();
    public string Gabarit { get; set; } = "rue";
    /// <summary>Grand axe réel importé : entretenu par le Département, non démolissable.</summary>
    public bool Departemental { get; set; }
    public string? Nom { get; set; }
    /// <summary>Tronçon construit au-dessus de l'eau.</summary>
    public bool Pont { get; set; }
    /// <summary>Rue réelle importée au départ (mode « vraies rues ») : déjà payée, entretien gratuit.</summary>
    public bool Importee { get; set; }
    public double Longueur => Geo.LongueurPolyligne(Trace);
}

/// <summary>Réseau routier modifiable par le joueur (ajout avec découpe aux croisements, suppression).</summary>
public sealed class ReseauVille
{
    public SortedDictionary<int, NoeudRoute> Noeuds { get; } = new();
    public SortedDictionary<int, AreteRoute> Aretes { get; } = new();
    public int ProchainNoeud { get; set; }
    public int ProchaineArete { get; set; }
    public int Version { get; private set; }

    /// <summary>Recrée un nœud avec son identifiant (chargement d'une sauvegarde).</summary>
    public void RestaurerNoeud(NoeudRoute n) => Noeuds[n.Id] = n;

    /// <summary>Recrée une arête avec son identifiant (chargement d'une sauvegarde).</summary>
    public void RestaurerArete(AreteRoute e)
    {
        Aretes[e.Id] = e;
        _degre[e.A] = Degre(e.A) + 1;
        _degre[e.B] = Degre(e.B) + 1;
        Version++;
    }

    public NoeudRoute NouveauNoeud(V2 p)
    {
        var n = new NoeudRoute { Id = ProchainNoeud++, Pos = p };
        Noeuds[n.Id] = n;
        return n;
    }

    public AreteRoute NouvelleArete(int a, int b, List<V2> trace, string gabarit, bool departemental = false, string? nom = null)
    {
        var e = new AreteRoute { Id = ProchaineArete++, A = a, B = b, Trace = trace, Gabarit = gabarit, Departemental = departemental, Nom = nom };
        Aretes[e.Id] = e;
        _degre[a] = Degre(a) + 1;
        _degre[b] = Degre(b) + 1;
        Version++;
        return e;
    }

    public void Modifie() => Version++;

    /// <summary>Résultat d'un découpage : l'ancienne arête est remplacée par deux morceaux.</summary>
    public readonly record struct Decoupe(int Ancienne, int Morceau1, int Morceau2);

    /// <summary>Coupe une arête au point de sa trace le plus proche de p. Renvoie le nœud créé.</summary>
    public NoeudRoute Couper(int areteId, V2 p, List<Decoupe> decoupes)
    {
        var e = Aretes[areteId];
        int meilleur = 0; double dmin = double.MaxValue, tmin = 0; V2 pmin = p;
        for (int i = 0; i + 1 < e.Trace.Count; i++)
        {
            double t = Geo.Projection(p, e.Trace[i], e.Trace[i + 1], out var q);
            double d = V2.Distance(p, q);
            if (d < dmin) { dmin = d; meilleur = i; tmin = t; pmin = q; }
        }
        // si on est tout près d'une extrémité, on réutilise le nœud existant
        if (V2.Distance(pmin, Noeuds[e.A].Pos) < 2) return Noeuds[e.A];
        if (V2.Distance(pmin, Noeuds[e.B].Pos) < 2) return Noeuds[e.B];
        var n = NouveauNoeud(pmin);
        var t1 = e.Trace.Take(meilleur + 1).Append(pmin).ToList();
        var t2 = new List<V2> { pmin };
        t2.AddRange(e.Trace.Skip(meilleur + 1));
        RetirerArete(e);
        var m1 = NouvelleArete(e.A, n.Id, t1, e.Gabarit, e.Departemental, e.Nom);
        var m2 = NouvelleArete(n.Id, e.B, t2, e.Gabarit, e.Departemental, e.Nom);
        m1.Pont = m2.Pont = e.Pont;
        decoupes.Add(new Decoupe(e.Id, m1.Id, m2.Id));
        return n;
    }

    /// <summary>Nœud ou arête le plus proche à moins de rayon mètres (pour accrocher la souris).</summary>
    public (NoeudRoute? noeud, AreteRoute? arete, V2 point) Accrocher(V2 p, double rayon)
    {
        NoeudRoute? nb = null; double dn = rayon;
        foreach (var n in Noeuds.Values)
        {
            double d = V2.Distance(n.Pos, p);
            if (d < dn && Degre(n.Id) > 0) { dn = d; nb = n; }
        }
        if (nb != null) return (nb, null, nb.Pos);
        AreteRoute? eb = null; double de = rayon; V2 pb = p;
        foreach (var e in Aretes.Values)
            for (int i = 0; i + 1 < e.Trace.Count; i++)
            {
                Geo.Projection(p, e.Trace[i], e.Trace[i + 1], out var q);
                double d = V2.Distance(p, q);
                if (d < de) { de = d; eb = e; pb = q; }
            }
        return (null, eb, eb != null ? pb : p);
    }

    private readonly Dictionary<int, int> _degre = new();
    /// <summary>Arête la plus proche (sans s'arrêter aux carrefours), à moins de rayon mètres.</summary>
    public AreteRoute? AreteProche(V2 p, double rayon)
    {
        AreteRoute? eb = null; double de = rayon;
        foreach (var e in Aretes.Values)
            for (int i = 0; i + 1 < e.Trace.Count; i++)
            {
                Geo.Projection(p, e.Trace[i], e.Trace[i + 1], out var q);
                double d = V2.Distance(p, q);
                if (d < de) { de = d; eb = e; }
            }
        return eb;
    }

    public int Degre(int noeud) => _degre.TryGetValue(noeud, out var d) ? d : 0;

    private void RetirerArete(AreteRoute e)
    {
        Aretes.Remove(e.Id);
        _degre[e.A] = Degre(e.A) - 1;
        _degre[e.B] = Degre(e.B) - 1;
        Version++;
    }

    /// <summary>Croisements du segment [p,q] avec les arêtes existantes : (arête, point, position le long de [p,q]).</summary>
    public List<(int arete, V2 point, double t)> Croisements(V2 p, V2 q, HashSet<int>? ignorer = null)
    {
        var res = new List<(int, V2, double)>();
        foreach (var e in Aretes.Values)
        {
            if (ignorer != null && ignorer.Contains(e.Id)) continue;
            for (int i = 0; i + 1 < e.Trace.Count; i++)
                if (Geo.Intersection(p, q, e.Trace[i], e.Trace[i + 1], out double t, out _))
                    res.Add((e.Id, p + (q - p) * t, t));
        }
        return res.OrderBy(c => c.Item3).ToList();
    }

    public void SupprimerArete(int id)
    {
        if (!Aretes.TryGetValue(id, out var e)) return;
        RetirerArete(e);
        foreach (var n in new[] { e.A, e.B })
            if (Degre(n) == 0 && !Noeuds[n].Entree) Noeuds.Remove(n);
        Version++;
    }

    // ------------------------------------------------------------------ graphe et connexité
    private GrapheRoutier? _graphe;
    private int _versionGraphe = -1;
    private Dictionary<int, int> _indexNoeud = new();
    private int[] _composante = Array.Empty<int>();
    private HashSet<int> _composantesReliees = new();

    private void Actualiser(Reglages r)
    {
        if (_versionGraphe == Version && _graphe != null) return;
        _indexNoeud = new Dictionary<int, int>();
        var ids = Noeuds.Keys.ToArray();
        for (int i = 0; i < ids.Length; i++) _indexNoeud[ids[i]] = i;
        var x = ids.Select(i => Noeuds[i].Pos.X).ToArray();
        var y = ids.Select(i => Noeuds[i].Pos.Y).ToArray();
        var aretes = Aretes.Values.Select(e => (_indexNoeud[e.A], _indexNoeud[e.B], Math.Max(e.Longueur, 0.5),
            r.Route(e.Gabarit).VitesseKmh / 3.6, e.Id)).ToList();
        _graphe = new GrapheRoutier(x, y, aretes);
        // composantes connexes (union-find)
        var parent = Enumerable.Range(0, ids.Length).ToArray();
        int Trouver(int a) { while (parent[a] != a) a = parent[a] = parent[parent[a]]; return a; }
        foreach (var e in Aretes.Values) parent[Trouver(_indexNoeud[e.A])] = Trouver(_indexNoeud[e.B]);
        _composante = Enumerable.Range(0, ids.Length).Select(Trouver).ToArray();
        _composantesReliees = ids.Where(i => Noeuds[i].Entree).Select(i => _composante[_indexNoeud[i]]).ToHashSet();
        _versionGraphe = Version;
    }

    public GrapheRoutier Graphe(Reglages r) { Actualiser(r); return _graphe!; }
    public int IndexGraphe(int noeud) => _indexNoeud[noeud];
    public int Composante(int noeud, Reglages r) { Actualiser(r); return _indexNoeud.TryGetValue(noeud, out var i) ? _composante[i] : -1; }
    public bool Relie(int noeud, Reglages r) { Actualiser(r); return _indexNoeud.TryGetValue(noeud, out var i) && _composantesReliees.Contains(_composante[i]); }
}
