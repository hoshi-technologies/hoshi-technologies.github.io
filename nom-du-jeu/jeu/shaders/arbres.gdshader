// Arbres : feuillage selon la saison (vert, roux en automne, dégarni en hiver pour les feuillus), neige sur les cimes.
shader_type spatial;

uniform bool persistant = false;      // conifère : reste vert
global uniform float saison;
global uniform float neige_altitude;

varying vec3 pos_monde;
varying vec3 normale_monde;

void vertex() {
	pos_monde = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	normale_monde = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 c = pow(COLOR.rgb, vec3(2.2));
	bool feuillage = COLOR.g > COLOR.r * 1.2;
	if (feuillage && !persistant) {
		float automne = clamp(1.0 - abs(saison - 0.8) * 7.0, 0.0, 1.0);
		float hiver = clamp(1.0 - min(saison, 1.0 - saison) * 7.0, 0.0, 1.0);
		float printemps = clamp(1.0 - abs(saison - 0.3) * 8.0, 0.0, 1.0);
		c = mix(c, vec3(0.55, 0.22, 0.04), automne * 0.85);
		c = mix(c, vec3(0.20, 0.16, 0.12), hiver * 0.8);
		c = mix(c, c * vec3(0.9, 1.25, 0.8), printemps * 0.6);
	}
	float neige = smoothstep(neige_altitude - 40.0, neige_altitude + 40.0, pos_monde.y) * smoothstep(0.3, 0.7, normale_monde.y);
	ALBEDO = mix(c, vec3(0.93, 0.95, 0.98), feuillage ? neige * 0.8 : 0.0);
	ROUGHNESS = 0.9;
}
