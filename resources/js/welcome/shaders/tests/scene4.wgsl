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

fn n21(p: vec2f) -> f32 {
	var a = fract(vec3f(p.x, p.y, p.x) * vec3f(213.897, 653.453, 253.098));
	a += dot(a, a.yzx + vec3f(79.76));
	return fract((a.x + a.y) * a.z);
}

fn getPos(id: vec2f, offs: vec2f, t: f32) -> vec2f {
	let n = n21(id + offs);
	let n1 = fract(n * 10.0);
	let n2 = fract(n * 100.0);
	let a = t + n;
	return offs + vec2f(sin(a * n1), cos(a * n2)) * 0.4;
}

fn dfLine(a: vec2f, b: vec2f, p: vec2f) -> f32 {
	let pa = p - a;
	let ba = b - a;
	let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
	return length(pa - ba * h);
}

fn netLine(a: vec2f, b: vec2f, uv: vec2f) -> f32 {
	let r1 = 0.04;
	let r2 = 0.01;
	let d = dfLine(a, b, uv);
	let d2 = length(a - b);
	var fade = smoothstep(1.5, 0.5, d2);
	fade += smoothstep(0.05, 0.02, abs(d2 - 0.75));
	return smoothstep(r1, r2, d) * fade;
}

fn netLayer(stIn: vec2f, n: f32, t: f32) -> f32 {
	let id = floor(stIn) + vec2f(n);
	let st = fract(stIn) - vec2f(0.5);
	var p: array<vec2f, 9>;
	var idx = 0;

	for (var y = -1; y <= 1; y++) {
		for (var x = -1; x <= 1; x++) {
			p[idx] = getPos(id, vec2f(f32(x), f32(y)), t);
			idx += 1;
		}
	}

	var m = 0.0;
	var sparkle = 0.0;
	for (var i = 0; i < 9; i++) {
		m += netLine(p[4], p[i], st);
		let d = length(st - p[i]);
		var s = 0.005 / max(d * d, 0.0001);
		s *= smoothstep(1.0, 0.7, d);
		var pulse = sin((fract(p[i].x) + fract(p[i].y) + t) * 5.0) * 0.4 + 0.6;
		pulse = pow(pulse, 20.0);
		s *= pulse;
		sparkle += s;
	}

	m += netLine(p[1], p[3], st);
	m += netLine(p[1], p[5], st);
	m += netLine(p[7], p[5], st);
	m += netLine(p[7], p[3], st);

	var sPhase = (sin(t + n) + sin(t * 0.1)) * 0.25 + 0.5;
	sPhase += pow(sin(t * 0.1) * 0.5 + 0.5, 50.0) * 5.0;
	m += sparkle * sPhase;
	return m;
}

@fragment
fn fs_gradient(input: GradientOut) -> @location(0) vec4f {
	let numLayers = 4.0;
	let res = vec2f(max(1.0, gradient.width), max(1.0, gradient.height));
	let fragCoord = input.uv * res;
	var uv = (fragCoord - res * 0.5) / res.y;
	var mouseLike = vec2f(0.0);
	var t = gradient.time * 0.1;

	let s = sin(t);
	let c = cos(t);
	let st = vec2f(uv.x * c + uv.y * s, -uv.x * s + uv.y * c);
	mouseLike = vec2f(mouseLike.x * c + mouseLike.y * s, -mouseLike.x * s + mouseLike.y * c) * 2.0;

	var m = 0.0;
	for (var layer = 0; layer < 4; layer++) {
		let i = f32(layer) / numLayers;
		let z = fract(t + i);
		let size = mix(15.0, 1.0, z);
		let fade = smoothstep(0.0, 0.6, z) * smoothstep(1.0, 0.8, z);
		m += fade * netLayer(st * size - mouseLike * z, i, gradient.time);
	}

	let fft = 0.45 + 0.35 * sin(gradient.time * 0.7);
	let glow = -uv.y * fft * 2.0;
	var baseCol = vec3f(s, cos(t * 0.4), -sin(t * 0.24)) * 0.4 + vec3f(0.6);
	var col = baseCol * m;
	col += baseCol * glow;
	col *= 1.0 - dot(uv, uv);
	t = gradient.time % 230.0;
	col *= smoothstep(0.0, 20.0, t) * smoothstep(224.0, 200.0, t);
	return vec4f(col, 1.0);
}

struct CubeIn {
	@location(0) position: vec3f,
	@location(1) normal: vec3f,
	@location(2) uv: vec2f,
	@location(3) tangent: vec4f,
	@location(4) color: vec4f,
	@location(5) boneID: vec4f,
	@location(6) boneWeight: vec4f,
	@location(7) model0: vec4f,
	@location(8) model1: vec4f,
	@location(9) model2: vec4f,
	@location(10) model3: vec4f,
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
