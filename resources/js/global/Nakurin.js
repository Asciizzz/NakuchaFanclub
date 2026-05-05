// Live Nakuru entity that is semi-sentient and can be interacted with.
// Well, it's pretty not-sentient, since you DO have to be the one to define its behavior
// We do have a collection of animations and physical properties, that's pretty cool

// require: EzCanvas3D.js, EzLoaderBeta.js

(function() {

    const ATTRIBUTES = [
        { name: "a_position",   size: 3 },
        { name: "a_normal",     size: 3 },
        { name: "a_uv",         size: 2 },
        { name: "a_boneID",     size: 4 },
        { name: "a_boneWeight", size: 4 },
    ];

    const SKIN_GLSL = `
        int _base = gl_InstanceID * u_bonesPerInst;
        ivec4 _ids = ivec4(a_boneID);
        mat4 _b0 = mat4(
            texelFetch(u_bonesTex, ivec2(0, _base + _ids.x), 0),
            texelFetch(u_bonesTex, ivec2(1, _base + _ids.x), 0),
            texelFetch(u_bonesTex, ivec2(2, _base + _ids.x), 0),
            texelFetch(u_bonesTex, ivec2(3, _base + _ids.x), 0));
        mat4 _b1 = mat4(
            texelFetch(u_bonesTex, ivec2(0, _base + _ids.y), 0),
            texelFetch(u_bonesTex, ivec2(1, _base + _ids.y), 0),
            texelFetch(u_bonesTex, ivec2(2, _base + _ids.y), 0),
            texelFetch(u_bonesTex, ivec2(3, _base + _ids.y), 0));
        mat4 _b2 = mat4(
            texelFetch(u_bonesTex, ivec2(0, _base + _ids.z), 0),
            texelFetch(u_bonesTex, ivec2(1, _base + _ids.z), 0),
            texelFetch(u_bonesTex, ivec2(2, _base + _ids.z), 0),
            texelFetch(u_bonesTex, ivec2(3, _base + _ids.z), 0));
        mat4 _b3 = mat4(
            texelFetch(u_bonesTex, ivec2(0, _base + _ids.w), 0),
            texelFetch(u_bonesTex, ivec2(1, _base + _ids.w), 0),
            texelFetch(u_bonesTex, ivec2(2, _base + _ids.w), 0),
            texelFetch(u_bonesTex, ivec2(3, _base + _ids.w), 0));
        float _wsum = a_boneWeight.x + a_boneWeight.y + a_boneWeight.z + a_boneWeight.w;
        mat4 skin = (_wsum < 0.0001)
            ? mat4(1.0)
            : a_boneWeight.x * _b0
            + a_boneWeight.y * _b1
            + a_boneWeight.z * _b2
            + a_boneWeight.w * _b3;
    `;

    const SHARED_ATTRS = [
        { name: "a_position",   size: 3, default: [0,0,0,0] },
        { name: "a_uv",         size: 2, default: [0,0,0,0] },
        { name: "a_boneID",     size: 4, default: [0,0,0,0] },
        { name: "a_boneWeight", size: 4, default: [1,0,0,0] },
    ]

    function buildFillShader() {
        return new EzShader3D().describe({
            renderCfg: { blend: true, cull: 'back', rQueue: 1000 },
            uniKeys: [
                { name: "u_bonesTex",     type: "highp sampler2D" },
                { name: "u_bonesPerInst", type: "int" },
                { name: "u_albedo",       type: "sampler2D" },
            ],
            vertex: {
                attributes: SHARED_ATTRS,
                instanceData: [
                    { name: "a_instMat4",  type: "mat4" },
                    { name: "a_instColor", type: "vec4", default: [1,1,1,1] },
                ],
                defaultKeys: { view: "u_view", projection: "u_proj" },
                outputs: [
                    { name: "v_uv",    type: "vec2" },
                    { name: "v_color", type: "vec4" },
                ],
                main: `
                    ${SKIN_GLSL}
                    vec4 worldPos = a_instMat4 * (skin * vec4(a_position, 1.0));
                    gl_Position = u_proj * u_view * worldPos;
                    v_uv    = a_uv;
                    v_color = a_instColor;
                `,
            },
            fragment: {
                defaultKeys: { fill: "u_fill" },
                outputColor: "fragColor",
                main: `
                    vec4 base = texture(u_albedo, v_uv);
                    fragColor = base * v_color * u_fill;
                `,
            },
        });
    }

    function buildOutlineShader() {
        return new EzShader3D().describe({
            renderCfg: { blend: true, cull: 'front', rQueue: 999 },
            uniKeys: [
                { name: "u_bonesTex",     type: "highp sampler2D" },
                { name: "u_bonesPerInst", type: "int" },
            ],
            vertex: {
                attributes: [
                    ...SHARED_ATTRS,
                    { name: "a_normal",     size: 3, default: [0,1,0,0] },
                ],
                instanceData: [
                    { name: "a_instMat4",         type: "mat4" },
                    // .rgb = outline color, .w = outline thickness.
                    { name: "a_instOutlineColor", type: "vec4", default: [0,0,0,0.01] },
                ],
                defaultKeys: { view: "u_view", projection: "u_proj" },
                outputs: [ { name: "v_outlineColor", type: "vec3" } ],
                main: `
                    ${SKIN_GLSL}
                    mat4 mdl   = a_instMat4 * skin;
                    vec3 wNorm = normalize(mat3(mdl) * a_normal);
                    vec3 wPos  = (mdl * vec4(a_position, 1.0)).xyz + wNorm * a_instOutlineColor.w;
                    gl_Position    = u_proj * u_view * vec4(wPos, 1.0);
                    v_outlineColor = a_instOutlineColor.rgb;
                `,
            },
            fragment: {
                outputColor: "fragColor",
                main: `fragColor = vec4(v_outlineColor, 1.0);`,
            },
        });
    }


    class Nakurin {
        /*
            Root
            |- Hip
            |  |- Chest
            |  |  |- Neck
            |  |  |  |- Head
            |  |  |     |- (Hair soon)
            |  |  |- ShoulderRight
            |  |  |  |- ForearmRight
            |  |  |- ShoulderLeft
            |  |     |- ForearmLeft
            |- ThighRight
            |  |- ShinRight
            |- ThighLeft
               |- ShinLeft
        */
        static BONE_ID = Object.freeze({
            Root:          0,
            Hip:           1,
            Chest:         2,
            Neck:          3,
            Head:          4,
            ShoulderRight: 5,
            ForearmRight:  6,
            ShoulderLeft:  7,
            ForearmLeft:   8,
            ThighRight:    9,
            ShinRight:     10,
            ThighLeft:     11,
            ShinLeft:      12,
        });
        static MODEL_URL = "/Models/Nakurin.glb";

        // pose
        position = [0, 0, 0];
        rotation = [0, 0, 0, 1];
        scale    = [1, 1, 1];
        color    = [1, 1, 1, 1];
        // .rgb = outline color, .w = outline thickness (world units).
        outlineColor = [0, 0, 0, 0.01];
        behavior = null;
        variables = {}; // for behavior
        bonePoses = null;
        t = 0;

        _sea = null;

        constructor(init = {}) {
            if (init.position) this.position = [init.position[0], init.position[1], init.position[2]];
            if (init.rotation) this.rotation = [init.rotation[0], init.rotation[1], init.rotation[2], init.rotation[3]];
            if (init.scale != null) {
                this.scale = Array.isArray(init.scale)
                    ? [init.scale[0], init.scale[1], init.scale[2]]
                    : [init.scale, init.scale, init.scale];
            }
            if (init.color)        this.color        = [...init.color];
            if (init.outlineColor) this.outlineColor = [...init.outlineColor];
            if (init.behavior)     this.behavior     = init.behavior;
        }

        boneID(idOrName) {
            if (typeof idOrName === "number") return idOrName;
            if (this._sea) {
                const id = this._sea.boneID(idOrName);
                if (id >= 0) return id;
            }
            const fallback = Nakurin.BONE_ID[idOrName];
            return fallback != null ? fallback : -1;
        }

        setBone(idOrName, transform) {
            if (!this.bonePoses) return this;
            const id = this.boneID(idOrName);
            if (id < 0 || id >= this.bonePoses.length) return this;
            this.bonePoses[id] = EzMath.Mat4.resolveTransform(transform, this.bonePoses[id]);
            return this;
        }

        resetPose() {
            if (!this.bonePoses) return this;
            for (let i = 0; i < this.bonePoses.length; i++)
                this.bonePoses[i] = EzMath.Mat4.identity();
            return this;
        }

        update(dt) {
            this.t += dt;
            if (this.behavior) this.behavior(this, dt, this.t);
        }

        get modelMat() {
            return EzMath.Mat4.compose(this.position, this.rotation, this.scale);
        }
    }


    class Nakusea {
        #gl = null; // This is the only thing you can use from EzCanvas3D

        #shaderFill    = null;
        #shaderOutline = null;
        #meshFill      = null;
        #meshOutline   = null;
        #skel          = null;

        #instances   = [];
        #boneNameMap = new Map();

        #bonesTex    = null;
        #packBuffers = new WeakMap();
        #bonesArr    = null;

        #textures      = [];
        #whiteTex      = null;
        #primAlbedoTex = [];   // WebGLTexture per fill-mesh primitive index

        #ready   = false;
        #loading = null;

        constructor(gl) {
            if (!gl) throw new Error("[Nakusea] gl is required");
            this.#gl = gl;
        }

        get ready()     { return this.#ready; }
        get boneCount() { return this.#skel ? this.#skel.bones.length : 0; }
        get count()     { return this.#instances.length; }

        // -1 if not found
        boneID(name) {
            if (this.#boneNameMap.has(name)) return this.#boneNameMap.get(name);
            const id = Nakurin.BONE_ID[name];
            return id != null ? id : -1;
        }

        async init() {
            if (this.#ready)   return this;
            if (this.#loading) return this.#loading;
            this.#loading = this.#load();
            await this.#loading;
            this.#loading = null;
            return this;
        }

        async #load() {
            const gl = this.#gl;

            this.#shaderFill    = buildFillShader().compile(gl);
            this.#shaderOutline = buildOutlineShader().compile(gl);

            const data = await EzLoaderBeta.load(Nakurin.MODEL_URL, {
                attributes: ATTRIBUTES,
                bitmaps:    true,
            });
            if (!data || !data.skeleton)
                throw new Error("[Nakusea] Nakurin model missing skeleton");

            // Build GL textures from the decoded bitmaps (no ez.textures used).
            this.#whiteTex = EzRender.createTexture(gl, {
                data: new Uint8Array([255, 255, 255, 255]),
                width: 1, height: 1,
            });
            this.#textures = [];
            if (data.bitmaps) {
                for (const [idxStr, bmp] of Object.entries(data.bitmaps)) {
                    const idx = +idxStr;
                    this.#textures[idx] = EzRender.createTexture(gl, {
                        data:   bmp.bitmap,
                        width:  bmp.width,
                        height: bmp.height,
                        mipmap: true,
                        wrapS:  gl.REPEAT,
                        wrapT:  gl.REPEAT,
                    });
                }
            }

            const primitives = data.primitives.map(p => ({
                indexOffset: p.indexOffset,
                indexCount:  p.indexCount,
                material:    { fill: p.material.fill ?? [1, 1, 1, 1] },
            }));

            this.#primAlbedoTex = data.primitives.map(p => {
                const ti = p.material.albedoTexIdx;
                return (ti != null && this.#textures[ti]) ? this.#textures[ti] : this.#whiteTex;
            });

            this.#meshFill = EzMesh3D.fromDesc(gl, this.#shaderFill, "NakurinFill", {
                vertices:   data.vertices,
                indices:    data.indices,
                attributes: ATTRIBUTES,
                primitives,
            });
            if (!this.#meshFill) throw new Error("[Nakusea] failed to build fill mesh");

            this.#meshOutline = EzMesh3D.fromDesc(gl, this.#shaderOutline, "NakurinOutline", {
                vertices:   data.vertices,
                indices:    data.indices,
                attributes: ATTRIBUTES,
                primitives,
            });
            if (!this.#meshOutline) throw new Error("[Nakusea] failed to build outline mesh");

            const skel = EzSkeleton3D.fromDesc("Nakurin", data.skeleton);
            if (!skel) throw new Error("[Nakusea] failed to build Nakurin skeleton");
            this.#skel = skel;

            for (let i = 0; i < skel.bones.length; i++)
                this.#boneNameMap.set(skel.bones[i].name, i);

            this.#ready = true;
        }

        spawn(init = {}) {
            if (!this.#ready) return null;
            const n = new Nakurin(init);
            n._sea      = this;
            n.bonePoses = Array.from({ length: this.boneCount }, EzMath.Mat4.identity);
            this.#instances.push(n);
            return n;
        }

        despawn(naku) {
            const i = this.#instances.indexOf(naku);
            if (i < 0) return false;
            this.#instances.splice(i, 1);
            naku._sea = null;
            return true;
        }

        clear() {
            for (const n of this.#instances) n._sea = null;
            this.#instances.length = 0;
        }

        update(dt) {
            for (const n of this.#instances) n.update(dt);
        }

        destroy() {
            const gl = this.#gl;
            if (this.#bonesTex)    { gl.deleteTexture(this.#bonesTex); this.#bonesTex = null; }
            if (this.#whiteTex)    { gl.deleteTexture(this.#whiteTex); this.#whiteTex = null; }
            for (const t of this.#textures) if (t) gl.deleteTexture(t);
            this.#textures = [];
            this.#primAlbedoTex = [];
            if (this.#meshFill)    { this.#meshFill.destroy(gl);    this.#meshFill = null; }
            if (this.#meshOutline) { this.#meshOutline.destroy(gl); this.#meshOutline = null; }
            if (this.#shaderFill    && this.#shaderFill.program)    gl.deleteProgram(this.#shaderFill.program);
            if (this.#shaderOutline && this.#shaderOutline.program) gl.deleteProgram(this.#shaderOutline.program);
            this.#shaderFill    = null;
            this.#shaderOutline = null;
            this.#skel          = null;
            this.clear();
            this.#ready = false;
        }

        #packInstancesFor(shader) {
            const layout  = shader.instanceLayout;
            const strideF = layout.strideFloats;
            const N       = this.#instances.length;
            const need    = N * strideF;

            let arr = this.#packBuffers.get(layout);
            if (!arr || arr.length < need) {
                arr = new Float32Array(Math.max(need, strideF));
                this.#packBuffers.set(layout, arr);
            }

            const matEntry = layout.entries.find(e => e.name === "a_instMat4");
            const colEntry = layout.entries.find(e => e.name === "a_instColor");
            const oclEntry = layout.entries.find(e => e.name === "a_instOutlineColor");
            const matOff = matEntry ? matEntry.byteOffset >> 2 : -1;
            const colOff = colEntry ? colEntry.byteOffset >> 2 : -1;
            const oclOff = oclEntry ? oclEntry.byteOffset >> 2 : -1;

            for (let i = 0; i < N; i++) {
                const n    = this.#instances[i];
                const base = i * strideF;
                if (matOff >= 0) arr.set(n.modelMat,     base + matOff);
                if (colOff >= 0) arr.set(n.color,        base + colOff);
                if (oclOff >= 0) arr.set(n.outlineColor, base + oclOff);
            }
            return arr.subarray(0, need);
        }

        #packBones() {
            const B = this.boneCount;
            const N = this.#instances.length;
            const need = N * B * 16;

            if (!this.#bonesArr || this.#bonesArr.length < need)
                this.#bonesArr = new Float32Array(Math.max(need, B * 16));

            for (let i = 0; i < N; i++) {
                const palette = this.#skel.computePalette(this.#instances[i].bonePoses);
                this.#bonesArr.set(palette, i * B * 16);
            }
            return this.#bonesArr.subarray(0, need);
        }

        #bindBones(shader) {
            const gl = this.#gl;
            EzRender.bindSampler(
                gl,
                EzRender.getUniformLocation(gl, shader.program, "u_bonesTex"),
                shader.texUnits.u_bonesTex,
                this.#bonesTex
            );
        }

        #drawPass(shader, mesh, instArr, setupUniforms, perPrimitive) {
            const gl = this.#gl;
            const N  = this.#instances.length;

            shader.applyRenderState(gl).bind(gl);

            EzRender.setUniforms(gl, shader.program, [
                { loc: shader.uloc.view,       type: "mat4", value: this._cachedView },
                { loc: shader.uloc.projection, type: "mat4", value: this._cachedProj },
            ]);
            EzRender.setUniform(gl, shader.program, "int", "u_bonesPerInst", this.boneCount);
            this.#bindBones(shader);
            if (setupUniforms) setupUniforms(shader);

            EzRender.uploadVBO(gl, mesh.instanceVBO, instArr);

            EzRender.withVAO(gl, mesh.vao, () => {
                EzRender.setConstAttrs(gl, mesh.defaulted);
                for (let pi = 0; pi < mesh.primitives.length; pi++) {
                    const prim = mesh.primitives[pi];
                    if (shader.uloc.fill != null) {
                        EzRender.setUniform(gl, shader.program, "vec4", "u_fill", prim.material.fill);
                    }
                    if (perPrimitive) perPrimitive(shader, pi, prim);
                    EzRender.drawInstanced(gl, {
                        indexed:     true,
                        indexCount:  prim.indexCount,
                        indexType:   mesh.indexType,
                        indexOffset: prim.indexOffset * mesh.indexBytes,
                    }, N);
                }
            });
        }

        render(camera) {
            if (!this.#ready) return;
            const N = this.#instances.length;
            if (N === 0) return;

            const gl = this.#gl;
            const B  = this.boneCount;

            const boneData = this.#packBones();
            this.#bonesTex = EzRender.uploadTexture2D(
                gl, this.#bonesTex, gl.RGBA32F, gl.RGBA, gl.FLOAT,
                4, N * B, boneData
            );

            this._cachedView = camera.view;
            this._cachedProj = camera.projection;

            const outlineInst = this.#packInstancesFor(this.#shaderOutline);
            this.#drawPass(this.#shaderOutline, this.#meshOutline, outlineInst, null);

            const fillInst = this.#packInstancesFor(this.#shaderFill);
            this.#drawPass(this.#shaderFill, this.#meshFill, fillInst, null, (s, pi) => {
                const tex = this.#primAlbedoTex[pi] || this.#whiteTex;
                EzRender.bindSampler(
                    gl,
                    EzRender.getUniformLocation(gl, s.program, "u_albedo"),
                    s.texUnits.u_albedo,
                    tex
                );
            });

            EzRender.restoreDefaultState(gl);
        }
    }


    window.Nakurin = Nakurin;
    window.Nakusea = Nakusea;

})();
