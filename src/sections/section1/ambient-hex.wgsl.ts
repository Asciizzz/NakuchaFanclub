export const AMBIENT_HEX_WGSL = /* wgsl */ `
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

fn sdHexagon(p: vec2<f32>, r: f32) -> f32 {
    let k = vec3<f32>(-0.866025404, 0.5, 0.577350269);
    var p_abs = abs(p);
    p_abs = p_abs - 2.0 * min(dot(k.xy, p_abs), 0.0) * k.xy;
    p_abs = p_abs - vec2<f32>(clamp(p_abs.x, -k.z * r, k.z * r), r);
    return length(p_abs) * sign(p_abs.y);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    let shiftUv = uniforms.visualOffset / uniforms.resolution.x;
    var p = (uv - 0.5 - vec2<f32>(shiftUv, 0.0)) * vec2<f32>(aspect, 1.0);

    let t = uniforms.time * 0.2;

    // Chalk white dominant with delicate mint/emerald tints
    let chalkPure = vec3<f32>(0.995, 1.0, 0.995);
    let mintTint = vec3<f32>(0.92, 0.97, 0.94);
    let emeraldAccent = vec3<f32>(0.26, 0.70, 0.50);

    var col = mix(chalkPure, mintTint, clamp(uv.y * 0.4 + length(uv - 0.5) * 0.25, 0.0, 1.0));

    // Ambient floating hexagons
    for (var i = 0; i < 6; i++) {
        let fi = f32(i);
        let speed = 0.10 + fi * 0.035;
        let seedX = sin(fi * 2.8) * 0.9;
        let posY = fract(t * speed + fi * 0.18) * 1.6 - 0.8;
        let posX = seedX + cos(t * 0.4 + fi) * 0.15;

        let hp = rot2(t * 0.35 + fi * 1.05) * (p - vec2<f32>(posX, posY));
        let r = 0.045 + fi * 0.012;
        let d = sdHexagon(hp, r);

        let hexOutline = smoothstep(0.0035, 0.0, abs(d) - 0.0018);
        let hexGlow = exp(-max(0.0, d) * 30.0) * 0.2;

        col = mix(col, emeraldAccent, (hexOutline + hexGlow) * 0.5);
    }

    return vec4<f32>(col, 1.0);
}
`;
