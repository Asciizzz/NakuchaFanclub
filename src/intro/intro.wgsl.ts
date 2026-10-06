export const INTRO_WGSL = /* wgsl */ `
struct IntroUniforms {
	resolution: vec2<f32>,
	time: f32,
	phase: f32,          // 0 = loading wheel, 1 = morph to line, 2 = split open, 3 = complete
	loadProgress: f32,   // 0.0 -> 1.0 (wheel turns 0 to 360 deg)
	morphProgress: f32,  // 0.0 -> 1.0 (wheel flattens into vertical line)
	splitProgress: f32,  // 0.0 -> 1.0 (background splits open to left & right)
	aspect: f32,
};

@group(0) @binding(0) var<uniform> uniforms: IntroUniforms;

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

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
	let uv = in.uv;
	let aspect = uniforms.aspect;
	// Centered coordinate system
	let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

	let phase = uniforms.phase;
	let loadP = uniforms.loadProgress;
	let morphP = uniforms.morphProgress;
	let splitP = uniforms.splitProgress;

	// Completed: entire canvas is transparent
	if (phase >= 3.0) {
		discard;
	}

	// Exact palette specifications
	let bgInk = vec3<f32>(0.10196, 0.15686, 0.21961);   // #1A2838
	let chalkWhite = vec3<f32>(0.86275, 0.93725, 1.0);  // #DCEFFF

	// 1. Phase 2: Split Open Vertically (Seam expands horizontally, sliding doors left & right)
	if (phase >= 2.0) {
		let maxHalfWidth = aspect * 0.55;
		let splitGap = splitP * maxHalfWidth;

		// Inside the opening: reveal the underlying Home section
		if (abs(p.x) < splitGap) {
			discard;
		}

		// Sliding panels on left and right
		var col = bgInk;

		// Chalk white line riding along the leading edge of each moving door
		let leftEdgeDist = abs(p.x + splitGap);
		let rightEdgeDist = abs(p.x - splitGap);
		let edgeDist = min(leftEdgeDist, rightEdgeDist);
		let line = smoothstep(0.0035, 0.001, edgeDist);
		col = mix(col, chalkWhite, line);

		return vec4<f32>(col, 1.0);
	}

	// 2. Base #1A2838 Background
	var col = bgInk;
	let radius = 0.09;

	// 3. Phase 0: Loading Wheel (Turns 0 to 360 degrees)
	if (phase < 1.0) {
		let distFromCenter = length(p);
		let ringDist = abs(distFromCenter - radius);

		// Clockwise angle starting from top (12 o'clock)
		var angle = atan2(p.x, -p.y) / 6.2831853;
		if (angle < 0.0) {
			angle += 1.0;
		}

		// Only draw arc where angle <= loadProgress
		if (angle <= loadP) {
			let ring = smoothstep(0.0035, 0.001, ringDist);
			col = mix(col, chalkWhite, ring);
		}

		return vec4<f32>(col, 1.0);
	}

	// 4. Phase 1: Morph Wheel Into Single Vertical Line
	let circleDist = abs(length(p) - radius);
	let lineDist = abs(p.x);

	// Smoothly morph circle distance into vertical line distance
	let currentDist = mix(circleDist, lineDist, morphP);
	let morphLine = smoothstep(0.0035, 0.001, currentDist);
	col = mix(col, chalkWhite, morphLine);

	return vec4<f32>(col, 1.0);
}
`;
