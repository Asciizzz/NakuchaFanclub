const ez3d = new EzCanvas3D("bubbles");
const container = document.querySelector("#jellytank");

ez3d.mount(container);
ez3d.resize(window.innerWidth, window.innerHeight);
new ResizeObserver(() => ez3d.settings.fitContainer()).observe(container);

ez3d.camera.set({ position: [0, 0, 8], fov: 38, near: 0.01, far: 200 });

// ----------------------------------------------------------------
// BUBBLE HANDLING
// ----------------------------------------------------------------

ez3d.shaders.add('bubble', new EzShader3D().describe({
    vertex: {
        attributes: [],
        instanceData: [
            { name: 'i_posR', type: 'vec4' },  // xyz=world pos, w=radius
            { name: 'i_color', type: 'vec4' },  // rgba tint
        ],
        defaultKeys: { view: 'u_view', projection: 'u_proj' },
        outputs: [
            { name: 'v_uv', type: 'vec2' },   // billboard local [-1,1]
            { name: 'v_color', type: 'vec4' },
            { name: 'v_radius', type: 'float' },
            { name: 'v_center', type: 'vec3' },   // view-space sphere center
            { name: 'v_rayDir', type: 'vec3' },   // view-space ray to this vertex
        ],
        main: `
        const vec2 QUAD[6] = vec2[6](
            vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
            vec2(-1.0, -1.0), vec2( 1.0,  1.0), vec2(-1.0,  1.0)
        );
        vec2 corner = QUAD[gl_VertexID];

        vec3 worldPos = i_posR.xyz;
        float radius  = i_posR.w;

        vec3 camRight = vec3(u_view[0][0], u_view[1][0], u_view[2][0]);
        vec3 camUp    = vec3(u_view[0][1], u_view[1][1], u_view[2][1]);

        vec3 vertWorld = worldPos
                        + camRight * (corner.x * radius)
                        + camUp    * (corner.y * radius);

        vec4 centerView = u_view * vec4(worldPos, 1.0);
        vec4 vertView   = u_view * vec4(vertWorld, 1.0);

        v_uv      = corner;
        v_color   = i_color;
        v_radius  = radius;
        v_center  = centerView.xyz;
        v_rayDir  = vertView.xyz;

        gl_Position = u_proj * vertView;
        `
    },

    fragment: {
        outputColor: 'fragColor',
        main: `
        float d2 = dot(v_uv, v_uv);
        if (d2 > 1.0) discard;

        vec3  C   = v_center;
        float R   = v_radius;
        vec3  rd  = normalize(v_rayDir);

        float b   = dot(rd, C);
        float det = b*b - (dot(C,C) - R*R);
        float sqrtDet = sqrt(max(det, 0.0));

        float t   = b - sqrtDet;
        vec3  hit = rd * t;

        vec3  N   = normalize(hit - C);   // outward sphere normal in view space
        vec3  V   = -normalize(hit);
        vec3  L   = normalize(vec3(-0.4, 0.9, 0.6));
        vec3  H   = normalize(L + V);

        float NdL = max(dot(N, L), 0.0);
        float NdH = max(dot(N, H), 0.0);
        float NdV = abs(dot(N, V));          // for Fresnel / rim

        float diffuse = mix(0.93, 1.0, NdL * 0.6 + 0.4);
        float spec = pow(NdH, 160.0) * 0.18;
        float fresnel = pow(1.0 - NdV, 4.8);

        vec3 baseColor = v_color.rgb;

        float luma = dot(baseColor, vec3(0.299, 0.587, 0.114));
        float sat  = length(baseColor - vec3(luma));

        float hueShift = fresnel * 0.55 * (0.4 + sat * 1.2);
        float cosH = cos(hueShift), sinH = sin(hueShift);
        vec3 gray = vec3(dot(baseColor, vec3(0.333)));
        vec3 iridColor = gray + cosH * (baseColor - gray)
                                + sinH * cross(vec3(0.5774), baseColor - gray);
        iridColor = clamp(iridColor, 0.0, 1.0);

        vec3 bodyColor = mix(baseColor, iridColor, fresnel * 0.75);

        vec3 col = bodyColor * diffuse
                + vec3(1.0) * spec;           // near-invisible glint

        float innerAlpha = 0.2;
        float rimAlpha   = fresnel * 0.28;
        float alpha = clamp(innerAlpha + rimAlpha + spec * 0.4, 0.0, 1.0);
        alpha *= v_color.a;

        float edgeFade = 1.0 - smoothstep(0.94, 1.0, d2);
        alpha *= edgeFade;

        fragColor = vec4(col, alpha);
        `
    },

    renderCfg: {
        rQueue: 2000,
        depthWrite: false,
        depthTest: true,
        blend: true,
        doubleSided: true,
        blendSrc: EzShader.BLEND.SRC_ALPHA,
        blendDst: EzShader.BLEND.ONE_MINUS_SRC_ALPHA,
    },
}));

ez3d.models.add('bubble', {
    defaultShader: 'bubble',
    vertices:   new Float32Array([0,0, 0,0, 0,0, 0,0, 0,0, 0,0]),  // 6 vec2
    attributes: [{ name: '_dummy', size: 2 }],                       // size 1, consistent
    primitives: [{ vertexOffset: 0, vertexCount: 6 }],
});

const WORLD_W = 17.0;
const WORLD_H = 17.0;
const WORLD_BOTTOM = -10.0;
const WORLD_TOP = 4.5;
const TARGET_COUNT = 100;
const SPEED_SCALE = 4;
const SIZE_SCALE = 5;

// Palette: a few iridescent tints
const PALETTE = [
    [0.20, 0.72, 1.00, 1.0],  // vivid sky blue
    [0.10, 0.90, 0.75, 1.0],  // bright cyan-teal
    [0.60, 0.25, 1.00, 1.0],  // electric violet
    [1.00, 0.35, 0.60, 1.0],  // hot coral-pink
    [0.15, 0.85, 0.40, 1.0],  // lime green
    [1.00, 0.65, 0.10, 1.0],  // amber orange
    [0.35, 0.50, 1.00, 1.0],  // periwinkle
    [0.90, 0.20, 0.80, 1.0],  // magenta
];

function rnd(a, b) { return a + Math.random() * (b - a); }

const pool = [];

function spawnBubble(atBottom = true) {
    const palette = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const z = rnd(-1.5, 1.5);

    // Map z to a 0–1 depth factor: z=-1.5 is far, z=1.5 is near
    const depthT = (z + 1.5) / 3.0;

    const r = rnd(0.04, 0.22) * (SIZE_SCALE / 5) * (0.5 + depthT * 0.5);
    const x = rnd(-WORLD_W / 2, WORLD_W / 2);
    const y = atBottom ? rnd(WORLD_BOTTOM, WORLD_BOTTOM + 1.5) : rnd(WORLD_BOTTOM, WORLD_TOP);
    const vy = rnd(0.18, 0.55) * (SPEED_SCALE / 4) * (0.6 + depthT * 0.4);
    const drift = rnd(-0.08, 0.08);
    const phase = rnd(0, Math.PI * 2);

    const key = ez3d.addInstance('bubble', {
        data: {
            i_posR: [x, y, z, r],
            i_color: [...palette],
        }
    });

    pool.push({ key, x, y, z, r, vy, drift, phase, depthT });
}

for (let i = 0; i < TARGET_COUNT; i++) spawnBubble(false);


// ----------------------------------------------------------------
// Model Handling
// ----------------------------------------------------------------






let lastT = null;
function frame(ts) {
    if (!lastT) lastT = ts;
    const dt = Math.min((ts - lastT) / 1000, 0.05);
    lastT = ts;

    const speedMul = SPEED_SCALE / 4;

    for (let i = pool.length - 1; i >= 0; i--) {
        const b = pool[i];

        // Rise + sinusoidal horizontal drift
        b.y += b.vy * speedMul * dt;
        b.phase += dt * 0.9;
        b.x += Math.sin(b.phase) * b.drift * dt * 60 * 0.016;

        // Recycle when it exits the top
        if (b.y - b.r > WORLD_TOP) {
            ez3d.removeInstance(b.key);
            pool.splice(i, 1);
            continue;
        }

        ez3d.writeInstance(b.key, {
            data: { i_posR: [b.x, b.y, b.z, b.r] }
        });
    }

    // Maintain target count
    while (pool.length < TARGET_COUNT) spawnBubble(true);
    // Cull excess
    while (pool.length > TARGET_COUNT) {
        const b = pool.pop();
        ez3d.removeInstance(b.key);
    }

    ez3d.render();
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

document.addEventListener('mousemove', e => {
    const nx = (e.clientX / window.innerWidth  - 0.5); // -0.5 .. 0.5
    const ny = (e.clientY / window.innerHeight - 0.5);
    // Absolute yaw/pitch in degrees (tweak the multipliers to taste).
    const yawDeg   = nx * 20;
    const pitchDeg = -ny * 12;
    ez3d.camera.set({
        orientation: EzMath.Quat.fromEulerYPR(yawDeg, pitchDeg, 0),
        fov: 60,
    });
});