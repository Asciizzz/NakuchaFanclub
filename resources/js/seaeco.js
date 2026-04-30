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
            [0.50, 0.92, 1.00, 1.0],
            [0.40, 1.00, 0.95, 1.0],
            [0.80, 0.55, 1.00, 1.0],
            [1.00, 0.65, 0.90, 1.0],
            [0.55, 0.95, 0.80, 1.0],
            [1.00, 0.85, 0.60, 1.0],
            [0.65, 0.80, 1.00, 1.0],
            [0.99, 0.60, 0.89, 1.0]
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
                cull:       'none',
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
            EzCanvas3D.drawPrimitive(gl, this.mesh, 0, N);
        });
        EzRender.restoreDefaultState(gl);
    }
}



class Effects {
    static CFGS = {
        godray: {
            enabled:    true,
            count:      32,                       // number of shafts in the scene
            color:      [0.55, 0.90, 1.00],
            intensity:  0.55,                     // overall brightness multiplier
            speed:      0.45,                     // noise scroll speed
            boundMin:   [-12.0, -10.0, -2.0],
            boundMax:   [ 12.0,  10.5,  2.0],
            widthRange: [3.6, 4.6],               // shaft width
            heightRange:[8.0, 12.0],              // shaft length downward
            tiltRange:  [0.18, 0.18],             // unidirectional lean
            phaseSpread:[0.0, 6.2831853],
        },
    };

    constructor(gl, camera, cfg = {}) {
        this.gl     = gl;
        this.camera = camera;
        this.cfg    = {
            ...Effects.CFGS, ...cfg,
            godray: { ...Effects.CFGS.godray, ...(cfg.godray ?? {}) },
        };
        this.time = 0;
        this.#initGodray();
    }

    static #rnd(a, b) { return a + Math.random() * (b - a); }

    #initGodray() {
        const gl = this.gl;

        this.godrayShader = new EzShader3D().describe({
            vertex: {
                attributes: [],
                instanceData: [
                    { name: 'i_origin', type: 'vec4' },   // xyz=top-center anchor, w=phase
                    { name: 'i_shape',  type: 'vec4' },   // x=width, y=height, z=intensity, w=tilt
                ],
                defaultKeys: { view: 'u_view', projection: 'u_proj' },
                outputs: [
                    { name: 'v_local',  type: 'vec2'  },  // x in [-1,1] across width, y in [0,1] down
                    { name: 'v_phase',  type: 'float' },
                    { name: 'v_intens', type: 'float' },
                ],
                main: `
                // 6-vertex quad: x ∈ [-1,1] across width, y ∈ [0,-1] downward (anchor at top).
                const vec2 QUAD[6] = vec2[6](
                    vec2(-1.0,  0.0), vec2( 1.0,  0.0), vec2( 1.0, -1.0),
                    vec2(-1.0,  0.0), vec2( 1.0, -1.0), vec2(-1.0, -1.0)
                );
                vec2 corner = QUAD[gl_VertexID];

                // Camera-right projected onto the horizontal plane → shafts always face the camera
                // around the world-up axis (true vertical billboards).
                vec3 camRight = vec3(u_view[0][0], u_view[1][0], u_view[2][0]);
                vec3 right    = normalize(vec3(camRight.x, 0.0, camRight.z));
                vec3 up       = vec3(0.0, 1.0, 0.0);
                vec3 dir      = normalize(up + right * i_shape.w);   // tilt the shaft a bit

                vec3 wp = i_origin.xyz
                        + right * (corner.x * i_shape.x * 0.5)
                        + dir   * (corner.y * i_shape.y);

                v_local  = vec2(corner.x, -corner.y);   // x ∈ [-1,1], y ∈ [0,1]
                v_phase  = i_origin.w;
                v_intens = i_shape.z;

                gl_Position = u_proj * u_view * vec4(wp, 1.0);
                `
            },
            fragment: {
                outputColor: 'fragColor',
                main: `
                // fragment.main is wrapped in void main(){...}; helpers must be macros.
                #define HASH(p)  fract(sin(dot((p), vec2(127.1, 311.7))) * 43758.5453)
                #define SS(t)    ((t)*(t)*(3.0-2.0*(t)))
                #define VN(P)    mix( \\
                    mix(HASH(floor(P)),               HASH(floor(P)+vec2(1.0,0.0)), SS(fract(P).x)), \\
                    mix(HASH(floor(P)+vec2(0.0,1.0)), HASH(floor(P)+vec2(1.0,1.0)), SS(fract(P).x)), \\
                    SS(fract(P).y))
                #define FBM(P)   ( VN(P)*0.55 + VN((P)*2.07)*0.27 + VN((P)*4.13)*0.13 )

                // Soft elongated falloff: feathered horizontal edges, fade in/out vertically.
                float horiz = pow(1.0 - abs(v_local.x), 1.6);
                float vTop  = smoothstep(0.0, 0.08, v_local.y);    // soft fade from top
                float vBot  = smoothstep(1.0, 0.55, v_local.y);    // long fade into the deep
                float vert  = vTop * vBot;

                // Animated streaky modulation along the shaft.
                vec2 q = vec2(v_local.x * 1.6 + v_phase,
                              v_local.y * 3.2 - u_time + v_phase * 0.3);
                float n = FBM(q);
                float modulate = 0.45 + 0.85 * n;

                float a = horiz * vert * modulate * v_intens * u_intensity;
                fragColor = vec4(u_color * a, a);
                `
            },
            uniKeys: [
                { name: 'u_time',      type: 'float' },
                { name: 'u_color',     type: 'vec3'  },
                { name: 'u_intensity', type: 'float' },
            ],
            renderCfg: {
                rQueue:     100,
                depthWrite: false,
                depthTest:  false,
                blend:      true,
                cull:       'none',
                blendSrc:   EzShader.BLEND.SRC_ALPHA,
                blendDst:   EzShader.BLEND.ONE,    // additive
            },
        }).compile(gl);

        this.godrayMesh = EzMesh3D.fromDesc(gl, this.godrayShader, 'godray', {
            vertices:   new Float32Array([0,0, 0,0, 0,0, 0,0, 0,0, 0,0]),
            attributes: [{ name: '_dummy', size: 2 }],
            primitives: [{ vertexOffset: 0, vertexCount: 6 }],
        });

        const P = this.godrayShader.program;
        this.godrayUloc = {
            view:      gl.getUniformLocation(P, 'u_view'),
            proj:      gl.getUniformLocation(P, 'u_proj'),
            time:      gl.getUniformLocation(P, 'u_time'),
            color:     gl.getUniformLocation(P, 'u_color'),
            intensity: gl.getUniformLocation(P, 'u_intensity'),
        };

        // Spawn N shafts once. Geometry is static — pack instance buffer immediately
        // and never re-upload. Animation is fully driven by u_time + per-shaft phase.
        const c = this.cfg.godray, R = Effects.#rnd;
        const stride = this.godrayShader.instanceLayout.strideFloats;   // 8 floats
        const data   = new Float32Array(c.count * stride);

        for (let i = 0; i < c.count; i++) {
            const o = i * stride;
            // Origin: scattered across X/Z, anchored near the top of the volume.
            const x = R(c.boundMin[0], c.boundMax[0]);
            const z = R(c.boundMin[2], c.boundMax[2]);
            const y = c.boundMax[1];                       // top
            const phase = R(c.phaseSpread[0], c.phaseSpread[1]);

            const w     = R(c.widthRange[0],  c.widthRange[1]);
            const h     = R(c.heightRange[0], c.heightRange[1]);
            const tilt  = R(c.tiltRange[0],   c.tiltRange[1]);
            const intns = R(0.55, 1.0);

            data[o    ] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = phase;
            data[o + 4] = w; data[o + 5] = h; data[o + 6] = intns; data[o + 7] = tilt;
        }
        EzRender.uploadVBO(gl, this.godrayMesh.instanceVBO, data);
        this.godrayCount = c.count;
    }

    run(dt) {
        this.time += dt;
        if (this.cfg.godray.enabled) this.#runGodray();
    }

    #runGodray() {
        const gl = this.gl, c = this.cfg.godray, U = this.godrayUloc;

        this.godrayShader.applyRenderState(gl).bind(gl);
        EzRender.setUniforms(gl, this.godrayShader.program, [
            { loc: U.view,      type: 'mat4',  value: this.camera.view },
            { loc: U.proj,      type: 'mat4',  value: this.camera.projection },
            { loc: U.time,      type: 'float', value: this.time * c.speed },
            { loc: U.color,     type: 'vec3',  value: c.color },
            { loc: U.intensity, type: 'float', value: c.intensity },
        ]);
        EzRender.withVAO(gl, this.godrayMesh.vao, () => {
            EzCanvas3D.drawPrimitive(gl, this.godrayMesh, 0, this.godrayCount);
        });
        EzRender.restoreDefaultState(gl);
    }
}



const bubbles = new Bubbles(gl, ez3d.camera);
const effects = new Effects(gl, ez3d.camera);

let lastT = null;
function frame(ts) {
    if (!lastT) lastT = ts;
    const dt = Math.min((ts - lastT) / 1000, 0.05);
    lastT = ts;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    effects.run(dt);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    bubbles.run(dt);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('mousemove', e => {
    const nx = (e.clientX / window.innerWidth  - 0.5); // -0.5 .. 0.5
    const ny = (e.clientY / window.innerHeight - 0.5);
    // Absolute yaw/pitch in degrees (tweak the multipliers to taste).
    const yawDeg   = nx * 1;
    const pitchDeg = -ny * 0.5;
    ez3d.camera.set({
        orientation: EzMath.Quat.fromEulerYPR(yawDeg, pitchDeg, 0)
    });
});