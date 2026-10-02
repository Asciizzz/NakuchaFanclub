export const ANIME_MV_WGSL = /* wgsl */ `
struct AnimeMVUniforms {
    resolution: vec2<f32>,
    time: f32,
    visualOffset: f32,
    mouse: vec2<f32>,
    mouseVel: vec2<f32>,
    _pad0: vec2<f32>,
    _pad1: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: AnimeMVUniforms;
@group(0) @binding(1) var textTexture: texture_2d<f32>;
@group(0) @binding(2) var textSampler: sampler;

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
// Clean Math & 2D SDF Primitives
// =============================================================================

fn rot2(a: f32) -> mat2x2<f32> {
    let c = cos(a);
    let s = sin(a);
    return mat2x2<f32>(c, -s, s, c);
}

fn rotate2D(p: vec2<f32>, a: f32) -> vec2<f32> {
    let c = cos(a);
    let s = sin(a);
    return vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y);
}

fn sdSegment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let pa = p - a;
    let ba = b - a;
    let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

fn sdBox(p: vec2<f32>, b: vec2<f32>) -> f32 {
    let d = abs(p) - b;
    return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
}

fn sdWire(p: vec2<f32>, x0: f32, y0: f32, x1: f32, y1: f32, sag: f32) -> f32 {
    let u = clamp((p.x - x0) / max(0.0001, (x1 - x0)), 0.0, 1.0);
    let curveY = mix(y0, y1, u) + sag * 4.0 * u * (1.0 - u);
    let pt = vec2<f32>(p.x, curveY);
    return length(p - pt);
}

fn sdNote(p: vec2<f32>, scale: f32, hasFlag: bool) -> f32 {
    let q = p / scale;
    let noteBodyP = rot2(0.38) * q;
    let noteBodyD = length(noteBodyP * vec2<f32>(1.0, 1.4)) - 0.034;

    let stemD = sdSegment(q, vec2<f32>(0.030, 0.0), vec2<f32>(0.030, 0.105)) - 0.0035;
    var d = min(noteBodyD, stemD);

    if (hasFlag) {
        let flagD = sdSegment(q, vec2<f32>(0.030, 0.105), vec2<f32>(0.062, 0.072)) - 0.003;
        d = min(d, flagD);
    }

    return d * scale;
}

fn sdSparkle(p: vec2<f32>, r: f32) -> f32 {
    let q = abs(p);
    return (q.x + q.y) - r;
}

// Chromatic radial-blurred angled grid (from test.glsl)
fn chromaticGrid(p: vec2<f32>) -> f32 {
    let orient = vec2<f32>(0.316227766, 0.948683298); // normalize(vec2(1.0, 3.0))
    let perp   = vec2<f32>(0.948683298, -0.316227766);
    let u = i32(floor(dot(p, orient)));
    let v = i32(floor(dot(p, perp)));
    return f32((abs(u + v)) & 1);
}

fn getChromaticBlurGrid(screenCoord: vec2<f32>, res: vec2<f32>, time: f32) -> vec3<f32> {
    let p = screenCoord / 52.0 + vec2<f32>(-time * 0.45, time * 0.45);
    let q = (screenCoord - (res * 0.5)) / (res.x * 1.5);

    var cc = vec3<f32>(0.0);
    var total = 0.0;
    let radius = length(q) * 95.0;

    const samp: f32 = 24.0;
    for (var i = -24; i <= 24; i++) {
        let t = f32(i);
        let percent = t / samp;
        let weight = 1.0 - abs(percent);
        let u = t * 0.01;
        let dirRaw = vec2<f32>(fract(sin(537.3 * (u + 0.5))), fract(sin(523.7 * (u + 0.25))));
        let dir = normalize(dirRaw) * 0.01;
        let skew = percent * radius;

        let sampleR = chromaticGrid(vec2<f32>(0.03, 0.0) + p + dir * skew);
        let sampleG = chromaticGrid(radius * vec2<f32>(0.005, 0.0) + p + dir * skew);
        let sampleB = chromaticGrid(radius * vec2<f32>(0.007, 0.0) + p + dir * skew);

        cc += vec3<f32>(sampleR, sampleG, sampleB) * weight;
        total += weight;
    }

    return cc / max(total, 0.0001);
}

// =============================================================================
// Torinoko City Clean Anime MV Stage
// =============================================================================

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    let shiftUv = uniforms.visualOffset / uniforms.resolution.x;

    let m = uniforms.mouse;
    let baseP = (uv - 0.5 - vec2<f32>(shiftUv, 0.0)) * vec2<f32>(aspect, 1.0);

    // Torinoko City Color Palette
    let cInkNavy    = vec3<f32>(0.102, 0.157, 0.220); // #1A2838 deep navy ink
    let cSteelBlue  = vec3<f32>(0.294, 0.420, 0.541); // #4B6B8A steel blue
    let cCyanDust   = vec3<f32>(0.690, 0.784, 0.863); // #B0C8DC pale cyan
    let cChalkWhite = vec3<f32>(0.925, 0.957, 0.980); // #E8F2FA crisp chalk
    let cPureWhite  = vec3<f32>(0.995, 0.998, 1.000); // #FFFFFF pure white
    let cAmberGold  = vec3<f32>(0.898, 0.702, 0.314); // #E5B350 warm amber notes

    let cBg   = cPureWhite;
    let cInk  = cInkNavy;
    let cWire = cInkNavy;
    let cNote = cInkNavy;
    let cGold = cAmberGold;
    let cStaff = cSteelBlue;

    let t = uniforms.time * 0.3;

    // -------------------------------------------------------------------------
    // Layer 1: Chalk White Base Canvas + Subtle Chromatic Blurred Grid
    // -------------------------------------------------------------------------
    let screenCoord = fragCoord.xy - vec2<f32>(uniforms.visualOffset, 0.0) - m * 2.0;
    let blurGrid = getChromaticBlurGrid(screenCoord, uniforms.resolution, uniforms.time);

    // Subtle chalk-cyan tone close to background (#FFFFFF vs #E8F2F9)
    let cSubtleTint = vec3<f32>(0.910, 0.948, 0.975);
    var col = mix(cPureWhite, cSubtleTint, blurGrid * 0.40);

    // Clean diorama architectural lines (Reference Image 1)
    let pBg = baseP - m * 0.002;
    let bgLine1 = sdSegment(pBg, vec2<f32>(-1.8, -0.65), vec2<f32>(1.8, 0.55)) - 0.0012;
    let bgLine2 = sdSegment(pBg, vec2<f32>(-1.8, 0.75), vec2<f32>(1.8, -0.45)) - 0.0012;
    let bgLines = min(bgLine1, bgLine2);
    col = mix(col, cCyanDust, smoothstep(0.0025, 0.0, bgLines) * 0.50);

    // -------------------------------------------------------------------------
    // Layer 2: Diagonal Piano Key Margins (Left & Right Wings from Image 1)
    // -------------------------------------------------------------------------
    let pWings = baseP - m * 0.003;

    // Left piano wing
    let pLeft = rot2(-0.46) * (pWings - vec2<f32>(-aspect * 0.68, 0.05));
    let leftBoxD = sdBox(pLeft, vec2<f32>(0.28, 1.4));
    if (leftBoxD <= 0.0) {
        col = cBg;
        let stripeCoord = fract(pLeft.y * 14.0);
        let isStripe = step(0.48, stripeCoord);
        col = mix(col, cInk, isStripe * 0.95);
        let borderD = abs(leftBoxD) - 0.0022;
        col = mix(col, cInk, smoothstep(0.003, 0.0, borderD));
    } else {
        let shadow = smoothstep(0.05, 0.0, leftBoxD) * 0.14;
        col = mix(col, cInkNavy, shadow);
    }

    // Right piano wing
    let pRight = rot2(0.46) * (pWings - vec2<f32>(aspect * 0.68, -0.05));
    let rightBoxD = sdBox(pRight, vec2<f32>(0.28, 1.4));
    if (rightBoxD <= 0.0) {
        col = cBg;
        let stripeCoord = fract(pRight.y * 14.0);
        let isStripe = step(0.48, stripeCoord);
        col = mix(col, cInk, isStripe * 0.95);
        let borderD = abs(rightBoxD) - 0.0022;
        col = mix(col, cInk, smoothstep(0.003, 0.0, borderD));
    } else {
        let shadow = smoothstep(0.05, 0.0, rightBoxD) * 0.14;
        col = mix(col, cInkNavy, shadow);
    }

    // -------------------------------------------------------------------------
    // Layer 3: Floating Score Paper Collage Shards (Images 1 & 2)
    // -------------------------------------------------------------------------
    let pSheets = baseP - m * 0.004;

    // Sheet A (Upper Left)
    let posA = vec2<f32>(-0.42 * aspect, 0.22 + sin(t * 0.4) * 0.02);
    let rotA = rot2(-0.26) * (pSheets - posA);
    let boxA = sdBox(rotA, vec2<f32>(0.32, 0.20));
    let shadowA = smoothstep(0.05, 0.0, boxA) * 0.16;
    col = mix(col, cInkNavy, shadowA);
    if (boxA <= 0.0) {
        col = cBg;
        for (var s = -2; s <= 2; s++) {
            let sy = f32(s) * 0.030;
            let lineD = abs(rotA.y - sy) - 0.0015;
            col = mix(col, cStaff, smoothstep(0.002, 0.0, lineD) * 0.9);
        }
        let na1 = sdNote(rotA - vec2<f32>(-0.18, -0.030), 0.65, true);
        let na2 = sdNote(rotA - vec2<f32>(-0.06, 0.015), 0.65, false);
        let na3 = sdNote(rotA - vec2<f32>(0.08, -0.060), 0.65, true);
        let na4 = sdNote(rotA - vec2<f32>(0.20, 0.030), 0.65, false);
        let naD = min(min(na1, na2), min(na3, na4));
        col = mix(col, cInk, smoothstep(0.0025, 0.0, naD));
        let borderD = abs(boxA) - 0.0022;
        col = mix(col, cInk, smoothstep(0.003, 0.0, borderD));
    }

    // Sheet B (Lower Center-Right)
    let posB = vec2<f32>(0.36 * aspect, -0.20 - cos(t * 0.45) * 0.02);
    let rotB = rot2(0.22) * (pSheets - posB);
    let boxB = sdBox(rotB, vec2<f32>(0.30, 0.18));
    let shadowB = smoothstep(0.05, 0.0, boxB) * 0.16;
    col = mix(col, cInkNavy, shadowB);
    if (boxB <= 0.0) {
        col = cChalkWhite;
        for (var s = -2; s <= 2; s++) {
            let sy = f32(s) * 0.026;
            let lineD = abs(rotB.y - sy) - 0.0015;
            col = mix(col, cStaff, smoothstep(0.002, 0.0, lineD) * 0.9);
        }
        let nb1 = sdNote(rotB - vec2<f32>(-0.16, 0.026), 0.60, false);
        let nb2 = sdNote(rotB - vec2<f32>(-0.04, -0.026), 0.60, true);
        let nb3 = sdNote(rotB - vec2<f32>(0.10, 0.0), 0.60, false);
        let nbD = min(min(nb1, nb2), nb3);
        col = mix(col, cInk, smoothstep(0.0025, 0.0, nbD));
        let borderD = abs(boxB) - 0.0022;
        col = mix(col, cInk, smoothstep(0.003, 0.0, borderD));
    }

    // -------------------------------------------------------------------------
    // Layer 4: Japanese Typography Title (5 Individual Playful Characters)
    // -------------------------------------------------------------------------
    let titleCenter = vec2<f32>(0.0, -0.04) + m * 0.022;
    let charSpacing = 0.185;
    let charHalfSize = 0.125; // Prominent size (~0.25 screen height)

    // Playful vertical stagger offsets per character
    let staggerY = array<f32, 5>(0.008, -0.006, 0.010, -0.008, 0.006);

    // Playful individual base tilts (subtle ~ 2 to 3 degrees)
    let baseTilts = array<f32, 5>(-0.048, 0.038, -0.030, 0.045, -0.035);

    // Expressive playful hover reactions per character
    let hoverTiltFactors = array<f32, 5>(0.065, -0.055, 0.070, -0.060, 0.058);
    let hoverOffsetFactors = array<vec2<f32>, 5>(
        vec2<f32>(-0.012, 0.018),
        vec2<f32>(0.010, -0.016),
        vec2<f32>(-0.008, 0.020),
        vec2<f32>(0.014, -0.015),
        vec2<f32>(-0.010, 0.017)
    );

    let velFlick = clamp(uniforms.mouseVel.x * 0.006, -0.025, 0.025);

    for (var i = 0; i < 5; i++) {
        let fi = f32(i);
        let charBasePos = titleCenter + vec2<f32>((fi - 2.0) * charSpacing, staggerY[i]);

        // Proximity to mouse cursor in world coordinates
        let dist = length(baseP - charBasePos);
        let hover = smoothstep(0.36, 0.0, dist);

        // Playful dynamic tilt and offset on hover
        let idleBob = sin(uniforms.time * 2.2 + fi * 1.3) * 0.004 * hover;
        let dynamicAngle = baseTilts[i] + hover * (m.x * hoverTiltFactors[i] + velFlick + sin(uniforms.time * 2.0 + fi) * 0.010);
        let dynamicPos = charBasePos + hoverOffsetFactors[i] * hover + vec2<f32>(0.0, idleBob);

        // Position relative to this character's dynamic center
        let pChar = baseP - dynamicPos;

        // Counter-rotate coordinate to sample the unrotated glyph
        let rotP = rotate2D(pChar, -dynamicAngle);

        // Convert to local cell UV in [0, 1]
        // u goes from left (0) to right (1)
        // v goes from top (0) to bottom (1) -> invert Y because +Y is UP in world space!
        let uLocal = rotP.x / (charHalfSize * 2.0) + 0.5;
        let vLocal = 0.5 - rotP.y / (charHalfSize * 2.0);

        let inBounds = step(0.0, uLocal) * step(uLocal, 1.0) * step(0.0, vLocal) * step(vLocal, 1.0);

        // Atlas UV: cell i out of 5 cells (atlas width is 1280, height is 256)
        let uAtlas = (fi + clamp(uLocal, 0.0, 1.0)) / 5.0;
        let vAtlas = clamp(vLocal, 0.0, 1.0);

        let charAlpha = textureSample(textTexture, textSampler, vec2<f32>(uAtlas, vAtlas)).a * inBounds;

        // Clean solid ink typography without shadow or outline
        col = mix(col, cInkNavy, charAlpha);
    }

    // -------------------------------------------------------------------------
    // Layer 5: Catenary Telephone / Power Line Wires (Images 1 & 3)
    // -------------------------------------------------------------------------
    let pWires = baseP - m * 0.005;
    let wireSagImpulse = m.y * 0.003;

    let w1D = sdWire(pWires, -aspect * 1.4, 0.38, aspect * 1.4, 0.20, 0.14 + wireSagImpulse) - 0.0013;
    let w2D = sdWire(pWires, -aspect * 1.4, 0.06, aspect * 1.4, -0.16, 0.17 + wireSagImpulse * 0.8) - 0.0013;
    let w3D = sdWire(pWires, -aspect * 1.4, -0.28, aspect * 1.4, 0.08, 0.12 - wireSagImpulse * 0.6) - 0.0013;

    let wiresD = min(min(w1D, w2D), w3D);
    col = mix(col, cWire, smoothstep(0.0024, 0.0, wiresD) * 0.88);

    // -------------------------------------------------------------------------
    // Layer 6: Dynamic Floating Musical Notes & Golden Star Sparkles
    // -------------------------------------------------------------------------
    let pNotes = baseP - m * 0.006;

    for (var i = 0; i < 7; i++) {
        let fi = f32(i);
        let speed = 0.14 + fi * 0.035;
        let seedX = sin(fi * 2.7) * 0.75 * aspect;
        let posY = fract(t * speed + fi * 0.16) * 1.5 - 0.75;
        let posX = seedX + sin(t * 0.6 + fi * 1.2) * 0.10;

        let notePos = vec2<f32>(posX, posY);
        let noteDistToMouse = length(pNotes - notePos - m * 0.01);

        let repel = smoothstep(0.18, 0.0, noteDistToMouse) * (pNotes - notePos) * 0.03;
        let finalPos = notePos - repel;

        let noteD = sdNote(pNotes - finalPos, 0.72 + sin(fi) * 0.12, (i % 2) == 0);
        let noteMask = smoothstep(0.0028, 0.0, noteD);

        if ((i % 3) == 0) {
            col = mix(col, cGold, noteMask * 0.95);
        } else {
            col = mix(col, cNote, noteMask * 0.90);
        }

        if ((i % 2) == 1) {
            let sparkD = sdSparkle(rot2(t * 1.2 + fi) * (pNotes - finalPos + vec2<f32>(0.05, 0.05)), 0.020);
            let sparkMask = smoothstep(0.002, 0.0, sparkD);
            col = mix(col, cGold, sparkMask * 0.85);
        }
    }

    return vec4<f32>(col, 1.0);
}
`;
