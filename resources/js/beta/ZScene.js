/* ZScene
By Asciiz

ZTree extension for ECS-style scene management.
*/

(function () {
    if (typeof window.ZTree !== "function") throw new Error("[ZScene] ZTree is required");
    if (!window.ZMath?.M4) throw new Error("[ZScene] ZMath.M4 is required");

    class Transform {
        constructor(local = null, world = null) {
            this.local = local ? new Float32Array(local) : ZMath.M4.identity();
            this.world = world ? new Float32Array(world) : ZMath.M4.identity();
        }
    }

    class MeshRenderer {
        constructor(opts = {}) {
            this.active = opts.active ?? true;
            this.meshID = opts.meshID ?? null;
            this.shaderID = opts.shaderID ?? null;
            this.skeletonNode = opts.skeletonNode ?? null;
            this.morphWeights = opts.morphWeights ? Float32Array.from(opts.morphWeights) : null;
        }
    }

    class Skeleton {
        constructor(opts = {}) {
            this.skeletonID = opts.skeletonID ?? null;
            this.bones = Array.isArray(opts.bones)
                ? opts.bones.map((m) => new Float32Array(m))
                : null;
        }
    }

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

    function cloneComponent(value) {
        if (value instanceof Transform) return new Transform(value.local, value.world);
        if (value instanceof MeshRenderer) return new MeshRenderer(value);
        if (value instanceof Skeleton) return new Skeleton(value);
        return cloneData(value);
    }

    class ZScene extends ZTree {
        sceneID = null;
        addedScenes = [];
        static COMPONENT = Object.freeze({
            Transform: "Transform",
            MeshRenderer: "MeshRenderer",
            Skeleton: "Skeleton",
        });
        #runtime = {
            gl: null,
            assets: null,
            camera: null,
        };

        constructor(name = "Scene", opts = {}) {
            super(name, opts.rootId ?? null);
            this.sceneID = opts.sceneID ?? null;
            this.bindRuntime({
                gl: opts.gl ?? null,
                assets: opts.assets ?? null,
                camera: opts.camera ?? null,
            });
            this.#ensureTransform(this.rootId);
        }

        bindRuntime(runtime = {}) {
            if (Object.prototype.hasOwnProperty.call(runtime, "gl")) this.#runtime.gl = runtime.gl ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "assets")) this.#runtime.assets = runtime.assets ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "camera")) this.#runtime.camera = runtime.camera ?? null;
            return this;
        }

        get camera() { return this.#runtime.camera; }
        get assets() { return this.#runtime.assets; }

        #ensureTransform(nodeId) {
            const node = this.node(nodeId);
            if (!node) return null;
            const existing = node.get(ZScene.COMPONENT.Transform) ?? node.get("transform");
            if (existing instanceof Transform) return existing;
            const base = existing && typeof existing === "object" ? existing : {};
            const next = new Transform(base.local ?? null, base.world ?? null);
            node.set(ZScene.COMPONENT.Transform, next);
            if (node.get("transform") != null) node.remove("transform");
            return next;
        }

        addNode(name, parentId = null, options = {}) {
            const out = super.addNode(name, parentId, options);
            if (!out) return null;
            this.#ensureTransform(out.id);
            return out;
        }

        addComponent(nodeId, key, component) {
            const node = this.node(nodeId);
            if (!node) return null;
            node.set(key, component);
            return component;
        }

        removeComponent(nodeId, key) {
            const node = this.node(nodeId);
            if (!node) return false;
            node.remove(key);
            return true;
        }

        getComponent(nodeId, key) {
            const node = this.node(nodeId);
            return node ? node.get(key) : null;
        }

        findByComponent(key) {
            const out = [];
            for (const [id, node] of this.nodes.entries()) {
                if (Object.prototype.hasOwnProperty.call(node.$, key)) out.push([id, node]);
            }
            return out;
        }

        addScene(otherScene, opts = {}) {
            if (!otherScene || typeof otherScene.node !== "function" || !otherScene.rootId) {
                throw new Error("[ZScene] addScene() requires another ZScene-like tree");
            }

            const parentId = opts.parentId == null ? this.rootId : String(opts.parentId);
            if (!this.hasNode(parentId)) throw new Error(`[ZScene] parent node "${parentId}" does not exist`);

            const suffixBase = opts.suffix ?? `_scene${this.addedScenes.length}`;
            const renameBySuffix = opts.renameBySuffix !== false;
            const idMap = new Map();

            for (const [srcId, srcNode] of otherScene.traverse(otherScene.rootId, null, false)) {
                const srcKey = String(srcId);
                const srcParent = srcNode.parent == null ? parentId : idMap.get(String(srcNode.parent));
                if (!srcParent) throw new Error(`[ZScene] missing remapped parent for "${srcKey}"`);

                let desiredId = srcKey;
                if (renameBySuffix) desiredId = `${srcKey}${suffixBase}`;
                if (typeof opts.idRemap === "function") desiredId = String(opts.idRemap(srcKey, desiredId));

                let finalId = desiredId;
                if (!finalId || this.hasNode(finalId)) {
                    let i = 0;
                    do { finalId = `${desiredId || "node"}_${i++}`; }
                    while (this.hasNode(finalId));
                }

                const added = super.addNode(srcNode.name, srcParent, { id: finalId });
                if (!added) throw new Error(`[ZScene] failed to add remapped node "${finalId}"`);

                for (const [compKey, compValue] of Object.entries(srcNode.$ ?? {})) {
                    added.node.set(compKey, cloneComponent(compValue));
                }
                this.#ensureTransform(added.id);

                idMap.set(srcKey, added.id);
            }

            const tracker = {
                sourceSceneID: otherScene.sceneID ?? null,
                suffix: String(suffixBase),
                map: Object.fromEntries(idMap.entries()),
            };
            this.addedScenes.push(tracker);
            return tracker;
        }

        updateTransforms() {
            for (const [id, node] of this.traverse(this.rootId, null, false)) {
                const transform = this.#ensureTransform(id);
                if (node.parent == null) {
                    transform.world.set(transform.local);
                    continue;
                }

                const parent = this.node(node.parent);
                const parentComp = parent?.get(ZScene.COMPONENT.Transform) ?? parent?.get("transform");
                const parentTx = parentComp instanceof Transform
                    ? parentComp
                    : this.#ensureTransform(node.parent);
                ZMath.M4.mul(parentTx.world, transform.local, transform.world);
            }
            return this;
        }

        update(deltaTime = 0) {
            this.updateTransforms();
            for (const [, node] of this.traverse(this.rootId, null, false)) {
                const runner = node.get("update");
                if (typeof runner === "function") runner(node, deltaTime, this);
            }
            return this;
        }

        render(cameraOrOpts = null, maybeOpts = {}) {
            const compatCamera = (cameraOrOpts && !cameraOrOpts.skipUpdate && !cameraOrOpts.beforeDraw && !cameraOrOpts.camera)
                ? cameraOrOpts
                : null;
            const opts = compatCamera
                ? (maybeOpts || {})
                : (cameraOrOpts && typeof cameraOrOpts === "object" ? cameraOrOpts : {});

            const gl = this.#runtime.gl;
            const assets = this.#runtime.assets;
            const camera = opts.camera ?? compatCamera ?? this.#runtime.camera;

            if (!gl || !assets) return this;
            if (!opts.skipUpdate) this.updateTransforms();

            const setUniform = (shader, name, value) => {
                if (value == null || !shader?.uniformLocations?.has(name)) return;
                shader.setUniform(gl, name, value);
            };

            const batches = new Map();
            for (const [id, node] of this.traverse(this.rootId, null, false)) {
                const renderComp = node.get(ZScene.COMPONENT.MeshRenderer) ?? node.get("meshRenderer");
                if (!(renderComp instanceof MeshRenderer) || !renderComp.active) continue;
                if (!renderComp.meshID || !renderComp.shaderID) continue;

                const transform = this.#ensureTransform(id);
                const key = `${renderComp.meshID}|${renderComp.shaderID}`;
                if (!batches.has(key)) batches.set(key, []);
                batches.get(key).push({ id, node, transform, renderComp });
            }

            for (const [key, drawList] of batches.entries()) {
                if (drawList.length === 0) continue;
                const [meshID, shaderID] = key.split("|");

                const mesh = assets.getMesh(meshID);
                const shader = assets.getShader(shaderID);
                if (!mesh || !shader) continue;

                shader.bind(gl);
                if (camera) {
                    if (camera.view) setUniform(shader, "u_view", camera.view);
                    if (camera.projection) setUniform(shader, "u_proj", camera.projection);
                }

                for (const draw of drawList) {
                    setUniform(shader, "u_model", draw.transform.world);

                    if (typeof opts.beforeDraw === "function") {
                        opts.beforeDraw({ scene: this, gl, mesh, shader, draw });
                    }

                    const instCount = Math.max(1, mesh.instanceCount || 1);
                    for (let submeshIndex = 0; submeshIndex < mesh.submeshes.length; submeshIndex++) {
                        const submesh = mesh.submeshes[submeshIndex];
                        const mat = submesh?.material ?? {};
                        const fillColor = mat.fillColor ?? mat.color ?? null;
                        if (fillColor) setUniform(shader, "u_matFillColor", fillColor);

                        const albedoTexID = mat.albedoTex ?? null;
                        const albedoTex = albedoTexID ? assets.getTexture(albedoTexID) : null;
                        const texLoc = shader.getUniformLocation("u_matAlbedoTex");
                        if (texLoc != null) {
                            if (albedoTex?.handle) ZRender.bindSampler(gl, texLoc, 0, albedoTex.handle, gl.TEXTURE_2D);
                            else {
                                gl.activeTexture(gl.TEXTURE0);
                                gl.bindTexture(gl.TEXTURE_2D, null);
                                gl.uniform1i(texLoc, 0);
                            }
                        }

                        const morphRef = draw.renderComp.morphWeights?.length
                            ? draw.renderComp.morphWeights[0]
                            : 0;
                        const vao = assets.getOrCreateVAO(meshID, shaderID, submeshIndex, morphRef);
                        const drawCfg = mesh.getDrawCfg(submeshIndex);
                        ZRender.withVAO(gl, vao, () => ZRender.drawInstanced(gl, drawCfg, instCount));
                    }
                }
            }

            return this;
        }
    }

    window.Transform = Transform;
    window.MeshRenderer = MeshRenderer;
    window.Skeleton = Skeleton;
    window.ZScene = ZScene;
})();
