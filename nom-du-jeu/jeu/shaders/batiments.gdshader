// Bâtiments : couleur par sommet + fenêtres dessinées par le calcul (aucune texture),
// éclairées la nuit de façon aléatoire mais stable. Façades mouillées sous la pluie.
shader_type spatial;
render_mode cull_back;

global uniform float nuit;
global uniform float pluie;

varying vec3 pos_monde;
varying vec3 normale_monde;

float hasard(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void vertex() {
	pos_monde = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	normale_monde = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 base = pow(COLOR.rgb, vec3(2.2));
	ALBEDO = base;
	ROUGHNESS = mix(0.85, 0.35, pluie);
	if (abs(normale_monde.y) < 0.3) {
		vec2 axe = normalize(vec2(-normale_monde.z, normale_monde.x));
		float u = dot(pos_monde.xz, axe);
		float v = pos_monde.y;
		vec2 cellule = vec2(floor(u / 3.2), floor(v / 3.0));
		vec2 f = vec2(fract(u / 3.2), fract(v / 3.0));
		float fenetre = step(0.22, f.x) * step(f.x, 0.78) * step(0.32, f.y) * step(f.y, 0.82);
		ALBEDO = mix(ALBEDO, vec3(0.06, 0.08, 0.11), fenetre * 0.85);
		ROUGHNESS = mix(ROUGHNESS, 0.1, fenetre);
		float allumee = step(0.42, hasard(cellule + floor(pos_monde.xz / 37.0)));
		EMISSION = fenetre * allumee * nuit * vec3(1.0, 0.72, 0.38) * 2.2;
	}
}
