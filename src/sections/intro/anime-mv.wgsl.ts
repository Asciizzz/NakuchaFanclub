export const ANIME_MV_WGSL = /* wgsl */ `
struct SceneUniforms {
    resolution: vec2<f32>,
    time: f32,
    visualOffset: f32,
};

@group(0) @binding(0) var<uniform> uniforms: SceneUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    let p = pos[vertex_index];
    out.position = vec4<f32>(p, 0.0, 1.0);
    out.uv = p * 0.5 + 0.5;
    return out;
}

// SDF diamond / rhombus
fn sdRhombus(p: vec2<f32>, b: vec2<f32>) -> f32 {
    let q = abs(p);
    let h = clamp((-2.0 * dot(q, b) + dot(b, b)) / dot(b, b), -1.0, 1.0);
    let d = length(q - 0.5 * b * vec2<f32>(1.0 - h, 1.0 + h));
    return d * sign(q.x * b.y + q.y * b.x - b.x * b.y);
}

// Rotate 2D
fn rot2(a: f32) -> mat2x2<f32> {
    let c = cos(a);
    let s = sin(a);
    return mat2x2<f32>(c, -s, s, c);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    let shiftUv = uniforms.visualOffset / uniforms.resolution.x;
    var p = (uv - 0.5 - vec2<f32>(shiftUv, 0.0)) * vec2<f32>(aspect, 1.0);

    let t = uniforms.time * 0.25;

    // Chalk white dominant clean MV canvas
    let chalkPure = vec3<f32>(0.995, 0.995, 1.0);
    let iceTint = vec3<f32>(0.92, 0.955, 0.985);
    let cyanAccent = vec3<f32>(0.47, 0.67, 0.85);

    // Subtle atmospheric caustics
    let wave1 = sin(p.x * 2.2 + t * 0.6 + sin(p.y * 2.5 + t * 0.4) * 0.8);
    let wave2 = cos(p.y * 2.4 - t * 0.5 + cos(p.x * 1.8 + t * 0.4) * 0.7);
    let caustic = pow(clamp(wave1 * wave2 * 0.5 + 0.5, 0.0, 1.0), 3.8);

    var col = mix(chalkPure, iceTint, clamp(uv.y * 0.45 + length(uv - 0.5) * 0.2, 0.0, 1.0));
    col = mix(col, cyanAccent, caustic * 0.22);

    // Ambient floating anime diamonds
    for (var i = 0; i < 5; i++) {
        let fi = f32(i);
        let speed = 0.12 + fi * 0.04;
        let seedX = sin(fi * 3.7) * 0.85;
        let posY = fract(t * speed + fi * 0.22) * 1.6 - 0.8;
        let posX = seedX + sin(t * 0.5 + fi) * 0.12;

        let dp = rot2(t * 0.4 + fi) * (p - vec2<f32>(posX, posY));
        let d = sdRhombus(dp, vec2<f32>(0.035 + fi * 0.008, 0.055 + fi * 0.012));

        let diamondOutline = smoothstep(0.004, 0.0, abs(d) - 0.0015);
        let diamondGlow = exp(-max(0.0, d) * 35.0) * 0.25;

        col = mix(col, cyanAccent, (diamondOutline + diamondGlow) * 0.55);
    }

    return vec4<f32>(col, 1.0);
}
`;
