const ez3d = new EzCanvas3D("bubbles");
const container = document.querySelector("#jellytank");
const gl = ez3d.getCanvas().getContext('webgl2');

ez3d.mount(container);
ez3d.resize(window.innerWidth, window.innerHeight);
new ResizeObserver(() => ez3d.settings.fitContainer()).observe(container);

ez3d.camera.set({ position: [0, 0, 10], near: 0.01, far: 200, orthographic: true });

class Bubbles {

    static CFGS = {
        targetCount: 100,
        boundMin:    [-12.0, -10.0, -1.5],
        boundMax:    [ 12.0,   10.5,  1.5],
        speedScale:  [0.8, 1.2],
        sizeScale:   [0.8, 1.2],
        palette: [
            [0.20, 0.72, 1.00, 1.0],  // vivid sky blue
            [0.10, 0.90, 0.75, 1.0],  // bright cyan-teal
            [0.60, 0.25, 1.00, 1.0],  // electric violet
            [1.00, 0.35, 0.60, 1.0],  // hot coral-pink
            [0.15, 0.85, 0.40, 1.0],  // lime green
            [1.00, 0.65, 0.10, 1.0],  // amber orange
            [0.35, 0.50, 1.00, 1.0],  // periwinkle
            [0.90, 0.20, 0.80, 1.0],  // magenta
        ],
    };

    constructor(gl, camera, cfg = {}) {
        this.gl     = gl;
        this.camera = camera;
        this.cfg    = { ...Bubbles.CFGS, ...cfg };

        // Shader.
        this.shader = new EzShader3D().describe({
            vertex: {
                attributes: [],
                instanceData: [
                    { name: 'i_posR',  type: 'vec4' },  // xyz=world pos, w=radius
                    { name: 'i_color', type: 'vec4' },  // rgba tint
                ],
                defaultKeys: { view: 'u_view', projection: 'u_proj' },
                outputs: [
                    { name: 'v_uv',     type: 'vec2'  },   // billboard local [-1,1]
                    { name: 'v_color',  type: 'vec4'  },
                    { name: 'v_radius', type: 'float' },
                    { name: 'v_center', type: 'vec3'  },   // view-space sphere center
                    { name: 'v_rayDir', type: 'vec3'  },   // view-space ray to this vertex
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
                rQueue:     2000,
                depthWrite: false,
                depthTest:  true,
                blend:      true,
                twoSided:   true,
                blendSrc:   EzShader.BLEND.SRC_ALPHA,
                blendDst:   EzShader.BLEND.ONE_MINUS_SRC_ALPHA,
            },
        }).compile(gl);

        // Mesh: one 6-vertex billboard primitive, no real geometry.
        this.mesh = EzMesh3D.fromDesc(gl, this.shader, 'bubble', {
            vertices:   new Float32Array([0,0, 0,0, 0,0, 0,0, 0,0, 0,0]),
            attributes: [{ name: '_dummy', size: 2 }],
            primitives: [{ vertexOffset: 0, vertexCount: 6 }],
        });

        // Cache uniform locations once.
        this.u_view = gl.getUniformLocation(this.shader.program, 'u_view');
        this.u_proj = gl.getUniformLocation(this.shader.program, 'u_proj');

        // Persistent scratch buffer for instance VBO uploads.
        // Stride is 8 floats (i_posR + i_color).
        this.stride = this.shader.instanceLayout.strideFloats;
        this.packed = new Float32Array(this.cfg.targetCount * this.stride);

        // Initial fill: spawn the full pool spread across the world.
        this.pool = [];
        for (let i = 0; i < this.cfg.targetCount; i++) this.#spawn(false);
    }

    static #rnd(a, b) { return a + Math.random() * (b - a); }

    #spawn(atBottom = true) {
        const c = this.cfg;
        const [xMin, yMin, zMin] = c.boundMin;
        const [xMax, yMax, zMax] = c.boundMax;

        const palette = c.palette[Math.floor(Math.random() * c.palette.length)];
        const z = Bubbles.#rnd(zMin, zMax);

        // Depth factor across z: 0 at zMin (far), 1 at zMax (near).
        const depthT = (zMax - zMin) > 0 ? (z - zMin) / (zMax - zMin) : 0.5;

        const sizeMul  = Bubbles.#rnd(c.sizeScale[0],  c.sizeScale[1]);
        const speedMul = Bubbles.#rnd(c.speedScale[0], c.speedScale[1]);

        const r = Bubbles.#rnd(0.04, 0.22) * sizeMul * (0.5 + depthT * 0.5);
        const x = Bubbles.#rnd(xMin, xMax);
        const y = atBottom ? Bubbles.#rnd(yMin, yMin + 1.5)
                           : Bubbles.#rnd(yMin, yMax);
        const vy    = Bubbles.#rnd(0.18, 0.55) * speedMul * (0.6 + depthT * 0.4);
        const drift = Bubbles.#rnd(-0.08, 0.08);
        const phase = Bubbles.#rnd(0, Math.PI * 2);

        this.pool.push({ x, y, z, r, vy, drift, phase, depthT, color: [...palette] });
    }

    // Update + pack + draw. Call once per frame with delta-seconds.
    run(dt) {
        const c = this.cfg, gl = this.gl, S = this.stride, P = this.packed;

        // 1) Update pool.
        for (let i = this.pool.length - 1; i >= 0; i--) {
            const b = this.pool[i];
            b.y += b.vy * dt;
            b.phase += dt * 0.9;
            b.x += Math.sin(b.phase) * b.drift * dt * 60 * 0.016;
            // Out-of-bounds check is y-only (bubbles only rise / fall on y).
            if (b.y - b.r > c.boundMax[1] || b.y + b.r < c.boundMin[1]) this.pool.splice(i, 1);
        }
        while (this.pool.length < c.targetCount) this.#spawn(true);
        while (this.pool.length > c.targetCount) this.pool.pop();

        const N = this.pool.length;
        for (let i = 0; i < N; i++) {
            const b = this.pool[i], o = i * S;
            P[o    ] = b.x;        P[o + 1] = b.y;        P[o + 2] = b.z;        P[o + 3] = b.r;
            P[o + 4] = b.color[0]; P[o + 5] = b.color[1]; P[o + 6] = b.color[2]; P[o + 7] = b.color[3];
        }

        this.shader.applyRenderState(gl).bind(gl);
        EzRender.setUniforms(gl, this.shader.program, [
            { loc: this.u_view, type: 'mat4', value: this.camera.view },
            { loc: this.u_proj, type: 'mat4', value: this.camera.projection },
        ]);
        EzRender.uploadVBO(gl, this.mesh.instanceVBO, P.subarray(0, N * S));
        EzRender.withVAO(gl, this.mesh.vao, () => {
            EzRender.drawPrimitive(gl, this.mesh, 0, N);
        });
        EzRender.restoreDefaultState(gl);
    }
}



const bubbles = new Bubbles(gl, ez3d.camera);

let lastT = null;
function frame(ts) {
    if (!lastT) lastT = ts;
    const dt = Math.min((ts - lastT) / 1000, 0.05);
    lastT = ts;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    bubbles.run(dt);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('mousemove', e => {
    const nx = (e.clientX / window.innerWidth  - 0.5); // -0.5 .. 0.5
    const ny = (e.clientY / window.innerHeight - 0.5);
    // Absolute yaw/pitch in degrees (tweak the multipliers to taste).
    const yawDeg   = nx * 5;
    const pitchDeg = -ny * 3;
    ez3d.camera.set({
        orientation: EzMath.Quat.fromEulerYPR(yawDeg, pitchDeg, 0)
    });
});