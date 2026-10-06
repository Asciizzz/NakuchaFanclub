export const HOME_AMBIENT_WGSL = /* wgsl */ `
struct Uniforms {
	resolution: vec2<f32>,
	time: f32,
	visualOffset: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
	var pos = array<vec2<f32>, 3>(
		vec2<f32>(-1.0, -1.0),
		vec2<f32>( 3.0, -1.0),
		vec2<f32>(-1.0,  3.0)
	);
	let p = pos[vertex_index];
	var out: VertexOutput;
	out.position = vec4<f32>(p, 0.0, 1.0);
	out.uv = p * 0.5 + 0.5;
	return out;
}

fn hash12(p: vec2<f32>) -> f32 {
	var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
	let res = uniforms.resolution;
	let aspect = res.x / max(1.0, res.y);
	let t = uniforms.time;
	let offset = uniforms.visualOffset / res.x;

	let uv = in.uv;
	let shiftedUv = vec2<f32>(uv.x - offset * 0.35, uv.y);
	let p = vec2<f32>((shiftedUv.x - 0.5) * aspect, shiftedUv.y - 0.5);

	// 1. Torinoko clean ambient gradient: Pure White to Soft Powder Sky
	let grad = smoothstep(-0.6, 0.6, p.y + p.x * 0.2);
	var col = mix(vec3<f32>(0.99, 0.995, 1.0), vec3<f32>(0.90, 0.94, 0.98), grad);

	// 2. Subtle luminous wave curves (delicate cyan & lilac ribbons)
	let wave1 = sin(p.x * 3.5 + t * 0.4) * 0.08 + sin(p.x * 7.0 - t * 0.3) * 0.03;
	let waveDist1 = abs(p.y - wave1 + 0.1);
	let waveGlow1 = smoothstep(0.18, 0.0, waveDist1) * 0.07;
	col = mix(col, vec3<f32>(0.45, 0.72, 0.88), waveGlow1);

	let wave2 = cos(p.x * 4.2 - t * 0.25) * 0.07 + cos(p.x * 8.5 + t * 0.5) * 0.02;
	let waveDist2 = abs(p.y - wave2 - 0.15);
	let waveGlow2 = smoothstep(0.15, 0.0, waveDist2) * 0.05;
	col = mix(col, vec3<f32>(0.75, 0.65, 0.85), waveGlow2);

	// 3. Subtle micro-dot lattice grid
	let gridSize = 48.0;
	let gridUv = fract(shiftedUv * vec2<f32>(gridSize * aspect, gridSize)) - 0.5;
	let dotDist = length(gridUv);
	let dots = smoothstep(0.06, 0.02, dotDist) * 0.035;
	col -= vec3<f32>(0.1, 0.15, 0.22) * dots;

	// 4. Soft floating ambient particles
	for (var i = 0; i < 12; i = i + 1) {
		let fi = f32(i);
		let seed = vec2<f32>(fi * 17.13, fi * 31.41);
		let rnd = hash12(seed);
		let speed = 0.04 + rnd * 0.05;
		let partY = fract(0.1 * fi - t * speed * 0.3) - 0.5;
		let partX = (fract(rnd * 5.3 + fi * 0.15) - 0.5) * aspect;
		let partPos = vec2<f32>(partX, partY);
		let partDist = length(p - partPos);
		let partRadius = 0.008 + rnd * 0.012;
		let partGlow = smoothstep(partRadius * 3.0, 0.0, partDist) * 0.12;
		col = mix(col, vec3<f32>(0.35, 0.65, 0.85), partGlow);
	}

	return vec4<f32>(col, 1.0);
}
`;
