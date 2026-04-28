/*
EzCanvas3D
By Asciiz

EzCanvas3D      new EzCanvas3D(name)
                .settings.width()/.height()/.fitContainer()
                getCanvas() / mount(el) / unmount() / resize(w,h) / readCanvas()

Shaders         addShader(key, { vertex, fragment, uniKeys?, onbind(gl,program)?, renderCfg? })
                renderCfg: { rQueue?, depthWrite?, depthTest?, blend?, blendSrc?, blendDst?, doubleSided? }
                    rQueue:     draw order, lower = earlier. Default 1000 (opaque). Transparent = 2000.
                    depthWrite: gl.depthMask.  Default true.
                    depthTest:  gl.DEPTH_TEST. Default true.
                    blend:      gl.BLEND.      Default false.
                    blendSrc/blendDst: gl blend factors. Default SRC_ALPHA / ONE_MINUS_SRC_ALPHA.
                    doubleSided: disables CULL_FACE. Default false.
                removeShader(key) / readShader(key)
                vertex / fragment are templated - you write only main() bodies; the engine
                emits #version, precision, attribute layouts, uniforms, varyings, and
                helper functions automatically.

                vertex.attributes:      [{ name, size:1..4, default?:[r,g,b,a] }, ...]
                vertex.instanceData:    [{ name, type?, default? }, ...]
                                        type one of "mat4"|"vec4"|"vec3"|"vec2"|"float"
                                        (default "vec4"). mat4 occupies 4 attribute slots;
                                        others 1. Empty array = no per-instance VBO data
                                        (shader is still drawn N times via gl_InstanceID).
                                        name doubles as the data key in writeInstance / readInstance.
                vertex.defaultKeys:     { view?, projection? }
                                        Optional known uniforms. When present, engine emits the
                                        uniform and binds the camera matrices automatically.
                                        e.g. { view: "u_view", projection: "u_proj" }
                vertex.hasSkeleton:     bool. Engine injects ez_bonesTex sampler and
                                        fetchBone(i)/computeSkin(id,weight) helpers. The shader
                                        author still declares a_boneID/a_boneWeight attributes
                                        and calls computeSkin() in main.
                vertex.morphChannels:   string[]. Channel names (e.g. ["position","normal"]).
                                        Engine injects all ez_morph* uniforms and helpers.
                                        Use applyMorph(channelIdx, vertexLocal) in main.
                                        morphVertexLocal() returns gl_VertexID - ez_morphVertexBase.
                vertex.outputs:         [{ name, type? }, ...]
                vertex.main:            GLSL body only.

                fragment.defaultKeys:   { fill?, albedo? }
                                        fill   -> uniform vec4, bound per-primitive.
                                        albedo -> uniform sampler2D, bound per-primitive (unit 0).
                fragment.outputColor:   out name. default "fragColor".
                fragment.main:          GLSL body only.

                uniKeys:                [{ name, type }, ...]  (shared, emitted to both stages)
                                        Free uniforms of any GLSL type. Sampler types are
                                        auto-assigned texture units after internal ones.
                                        renderHook receives texUnits map { name -> unit } so you
                                        can bind the right textures.
                                        Supported types: mat4, mat3, vec4, vec3, vec2, float, int,
                                        bool, sampler2D, "highp sampler2D".

                Built-ins: __ez_opaque_default__ and __ez_transparent_default__. Both declare
                instanceData [{ name:"a_instanceMatrix", type:"mat4" }, { name:"a_instanceColor", type:"vec4", default:[1,1,1,1] }].

Internal ez_ uniforms (injected automatically, invisible to shader authors):
                ez_bonesTex           - bone palette (hasSkeleton)
                ez_morphWeightTex     - per-instance morph weights (morphChannels)
                ez_morphCount         - target count for current primitive
                ez_morphWeightOffset  - weight offset into ez_morphWeightTex
                ez_morphVertexBase    - vertex ID offset for current primitive
                ez_morphDelta_N       - delta texture for channel N

Textures        addTexture(key, { data, width, height, channels?, filter? })
                filter: "linear" (default, mipmaps when POT) | "nearest" (crisp).
                removeTexture(key) / readTexture(key)

Models          addModel(key, { defaultShader?, vertices, indices, attributes?, primitives?, skeleton? })
                attributes: subset of the shader's attributes that appear in the VBO, in
                            packing order. Default [{name:"a_position",size:3},{name:"a_uv",size:2}].
                            Missing shader attributes fall back to their per-attribute default
                            (vertexAttrib4f at draw).
                primitives: [{ indexOffset?, indexCount?, vertexOffset?, vertexCount?,
                                material?, morphTargets? }, ...]
                            Indexed (indexOffset+indexCount) and non-indexed (vertexOffset+
                            vertexCount, drawArraysInstanced) modes are mutually exclusive.
                            material: { albedo?, fill?:[r,g,b,a] }
                            morphTargets: { <channelName>: [Float32Array(vertexCount*3), ...] }
                                          Keys must match shader's vertex.morphChannels.
                skeleton:   { bones: [{ parent, localBind?, inverseBind? }, ...] }
                            parent: -1 root else < own index. localBind: mat4 OR transform-shape.
                            inverseBind auto-computed if omitted.
                readModel(key) / removeModel(key)

Instances       addInstance(modelKey, init?) -> instKey
                    init.shader: optional shader key override (must have compatible instanceData layout)
                writeInstance(key, { data?, bone?, morph?, display?, shader? })
                    data:    object keyed by the shader's instanceData entry names. Value shape
                            depends on the entry's type:
                            mat4  - Float32Array(16) OR {position?,rotation?,scale?,euler?}
                            vec*  - array/Float32Array of matching length
                            float - number
                            Keys not declared in the shader are ignored.
                    bone:    { id, transform } OR array of those (hasSkeleton models only).
                    morph:   dense [w0,w1,...] OR { offset, weights:[...] } slice. Weight count =
                            sum(prim.morphTargets[channel].length) across all primitives.
                    display: false skips the instance during render(). Default true.
                readInstance(key) / removeInstance(key)

Camera          setCamera({ position?, yaw?, pitch?, roll?, orientation?, fov?, near?, far? })
                getCamera() / getCameraVectors() -> {forward,up,right}
                rotateCamera(pitchDelta, yawDelta, rollDelta?)   degrees, pitch clamped ±89
                translateCamera([dx,dy,dz]) / resetCameraRoll()

Render          render() - call from your rAF loop.
                pick(x, y) - GPU colour-pick at canvas-local coordinates (e.offsetX, e.offsetY).
                             Returns { instanceKey, modelKey, shaderKey } or null.

Bone storage    Bone palette uploaded per skinned instance as RGBA32F, 4 texels wide, N bones tall.
                Always bound to texture unit 1 when hasSkeleton is active.
*/

(function () {

    class _c {
        static warn(TAG, ...a) {
            console.warn(TAG, ...a);
            return false;
        }

        static err(TAG, ...a) {
            console.error(TAG, ...a)
        }
    }

    class _is {
        static str = v => typeof v === "string" && v.trim() !== "";
        static obj = v => typeof v === "object" && v !== null;

        // is Power of two?
        static POT = n => n > 0 && (n & (n - 1)) === 0;

        static sampler = t => t === "sampler2D" || t === "highp sampler2D"
    }

    class _math {
        static clamp = (p, min, max) => Math.max(min, Math.min(max, p));

        static Mat4 = {
            identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },

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
                if (!det) return _math.Mat4.identity();
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
                if (!_is.obj(t)) return existing ?? _math.Mat4.identity();
                const pos   = t.position ?? [existing?.[12]??0, existing?.[13]??0, existing?.[14]??0];
                const scale = t.scale ?? [1,1,1];
                const quat  = t.euler ? _math.Quat.fromEulerZYX(t.euler) : (t.rotation ?? [0,0,0,1]);
                return _math.Mat4.compose(pos, quat, scale);
            }
        };

        static Quat = {
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

            fromEulerYPR(yawDeg, pitchDeg, rollDeg) {
                const d2r = Math.PI / 180;
                const qY = _math.Quat.fromAxisAngle([0, 1, 0],  yawDeg   * d2r);
                const qP = _math.Quat.fromAxisAngle([1, 0, 0],  pitchDeg * d2r);
                const q  = _math.Quat.normalize(_math.Quat.multiply(qY, qP));
                if (!rollDeg) return q;
                return _math.Quat.normalize(_math.Quat.multiply(q, _math.Quat.fromAxisAngle([0, 0, -1], rollDeg * d2r)));
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
                if (dot > 0.9995) return _math.Quat.normalize([ax+t*(bx-ax), ay+t*(by-ay), az+t*(bz-az), aw+t*(bw-aw)]);
                const th0 = Math.acos(dot), th = th0*t;
                const s0 = Math.cos(th) - dot*Math.sin(th)/Math.sin(th0), s1 = Math.sin(th)/Math.sin(th0);
                return [s0*ax+s1*bx, s0*ay+s1*by, s0*az+s1*bz, s0*aw+s1*bw];
            },
        };
    }

    const TAGWGL = "[EzWebGL]";
    class EzWebGL {
        // Texture

        static createTexture(gl, {
            data, width = 1, height = 1,

            format = gl.RGBA,
            internalFormat = format,
            type = gl.UNSIGNED_BYTE,

            wrapS = gl.CLAMP_TO_EDGE,
            wrapT = gl.CLAMP_TO_EDGE,

            minFilter = gl.LINEAR,
            magFilter = gl.LINEAR,

            mipmap = false,
            flipY = false,
            premultiplyAlpha = false
        }) {

            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);

            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha);

            const isImageSrc = data instanceof ImageBitmap || data instanceof HTMLImageElement || data instanceof HTMLCanvasElement;
            if (isImageSrc) gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, format, type, data);
            else gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

            const canUseMipmaps = mipmap && _is.POT(width) && _is.POT(height);
            if (canUseMipmaps) {
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
            }

            gl.bindTexture(gl.TEXTURE_2D, null);

            return tex;
        }

        // Other

        static wireAttr(gl, {
            buffer, loc, size,
            type = gl.FLOAT,
            normalized = false,
            stride = 0, offset = 0,
            divisor = 0, enabled = true
        }) {
            if (loc === null || loc === -1 || loc === undefined) return;

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            if (enabled) gl.enableVertexAttribArray(loc);

            gl.vertexAttribPointer(loc, size, type, normalized, stride, offset);
            if (divisor !== 0) gl.vertexAttribDivisor(loc, divisor); // WebGL1 need to be aware
        }

        static drawInstanced(gl, { instanceVBO, instanceData, instanceCount, draw }) {
            if (instanceData) {
                gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
                gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);
            }

            if (draw.indexed) {
                gl.drawElementsInstanced(gl.TRIANGLES, draw.count, draw.indexType, draw.indexOffset, instanceCount);
            } else {
                gl.drawArraysInstanced(gl.TRIANGLES, draw.vertexOffset, draw.vertexCount, instanceCount);
            }
        }
    }

    class EzShader {
        program   = null;
        renderCfg = null;
        onbind    = null; // (gl, program) => void
        other     = {};   // free bag for metadata / subclass use

        #compiled = false;
        get isCompiled() { return this.#compiled; }

        static BLEND = {
            ZERO:                     0,
            ONE:                      1,
            SRC_ALPHA:                0x0302,
            ONE_MINUS_SRC_ALPHA:      0x0303,
            DST_ALPHA:                0x0304,
            ONE_MINUS_DST_ALPHA:      0x0305,
            SRC_COLOR:                0x0300,
            ONE_MINUS_SRC_COLOR:      0x0301,
            DST_COLOR:                0x0306,
            ONE_MINUS_DST_COLOR:      0x0307,
            CONSTANT_COLOR:           0x8001,
            ONE_MINUS_CONSTANT_COLOR: 0x8002,
            CONSTANT_ALPHA:           0x8003,
            ONE_MINUS_CONSTANT_ALPHA: 0x8004,
            SRC_ALPHA_SATURATE:       0x0308,
        };

        compile(vertSrc, fragSrc, gl) {
            this.program = EzShader.createProgram(gl, vertSrc, fragSrc);
            if (!this.program) throw new Error("[EzShader] GL program compilation failed");
            this.#compiled = true;
            return this;
        }

        bind(gl) {
            gl.useProgram(this.program);
            if (this.onbind) this.onbind(gl, this.program);
        }

        applyRenderState(gl) {
            const rc = this.renderCfg;
            if (!rc) return;
            gl.depthMask(rc.depthWrite);
            rc.depthTest   ? gl.enable(gl.DEPTH_TEST)  : gl.disable(gl.DEPTH_TEST);
            rc.blend       ? gl.enable(gl.BLEND)       : gl.disable(gl.BLEND);
            rc.doubleSided ? gl.disable(gl.CULL_FACE)  : gl.enable(gl.CULL_FACE);
            if (rc.blend) gl.blendFunc(rc.blendSrc, rc.blendDst);
        }

        static compileShader(gl, type, src) {
            const shader = gl.createShader(type);

            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                _c.err(TAGWGL, "shader compile error:", gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        static createProgram(gl, vertSrc, fragSrc) {
            const vshader = this.compileShader(gl, gl.VERTEX_SHADER,   vertSrc);
            const fshader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

            if (!vshader || !fshader) return null;

            const program = gl.createProgram();
            gl.attachShader(program, vshader);
            gl.attachShader(program, fshader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                _c.err(TAGWGL, "program link error:", gl.getProgramInfoLog(program));
                return null;
            }

            gl.deleteShader(vshader);
            gl.deleteShader(fshader);
            return program;
        }
    }

    class EzShader3D extends EzShader {
        attributes     = [];   // [{ name, size, loc, default }]
        uloc           = {};   // { view, projection, fill, albedo, bonesTex, morph:{...} }
        instanceLayout = null; // { strideFloats, entries:[{ name, type, floats, slots, loc, default }] }
        uniKeyTexUnits = [];   // [[name, unit], ...] for sampler uniKeys
        texUnits       = {};   // { [name]: unit }
        _morphChannels = [];   // morph channel names

        #descript = null;
        #compiled3d = false;

        get isDescribed() { return this.#descript !== null; }
        get isCompiled()  { return this.#compiled3d; }

        static EZ = {
            BONES_TEX: "ez_bonesTex",
            MORPH: {
                WTEX:    "ez_morphWeightTex",
                COUNT:   "ez_morphCount",
                WOFFSET: "ez_morphWeightOffset",
                VBASE:   "ez_morphVertexBase",
                DELTA:   (i) => `ez_morphDelta_${i}`,
            }
        };

        static #GLSL_VEC = { 1: "float", 2: "vec2", 3: "vec3", 4: "vec4" };

        static #DEFAULT_KEY_VERT = {
            view:       n => `uniform mat4 ${n};`,
            projection: n => `uniform mat4 ${n};`,
        };
        static #DEFAULT_KEY_FRAG = {
            fill:   n => `uniform vec4 ${n};`,
            albedo: n => `uniform sampler2D ${n};`,
        };

        static #INSTANCE_TYPE_SPEC = {
            float: { glsl: "float", floats: 1,  slots: 1 },
            vec2:  { glsl: "vec2",  floats: 2,  slots: 1 },
            vec3:  { glsl: "vec3",  floats: 3,  slots: 1 },
            vec4:  { glsl: "vec4",  floats: 4,  slots: 1 },
            mat4:  { glsl: "mat4",  floats: 16, slots: 4 },
        };

        static #buildInstanceLayout(decls) {
            const entries = [], seenNames = new Set();
            let nextSlot = 0, off = 0;
            for (const d of decls) {
                if (!_is.str(d.name))
                    throw new Error(`${TAGC3D} instanceData entry needs name`);
                if (seenNames.has(d.name))
                    throw new Error(`${TAGC3D} instanceData duplicate name "${d.name}"`);
                const type = d.type ?? "vec4";
                const spec = EzShader3D.#INSTANCE_TYPE_SPEC[type];
                if (!spec) throw new Error(`${TAGC3D} instanceData "${d.name}": unknown type "${type}"`);
                seenNames.add(d.name);

                let def;
                if (d.default != null) {
                    if (!d.default.length || d.default.length !== spec.floats)
                        throw new Error(`${TAGC3D} instanceData "${d.name}": default length must be ${spec.floats}`);
                    def = Float32Array.from(d.default);
                } else def = type === "mat4" ? _math.Mat4.identity() : new Float32Array(spec.floats);

                entries.push({
                    name: d.name, type, glsl: spec.glsl,
                    floats: spec.floats, slots: spec.slots,
                    locOffset: nextSlot, byteOffset: off, default: def,
                });
                nextSlot += spec.slots;
                off      += spec.floats * 4;
            }
            return { entries, strideBytes: off, strideFloats: off / 4, slotCount: nextSlot };
        }

        static #buildVertexHelpers(hasSkeleton, morphChannels) {
            const EZ  = EzShader3D.EZ;
            const out = [];
            if (hasSkeleton) {
                out.push(
                `mat4 fetchBone(int i) {
                    return mat4(
                        texelFetch(${EZ.BONES_TEX}, ivec2(0, i), 0),
                        texelFetch(${EZ.BONES_TEX}, ivec2(1, i), 0),
                        texelFetch(${EZ.BONES_TEX}, ivec2(2, i), 0),
                        texelFetch(${EZ.BONES_TEX}, ivec2(3, i), 0)
                    );
                }
                mat4 computeSkin(vec4 boneID, vec4 boneWeight) {
                    float wsum = boneWeight.x + boneWeight.y + boneWeight.z + boneWeight.w;
                    if (wsum < 0.0001) return mat4(1.0);
                    return boneWeight.x * fetchBone(int(boneID.x))
                        + boneWeight.y * fetchBone(int(boneID.y))
                        + boneWeight.z * fetchBone(int(boneID.z))
                        + boneWeight.w * fetchBone(int(boneID.w));
                }`);
            }
            if (morphChannels.length > 0) {
                const fetchLines = morphChannels.map((_, i) => {
                    const pre = i === 0 ? "        if" : "        else if";
                    return `${pre} (channelIdx == ${i}) d += w * texelFetch(${EZ.MORPH.DELTA(i)}, ivec2(t, vertexLocal), 0).xyz;`;
                });
                out.push(
                `int morphVertexLocal() { return gl_VertexID - ${EZ.MORPH.VBASE}; }
                float morphWeight(int targetIdx) {
                    return texelFetch(${EZ.MORPH.WTEX},
                                    ivec2(${EZ.MORPH.WOFFSET} + targetIdx, gl_InstanceID), 0).r;
                }
                vec3 applyMorph(int channelIdx, int vertexLocal) {
                    vec3 d = vec3(0.0);
                    for (int t = 0; t < ${EZ.MORPH.COUNT}; t++) {
                        float w = morphWeight(t);
                        if (w == 0.0) continue;
                ${fetchLines.join("\n")}
                    }
                    return d;
                }`);
            }
            return out.join("\n");
        }

        describe({ vertex = {}, fragment = {}, uniKeys = [], onbind = null, renderCfg = {} } = {}) {
            const arrOf     = v => Array.isArray(v) ? v : [];
            const vAttrs    = arrOf(vertex.attributes);
            const vInst     = arrOf(vertex.instanceData);
            const vOuts     = arrOf(vertex.outputs);
            const morphChs  = Array.isArray(vertex.morphChannels) ? vertex.morphChannels.slice() : [];
            const vMain     = String(vertex.main ?? "");
            const fMain     = String(fragment.main ?? "");
            const vDK       = _is.obj(vertex.defaultKeys)   ? vertex.defaultKeys   : {};
            const fDK       = _is.obj(fragment.defaultKeys) ? fragment.defaultKeys : {};
            const hasSkel   = !!vertex.hasSkeleton;
            const fOutColor = String(fragment.outputColor ?? "fragColor");

            for (const k of Object.keys(vDK))
                if (!EzShader3D.#DEFAULT_KEY_VERT[k])
                    throw new Error(`${TAGC3D} addShader: unknown vertex.defaultKeys key "${k}"`);
            for (const k of Object.keys(fDK))
                if (!EzShader3D.#DEFAULT_KEY_FRAG[k])
                    throw new Error(`${TAGC3D} addShader: unknown fragment.defaultKeys key "${k}"`);

            if (!Array.isArray(uniKeys))
                throw new Error(`${TAGC3D} addShader: uniKeys must be an array`);
            for (const u of uniKeys) {
                if (!_is.str(u.name)) throw new Error(`${TAGC3D} addShader: uniKey entry missing name`);
                if (!_is.str(u.type)) throw new Error(`${TAGC3D} addShader: uniKey "${u.name}" missing type`);
            }

            let nextSamplerUnit = _EZ_TEX_UNIT_MORPH_DELTA + morphChs.length;
            const uniKeyTexUnits = new Map();
            for (const u of uniKeys)
                if (_is.sampler(u.type)) uniKeyTexUnits.set(u.name, nextSamplerUnit++);

            const instLayout = EzShader3D.#buildInstanceLayout(vInst);

            const seen = new Set();
            const claim = (n, where) => {
                if (!_is.str(n)) throw new Error(`${TAGC3D} addShader: empty/non-string name in ${where}`);
                if (seen.has(n)) throw new Error(`${TAGC3D} addShader: name collision "${n}" in ${where}`);
                seen.add(n);
            };
            for (const a of vAttrs) {
                if (!EzShader3D.#GLSL_VEC[a.size])
                    throw new Error(`${TAGC3D} addShader: vertex attribute "${a.name}" size must be 1..4`);
                claim(a.name, "vertex.attributes");
            }
            for (const e of instLayout.entries) claim(e.name, `vertex.instanceData[${e.name}]`);
            for (const [k, v] of Object.entries(vDK)) claim(v, `vertex.defaultKeys.${k}`);
            for (const o of vOuts) claim(o.name, "vertex.outputs");
            for (const [k, v] of Object.entries(fDK)) claim(v, `fragment.defaultKeys.${k}`);
            for (const u of uniKeys) claim(u.name, `uniKeys["${u.name}"]`);
            claim(fOutColor, "fragment.outputColor");

            let next = 0;
            const instStartLoc = next + vAttrs.length;
            const v = ["#version 300 es", "precision highp float;"];
            for (const a of vAttrs)
                v.push(`layout(location=${next++}) in ${EzShader3D.#GLSL_VEC[a.size]} ${a.name};`);
            for (const e of instLayout.entries)
                v.push(`layout(location=${instStartLoc + e.locOffset}) in ${e.glsl} ${e.name};`);
            for (const [k, n] of Object.entries(vDK)) v.push(EzShader3D.#DEFAULT_KEY_VERT[k](n));
            if (hasSkel) v.push(`uniform highp sampler2D ${EzShader3D.EZ.BONES_TEX};`);
            if (morphChs.length > 0) {
                v.push(`uniform highp sampler2D ${EzShader3D.EZ.MORPH.WTEX};`,
                       `uniform int ${EzShader3D.EZ.MORPH.COUNT};`,
                       `uniform int ${EzShader3D.EZ.MORPH.WOFFSET};`,
                       `uniform int ${EzShader3D.EZ.MORPH.VBASE};`);
                for (let i = 0; i < morphChs.length; i++)
                    v.push(`uniform highp sampler2D ${EzShader3D.EZ.MORPH.DELTA(i)};`);
            }
            for (const u of uniKeys) v.push(`uniform ${u.type} ${u.name};`);
            for (const o of vOuts)   v.push(`out ${o.type ?? "vec4"} ${o.name};`);
            const helpers = EzShader3D.#buildVertexHelpers(hasSkel, morphChs);
            if (helpers) v.push(helpers);
            v.push("void main() {", "#line 1", vMain, "}");

            const f = ["#version 300 es", "precision highp float;"];
            for (const o of vOuts) f.push(`in ${o.type ?? "vec4"} ${o.name};`);
            f.push(`out vec4 ${fOutColor};`);
            for (const [k, n] of Object.entries(fDK)) f.push(EzShader3D.#DEFAULT_KEY_FRAG[k](n));
            for (const u of uniKeys) f.push(`uniform ${u.type} ${u.name};`);
            f.push("void main() {", "#line 1", fMain, "}");

            const rCfg = renderCfg ?? {};
            this.#descript = {
                vertSrc:        v.join("\n"),
                fragSrc:        f.join("\n"),
                attributes:     vAttrs.map(a => ({ name: a.name, size: a.size, default: Array.isArray(a.default) ? a.default : [0,0,0,0] })),
                morphChannels:  morphChs,
                hasSkeleton:    hasSkel,
                instanceLayout: instLayout,
                uniKeyTexUnits,
                names: { view: vDK.view ?? null, projection: vDK.projection ?? null, albedo: fDK.albedo ?? null, fill: fDK.fill ?? null },
                onbind: typeof onbind === "function" ? onbind : null,
                renderCfg: {
                    rQueue:      typeof rCfg.rQueue      === "number"  ? rCfg.rQueue      : 1000,
                    depthWrite:  typeof rCfg.depthWrite  === "boolean" ? rCfg.depthWrite  : true,
                    depthTest:   typeof rCfg.depthTest   === "boolean" ? rCfg.depthTest   : true,
                    doubleSided: typeof rCfg.doubleSided === "boolean" ? rCfg.doubleSided : false,
                    blend:       typeof rCfg.blend       === "boolean" ? rCfg.blend       : false,
                    blendSrc:    rCfg.blendSrc ?? EzShader.BLEND.SRC_ALPHA,
                    blendDst:    rCfg.blendDst ?? EzShader.BLEND.ONE_MINUS_SRC_ALPHA,
                },
            };
            this.#compiled3d = false;
            return this;
        }

        compile(gl) {
            if (!this.#descript) throw new Error("[EzShader3D] compile() called before describe()");
            const d  = this.#descript;
            const EZ = EzShader3D.EZ;

            super.compile(d.vertSrc, d.fragSrc, gl);

            const loc = n => n ? gl.getUniformLocation(this.program, n) : null;

            this.attributes = d.attributes.map(a => ({
                ...a,
                default: [a.default[0]??0, a.default[1]??0, a.default[2]??0, a.default[3]??0],
                loc: gl.getAttribLocation(this.program, a.name),
            }));

            this.instanceLayout = {
                ...d.instanceLayout,
                entries: d.instanceLayout.entries.map(e => ({ ...e, loc: gl.getAttribLocation(this.program, e.name) })),
            };

            const N = d.names;
            this.uloc = {
                view:       loc(N.view),
                projection: loc(N.projection),
                albedo:     loc(N.albedo),
                fill:       loc(N.fill),
                bonesTex:   d.hasSkeleton ? gl.getUniformLocation(this.program, EZ.BONES_TEX) : null,
                morph: (() => {
                    if (!d.morphChannels.length) return { weightTex: null, count: null, weightOffset: null, vertexBase: null, channels: [] };
                    const mu = n => gl.getUniformLocation(this.program, n);
                    return {
                        weightTex:    mu(EZ.MORPH.WTEX),
                        count:        mu(EZ.MORPH.COUNT),
                        weightOffset: mu(EZ.MORPH.WOFFSET),
                        vertexBase:   mu(EZ.MORPH.VBASE),
                        channels: d.morphChannels.map((_, i) => ({
                            unit: _EZ_TEX_UNIT_MORPH_DELTA + i,
                            loc:  mu(EZ.MORPH.DELTA(i)),
                        })),
                    };
                })(),
            };

            this.uniKeyTexUnits = d.uniKeyTexUnits;
            this.texUnits       = Object.fromEntries(d.uniKeyTexUnits);
            this._morphChannels = d.morphChannels;
            this.renderCfg      = d.renderCfg;
            this.onbind         = d.onbind;
            this.#compiled3d    = true;
            return this;
        }
    }

    function simpleTex(gl, existing, iFmt, fmt, type, w, h, data) {
        const tex = existing ?? gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (!existing) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, iFmt, w, h, 0, fmt, type, data);
        return tex;
    }

    const _dummyTex = (gl, iFmt, fmt, type, data) => simpleTex(gl, null, iFmt, fmt, type, 1, 1, data);

    function packInstanceRow(arr, offFloats, inst, layout) {
        for (const e of layout.entries) {
            const src = inst.data[e.name];
            if (src) arr.set(src, offFloats + (e.byteOffset >> 2));
        }
    }


    // Fixed texture units for internal ez_ resources.
    const _EZ_TEX_UNIT_ALBEDO       = 0;
    const _EZ_TEX_UNIT_BONES        = 1;
    const _EZ_TEX_UNIT_MORPH_WEIGHT = 2;
    const _EZ_TEX_UNIT_MORPH_DELTA  = 3; // N channels occupy 3, 4, 5, ...

    const _DEFAULT_TEMPLATE = {
        vertex: {
            attributes: [
                { name: "a_position",   size: 3, default: [0, 0, 0, 1] },
                { name: "a_uv",         size: 2, default: [0, 0, 0, 0] },
                { name: "a_boneID",     size: 4, default: [0, 0, 0, 0] },
                { name: "a_boneWeight", size: 4, default: [0, 0, 0, 0] },
            ],
            defaultKeys: {
                view:       "u_view",
                projection: "u_projection",
            },
            hasSkeleton: true,
            instanceData: [
                { name: "a_instanceMatrix", type: "mat4" },
                { name: "a_instanceColor",  type: "vec4", default: [1, 1, 1, 1] },
            ],
            outputs: [
                { name: "v_uv",            type: "vec2" },
                { name: "v_instanceColor", type: "vec4" },
            ],
            main: `
                v_uv = a_uv;
                v_instanceColor = a_instanceColor;
                mat4 skin = computeSkin(a_boneID, a_boneWeight);
                gl_Position = u_projection * u_view * a_instanceMatrix * skin * vec4(a_position, 1.0);
            `,
        },
        fragment: {
            defaultKeys: {
                fill:   "u_fill",
                albedo: "u_albedo",
            },
            outputColor: "fragColor",
            main: `fragColor = texture(u_albedo, v_uv) * u_fill * v_instanceColor;`,
        },
    };


    // A shader for screen space object picking, very useful
    // cannot handle morph deformation BUT does works with rigs/skins
    const _PICK_VERT_LOC_POSITION   = 0;
    const _PICK_VERT_LOC_BONEID     = 1;
    const _PICK_VERT_LOC_BONEWEIGHT = 2;
    const _PICK_VERT_LOC_MATRIX     = 3; // occupies slots 3,4,5,6

    const _PICK_VERT_SRC = `#version 300 es
        precision highp float;
        layout(location=${_PICK_VERT_LOC_POSITION})   in vec3 a_position;
        layout(location=${_PICK_VERT_LOC_BONEID})     in vec4 a_boneID;
        layout(location=${_PICK_VERT_LOC_BONEWEIGHT}) in vec4 a_boneWeight;
        layout(location=${_PICK_VERT_LOC_MATRIX})     in mat4 a_pickMatrix;

        uniform mat4 ez_pickView;
        uniform mat4 ez_pickProj;
        uniform bool ez_pickHasSkeleton;
        uniform highp sampler2D ${EzShader3D.EZ.BONES_TEX};

        mat4 fetchBone(int i) {
            return mat4(
                texelFetch(${EzShader3D.EZ.BONES_TEX}, ivec2(0, i), 0),
                texelFetch(${EzShader3D.EZ.BONES_TEX}, ivec2(1, i), 0),
                texelFetch(${EzShader3D.EZ.BONES_TEX}, ivec2(2, i), 0),
                texelFetch(${EzShader3D.EZ.BONES_TEX}, ivec2(3, i), 0)
            );
        }
        mat4 computeSkin(vec4 boneID, vec4 boneWeight) {
            float wsum = boneWeight.x + boneWeight.y + boneWeight.z + boneWeight.w;
            if (wsum < 0.0001) return mat4(1.0);
            return boneWeight.x * fetchBone(int(boneID.x))
                + boneWeight.y * fetchBone(int(boneID.y))
                + boneWeight.z * fetchBone(int(boneID.z))
                + boneWeight.w * fetchBone(int(boneID.w));
        }

        void main() {
            mat4 skin = ez_pickHasSkeleton
                ? computeSkin(a_boneID, a_boneWeight)
                : mat4(1.0);
            gl_Position = ez_pickProj * ez_pickView * a_pickMatrix * skin * vec4(a_position, 1.0);
        }`;

    const _PICK_FRAG_SRC = `#version 300 es
        precision mediump float;
        uniform uint ez_pickId;
        out vec4 fragColor;
        void main() {
            // Encode 24-bit ID into RGB, A=1. ID 0 means background (no hit).
            fragColor = vec4(
                float((ez_pickId >> 16u) & 255u) / 255.0,
                float((ez_pickId >>  8u) & 255u) / 255.0,
                float( ez_pickId         & 255u) / 255.0,
                1.0
            );
        }`;


    function _drawPrim(gl, prim, model, instanceCount) {
        EzWebGL.drawInstanced(gl, {
            instanceCount,
            draw: prim.indexOffset != null
                ? { 
                    indexed: true,
                    count: prim.indexCount,
                    indexType: model.indexType,
                    indexOffset: prim.indexOffset * model.indexBytes 
                } : {
                    indexed: false,
                    vertexOffset: prim.vertexOffset,
                    vertexCount: prim.vertexCount
                }
        });
    }

    const _RCFG_OPAQUE = { rQueue: 1000, depthWrite: true,  depthTest: true, blend: false, blendSrc: null, blendDst: null, doubleSided: false };
    const _RCFG_TRANSPARENT = { rQueue: 2000, depthWrite: false, depthTest: true, blend: true,  blendSrc: null, blendDst: null, doubleSided: true };

    const _DEFAULT_SHADERS = [
        { key: "__ez_opaque_default__",      renderCfg: _RCFG_OPAQUE },
        { key: "__ez_transparent_default__", renderCfg: _RCFG_TRANSPARENT },
    ];
    const _DEFAULT_OPAQUE_KEY  = _DEFAULT_SHADERS[0].key;
    const _DEFAULT_SHADER_KEYS = new Set(_DEFAULT_SHADERS.map(s => s.key));

    const TAGC3D = "[EzCanvas3D]";
    class EzCanvas3D {

        #canvas = null;
        #gl     = null;

        #shaders   = new Map();
        #textures  = new Map();
        #models    = new Map();
        #instances = new Map();

        #whiteTex         = null;
        #morphDummyDelta  = null;
        #morphDummyWeight = null;

        #instanceCounter = 0;

        // Picking
        #pickProgram  = null;  // the single picking GL program
        #pickFbo      = null;  // offscreen framebuffer
        #pickColorTex = null;  // RGBA8 color attachment
        #pickDepthRb  = null;  // depth renderbuffer
        #pickFboW     = 0;
        #pickFboH     = 0;
        #pickVao      = null;  // picking VAO (re-configured per model draw)
        #pickInstVbo  = null;  // instance VBO for the picking pass (mat4 per instance)
        // Picking uniform locations (cached after program compile)
        #pickUloc     = null;

        #cam = {
            pos: [0, 0, 3], orientation: [0, 0, 0, 1],
            pitch: 0, yaw: 0, roll: 0,
            forward: [0, 0, -1], up: [0, 1, 0], right: [1, 0, 0],
            fov: 45, near: 0.1, far: 1000,
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



        constructor(name) {
            if (!_is.str(name)) throw new Error(`${TAGC3D} name required`);
            const c = document.createElement("canvas");
            c.id     = `ez-canvas3d-${name}`;
            c.width  = 800;
            c.height = 600;
            c.style.background = "transparent";
            this.#canvas = c;

            const gl = c.getContext("webgl2", { alpha: true });
            if (!gl) throw new Error(`${TAGC3D} WebGL2 not supported`);
            this.#gl = gl;

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.enable(gl.BLEND); // Canvas is transparent, cool shi
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clearColor(0, 0, 0, 0);

            this.#whiteTex         = _dummyTex(gl, gl.RGBA8,  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array  ([255,255,255,255]));
            this.#morphDummyDelta  = _dummyTex(gl, gl.RGB32F, gl.RGB,  gl.FLOAT,         new Float32Array([0,0,0]));
            this.#morphDummyWeight = _dummyTex(gl, gl.R32F,   gl.RED,  gl.FLOAT,         new Float32Array([0]));

            this.#initPickProgram();
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
            this.#canvas.width = w; this.#canvas.height = h;
            this.#gl.viewport(0, 0, w, h);
            // Invalidate pick FBO so it gets rebuilt at the correct size on next pick().
            this.#pickFboW = 0;
            this.#camUpdate();
            return this;
        }

        readCanvas() {
            return {
                modelKeys:    [...this.#models.keys()],
                shaderKeys:   [...this.#shaders.keys()],
                textureKeys:  [...this.#textures.keys()],
                instanceKeys: [...this.#instances.keys()],
            };
        }


        addShader(key, shader) {
            if (!_is.str(key)) return false;
            if (_DEFAULT_SHADER_KEYS.has(key))
                return _c.warn(TAGC3D, `addShader: key "${key}" is reserved (built-in default)`);
            if (!(shader instanceof EzShader))
                return _c.warn(TAGC3D, `addShader: expected an EzShader instance for key "${key}"`);
            if (!shader.isCompiled) {
                if (!shader.isDescribed)
                    return _c.warn(TAGC3D, `addShader: EzShader3D for "${key}" has not been described yet — call shader.describe(opts) first`);
                try { shader.compile(this.#gl); }
                catch (e) { console.warn(e.message); return false; }
            }
            this.#shaders.set(key, shader);
            return true;
        }

        removeShader(key) {
            if (_DEFAULT_SHADER_KEYS.has(key))
                return _c.warn(TAGC3D, `removeShader: built-in default "${key}" cannot be removed`);
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
                morphChannels: s._morphChannels ?? [],
                hasSkeleton:   s.uloc.bonesTex != null,
            };
        }

        addTexture(key, { data, width, height, channels = 4, filter = this.#gl.LINEAR, wrap = this.#gl.REPEAT }) {
            if (!_is.str(key) || !data || !width || !height) return false;
            const gl = this.#gl;
            const hasMipmap = filter === "nearest";

            const ch = channels;    
            const [internalFormat, format] =
                ch === 1 ?  [gl.R8,    gl.RED ] :
                ch === 2 ?  [gl.RG8,   gl.RG  ] :
                ch === 3 ?  [gl.RGB8,  gl.RGB ] :
                            [gl.RGBA8, gl.RGBA]

            const glTex = EzWebGL.createTexture(gl, {
                data, width, height,
                format, internalFormat,
                wrapS: wrap, wrapT: wrap,
                mipmap: hasMipmap
            });

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
                throw new Error(`${TAGC3D} imageToData: img must be a fully loaded HTMLImageElement`);

            const w = img.naturalWidth, h = img.naturalHeight;

            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const { data } = ctx.getImageData(0, 0, w, h);
            return { data: new Uint8Array(data.buffer), width: w, height: h, channels: 4 };
        }


        addModel(key, opts = {}) {
            if (!_is.str(key)) return false;
            const { defaultShader: shaderKeyIn, vertices, indices, attributes, primitives, skeleton } = opts;

            const shaderKey = _is.str(shaderKeyIn) ? shaderKeyIn : _DEFAULT_OPAQUE_KEY;
            const shader = this.#shaders.get(shaderKey);
            if (!shader)
                return _c.warn(TAGC3D, `addModel: shader "${shaderKey}" not found`);
            const hasVertices = !!vertices;

            const gl = this.#gl;
            const indexType  = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
            const indexBytes = indices instanceof Uint32Array ? 4 : 2;

            const modelAttrsIn = Array.isArray(attributes) && attributes.length
                ? attributes
                : [{ name: "a_position", size: 3 }, { name: "a_uv", size: 2 }];

            let off = 0;
            const modelAttrs = modelAttrsIn.map(a => {
                const e = { name: a.name, size: a.size, offset: off };
                off += a.size * 4;
                return e;
            });
            const vaoStride = off;

            // Wire shader attributes either to a VBO slot or to a per-attribute fallback default.
            const wired = [], defaulted = [];
            for (const sa of shader.attributes) {
                if (sa.loc < 0) continue;
                const ma = modelAttrs.find(m => m.name === sa.name);
                if (ma) wired.push({ loc: sa.loc, size: ma.size, offset: ma.offset });
                else    defaulted.push({ loc: sa.loc, default: sa.default });
            }

            const vertexCount = hasVertices ? vertices.length / (vaoStride / 4) : 0;
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
                    : [{ vertexOffset: 0, vertexCount: hasVertices ? vertexCount : 0, material: { albedo: null, fill: [1,1,1,1] } }];

            if (hasVertices) {
                for (const p of primList) {
                    if (p.indexOffset != null) {
                        if (p.indexOffset < 0 || p.indexOffset + p.indexCount > (indices ? indices.length : 0))
                            return _c.warn(TAGC3D, `addModel "${key}": primitive index range out of bounds`);
                    } else {
                        if (p.vertexOffset < 0 || p.vertexOffset + p.vertexCount > vertexCount)
                            return _c.warn(TAGC3D, `addModel "${key}": primitive vertex range out of bounds`);
                    }
                }
            }

            // Morph targets: validate, pack into RGB32F textures, assign weight slots.
            // morphTargets keys must match the shader's vertex.morphChannels names.
            let morphTotalWeights = 0;
            // Retrieve the shader's declared morph channel names for index mapping.
            const shaderMorphChannels = this.#shaders.get(shaderKey)?._morphChannels ?? [];

            for (const p of primList) {
                const channelsIn = p._morphSrc; delete p._morphSrc;
                if (!channelsIn) continue;
                if (!_is.obj(channelsIn) || Array.isArray(channelsIn))
                    return _c.warn(TAGC3D, `addModel "${key}": morphTargets must be an object keyed by channel name`);

                const channelNames = Object.keys(channelsIn);
                let targetCount = -1;
                for (const name of channelNames) {
                    const arr = channelsIn[name];
                    if (arr == null) continue;
                    if (!Array.isArray(arr))
                        return _c.warn(TAGC3D, `addModel "${key}": morphTargets.${name} must be an array`);
                    if (targetCount < 0) targetCount = arr.length;
                    else if (arr.length !== targetCount)
                        return _c.warn(TAGC3D, `addModel "${key}": morphTargets channel "${name}" has ${arr.length} targets, expected ${targetCount}`);
                }
                if (targetCount <= 0) continue;

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
                    channels:     new Map(), // keyed by channel index (0, 1, 2, ...)
                };

                // Map channel names to their index as declared in the shader's morphChannels array.
                for (const chName of channelNames) {
                    const arr = channelsIn[chName];
                    if (arr == null) continue;

                    // Resolve channel index: use shader declaration order, fallback to insertion order.
                    const chIdx = shaderMorphChannels.length > 0
                        ? shaderMorphChannels.indexOf(chName)
                        : channelNames.indexOf(chName);
                    if (chIdx < 0)
                        return _c.warn(TAGC3D, `addModel "${key}": morphTargets channel "${chName}" not declared in shader's vertex.morphChannels`);

                    const expected = vCount * 3;
                    for (let t = 0; t < targetCount; t++) {
                        if (!arr[t] || arr[t].length !== expected)
                            return _c.warn(TAGC3D, `addModel "${key}": morphTargets.${chName}[${t}] length must be ${expected} (vertexCount*3), got ${arr[t]?.length}`);
                    }

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
                    p.morph.channels.set(chIdx, simpleTex(gl, null, gl.RGB32F, gl.RGB, gl.FLOAT, targetCount, vCount, packed));
                }

                morphTotalWeights += targetCount;
            }

            // Skeleton: resolve localBind, compute inverseBind chain.
            let resolvedSkeleton = null;
            if (skeleton && Array.isArray(skeleton.bones) && skeleton.bones.length > 0) {
                const bones = [], globalBind = [];
                for (let i = 0; i < skeleton.bones.length; i++) {
                    const b = skeleton.bones[i];
                    const parent = b.parent ?? -1;
                    if (parent >= i)
                        return _c.warn(TAGC3D, `addModel "${key}": bone ${i} parent must be < self`);
                    const localBind = _math.Mat4.resolveTransform(b.localBind ?? null, null);
                    const gb = parent < 0 ? localBind : _math.Mat4.multiply(globalBind[parent], localBind);
                    globalBind[i] = gb;
                    const inverseBind = b.inverseBind instanceof Float32Array && b.inverseBind.length === 16
                        ? b.inverseBind
                        : _math.Mat4.invert(gb);
                    bones.push({ parent, localBind, inverseBind });
                }
                resolvedSkeleton = { bones };
            }

            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);

            const vbo = gl.createBuffer();
            if (hasVertices) {
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
                for (const w of wired) {
                    EzWebGL.wireAttr(gl, {buffer: vbo, loc: w.loc, size: w.size, stride: vaoStride, offset: w.offset});
                }
            }
            for (const d of defaulted) gl.disableVertexAttribArray(d.loc);

            const ebo = indices ? gl.createBuffer() : null;
            if (ebo) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            }

            // Instance VBO: shader-driven layout. Empty entries = drawn N times via gl_InstanceID only.
            const instanceVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
            const instLayout = shader.instanceLayout;
            for (const e of instLayout.entries) {
                if (e.loc < 0) continue;
                if (e.type === "mat4") {
                    for (let col = 0; col < 4; col++)
                        EzWebGL.wireAttr(gl, {buffer: instanceVBO, loc: e.loc + col, size: 4, stride: instLayout.strideBytes, offset: e.byteOffset + col * 16, divisor: 1});
                } else {
                    EzWebGL.wireAttr(gl, { buffer: instanceVBO, loc: e.loc, size: e.floats, stride: instLayout.strideBytes, offset: e.byteOffset, divisor: 1});
                }
            }

            gl.bindVertexArray(null);

            this.#models.set(key, {
                shaderKey,
                vao, vbo, ebo, instanceVBO,
                indexType, indexBytes,
                primitives: primList,
                defaulted,
                skeleton: resolvedSkeleton,
                boneTex: null,
                morphTotalWeights,
                morphWeightTex: null,
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
            for (const [ik, inst] of this.#instances)
                if (inst.modelKey === key) this.#instances.delete(ik);
            return true;
        }

        readModel(key) {
            const m = this.#models.get(key); if (!m) return null;
            return {
                key,
                defaultShader: m.shaderKey,
                primitives: m.primitives.map(p => {
                    const out = { material: { albedo: p.material.albedo, fill: [...p.material.fill] } };
                    if (p.indexOffset != null) { out.indexOffset = p.indexOffset; out.indexCount = p.indexCount; }
                    else { out.vertexOffset = p.vertexOffset; out.vertexCount = p.vertexCount; }
                    if (p.morph) {
                        const { targetCount, weightOffset, vertexBase, vertexCount } = p.morph;
                        out.morph = { targetCount, weightOffset, vertexBase, vertexCount };
                    }
                    return out;
                }),
                ...m._info,
            };
        }


        addInstance(modelKey, init = null) {
            const model = this.#models.get(modelKey);
            if (!model) { _c.warn(TAGC3D, `addInstance: model "${modelKey}" not found`); return null; }
            const overrideKey = (init && _is.str(init.shader)) ? init.shader : null;
            const resolvedKey = overrideKey ?? model.shaderKey;
            const shader = this.#shaders.get(resolvedKey);
            if (!shader) return null;
            const key = `i${this.#instanceCounter++}`;

            const data = {};
            for (const e of shader.instanceLayout.entries) data[e.name] = new Float32Array(e.default);

            this.#instances.set(key, {
                modelKey, shaderKey: overrideKey,
                data,
                bonePoses:    model.skeleton ? Array.from({ length: model.skeleton.bones.length }, _math.Mat4.identity) : null,
                morphWeights: model.morphTotalWeights > 0 ? new Float32Array(model.morphTotalWeights) : null,
                display: true,
            });
            if (init) this.writeInstance(key, init);
            return key;
        }

        removeInstance(key) { return this.#instances.delete(key); }

        writeInstance(key, opts = {}) {
            const inst = this.#instances.get(key); if (!inst) return false;
            const model = this.#models.get(inst.modelKey); if (!model) return false;
            if (_is.str(opts.shader)) inst.shaderKey = opts.shader || null;
            const resolvedKey = inst.shaderKey ?? model.shaderKey;
            const shader = this.#shaders.get(resolvedKey); if (!shader) return false;

            if (opts.data && _is.obj(opts.data)) {
                for (const e of shader.instanceLayout.entries) {
                    if (!(e.name in opts.data)) continue;
                    const val = opts.data[e.name], dst = inst.data[e.name];
                    if (e.type === "mat4") {
                        const m = _math.Mat4.resolveTransform(val, dst);
                        if (m !== dst) dst.set(m);
                    } else if (e.type === "float") {
                        dst[0] = +val || 0;
                    } else if (val != null && val.length === e.floats) {
                        for (let i = 0; i < e.floats; i++) dst[i] = +val[i] || 0;
                    }
                }
            }
            if ("display" in opts) inst.display = !!opts.display;
            if (opts.bone && inst.bonePoses) {
                const bts = Array.isArray(opts.bone) ? opts.bone : [opts.bone];
                for (const bt of bts) {
                    if (!bt) continue;
                    const id = bt.id;
                    if (typeof id !== "number" || id < 0 || id >= inst.bonePoses.length) continue;
                    inst.bonePoses[id] = _math.Mat4.resolveTransform(bt.transform, inst.bonePoses[id]);
                }
            }
            if (opts.morph && inst.morphWeights) {
                const w = opts.morph;
                let offset = 0, src = w;
                if (_is.obj(w) && !Array.isArray(w) && !(w instanceof Float32Array)) {
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
                data:         Object.fromEntries(Object.entries(inst.data).map(([k, v]) => [k, new Float32Array(v)])),
                display:      inst.display,
                bonePoses:    inst.bonePoses    ? inst.bonePoses.map(m => new Float32Array(m)) : null,
                morphWeights: inst.morphWeights ? new Float32Array(inst.morphWeights)         : null,
            };
        }


        setCamera(opts = {}) {
            const c = this.#cam;
            for (const k of ["fov","near","far"]) if (k in opts) c[k] = opts[k];
            if ("position" in opts) c.pos = opts.position;

            if ("orientation" in opts) {
                c.orientation = _math.Quat.normalize(opts.orientation);
                const e = _math.Quat.toEulerYPR(c.orientation);
                c.pitch = _math.clamp(e.pitch, -89, 89);
                c.yaw   = e.yaw;
                c.roll  = e.roll;
            } else if ("yaw" in opts || "pitch" in opts || "roll" in opts) {
                if ("yaw"   in opts) c.yaw   = opts.yaw;
                if ("pitch" in opts) c.pitch = _math.clamp(opts.pitch, -89, 89);
                if ("roll"  in opts) c.roll  = opts.roll;
                c.orientation = _math.Quat.fromEulerYPR(c.yaw, c.pitch, c.roll);
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
            c.pitch = _math.clamp(c.pitch + pitchDelta, -89, 89);
            c.yaw  += yawDelta;
            c.roll += rollDelta;
            c.orientation = _math.Quat.fromEulerYPR(c.yaw, c.pitch, c.roll);
            this.#camUpdate();
            return this;
        }

        translateCamera(offset) {
            const c = this.#cam, p = c.pos;
            c.pos = [p[0]+offset[0], p[1]+offset[1], p[2]+offset[2]];
            this.#view = _math.Mat4.lookAt(c.pos, [c.pos[0]+c.forward[0], c.pos[1]+c.forward[1], c.pos[2]+c.forward[2]], c.up);
            return this;
        }

        resetCameraRoll() {
            const c = this.#cam;
            c.roll = 0;
            c.orientation = _math.Quat.normalize(_math.Quat.fromEulerYPR(c.yaw, c.pitch, 0));
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
            c.forward = _math.Quat.rotateVec(c.orientation, [0, 0, -1]);
            c.right   = _math.Quat.rotateVec(c.orientation, [1, 0,  0]);
            c.up      = _math.Quat.rotateVec(c.orientation, [0, 1,  0]);
            this.#view = _math.Mat4.lookAt(c.pos, [c.pos[0]+c.forward[0], c.pos[1]+c.forward[1], c.pos[2]+c.forward[2]], c.up);
            this.#proj = _math.Mat4.perspective(c.fov * Math.PI / 180, this.#canvas.width / this.#canvas.height, c.near, c.far);
        }

        render() {
            const gl = this.#gl;
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // shaderKey -> { static, skinned } -> Map<modelKey, [inst]>
            const batches = new Map();
            for (const [, inst] of this.#instances) {
                if (!inst.display) continue;
                const model = this.#models.get(inst.modelKey); if (!model) continue;
                const resolvedKey = inst.shaderKey ?? model.shaderKey;
                let entry = batches.get(resolvedKey);
                if (!entry) batches.set(resolvedKey, entry = { static: new Map(), skinned: new Map() });
                const bucket = model.skeleton ? entry.skinned : entry.static;
                if (!bucket.has(inst.modelKey)) bucket.set(inst.modelKey, []);
                bucket.get(inst.modelKey).push(inst);
            }

            // Sort batches by rQueue (ascending) then draw all.
            const sorted = [...batches.entries()]
                .sort((a, b) => {
                    const ra = this.#shaders.get(a[0])?.renderCfg.rQueue ?? 1000;
                    const rb = this.#shaders.get(b[0])?.renderCfg.rQueue ?? 1000;
                    return ra - rb;
                });
            this.#drawPass(sorted);
        }

        #drawPass(sorted) {
            const gl = this.#gl;
            for (const [shaderKey, { static: staticBatch, skinned: skinnedBatch }] of sorted) {
                const shader = this.#shaders.get(shaderKey); if (!shader) continue;
                shader.applyRenderState(gl);

                shader.bind(gl);
                if (shader.uloc.view)       gl.uniformMatrix4fv(shader.uloc.view,       false, this.#view);
                if (shader.uloc.projection) gl.uniformMatrix4fv(shader.uloc.projection, false, this.#proj);

                // 0 stride = shader has no instanceData (drawn purely via gl_InstanceID).
                const layout = shader.instanceLayout;
                const stride = layout.strideFloats;

                for (const [modelKey, instList] of staticBatch) {
                    const model = this.#models.get(modelKey); if (!model) continue;
                    if (stride > 0) {
                        const flat = new Float32Array(instList.length * stride);
                        for (let i = 0; i < instList.length; i++)
                            packInstanceRow(flat, i * stride, instList[i], layout);
                        gl.bindBuffer(gl.ARRAY_BUFFER, model.instanceVBO);
                        gl.bufferData(gl.ARRAY_BUFFER, flat, gl.DYNAMIC_DRAW);
                    }
                    this.#bindMorphWeightTex(model, shader, instList);
                    gl.bindVertexArray(model.vao);
                    for (const d of model.defaulted) gl.vertexAttrib4f(d.loc, ...d.default);
                    this.#drawPrimitives(model, shader, instList.length);
                    gl.bindVertexArray(null);
                }

                // Skinned path - per-instance bone palette upload.
                const oneInstance = stride > 0 ? new Float32Array(stride) : null;
                for (const [modelKey, instList] of skinnedBatch) {
                    const model = this.#models.get(modelKey); if (!model) continue;
                    gl.bindVertexArray(model.vao);
                    for (const d of model.defaulted) gl.vertexAttrib4f(d.loc, ...d.default);

                    for (const inst of instList) {
                        if (oneInstance) {
                            packInstanceRow(oneInstance, 0, inst, layout);
                            gl.bindBuffer(gl.ARRAY_BUFFER, model.instanceVBO);
                            gl.bufferData(gl.ARRAY_BUFFER, oneInstance, gl.DYNAMIC_DRAW);
                        }

                        if (shader.uloc.bonesTex != null) {
                            gl.activeTexture(gl.TEXTURE0 + _EZ_TEX_UNIT_BONES);
                            this.#uploadBoneTex(model, inst.bonePoses);
                            gl.uniform1i(shader.uloc.bonesTex, _EZ_TEX_UNIT_BONES);
                        }
                        this.#bindMorphWeightTex(model, shader, [inst]);
                        this.#drawPrimitives(model, shader, 1);
                    }
                    gl.bindVertexArray(null);
                }
            }

            // Restore safe defaults so canvas alpha:true transparency is never broken.
            gl.depthMask(true);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }


        #drawPrimitives(model, shader, instanceCount) {
            const gl = this.#gl;
            const morph = shader.uloc.morph;
            const hasMorph = morph.count != null;
            for (const prim of model.primitives) {
                const { material } = prim;

                const tex = material.albedo ? this.#textures.get(material.albedo) : null;
                gl.activeTexture(gl.TEXTURE0 + _EZ_TEX_UNIT_ALBEDO);
                gl.bindTexture(gl.TEXTURE_2D, tex ? tex.glTex : this.#whiteTex);
                if (shader.uloc.albedo != null) gl.uniform1i(shader.uloc.albedo, _EZ_TEX_UNIT_ALBEDO);
                if (shader.uloc.fill   != null) gl.uniform4fv(shader.uloc.fill, material.fill);

                if (hasMorph) {
                    const m = prim.morph;
                    gl.uniform1i(morph.count,        m ? m.targetCount  : 0);
                    gl.uniform1i(morph.weightOffset, m ? m.weightOffset : 0);
                    gl.uniform1i(morph.vertexBase,   m ? m.vertexBase   : 0);
                    for (const ch of morph.channels) {
                        if (ch.loc == null) continue;
                        gl.activeTexture(gl.TEXTURE0 + ch.unit);
                        // channels are stored by index; map index -> GL texture via prim.morph.channels map keyed by channel index
                        const deltaTex = m ? m.channels.get(ch.unit - _EZ_TEX_UNIT_MORPH_DELTA) : null;
                        gl.bindTexture(gl.TEXTURE_2D, deltaTex || this.#morphDummyDelta);
                        gl.uniform1i(ch.loc, ch.unit);
                    }
                }

                _drawPrim(gl, prim, model, instanceCount);
            }
        }

        #bindMorphWeightTex(model, shader, instances) {
            const gl = this.#gl, loc = shader.uloc.morph.weightTex;
            if (loc == null) return;
            gl.activeTexture(gl.TEXTURE0 + _EZ_TEX_UNIT_MORPH_WEIGHT);
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
            gl.uniform1i(loc, _EZ_TEX_UNIT_MORPH_WEIGHT);
        }

        #uploadBoneTex(model, bonePoses) {
            const gl = this.#gl;
            const bones = model.skeleton.bones, n = bones.length;
            const globalCurrent = new Array(n);
            const palette = new Float32Array(n * 16);
            for (let i = 0; i < n; i++) {
                const b = bones[i];
                const local = _math.Mat4.multiply(b.localBind, bonePoses[i]);
                globalCurrent[i] = b.parent < 0 ? local : _math.Mat4.multiply(globalCurrent[b.parent], local);
                palette.set(_math.Mat4.multiply(globalCurrent[i], b.inverseBind), i * 16);
            }
            model.boneTex = simpleTex(gl, model.boneTex, gl.RGBA32F, gl.RGBA, gl.FLOAT, 4, n, palette);
        }


        // ── Picking ───────────────────────────────────────────────────────────

        #initPickProgram() {
            const gl = this.#gl;
            this.#pickProgram = EzShader.createProgram(gl, _PICK_VERT_SRC, _PICK_FRAG_SRC);
            if (!this.#pickProgram) throw new Error(`${TAGC3D} Failed to compile picking shader`);

            const p = this.#pickProgram;
            this.#pickUloc = {
                view:         gl.getUniformLocation(p, "ez_pickView"),
                proj:         gl.getUniformLocation(p, "ez_pickProj"),
                hasSkeleton:  gl.getUniformLocation(p, "ez_pickHasSkeleton"),
                bonesTex:     gl.getUniformLocation(p, EzShader3D.EZ.BONES_TEX),
                id:           gl.getUniformLocation(p, "ez_pickId"),
            };

            // VAO for picking — attribute pointers are reconfigured per model.
            this.#pickVao    = gl.createVertexArray();
            this.#pickInstVbo = gl.createBuffer();
        }

        #ensurePickFbo() {
            const gl = this.#gl;
            const w = this.#canvas.width, h = this.#canvas.height;
            if (this.#pickFboW === w && this.#pickFboH === h) return;

            // Tear down old resources.
            if (this.#pickFbo)      gl.deleteFramebuffer(this.#pickFbo);
            if (this.#pickColorTex) gl.deleteTexture(this.#pickColorTex);
            if (this.#pickDepthRb)  gl.deleteRenderbuffer(this.#pickDepthRb);

            // RGBA8 color texture.
            const col = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, col);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.bindTexture(gl.TEXTURE_2D, null);

            // Depth renderbuffer.
            const dep = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, dep);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
            gl.bindRenderbuffer(gl.RENDERBUFFER, null);

            // FBO.
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, col, 0);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dep);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);

            this.#pickFbo      = fbo;
            this.#pickColorTex = col;
            this.#pickDepthRb  = dep;
            this.#pickFboW     = w;
            this.#pickFboH     = h;
        }

        /**
         * GPU colour-pick at canvas-local coordinates (x, y).
         * Pass e.offsetX / e.offsetY directly from a mouse or click event on the canvas.
         * Returns { instanceKey, modelKey, shaderKey } or null if nothing was hit.
         */
        pick(x, y) {
            const gl   = this.#gl;
            const rect = this.#canvas.getBoundingClientRect();

            // Map canvas-local CSS coords → physical framebuffer pixels, flip Y.
            const px = Math.round(x * (this.#canvas.width  / rect.width));
            const py = this.#canvas.height - 1 - Math.round(y * (this.#canvas.height / rect.height));

            // Out of bounds → no hit.
            if (px < 0 || py < 0 || px >= this.#canvas.width || py >= this.#canvas.height)
                return null;

            this.#ensurePickFbo();

            // Build id→instance registry and collect visible instances.
            // id 0 is reserved for background.
            const registry = new Map(); // uint -> { instanceKey, modelKey, shaderKey }
            let nextId = 1;

            // Group: shaderKey → hasSkeleton flag → modelKey → [{ inst, id }]
            // We iterate the same way as the main render pass.
            const batches = new Map();
            for (const [instKey, inst] of this.#instances) {
                if (!inst.display) continue;
                const model = this.#models.get(inst.modelKey); if (!model) continue;
                const shader = this.#shaders.get(model.shaderKey); if (!shader) continue;

                const id = nextId++;
                registry.set(id, { instanceKey: instKey, modelKey: inst.modelKey, shaderKey: model.shaderKey });

                const skinned = !!model.skeleton;
                const bkey    = model.shaderKey;
                if (!batches.has(bkey)) batches.set(bkey, { skinned, modelBatches: new Map() });
                const mb = batches.get(bkey).modelBatches;
                if (!mb.has(inst.modelKey)) mb.set(inst.modelKey, []);
                mb.get(inst.modelKey).push({ inst, id });
            }

            // Render picking pass into FBO.
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.#pickFbo);
            gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.disable(gl.BLEND);    // blending corrupts ID colours
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);

            gl.useProgram(this.#pickProgram);
            gl.uniformMatrix4fv(this.#pickUloc.view, false, this.#view);
            gl.uniformMatrix4fv(this.#pickUloc.proj, false, this.#proj);
            gl.uniform1i(this.#pickUloc.bonesTex, _EZ_TEX_UNIT_BONES);

            // Reusable mat4 buffer for instance transform upload.
            const matBuf = new Float32Array(16);

            gl.bindVertexArray(this.#pickVao);

            // Wire or zero a pick-pass attrib from the given VBO.
            const wirePickAttr = (buffer, loc, size, stride, off, fallback) => {
                if (off != null) { EzWebGL.wireAttr(gl, { buffer, loc, size, stride, offset: off, divisor: 0 }); }
                else { gl.disableVertexAttribArray(loc); gl.vertexAttrib4f(loc, ...fallback); }
            };

            for (const [shaderKey, { skinned, modelBatches }] of batches) {
                gl.uniform1i(this.#pickUloc.hasSkeleton, skinned ? 1 : 0);

                for (const [modelKey, entries] of modelBatches) {
                    const model = this.#models.get(modelKey); if (!model) continue;
                    const shader = this.#shaders.get(shaderKey); if (!shader) continue;

                    // Derive stride + byte offsets from shader's declared attributes.
                    let stride = 0;
                    const offsets = {};
                    for (const a of shader.attributes) { offsets[a.name] = stride; stride += a.size * 4; }

                    wirePickAttr(model.vbo, _PICK_VERT_LOC_POSITION,   3, stride, offsets["a_position"] ?? 0, [0,0,0,0]);
                    wirePickAttr(model.vbo, _PICK_VERT_LOC_BONEID,     4, stride, offsets["a_boneID"],         [0,0,0,0]);
                    wirePickAttr(model.vbo, _PICK_VERT_LOC_BONEWEIGHT, 4, stride, offsets["a_boneWeight"],     [0,0,0,1]);

                    // Bind EBO if indexed.
                    if (model.ebo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.ebo);

                    for (let col = 0; col < 4; col++)
                        EzWebGL.wireAttr(gl, { buffer: this.#pickInstVbo, loc: _PICK_VERT_LOC_MATRIX + col, size: 4, stride: 64, offset: col * 16, divisor: 1 });

                    for (const { inst, id } of entries) {
                        gl.uniform1ui(this.#pickUloc.id, id);

                        const transformEntry = shader.instanceLayout.entries.find(e => e.type === "mat4");
                        matBuf.set(transformEntry ? inst.data[transformEntry.name] : _math.Mat4.identity());
                        gl.bufferData(gl.ARRAY_BUFFER, matBuf, gl.STREAM_DRAW);

                        if (skinned && inst.bonePoses) {
                            gl.activeTexture(gl.TEXTURE0 + _EZ_TEX_UNIT_BONES);
                            this.#uploadBoneTex(model, inst.bonePoses);
                        }

                        for (const prim of model.primitives) _drawPrim(gl, prim, model, 1);
                    }

                    if (model.ebo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
                }
            }

            gl.bindVertexArray(null);

            // Read the single pixel.
            const pixel = new Uint8Array(4);
            gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

            // Restore main framebuffer state.
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.enable(gl.BLEND);

            // Decode ID.
            const hitId = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
            if (hitId === 0 || pixel[3] === 0) return null; // background

            return registry.get(hitId) ?? null;
        }

        #addDefaultShader() {
            for (const s of _DEFAULT_SHADERS) {
                const shader = new EzShader3D()
                    .describe({ ..._DEFAULT_TEMPLATE, renderCfg: s.renderCfg })
                    .compile(this.#gl);
                this.#shaders.set(s.key, shader);
            }
        }
    }

    window.EzCanvas3D      = EzCanvas3D;
    window.EzShader        = EzShader;
    window.EzShader3D      = EzShader3D;
    window.EzMat4          = _math.Mat4;
    window.EzQuat          = _math.Quat;

})();