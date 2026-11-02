// Terrain : couleur par sommet, teinte selon la saison, neige en altitude l'hiver, sol mouillé sous la pluie.
shader_type spatial;

global uniform float saison;          // 0 = 1er janvier, 0.5 = 1er juillet
global uniform float neige_altitude;  // altitude au-dessus de laquelle il neige (m)
global uniform float pluie;

varying vec3 pos_monde;
varying vec3 normale_monde;

void vertex() {
	pos_monde = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	normale_monde = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 base = pow(COLOR.rgb, vec3(2.2));
	// printemps vert vif, été un peu jauni, automne roussi, hiver terne
	float ete = clamp(1.0 - abs(saison - 0.55) * 4.0, 0.0, 1.0);
	float automne = clamp(1.0 - abs(saison - 0.8) * 6.0, 0.0, 1.0);
	float hiver = clamp(1.0 - min(saison, 1.0 - saison) * 6.0, 0.0, 1.0);
	base = mix(base, base * vec3(1.12, 1.05, 0.75), ete * 0.5);
	base = mix(base, base * vec3(1.15, 0.9, 0.6), automne * 0.6);
	base = mix(base, base * vec3(0.85, 0.85, 0.8), hiver * 0.6);
	float neige = smoothstep(neige_altitude - 40.0, neige_altitude + 40.0, pos_monde.y) * smoothstep(0.55, 0.8, normale_monde.y);
	ALBEDO = mix(base, vec3(0.92, 0.94, 0.97), neige);
	ROUGHNESS = mix(mix(1.0, 0.45, pluie), 0.6, neige);
}
