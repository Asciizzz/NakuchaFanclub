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

fn mod3(x: vec3f, y: vec3f) -> vec3f {
	return x - y * floor(x / y);
}

@fragment
fn fs_gradient(input: GradientOut) -> @location(0) vec4f {
	let iterations = 17;
	let formuparam = 0.53;
	let volsteps = 20;
	let stepsize = 0.1;
	let zoom = 0.8;
	let tile = 0.85;
	let speed = 0.01;
	let brightness = 0.0015;
	let darkmatter = 0.3;
	let distfading = 0.73;
	let saturation = 0.85;

	let res = vec2f(max(1.0, gradient.width), max(1.0, gradient.height));
	let fragCoord = input.uv * res;
	var uv = fragCoord / res - vec2f(0.5);
	uv.y *= res.y / res.x;

	var dir = vec3f(uv * zoom, 1.0);
	let time = gradient.time * speed + 0.25;
	let a1 = 0.5 / res.x * 2.0;
	let a2 = 0.8 / res.y * 2.0;

	dir = vec3f(rotate2(dir.xz, a1).x, dir.y, rotate2(dir.xz, a1).y);
	dir = vec3f(rotate2(dir.xy, a2), dir.z);

	var rayFrom = vec3f(1.0, 0.5, 0.5) + vec3f(time * 2.0, time, -2.0);
	rayFrom = vec3f(rotate2(rayFrom.xz, a1).x, rayFrom.y, rotate2(rayFrom.xz, a1).y);
	rayFrom = vec3f(rotate2(rayFrom.xy, a2), rayFrom.z);

	var s = 0.1;
	var fade = 1.0;
	var v = vec3f(0.0);

	for (var r = 0; r < volsteps; r++) {
		var p = rayFrom + s * dir * 0.5;
		p = abs(vec3f(tile) - mod3(p, vec3f(tile * 2.0)));

		var pa = 0.0;
		var a = 0.0;
		for (var i = 0; i < iterations; i++) {
			p = abs(p) / dot(p, p) - vec3f(formuparam);
			a += abs(length(p) - pa);
			pa = length(p);
		}

		let dm = max(0.0, darkmatter - a * a * 0.001);
		a *= a * a;
		if (r > 6) {
			fade *= 1.0 - dm;
		}
		v += vec3f(fade);
		v += vec3f(s, s * s, s * s * s * s) * a * brightness * fade;
		fade *= distfading;
		s += stepsize;
	}

	v = mix(vec3f(length(v)), v, saturation);
	return vec4f(v * 0.01, 1.0);
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
