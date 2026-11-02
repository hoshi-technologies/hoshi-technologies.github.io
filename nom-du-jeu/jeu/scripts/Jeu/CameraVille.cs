using Godot;

namespace Jeu.Jeu;

/// <summary>
/// Caméra libre de bâtisseur : déplacement (ZQSD, WASD ou flèches), rotation (A/E ou clic droit),
/// zoom (molette) jusqu'à la vue à hauteur d'habitant.
/// Les touches sont lues par position physique : elles fonctionnent sur clavier AZERTY comme QWERTY.
/// </summary>
public partial class CameraVille : Camera3D
{
    public Vector3 Cible;
    public float Distance = 900;
    public float Lacet = 0.5f;      // rotation autour de la verticale
    public float Tangage = 0.85f;   // angle au-dessus de l'horizon
    public float Demi = 2000;
    public Func<float, float, float> Altitude = (_, _) => 0;
    public const float DistanceMin = 6, DistanceMax = 4200;
    private bool _rotation, _glisser;

    public override void _Ready()
    {
        Far = 15000;
        Near = 0.3f;
        Fov = 55;
    }

    public override void _Process(double delta)
    {
        float dt = (float)delta;
        var dir = Vector2.Zero;
        if (Touche(Key.W) || Input.IsKeyPressed(Key.Up)) dir.Y -= 1;
        if (Touche(Key.S) || Input.IsKeyPressed(Key.Down)) dir.Y += 1;
        if (Touche(Key.A) || Input.IsKeyPressed(Key.Left)) dir.X -= 1;
        if (Touche(Key.D) || Input.IsKeyPressed(Key.Right)) dir.X += 1;
        if (dir != Vector2.Zero)
        {
            dir = dir.Normalized() * (Distance * 0.9f + 40) * dt;
            var avant = new Vector3(-Mathf.Sin(Lacet), 0, -Mathf.Cos(Lacet));
            var droite = new Vector3(Mathf.Cos(Lacet), 0, -Mathf.Sin(Lacet));
            Cible += droite * dir.X - avant * dir.Y;
        }
        if (Touche(Key.Q)) Lacet += 1.4f * dt;
        if (Touche(Key.E)) Lacet -= 1.4f * dt;
        if (Touche(Key.R)) Tangage = Mathf.Clamp(Tangage + dt, 0.05f, 1.45f);
        if (Touche(Key.F)) Tangage = Mathf.Clamp(Tangage - dt, 0.05f, 1.45f);
        Appliquer();
    }

    private static bool Touche(Key k) => Input.IsPhysicalKeyPressed(k);

    public void Appliquer()
    {
        Cible.X = Mathf.Clamp(Cible.X, -Demi, Demi);
        Cible.Z = Mathf.Clamp(Cible.Z, -Demi, Demi);
        Cible.Y = Altitude(Cible.X, Cible.Z);
        // près du sol, la caméra se redresse pour regarder la rue
        float t = Mathf.Clamp((Distance - DistanceMin) / 250f, 0, 1);
        float tangage = Mathf.Lerp(0.08f, Tangage, t);
        var offset = new Vector3(Mathf.Sin(Lacet) * Mathf.Cos(tangage), Mathf.Sin(tangage), Mathf.Cos(Lacet) * Mathf.Cos(tangage)) * Distance;
        var pos = Cible + offset;
        float sol = Altitude(pos.X, pos.Z) + 1.7f;
        if (pos.Y < sol) pos.Y = sol;
        Position = pos;
        LookAt(Cible + Vector3.Up * Mathf.Lerp(1.6f, 0, t), Vector3.Up);
    }

    public override void _UnhandledInput(InputEvent e)
    {
        if (e is InputEventMouseButton mb)
        {
            if (mb.ButtonIndex == MouseButton.WheelUp && mb.Pressed) Distance = Mathf.Max(DistanceMin, Distance * 0.85f);
            if (mb.ButtonIndex == MouseButton.WheelDown && mb.Pressed) Distance = Mathf.Min(DistanceMax, Distance / 0.85f);
            if (mb.ButtonIndex == MouseButton.Right) _rotation = mb.Pressed;
            if (mb.ButtonIndex == MouseButton.Middle) _glisser = mb.Pressed;
        }
        else if (e is InputEventMouseMotion mm)
        {
            if (_rotation)
            {
                Lacet -= mm.Relative.X * 0.005f;
                Tangage = Mathf.Clamp(Tangage + mm.Relative.Y * 0.004f, 0.05f, 1.45f);
            }
            if (_glisser)
            {
                var avant = new Vector3(-Mathf.Sin(Lacet), 0, -Mathf.Cos(Lacet));
                var droite = new Vector3(Mathf.Cos(Lacet), 0, -Mathf.Sin(Lacet));
                float k = Distance * 0.0015f;
                Cible += -droite * mm.Relative.X * k + avant * mm.Relative.Y * k;
            }
        }
    }

    /// <summary>Point du terrain sous la souris (lancer de rayon sur le relief), ou null.</summary>
    public Vector3? PointSol(Vector2 souris)
    {
        var o = ProjectRayOrigin(souris);
        var d = ProjectRayNormal(souris);
        float pas = Mathf.Max(1f, Distance / 400f);
        float t = 0;
        var precedent = o;
        for (int i = 0; i < 6000; i++)
        {
            t += pas;
            var p = o + d * t;
            if (Mathf.Abs(p.X) > Demi * 1.2f || Mathf.Abs(p.Z) > Demi * 1.2f) { if (t > Distance * 3) return null; }
            if (p.Y <= Altitude(p.X, p.Z))
            {
                // affinage par dichotomie
                float a = t - pas, b = t;
                for (int k = 0; k < 20; k++)
                {
                    float m = (a + b) / 2;
                    var q = o + d * m;
                    if (q.Y <= Altitude(q.X, q.Z)) b = m; else a = m;
                }
                return o + d * b;
            }
            precedent = p;
        }
        return null;
    }
}
