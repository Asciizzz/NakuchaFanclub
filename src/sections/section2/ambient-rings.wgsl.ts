export const AMBIENT_RINGS_WGSL = /* wgsl */ `
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

    let t = uniforms.time * 0.22;

    // Chalk white dominant with rose/pink tints
    let chalkPure = vec3<f32>(1.0, 0.995, 0.998);
    let roseTint = vec3<f32>(0.98, 0.93, 0.95);
    let magentaAccent = vec3<f32>(0.85, 0.35, 0.55);

    var col = mix(chalkPure, roseTint, clamp(uv.y * 0.4 + length(uv - 0.5) * 0.25, 0.0, 1.0));

    // Ambient concentric acoustic pulse rings
    for (var i = 0; i < 5; i++) {
        let fi = f32(i);
        let speed = 0.09 + fi * 0.03;
        let seedX = sin(fi * 2.3) * 0.8;
        let posY = fract(t * speed + fi * 0.2) * 1.6 - 0.8;
        let posX = seedX + sin(t * 0.45 + fi) * 0.12;

        let center = vec2<f32>(posX, posY);
        let dist = length(p - center);

        let pulsePhase = fract(t * 0.6 + fi * 0.25);
        let ringR = pulsePhase * 0.22;
        let ringD = abs(dist - ringR);

        let ringLine = smoothstep(0.003, 0.0, ringD - 0.0015) * (1.0 - pulsePhase);
        let centerGlow = exp(-dist * 40.0) * 0.3;

        col = mix(col, magentaAccent, (ringLine + centerGlow) * 0.55);
    }

    return vec4<f32>(col, 1.0);
}
`;
