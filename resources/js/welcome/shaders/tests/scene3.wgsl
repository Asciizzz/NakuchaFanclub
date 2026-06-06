struct Scene {
	viewProj: mat4x4f,
}

struct ComputeParams {
	time: f32,
	deltaTime: f32,
	count: u32,
	_pad: u32,
}

struct InstanceState {
	pos: vec4f,
	rot: vec4f,
}

struct GradientTime {
	time: f32,
	width: f32,
	height: f32,
	_pad2: f32,
}

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: ComputeParams;
@group(0) @binding(4) var<storage, read_write> states: array<InstanceState>;
@group(0) @binding(5) var<storage, read_write> models: array<mat4x4f>;
@group(0) @binding(6) var<uniform> gradient: GradientTime;

struct GradientOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
}

@vertex
fn vs_gradient(@builtin(vertex_index) id: u32) -> GradientOut {
	let pos = array<vec2f, 3>(
		vec2f(-1.0, -1.0),
		vec2f( 3.0, -1.0),
		vec2f(-1.0,  3.0)
	);
	let p = pos[id];
	var out: GradientOut;
	out.position = vec4f(p, 0.0, 1.0);
	out.uv = p * 0.5 + vec2f(0.5, 0.5);
	return out;
}

fn rotate2(v: vec2f, a: f32) -> vec2f {
	let c = cos(a);
	let s = sin(a);
	return vec2f(v.x * c - v.y * s, v.x * s + v.y * c);
}

fn sdBox(p: vec3f, b: vec3f) -> f32 {
	let q = abs(p) - b;
	return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn octBox(posIn: vec3f, scale: f32) -> f32 {
	var pos = posIn * scale;
	let base = sdBox(pos, vec3f(0.4, 0.4, 0.1)) / 1.5;
	pos.x = pos.x * 5.0;
	pos.y = pos.y * 5.0 - 3.5;
	pos = vec3f(rotate2(pos.xy, 0.75), pos.z);
	return -base;
}

fn boxSet(pos: vec3f, shaderTime: f32) -> f32 {
	let wave = sin(shaderTime * 0.4);
	let shift = wave * 2.5;
	let scale = 2.0 - abs(wave) * 1.5;

	var p1 = pos;
	p1.y += shift;
	p1 = vec3f(rotate2(p1.xy, 0.8), p1.z);
	let box1 = octBox(p1, scale);

	var p2 = pos;
	p2.y -= shift;
	p2 = vec3f(rotate2(p2.xy, 0.8), p2.z);
	let box2 = octBox(p2, scale);

	var p3 = pos;
	p3.x += shift;
	p3 = vec3f(rotate2(p3.xy, 0.8), p3.z);
	let box3 = octBox(p3, scale);

	var p4 = pos;
	p4.x -= shift;
	p4 = vec3f(rotate2(p4.xy, 0.8), p4.z);
	let box4 = octBox(p4, scale);

	let p5 = vec3f(rotate2(pos.xy, 0.8), pos.z);
	let box5 = octBox(p5, 0.5) * 6.0;
	let box6 = octBox(pos, 0.5) * 6.0;

	return max(max(max(max(max(box1, box2), box3), box4), box5), box6);
}

fn mapOct(pos: vec3f, shaderTime: f32) -> f32 {
	return boxSet(pos, shaderTime);
}

fn mod3(x: vec3f, y: vec3f) -> vec3f {
	return x - y * floor(x / y);
}

@fragment
fn fs_gradient(input: GradientOut) -> @location(0) vec4f {
	let res = vec2f(max(1.0, gradient.width), max(1.0, gradient.height));
	let fragCoord = input.uv * res;
	let shaderTime = gradient.time;
	let p2 = (fragCoord * 2.0 - res) / min(res.x, res.y);

	var ro = vec3f(0.0, -0.2, shaderTime * 4.0);
	var ray = normalize(vec3f(p2, 1.5));
	ray = vec3f(rotate2(ray.xy, sin(shaderTime * 0.03) * 5.0), ray.z);
	ray = vec3f(ray.x, rotate2(ray.yz, sin(shaderTime * 0.05) * 0.2));

	var t = 0.1;
	var ac = 0.0;
	for (var i = 0; i < 50; i++) {
		var pos = ro + ray * t;
		pos = mod3(pos - vec3f(2.0), vec3f(4.0)) - vec3f(2.0);
		let localTime = shaderTime - f32(i) * 0.01;
		var d = mapOct(pos, localTime);
		d = max(abs(d), 0.01);
		ac += exp(-d * 23.0);
		t += d * 0.55;
	}

	var col = vec3f(ac * 0.02);
	col += vec3f(0.0, 0.2 * abs(sin(shaderTime)), 0.5 + sin(shaderTime) * 0.2);
	return vec4f(col, 1.0 - t * (0.02 + 0.02 * sin(shaderTime)));
}

struct CubeIn {
	@location(0) position: vec3f,
	@location(1) uv: vec2f,
	@location(2) model0: vec4f,
	@location(3) model1: vec4f,
	@location(4) model2: vec4f,
	@location(5) model3: vec4f,
}

struct CubeOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
}

@vertex
fn vs_main(input: CubeIn) -> CubeOut {
	let model = mat4x4f(input.model0, input.model1, input.model2, input.model3);
	var out: CubeOut;
	out.position = scene.viewProj * model * vec4f(input.position, 1.0);
	out.uv = input.uv;
	return out;
}

@vertex
fn vs_outline(input: CubeIn) -> CubeOut {
	let model = mat4x4f(input.model0, input.model1, input.model2, input.model3);
	let dir = normalize(input.position);
	var out: CubeOut;
	out.position = scene.viewProj * model * vec4f(input.position + dir * 0.075, 1.0);
	out.uv = input.uv;
	return out;
}

@fragment
fn fs_main(input: CubeOut) -> @location(0) vec4f {
	return textureSample(tex, texSampler, input.uv);
}

@fragment
fn fs_outline(_input: CubeOut) -> @location(0) vec4f {
	return vec4f(1.0, 1.0, 1.0, 1.0);
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
	let i = gid.x;
	if (i >= params.count) {
		return;
	}

	var state = states[i];
	state.rot.x = state.rot.x + state.rot.y * params.deltaTime;
	states[i] = state;

	let a = state.rot.x;
	let c = cos(a);
	let s = sin(a);
	let y = state.pos.y + sin(params.time * 1.35 + state.rot.z) * state.rot.w;

	models[i] = mat4x4f(
		vec4f(c, 0.0, -s, 0.0),
		vec4f(0.0, 1.0, 0.0, 0.0),
		vec4f(s, 0.0, c, 0.0),
		vec4f(state.pos.x, y, state.pos.z, 1.0)
	);
}

