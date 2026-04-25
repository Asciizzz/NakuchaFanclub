/*
EzCanvas3D
By Asciiz

# WebGL2 object-centric 3D canvas — glTF-style primitives, GPU instancing.

# Constructor:
    new EzCanvas3D(name)        creates <canvas id="ez-canvas3d-<n>">, GL context ready

# Mount:
    getCanvas()                 returns the canvas element
    mountTo(el)                 appends canvas into element
    unmount()                   removes canvas from parent
    resize(w, h)                resize canvas + viewport (rebuilds projection automatically)

# Shaders:
    addShader(key, { vert, frag, attributes:[{name,size},...] })
        -> true | false
        attributes declares the interleaved vertex layout in order.
        Class auto-computes stride + offsets.

    removeShader(key)
    getShaderInfo(key)          -> { key, attributes, stride }
    
# Textures:
    addTexture(key, { data:Uint8Array|ImageBitmap, width, height, channels? })
        -> true | false
        channels defaults to 4 (RGBA). Auto-generates mipmaps.

    removeTexture(key)
    getTextureInfo(key)         -> { key, width, height, channels }

# Models (glTF-style):
    addModel(key, { shader?, vertices:Float32Array, indices:Uint16Array|Uint32Array,
                    attributes?:[{name,size},...],
                    primitives:[{ indexOffset, indexCount, material? }] })
        -> true | false

        shader is optional — if omitted the built-in default shader is used (pure fill/albedo,
        no lighting). The default shader reads a_position(loc 0) and a_uv(loc 1).

        attributes is optional — declares the vertex layout for VAO wiring. Required when using
        the default shader with a vertex buffer that has extra fields (e.g. position+normal+uv).
        When omitted with a user shader, the shader's own declared layout is used.

        Each primitive draws a sub-range of the shared index buffer.
        material is optional per-primitive: { albedo?, fill?:[r,g,b,a] }
            albedo: key of a previously uploaded texture (used as the albedo map)
            fill:   [r,g,b,a] flat color sent as u_fill; if albedo is also set,
                    the shader receives both — blend logic lives in the shader.
        If primitives is omitted, a single primitive covering all indices is assumed.

    removeModel(key)
    getModelInfo(key)->{key, shader,
                        primitives:[{ indexOffset, indexCount, material }],
                        vertexCount, indexCount }

# Instances:
    addInstance(modelKey, transform?)   -> instanceKey  (e.g. "i0")
        transform: mat4 Float32Array, or { position?, rotation?, scale? } or omitted (identity)

    removeInstance(instanceKey)         -> true | false
    setInstanceTransform(instanceKey, transform)
        transform: mat4 Float32Array — raw, used directly
                OR { position?:[x,y,z], rotation?:[x,y,z,w], scale?:[sx,sy,sz] } — quaternion compose
                OR { position?:[x,y,z], euler?:[rx,ry,rz],   scale?:[sx,sy,sz] } — euler ZYX helper → quat
    getInstanceInfo(instanceKey)        -> { key, modelKey, transform:mat4 }

# Camera:
    setCamera({ position?, yaw?, pitch?, fov?, near?, far? })
        All fields optional — only supplied fields are updated.
        Matrices are rebuilt immediately on every setCamera() call.
        yaw/pitch in radians. fov in radians (vertical).
    getCamera()                 -> { position, yaw, pitch, fov, near, far }

# Rendering:
    render()    draw one frame — call this from your own rAF/game loop.
                No internal loop is managed by EzCanvas3D.

# Notes:
    -   Primitives within a model share one VAO / VBO / EBO and the same instance
        transforms — only the index sub-range and material differ per primitive.
    -   Per-instance model matrix is uploaded via a mat4 instance attribute (location 4-7).
        Shaders must declare: layout(location=4) in mat4 a_instanceMatrix;
    -   Built-in material uniforms set automatically before each primitive draw:
            uniform sampler2D u_albedo;     // bound to TEXTURE0 (the albedo texture)
            uniform int       u_useAlbedo;  // 1 if an albedo texture is bound, else 0
            uniform vec4      u_fill;       // fill colour (default vec4(1))
    -   Lighting or other custom uniforms: set via renderHook.
        renderHook(gl, programHandle) is called once per shader batch before any draws.
*/

(function () {

    const isStr = v => typeof v === "string" && v.trim() !== "";
    const isObj = v => v !== null && typeof v === "object";

    const Mat4 = {
        identity() {
            return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        },

        multiply(a, b) {
            const o = new Float32Array(16);
            for (let c = 0; c < 4; c++)
                for (let r = 0; r < 4; r++) {
                    let s = 0;
                    for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
                    o[c*4+r] = s;
                }
            return o;
        },

        perspective(fovY, aspect, near, far) {
            const f = 1.0 / Math.tan(fovY / 2), nf = 1 / (near - far);
            return new Float32Array([
                f/aspect, 0, 0,                0,
                0,        f, 0,                0,
                0,        0, (far+near)*nf,    -1,
                0,        0, (2*far*near)*nf,   0,
            ]);
        },

        fpView(pos, yaw, pitch) {
            const cy = Math.cos(yaw),   sy = Math.sin(yaw);
            const cp = Math.cos(pitch), sp = Math.sin(pitch);
            const fx = sy*cp, fy = -sp, fz = -cy*cp;
            const rl = Math.hypot(cy, sy);
            const rx = cy/rl, ry = 0, rz = sy/rl;
            const ux = ry*fz - rz*fy;
            const uy = rz*fx - rx*fz;
            const uz = rx*fy - ry*fx;
            const [px, py, pz] = pos;
            return new Float32Array([
                rx, ux, -fx, 0,
                ry, uy, -fy, 0,
                rz, uz, -fz, 0,
                -(rx*px+ry*py+rz*pz),
                -(ux*px+uy*py+uz*pz),
                 (fx*px+fy*py+fz*pz),
                1,
            ]);
        },

        compose(pos = [0,0,0], quat = [0,0,0,1], scale = [1,1,1]) {
            const [qx, qy, qz, qw] = quat;
            const [scx, scy, scz]  = scale;
            // Pre-compute repeated products.
            const x2=qx+qx, y2=qy+qy, z2=qz+qz;
            const xx=qx*x2, xy=qx*y2, xz=qx*z2;
            const yy=qy*y2, yz=qy*z2, zz=qz*z2; 
            const wx=qw*x2, wy=qw*y2, wz=qw*z2;
            // Rotation matrix columns (scaled):
            return new Float32Array([
                (1-(yy+zz))*scx,  (xy+wz)*scx,      (xz-wy)*scx,      0,  // col 0
                (xy-wz)*scy,      (1-(xx+zz))*scy,  (yz+wx)*scy,      0,  // col 1
                (xz+wy)*scz,      (yz-wx)*scz,      (1-(xx+yy))*scz,  0,  // col 2
                pos[0], pos[1], pos[2], 1,                                // col 3
            ]);
        },

        resolveTransform(t, existing) {
            if (t instanceof Float32Array && t.length === 16) return t;
            if (!isObj(t)) return existing ?? Mat4.identity();
            const pos   = t.position ?? [existing?.[12]??0, existing?.[13]??0, existing?.[14]??0];
            const scale = t.scale    ?? [1,1,1];
            // Support euler helper: { euler:[rx,ry,rz] } → convert ZYX → quaternion.
            let quat;
            if (t.euler) {
                quat = Quat.fromEulerZYX(t.euler);
            } else {
                quat = t.rotation ?? [0,0,0,1];
            }
            return Mat4.compose(pos, quat, scale);
        },
    };

    const Quat = {
        identity() { return [0, 0, 0, 1]; },

        multiply(a, b) {
            const [ax,ay,az,aw] = a, [bx,by,bz,bw] = b;
            return [
                aw*bx + ax*bw + ay*bz - az*by,
                aw*by - ax*bz + ay*bw + az*bx,
                aw*bz + ax*by - ay*bx + az*bw,
                aw*bw - ax*bx - ay*by - az*bz,
            ];
        },

        normalize(q) {
            const [x,y,z,w] = q;
            const len = Math.hypot(x,y,z,w) || 1;
            return [x/len, y/len, z/len, w/len];
        },

        fromAxisAngle(axis, angle) {
            const len = Math.hypot(...axis) || 1;
            const [ax,ay,az] = axis.map(v => v/len);
            const s = Math.sin(angle / 2);
            return [ax*s, ay*s, az*s, Math.cos(angle / 2)];
        },

        fromEulerZYX([ex, ey, ez]) {
            const hx = ex*0.5, hy = ey*0.5, hz = ez*0.5;
            const cx = Math.cos(hx), sx = Math.sin(hx);
            const cy = Math.cos(hy), sy = Math.sin(hy);
            const cz = Math.cos(hz), sz = Math.sin(hz);
            return [
                sx*cy*cz - cx*sy*sz,
                cx*sy*cz + sx*cy*sz,
                cx*cy*sz - sx*sy*cz,
                cx*cy*cz + sx*sy*sz,
            ];
        },

        slerp(a, b, t) {
            let [ax,ay,az,aw] = a;
            let [bx,by,bz,bw] = b;
            let dot = ax*bx + ay*by + az*bz + aw*bw;

            // Choose shortest path.
            if (dot < 0) { bx=-bx; by=-by; bz=-bz; bw=-bw; dot=-dot; }
            if (dot > 0.9995) {
                // Linear fallback for nearly identical quaternions.
                return Quat.normalize([ax+t*(bx-ax), ay+t*(by-ay), az+t*(bz-az), aw+t*(bw-aw)]);
            }

            const theta0 = Math.acos(dot);
            const theta  = theta0 * t;
            const s0 = Math.cos(theta) - dot * Math.sin(theta) / Math.sin(theta0);
            const s1 = Math.sin(theta) / Math.sin(theta0);
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


    // Default shader
    // Pure flat colour with no lighting at all
    // Supports the same built-in uniforms as user shaders so the engine's
    // material pipeline works identically (u_fill, u_useAlbedo, u_albedo,
    // u_view, u_projection).  Instance matrix at locations 4-7

    const _DEFAULT_SHADER_KEY = "__ez_default__";

    const _DEFAULT_VERT = `#version 300 es
        layout(location=0) in vec3 a_position;
        layout(location=1) in vec2 a_uv;
        layout(location=4) in mat4 a_instanceMatrix;
        uniform mat4 u_view;
        uniform mat4 u_projection;
        out vec2 v_uv;
        void main() {
            v_uv = a_uv;
            gl_Position = u_projection * u_view * a_instanceMatrix * vec4(a_position, 1.0);
        }`;

    const _DEFAULT_FRAG = `#version 300 es
        precision mediump float;
        in  vec2 v_uv;
        out vec4 fragColor;
        uniform vec4      u_fill;
        uniform int       u_useAlbedo;
        uniform sampler2D u_albedo;
        void main() {
            fragColor = (u_useAlbedo == 1) ? texture(u_albedo, v_uv) : u_fill;
        }`;

    // Main class

    class EzCanvas3D {

        #canvas = null;
        #gl     = null;

        // Storage maps
        #shaders   = new Map(); // key -> { program, attributes, stride, locs, uloc }
        #textures  = new Map(); // key -> { glTex, width, height, channels }
        #models    = new Map(); // key -> { shaderKey, vao, vbo, ebo, instanceVBO,
                                //          indexType, primitives, _info }
        #instances = new Map(); // instanceKey -> { modelKey, transform:mat4 }

        #instanceCounter = 0;

        #cam = {
            position: [0, 0, 3],
            yaw:      0,
            pitch:    0,
            fov:      Math.PI / 4,
            near:     0.1,
            far:      1000,
        };
        #proj = null;
        #view = null;

        // Override to set custom uniforms once per shader batch before draws.
        renderHook = (gl, program) => {};


        constructor(name) {
            if (!isStr(name)) throw new Error("EzCanvas3D: name required");
            const c = document.createElement("canvas");
            c.id     = `ez-canvas3d-${name}`;
            c.width  = 800;
            c.height = 600;
            this.#canvas = c;

            const gl = c.getContext("webgl2");
            if (!gl) throw new Error("EzCanvas3D: WebGL2 not supported");
            this.#gl = gl;

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.clearColor(0, 0, 0, 1);

            this.#addDefaultShader();
            this.#rebuildMatrices();
        }

        /* mount */

        getCanvas() { return this.#canvas; }
        mount(el)   { if (el instanceof Element) el.appendChild(this.#canvas); return this; }
        unmount()   { this.#canvas.parentElement?.removeChild(this.#canvas);   return this; }

        resize(w, h) {
            this.#canvas.width  = w;
            this.#canvas.height = h;
            this.#gl.viewport(0, 0, w, h);
            this.#rebuildMatrices(); // aspect ratio changed
            return this;
        }

        /* shaders */

        addShader(key, { vert, frag, attributes }) {
            if (!isStr(key) || !isStr(vert) || !isStr(frag) || !Array.isArray(attributes)) return false;
            if (key === _DEFAULT_SHADER_KEY) {
                console.warn("[EzCanvas3D] addShader: key is reserved");
                return false;
            }
            const gl = this.#gl;

            const program = createProgram(gl, vert, frag);
            if (!program) return false;

            // Compute stride + per-attribute byte offsets.
            // All vertex attributes are assumed to be gl.FLOAT.
            let offset = 0;
            const attrs = attributes.map(a => {
                const entry = { name: a.name, size: a.size, offset };
                offset += a.size * 4; // 4 bytes per float
                return entry;
            });
            const stride = offset;

            // Cache attribute locations.
            const locs = {};
            for (const a of attrs) locs[a.name] = gl.getAttribLocation(program, a.name);

            // Built-in uniform locations — non-fatal if absent in a shader.
            const uloc = {
                view:       gl.getUniformLocation(program, "u_view"),
                projection: gl.getUniformLocation(program, "u_projection"),
                albedo:     gl.getUniformLocation(program, "u_albedo"),
                useAlbedo:  gl.getUniformLocation(program, "u_useAlbedo"),
                fill:       gl.getUniformLocation(program, "u_fill"),
            };

            this.#shaders.set(key, { program, attributes: attrs, stride, locs, uloc });
            return true;
        }

        removeShader(key) {
            if (key === _DEFAULT_SHADER_KEY) {
                console.warn("[EzCanvas3D] removeShader: default shader cannot be removed");
                return false;
            }
            const s = this.#shaders.get(key); if (!s) return false;
            this.#gl.deleteProgram(s.program);
            this.#shaders.delete(key);
            return true;
        }

        getShaderInfo(key) {
            const s = this.#shaders.get(key); if (!s) return null;
            return { key, attributes: s.attributes.map(a => ({ name: a.name, size: a.size })), stride: s.stride };
        }

        /* textures */

        addTexture(key, { data, width, height, channels = 4 }) {
            if (!isStr(key) || !data || !width || !height) return false;
            const gl = this.#gl;

            const [internalFmt, fmt] = glFormat(gl, channels);
            const glTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, glTex);

            if (data instanceof ImageBitmap) {
                gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, fmt, gl.UNSIGNED_BYTE, data);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, width, height, 0, fmt, gl.UNSIGNED_BYTE, data);
            }

            if (isPOT(width) && isPOT(height)) {
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            }
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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

        getTextureInfo(key) {
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


        // primitives:  [{ indexOffset, indexCount, material? }]
        // material:    { albedo?: key, fill?: [r,g,b,a] }
        // attributes:  optional [{name, size}] vertex layout override — required when using the
        //   default shader with a non-standard layout (e.g. position+normal+uv).
        //   When omitted with a user shader, the shader's own declared layout is used.
        addModel(key, { shader: shaderKey, vertices, indices, primitives, attributes: layoutOverride }) {
            if (!isStr(key) || !vertices || !indices) return false;

            // Fall back to the built-in default shader when none is specified.
            shaderKey = isStr(shaderKey) ? shaderKey : _DEFAULT_SHADER_KEY;

            const shader = this.#shaders.get(shaderKey);
            if (!shader) {
                console.warn(`[EzCanvas3D] addModel: shader "${shaderKey}" not found`);
                return false;
            }

            const gl = this.#gl;
            const indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
            // Byte size of one index element — needed for the byte-offset in drawElementsInstanced.
            const indexBytes = indices instanceof Uint32Array ? 4 : 2;

            // Normalise primitive list — default to one covering entire index buffer.
            const primList = Array.isArray(primitives) && primitives.length > 0
                ? primitives.map(p => ({
                    indexOffset: p.indexOffset ?? 0,
                    indexCount:  p.indexCount  ?? indices.length,
                    material: {
                        albedo: p.material?.albedo ?? null,
                        fill:   p.material?.fill   ?? [1, 1, 1, 1],
                    },
                }))
                : [{ indexOffset: 0, indexCount: indices.length, material: { albedo: null, fill: [1,1,1,1] } }];

            // Validate index ranges in dev builds.
            for (const p of primList) {
                if (p.indexOffset < 0 || p.indexOffset + p.indexCount > indices.length) {
                    console.warn(`[EzCanvas3D] addModel "${key}": primitive index range out of bounds`);
                    return false;
                }
            }

            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);

            // Resolve the attribute layout used to wire this VAO.
            // Priority: explicit layoutOverride on the model > shader's own declared layout.
            // An override is necessary when using the default shader with a vertex buffer
            // that has a different layout (e.g. position+normal+uv vs the default's position+uv).
            let vaoAttrs = shader.attributes; // default: use shader's own layout
            if (Array.isArray(layoutOverride) && layoutOverride.length > 0) {
                let offset = 0;
                vaoAttrs = layoutOverride.map(a => {
                    const entry = { name: a.name, size: a.size, offset };
                    offset += a.size * 4;
                    return entry;
                });
            }
            const vaoStride = vaoAttrs.reduce((s, a) => s + a.size * 4, 0);

            // VBO
            const vbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

            // Wire vertex attributes from the resolved layout.
            for (const a of vaoAttrs) {
                const loc = gl.getAttribLocation(shader.program, a.name);
                if (loc < 0) continue;
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, vaoStride, a.offset);
                gl.vertexAttribDivisor(loc, 0); // per-vertex
            }

            // EBO
            const ebo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

            // Instance VBO (mat4 per instance, locations 4-7)
            // mat4 = 4 × vec4; each vec4 occupies one attribute slot.
            const instanceVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);

            const INST_LOC = 4;
            for (let col = 0; col < 4; col++) {
                const loc = INST_LOC + col;
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, col * 16);
                gl.vertexAttribDivisor(loc, 1); // per-instance
            }

            gl.bindVertexArray(null);

            this.#models.set(key, {
                shaderKey,
                vao, vbo, ebo, instanceVBO,
                indexType, indexBytes,
                primitives: primList,
                _info: {
                    vertexCount: Math.floor(vertices.length / shader.stride * 4),
                    indexCount:  indices.length,
                },
            });
            return true;
        }

        removeModel(key) {
            const m = this.#models.get(key); if (!m) return false;
            const gl = this.#gl;
            gl.deleteVertexArray(m.vao);
            gl.deleteBuffer(m.vbo);
            gl.deleteBuffer(m.ebo);
            gl.deleteBuffer(m.instanceVBO);
            this.#models.delete(key);
            // Remove orphaned instances.
            for (const [ik, inst] of this.#instances)
                if (inst.modelKey === key) this.#instances.delete(ik);
            return true;
        }

        getModelInfo(key) {
            const m = this.#models.get(key); if (!m) return null;
            return {
                key,
                shader: m.shaderKey,
                primitives: m.primitives.map(p => ({
                    indexOffset: p.indexOffset,
                    indexCount:  p.indexCount,
                    material: {
                        albedo: p.material.albedo,
                        fill:   [...p.material.fill],
                    },
                })),
                ...m._info,
            };
        }


        addInstance(modelKey, transform = null) {
            if (!this.#models.has(modelKey)) {
                console.warn(`[EzCanvas3D] addInstance: model "${modelKey}" not found`);
                return null;
            }
            const key = `i${this.#instanceCounter++}`;
            this.#instances.set(key, { modelKey, transform: Mat4.resolveTransform(transform, null) });
            return key;
        }

        removeInstance(key) {
            return this.#instances.delete(key);
        }

        setInstanceTransform(key, transform) {
            const inst = this.#instances.get(key); if (!inst) return false;
            inst.transform = Mat4.resolveTransform(transform, inst.transform);
            return true;
        }

        getInstanceInfo(key) {
            const inst = this.#instances.get(key); if (!inst) return null;
            return { key, modelKey: inst.modelKey, transform: new Float32Array(inst.transform) };
        }


        setCamera(opts = {}) {
            if ("position" in opts) this.#cam.position = opts.position;
            if ("yaw"      in opts) this.#cam.yaw      = opts.yaw;
            if ("pitch"    in opts) this.#cam.pitch     = opts.pitch;
            if ("fov"      in opts) this.#cam.fov       = opts.fov;
            if ("near"     in opts) this.#cam.near      = opts.near;
            if ("far"      in opts) this.#cam.far       = opts.far;
            this.#rebuildMatrices();
            return this;
        }

        getCamera() { return { ...this.#cam, position: [...this.#cam.position] }; }

        // Draw one frame. Call this from your own requestAnimationFrame loop.
        render() {
            const gl = this.#gl;
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // Group instances by shader → model
            // shaderKey -> modelKey -> [mat4, ...]
            const batches = new Map();
            for (const [, inst] of this.#instances) {
                const model = this.#models.get(inst.modelKey); if (!model) continue;
                const sk = model.shaderKey;
                if (!batches.has(sk)) batches.set(sk, new Map());
                const mb = batches.get(sk);
                if (!mb.has(inst.modelKey)) mb.set(inst.modelKey, []);
                mb.get(inst.modelKey).push(inst.transform);
            }

            // Draw each shader batch
            for (const [shaderKey, modelBatch] of batches) {
                const shader = this.#shaders.get(shaderKey); if (!shader) continue;
                gl.useProgram(shader.program);

                // Upload camera matrices (uniform locations may be null if unused — that's fine).
                if (shader.uloc.view)       gl.uniformMatrix4fv(shader.uloc.view,       false, this.#view);
                if (shader.uloc.projection) gl.uniformMatrix4fv(shader.uloc.projection, false, this.#proj);

                // Caller hook: lighting, fog, custom uniforms, etc.
                this.renderHook(gl, shader.program);

                // Draw each model in this shader batch
                for (const [modelKey, transforms] of modelBatch) {
                    const model = this.#models.get(modelKey); if (!model) continue;

                    // Upload all instance transforms in one buffer upload.
                    const flat = new Float32Array(transforms.length * 16);
                    transforms.forEach((m, i) => flat.set(m, i * 16));
                    gl.bindBuffer(gl.ARRAY_BUFFER, model.instanceVBO);
                    gl.bufferData(gl.ARRAY_BUFFER, flat, gl.DYNAMIC_DRAW);

                    gl.bindVertexArray(model.vao);

                    // Draw each primitive (index sub-range + material)
                    for (const prim of model.primitives) {
                        const { indexOffset, indexCount, material } = prim;

                        // Bind albedo texture or signal "no albedo".
                        if (material.albedo) {
                            const tex = this.#textures.get(material.albedo);
                            if (tex) {
                                gl.activeTexture(gl.TEXTURE0);
                                gl.bindTexture(gl.TEXTURE_2D, tex.glTex);
                                if (shader.uloc.albedo    != null) gl.uniform1i(shader.uloc.albedo,    0);
                                if (shader.uloc.useAlbedo != null) gl.uniform1i(shader.uloc.useAlbedo, 1);
                            } else {
                                if (shader.uloc.useAlbedo != null) gl.uniform1i(shader.uloc.useAlbedo, 0);
                            }
                        } else {
                            if (shader.uloc.useAlbedo != null) gl.uniform1i(shader.uloc.useAlbedo, 0);
                        }

                        // Upload fill colour (always set so shaders can rely on it).
                        if (shader.uloc.fill != null) gl.uniform4fv(shader.uloc.fill, material.fill);

                        // indexOffset is in elements; convert to byte offset for the GL call.
                        const byteOffset = indexOffset * model.indexBytes;
                        gl.drawElementsInstanced(
                            gl.TRIANGLES,
                            indexCount,
                            model.indexType,
                            byteOffset,
                            transforms.length,
                        );
                    }

                    gl.bindVertexArray(null);
                }
            }
        }


        #addDefaultShader() {
            const gl = this.#gl;
            const program = createProgram(gl, _DEFAULT_VERT, _DEFAULT_FRAG);
            if (!program) {
                console.error("[EzCanvas3D] failed to compile default shader");
                return;
            }
            // Default layout: position(3) + uv(2).  Normal is intentionally absent
            const attrs = [
                { name: "a_position", size: 3, offset: 0  },
                { name: "a_uv",       size: 2, offset: 12 },
            ];
            const stride = 20; // (3+2)*4 bytes
            const locs = {};
            for (const a of attrs) locs[a.name] = gl.getAttribLocation(program, a.name);
            const uloc = {
                view:       gl.getUniformLocation(program, "u_view"),
                projection: gl.getUniformLocation(program, "u_projection"),
                albedo:     gl.getUniformLocation(program, "u_albedo"),
                useAlbedo:  gl.getUniformLocation(program, "u_useAlbedo"),
                fill:       gl.getUniformLocation(program, "u_fill"),
            };
            this.#shaders.set(_DEFAULT_SHADER_KEY, { program, attributes: attrs, stride, locs, uloc });
        }

        #rebuildMatrices() {
            const { fov, near, far, position, yaw, pitch } = this.#cam;
            this.#proj = Mat4.perspective(fov, this.#canvas.width / this.#canvas.height, near, far);
            this.#view = Mat4.fpView(position, yaw, pitch);
        }
    }

    window.EzCanvas3D      = EzCanvas3D;
    window.EzMat4          = Mat4;
    window.EzQuat          = Quat;

})();