extends Node3D
# Banc d'essai : 10 000 habitants, grand réseau de routes, trajets domicile-travail, trafic.
# Mode console : godot --headless --path . -- --cpu
# Mode visuel (sur votre PC Windows) : lancer le projet normalement, mesure les FPS pendant 30 s.

const GRID := 200            # 200 x 200 carrefours = 40 000 noeuds, ~80 000 tronçons
const SPACING := 100.0       # 100 m entre carrefours -> carte de 20 km x 20 km
var HABITANTS := 10000
const SEED := 12345

var astar := AStar2D.new()
var paths: Array = []        # chemin (PackedInt64Array) par habitant
var pos_idx := PackedInt32Array()
var progress := PackedFloat32Array()
var edge_load := {}          # charge (congestion) par tronçon
var mm: MultiMesh
var rng := RandomNumberGenerator.new()
var results := {}
var frames := 0
var t_visual := 0.0
var fps_samples: Array = []

func _ready() -> void:
	rng.seed = SEED
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--habitants="):
			HABITANTS = int(a.split("=")[1])
	results["habitants"] = HABITANTS
	var headless := DisplayServer.get_name() == "headless"
	_build_roads()
	_build_routes()
	_bench_ticks(100)
	if headless:
		_print_and_quit()
	else:
		_build_visual()

func _id(x: int, y: int) -> int:
	return y * GRID + x

func _build_roads() -> void:
	var t := Time.get_ticks_usec()
	astar.reserve_space(GRID * GRID)
	for y in GRID:
		for x in GRID:
			astar.add_point(_id(x, y), Vector2(x, y) * SPACING)
	var edges := 0
	for y in GRID:
		for x in GRID:
			# quelques routes manquantes pour un réseau moins régulier
			if x + 1 < GRID and rng.randf() > 0.08:
				astar.connect_points(_id(x, y), _id(x + 1, y)); edges += 1
			if y + 1 < GRID and rng.randf() > 0.08:
				astar.connect_points(_id(x, y), _id(x, y + 1)); edges += 1
	results["routes_noeuds"] = GRID * GRID
	results["routes_troncons"] = edges
	results["routes_ms"] = (Time.get_ticks_usec() - t) / 1000.0

func _build_routes() -> void:
	# Les habitants vivent et travaillent dans un rayon réaliste (<= ~8 km)
	var t := Time.get_ticks_usec()
	var fails := 0
	var total_len := 0
	for i in HABITANTS:
		var hx := rng.randi_range(20, GRID - 21); var hy := rng.randi_range(20, GRID - 21)
		var wx := clampi(hx + rng.randi_range(-80, 80), 0, GRID - 1)
		var wy := clampi(hy + rng.randi_range(-80, 80), 0, GRID - 1)
		var p := astar.get_id_path(_id(hx, hy), _id(wx, wy))
		if p.size() < 2:
			fails += 1
			p = PackedInt64Array([_id(hx, hy), _id(hx, hy)])
		total_len += p.size()
		paths.append(p)
	pos_idx.resize(HABITANTS); progress.resize(HABITANTS)
	results["trajets_calcules"] = HABITANTS
	results["trajets_echecs"] = fails
	results["trajets_longueur_moy_troncons"] = float(total_len) / HABITANTS
	results["trajets_ms_total"] = (Time.get_ticks_usec() - t) / 1000.0

func _tick(dt: float) -> void:
	# Déplacement + comptage de congestion par tronçon (simulation de trafic simple)
	edge_load.clear()
	for i in HABITANTS:
		var p: PackedInt64Array = paths[i]
		var k := pos_idx[i]
		var key := p[k] * 65536 + p[mini(k + 1, p.size() - 1)]
		var load: int = edge_load.get(key, 0)
		edge_load[key] = load + 1
		var speed := 13.9 / (1.0 + load * 0.05)   # 50 km/h ralenti par la congestion
		progress[i] += speed * dt
		if progress[i] >= SPACING:
			progress[i] -= SPACING
			pos_idx[i] = k + 1 if k + 2 < p.size() else 0

func _bench_ticks(n: int) -> void:
	var t := Time.get_ticks_usec()
	for _i in n:
		_tick(0.5)
	results["tick_trafic_ms_moyen"] = (Time.get_ticks_usec() - t) / 1000.0 / n
	results["memoire_statique_Mo"] = OS.get_static_memory_usage() / 1048576.0

func _build_visual() -> void:
	var env := WorldEnvironment.new(); env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_SKY
	env.environment.sky = Sky.new(); env.environment.sky.sky_material = ProceduralSkyMaterial.new()
	add_child(env)
	var sun := DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-50, 30, 0); sun.shadow_enabled = true
	add_child(sun)
	var ground := MeshInstance3D.new(); var pm := PlaneMesh.new()
	pm.size = Vector2(GRID * SPACING, GRID * SPACING); ground.mesh = pm
	ground.position = Vector3(GRID * SPACING / 2, 0, GRID * SPACING / 2); add_child(ground)
	mm = MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
	var box := BoxMesh.new(); box.size = Vector3(2, 1.5, 4); mm.mesh = box
	mm.instance_count = HABITANTS
	var mmi := MultiMeshInstance3D.new(); mmi.multimesh = mm; add_child(mmi)
	var cam := Camera3D.new(); cam.far = 30000
	cam.position = Vector3(GRID * SPACING / 2, 2500, GRID * SPACING / 2 + 3000)
	add_child(cam); cam.look_at(Vector3(GRID * SPACING / 2, 0, GRID * SPACING / 2))

func _process(delta: float) -> void:
	if mm == null:
		return
	_tick(delta * 10.0)
	for i in HABITANTS:
		var p: PackedInt64Array = paths[i]
		var a := astar.get_point_position(p[pos_idx[i]])
		var b := astar.get_point_position(p[mini(pos_idx[i] + 1, p.size() - 1)])
		var v := a.lerp(b, progress[i] / SPACING)
		mm.set_instance_transform(i, Transform3D(Basis(), Vector3(v.x, 1, v.y)))
	t_visual += delta
	if t_visual > 2.0:
		fps_samples.append(Engine.get_frames_per_second())
	if t_visual > 30.0:
		fps_samples.sort()
		results["fps_median"] = fps_samples[fps_samples.size() / 2]
		results["fps_1pct_bas"] = fps_samples[int(fps_samples.size() * 0.01)]
		results["gpu"] = RenderingServer.get_video_adapter_name()
		_print_and_quit()

func _print_and_quit() -> void:
	results["moteur"] = Engine.get_version_info()["string"]
	results["cpu"] = OS.get_processor_name()
	results["coeurs"] = OS.get_processor_count()
	var txt := JSON.stringify(results, "  ")
	print(txt)
	var f := FileAccess.open("user://resultats_bench.json", FileAccess.WRITE)
	if f: f.store_string(txt)
	print("Resultats ecrits dans : ", ProjectSettings.globalize_path("user://resultats_bench.json"))
	get_tree().quit()
