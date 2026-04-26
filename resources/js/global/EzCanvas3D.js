/*
EzCanvas3D
By Asciiz

WebGL2 object-centric 3D canvas
Holy shi guys, I finally stopped using Canvas2D for rendering 3d stuff lmao
No more Z-fighting or painter algorithm, goddamn

Constructor:    new EzCanvas3D(name)
.settings       width()/height() getters
                fitContainer() resize the canvas to the container size

Mount:          getCanvas() / mount(el) / unmount() / resize(w,h) / readCanvas()

Shaders:        addShader(key, { vert, frag, attributes }) / removeShader(key) / readShader(key)
                    attributes: [{ name, size, default?:[r,g,b,a] }, ...]
                    Declares the FULL set of per-vertex inputs the shader can consume. Any model
                    may supply ANY SUBSET - missing attributes fall back to per-attribute defaults
                    (sent via gl.vertexAttrib4f at draw). Defaults pad/truncate to length 4.

Textures:       addTexture(key, { data, width, height, channels? }) / removeTexture(key) / readTexture(key)

Models:         addModel(key, { shader?, vertices, indices, attributes?, primitives?, skeleton? })
                    attributes  declares what's IN the model's VBO, in order. Subset of shader's attrs.
                                Default: [{name:"a_position",size:3},{name:"a_uv",size:2}]
                    primitives  [{ indexOffset?, indexCount?, vertexOffset?, vertexCount?,
                                    material?, morphTargets? }, ...]
                                Indexed draw:    indexOffset + indexCount (into the index buffer)
                                Non-indexed draw: vertexOffset + vertexCount (into the vertex buffer,
                                                uses drawArraysInstanced - no index buffer needed)
                                Both modes are mutually exclusive per primitive.
                                material: { albedo?, fill?:[r,g,b,a] }
                                morphTargets: [Float32Array, ...]  (shorthand for {position:[...]})
                                                OR { position:[Float32Array,...] }   - normal/tangent later
                                                Each delta is length vertexCount*3. Engine packs them into
                                                an RGB32F texture per primitive per channel; weights are
                                                per-instance (see writeInstance.morphWeights). When any
                                                primitive has morphs and `shader` is unset, the model
                                                auto-uses `__ez_morph_default__`.
                    skeleton    { bones: [{ parent, localBind?, inverseBind? }, ...] }
                                parent: int (-1 root, else parent bone index < own index)
                                localBind: mat4 OR {position,rotation,scale,euler} - bone's bind transform
                                            relative to parent. Default identity.
                                inverseBind: optional precomputed mat4. Auto-computed if omitted.
                readModel(key) / removeModel(key)

Instances:      addInstance(modelKey, transform?) -> instKey
                writeInstance(key, { transform?, boneTransform?, morphWeights?, color?, display? })
                    transform:     mat4 OR {position,rotation,scale,euler}
                    boneTransform: { id, transform } OR an array of those (skinned only)
                    morphWeights:  [w0, w1, ...] dense over all primitives' targets in declaration order
                                   OR { offset, weights:[...] } to write a slice
                                   length = sum(prim.morphTargets.length) across all primitives
                    color:         [r,g,b,a] - multiplied into texture * fill in the fragment
                    display:       bool - false skips the instance during render()
                readInstance(key) / removeInstance(key)

Camera:         setCamera({position?,yaw?,pitch?,roll?,orientation?,fov?,near?,far?})
                getCamera() -> {position,yaw,pitch,roll,fov,near,far,orientation}
                rotateCamera(pitchDelta,yawDelta,rollDelta?)   - degrees, pitch clamped ±89
                translateCamera([dx,dy,dz])
                resetCameraRoll() / getCameraVectors() -> {forward,up,right}

Render:         render()  - call from your rAF loop

Bone storage:   Bone palette is uploaded per-instance as an RGBA32F texture (u_bonesTex).
                Width = 4 texels (one per mat4 column), height = N bones. No bone count limit.
                texelFetch(u_bonesTex, ivec2(col, boneIdx), 0) retrieves a mat4 column.
                Custom skinned shaders should declare: uniform highp sampler2D u_bonesTex;

Notes:
    -   Instance mat4 occupies the 4 attribute slots starting at the shader's `a_instanceMatrix`
        location (auto-resolved via gl.getAttribLocation). Convention name: `a_instanceMatrix`.
    -   Built-in uniforms (auto-bound when present): u_view, u_projection, u_albedo, u_fill,
        u_bonesTex (RGBA32F bone palette texture, slot 1). Fragment output is
        `texture(u_albedo) * u_fill * v_instanceColor`. When a primitive has no albedo a 1x1
        white texture is bound, so `u_fill` (per-material) and `v_instanceColor` (per-instance)
        act as RGBA tints. All three default to [1,1,1,1] = no change.
    -   Per-instance attribute `a_instanceColor` (vec4) is wired alongside `a_instanceMatrix`
        on the same instance VBO (stride 80 bytes: 64 mat4 + 16 color). Custom shaders can opt-in
        by declaring `in vec4 a_instanceColor`.
    -   Skinned models draw per-instance (own bone palette per instance); static models batch via
        drawElementsInstanced.
    -   renderHook(gl, program) fires once per shader batch for custom uniforms.
*/

(function () {

    const isStr = v => typeof v === "string" && v.trim() !== "";
    const isObj = v => v !== null && typeof v === "object";

    const Mat4 = {
        identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },

        // Column-major multiply: out = a * b
        multiply(a, b) {
            const o = new Float32Array(16);
            for (let c = 0; c < 4; c++) {
                const b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
                o[c*4  ] = a[0]*b0 + a[4]*b1 + a[ 8]*b2 + a[12]*b3;
                o[c*4+1] = a[1]*b0 + a[5]*b1 + a[ 9]*b2 + a[13]*b3;
                o[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
                o[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
            }
            return o;
        },

        // General 4x4 inverse (gl-matrix algorithm). Returns identity if singular.
        invert(m) {
            const a00=m[0],  a01=m[1],  a02=m[2],  a03=m[3];
            const a10=m[4],  a11=m[5],  a12=m[6],  a13=m[7];
            const a20=m[8],  a21=m[9],  a22=m[10], a23=m[11];
            const a30=m[12], a31=m[13], a32=m[14], a33=m[15];
            const b00 = a00*a11 - a01*a10, b01 = a00*a12 - a02*a10, b02 = a00*a13 - a03*a10;
            const b03 = a01*a12 - a02*a11, b04 = a01*a13 - a03*a11, b05 = a02*a13 - a03*a12;
            const b06 = a20*a31 - a21*a30, b07 = a20*a32 - a22*a30, b08 = a20*a33 - a23*a30;
            const b09 = a21*a32 - a22*a31, b10 = a21*a33 - a23*a31, b11 = a22*a33 - a23*a32;
            const det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
            if (!det) return Mat4.identity();
            const id = 1 / det;
            return new Float32Array([
                (a11*b11 - a12*b10 + a13*b09) * id,
                (a02*b10 - a01*b11 - a03*b09) * id,
                (a31*b05 - a32*b04 + a33*b03) * id,
                (a22*b04 - a21*b05 - a23*b03) * id,
                (a12*b08 - a10*b11 - a13*b07) * id,
                (a00*b11 - a02*b08 + a03*b07) * id,
                (a32*b02 - a30*b05 - a33*b01) * id,
                (a20*b05 - a22*b02 + a23*b01) * id,
                (a10*b10 - a11*b08 + a13*b06) * id,
                (a01*b08 - a00*b10 - a03*b06) * id,
                (a30*b04 - a31*b02 + a33*b00) * id,
                (a21*b02 - a20*b04 - a23*b00) * id,
                (a11*b07 - a10*b09 - a12*b06) * id,
                (a00*b09 - a01*b07 + a02*b06) * id,
                (a31*b01 - a30*b03 - a32*b00) * id,
                (a20*b03 - a21*b01 + a22*b00) * id,
            ]);
        },

        perspective(fovY, aspect, near, far) {
            const f = 1.0 / Math.tan(fovY / 2), nf = 1 / (near - far);
            return new Float32Array([
                f/aspect, 0, 0,             0,
                0,        f, 0,             0,
                0,        0, (far+near)*nf, -1,
                0,        0, 2*far*near*nf,  0,
            ]);
        },

        lookAt(eye, target, up) {
            const [px, py, pz] = eye;
            let fx = target[0]-px, fy = target[1]-py, fz = target[2]-pz;
            const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
            const [ux, uy, uz] = up;
            let rx = fy*uz - fz*uy, ry = fz*ux - fx*uz, rz = fx*uy - fy*ux;
            const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
            const Ux = ry*fz - rz*fy, Uy = rz*fx - rx*fz, Uz = rx*fy - ry*fx;
            return new Float32Array([
                rx,                   Ux,                   -fx, 0,
                ry,                   Uy,                   -fy, 0,
                rz,                   Uz,                   -fz, 0,
                -(rx*px+ry*py+rz*pz), -(Ux*px+Uy*py+Uz*pz), fx*px+fy*py+fz*pz, 1,
            ]);
        },

        compose(pos = [0,0,0], quat = [0,0,0,1], scale = [1,1,1]) {
            const [qx, qy, qz, qw] = quat, [sx, sy, sz] = scale;
            const x2=qx+qx, y2=qy+qy, z2=qz+qz;
            const xx=qx*x2, xy=qx*y2, xz=qx*z2, yy=qy*y2, yz=qy*z2, zz=qz*z2;
            const wx=qw*x2, wy=qw*y2, wz=qw*z2;
            return new Float32Array([
                (1-(yy+zz))*sx, (xy+wz)*sx,     (xz-wy)*sx,     0,
                (xy-wz)*sy,     (1-(xx+zz))*sy, (yz+wx)*sy,     0,
                (xz+wy)*sz,     (yz-wx)*sz,     (1-(xx+yy))*sz, 0,
                pos[0], pos[1], pos[2], 1,
            ]);
        },

        resolveTransform(t, existing) {
            if (t instanceof Float32Array && t.length === 16) return t;
            if (!isObj(t)) return existing ?? Mat4.identity();
            const pos   = t.position ?? [existing?.[12]??0, existing?.[13]??0, existing?.[14]??0];
            const scale = t.scale ?? [1,1,1];
            const quat  = t.euler ? Quat.fromEulerZYX(t.euler) : (t.rotation ?? [0,0,0,1]);
            return Mat4.compose(pos, quat, scale);
        },
    };

    const Quat = {
        identity() { return [0, 0, 0, 1]; },

        rotateVec([qx, qy, qz, qw], [vx, vy, vz]) {
            const tx = 2*(qy*vz - qz*vy), ty = 2*(qz*vx - qx*vz), tz = 2*(qx*vy - qy*vx);
            return [
                vx + qw*tx + qy*tz - qz*ty,
                vy + qw*ty + qz*tx - qx*tz,
                vz + qw*tz + qx*ty - qy*tx,
            ];
        },

        multiply([ax,ay,az,aw], [bx,by,bz,bw]) {
            return [
                aw*bx + ax*bw + ay*bz - az*by,
                aw*by - ax*bz + ay*bw + az*bx,
                aw*bz + ax*by - ay*bx + az*bw,
                aw*bw - ax*bx - ay*by - az*bz,
            ];
        },

        normalize([x,y,z,w]) {
            const l = Math.hypot(x,y,z,w) || 1;
            return [x/l, y/l, z/l, w/l];
        },

        fromAxisAngle([ax,ay,az], angle) {
            const l = Math.hypot(ax,ay,az) || 1, s = Math.sin(angle/2);
            return [ax/l*s, ay/l*s, az/l*s, Math.cos(angle/2)];
        },

        // yaw=0,pitch=0 -> looking down -Z. Angles in degrees.
        fromEulerYPR(yawDeg, pitchDeg, rollDeg) {
            const d2r = Math.PI / 180;
            const qY = Quat.fromAxisAngle([0, 1, 0],  yawDeg   * d2r);
            const qP = Quat.fromAxisAngle([1, 0, 0],  pitchDeg * d2r);
            const q  = Quat.normalize(Quat.multiply(qY, qP));
            if (!rollDeg) return q;
            return Quat.normalize(Quat.multiply(q, Quat.fromAxisAngle([0, 0, -1], rollDeg * d2r)));
        },

        fromEulerZYX([ex, ey, ez]) {
            const cx = Math.cos(ex*.5), sx = Math.sin(ex*.5);
            const cy = Math.cos(ey*.5), sy = Math.sin(ey*.5);
            const cz = Math.cos(ez*.5), sz = Math.sin(ez*.5);
            return [sx*cy*cz-cx*sy*sz, cx*sy*cz+sx*cy*sz, cx*cy*sz-sx*sy*cz, cx*cy*cz+sx*sy*sz];
        },

        slerp(a, b, t) {
            let [ax,ay,az,aw] = a, [bx,by,bz,bw] = b;
            let dot = ax*bx + ay*by + az*bz + aw*bw;
            if (dot < 0) { bx=-bx; by=-by; bz=-bz; bw=-bw; dot=-dot; }
            if (dot > 0.9995) return Quat.normalize([ax+t*(bx-ax), ay+t*(by-ay), az+t*(bz-az), aw+t*(bw-aw)]);
            const th0 = Math.acos(dot), th = th0*t;
            const s0 = Math.cos(th) - dot*Math.sin(th)/Math.sin(th0), s1 = Math.sin(th)/Math.sin(th0);
            return [s0*ax+s1*bx, s0*ay+s1*by, s0*az+s1*bz, s0*aw+s1*bw];
        },
    };

    // GL helpers

    function compileShader(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("[EzCanvas3D] shader compile error:", gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    function createProgram(gl, vertSrc, fragSrc) {
        const v = compileShader(gl, gl.VERTEX_SHADER,   vertSrc);
        const f = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!v || !f) return null;
        const p = gl.createProgram();
        gl.attachShader(p, v); gl.attachShader(p, f);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error("[EzCanvas3D] program link error:", gl.getProgramInfoLog(p));
            return null;
        }
        gl.deleteShader(v); gl.deleteShader(f);
        return p;
    }

    // Power-of-two check for mipmap eligibility.
    const isPOT = n => n > 0 && (n & (n - 1)) === 0;

    // Map channel count to [internalFormat, baseFormat].
    const glFormat = (gl, ch) => ({
        1: [gl.R8,    gl.RED ],
        2: [gl.RG8,   gl.RG  ],
        3: [gl.RGB8,  gl.RGB ],
        4: [gl.RGBA8, gl.RGBA],
    }[ch] ?? [gl.RGBA8, gl.RGBA]);


    function simpleTex(gl, existing, iFmt, fmt, type, w, h, data) {
        let tex = existing;
        if (!tex) {
            tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, tex);
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, iFmt, w, h, 0, fmt, type, data);
        return tex;
    }

    // Pack one instance row (mat4 + RGBA color) into a Float32Array at `off`.
    // Stride is 20 floats / 80 bytes, matching the instance VBO layout in addModel.
    function packInstanceRow(arr, off, inst) {
        arr.set(inst.transform, off);
        arr[off+16] = inst.color[0];
        arr[off+17] = inst.color[1];
        arr[off+18] = inst.color[2];
        arr[off+19] = inst.color[3];
    }


    // Default shader (has skinning)

    const _DEFAULT_VERT = `#version 300 es
        precision highp float;
        layout(location=0) in vec3 a_position;
        layout(location=1) in vec2 a_uv;
        layout(location=2) in vec4 a_boneID;
        layout(location=3) in vec4 a_boneWeight;
        layout(location=4) in mat4 a_instanceMatrix;
        layout(location=8) in vec4 a_instanceColor;
        uniform mat4 u_view;
        uniform mat4 u_projection;
        uniform highp sampler2D u_bonesTex;
        out vec2 v_uv;
        out vec4 v_instanceColor;
        mat4 fetchBone(int i) {
            return mat4(
                texelFetch(u_bonesTex, ivec2(0, i), 0),
                texelFetch(u_bonesTex, ivec2(1, i), 0),
                texelFetch(u_bonesTex, ivec2(2, i), 0),
                texelFetch(u_bonesTex, ivec2(3, i), 0)
            );
        }
        void main() {
            v_uv = a_uv;
            v_instanceColor = a_instanceColor;
            float wsum = a_boneWeight.x + a_boneWeight.y + a_boneWeight.z + a_boneWeight.w;
            mat4 skin;
            if (wsum < 0.0001) {
                skin = mat4(1.0);
            } else {
                skin = a_boneWeight.x * fetchBone(int(a_boneID.x))
                     + a_boneWeight.y * fetchBone(int(a_boneID.y))
                     + a_boneWeight.z * fetchBone(int(a_boneID.z))
                     + a_boneWeight.w * fetchBone(int(a_boneID.w));
            }
            gl_Position = u_projection * u_view * a_instanceMatrix * skin * vec4(a_position, 1.0);
        }`;

    const _DEFAULT_FRAG = `#version 300 es
        precision mediump float;
        in  vec2 v_uv;
        in  vec4 v_instanceColor;
        out vec4 fragColor;
        uniform vec4      u_fill;
        uniform sampler2D u_albedo;
        void main() {
            // Output = texture * material fill * per-instance color tint.
            // Models with no texture get a 1x1 white pixel bound by the engine,
            // so the texture term collapses to identity in that case.
            // u_fill is the material RGBA tint, v_instanceColor is the per-instance one.
            fragColor = texture(u_albedo, v_uv) * u_fill * v_instanceColor;
        }`;

    const _MORPH_WEIGHT_TEX_UNIT = 2;     // u_morphWeightTex (single global unit)

    const _MORPH_VERT = `#version 300 es
        precision highp float;
        layout(location=0) in vec3 a_position;
        layout(location=1) in vec2 a_uv;
        layout(location=2) in vec4 a_boneID;
        layout(location=3) in vec4 a_boneWeight;
        layout(location=4) in mat4 a_instanceMatrix;
        layout(location=8) in vec4 a_instanceColor;
        uniform mat4 u_view;
        uniform mat4 u_projection;
        uniform highp sampler2D u_bonesTex;
        uniform highp sampler2D u_morphWeightTex;
        uniform highp sampler2D u_morphPosTex;
        uniform int u_morphCount;
        uniform int u_morphWeightOffset;
        uniform int u_morphVertexBase;
        out vec2 v_uv;
        out vec4 v_instanceColor;
        mat4 fetchBone(int i) {
            return mat4(
                texelFetch(u_bonesTex, ivec2(0, i), 0),
                texelFetch(u_bonesTex, ivec2(1, i), 0),
                texelFetch(u_bonesTex, ivec2(2, i), 0),
                texelFetch(u_bonesTex, ivec2(3, i), 0)
            );
        }
        void main() {
            v_uv = a_uv;
            v_instanceColor = a_instanceColor;
            // Morph (always before skin): pos = base + sum_t( w_t * delta_t )
            vec3 pos = a_position;
            int v = gl_VertexID - u_morphVertexBase;
            for (int t = 0; t < u_morphCount; t++) {
                float w = texelFetch(u_morphWeightTex,
                                     ivec2(u_morphWeightOffset + t, gl_InstanceID), 0).r;
                if (w != 0.0) {
                    pos += w * texelFetch(u_morphPosTex, ivec2(t, v), 0).xyz;
                }
            }
            float wsum = a_boneWeight.x + a_boneWeight.y + a_boneWeight.z + a_boneWeight.w;
            mat4 skin;
            if (wsum < 0.0001) {
                skin = mat4(1.0);
            } else {
                skin = a_boneWeight.x * fetchBone(int(a_boneID.x))
                     + a_boneWeight.y * fetchBone(int(a_boneID.y))
                     + a_boneWeight.z * fetchBone(int(a_boneID.z))
                     + a_boneWeight.w * fetchBone(int(a_boneID.w));
            }
            gl_Position = u_projection * u_view * a_instanceMatrix * skin * vec4(pos, 1.0);
        }`;

    // Built-in default shaders. The FIRST entry is THE default - used by addModel()
    const _DEFAULT_SHADERS = [
        { key: "__ez_opaque_default__",      vert: _DEFAULT_VERT, frag: _DEFAULT_FRAG, transparent: false, morphChannels: [] },
        { key: "__ez_transparent_default__", vert: _DEFAULT_VERT, frag: _DEFAULT_FRAG, transparent: true,  morphChannels: [] },
        { key: "__ez_morph_default__",       vert: _MORPH_VERT,   frag: _DEFAULT_FRAG, transparent: false, morphChannels: ["u_morphPosTex"] },
    ];
    const _DEFAULT_OPAQUE_KEY  = _DEFAULT_SHADERS[0].key;   
    const _DEFAULT_MORPH_KEY = _DEFAULT_SHADERS[2].key;
    const _DEFAULT_SHADER_KEYS = new Set(_DEFAULT_SHADERS.map(s => s.key));

    // Main class

    class EzCanvas3D {

        #canvas = null;
        #gl     = null;

        #shaders   = new Map(); // key -> { program, attributes, stride, locs, uloc }
        #textures  = new Map(); // key -> { glTex, width, height, channels }
        #models    = new Map(); // key -> { shaderKey, vao, vbo, ebo, instanceVBO,
                                //          indexType, primitives, _info }
        #instances = new Map(); // instanceKey -> { modelKey, transform:mat4 }

        // Dummy textures
        #whiteTex         = null; // 1x1 white
        #morphDummyDelta  = null; // RGB32F (0,0,0)
        #morphDummyWeight = null; // R32F (0)

        #instanceCounter = 0;

        #cam = {
            pos:         [0, 0, 3],
            orientation: [0, 0, 0, 1],
            pitch:       0,
            yaw:         0,
            roll:        0,
            forward:     [0, 0, -1],   // derived
            up:          [0, 1,  0],   // derived
            right:       [1, 0,  0],   // derived
            fov:         45,           // degrees
            near:        0.1,
            far:         1000,
        };
        #proj = null;
        #view = null;

        settings = {
            width: () => this.#canvas.width,
            height: () => this.#canvas.height,
            fitContainer: () => {
                const parent = this.#canvas.parentElement;
                if (!parent) return;
                const rect = parent.getBoundingClientRect();
                this.resize(rect.width, rect.height);
            }
        };

        // Override to set custom uniforms once per shader batch before draws.
        renderHook = (gl, program) => {};


        constructor(name) {
            if (!isStr(name)) throw new Error("EzCanvas3D: name required");
            const c = document.createElement("canvas");
            c.id     = `ez-canvas3d-${name}`;
            c.width  = 800;
            c.height = 600;
            c.style.background = "transparent";
            this.#canvas = c;

            const gl = c.getContext("webgl2", { alpha: true });
            if (!gl) throw new Error("EzCanvas3D: WebGL2 not supported");
            this.#gl = gl;

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.enable(gl.BLEND); // Canvas is transparent, cool shi
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clearColor(0, 0, 0, 0);

            // Fall back textures for: texture, morph delta and morph weight
            this.#whiteTex         = simpleTex(gl, null, gl.RGBA8,  gl.RGBA, gl.UNSIGNED_BYTE, 1, 1, new Uint8Array  ([255,255,255,255]));
            this.#morphDummyDelta  = simpleTex(gl, null, gl.RGB32F, gl.RGB,  gl.FLOAT,         1, 1, new Float32Array([0,0,0]));
            this.#morphDummyWeight = simpleTex(gl, null, gl.R32F,   gl.RED,  gl.FLOAT,         1, 1, new Float32Array([0]));

            this.#addDefaultShader();
            this.#camUpdate();
        }

        getCanvas() { return this.#canvas; }
        mount(el)   { 
            if (el instanceof Element) el.appendChild(this.#canvas); 
            return this; 
        }
        unmount()   { this.#canvas.parentElement?.removeChild(this.#canvas);   return this; }

        resize(w, h) {
            this.#canvas.width  = w;
            this.#canvas.height = h;
            this.#gl.viewport(0, 0, w, h);
            this.#camUpdate(); // aspect ratio changed
            return this;
        }

        readCanvas() {
            // Return keys
            const modelKeys = Array.from(this.#models.keys());
            const shaderKeys = Array.from(this.#shaders.keys());
            const textureKeys = Array.from(this.#textures.keys());
            const instanceKeys = Array.from(this.#instances.keys());
            return { modelKeys, shaderKeys, textureKeys, instanceKeys };
        }

        /* shaders */

        // attributes: [{ name, size, default?:[r,g,b,a] }, ...]
        //   Declares the FULL set of per-vertex attributes the shader can consume.
        //   Models may provide any subset of these in their VBO; missing ones fall back
        //   to the per-attribute `default` (sent via gl.vertexAttrib4f at draw time).
        //   Defaults are extended/truncated to length 4. If omitted, falls back to (0,0,0,0).
        // morphChannels: ["u_morphPosTex", ...]
        //   Array of sampler-uniform names (must match `uniform sampler2D u_xxx;` lines
        //   in GLSL). Each channel gets a fresh texture unit starting at 3.
        //   Models pass `morphTargets: { u_morphPosTex: [...] }` using the same keys.
        //   Omit or pass [] when the shader has no morph code.
        // transparent: optional bool. If true, this shader's instances render AFTER opaque
        //   ones with depth writes disabled (standard transparency pass).
        addShader(key, { vert, frag, attributes, morphChannels, transparent = false }) {
            if (!isStr(key) || !isStr(vert) || !isStr(frag) || !Array.isArray(attributes)) return false;
            if (_DEFAULT_SHADER_KEYS.has(key)) {
                console.warn(`[EzCanvas3D] addShader: key "${key}" is reserved (built-in default)`);
                return false;
            }
            return this.#registerShader(key, vert, frag, attributes, morphChannels, !!transparent);
        }

        #registerShader(key, vert, frag, attributes, morphChannels, transparent = false) {
            const gl = this.#gl;
            const program = createProgram(gl, vert, frag);
            if (!program) return false;

            const attrs = attributes.map(a => {
                const def = Array.isArray(a.default) ? a.default : [0, 0, 0, 0];
                return {
                    name: a.name,
                    size: a.size,
                    default: [def[0]??0, def[1]??0, def[2]??0, def[3]??0],
                    loc: gl.getAttribLocation(program, a.name),
                };
            });

            const locs = {};
            for (const a of attrs) locs[a.name] = a.loc;

            // Morph channel schema for THIS shader. Each entry { samplerName, unit, loc }
            const channels = (Array.isArray(morphChannels) ? morphChannels : []).map((sName, i) => ({
                samplerName: sName,
                unit:        3 + i,
                loc:         gl.getUniformLocation(program, sName),
            }));

            const uloc = {
                view:       gl.getUniformLocation(program, "u_view"),
                projection: gl.getUniformLocation(program, "u_projection"),
                albedo:     gl.getUniformLocation(program, "u_albedo"),
                fill:       gl.getUniformLocation(program, "u_fill"),
                bonesTex:   gl.getUniformLocation(program, "u_bonesTex"),
                morph: {
                    weightTex:    gl.getUniformLocation(program, "u_morphWeightTex"),
                    count:        gl.getUniformLocation(program, "u_morphCount"),
                    weightOffset: gl.getUniformLocation(program, "u_morphWeightOffset"),
                    vertexBase:   gl.getUniformLocation(program, "u_morphVertexBase"),
                    channels,
                },
            };

            let instanceMat4Loc = gl.getAttribLocation(program, "a_instanceMatrix");
            if (instanceMat4Loc < 0) instanceMat4Loc = attrs.length;

            const instanceColorLoc = gl.getAttribLocation(program, "a_instanceColor");

            this.#shaders.set(key, { program, attributes: attrs, locs, uloc, instanceMat4Loc, instanceColorLoc, transparent });
            return true;
        }

        removeShader(key) {
            if (_DEFAULT_SHADER_KEYS.has(key)) {
                console.warn(`[EzCanvas3D] removeShader: built-in default "${key}" cannot be removed`);
                return false;
            }
            const s = this.#shaders.get(key); if (!s) return false;
            this.#gl.deleteProgram(s.program);
            this.#shaders.delete(key);
            return true;
        }

        readShader(key) {
            const s = this.#shaders.get(key); if (!s) return null;
            return {
                key,
                attributes:    s.attributes.map(a => ({ name: a.name, size: a.size, default: [...a.default] })),
                morphChannels: s.uloc.morph.channels.map(c => c.samplerName),
            };
        }

        /* textures */

        // filter: "linear" (default) - LINEAR + mipmaps when POT. Smooth, blurry up close.
        //         "nearest" - NEAREST, no mipmaps. Crisp pixel-art look.
        addTexture(key, { data, width, height, channels = 4, filter = "linear" }) {
            if (!isStr(key) || !data || !width || !height) return false;
            const gl = this.#gl;
            const nearest = filter === "nearest";

            const [internalFmt, fmt] = glFormat(gl, channels);
            const glTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, glTex);

            if (data instanceof ImageBitmap) {
                gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, fmt, gl.UNSIGNED_BYTE, data);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, width, height, 0, fmt, gl.UNSIGNED_BYTE, data);
            }

            if (!nearest && isPOT(width) && isPOT(height)) {
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
            }
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.bindTexture(gl.TEXTURE_2D, null);

            this.#textures.set(key, { glTex, width, height, channels });
            return true;
        }

        removeTexture(key) {
            const t = this.#textures.get(key); if (!t) return false;
            this.#gl.deleteTexture(t.glTex);
            this.#textures.delete(key);
            return true;
        }

        readTexture(key) {
            const t = this.#textures.get(key); if (!t) return null;
            return { key, width: t.width, height: t.height, channels: t.channels };
        }

        static imageToData(img) {
            if (!(img instanceof HTMLImageElement) || !img.complete || img.naturalWidth === 0)
                throw new Error("imageToTexture: img must be a fully loaded HTMLImageElement");

            const w = img.naturalWidth, h = img.naturalHeight;

            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const { data } = ctx.getImageData(0, 0, w, h); // Uint8ClampedArray, RGBA
            return { data: new Uint8Array(data.buffer), width: w, height: h, channels: 4 };
        }


        addModel(key, opts = {}) {
            if (!isStr(key)) return false;
            const { shader: shaderKeyIn, vertices, indices, attributes, primitives, skeleton } = opts;

            const shaderKey = isStr(shaderKeyIn) ? shaderKeyIn : _DEFAULT_OPAQUE_KEY;
            const shader = this.#shaders.get(shaderKey);
            if (!shader) {
                console.warn(`[EzCanvas3D] addModel: shader "${shaderKey}" not found`);
                return false;
            }
            if (!vertices) {
                console.warn(`[EzCanvas3D] addModel "${key}": vertices required`);
                return false;
            }

            const gl = this.#gl;
            const indexType  = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
            const indexBytes = indices instanceof Uint32Array ? 4 : 2;

            // Resolve model layout: what's IN the VBO, in order.
            const modelAttrsIn = Array.isArray(attributes) && attributes.length
                ? attributes
                : [{ name: "a_position", size: 3 }, { name: "a_uv", size: 2 }];

            // Build VBO layout (offsets/stride).
            let off = 0;
            const modelAttrs = modelAttrsIn.map(a => {
                const e = { name: a.name, size: a.size, offset: off };
                off += a.size * 4;
                return e;
            });
            const vaoStride = off;

            // For each shader attribute: either bind from VBO (model has it) or record fallback default.
            const wired   = [];   // { loc, size, offset } - wired from VBO
            const defaulted = []; // { loc, default[4]    } - applied via vertexAttrib4f at draw time
            for (const sa of shader.attributes) {
                if (sa.loc < 0) continue;
                const ma = modelAttrs.find(m => m.name === sa.name);
                if (ma) wired.push({ loc: sa.loc, size: ma.size, offset: ma.offset });
                else    defaulted.push({ loc: sa.loc, default: sa.default });
            }

            // Normalise primitive list.
            // Each entry is one of:
            //   Indexed:      { indexOffset, indexCount, material? }
            //   Non-indexed:  { vertexOffset, vertexCount, material? }
            const vertexCount = vertices.length / (vaoStride / 4); // total vertices in VBO
            const primList = Array.isArray(primitives) && primitives.length > 0
                ? primitives.map(p => {
                    const mat = {
                        albedo: p.material?.albedo ?? null,
                        fill:   p.material?.fill   ?? [1, 1, 1, 1],
                    };
                    const hasVertex = (p.vertexOffset != null || p.vertexCount != null) && p.indexOffset == null && p.indexCount == null;
                    const out = hasVertex
                        ? { vertexOffset: p.vertexOffset ?? 0, vertexCount: p.vertexCount ?? vertexCount, material: mat }
                        : { indexOffset:  p.indexOffset  ?? 0, indexCount:  p.indexCount  ?? (indices ? indices.length : 0), material: mat };
                    if (p.morphTargets) out._morphSrc = p.morphTargets;
                    return out;
                })
                : indices
                    ? [{ indexOffset: 0, indexCount: indices.length, material: { albedo: null, fill: [1,1,1,1] } }]
                    : [{ vertexOffset: 0, vertexCount, material: { albedo: null, fill: [1,1,1,1] } }];

            for (const p of primList) {
                if (p.indexOffset != null) {
                    if (p.indexOffset < 0 || p.indexOffset + p.indexCount > (indices ? indices.length : 0)) {
                        console.warn(`[EzCanvas3D] addModel "${key}": primitive index range out of bounds`);
                        return false;
                    }
                } else {
                    if (p.vertexOffset < 0 || p.vertexOffset + p.vertexCount > vertexCount) {
                        console.warn(`[EzCanvas3D] addModel "${key}": primitive vertex range out of bounds`);
                        return false;
                    }
                }
            }

            // -- Morph targets: validate, pack into RGB32F textures, assign weight slots --
            let morphTotalWeights = 0;
            for (const p of primList) {
                const channelsIn = p._morphSrc; delete p._morphSrc;
                if (!channelsIn) continue;
                if (!isObj(channelsIn) || Array.isArray(channelsIn)) {
                    console.warn(`[EzCanvas3D] addModel "${key}": morphTargets must be an object keyed by sampler name`);
                    return false;
                }

                // Validate target count (must match across all channels in this primitive).
                const channelNames = Object.keys(channelsIn);
                let targetCount = -1;
                for (const name of channelNames) {
                    const arr = channelsIn[name];
                    if (arr == null) continue;
                    if (!Array.isArray(arr)) {
                        console.warn(`[EzCanvas3D] addModel "${key}": morphTargets.${name} must be an array`);
                        return false;
                    }
                    if (targetCount < 0) targetCount = arr.length;
                    else if (arr.length !== targetCount) {
                        console.warn(`[EzCanvas3D] addModel "${key}": morphTargets channel "${name}" has ${arr.length} targets, expected ${targetCount}`);
                        return false;
                    }
                }
                if (targetCount <= 0) continue;

                // Resolve primitive-local vertex range.
                let vBase, vCount;
                if (p.indexOffset != null) {
                    let lo = Infinity, hi = -Infinity;
                    const end = p.indexOffset + p.indexCount;
                    for (let i = p.indexOffset; i < end; i++) {
                        const idx = indices[i];
                        if (idx < lo) lo = idx;
                        if (idx > hi) hi = idx;
                    }
                    vBase  = lo;
                    vCount = hi - lo + 1;
                } else {
                    vBase  = p.vertexOffset;
                    vCount = p.vertexCount;
                }

                p.morph = {
                    targetCount,
                    weightOffset: morphTotalWeights,
                    vertexBase:   vBase,
                    vertexCount:  vCount,
                    channels:     new Map(),   // samplerName -> GLTexture
                };

                for (const sName of channelNames) {
                    const arr = channelsIn[sName];
                    if (arr == null) continue;

                    // Validate morph deltas
                    const expected = vCount * 3;
                    for (let t = 0; t < targetCount; t++) {
                        if (!arr[t] || arr[t].length !== expected) {
                            console.warn(`[EzCanvas3D] addModel "${key}": morphTargets.${sName}[${t}] length must be ${expected} (vertexCount*3), got ${arr[t]?.length}`);
                            return false;
                        }
                    }

                    // Pack morph
                    const packed = new Float32Array(vCount * targetCount * 3);
                    for (let t = 0; t < targetCount; t++) {
                        const d = arr[t];
                        for (let v = 0; v < vCount; v++) {
                            const dst = (v * targetCount + t) * 3;
                            packed[dst    ] = d[v * 3    ];
                            packed[dst + 1] = d[v * 3 + 1];
                            packed[dst + 2] = d[v * 3 + 2];
                        }
                    }
                    p.morph.channels.set(sName, simpleTex(gl, null, gl.RGB32F, gl.RGB, gl.FLOAT, targetCount, vCount, packed));
                }

                morphTotalWeights += targetCount;
            }

            // -- Skeleton: resolve localBind, compute inverseBind chain --
            let resolvedSkeleton = null;
            if (skeleton && Array.isArray(skeleton.bones) && skeleton.bones.length > 0) {
                const bones = [];
                const globalBind = []; // accumulates world bind matrices
                for (let i = 0; i < skeleton.bones.length; i++) {
                    const b = skeleton.bones[i];
                    const parent = b.parent ?? -1;
                    if (parent >= i) {
                        console.warn(`[EzCanvas3D] addModel "${key}": bone ${i} parent must be < self`);
                        return false;
                    }
                    const localBind = Mat4.resolveTransform(b.localBind ?? null, null);
                    const gb = parent < 0 ? localBind : Mat4.multiply(globalBind[parent], localBind);
                    globalBind[i] = gb;
                    const inverseBind = b.inverseBind instanceof Float32Array && b.inverseBind.length === 16
                        ? b.inverseBind
                        : Mat4.invert(gb);
                    bones.push({ parent, localBind, inverseBind });
                }
                resolvedSkeleton = { bones };
            }

            // -- VAO setup --
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);

            const vbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

            for (const w of wired) {
                gl.enableVertexAttribArray(w.loc);
                gl.vertexAttribPointer(w.loc, w.size, gl.FLOAT, false, vaoStride, w.offset);
                gl.vertexAttribDivisor(w.loc, 0);
            }
            for (const d of defaulted) {
                gl.disableVertexAttribArray(d.loc);
            }

            const ebo = indices ? gl.createBuffer() : null;
            if (ebo) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            }

            // Instance VBO - per-instance: mat4 (16 floats) + RGBA color (4 floats)
            //                              = 20 floats / 80 bytes, packed back-to-back.
            const instanceVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
            for (let col = 0; col < 4; col++) {
                const loc = shader.instanceMat4Loc + col;
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 80, col * 16);
                gl.vertexAttribDivisor(loc, 1);
            }
            if (shader.instanceColorLoc >= 0) {
                gl.enableVertexAttribArray(shader.instanceColorLoc);
                gl.vertexAttribPointer(shader.instanceColorLoc, 4, gl.FLOAT, false, 80, 64);
                gl.vertexAttribDivisor(shader.instanceColorLoc, 1);
            }

            gl.bindVertexArray(null);

            this.#models.set(key, {
                shaderKey,
                vao, vbo, ebo, instanceVBO,
                indexType, indexBytes,
                primitives: primList,
                defaulted, // attribute defaults to apply at draw time
                skeleton:  resolvedSkeleton, // null for static models
                boneTex: null, // RGBA32F texture for skinned instances; (re)created at draw time
                morphTotalWeights,            // 0 if model has no morph data
                morphWeightTex: null,         // R32F (totalWeights x N), (re)created at draw time
                _info: {
                    indexCount: indices ? indices.length : 0,
                    boneCount:  resolvedSkeleton?.bones.length ?? 0,
                    morphTotalWeights,
                },
            });
            return true;
        }

        removeModel(key) {
            const m = this.#models.get(key); if (!m) return false;
            const gl = this.#gl;
            gl.deleteVertexArray(m.vao);
            gl.deleteBuffer(m.vbo);
            if (m.ebo) gl.deleteBuffer(m.ebo);
            gl.deleteBuffer(m.instanceVBO);
            if (m.boneTex)        gl.deleteTexture(m.boneTex);
            if (m.morphWeightTex) gl.deleteTexture(m.morphWeightTex);
            for (const p of m.primitives) {
                if (p.morph) for (const t of p.morph.channels.values()) gl.deleteTexture(t);
            }
            this.#models.delete(key);
            // Remove orphaned instances.
            for (const [ik, inst] of this.#instances)
                if (inst.modelKey === key) this.#instances.delete(ik);
            return true;
        }

        readModel(key) {
            const m = this.#models.get(key); if (!m) return null;
            return {
                key,
                shader: m.shaderKey,
                primitives: m.primitives.map(p => {
                    const out = { material: { albedo: p.material.albedo, fill: [...p.material.fill] } };
                    if (p.indexOffset != null) { out.indexOffset = p.indexOffset; out.indexCount = p.indexCount; }
                    else { out.vertexOffset = p.vertexOffset; out.vertexCount = p.vertexCount; }
                    if (p.morph) {
                        out.morph = {
                            targetCount:  p.morph.targetCount,
                            weightOffset: p.morph.weightOffset,
                            vertexBase:   p.morph.vertexBase,
                            vertexCount:  p.morph.vertexCount,
                        };
                    }
                    return out;
                }),
                ...m._info,
            };
        }


        addInstance(modelKey, transform = null) {
            const model = this.#models.get(modelKey);
            if (!model) {
                console.warn(`[EzCanvas3D] addInstance: model "${modelKey}" not found`);
                return null;
            }
            const key = `i${this.#instanceCounter++}`;

            // Array of bones local transforms
            const bonePoses = model.skeleton
                ? Array.from({ length: model.skeleton.bones.length }, () => Mat4.identity())
                : null;

            // Array of weights for all unique morph targets
            const morphWeights = model.morphTotalWeights > 0
                ? new Float32Array(model.morphTotalWeights)
                : null;
            this.#instances.set(key, {
                modelKey,
                transform: Mat4.resolveTransform(transform, null),
                bonePoses,
                morphWeights,
                color:   [1, 1, 1, 1],
                display: true,
            });
            return key;
        }

        removeInstance(key) {
            return this.#instances.delete(key);
        }

        // Apply any subset of instance state in one call.
        //   display:       bool. False -> instance is skipped during render(). Default true.
        //   transform:     mat4 Float32Array OR {position?, rotation?, scale?, euler?}
        //   boneTransform: {id, transform} OR an array of those (skinned models only).
        //                  `id` is the 0-based bone index, `transform` follows the same
        //                  shape rules as `transform` above.
        //   color:         [r,g,b,a] in [0, 1]
        //   morphWeights:  Array | Float32Array of weights, dense across all primitives.
        writeInstance(key, opts = {}) {
            const inst = this.#instances.get(key); if (!inst) return false;
            if ("transform" in opts) {
                inst.transform = Mat4.resolveTransform(opts.transform, inst.transform);
            }
            if ("color" in opts) {
                const c = opts.color;
                inst.color = (Array.isArray(c) || c instanceof Float32Array)
                    ? [c[0] ?? 1, c[1] ?? 1, c[2] ?? 1, c[3] ?? 1]
                    : [1, 1, 1, 1];
            }
            if ("display" in opts) {
                inst.display = !!opts.display;
            }
            if ("boneTransform" in opts && inst.bonePoses) {
                const bts = Array.isArray(opts.boneTransform) ? opts.boneTransform : [opts.boneTransform];
                for (const bt of bts) {
                    if (!bt) continue;
                    const id = bt.id;
                    if (typeof id !== "number" || id < 0 || id >= inst.bonePoses.length) continue;
                    inst.bonePoses[id] = Mat4.resolveTransform(bt.transform, inst.bonePoses[id]);
                }
            }
            if ("morphWeights" in opts && inst.morphWeights) {
                const w = opts.morphWeights;
                let offset = 0, src = w;
                if (isObj(w) && !Array.isArray(w) && !(w instanceof Float32Array)) {
                    offset = w.offset | 0;
                    src    = w.weights;
                }
                if (Array.isArray(src) || src instanceof Float32Array) {
                    const cap = inst.morphWeights.length;
                    const n = Math.min(src.length, cap - offset);
                    for (let i = 0; i < n; i++) inst.morphWeights[offset + i] = +src[i] || 0;
                }
            }
            return true;
        }

        readInstance(key) {
            const inst = this.#instances.get(key); if (!inst) return null;
            return {
                key,
                modelKey:     inst.modelKey,
                transform:    new Float32Array(inst.transform),
                color:        [...inst.color],
                display:      inst.display,
                bonePoses:    inst.bonePoses    ? inst.bonePoses.map(m => new Float32Array(m)) : null,
                morphWeights: inst.morphWeights ? new Float32Array(inst.morphWeights)         : null,
            };
        }


        setCamera(opts = {}) {
            const c = this.#cam;
            if ("position" in opts) c.pos = opts.position;
            if ("fov"      in opts) c.fov  = opts.fov;
            if ("near"     in opts) c.near = opts.near;
            if ("far"      in opts) c.far  = opts.far;

            if ("orientation" in opts) {
                c.orientation = Quat.normalize(opts.orientation);
                // Sync cached Euler from quat so future rotateCamera deltas are correct.
                const e = Quat.toEulerYPR(c.orientation);
                c.pitch = Math.max(-89, Math.min(89, e.pitch));
                c.yaw   = e.yaw;
                c.roll  = e.roll;
            } else if ("yaw" in opts || "pitch" in opts || "roll" in opts) {
                if ("yaw"   in opts) c.yaw   = opts.yaw;
                if ("pitch" in opts) c.pitch = Math.max(-89, Math.min(89, opts.pitch));
                if ("roll"  in opts) c.roll  = opts.roll;
                c.orientation = Quat.fromEulerYPR(c.yaw, c.pitch, c.roll);
            }

            this.#camUpdate();
            return this;
        }

        getCamera() {
            const c = this.#cam;
            return {
                position:    [...c.pos],
                yaw:         c.yaw,
                pitch:       c.pitch,
                roll:        c.roll,
                fov:         c.fov,
                near:        c.near,
                far:         c.far,
                orientation: [...c.orientation],
            };
        }

        rotateCamera(pitchDelta, yawDelta, rollDelta = 0) {
            const c = this.#cam;
            c.pitch = Math.max(-89, Math.min(89, c.pitch + pitchDelta));
            c.yaw  += yawDelta;
            c.roll += rollDelta;
            c.orientation = Quat.fromEulerYPR(c.yaw, c.pitch, c.roll);
            this.#camUpdate();
            return this;
        }

        translateCamera(offset) {
            const p = this.#cam.pos, c = this.#cam;
            c.pos = [p[0]+offset[0], p[1]+offset[1], p[2]+offset[2]];
            this.#view = Mat4.lookAt(c.pos, [c.pos[0]+c.forward[0], c.pos[1]+c.forward[1], c.pos[2]+c.forward[2]], c.up);
            return this;
        }

        resetCameraRoll() {
            const c = this.#cam;
            c.roll = 0;
            c.orientation = Quat.normalize(Quat.fromEulerYPR(c.yaw, c.pitch, 0));
            this.#camUpdate();
            return this;
        }

        getCameraVectors() {
            const c = this.#cam;
            return {
                forward: [...c.forward],
                up:      [...c.up],
                right:   [...c.right],
            };
        }

        #camUpdate() {
            const c = this.#cam;
            c.forward = Quat.rotateVec(c.orientation, [0, 0, -1]);
            c.right   = Quat.rotateVec(c.orientation, [1, 0,  0]);
            c.up      = Quat.rotateVec(c.orientation, [0, 1,  0]);
            this.#view = Mat4.lookAt(c.pos, [c.pos[0]+c.forward[0], c.pos[1]+c.forward[1], c.pos[2]+c.forward[2]], c.up);
            this.#proj = Mat4.perspective(c.fov * Math.PI / 180, this.#canvas.width / this.#canvas.height, c.near, c.far);
        }

        // You can put this in a loop if you want
        render() {
            const gl = this.#gl;
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // Group instances by shader -> model. Skinned and static instances are
            // tracked separately because skinned ones need a per-instance draw
            // (each has its own bone palette uniform).
            // shaderKey -> { static:Map<modelKey,[inst]>, skinned:Map<modelKey,[inst]> }
            const batches = new Map();
            for (const [, inst] of this.#instances) {
                if (!inst.display) continue;
                const model = this.#models.get(inst.modelKey); if (!model) continue;
                const sk = model.shaderKey;
                let entry = batches.get(sk);
                if (!entry) { entry = { static: new Map(), skinned: new Map() }; batches.set(sk, entry); }
                const bucket = model.skeleton ? entry.skinned : entry.static;
                if (!bucket.has(inst.modelKey)) bucket.set(inst.modelKey, []);
                bucket.get(inst.modelKey).push(inst);
            }

            // Two passes: opaque first, transparent later
            this.#drawPass(batches, false);
            gl.depthMask(false);
            this.#drawPass(batches, true);
            gl.depthMask(true);
        }

        #drawPass(batches, transparentPass) {
            const gl = this.#gl;
            for (const [shaderKey, { static: staticBatch, skinned: skinnedBatch }] of batches) {
                const shader = this.#shaders.get(shaderKey); if (!shader) continue;
                if (!!shader.transparent !== transparentPass) continue;

                gl.useProgram(shader.program);
                if (shader.uloc.view)       gl.uniformMatrix4fv(shader.uloc.view,       false, this.#view);
                if (shader.uloc.projection) gl.uniformMatrix4fv(shader.uloc.projection, false, this.#proj);
                this.renderHook(gl, shader.program);

                // -- Static path: instanced batches --
                // Per-instance stream: 16 floats mat4 + 4 floats color = 20 floats.
                for (const [modelKey, instList] of staticBatch) {
                    const model = this.#models.get(modelKey); if (!model) continue;
                    const flat = new Float32Array(instList.length * 20);
                    for (let i = 0; i < instList.length; i++) packInstanceRow(flat, i * 20, instList[i]);
                    gl.bindBuffer(gl.ARRAY_BUFFER, model.instanceVBO);
                    gl.bufferData(gl.ARRAY_BUFFER, flat, gl.DYNAMIC_DRAW);

                    // Morph weight palette: one row per instance (gl_InstanceID).
                    // No-op when the shader doesn't expose morph uniforms.
                    this.#bindMorphWeightTex(model, shader, instList);

                    gl.bindVertexArray(model.vao);
                    this.#applyAttributeDefaults(model);
                    this.#drawPrimitives(model, shader, instList.length);
                    gl.bindVertexArray(null);
                }

                // -- Skinned path: per-instance, each gets its own bone palette upload --
                const oneInstance = new Float32Array(20);
                for (const [modelKey, instList] of skinnedBatch) {
                    const model = this.#models.get(modelKey); if (!model) continue;
                    gl.bindVertexArray(model.vao);
                    this.#applyAttributeDefaults(model);

                    for (const inst of instList) {
                        packInstanceRow(oneInstance, 0, inst);
                        gl.bindBuffer(gl.ARRAY_BUFFER, model.instanceVBO);
                        gl.bufferData(gl.ARRAY_BUFFER, oneInstance, gl.DYNAMIC_DRAW);

                        if (shader.uloc.bonesTex != null) {
                            gl.activeTexture(gl.TEXTURE1);
                            this.#uploadBoneTex(model, inst.bonePoses);
                            gl.uniform1i(shader.uloc.bonesTex, 1);
                        }
                        // Skinned draws are per-instance: weight palette height=1,
                        // gl_InstanceID is always 0 inside the shader.
                        this.#bindMorphWeightTex(model, shader, [inst]);

                        this.#drawPrimitives(model, shader, 1);
                    }
                    gl.bindVertexArray(null);
                }
            }
        }

        #applyAttributeDefaults(model) {
            const gl = this.#gl;
            for (const d of model.defaulted) {
                gl.vertexAttrib4f(d.loc, d.default[0], d.default[1], d.default[2], d.default[3]);
            }
        }

        #drawPrimitives(model, shader, instanceCount) {
            const gl = this.#gl;
            const morph = shader.uloc.morph;
            const hasMorph = morph.count != null;
            for (const prim of model.primitives) {
                const { material } = prim;

                const tex = material.albedo ? this.#textures.get(material.albedo) : null;
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, tex ? tex.glTex : this.#whiteTex);
                if (shader.uloc.albedo != null) gl.uniform1i(shader.uloc.albedo, 0);
                if (shader.uloc.fill   != null) gl.uniform4fv(shader.uloc.fill, material.fill);

                // Per-primitive morph "push constants" + delta texture binds.
                // u_morphCount=0 collapses the shader's morph loop for primitives
                // without morph data, even when the shader supports morphs.
                if (hasMorph) {
                    const m = prim.morph;
                    gl.uniform1i(morph.count,        m ? m.targetCount  : 0);
                    gl.uniform1i(morph.weightOffset, m ? m.weightOffset : 0);
                    gl.uniform1i(morph.vertexBase,   m ? m.vertexBase   : 0);
                    // Iterate the SHADER's declared channels. Each (shader, channel) pair
                    // has its sampler location and texture unit baked in at addShader time.
                    // ch.loc==null means the shader's GLSL didn't actually declare that
                    // sampler -> skip silently (the channel is advertised but unused).
                    for (const ch of morph.channels) {
                        if (ch.loc == null) continue;
                        gl.activeTexture(gl.TEXTURE0 + ch.unit);
                        gl.bindTexture(gl.TEXTURE_2D, (m && m.channels.get(ch.samplerName)) || this.#morphDummyDelta);
                        gl.uniform1i(ch.loc, ch.unit);
                    }
                }

                if (prim.indexOffset != null) {
                    gl.drawElementsInstanced(
                        gl.TRIANGLES, prim.indexCount, model.indexType,
                        prim.indexOffset * model.indexBytes, instanceCount,
                    );
                } else {
                    gl.drawArraysInstanced(
                        gl.TRIANGLES, prim.vertexOffset, prim.vertexCount, instanceCount,
                    );
                }
            }
        }

        // Turn morph weight into a texture
        #bindMorphWeightTex(model, shader, instances) {
            const gl = this.#gl, loc = shader.uloc.morph.weightTex;
            if (loc == null) return;
            gl.activeTexture(gl.TEXTURE0 + _MORPH_WEIGHT_TEX_UNIT);
            if (model.morphTotalWeights <= 0) {
                gl.bindTexture(gl.TEXTURE_2D, this.#morphDummyWeight);
            } else {
                const W = model.morphTotalWeights, H = instances.length;
                const data = new Float32Array(W * H);
                for (let i = 0; i < H; i++) {
                    if (instances[i].morphWeights) data.set(instances[i].morphWeights, i * W);
                }
                model.morphWeightTex = simpleTex(gl, model.morphWeightTex, gl.R32F, gl.RED, gl.FLOAT, W, H, data);
            }
            gl.uniform1i(loc, _MORPH_WEIGHT_TEX_UNIT);
        }

        // Turn skin pose into a texture
        #uploadBoneTex(model, bonePoses) {
            const gl = this.#gl;
            const bones = model.skeleton.bones, n = bones.length;
            const globalCurrent = new Array(n);
            const palette = new Float32Array(n * 16);
            for (let i = 0; i < n; i++) {
                const b = bones[i];
                const local = Mat4.multiply(b.localBind, bonePoses[i]);
                globalCurrent[i] = b.parent < 0 ? local : Mat4.multiply(globalCurrent[b.parent], local);
                palette.set(Mat4.multiply(globalCurrent[i], b.inverseBind), i * 16);
            }
            model.boneTex = simpleTex(gl, model.boneTex, gl.RGBA32F, gl.RGBA, gl.FLOAT, 4, n, palette);
        }


        #addDefaultShader() {
            const attrs = [
                { name: "a_position",   size: 3, default: [0, 0, 0, 1] },
                { name: "a_uv",         size: 2, default: [0, 0, 0, 0] },
                { name: "a_boneID",     size: 4, default: [0, 0, 0, 0] },
                { name: "a_boneWeight", size: 4, default: [0, 0, 0, 0] },
            ];
            for (const s of _DEFAULT_SHADERS) {
                this.#registerShader(s.key, s.vert, s.frag, attrs, s.morphChannels, !!s.transparent);
            }
        }
    }

    window.EzCanvas3D      = EzCanvas3D;
    window.EzMat4          = Mat4;
    window.EzQuat          = Quat;

})();