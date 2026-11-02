namespace Ville.Coeur;

/// <summary>
/// Un « maire automatique » simple, utilisé pour les tests d'équilibrage et de stabilité.
/// Il joue comme un débutant raisonnable : un quadrillage de rues relié à un grand axe,
/// de l'eau, de l'électricité, puis école et bus quand ils se débloquent.
/// </summary>
public sealed class Robot
{
    private readonly Partie _p;
    private V2 _centre;
    private int _rayonQuartier = 150;
    public List<string> Journal { get; } = new();

    public Robot(Partie p) { _p = p; }

    /// <summary>Trouve un terrain plat et sec près d'un grand axe, et y trace le premier quartier.</summary>
    public void Demarrer()
    {
        // candidats : points de grands axes, loin de l'eau et du bord, terrain peu pentu
        var meilleur = _p.Reseau.Aretes.Values
            .Where(e => e.Gabarit == "avenue")
            .Select(e => e.Trace[e.Trace.Count / 2])
            .Where(c => Math.Abs(c.X) < _p.DemiCote - 700 && Math.Abs(c.Y) < _p.DemiCote - 700)
            .OrderBy(c => Pente(c)).ThenBy(c => c.X).First();
        _centre = meilleur + new V2(150, 0);
        Quadrillage(_centre, _rayonQuartier);
        var s = _p.Grille.DistanceEau(_centre);
        Journal.Add($"Quartier fondé en ({_centre.X:F0}, {_centre.Y:F0}), eau à {s:F0} m");
        Zonage(_centre, _rayonQuartier);
        Service("chateau_eau", _centre + new V2(-_rayonQuartier, -_rayonQuartier));
        Service("centrale_solaire", _centre + new V2(_rayonQuartier, -_rayonQuartier));
    }

    private double Pente(V2 c)
    {
        double z = _p.Paquet.Altitude(c.X, c.Y), m = 0;
        for (int dx = -300; dx <= 300; dx += 100)
            for (int dy = -300; dy <= 300; dy += 100)
            {
                var q = c + new V2(dx, dy);
                if (_p.Grille.Eau(q)) m += 50;
                m += Math.Abs(_p.Paquet.Altitude(q.X, q.Y) - z);
            }
        return m;
    }

    private void Quadrillage(V2 c, int r)
    {
        for (int k = -r; k <= r; k += 100)
        {
            Route(c + new V2(-r, k), c + new V2(r, k));
            Route(c + new V2(k, -r), c + new V2(k, r));
        }
        // raccordement au grand axe le plus proche
        var (_, arete, point) = _p.Reseau.Accrocher(c, 2000);
        var bord = c + (point - c).Normalise() * r;
        if (arete != null && arete.Departemental) Route(bord, point);
        else
        {
            var axe = _p.Reseau.Noeuds.Values.Where(n => _p.Reseau.Degre(n.Id) > 0 && _p.Reseau.Relie(n.Id, _p.R))
                .OrderBy(n => V2.Distance(n.Pos, c)).First();
            Route(bord, axe.Pos);
        }
    }

    private void Route(V2 a, V2 b)
    {
        var r = _p.ConstruireRoute(a, b, "rue");
        if (!r.Ok) Journal.Add($"Route refusée : {r.Message}");
    }

    private void Zonage(V2 c, int r)
    {
        foreach (var p in _p.ParcellesProches(c, r + 40).ToList())
        {
            var d = p.Centre - c;
            var z = d.X > r * 0.5 && d.Y > r * 0.5 ? Zone.Activites : Math.Abs(d.Y) < 30 ? Zone.Commerce : Zone.Habitat;
            _p.Zoner(p.Centre, 1, z);
        }
    }

    private bool Service(string type, V2 pres)
    {
        var lieux = _p.Parcelles.Values.Where(x => x.Libre && _p.ParcelleReliee(x))
            .OrderBy(x => V2.Distance(x.Centre, pres)).Take(30);
        foreach (var l in lieux)
        {
            var r = _p.PlacerService(type, l.Centre);
            if (r.Ok) { Journal.Add($"Mois {_p.Mois} : {r.Message}"); return true; }
            if (r.Message.Contains("argent")) return false;
        }
        return false;
    }

    /// <summary>Décisions de début de mois.</summary>
    public void Decider()
    {
        var p = _p;
        if (p.EauConsommee > p.EauProduite * 0.75)
        {
            if (!(p.ServiceDisponible("pompage_lac") && Service("pompage_lac", BordDeLEau())))
                Service("chateau_eau", _centre + new V2(-_rayonQuartier, 0));
        }
        if (p.ElecConsommee > p.ElecProduite * 0.75)
        {
            if (!(p.ServiceDisponible("centrale_gaz") && Service("centrale_gaz", _centre + new V2(_rayonQuartier, _rayonQuartier))))
                Service("centrale_solaire", _centre + new V2(_rayonQuartier, 0));
        }
        int ecoles = p.Parcelles.Values.Count(x => x.Service == "ecole");
        if (p.ServiceDisponible("ecole") && p.Enfants > ecoles * 280) Service("ecole", _centre + new V2(0, 50 - ecoles * 120));
        if (p.ServiceDisponible("parc") && p.Parcelles.Values.Count(x => x.Service == "parc") < p.Population / 1500 + 1) Service("parc", _centre + new V2(-50, 50));
        if (p.ServiceDisponible("arret_bus") && p.Arrets.Count < 4)
            foreach (var d in new[] { new V2(-150, -150), new V2(150, -150), new V2(150, 150), new V2(-150, 150) })
                p.PlacerService("arret_bus", _centre + d);
        // le quartier est plein : on l'agrandit
        int libres = p.Parcelles.Values.Count(x => x.Zone != Zone.Aucune && x.Libre);
        if (libres < 25 && p.Argent > 120000 && _rayonQuartier < 650)
        {
            _rayonQuartier += 100;
            Quadrillage(_centre, _rayonQuartier);
            Zonage(_centre, _rayonQuartier);
            Journal.Add($"Mois {p.Mois} : extension du quartier (rayon {_rayonQuartier} m)");
        }
        if (p.Argent < 15000 && p.Emprunts.Count < p.R.Emprunt.Max) Journal.Add($"Mois {p.Mois} : {p.Emprunter().Message}");
    }

    private V2 BordDeLEau()
    {
        var berges = _p.Parcelles.Values.Where(x => x.Libre && _p.Grille.DistanceEau(x.Centre) < 50 && _p.ParcelleReliee(x))
            .OrderBy(x => V2.Distance(x.Centre, _centre)).FirstOrDefault();
        return berges?.Centre ?? _centre;
    }

    /// <summary>Joue n mois en prenant une décision au début de chaque mois.</summary>
    public void Jouer(int mois, Action<Partie>? chaqueMois = null)
    {
        for (int m = 0; m < mois; m++)
        {
            Decider();
            for (int j = 0; j < _p.R.JoursParMois; j++) _p.AvancerJour();
            chaqueMois?.Invoke(_p);
        }
    }
}
