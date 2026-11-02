using Godot;

namespace Jeu.Jeu;

/// <summary>
/// Ambiance sonore fabriquée en direct par le calcul (aucun fichier son, aucune licence) :
/// rumeur de la ville, vent (montagne, hauteur), clapotis (bord de l'eau), oiseaux (campagne, jour),
/// grillons (nuits d'été), pluie. Les volumes suivent ce que regarde la caméra.
/// </summary>
public partial class AmbianceSonore : Node
{
    private const int Frequence = 22050;
    private AudioStreamPlayer _lecteur = null!;
    private AudioStreamGeneratorPlayback? _flux;
    private readonly Random _rnd = new(7);

    // volumes cibles (0..1) fixés par le jeu, et volumes lissés
    public float Ville, Vent, Eau, Oiseaux, Grillons, Pluie;
    public float Volume { get; set; } = 0.8f;
    public bool Muet { get; set; }
    private float _v, _w, _e, _o, _g, _p;

    // état des générateurs
    private double _brun, _brun2, _passeBas, _passeBasPluie, _t;
    private double _chantRestant, _chantFreq, _chantPente, _phaseChant, _prochainChant;
    private double _phaseGrillon;

    public override void _Ready()
    {
        var gen = new AudioStreamGenerator { MixRate = Frequence, BufferLength = 0.25f };
        _lecteur = new AudioStreamPlayer { Stream = gen, VolumeDb = -6 };
        AddChild(_lecteur);
        _lecteur.Play();
        _flux = _lecteur.GetStreamPlayback() as AudioStreamGeneratorPlayback;
    }

    private double Bruit() => _rnd.NextDouble() * 2 - 1;

    public override void _Process(double delta)
    {
        if (_flux == null) return;
        float k = (float)Math.Min(1, delta * 1.5);
        float g = Muet ? 0 : Volume;
        _v += (Ville * g - _v) * k; _w += (Vent * g - _w) * k; _e += (Eau * g - _e) * k;
        _o += (Oiseaux * g - _o) * k; _g += (Grillons * g - _g) * k; _p += (Pluie * g - _p) * k;
        int n = _flux.GetFramesAvailable();
        for (int i = 0; i < n; i++)
        {
            _t += 1.0 / Frequence;
            double blanc = Bruit();
            // rumeur de ville : bruit « brun » (grave, continu)
            _brun = (_brun + 0.02 * blanc) / 1.02;
            double ville = _brun * 3.2 * _v;
            // vent : bruit filtré dont la force varie lentement
            double force = 0.55 + 0.45 * Math.Sin(_t * 0.23) * Math.Sin(_t * 0.071 + 1);
            _passeBas += (blanc - _passeBas) * (0.02 + 0.03 * force);
            double vent = _passeBas * 1.6 * force * _w;
            // clapotis : bruit brun modulé par des vagues lentes
            _brun2 = (_brun2 + 0.03 * Bruit()) / 1.03;
            double vagues = _brun2 * 2.5 * (0.5 + 0.5 * Math.Sin(_t * 0.9) * Math.Sin(_t * 0.37)) * _e;
            // pluie : bruit aigu
            _passeBasPluie += (blanc - _passeBasPluie) * 0.3;
            double pluie = (blanc - _passeBasPluie) * 0.35 * _p;
            // oiseaux : petits chants (sifflements glissants) à intervalles aléatoires
            double oiseau = 0;
            if (_chantRestant > 0)
            {
                _chantRestant -= 1.0 / Frequence;
                _chantFreq += _chantPente / Frequence;
                _phaseChant += 2 * Math.PI * _chantFreq / Frequence;
                double env = Math.Sin(Math.PI * Math.Clamp(_chantRestant / 0.15, 0, 1));
                oiseau = Math.Sin(_phaseChant) * env * 0.12 * _o;
            }
            else if (_t > _prochainChant)
            {
                _chantRestant = 0.08 + _rnd.NextDouble() * 0.12;
                _chantFreq = 2500 + _rnd.NextDouble() * 2500;
                _chantPente = (_rnd.NextDouble() - 0.4) * 18000;
                _prochainChant = _t + 0.15 + _rnd.NextDouble() * (_o > 0.3 ? 1.5 : 4);
            }
            // grillons : trilles aigus pulsés
            _phaseGrillon += 2 * Math.PI * 4300 / Frequence;
            double pulse = Math.Max(0, Math.Sin(_t * 2 * Math.PI * 28)) * (Math.Sin(_t * 2 * Math.PI * 0.8) > 0.2 ? 1 : 0);
            double grillon = Math.Sin(_phaseGrillon) * pulse * 0.035 * _g;

            float gauche = (float)Math.Clamp(ville + vent + vagues + pluie + oiseau + grillon, -1, 1);
            float droite = (float)Math.Clamp(ville * 0.95 + vent * 0.9 + vagues + pluie * 1.05 + oiseau * 0.6 + grillon * 1.1, -1, 1);
            _flux.PushFrame(new Vector2(gauche, droite));
        }
    }
}
