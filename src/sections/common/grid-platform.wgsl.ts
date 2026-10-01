export const GRID_PLATFORM_WGSL = /* wgsl */ `
struct GridUniforms {
    resolution: vec2<f32>,
    time: f32,
    squareSize: f32,

    topMainHeight: f32,
    topSpeed: f32,
    topDirection: f32,
    bottomMainHeight: f32,

    bottomSpeed: f32,
    bottomDirection: f32,
    bottomHideOffset: f32, // 0.0 (fully visible) -> (bottomMainHeight + squareSize * 2) (completely hidden)
    _pad0: f32,

    darkColor: vec4<f32>,
    lightColor: vec4<f32>,
    rectColor: vec4<f32>,
    _pad1: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: GridUniforms;

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

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let y = fragCoord.y;
    let x = fragCoord.x;
    let sq = max(uniforms.squareSize, 1.0);
    let gridHeight = sq * 2.0;

    // =========================================================================
    // 1. TOP BORDER: RECT FOLLOWED BY 2-ROW GRID (ALWAYS FIXED AT TOP, NEVER MOVES)
    // =========================================================================
    let topRectEnd = uniforms.topMainHeight;
    let topGridEnd = topRectEnd + gridHeight;

    // Solid top main rectangle
    if (y < topRectEnd) {
        return uniforms.rectColor;
    }

    // Top 2-row moving checkerboard grid
    if (y >= topRectEnd && y < topGridEnd) {
        let row = floor((y - topRectEnd) / sq);
        let offset = uniforms.time * uniforms.topSpeed * uniforms.topDirection;
        let col = floor((x + offset) / sq);
        let parity = ((i32(row) + i32(col)) % 2 + 2) % 2;
        if (parity == 0) {
            return uniforms.darkColor;
        } else {
            return uniforms.lightColor;
        }
    }

    // =========================================================================
    // 2. BOTTOM BORDER: 2-ROW GRID FOLLOWED BY RECT
    // Hides downward by bottomHideOffset = (bottomMainHeight + squareSize * 2)
    // =========================================================================
    let h = uniforms.resolution.y;
    let bottomTotalHeight = uniforms.bottomMainHeight + gridHeight;
    let bottomBaseTop = h - bottomTotalHeight + uniforms.bottomHideOffset;
    let bottomGridEnd = bottomBaseTop + gridHeight;
    let bottomRectEnd = bottomBaseTop + bottomTotalHeight;

    // Bottom 2-row moving checkerboard grid
    if (y >= bottomBaseTop && y < bottomGridEnd && y < h) {
        let row = floor((y - bottomBaseTop) / sq);
        let offset = uniforms.time * uniforms.bottomSpeed * uniforms.bottomDirection;
        let col = floor((x + offset) / sq);
        let parity = ((i32(row) + i32(col)) % 2 + 2) % 2;
        if (parity == 0) {
            return uniforms.darkColor;
        } else {
            return uniforms.lightColor;
        }
    }

    // Solid bottom main rectangle
    if (y >= bottomGridEnd && y < bottomRectEnd && y < h) {
        return uniforms.rectColor;
    }

    // Middle viewport transparent
    discard;
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
}
`;
