/* EzAssets
By Asciiz

WebGPU-era ECS asset registry.
Stores CPU data + optional compiled GPU objects.
*/

(function () {
    if (typeof window.EzScene !== "function") throw new Error("[EzAssets] EzScene is required");
    if (!window.AzWGPU?.AzTexture) throw new Error("[EzAssets] AzWGPU.AzTexture is required");

    function isExternalImageSource(value) {
        if (!value || typeof value !== "object") return false;
        if (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) return true;
        if (typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement) return true;
        if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) return true;
        if (typeof HTMLVideoElement !== "undefined" && value instanceof HTMLVideoElement) return true;
        if (typeof ImageData !== "undefined" && value instanceof ImageData) return true;
        if (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas) return true;
        if (typeof VideoFrame !== "undefined" && value instanceof VideoFrame) return true;
        return false;
    }

    function cloneData(value) {
        if (value == null) return value;
        if (isExternalImageSource(value)) return value;
        if (ArrayBuffer.isView(value)) return new value.constructor(value);
        if (value instanceof Map) {
            const out = new Map();
            for (const [k, v] of value.entries()) out.set(k, cloneData(v));
            return out;
        }
        if (Array.isArray(value)) return value.map(cloneData);
        if (typeof value === "object") {
            const out = {};
            for (const [k, v] of Object.entries(value)) out[k] = cloneData(v);
            return out;
        }
        return value;
    }

    function normalizeShaderRecord(shaderOrDesc, stage = "render") {
        const out = {
            stage,
            compiled: false,
            shader: null,
            desc: null,
            pipelineOverrides: {},
        };

        if (stage === "render" && typeof window.ZRShader === "function" && shaderOrDesc instanceof window.ZRShader) {
            out.shader = shaderOrDesc;
            out.compiled = !!shaderOrDesc.compiled;
            return out;
        }
        if (stage === "compute" && typeof window.ZCShader === "function" && shaderOrDesc instanceof window.ZCShader) {
            out.shader = shaderOrDesc;
            out.compiled = !!shaderOrDesc.compiled;
            return out;
        }

        if (shaderOrDesc && typeof shaderOrDesc === "object") {
            out.desc = cloneData(shaderOrDesc);
            return out;
        }

        out.desc = {};
        return out;
    }

    class EzAssets {
        static SKIN_BONE_CAP = 128;

        device = null;
        context = null;
        camera = null;

        textures = new Map();       // id -> { id, data, gpu }
        materials = new Map();      // id -> { id, data }
        meshes = new Map();         // id -> { id, data, gpu }
        skeletons = new Map();      // id -> { id, data }
        shaders = new Map();        // id -> render shader record
        computeShaders = new Map(); // id -> compute shader record
        scenes = new Map();         // id -> EzScene

        constructor(opts = {}) {
            this.device = opts.device ?? null;
            this.context = opts.context ?? null;
            this.camera = opts.camera ?? null;
        }

        setRuntime(runtime = {}) {
            if (Object.prototype.hasOwnProperty.call(runtime, "device")) this.device = runtime.device ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "context")) this.context = runtime.context ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "camera")) this.camera = runtime.camera ?? null;
            this.#rebindScenes();
            this.#compileDeferredTextures();
            this.#compileDeferredMeshes();
            this.#compileDeferredShaders();
            return this;
        }

        setDevice(device) { return this.setRuntime({ device }); }
        setContext(context) { return this.setRuntime({ context }); }
        setCamera(camera) { return this.setRuntime({ camera }); }

        addTexture(texture) {
            if (!texture?.id) throw new Error("[EzAssets] texture.id is required");
            if (this.textures.has(texture.id)) return texture.id;

            const textureData = cloneData(texture);
            if (isExternalImageSource(texture.bitmap)) textureData.bitmap = texture.bitmap;

            const rec = {
                id: texture.id,
                data: textureData,
                gpu: null,
            };
            this.textures.set(texture.id, rec);
            this.#compileTextureRecord(rec);
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
            const data = cloneData(skeleton);
            if (!(data.map instanceof Map) && Array.isArray(data.bones)) {
                data.map = new Map(data.bones.map((b, i) => [String(b?.name ?? `Bone_${i}`), i]));
            }
            this.skeletons.set(skeleton.id, { id: skeleton.id, data });
            return skeleton.id;
        }

        addMesh(meshData) {
            if (!meshData?.id) throw new Error("[EzAssets] mesh.id is required");
            if (this.meshes.has(meshData.id)) return meshData.id;
            const rec = {
                id: meshData.id,
                data: cloneData(meshData),
                gpu: null,
            };
            this.meshes.set(meshData.id, rec);
            this.#compileMeshRecord(rec);
            return meshData.id;
        }

        createRenderShader(desc = {}, pipelineOverrides = {}) {
            if (typeof window.ZRShader !== "function") {
                return { deferred: true, desc: cloneData(desc), pipelineOverrides: cloneData(pipelineOverrides) };
            }
            if (!this.device) {
                return { deferred: true, desc: cloneData(desc), pipelineOverrides: cloneData(pipelineOverrides) };
            }
            return window.ZRShader.create(this.device, desc, pipelineOverrides);
        }

        createComputeShader(desc = {}, pipelineOverrides = {}) {
            if (typeof window.ZCShader !== "function") {
                return { deferred: true, desc: cloneData(desc), pipelineOverrides: cloneData(pipelineOverrides) };
            }
            if (!this.device) {
                return { deferred: true, desc: cloneData(desc), pipelineOverrides: cloneData(pipelineOverrides) };
            }
            return window.ZCShader.create(this.device, desc, pipelineOverrides);
        }

        registerRenderShader(shaderID, shaderOrDesc, pipelineOverrides = {}) {
            if (!shaderID) throw new Error("[EzAssets] shaderID is required");
            const id = String(shaderID);
            const record = normalizeShaderRecord(shaderOrDesc, "render");
            if (Object.keys(pipelineOverrides || {}).length > 0) {
                record.pipelineOverrides = cloneData(pipelineOverrides);
            }
            this.shaders.set(id, record);
            this.#compileShaderRecord(record);
            return id;
        }

        registerComputeShader(shaderID, shaderOrDesc, pipelineOverrides = {}) {
            if (!shaderID) throw new Error("[EzAssets] shaderID is required");
            const id = String(shaderID);
            const record = normalizeShaderRecord(shaderOrDesc, "compute");
            if (Object.keys(pipelineOverrides || {}).length > 0) {
                record.pipelineOverrides = cloneData(pipelineOverrides);
            }
            this.computeShaders.set(id, record);
            this.#compileShaderRecord(record);
            return id;
        }

        // Compatibility alias for existing project-level API.
        registerShader(shaderID, shaderOrDesc, pipelineOverrides = {}) {
            return this.registerRenderShader(shaderID, shaderOrDesc, pipelineOverrides);
        }

        getShader(shaderID) {
            const rec = this.shaders.get(String(shaderID));
            return rec?.shader ?? rec ?? null;
        }

        getComputeShader(shaderID) {
            const rec = this.computeShaders.get(String(shaderID));
            return rec?.shader ?? rec ?? null;
        }

        getMesh(meshID) {
            return this.meshes.get(String(meshID))?.gpu ?? this.meshes.get(String(meshID))?.data ?? null;
        }

        getMeshData(meshID) {
            return this.meshes.get(String(meshID))?.data ?? null;
        }

        getTexture(textureID) {
            return this.textures.get(String(textureID)) ?? null;
        }

        getWhiteTexture() {
            let white = this.textures.get("__white_fallback__");
            if (white) return white;
            this.addTexture({
                id: "__white_fallback__",
                name: "white-fallback",
                width: 1,
                height: 1,
                bitmap: null,
                rgba: [255, 255, 255, 255],
            });
            return this.textures.get("__white_fallback__") ?? null;
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
                    scene.addComponent(nodeId, "Transform", new window.Transform(value.local, value.world));
                    continue;
                }
                if (key === "MeshRenderer" || key === "meshRenderer") {
                    scene.addComponent(nodeId, "MeshRenderer", new window.MeshRenderer(value));
                    continue;
                }
                if (key === "Skeleton" || key === "skeleton") {
                    scene.addComponent(nodeId, "Skeleton", new window.Skeleton(value));
                    continue;
                }
                scene.addComponent(nodeId, key, cloneData(value));
            }
        }

        #buildScene(sceneData) {
            const scene = new EzScene(sceneData.name || "Scene", {
                rootId: sceneData.rootId,
                sceneID: sceneData.id,
                device: this.device,
                context: this.context,
                assets: this,
                camera: this.camera,
            });

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
            if (scene) {
                scene.bindRuntime({
                    device: this.device,
                    context: this.context,
                    assets: this,
                    camera: this.camera,
                });
            }
            return scene;
        }

        addFromLoader(payload) {
            if (!payload) throw new Error("[EzAssets] loader payload is required");

            for (const texture of Object.values(payload.textures || {})) this.addTexture(texture);
            for (const material of Object.values(payload.materials || {})) this.addMaterial(material);
            for (const skeleton of Object.values(payload.skeletons || {})) this.addSkeleton(skeleton);
            for (const mesh of Object.values(payload.meshes || {})) this.addMesh(mesh);

            const sceneData = cloneData(payload.scene);
            if (!sceneData) throw new Error("[EzAssets] payload.scene is required");
            return this.addScene(sceneData);
        }

        #compileShaderRecord(record) {
            if (!record || !record.desc || !this.device) return;
            try {
                if (record.stage === "render" && typeof window.ZRShader === "function") {
                    record.shader = window.ZRShader.create(this.device, record.desc, record.pipelineOverrides ?? {});
                    record.compiled = !!record.shader?.compiled;
                    return;
                }
                if (record.stage === "compute" && typeof window.ZCShader === "function") {
                    record.shader = window.ZCShader.create(this.device, record.desc, record.pipelineOverrides ?? {});
                    record.compiled = !!record.shader?.compiled;
                }
            } catch (error) {
                record.compiled = false;
                record.error = String(error?.message ?? error);
            }
        }

        #compileTextureRecord(record) {
            if (!record || record.gpu || !this.device) return;
            const data = record.data ?? {};
            const width = Math.max(1, Number(data.width ?? data.bitmap?.width ?? 1) | 0);
            const height = Math.max(1, Number(data.height ?? data.bitmap?.height ?? 1) | 0);

            const texture = this.device.createTexture({
                label: `EzAssets.Texture:${record.id}`,
                size: [width, height, 1],
                format: "rgba8unorm",
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });

            if (isExternalImageSource(data.bitmap)) {
                this.device.queue.copyExternalImageToTexture(
                    { source: data.bitmap },
                    { texture },
                    { width, height, depthOrArrayLayers: 1 },
                );
            } else if (Array.isArray(data.rgba) && data.rgba.length >= 4) {
                this.device.queue.writeTexture(
                    { texture },
                    new Uint8Array(data.rgba.slice(0, 4)),
                    { bytesPerRow: 4 },
                    { width: 1, height: 1, depthOrArrayLayers: 1 },
                );
            }

            record.gpu = {
                texture,
                view: texture.createView(),
            };
        }

        #compileDeferredTextures() {
            for (const rec of this.textures.values()) this.#compileTextureRecord(rec);
        }

        #compileMeshRecord(record) {
            if (!record || record.gpu || !this.device) return;
            if (typeof window.EzMesh !== "function") return;
            try {
                record.gpu = window.EzMesh.create(this.device, record.data);
            } catch (error) {
                record.error = String(error?.message ?? error);
            }
        }

        #compileDeferredMeshes() {
            for (const rec of this.meshes.values()) this.#compileMeshRecord(rec);
        }

        #compileDeferredShaders() {
            for (const rec of this.shaders.values()) this.#compileShaderRecord(rec);
            for (const rec of this.computeShaders.values()) this.#compileShaderRecord(rec);
        }

        #rebindScenes() {
            for (const scene of this.scenes.values()) {
                scene.bindRuntime({
                    device: this.device,
                    context: this.context,
                    assets: this,
                    camera: this.camera,
                });
            }
        }
    }

    window.EzAssets = EzAssets;
})();
