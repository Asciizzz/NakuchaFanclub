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

// =============================================================================
// Topographic Map Shader (adapted from topomap.glsl)
// =============================================================================

fn rot2D(p: vec2<f32>, a: f32) -> vec2<f32> {
    let c = cos(a);
    let s = sin(a);
    return vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y);
}

fn smoothCubic(x: f32) -> f32 {
    return x * x * (3.0 - 2.0 * x);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, vec3<f32>(p3.y, p3.z, p3.x) + 33.33);
    return fract((vec2<f32>(p3.x, p3.x) + vec2<f32>(p3.y, p3.z)) * vec2<f32>(p3.z, p3.y));
}

fn getGrad(cell: vec2<f32>, t: f32) -> vec2<f32> {
    let h1 = hash22(cell);
    let h2 = hash22(cell + 20.0);
    return rot2D((h1 - 0.5) * 2.0, t * h2.x);
}

fn perlinNoise(p: vec2<f32>, t: f32) -> f32 {
    let fl = floor(p);
    let fr = p - fl;

    let blVal = getGrad(fl, t);
    let tlVal = getGrad(fl + vec2<f32>(0.0, 1.0), t);
    let brVal = getGrad(fl + vec2<f32>(1.0, 0.0), t);
    let trVal = getGrad(fl + vec2<f32>(1.0, 1.0), t);

    let bl = dot(fr, blVal);
    let tl = dot(fr - vec2<f32>(0.0, 1.0), tlVal);
    let br = dot(fr - vec2<f32>(1.0, 0.0), brVal);
    let tr = dot(fr - vec2<f32>(1.0, 1.0), trVal);

    let sx = smoothCubic(fr.x);
    let sy = smoothCubic(fr.y);

    let btm = mix(bl, br, sx);
    let top = mix(tl, tr, sx);

    return mix(btm, top, sy) * 0.5 + 0.5;
}

fn fbm(p: vec2<f32>, t: f32) -> f32 {
    var v = 0.0;
    for (var i = 0; i < 4; i++) {
        let fi = f32(i);
        let freq = exp(fi);
        let amp  = exp(-fi);
        v += perlinNoise(p * freq, t * freq) * amp;
    }
    return v * 0.5;
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    let shiftUv = uniforms.visualOffset / uniforms.resolution.x;
    let p = (uv - 0.5 - vec2<f32>(shiftUv, 0.0)) * vec2<f32>(aspect, 1.0);

    // Site Core Color Palette (Chalk-White Dominant)
    let cPureWhite  = vec3<f32>(0.995, 0.998, 1.000); // #FFFFFF pure white
    let cChalkWhite = vec3<f32>(0.925, 0.957, 0.980); // #E8F2FA crisp chalk
    let cCyanDust   = vec3<f32>(0.690, 0.784, 0.863); // #B0C8DC pale cyan
    let cSteelBlue  = vec3<f32>(0.294, 0.420, 0.541); // #4B6B8A steel blue

    let t = uniforms.time;

    // Topographic map coordinates & slow ambient drift
    let topoP = p * 1.8;
    let v = fbm(topoP + vec2<f32>(t * 0.015, t * 0.010), t * 0.035);

    // Topographic contour line evaluation (anti-aliased with fwidth)
    const PERIOD: f32 = 48.0;
    const PIXEL_THICKNESS: f32 = 1.0;
    const AA_SCALE: f32 = 1.0;

    let vPeriod = v * PERIOD;
    var av = abs(sin(vPeriod));
    let fv = fwidth(vPeriod);
    let fav = fwidth(av) * AA_SCALE;
    av = smoothstep(0.0, fav, av - fv * 0.5 * PIXEL_THICKNESS);
    let lineMask = 1.0 - av;

    // Base canvas: pure white with subtle chalk gradient
    var col = mix(cPureWhite, cChalkWhite, clamp(length(p) * 0.22, 0.0, 1.0));

    // Subtle elevation wash between contours
    let elevationWash = sin(v * 6.28318) * 0.5 + 0.5;
    col = mix(col, cChalkWhite, elevationWash * 0.30);

    // Minor contour lines: soft pale cyan (#B0C8DC)
    col = mix(col, cCyanDust, lineMask * 0.45);

    // Major index contours (every 5th line): delicate steel blue accent (#4B6B8A)
    let isMajor = smoothstep(0.92, 1.0, abs(sin(v * (PERIOD * 0.2))));
    col = mix(col, cSteelBlue, lineMask * isMajor * 0.35);

    return vec4<f32>(col, 1.0);
}
`;
