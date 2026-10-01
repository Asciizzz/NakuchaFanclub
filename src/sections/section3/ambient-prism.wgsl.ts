export const AMBIENT_PRISM_WGSL = /* wgsl */ `
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

fn sdEquilateralTriangle(p: vec2<f32>, r: f32) -> f32 {
    let k = sqrt(3.0);
    var p_abs = p;
    p_abs.x = abs(p_abs.x) - r;
    p_abs.y = p_abs.y + r / k;
    if (p_abs.x + k * p_abs.y > 0.0) {
        p_abs = vec2<f32>(p_abs.x - k * p_abs.y, -k * p_abs.x - p_abs.y) / 2.0;
    }
    p_abs.x = p_abs.x - clamp(p_abs.x, -2.0 * r, 0.0);
    return -length(p_abs) * sign(p_abs.y);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    let shiftUv = uniforms.visualOffset / uniforms.resolution.x;
    var p = (uv - 0.5 - vec2<f32>(shiftUv, 0.0)) * vec2<f32>(aspect, 1.0);

    let t = uniforms.time * 0.20;

    // Chalk white dominant with warm amber/gold tints
    let chalkPure = vec3<f32>(1.0, 0.998, 0.992);
    let goldTint = vec3<f32>(0.99, 0.965, 0.91);
    let amberAccent = vec3<f32>(0.88, 0.62, 0.22);

    var col = mix(chalkPure, goldTint, clamp(uv.y * 0.4 + length(uv - 0.5) * 0.25, 0.0, 1.0));

    // Ambient floating prism shards
    for (var i = 0; i < 6; i++) {
        let fi = f32(i);
        let speed = 0.11 + fi * 0.032;
        let seedX = sin(fi * 3.1) * 0.85;
        let posY = fract(t * speed + fi * 0.19) * 1.6 - 0.8;
        let posX = seedX + cos(t * 0.42 + fi) * 0.14;

        let tp = rot2(t * 0.38 + fi * 1.1) * (p - vec2<f32>(posX, posY));
        let r = 0.040 + fi * 0.010;
        let d = sdEquilateralTriangle(tp, r);

        let shardOutline = smoothstep(0.0035, 0.0, abs(d) - 0.0016);
        let shardGlow = exp(-max(0.0, d) * 32.0) * 0.22;

        col = mix(col, amberAccent, (shardOutline + shardGlow) * 0.52);
    }

    return vec4<f32>(col, 1.0);
}
`;
