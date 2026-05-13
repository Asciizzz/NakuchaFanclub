/* EzAssets
By Asciiz

WebGL-backed ECS asset storage and scene registry.
*/

(function () {
    if (typeof window.EzMesh !== "function") throw new Error("[EzAssets] EzMesh is required");
    if (typeof window.EzSkeleton !== "function") throw new Error("[EzAssets] EzSkeleton is required");
    if (typeof window.EzScene !== "function") throw new Error("[EzAssets] EzScene is required");
    if (typeof window.ZShader !== "function") throw new Error("[EzAssets] ZShader is required");

    function cloneData(value) {
        if (value == null) return value;
        if (ArrayBuffer.isView(value)) return new value.constructor(value);
        if (Array.isArray(value)) return value.map(cloneData);
        if (typeof value === "object") {
            const out = {};
            for (const [k, v] of Object.entries(value)) out[k] = cloneData(v);
            return out;
        }
        return value;
    }

    function wrapToEnum(gl, wrap) {
        return wrap === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    }

    function mergeDecls(baseList, extraList) {
        const out = baseList.slice();
        const seen = new Set(baseList.map((d) => d.name));
        for (const decl of (extraList || [])) {
            if (!decl?.name || !decl?.type) continue;
            if (seen.has(decl.name)) continue;
            out.push({ ...decl });
            seen.add(decl.name);
        }
        return out;
    }

    class EzAssets {
        static SKIN_BONE_CAP = 64;

        static FIXED_VERTEX_INPUTS = Object.freeze([
            Object.freeze({ name: "a_position", type: "vec3" }),
            Object.freeze({ name: "a_normal", type: "vec3" }),
            Object.freeze({ name: "a_uv", type: "vec2" }),
            Object.freeze({ name: "a_tangent", type: "vec4" }),
            Object.freeze({ name: "a_boneID", type: "vec4", default: [0, 0, 0, 0] }),
            Object.freeze({ name: "a_boneWeight", type: "vec4", default: [0, 0, 0, 0] }),
            Object.freeze({ name: "a_morphPos", type: "vec3", default: [0, 0, 0] }),
            Object.freeze({ name: "a_morphNrml", type: "vec3", default: [0, 0, 0] }),
            Object.freeze({ name: "a_instModel0", type: "vec4", divisor: 1 }),
            Object.freeze({ name: "a_instModel1", type: "vec4", divisor: 1 }),
            Object.freeze({ name: "a_instModel2", type: "vec4", divisor: 1 }),
            Object.freeze({ name: "a_instModel3", type: "vec4", divisor: 1 }),
            Object.freeze({ name: "a_instData0", type: "vec4", divisor: 1 }),
            Object.freeze({ name: "a_instData1", type: "vec4", divisor: 1 }),
            Object.freeze({ name: "a_instData2", type: "vec4", divisor: 1 }),
            Object.freeze({ name: "a_instData3", type: "vec4", divisor: 1 }),
        ]);

        static FIXED_VERTEX_UNIFORMS = Object.freeze([
            Object.freeze({ name: "u_view", type: "mat4" }),
            Object.freeze({ name: "u_proj", type: "mat4" }),
            Object.freeze({ name: `u_skinPalette[${EzAssets.SKIN_BONE_CAP}]`, type: "mat4" }),
            Object.freeze({ name: "u_vtxFlags", type: "vec4" }),
            Object.freeze({ name: "u_morphWeight", type: "float" }),
        ]);

        static FIXED_FRAGMENT_UNIFORMS = Object.freeze([
            Object.freeze({ name: "u_matAlbedoTex", type: "sampler2D" }),
            Object.freeze({ name: "u_matAlbedoColor", type: "vec4" }),
        ]);

        static #SYMBOLS = Object.freeze({
            "$POSITION$": "a_position",
            "$NORMAL$": "a_normal",
            "$UV$": "a_uv",
            "$TANGENT$": "a_tangent",
            "$BONE_ID$": "a_boneID",
            "$BONE_IDS$": "a_boneID",
            "$BONE_WEIGHT$": "a_boneWeight",
            "$BONE_WEIGHTS$": "a_boneWeight",
            "$COLOR$": "vec4(1.0)",
            "$MORPH_POS$": "a_morphPos",
            "$MORPH_POSITION$": "a_morphPos",
            "$MORPH_NRML$": "a_morphNrml",
            "$MORPH_NORMAL$": "a_morphNrml",
            "$MORPH_TANGENT$": "vec4(0.0)",
            "$MORPH_WEIGHT$": "u_morphWeight",
            "$INST_MORPH_WEIGHT$": "u_morphWeight",
            "$INSTANCE_MODEL0$": "a_instModel0",
            "$INSTANCE_MODEL1$": "a_instModel1",
            "$INSTANCE_MODEL2$": "a_instModel2",
            "$INSTANCE_MODEL3$": "a_instModel3",
            "$INST_MODEL0$": "a_instModel0",
            "$INST_MODEL1$": "a_instModel1",
            "$INST_MODEL2$": "a_instModel2",
            "$INST_MODEL3$": "a_instModel3",
            "$INST_MODEL$": "mat4(a_instModel0, a_instModel1, a_instModel2, a_instModel3)",
            "$INSTANCE_DATA0$": "a_instData0",
            "$INSTANCE_DATA1$": "a_instData1",
            "$INSTANCE_DATA2$": "a_instData2",
            "$INSTANCE_DATA3$": "a_instData3",
            "$INST_DATA0$": "a_instData0",
            "$INST_DATA1$": "a_instData1",
            "$INST_DATA2$": "a_instData2",
            "$INST_DATA3$": "a_instData3",
            "$INST_SLOT0$": "a_instData0",
            "$INST_SLOT1$": "a_instData1",
            "$INST_SLOT2$": "a_instData2",
            "$INST_SLOT3$": "a_instData3",
            "$ALBEDO_TEX$": "u_matAlbedoTex",
            "$ALBEDO_COLOR$": "u_matAlbedoColor",
            "$VIEW$": "u_view",
            "$PROJECTION$": "u_proj",
            "$SKIN_PALETTE$": "u_skinPalette",
            "$SKIN_MAX_INDEX$": String(EzAssets.SKIN_BONE_CAP - 1),
            "$VTX_FLAGS$": "u_vtxFlags",
            "$HAS_RIG$": "(u_vtxFlags.x > 0.5)",
            "$HAS_MORPH$": "(u_vtxFlags.y > 0.5)",
            "$HAS_COLOR$": "(u_vtxFlags.z > 0.5)",
            "$OUT_COLOR$": "fragColor",
        });

        gl = null;
        camera = null;

        textures = new Map();   // id -> { id, data, handle }
        materials = new Map();  // id -> { id, data }
        meshes = new Map();     // id -> { id, data, mesh }
        skeletons = new Map();  // id -> { id, data }
        shaders = new Map();    // id -> shader
        scenes = new Map();     // id -> EzScene

        #vaoCache = new Map();
        #whiteTexture = null;

        constructor(gl = null, camera = null) {
            this.gl = gl ?? null;
            this.camera = camera ?? null;
        }

        setGL(gl) {
            if (this.#whiteTexture?.handle && this.gl && this.#whiteTexture.gl === this.gl) {
                this.gl.deleteTexture(this.#whiteTexture.handle);
            }
            this.#whiteTexture = null;
            this.gl = gl ?? null;
            for (const scene of this.scenes.values()) scene.bindRuntime({ gl: this.gl });
            return this;
        }

        setCamera(camera) {
            this.camera = camera ?? null;
            for (const scene of this.scenes.values()) scene.bindRuntime({ camera: this.camera });
            return this;
        }

        addTexture(texture) {
            if (!texture?.id) throw new Error("[EzAssets] texture.id is required");
            if (this.textures.has(texture.id)) return texture.id;

            let handle = null;
            if (this.gl && texture.bitmap && window.ZRender?.createTexture) {
                handle = ZRender.createTexture(this.gl, {
                    data: texture.bitmap,
                    width: texture.width,
                    height: texture.height,
                    wrapS: wrapToEnum(this.gl, texture.wrap),
                    wrapT: wrapToEnum(this.gl, texture.wrap),
                    minFilter: this.gl.LINEAR,
                    magFilter: this.gl.LINEAR,
                    mipmap: false,
                    flipY: false,
                    premultiplyAlpha: false,
                });
            }

            this.textures.set(texture.id, {
                id: texture.id,
                data: cloneData(texture),
                handle,
            });
            return texture.id;
        }

        addMaterial(material) {
            if (!material?.id) throw new Error("[EzAssets] material.id is required");
            if (this.materials.has(material.id)) return material.id;
            this.materials.set(material.id, { id: material.id, data: cloneData(material) });
            return material.id;
        }

        addSkeleton(skeleton) {
            if (!skeleton?.id) throw new Error("[EzAssets] skeleton.id is required");
            if (this.skeletons.has(skeleton.id)) return skeleton.id;
            const data = skeleton instanceof EzSkeleton
                ? skeleton
                : new EzSkeleton(cloneData(skeleton));
            if (!data.id) data.id = skeleton.id;
            this.skeletons.set(skeleton.id, { id: skeleton.id, data });
            return skeleton.id;
        }

        #materialForSubmesh(materialDesc = {}) {
            const out = cloneData(materialDesc) || {};
            const linkedID = out.materialID ?? null;
            if (!linkedID) return out;

            const linked = this.materials.get(linkedID)?.data;
            if (!linked) return out;

            if (out.albedoTex == null && linked.albedoTex != null) out.albedoTex = linked.albedoTex;
            if (out.albedoColor == null && linked.albedoColor != null) out.albedoColor = cloneData(linked.albedoColor);
            return out;
        }

        addMesh(meshData) {
            if (!meshData?.id) throw new Error("[EzAssets] mesh.id is required");
            if (this.meshes.has(meshData.id)) return meshData.id;
            if (!this.gl) throw new Error("[EzAssets] WebGL context is required to create mesh GPU resources");

            const submeshes = (meshData.submeshes || []).map((sub, i) => ({
                name: sub.name || `${meshData.name || "mesh"}_sub_${i}`,
                mode: sub.mode,
                static: cloneData(sub.static),
                rigged: cloneData(sub.rigged),
                morph: cloneData(sub.morph),
                indices: cloneData(sub.indices),
                material: this.#materialForSubmesh(sub.material),
            }));

            const mesh = EzMesh.create(this.gl, {
                morphTargets: (meshData.morphTargetNames || []).map((name) => ({ name })),
                submeshes,
                instances: { count: 1 },
            });

            this.meshes.set(meshData.id, {
                id: meshData.id,
                data: cloneData(meshData),
                mesh,
            });
            return meshData.id;
        }

        #replaceSymbols(source) {
            let out = String(source ?? "");
            for (const [symbol, replacement] of Object.entries(EzAssets.#SYMBOLS)) {
                out = out.split(symbol).join(replacement);
            }
            return out;
        }

        createShader(desc = {}) {
            if (!this.gl) throw new Error("[EzAssets] WebGL context is required to compile shader");

            const vertexMain = this.#replaceSymbols(desc.vertexMain ?? desc.vertex?.main ?? `
gl_Position = u_proj * u_view * $INST_MODEL$ * vec4($POSITION$, 1.0);
`);
            const fragmentMain = this.#replaceSymbols(desc.fragmentMain ?? desc.fragment?.main ?? `
$OUT_COLOR$ = vec4(1.0);
`);

            const vertexMethods = (desc.vertex?.methods ?? []).map((m) => ({ ...m, body: this.#replaceSymbols(m.body ?? "") }));
            const fragmentMethods = (desc.fragment?.methods ?? []).map((m) => ({ ...m, body: this.#replaceSymbols(m.body ?? "") }));

            const shader = new ZShader()
                .write({ version: desc.version ?? "300 es" })
                .write({
                    stage: ZShader.STAGE.VERTEX,
                    inputs: EzAssets.FIXED_VERTEX_INPUTS.map((d) => ({ ...d })),
                    outputs: cloneData(desc.vertex?.outputs ?? []),
                    uniforms: mergeDecls(EzAssets.FIXED_VERTEX_UNIFORMS.map((d) => ({ ...d })), cloneData(desc.vertex?.uniforms ?? [])),
                    methods: vertexMethods,
                    main: vertexMain,
                })
                .write({
                    stage: ZShader.STAGE.FRAGMENT,
                    inputs: cloneData(desc.fragment?.inputs ?? []),
                    outputs: cloneData(desc.fragment?.outputs ?? [{ name: "fragColor", type: "vec4" }]),
                    uniforms: mergeDecls(EzAssets.FIXED_FRAGMENT_UNIFORMS.map((d) => ({ ...d })), cloneData(desc.fragment?.uniforms ?? [])),
                    methods: fragmentMethods,
                    main: fragmentMain,
                })
                .compile(this.gl);

            if (desc.custom) shader.custom(desc.custom);
            if (desc.other && typeof desc.other === "object") shader.customs(cloneData(desc.other));
            if (desc.renderCfg && typeof desc.renderCfg === "object") shader.custom("renderCfg", cloneData(desc.renderCfg));
            return shader;
        }

        registerShader(shaderID, shaderOrDesc) {
            if (!shaderID) throw new Error("[EzAssets] shaderID is required");
            const id = String(shaderID);

            const shader = shaderOrDesc instanceof ZShader
                ? shaderOrDesc
                : this.createShader(shaderOrDesc ?? {});

            this.shaders.set(id, shader);
            return id;
        }

        getShader(shaderID) {
            return this.shaders.get(String(shaderID)) ?? null;
        }

        getMesh(meshID) {
            return this.meshes.get(String(meshID))?.mesh ?? null;
        }

        getMeshData(meshID) {
            return this.meshes.get(String(meshID))?.data ?? null;
        }

        getTexture(textureID) {
            return this.textures.get(String(textureID)) ?? null;
        }

        getWhiteTexture() {
            if (!this.gl || !window.ZRender?.createTexture) return null;
            if (this.#whiteTexture?.handle && this.#whiteTexture.gl === this.gl) return this.#whiteTexture;

            const handle = ZRender.createTexture(this.gl, {
                data: new Uint8Array([255, 255, 255, 255]),
                width: 1,
                height: 1,
                wrapS: this.gl.CLAMP_TO_EDGE,
                wrapT: this.gl.CLAMP_TO_EDGE,
                minFilter: this.gl.NEAREST,
                magFilter: this.gl.NEAREST,
                mipmap: false,
                flipY: false,
                premultiplyAlpha: false,
            });
            this.#whiteTexture = {
                id: "__EzAssets_white_fallback__",
                gl: this.gl,
                data: { width: 1, height: 1, wrap: "clamp" },
                handle,
            };
            return this.#whiteTexture;
        }

        getMaterial(materialID) {
            return this.materials.get(String(materialID))?.data ?? null;
        }

        getSkeleton(skeletonID) {
            return this.skeletons.get(String(skeletonID))?.data ?? null;
        }

        #applyNodeComponents(scene, nodeId, comps = {}) {
            for (const [key, value] of Object.entries(comps)) {
                if (key === "Transform" || key === "transform") {
                    scene.addComponent(nodeId, "Transform", new Transform(value.local, value.world));
                    continue;
                }
                if (key === "MeshRenderer" || key === "meshRenderer") {
                    scene.addComponent(nodeId, "MeshRenderer", new MeshRenderer(value));
                    continue;
                }
                if (key === "Skeleton" || key === "skeleton") {
                    scene.addComponent(nodeId, "Skeleton", new Skeleton(value));
                    continue;
                }
                scene.addComponent(nodeId, key, cloneData(value));
            }
        }

        #buildScene(sceneData) {
            const scene = new EzScene(sceneData.name || "Scene", {
                rootId: sceneData.rootId,
                sceneID: sceneData.id,
            });
            scene.bindRuntime({ gl: this.gl, assets: this, camera: this.camera });

            const byId = new Map((sceneData.nodes || []).map((node) => [node.id, node]));
            const rootData = byId.get(scene.rootId);
            if (rootData) {
                const rootNode = scene.node(scene.rootId);
                rootNode.name = rootData.name || rootNode.name;
                rootNode.children.length = 0;
                this.#applyNodeComponents(scene, scene.rootId, rootData.components || {});
            }

            const pending = (sceneData.nodes || []).filter((n) => n.id !== scene.rootId);
            let guard = pending.length + 1;
            while (pending.length > 0 && guard-- > 0) {
                let progressed = false;
                for (let i = pending.length - 1; i >= 0; i--) {
                    const item = pending[i];
                    const parentId = item.parent == null ? scene.rootId : item.parent;
                    if (!scene.hasNode(parentId)) continue;

                    const added = scene.addNode(item.name || item.id, parentId, { id: item.id });
                    if (!added) continue;
                    this.#applyNodeComponents(scene, added.id, item.components || {});
                    pending.splice(i, 1);
                    progressed = true;
                }
                if (!progressed) break;
            }

            if (pending.length > 0) throw new Error("[EzAssets] scene graph contains unresolved parents");
            return scene;
        }

        addScene(sceneData) {
            if (!sceneData?.id) throw new Error("[EzAssets] scene.id is required");
            if (this.scenes.has(sceneData.id)) return sceneData.id;
            const scene = this.#buildScene(sceneData);
            this.scenes.set(sceneData.id, scene);
            return sceneData.id;
        }

        getScene(sceneID) {
            const scene = this.scenes.get(String(sceneID)) ?? null;
            if (scene) scene.bindRuntime({ gl: this.gl, assets: this, camera: this.camera });
            return scene;
        }

        addFromLoader(payload, opts = {}) {
            if (!payload) throw new Error("[EzAssets] loader payload is required");

            for (const texture of Object.values(payload.textures || {})) this.addTexture(texture);
            for (const material of Object.values(payload.materials || {})) this.addMaterial(material);
            for (const skeleton of Object.values(payload.skeletons || {})) this.addSkeleton(skeleton);
            for (const mesh of Object.values(payload.meshes || {})) this.addMesh(mesh);

            const sceneData = cloneData(payload.scene);
            if (!sceneData) throw new Error("[EzAssets] payload.scene is required");

            if (opts.defaultShaderID) {
                for (const node of (sceneData.nodes || [])) {
                    const meshRenderer = node.components?.MeshRenderer ?? node.components?.meshRenderer;
                    if (meshRenderer && !meshRenderer.shaderID) meshRenderer.shaderID = opts.defaultShaderID;
                }
            }

            return this.addScene(sceneData);
        }

        getOrCreateVAO(meshID, shaderID, submeshIndex = 0, morphTarget = 0) {
            const key = `${meshID}|${shaderID}|${submeshIndex}|${morphTarget}`;
            const cached = this.#vaoCache.get(key);
            if (cached) return cached;

            const mesh = this.getMesh(meshID);
            const shader = this.getShader(shaderID);
            if (!mesh) throw new Error(`[EzAssets] mesh "${meshID}" not found`);
            if (!shader) throw new Error(`[EzAssets] shader "${shaderID}" not found`);

            const vao = mesh.createVAO(shader, {
                submeshIndex,
                morphTarget,
                cache: true,
            });
            this.#vaoCache.set(key, vao);
            return vao;
        }
    }

    window.EzAssets = EzAssets;
})();
