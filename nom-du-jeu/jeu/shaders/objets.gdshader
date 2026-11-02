// Véhicules, bateaux, piétons, mobilier : couleur par sommet (et par exemplaire).
// Les parties très claires et chaudes (phares, lampes) brillent la nuit.
shader_type spatial;

global uniform float nuit;
global uniform float pluie;

void fragment() {
	vec3 c = COLOR.rgb;
	ALBEDO = pow(c, vec3(2.2));
	ROUGHNESS = mix(0.5, 0.25, pluie);
	float lampe = step(0.97, c.r) * step(0.85, c.g) * step(0.6, c.b) * step(c.b, 0.8);
	EMISSION = lampe * nuit * vec3(1.0, 0.85, 0.55) * 4.0;
}
