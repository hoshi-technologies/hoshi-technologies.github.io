using Ville.Donnees;

namespace Ville.Coeur;

public sealed partial class Partie
{
    /// <summary>
    /// Nouvelle partie en mode Ville réelle : la vraie ville est là au départ (rues, bâtiments, écoles),
    /// avec une population et des emplois estimés depuis la surface des bâtiments.
    /// Eau, électricité et déchets sont achetés au réseau régional ; les équipements de la commune réduisent la facture.
    /// </summary>
    public static Partie NouvelleVilleReelle(Reglages r, PaquetVille p, ulong graine = 1)
    {
        var partie = new Partie(r, p, graine)
        {
            ModeVilleReelle = true,
            ImpotHabitat = r.Demande.ImpotReference,
            ImpotCommerce = r.Demande.ImpotReference,
            ImpotActivites = r.Demande.ImpotReference,
        };
        partie.ImporterRoutesReelles();
        partie.ImporterBatimentsReels();
        foreach (var e in partie.Reseau.Aretes.Values.ToList()) partie.GenererParcelles(e); // terrains libres entre les bâtiments
        partie.MettreAJourServices();
        while (partie.Palier + 1 < r.Paliers.Count && partie.Population >= r.Paliers[partie.Palier + 1].Population) partie.Palier++;
        partie.Argent = Math.Max(r.VilleReelle.ArgentDepartMin, partie.Population * r.VilleReelle.ArgentDepartParHabitant);
        partie.CalculerCongestion();
        partie.CalculerAttrait();
        partie.Message("palier", $"Vous êtes maire de {p.Manifest.Ville.Nom}. La ville existe déjà : {partie.Population:N0} habitants estimés. " +
                                 "Population, emplois et hauteurs sont en partie estimés (voir l'écran des sources).");
        return partie;
    }

    private void ImporterRoutesReelles()
    {
        var correspondance = new Dictionary<int, int>();
        int Noeud(int idPaquet)
        {
            if (!correspondance.TryGetValue(idPaquet, out var id))
            {
                var n = Paquet.Routes.Noeuds[idPaquet];
                var nr = Reseau.NouveauNoeud(new V2(n.X, n.Y));
                nr.Entree = Math.Max(Math.Abs(n.X), Math.Abs(n.Y)) > DemiCote - 25;
                correspondance[idPaquet] = id = nr.Id;
            }
            return id;
        }
        foreach (var t in Paquet.Routes.Troncons)
        {
            if (t.Gabarit is "pieton" or "rail" || t.A == t.B || t.Tunnel) continue;
            string g = t.Gabarit is "voie_rapide" or "avenue" ? t.Gabarit : "rue";
            var trace = t.Trace.Select(c => new V2(c[0], c[1])).ToList();
            var e = Reseau.NouvelleArete(Noeud(t.A), Noeud(t.B), trace, g, departemental: g != "rue", nom: t.Nom);
            e.Pont = t.Pont;
            RasteriserRoute(e);
        }
    }

    private void ImporterBatimentsReels()
    {
        // index spatial des segments de route (carrés de 60 m) pour trouver vite la rue la plus proche
        const double carre = 60;
        var index = new Dictionary<(int, int), List<(int arete, V2 a, V2 b)>>();
        foreach (var e in Reseau.Aretes.Values)
            for (int i = 0; i + 1 < e.Trace.Count; i++)
            {
                var a = e.Trace[i]; var b = e.Trace[i + 1];
                int x0 = (int)Math.Floor(Math.Min(a.X, b.X) / carre), x1 = (int)Math.Floor(Math.Max(a.X, b.X) / carre);
                int y0 = (int)Math.Floor(Math.Min(a.Y, b.Y) / carre), y1 = (int)Math.Floor(Math.Max(a.Y, b.Y) / carre);
                for (int x = x0; x <= x1; x++)
                    for (int y = y0; y <= y1; y++)
                    {
                        if (!index.TryGetValue((x, y), out var l)) index[(x, y)] = l = new();
                        l.Add((e.Id, a, b));
                    }
            }
        int RuePlusProche(V2 p)
        {
            int cx = (int)Math.Floor(p.X / carre), cy = (int)Math.Floor(p.Y / carre);
            for (int r = 1; r <= 3; r++)
            {
                int meilleure = -1; double dmin = double.MaxValue;
                for (int x = cx - r; x <= cx + r; x++)
                    for (int y = cy - r; y <= cy + r; y++)
                        if (index.TryGetValue((x, y), out var l))
                            foreach (var (arete, a, b) in l)
                            {
                                Geo.Projection(p, a, b, out var q);
                                double d = V2.Distance(p, q);
                                if (d < dmin) { dmin = d; meilleure = arete; }
                            }
                if (meilleure >= 0 && Reseau.Aretes[meilleure].Gabarit != "voie_rapide") return meilleure;
            }
            return -1;
        }

        var v = R.VilleReelle;
        foreach (var bat in Paquet.Batiments)
        {
            var contour = bat.Contour.Select(c => new V2(c[0], c[1])).ToList();
            if (contour.Count < 3) continue;
            var centre = new V2(contour.Average(c => c.X), contour.Average(c => c.Y));
            // orientation : le côté le plus long
            V2 dir = new(1, 0); double lmax = 0;
            for (int i = 0; i < contour.Count; i++)
            {
                var d = contour[(i + 1) % contour.Count] - contour[i];
                if (d.Longueur > lmax) { lmax = d.Longueur; dir = d.Normalise(); }
            }
            double plancher = bat.SurfaceM2 * Math.Max(1, bat.Etages) * v.PartSurfaceUtile;
            int niveau = bat.HauteurM < 9 ? 1 : bat.HauteurM < 18 ? 2 : 3;
            Zone zone = Zone.Aucune; string? service = null; Batiment? b = null;
            switch (bat.Usage)
            {
                case "habitat":
                    zone = Zone.Habitat;
                    int logements = Math.Max(1, (int)Math.Round(plancher / v.M2ParLogement));
                    b = new Batiment { Type = zone, Niveau = niveau, Reel = true, CapaciteFixe = logements, Occupants = logements * v.OccupationInitiale };
                    break;
                case "commerce":
                case "bureaux":
                    zone = Zone.Commerce;
                    b = new Batiment { Type = zone, Niveau = niveau, Reel = true, CapaciteFixe = Math.Max(1, (int)Math.Round(plancher / v.M2ParEmploiCommerce)) };
                    break;
                case "activites":
                case "transport":
                case "agricole":
                    zone = Zone.Activites;
                    b = new Batiment { Type = zone, Niveau = niveau, Reel = true, CapaciteFixe = Math.Max(1, (int)Math.Round(plancher / v.M2ParEmploiActivites)) };
                    break;
                case "ecole": service = "ecole"; break;
                case "sante": service = "centre_sante"; break;
                default: service = "existant"; break;
            }
            var par = new Parcelle
            {
                Id = _prochaineParcelle++, Arete = RuePlusProche(centre), Centre = centre, Dir = dir, Normale = dir.Perp,
                Zone = zone, Service = service, Batiment = b, Contour = contour, HauteurReelle = bat.HauteurM,
                Variante = (int)(_alea.Suivant() & 0xFFFF),
            };
            Parcelles[par.Id] = par;
            var cellules = Grille.CellulesPolygone(contour);
            if (cellules.Count == 0) { var c = Grille.Cellule(centre); if (Grille.DansCarte(c.i, c.j)) cellules.Add(c); }
            Grille.MarquerParcelle(cellules, par.Id);
            _cellulesParcelle[par.Id] = cellules;
            if (par.Arete >= 0) Ajouter(_parcellesParArete, par.Arete, par.Id);
            CarresModifies.Add(Carre(centre));
        }
    }
}
