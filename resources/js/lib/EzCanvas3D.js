/*
EzCanvas3D
By Asciiz

Holy crap guys I actually made a proper 3D html webgl renderer instead of using canvas2d lmao

EzCanvas3D
|-- new EzCanvas3D(name)
|-- mount(el) / unmount() / resize(w, h)
|-- get: canvas, gl
|-- settings
|   |-- width() / height()
|   |-- fitContainer()                       resize canvas to its parent's bounds
|
|-- .camera                                  your view into the world
|   |-- Fields you can read or write directly:
|   |   |-- position     [x, y, z]
|   |   |-- orientation  quat [x, y, z, w]   (use EzMath.Quat helpers)
|   |   |-- orthographic bool                (default false; true = orthographic projection)
|   |   |-- fov          degrees             (default 45, perspective only)
|   |   |-- orthoSize    world units         (default 5, orthographic only - half-height)
|   |   |-- near / far   clip planes         (defaults 0.1 / 1000)
|   |   |-- aspect       updated for you by resize() / settings.fitContainer()
|   |-- Read-only derived values:
|   |   |-- yaw / pitch / roll               degrees, decoded from orientation
|   |   |-- forward / right / up             unit vectors in world space
|   |   |-- vectors                          { forward, right, up }
|   |   |-- view / projection                mat4 - auto-uploaded by render()
|   |-- Methods:
|   |   |-- set({ position?, orientation?, fov?, near?, far?, aspect?, orthographic?, orthoSize? })
|   |   |-- rotate(yawDeg, pitchDeg, rollDeg)        incremental, in degrees
|   |   |-- lookAt(target, up?=[0,1,0])              point at a world position
|   |   |-- translate([dx, dy, dz])                  move in world space
|   |-- To set an absolute yaw/pitch:
|       ez.camera.set({ orientation: EzMath.Quat.fromEulerYPR(yaw, pitch, roll) });
|
|-- .assets                                  keyed registries for every resource
|   |
|   |-- Common surface (every namespace has these):
|   |   |-- .add(key, value)                 true on success, false on error
|   |   |-- .remove(key)                     cleans up GL resources where applicable
|   |   |-- .read(key)                       safe read-only snapshot (where supported)
|   |   |-- .has / .keys / .values / .entries / .size / [Symbol.iterator]
|   |   |-- .[key] / ["key"]                 raw stored value (direct lookup)
|   |
|   |-- .shaders                             EzShader3D registry  (see § EzShader3D)
|   |   |-- .add(key, ezShader)              auto-compiles if only described
|   |   |-- .remove(key)                     deletes the underlying GL program
|   |   |-- .read(key)                       -> { key, attributes, morphChannels, hasSkeleton }
|   |
|   |-- .textures                            GPU textures
|   |   |-- .add(key, {
|   |   |       data,                        TypedArray, or ImageBitmap / Image / Canvas
|   |   |       width, height,
|   |   |       channels?: 1|2|3|4,          default 4 (RGBA)
|   |   |       filter?: "nearest" | gl.LINEAR    default LINEAR (mipmaps when POT)
|   |   |       wrap?: gl wrap constant      default gl.REPEAT
|   |   |   })
|   |   |-- .remove(key)                     deletes the GL texture
|   |
|   |-- .models                              the high-level "drawable" - mesh + optional skeleton
|   |   |-- .add(key, {
|   |   |       defaultShader,               shader key - required
|   |   |       vertices,                    Float32Array, packed per `attributes` order
|   |   |       indices?,                    Uint16Array | Uint32Array (omit for non-indexed)
|   |   |       attributes?: [{ name, size }],
|   |   |           default [{name:"a_position",size:3},{name:"a_uv",size:2}].
|   |   |           Names must match the shader's vertex.attributes; any attribute
|   |   |           not listed here falls back to that attribute's `default`.
|   |   |       primitives?: [
|   |   |           {
|   |   |               // pick ONE of (indexOffset+indexCount) or (vertexOffset+vertexCount)
|   |   |               indexOffset?, indexCount?,
|   |   |               vertexOffset?, vertexCount?,
|   |   |               material?: { albedo?: textureKey, fill?: [r,g,b,a] },
|   |   |               morphTargets?: { <channelName>: [Float32Array(vertexCount*3), ...] }
|   |   |                              // keys must match shader's vertex.morphChannels
|   |   |           }, ...
|   |   |       ],
|   |   |       skeleton?: {
|   |   |           bones: [
|   |   |               { parent, localBind?, inverseBind?, name? }, ...
|   |   |               // parent: -1 = root; otherwise must be < own index
|   |   |               // localBind: mat4 | { position?, rotation?, scale?, euler? }
|   |   |               // inverseBind: auto-computed from the bind pose if omitted
|   |   |               // name: optional. Defaults to "Bone_<index>"
|   |   |           ],
|   |   |       },
|   |   |   })
|   |   |   |-- Behind the scenes this also creates:
|   |   |   |     .assets.meshes["<key>_mesh"]        the EzMesh3D
|   |   |   |     .assets.skeletons["<key>_skeleton"] the EzSkeleton3D (when present)
|   |   |-- .remove(key)                     drops the model and its instances.
|   |   |                                    Mesh/skeleton entries are kept - remove
|   |   |                                    them separately to free the GL buffers.
|   |   |-- .read(key)                       -> { key, defaultShader, meshKey, skeletonKey,
|   |                                              primitives, indexCount, boneCount,
|   |                                              morphTotalWeights }
|   |
|   |-- .meshes                              lower-level geometry handles  (see § EzMesh3D)
|   |   |-- Created automatically by .models.add. Touch these only to share
|   |   |   geometry between models, or to .add an EzMesh3D you built via
|   |   |   EzMesh3D.fromDesc yourself.
|   |
|   |-- .skeletons                           lower-level rig handles  (see § EzSkeleton3D)
|   |   |-- Same story as .meshes - created for you, manageable by hand if needed.
|   |
|   |-- .<custom>                            roll your own namespace
|   |   |-- ez.assets.register(name, hooks)
|   |   |     hooks.add(map, key, value)     return false to reject, else stored
|   |   |     hooks.remove(map, key)         cleanup before deletion
|   |   |     hooks.<any>(map, ...args)      any other key becomes a method on the namespace
|   |   |-- ez.assets.namespaces() -> string[]
|   |
|   |-- Shortcuts on EzCanvas3D itself (just aliases for .assets.<x>):
|       |-- ez.shaders     -> ez.assets.shaders
|       |-- ez.models      -> ez.assets.models
|       |-- ez.textures    -> ez.assets.textures
|       |-- ez.meshes      -> ez.assets.meshes
|       |-- ez.skeletons   -> ez.assets.skeletons
|
|-- Instances - one entry of a model in the scene
|   |-- addInstance(modelKey, init?) -> instKey
|   |   |-- init.shader: optional override (must share the same instanceData layout)
|   |   |-- init.data / init.bone / init.morph / init.display: forwarded to writeInstance
|   |-- writeInstance(key, { data?, bone?, morph?, display?, shader? })
|   |   |-- data:    keyed by your shader's instanceData names
|   |   |   |-- mat4  - Float32Array(16) OR { position?, rotation?(quat), scale?, euler?(ZYX deg) }
|   |   |   |-- vec*  - array / Float32Array of matching length
|   |   |   |-- float - number
|   |   |-- bone:    { id, transform } OR array of those         (skinned models only)
|   |   |             transform: mat4 | { position?, rotation?, scale?, euler? }
|   |   |-- morph:   [w0, w1, ...]  OR  { offset, weights: [...] }
|   |   |             total weight count = sum of morphTargets counts across primitives
|   |   |-- display: false hides this instance for one or more frames (default true)
|   |   |-- shader:  swap the shader at runtime (compatibility rules above)
|   |-- readInstance(key)         -> snapshot { modelKey, data, bonePoses, morphWeights, display }
|   |-- removeInstance(key)
|
|-- render()                                 call once per animation frame

EzShader3D  (extends EzShader)
new EzShader3D().describe({ vertex, fragment, uniKeys?, onbind?, renderCfg? })
|-- vertex
|   |-- attributes:    [{ name, size: 1..4, default?: [r,g,b,a] }]
|   |                    `default` is used when a model doesn't supply this attribute.
|   |-- instanceData:  [{ name, type?, default? }]
|   |                    type: "mat4" | "vec4" | "vec3" | "vec2" | "float"  (default "vec4")
|   |                    `name` is the key you use in writeInstance({ data: { ... } }).
|   |-- defaultKeys:   { view?, projection? }
|   |                    Names a uniform; the engine auto-binds the camera matrices.
|   |-- hasSkeleton:   bool. Gives you in GLSL:
|   |                    mat4 computeSkin(vec4 boneID, vec4 boneWeight);
|   |                    mat4 fetchBone(int id);
|   |-- morphChannels: string[]. Channel names matching primitive morphTargets keys.
|   |                    Gives you in GLSL:
|   |                    vec3 applyMorph(int channelIdx, int vertexLocal);
|   |                    int  morphVertexLocal();    // gl_VertexID local to the primitive
|   |-- outputs:       [{ name, type? }]   varyings to the fragment stage (type default vec4)
|   |-- main:          GLSL body (no `void main` wrapper)
|-- fragment
|   |-- defaultKeys:   { fill?, albedo? }
|   |                    fill   -> uniform vec4,      bound per-primitive material.fill
|   |                    albedo -> uniform sampler2D, bound per-primitive material.albedo
|   |-- outputColor:   out variable name (default "fragColor")
|   |-- main:          GLSL body
|-- uniKeys:  [{ name, type }] custom uniforms emitted to both stages.
|             Supported: mat4, mat3, vec4, vec3, vec2, float, int, bool,
|                        sampler2D, "highp sampler2D".
|             Sampler uniforms get texture units assigned for you; the unit map
|             lives on `shader.texUnits[name]`.
|-- onbind(gl, program): called every draw - use it to upload your uniKeys
|                        and bind any sampler textures.
|-- renderCfg
    |-- rQueue       draw order. Lower = earlier. Default 1000.
    |                Sky-style backgrounds use 0; transparent overlays use ~2000+.
    |-- depthWrite   default true
    |-- depthTest    default true
    |-- blend        default false
    |-- blendSrc / blendDst   gl blend factors. Default SRC_ALPHA / ONE_MINUS_SRC_ALPHA.
                              See EzShader.BLEND for named constants.
    |-- cull         'back' (default) | 'front' | 'none'.
    |                'back'  : standard opaque rendering.
    |                'front' : inverted-hull tricks (outline / shell).
    |                'none'  : two-sided sheets, particles, billboards.

A shader must be `.describe(...)`d before `.assets.shaders.add(key, shader)`;
the engine compiles it for you on add.

EzShader  (low-level base - most users don't touch this directly)
|-- compile(vertSrc, fragSrc, gl) -> self
|-- bind(gl) / applyRenderState(gl)
|-- static .BLEND   named gl blend factor constants

EzMesh3D
|-- static EzMesh3D.fromDesc(gl, shader, key, opts) -> EzMesh3D | false
|   |-- opts: { vertices, indices?, attributes?, primitives? }
|   |          (same shape as the corresponding fields on models.add)
|   |-- Returns false on validation error (and console-warns the reason).
|-- .destroy(gl)             frees its VAO, VBOs, and morph delta textures
|-- .primitives              array of draw ranges, each with material + optional morph info
|-- .morphTotalWeights       total number of morph weight slots used by this mesh

EzSkeleton3D
|-- static EzSkeleton3D.fromDesc(key, { bones }) -> EzSkeleton3D | null | false
|   |-- null  if no skeleton was provided
|   |-- false on validation error (e.g. parent index >= self)
|-- .computePalette(bonePoses) -> Float32Array(boneCount * 16)
|                                  ready-to-upload skinning matrix palette
|-- .bones                     read-only [{ parent, localBind, inverseBind, name }, ...]

EzRender  (static-only GL utility - dimension-agnostic, no 3D math)
|-- static bind(gl, program, onbind?)             useProgram + optional onbind(gl, program) callback
|-- static applyState(gl, cfg)                    apply a renderCfg  { depthWrite, depthTest, blend, blendSrc, blendDst, cull }
|-- static restoreDefaultState(gl)                reset to sane defaults after a manual render loop
|-- static withVAO(gl, vao, fn)                   bind vao → fn() → unbind, guaranteed via try/finally
|-- static uploadVBO(gl, vbo, data, usage?)       sub-data upload with capacity-doubling growth strategy
|-- static wireAttr(gl, { buffer, loc, size, … }) vertexAttribPointer + optional divisor; skips if loc < 0
|-- static setConstAttrs(gl, list)                vertexAttrib4f for shader attributes not backed by a buffer
|-- static setUniforms(gl, program, list)         list: [{ loc|name, type, value }]  types: mat4/3 vec4/3/2 float int bool
|-- static bindSampler(gl, loc, unit, tex, target?)  activeTexture + bindTexture + uniform1i in one call
|-- static createTexture(gl, { data, width, height, format, … }) -> WebGLTexture   full options, mipmap support
|-- static uploadTexture2D(gl, existing, internalFmt, fmt, type, w, h, data, unit?) -> WebGLTexture
|                                                 fast re-upload for frequently changing textures (skinning, morph)
|-- static SCRATCH_TEX_UNIT = 15                  internal unit used by uploadTexture2D; don't use unit 15 yourself
|-- static drawInstanced(gl, drawCfg, instanceCount)   drawCfg: { indexed, indexCount, indexType, indexOffset } or { vertexOffset, vertexCount }
|-- static packInstanceRow(arr, offFloats, data, layout)   write one instance row into a pre-allocated Float32Array
|-- static packInstances(dataArray, layout) -> Float32Array | null   pack all instances; layout from shader.instanceLayout
*/

(function () {

    class _c {
        static warn(TAG, ...a) { console.warn(TAG, ...a); return false; }
        static err(TAG, ...a) { console.error(TAG, ...a) }
    }

    class _is {
        static str = v => typeof v === "string" && v.trim() !== "";
        static obj = v => typeof v === "object" && v !== null;
        static POT = n => n > 0 && (n & (n - 1)) === 0; // Power of 2?
        static sampler = t => t === "sampler2D" || t === "highp sampler2D"
    }

    class EzMath {
        static clamp = (p, min, max) => Math.max(min, Math.min(max, p));

        // all mat are column major

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
                if (!det) return EzMath.Mat4.identity();
                const id = 1 / det;
                return new Float32Array([ // Son :wilted_rose:
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

            ortho(left, right, bottom, top, near, far) {
                const lr = 1/(left-right), bt = 1/(bottom-top), nf = 1/(near-far);
                return new Float32Array([
                    -2*lr,            0,                0,              0,
                    0,                -2*bt,            0,              0,
                    0,                0,                2*nf,           0,
                    (left+right)*lr,  (top+bottom)*bt,  (far+near)*nf,  1,
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
                if (!_is.obj(t)) return existing ?? EzMath.Mat4.identity();
                const pos   = t.position ?? [existing?.[12]??0, existing?.[13]??0, existing?.[14]??0];
                const scale = t.scale ?? [1,1,1];
                const quat  = t.euler ? EzMath.Quat.fromEulerZYX(t.euler) : (t.rotation ?? [0,0,0,1]);
                return EzMath.Mat4.compose(pos, quat, scale);
            },

            transformVec3(m, v) {
                const x = v[0], y = v[1], z = v[2];
                const w = m[3]*x + m[7]*y + m[11]*z + m[15];
                return [
                    (m[0]*x + m[4]*y + m[8]*z + m[12]) / w,
                    (m[1]*x + m[5]*y + m[9]*z + m[13]) / w,
                    (m[2]*x + m[6]*y + m[10]*z + m[14]) / w,
                ];
            },

            transformVec3Normal(m3, v) {
                const x = v[0], y = v[1], z = v[2];
                const rx = m3[0]*x + m3[3]*y + m3[6]*z;
                const ry = m3[1]*x + m3[4]*y + m3[7]*z;
                const rz = m3[2]*x + m3[5]*y + m3[8]*z;
                const len = Math.hypot(rx, ry, rz) || 1;
                return [rx/len, ry/len, rz/len];
            },

            normalMat3(m) {
                const a00=m[0], a01=m[1], a02=m[2];
                const a10=m[4], a11=m[5], a12=m[6];
                const a20=m[8], a21=m[9], a22=m[10];
                const b00 = a11*a22 - a12*a21, b01 = a12*a20 - a10*a22, b02 = a10*a21 - a11*a20;
                const b10 = a02*a21 - a01*a22, b11 = a00*a22 - a02*a20, b12 = a01*a20 - a00*a21;
                const b20 = a01*a12 - a02*a11, b21 = a02*a10 - a00*a12, b22 = a00*a11 - a01*a10;
                const det = a00*b00 + a01*b01 + a02*b02;
                if (!det) return [1,0,0, 0,1,0, 0,0,1];
                const id = 1 / det;
                return [
                    b00*id, b10*id, b20*id,
                    b01*id, b11*id, b21*id,
                    b02*id, b12*id, b22*id,
                ];
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
                const qY = EzMath.Quat.fromAxisAngle([0, 1, 0],  yawDeg   * d2r);
                const qP = EzMath.Quat.fromAxisAngle([1, 0, 0],  pitchDeg * d2r);
                const q  = EzMath.Quat.normalize(EzMath.Quat.multiply(qY, qP));
                if (!rollDeg) return q;
                return EzMath.Quat.normalize(EzMath.Quat.multiply(q, EzMath.Quat.fromAxisAngle([0, 0, -1], rollDeg * d2r)));
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
                if (dot > 0.9995) return EzMath.Quat.normalize([ax+t*(bx-ax), ay+t*(by-ay), az+t*(bz-az), aw+t*(bw-aw)]);
                const th0 = Math.acos(dot), th = th0*t;
                const s0 = Math.cos(th) - dot*Math.sin(th)/Math.sin(th0), s1 = Math.sin(th)/Math.sin(th0);
                return [s0*ax+s1*bx, s0*ay+s1*by, s0*az+s1*bz, s0*aw+s1*bw];
            },

            toEulerYPR([x, y, z, w]) {
                const r2d = 180 / Math.PI;
                const sp = 2 * (w * x - y * z);            // = sin(pitch)
                const pitch = Math.abs(sp) >= 0.999999
                    ? Math.sign(sp) * 90
                    : Math.asin(sp) * r2d;
                if (Math.abs(sp) >= 0.999999) {
                    const yaw = Math.atan2(-2 * (x * y - w * z), 1 - 2 * (y * y + z * z)) * r2d;
                    return { yaw, pitch, roll: 0 };
                }
                const yaw = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) * r2d;
                const roll = -Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) * r2d;
                return { yaw, pitch, roll };
            },
        };
    }

    const TAGRENDER = "[EzRender]";
    class EzRender {
        static bind(gl, program, onbind=null) {
            gl.useProgram(program);
            if (onbind) onbind(gl, program);
        }

        static applyState(gl, cfg) {
            if (!cfg) return;
            const hasProp = (prop) => Object.prototype.hasOwnProperty.call(cfg, prop);

            // if (Object.prototype.hasOwnProperty.call(cfg, 'depthWrite')) {
            if (hasProp('depthWrite')) gl.depthMask(!!cfg.depthWrite);
            if (hasProp('depthTest')) {
                cfg.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
            }
            if (hasProp('blend')) {
                cfg.blend ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);

                if (cfg.blend && (hasProp('blendSrc') || hasProp('blendDst'))) {
                    gl.blendFunc(cfg.blendSrc ?? gl.SRC_ALPHA, cfg.blendDst ?? gl.ONE_MINUS_SRC_ALPHA);
                }
            }
            if (hasProp('cull')) {
                switch (cfg.cull) {
                    case 'none':  gl.disable(gl.CULL_FACE); break;
                    case 'front': gl.enable(gl.CULL_FACE);  gl.cullFace(gl.FRONT); break;
                    default:      gl.enable(gl.CULL_FACE);  gl.cullFace(gl.BACK);  break;
                }
            }
            if (hasProp('clear') && cfg.clear) {
                const list = Array.isArray(cfg.clear) ? cfg.clear : [cfg.clear];
                let mask = 0;
                for (const k of list) {
                    switch (k) {
                        case 'color':   mask |= gl.COLOR_BUFFER_BIT; break;
                        case 'depth':   mask |= gl.DEPTH_BUFFER_BIT; break;
                        case 'stencil': mask |= gl.STENCIL_BUFFER_BIT; break;
                    }
                }
                if (mask) gl.clear(mask);
            }
        }

        static restoreDefaultState(gl) {
            gl.depthMask(true);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        static withVAO(gl, vao, fn) {
            gl.bindVertexArray(vao);
            try { fn(); }
            finally { gl.bindVertexArray(null); }
        }


        static uploadVBO(gl, vbo, data, usage) {
            const need = data.byteLength;
            const cap  = vbo._ezCapacity | 0;
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            if (need > 0 && need <= cap) {
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
            } else {
                const grow   = Math.ceil(cap * 1.5);
                const newCap = Math.max(need, grow);
                gl.bufferData(gl.ARRAY_BUFFER, newCap, usage ?? gl.DYNAMIC_DRAW);
                if (need > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
                vbo._ezCapacity = newCap;
            }
        }

        static setConstAttrs(gl, list) {
            for (const a of list) {
                const v = a.value ?? a.default ?? [0,0,0,0];
                gl.vertexAttrib4f(a.loc, v[0]??0, v[1]??0, v[2]??0, v[3]??0);
            }
        }

        static wireAttr(gl, { buffer, loc, size, type, normalized, stride, offset, divisor, enabled }) {
            if (loc == null || loc === -1) return;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            if (enabled !== false) gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, type ?? gl.FLOAT, !!normalized, stride ?? 0, offset ?? 0);
            if (divisor) gl.vertexAttribDivisor(loc, divisor);
        }

        static #UNI = {
            mat4:  (gl, loc, v) => gl.uniformMatrix4fv(loc, false, v),
            mat3:  (gl, loc, v) => gl.uniformMatrix3fv(loc, false, v),
            vec4:  (gl, loc, v) => gl.uniform4fv(loc, v),
            vec3:  (gl, loc, v) => gl.uniform3fv(loc, v),
            vec2:  (gl, loc, v) => gl.uniform2fv(loc, v),
            float: (gl, loc, v) => gl.uniform1f(loc, v),
            int:   (gl, loc, v) => gl.uniform1i(loc, v),
            bool:  (gl, loc, v) => gl.uniform1i(loc, v ? 1 : 0),
        };

        static getUniformLocation(gl, program, name) {
            if (!program || !name) return null;
            if (!program._ezUniformLocCache) program._ezUniformLocCache = new Map();
            const cache = program._ezUniformLocCache;
            if (cache.has(name)) return cache.get(name);
            const loc = gl.getUniformLocation(program, name);
            cache.set(name, loc);
            return loc;
        }

        static setUniform(gl, program, type, nameOrLoc, value) {
            const setter = EzRender.#UNI[type];
            if (!setter) return null;
            const isName = typeof nameOrLoc === 'string' 
            const loc = isName ? EzRender.getUniformLocation(gl, program, nameOrLoc) : nameOrLoc;
            if (loc == null) return null;
            setter(gl, loc, value);
            return loc;
        }

        static setUniforms(gl, program, list) {
            for (const u of list) {
                const key = (u.loc !== undefined) ? u.loc : u.name;
                EzRender.setUniform(gl, program, u.type, key, u.value);
            }
        }

        static bindSampler(gl, loc, unit, tex, target) {
            if (loc == null) return;
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(target ?? gl.TEXTURE_2D, tex);
            gl.uniform1i(loc, unit);
        }

        static createTexture(gl, {
            data, width = 1, height = 1,
            format = gl.RGBA, internalFormat = format, type = gl.UNSIGNED_BYTE,
            wrapS = gl.CLAMP_TO_EDGE, wrapT = gl.CLAMP_TO_EDGE,
            minFilter = gl.LINEAR, magFilter = gl.LINEAR,
            mipmap = false, flipY = false, premultiplyAlpha = false,
        }) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha);

            const isImageSrc = data instanceof ImageBitmap || data instanceof HTMLImageElement || data instanceof HTMLCanvasElement;
            if (isImageSrc) gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, format, type, data);
            else            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

            if (mipmap && _is.POT(width) && _is.POT(height)) {
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
            }

            gl.bindTexture(gl.TEXTURE_2D, null);
            return tex;
        }

        static uploadTexture2D(gl, existing, internalFmt, fmt, type, w, h, data, unit = null) {
            const tex = existing ?? gl.createTexture();
            const explicit = unit != null;
            const prevActive = explicit ? 0 : gl.getParameter(gl.ACTIVE_TEXTURE);
            gl.activeTexture(gl.TEXTURE0 + (explicit ? unit : EzRender.SCRATCH_TEX_UNIT));
            gl.bindTexture(gl.TEXTURE_2D, tex);
            if (!existing) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, data);
            if (!explicit) gl.activeTexture(prevActive);
            return tex;
        }
        static SCRATCH_TEX_UNIT = 15;


        static drawInstanced(gl, drawCfg, instanceCount) {
            const mode = drawCfg.mode ?? gl.TRIANGLES;
            if (drawCfg.indexed) {
                gl.drawElementsInstanced(mode, drawCfg.indexCount, drawCfg.indexType, drawCfg.indexOffset, instanceCount);
            } else {
                gl.drawArraysInstanced(mode, drawCfg.vertexOffset, drawCfg.vertexCount, instanceCount);
            }
        }


        static packInstanceRow(arr, offFloats, data, layout) {
            for (const e of layout.entries) {
                const src = data[e.name];
                if (src) arr.set(src, offFloats + (e.byteOffset >> 2));
            }
        }

        static packInstances(dataArray, layout) {
            const stride = layout.strideFloats;
            if (stride === 0) return null;
            const flat = new Float32Array(dataArray.length * stride);
            for (let i = 0; i < dataArray.length; i++)
                EzRender.packInstanceRow(flat, i * stride, dataArray[i], layout);
            return flat;
        }
    }

    class EzShader {
        program   = null;
        renderCfg = null;
        onbind    = null; // (gl, program) => void
        other     = {};   // free bag for metadata / subclass use

        compiled = false;

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
            this.compiled = true;
            return this;
        }

        bind(gl) {
            EzRender.bind(gl, this.program, this.onbind);
            return this;
        }

        applyRenderState(gl) { EzRender.applyState(gl, this.renderCfg); return this; }
        static restoreRenderState(gl) { EzRender.restoreDefaultState(gl); }

        static compileShader(gl, type, src) {
            const shader = gl.createShader(type);

            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                _c.err("[EzShader]", "shader compile error:", gl.getShaderInfoLog(shader));
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
                _c.err("[EzShader]", "program link error:", gl.getProgramInfoLog(program));
                return null;
            }

            gl.deleteShader(vshader);
            gl.deleteShader(fshader);
            return program;
        }
    }

    const TAGC3D = "[EzCanvas3D]";
    class EzCanvas3D {
        name    = null;
        #canvas = null;
        #gl     = null;

        get canvas() { return this.#canvas; }
        get gl()     { return this.#gl; }

        #logicalWidth  = 800;
        #logicalHeight = 600;
        #pixelRatio    = 1;
        #maxPixelRatio = 2;
        #msaaEnabled   = false;

        get info() {
            return {
                width:         this.#canvas.width,
                height:        this.#canvas.height,
                logicalWidth:  this.#logicalWidth,
                logicalHeight: this.#logicalHeight,
                aspectRatio:   this.#logicalWidth / Math.max(1e-6, this.#logicalHeight),
                pixelRatio:    this.#pixelRatio,
            };
        }

        setPixelRatio(ratio) {
            this.#pixelRatio = this.#clampPixelRatio(ratio);
            this.#applyViewportSize();
            return this.#pixelRatio;
        }

        aaInfo() {
            return {
                mode:          "msaa+ssaa",
                msaa:          this.#msaaEnabled,
                pixelRatio:    this.#pixelRatio,
                maxPixelRatio: this.#maxPixelRatio,
            };
        }

        fitContainer() {
            const parent = this.#canvas.parentElement;
            if (!parent) return this;
            const rect = parent.getBoundingClientRect();
            return this.resize(rect.width, rect.height);
        }

        constructor(name, opts = {}) {
            this.name = name || "canvas";
            const c = document.createElement("canvas");
            c.width  = 800;
            c.height = 600;
            c.style.background = "transparent";
            this.#canvas = c;

            const antialias = typeof opts.antialias === "boolean" ? opts.antialias : true;
            const gl = c.getContext("webgl2", { alpha: true, antialias });
            if (!gl) throw new Error(`${TAGC3D} WebGL2 not supported`);
            this.#gl = gl;

            this.#maxPixelRatio = (typeof opts.maxPixelRatio === "number" && Number.isFinite(opts.maxPixelRatio))
                ? Math.max(1, opts.maxPixelRatio)
                : 2;
            const initialPR = opts.pixelRatio ?? (typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1);
            this.#pixelRatio = this.#clampPixelRatio(initialPR);
            this.#msaaEnabled = !!gl.getContextAttributes()?.antialias;

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clearColor(0, 0, 0, 0);

            this.#applyViewportSize();
        }

        #clampPixelRatio(v) {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return 1;
            return EzMath.clamp(n, 0.5, this.#maxPixelRatio);
        }

        #applyViewportSize() {
            const drawW = Math.max(1, Math.round(this.#logicalWidth  * this.#pixelRatio));
            const drawH = Math.max(1, Math.round(this.#logicalHeight * this.#pixelRatio));

            this.#canvas.style.width  = `${this.#logicalWidth}px`;
            this.#canvas.style.height = `${this.#logicalHeight}px`;

            if (this.#canvas.width  !== drawW) this.#canvas.width  = drawW;
            if (this.#canvas.height !== drawH) this.#canvas.height = drawH;

            this.#gl.viewport(0, 0, drawW, drawH);
        }

        mount(el) {
            if (el instanceof Element) el.appendChild(this.#canvas);
            return this;
        }
        unmount() {
            this.#canvas.parentElement?.removeChild(this.#canvas);
            return this;
        }
        resize(w, h) {
            this.#logicalWidth  = Math.max(1, Math.round(w));
            this.#logicalHeight = Math.max(1, Math.round(h));
            this.#applyViewportSize();
            return this;
        }

        resetViewport() {
            this.#gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
            return this;
        }
    }

    window.EzMath          = EzMath;
    window.EzShader        = EzShader;
    window.EzRender        = EzRender;
    window.EzCanvas3D      = EzCanvas3D;

// Every thing below this line is highly specialized for 3D-object-driven rendering
// --------------------------------------------------------------------------------

    const _EZ_TEX_UNIT_MORPH_DELTA  = 3; // N channels occupy 3, 4, 5, ...
    class EzShader3D extends EzShader {
        attributes     = [];   // [{ name, size, loc, default }]
        uloc           = {};   // { view, projection, fill, albedo, bonesTex, morph:{...} }
        instanceLayout = null; // { strideFloats, entries:[{ name, type, floats, slots, loc, default }] }
        uniKeyTexUnits = [];   // [[name, unit], ...] for sampler uniKeys
        texUnits       = {};   // { [name]: unit }
        _morphChannels = [];   // morph channel names

        #descript = null;
        get described() { return this.#descript !== null; }

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
                } else def = type === "mat4" ? EzMath.Mat4.identity() : new Float32Array(spec.floats);

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
                    rQueue:     typeof rCfg.rQueue      === "number"  ? rCfg.rQueue      : 1000,
                    depthWrite: typeof rCfg.depthWrite  === "boolean" ? rCfg.depthWrite  : true,
                    depthTest:  typeof rCfg.depthTest   === "boolean" ? rCfg.depthTest   : true,
                    cull:       ['back','front','none'].includes(rCfg.cull) ? rCfg.cull : 'back',
                    blend:      typeof rCfg.blend       === "boolean" ? rCfg.blend       : false,
                    blendSrc:   rCfg.blendSrc ?? EzShader.BLEND.SRC_ALPHA,
                    blendDst:   rCfg.blendDst ?? EzShader.BLEND.ONE_MINUS_SRC_ALPHA,
                },
            };

            super.compiled = false;
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

            super.compiled = true
            return this;
        }
    }


    class EzCamera3D {
        position    = [0, 0, 3];
        orientation = [0, 0, 0, 1];

        near = 0.1; far = 1000;
        fov  = 45;
        aspect = 1;

        orthographic = false;
        orthoSize    = 5;   // half-height of the view in world units

        constructor() {}

        get yaw()   { return EzMath.Quat.toEulerYPR(this.orientation).yaw;   }
        get pitch() { return EzMath.Quat.toEulerYPR(this.orientation).pitch; }
        get roll()  { return EzMath.Quat.toEulerYPR(this.orientation).roll;  }

        get forward() { return EzMath.Quat.rotateVec(this.orientation, [0, 0, -1]); }
        get right()   { return EzMath.Quat.rotateVec(this.orientation, [1, 0,  0]); }
        get up()      { return EzMath.Quat.rotateVec(this.orientation, [0, 1,  0]); }
        get vectors() { return { forward: this.forward, right: this.right, up: this.up }; }

        get view() {
            const f = this.forward, u = this.up, p = this.position;
            return EzMath.Mat4.lookAt(
                p, [p[0] + f[0], p[1] + f[1], p[2] + f[2]], u
            );
        }

        get projection() {
            if (this.orthographic) {
                const h = this.orthoSize, w = h * this.aspect;
                return EzMath.Mat4.ortho(-w, w, -h, h, this.near, this.far);
            }
            return EzMath.Mat4.perspective(
                this.fov * (Math.PI / 180), this.aspect, this.near, this.far
            );
        }

        set(cfg = {}) {
            if (cfg.position    != null) this.position    = [...cfg.position];
            if (cfg.orientation != null) this.orientation = EzMath.Quat.normalize(cfg.orientation);
            if (cfg.near        != null) this.near        = cfg.near;
            if (cfg.far         != null) this.far         = cfg.far;
            if (cfg.aspect      != null) this.aspect      = cfg.aspect;
            if (cfg.fov          != null) this.fov          = cfg.fov;
            if (cfg.orthoSize    != null) this.orthoSize    = cfg.orthoSize;
            if (cfg.orthographic != null) this.orthographic = !!cfg.orthographic;
            return this;
        }

        rotate(yawDelta = 0, pitchDelta = 0, rollDelta = 0) {
            const d2r = Math.PI / 180;
            let q = this.orientation;
            if (yawDelta) {
                const qY = EzMath.Quat.fromAxisAngle([0, 1, 0], yawDelta * d2r);
                q = EzMath.Quat.multiply(qY, q);
            }
            if (pitchDelta) {
                const qX = EzMath.Quat.fromAxisAngle([1, 0, 0], pitchDelta * d2r);
                q = EzMath.Quat.multiply(q, qX);
            }
            if (rollDelta) {
                const qZ = EzMath.Quat.fromAxisAngle([0, 0, -1], rollDelta * d2r);
                q = EzMath.Quat.multiply(q, qZ);
            }
            this.orientation = EzMath.Quat.normalize(q);
            return this;
        }

        lookAt(target, up = [0, 1, 0]) {
            const px = this.position[0], py = this.position[1], pz = this.position[2];
            let fx = target[0] - px, fy = target[1] - py, fz = target[2] - pz;
            const fl = Math.hypot(fx, fy, fz);
            if (fl < 1e-8) return this;
            fx /= fl; fy /= fl; fz /= fl;

            let rx = fy * up[2] - fz * up[1];
            let ry = fz * up[0] - fx * up[2];
            let rz = fx * up[1] - fy * up[0];
            let rl = Math.hypot(rx, ry, rz);
            if (rl < 1e-6) {
                const altUp = Math.abs(fy) > 0.9 ? [0, 0, 1] : [0, 1, 0];
                rx = fy * altUp[2] - fz * altUp[1];
                ry = fz * altUp[0] - fx * altUp[2];
                rz = fx * altUp[1] - fy * altUp[0];
                rl = Math.hypot(rx, ry, rz) || 1;
            }
            rx /= rl; ry /= rl; rz /= rl;
            const ux = ry * fz - rz * fy;
            const uy = rz * fx - rx * fz;
            const uz = rx * fy - ry * fx;

            const m00 = rx,  m01 = ux,  m02 = -fx;
            const m10 = ry,  m11 = uy,  m12 = -fy;
            const m20 = rz,  m21 = uz,  m22 = -fz;

            const tr = m00 + m11 + m22;
            let qx, qy, qz, qw;
            if (tr > 0) {
                const s = Math.sqrt(tr + 1) * 2;
                qw = 0.25 * s;
                qx = (m21 - m12) / s;
                qy = (m02 - m20) / s;
                qz = (m10 - m01) / s;
            } else if (m00 > m11 && m00 > m22) {
                const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
                qw = (m21 - m12) / s;
                qx = 0.25 * s;
                qy = (m01 + m10) / s;
                qz = (m02 + m20) / s;
            } else if (m11 > m22) {
                const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
                qw = (m02 - m20) / s;
                qx = (m01 + m10) / s;
                qy = 0.25 * s;
                qz = (m12 + m21) / s;
            } else {
                const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
                qw = (m10 - m01) / s;
                qx = (m02 + m20) / s;
                qy = (m12 + m21) / s;
                qz = 0.25 * s;
            }
            this.orientation = EzMath.Quat.normalize([qx, qy, qz, qw]);
            return this;
        }

        raygen(ndc) {
            const x = ndc[0], y = ndc[1];

            const forward = this.forward;
            const right   = this.right;
            const up      = this.up;

            if (!this.orthographic) { // Perspective
                const tanFov = Math.tan((this.fov * Math.PI / 180) * 0.5);

                const px = x * this.aspect * tanFov;
                const py = y * tanFov;

                let dir = [
                    forward[0] + right[0] * px + up[0] * py,
                    forward[1] + right[1] * px + up[1] * py,
                    forward[2] + right[2] * px + up[2] * py,
                ];

                const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
                dir = [dir[0]/len, dir[1]/len, dir[2]/len];

                return {
                    origin: [...this.position],
                    direction: dir
                };
            } else { // Orthographic
                const h = this.orthoSize;
                const w = h * this.aspect;

                const offset = [
                    right[0] * (x * w) + up[0] * (y * h),
                    right[1] * (x * w) + up[1] * (y * h),
                    right[2] * (x * w) + up[2] * (y * h),
                ];

                const origin = [
                    this.position[0] + offset[0],
                    this.position[1] + offset[1],
                    this.position[2] + offset[2],
                ];

                return {
                    origin,
                    direction: [...forward]
                };
            }
        }

        translate(offset) {
            this.position = [
                this.position[0] + offset[0],
                this.position[1] + offset[1],
                this.position[2] + offset[2]
            ];
            return this;
        }
    }

    class EzMesh3D {
        vao               = null;
        vbo               = null;
        ebo               = null;
        instanceVBO       = null;
        indexType         = 0;
        indexBytes        = 0;
        primitives        = [];   // [{ indexOffset?, indexCount?, vertexOffset?, vertexCount?, material, morph? }]
        defaulted         = [];   // [{ loc, default }]
        morphTotalWeights = 0;

        destroy(gl) {
            if (this.vao)         gl.deleteVertexArray(this.vao);
            if (this.vbo)         gl.deleteBuffer(this.vbo);
            if (this.ebo)         gl.deleteBuffer(this.ebo);
            if (this.instanceVBO) gl.deleteBuffer(this.instanceVBO);
            for (const p of this.primitives)
                if (p.morph) for (const t of p.morph.channels.values()) gl.deleteTexture(t);
        }

        static fromDesc(gl, shader, key, opts = {}) {
            const { vertices, indices, attributes, primitives } = opts;

            const indexType  = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
            const indexBytes = indices instanceof Uint32Array ? 4 : 2;
            const hasVertices = !!vertices;

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
                            return _c.warn(`[EzMesh3D]`, `"${key}": primitive index range out of bounds`);
                    } else {
                        if (p.vertexOffset < 0 || p.vertexOffset + p.vertexCount > vertexCount)
                            return _c.warn(`[EzMesh3D]`, `"${key}": primitive vertex range out of bounds`);
                    }
                }
            }

            let morphTotalWeights = 0;
            const shaderMorphChannels = shader._morphChannels ?? [];

            for (const p of primList) {
                const channelsIn = p._morphSrc; delete p._morphSrc;
                if (!channelsIn) continue;
                if (!_is.obj(channelsIn) || Array.isArray(channelsIn))
                    return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets must be an object keyed by channel name`);

                const channelNames = Object.keys(channelsIn);
                let targetCount = -1;
                for (const name of channelNames) {
                    const arr = channelsIn[name];
                    if (arr == null) continue;
                    if (!Array.isArray(arr))
                        return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets.${name} must be an array`);
                    if (targetCount < 0) targetCount = arr.length;
                    else if (arr.length !== targetCount)
                        return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets channel "${name}" has ${arr.length} targets, expected ${targetCount}`);
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
                    channels:     new Map(),
                };

                for (const chName of channelNames) {
                    const arr = channelsIn[chName];
                    if (arr == null) continue;
                    const chIdx = shaderMorphChannels.length > 0
                        ? shaderMorphChannels.indexOf(chName)
                        : channelNames.indexOf(chName);
                    if (chIdx < 0)
                        return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets channel "${chName}" not declared in shader's vertex.morphChannels`);

                    const expected = vCount * 3;
                    for (let t = 0; t < targetCount; t++) {
                        if (!arr[t] || arr[t].length !== expected)
                            return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets.${chName}[${t}] length must be ${expected} (vertexCount*3), got ${arr[t]?.length}`);
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
                    p.morph.channels.set(chIdx, EzRender.uploadTexture2D(gl, null, gl.RGB32F, gl.RGB, gl.FLOAT, targetCount, vCount, packed));
                }

                morphTotalWeights += targetCount;
            }

            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);

            const vbo = gl.createBuffer();
            if (hasVertices) {
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
                for (const w of wired)
                    EzRender.wireAttr(gl, { buffer: vbo, loc: w.loc, size: w.size, stride: vaoStride, offset: w.offset });
            }
            for (const d of defaulted) gl.disableVertexAttribArray(d.loc);

            const ebo = indices ? gl.createBuffer() : null;
            if (ebo) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            }

            const instanceVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
            const instLayout = shader.instanceLayout;
            for (const e of instLayout.entries) {
                if (e.loc < 0) continue;
                if (e.type === "mat4") {
                    for (let col = 0; col < 4; col++)
                        EzRender.wireAttr(gl, { buffer: instanceVBO, loc: e.loc + col, size: 4, stride: instLayout.strideBytes, offset: e.byteOffset + col * 16, divisor: 1 });
                } else {
                    EzRender.wireAttr(gl, { buffer: instanceVBO, loc: e.loc, size: e.floats, stride: instLayout.strideBytes, offset: e.byteOffset, divisor: 1 });
                }
            }
            gl.bindVertexArray(null);

            const mesh = new EzMesh3D();
            mesh.vao               = vao;
            mesh.vbo               = vbo;
            mesh.ebo               = ebo;
            mesh.instanceVBO       = instanceVBO;
            mesh.indexType         = indexType;
            mesh.indexBytes        = indexBytes;
            mesh.primitives        = primList;
            mesh.defaulted         = defaulted;
            mesh.morphTotalWeights = morphTotalWeights;
            return mesh;
        }
    }

    class EzSkeleton3D {
        bones = []; // [{ parent, localBind: Float32Array(16), inverseBind: Float32Array(16), name: string }]

        computePalette(bonePoses) {
            const n = this.bones.length;
            const globalCurrent = new Array(n);
            const palette = new Float32Array(n * 16);
            for (let i = 0; i < n; i++) {
                const b = this.bones[i];
                const local = EzMath.Mat4.multiply(b.localBind, bonePoses[i]);
                globalCurrent[i] = b.parent < 0 ? local : EzMath.Mat4.multiply(globalCurrent[b.parent], local);
                palette.set(EzMath.Mat4.multiply(globalCurrent[i], b.inverseBind), i * 16);
            }
            return palette;
        }

        static fromDesc(key, skeleton) {
            if (!skeleton || !Array.isArray(skeleton.bones) || skeleton.bones.length === 0) return null;
            const bones = [], globalBind = [];
            for (let i = 0; i < skeleton.bones.length; i++) {
                const b = skeleton.bones[i];
                const parent = b.parent ?? -1;
                if (parent >= i)
                    return _c.warn(`[EzSkeleton3D]`, `"${key}": bone ${i} parent must be < self`) || null;
                const localBind = EzMath.Mat4.resolveTransform(b.localBind ?? null, null);
                const gb = parent < 0 ? localBind : EzMath.Mat4.multiply(globalBind[parent], localBind);
                globalBind[i] = gb;
                const inverseBind = b.inverseBind instanceof Float32Array && b.inverseBind.length === 16
                    ? b.inverseBind
                    : EzMath.Mat4.invert(gb);
                bones.push({ parent, localBind, inverseBind, name: typeof b.name === "string" ? b.name : `Bone_${i}` });
            }
            const skel = new EzSkeleton3D();
            skel.bones = bones;
            return skel;
        }
    }

    window.EzShader3D      = EzShader3D;
    window.EzMesh3D        = EzMesh3D;
    window.EzSkeleton3D    = EzSkeleton3D;
    window.EzCamera3D      = EzCamera3D;

})();