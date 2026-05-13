/* EzScene
By Asciiz

ZTree extension for ECS-style scene management.
*/

(function () {
    if (typeof window.ZTree !== "function") throw new Error("[EzScene] ZTree is required");
    if (!window.ZMath?.M4) throw new Error("[EzScene] ZMath.M4 is required");
    if (!window.ZMath?.Q) throw new Error("[EzScene] ZMath.Q is required");
    if (typeof window.EzSkeleton !== "function") throw new Error("[EzScene] EzSkeleton is required");

    const IDENTITY_M4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    class Log {
        #limit = 256;
        #entries = [];

        constructor(limit = 256) {
            this.#limit = Math.max(1, Number(limit) | 0);
        }

        write(code, message, extra = null) {
            this.#entries.push({
                time: Date.now(),
                code: String(code ?? "log"),
                message: String(message ?? ""),
                extra: extra ?? null,
            });
            if (this.#entries.length > this.#limit) this.#entries.shift();
            return this;
        }

        read() { return this.#entries.slice(); }
        clear() { this.#entries.length = 0; return this; }
    }

    function toVec3(spec, fallback = [0, 0, 0]) {
        if (ArrayBuffer.isView(spec) || Array.isArray(spec)) {
            return [
                Number(spec[0] ?? fallback[0]) || 0,
                Number(spec[1] ?? fallback[1]) || 0,
                Number(spec[2] ?? fallback[2]) || 0,
            ];
        }
        if (spec && typeof spec === "object") {
            return [
                Number(spec.x ?? spec[0] ?? fallback[0]) || 0,
                Number(spec.y ?? spec[1] ?? fallback[1]) || 0,
                Number(spec.z ?? spec[2] ?? fallback[2]) || 0,
            ];
        }
        return fallback.slice(0, 3);
    }

    function toVec4(spec, fallback = [0, 0, 0, 1]) {
        if (ArrayBuffer.isView(spec) || Array.isArray(spec)) {
            return [
                Number(spec[0] ?? fallback[0]) || 0,
                Number(spec[1] ?? fallback[1]) || 0,
                Number(spec[2] ?? fallback[2]) || 0,
                Number(spec[3] ?? fallback[3]) || 0,
            ];
        }
        if (spec && typeof spec === "object") {
            return [
                Number(spec.x ?? spec[0] ?? fallback[0]) || 0,
                Number(spec.y ?? spec[1] ?? fallback[1]) || 0,
                Number(spec.z ?? spec[2] ?? fallback[2]) || 0,
                Number(spec.w ?? spec[3] ?? fallback[3]) || 0,
            ];
        }
        return fallback.slice(0, 4);
    }

    function toLocalMatrix(localTransform = null) {
        if (localTransform == null) {
            const out = new Float32Array(16);
            out.set(IDENTITY_M4);
            return out;
        }

        const src = (localTransform && typeof localTransform === "object" && (localTransform.local || localTransform.matrix))
            ? (localTransform.local || localTransform.matrix)
            : localTransform;

        if ((ArrayBuffer.isView(src) || Array.isArray(src)) && src.length >= 16) {
            const out = new Float32Array(16);
            out.set(src.subarray ? src.subarray(0, 16) : src.slice(0, 16));
            return out;
        }

        const obj = (src && typeof src === "object") ? src : {};
        const position = toVec3(obj.position ?? obj.translation ?? obj.pos, [0, 0, 0]);
        const scale = toVec3(obj.scale, [1, 1, 1]);
        const euler = obj.euler ?? null;
        let rotation = toVec4(obj.rotation ?? obj.rotQ ?? obj.quaternion, [0, 0, 0, 1]);

        if (euler != null) {
            const eu = toVec3(euler, [0, 0, 0]);
            const qx = ZMath.Q.fromAxisAngle(ZMath.V3.RIGHT, eu[0]);
            const qy = ZMath.Q.fromAxisAngle(ZMath.V3.UP, eu[1]);
            const qz = ZMath.Q.fromAxisAngle(ZMath.V3.FORWARD, eu[2]);
            const qxy = ZMath.Q.mul(qy, qx);
            const q = ZMath.Q.mul(qz, qxy);
            rotation = [q[0], q[1], q[2], q[3]];
        }

        return ZMath.M4.fromTRS(position, rotation, scale);
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

    class Transform {
        local = null;
        world = null;

        constructor(local = null, world = null) {
            this.local = local ? new Float32Array(local) : ZMath.M4.identity();
            this.world = world ? new Float32Array(world) : ZMath.M4.identity();
        }

        __bindSceneContext() { return this; }
    }

    class MeshRenderer {
        active = true;
        shaderID = null;
        morphWeights = null;
        instanceSlots = null;
        log = new Log(256);

        #scene = null;
        #assets = null;
        #nodeId = null;
        #meshID = null;
        #skeletonNode = null;

        constructor(opts = {}) {
            this.active = opts.active ?? true;
            this.meshID = opts.meshID ?? null;
            this.shaderID = opts.shaderID ?? null;
            this.skeletonNode = opts.skeletonNode ?? null;
            this.morphWeights = opts.morphWeights ? Float32Array.from(opts.morphWeights) : null;
            this.instanceSlots = [
                new Float32Array([0, 0, 0, 0]),
                new Float32Array([0, 0, 0, 0]),
                new Float32Array([0, 0, 0, 0]),
                new Float32Array([0, 0, 0, 0]),
            ];
            const baseSlots = Array.isArray(opts.instanceSlots) ? opts.instanceSlots : opts.slots;
            if (Array.isArray(baseSlots)) {
                for (let i = 0; i < Math.min(4, baseSlots.length); i++) this.setSlot(i, baseSlots[i]);
            }
        }

        __bindSceneContext(ctx = {}) {
            this.#scene = ctx.scene ?? null;
            this.#assets = ctx.assets ?? null;
            this.#nodeId = ctx.nodeId ?? null;
            this.#syncMeshShape();
            this.#syncSkeletonShape();
            return this;
        }

        get meshID() { return this.#meshID; }
        set meshID(value) {
            this.#meshID = value == null ? null : String(value);
            this.#syncMeshShape();
        }

        get skeletonNode() { return this.#skeletonNode; }
        set skeletonNode(value) {
            if (value == null) this.#skeletonNode = null;
            else if (typeof value === "object" && value.id != null) this.#skeletonNode = String(value.id);
            else this.#skeletonNode = String(value);
            this.#syncSkeletonShape();
        }

        get meshAsset() {
            if (!this.#assets || !this.meshID) return null;
            return this.#assets.getMesh?.(this.meshID) ?? null;
        }

        get meshAssetData() {
            if (!this.#assets || !this.meshID) return null;
            return this.#assets.getMeshData?.(this.meshID) ?? null;
        }

        get skeletonNodeRef() {
            if (!this.#scene || !this.skeletonNode) return null;
            return this.#scene.node(this.skeletonNode) ?? null;
        }

        get skeletonComponent() {
            const node = this.skeletonNodeRef;
            if (!node) return null;
            const comp = node.get("Skeleton") ?? node.get("skeleton");
            return comp instanceof Skeleton ? comp : null;
        }

        get skeletonAsset() {
            const comp = this.skeletonComponent;
            return comp instanceof Skeleton ? comp.skeletonAsset : null;
        }

        get hasMesh() { return this.meshID != null; }
        get hasSkeleton() { return this.skeletonNode != null; }
        get hasMorphs() { return this.morphWeights != null && this.morphWeights.length > 0; }

        setMesh(meshID) { this.meshID = meshID; return this; }
        setSkeletonNode(nodeOrId) { this.skeletonNode = nodeOrId; return this; }

        setSlot(slot, value) {
            const s = Number(slot) | 0;
            if (s < 0 || s > 3) {
                this.log.write("invalid_slot", `[MeshRenderer] slot must be 0..3, got ${slot}`, { slot });
                return this;
            }
            const src = value ?? {};
            const next = ArrayBuffer.isView(src) || Array.isArray(src)
                ? src
                : [src.x ?? 0, src.y ?? 0, src.z ?? 0, src.w ?? 0];
            const out = new Float32Array(4);
            out[0] = Number(next[0] ?? 0) || 0;
            out[1] = Number(next[1] ?? 0) || 0;
            out[2] = Number(next[2] ?? 0) || 0;
            out[3] = Number(next[3] ?? 0) || 0;
            this.instanceSlots[s] = out;
            return this;
        }

        getSlot(slot) {
            const s = Number(slot) | 0;
            if (s < 0 || s > 3) return null;
            return this.instanceSlots[s];
        }

        resolveMorphIndex(indexOrName) {
            this.#syncMeshShape();
            const mesh = this.meshAsset;
            if (mesh?.resolveMorphTargetRef) {
                const resolved = mesh.resolveMorphTargetRef(indexOrName);
                if (resolved >= 0) return resolved;
            }
            if (typeof indexOrName === "number" && Number.isFinite(indexOrName)) {
                const idx = indexOrName | 0;
                if (idx < 0) return -1;
                return (!this.morphWeights || idx < this.morphWeights.length) ? idx : -1;
            }
            return -1;
        }

        setMorphWeight(indexOrName, weight = 0) {
            this.#syncMeshShape();
            if (!this.morphWeights || this.morphWeights.length <= 0) {
                this.log.write("missing_morphs", `[MeshRenderer] morph weights are unavailable for "${this.meshID ?? "null"}"`, {
                    meshID: this.meshID,
                    ref: indexOrName,
                });
                return this;
            }
            const idx = this.resolveMorphIndex(indexOrName);
            if (idx < 0 || idx >= this.morphWeights.length) {
                this.log.write("invalid_morph_target", `[MeshRenderer] unknown morph target "${indexOrName}"`, {
                    ref: indexOrName,
                    meshID: this.meshID,
                });
                return this;
            }
            this.morphWeights[idx] = Number(weight) || 0;
            return this;
        }

        getMorphWeight(indexOrName) {
            if (!this.morphWeights || this.morphWeights.length <= 0) return 0;
            const idx = this.resolveMorphIndex(indexOrName);
            return idx >= 0 && idx < this.morphWeights.length ? this.morphWeights[idx] : 0;
        }

        setMorphExclusive(indexOrName, weight = 1) {
            this.#syncMeshShape();
            if (!this.morphWeights || this.morphWeights.length <= 0) return this;
            for (let i = 0; i < this.morphWeights.length; i++) this.morphWeights[i] = 0;
            return this.setMorphWeight(indexOrName, weight);
        }

        getPrimaryMorph() {
            if (!this.morphWeights || this.morphWeights.length <= 0) return { index: 0, weight: 0 };
            let bestIndex = 0;
            let bestAbs = Math.abs(this.morphWeights[0] ?? 0);
            for (let i = 1; i < this.morphWeights.length; i++) {
                const mag = Math.abs(this.morphWeights[i] ?? 0);
                if (mag > bestAbs) { bestAbs = mag; bestIndex = i; }
            }
            return { index: bestIndex, weight: this.morphWeights[bestIndex] ?? 0 };
        }

        #syncMeshShape() {
            if (!this.#assets || !this.meshID) return;
            const meshData = this.meshAssetData;
            if (!meshData) return;
            const mesh = this.meshAsset;
            const targetCount = Number(mesh?.morphTargetCount ?? 0)
                || Number(meshData.defaultMorphWeights?.length ?? 0)
                || Number(meshData.morphTargetNames?.length ?? 0);

            if (targetCount <= 0) {
                this.morphWeights = null;
                return;
            }

            if (this.morphWeights && this.morphWeights.length === targetCount) return;
            const next = new Float32Array(targetCount);
            if (meshData.defaultMorphWeights?.length) {
                next.set(meshData.defaultMorphWeights.subarray
                    ? meshData.defaultMorphWeights.subarray(0, targetCount)
                    : meshData.defaultMorphWeights.slice(0, targetCount));
            } else if (this.morphWeights?.length) {
                next.set(this.morphWeights.subarray
                    ? this.morphWeights.subarray(0, targetCount)
                    : this.morphWeights.slice(0, targetCount));
            }
            this.morphWeights = next;
        }

        #syncSkeletonShape() {
            if (!this.#scene || !this.#assets || !this.skeletonNode) return;
            const skelComp = this.skeletonComponent;
            if (!(skelComp instanceof Skeleton)) return;
            const skel = skelComp.skeletonAsset;
            if (skel) skelComp.use(skel);
        }
    }

    class Skeleton {
        skeletonID = null;
        skeleton = null;
        bones = [];
        log = new Log(256);

        #scene = null;
        #assets = null;
        #nodeId = null;

        constructor(opts = {}) {
            this.skeletonID = opts.skeletonID ?? null;
            this.skeleton = opts.skeleton ?? null;
            if (!this.skeletonID && this.skeleton?.id) this.skeletonID = this.skeleton.id;
            this.bones = Array.isArray(opts.bones)
                ? opts.bones.map((m) => toLocalMatrix(m))
                : [];
            if (this.skeleton?.bones) this.use(this.skeleton);
        }

        __bindSceneContext(ctx = {}) {
            this.#scene = ctx.scene ?? null;
            this.#assets = ctx.assets ?? null;
            this.#nodeId = ctx.nodeId ?? null;
            const skel = this.skeletonAsset;
            if (skel) this.use(skel);
            return this;
        }

        get skeletonAsset() {
            if (this.skeleton?.bones) return this.skeleton;
            if (!this.#assets || !this.skeletonID) return null;
            return this.#assets.getSkeleton?.(this.skeletonID) ?? null;
        }

        use(skeleton) {
            if (!skeleton || !Array.isArray(skeleton.bones)) return this;
            this.skeleton = skeleton;
            if (skeleton.id) this.skeletonID = skeleton.id;
            this.#ensureBoneCapacity(skeleton.bones.length);
            return this;
        }

        bindSkeletonData(skeletonData) {
            if (!skeletonData) return this;
            const skeleton = skeletonData instanceof EzSkeleton
                ? skeletonData
                : new EzSkeleton(skeletonData);
            return this.use(skeleton);
        }

        resolveBoneIndex(indexOrName, skeletonData = null) {
            if (skeletonData) this.bindSkeletonData(skeletonData);
            else {
                const skel = this.skeletonAsset;
                if (skel && skel !== this.skeleton) this.use(skel);
            }

            if (typeof indexOrName === "number" && Number.isFinite(indexOrName)) {
                const idx = indexOrName | 0;
                return idx < 0 ? -1 : idx;
            }
            if (typeof indexOrName === "string") {
                const map = this.skeleton?.map;
                if (map instanceof Map) {
                    const mapped = map.get(indexOrName);
                    if (mapped != null) return mapped;
                }
            }
            return -1;
        }

        set(indexOrName, localTransform, skeletonData = null) {
            const idx = this.resolveBoneIndex(indexOrName, skeletonData);
            if (idx < 0) {
                this.log.write("invalid_bone", `[Skeleton] unknown bone "${indexOrName}"`, {
                    ref: indexOrName,
                    skeletonID: this.skeletonID,
                });
                return this;
            }
            this.#ensureBoneCapacity(idx + 1);
            this.bones[idx] = toLocalMatrix(localTransform);
            return this;
        }

        get(indexOrName, skeletonData = null) {
            const idx = this.resolveBoneIndex(indexOrName, skeletonData);
            if (idx < 0 || !Array.isArray(this.bones)) return null;
            const bone = this.bones[idx];
            if (!(ArrayBuffer.isView(bone) || Array.isArray(bone)) || bone.length < 16) return null;
            return bone;
        }

        buildPalette(maxBones = 64) {
            const srcBones = this.skeletonAsset?.bones;
            if (!Array.isArray(srcBones) || srcBones.length <= 0) {
                this.log.write("missing_skeleton", `[Skeleton] buildPalette() called without bound skeleton`, {
                    skeletonID: this.skeletonID,
                });
                return null;
            }
            this.#ensureBoneCapacity(srcBones.length);

            const cap = Math.max(1, Number(maxBones) | 0);
            const out = new Float32Array(cap * 16);
            for (let i = 0; i < cap; i++) out.set(IDENTITY_M4, i * 16);

            const gc = Array.from({ length: srcBones.length }, () => ZMath.M4());
            const local = ZMath.M4();
            const skinned = ZMath.M4();
            const count = Math.min(srcBones.length, cap);
            for (let i = 0; i < count; i++) {
                const bone = srcBones[i] ?? {};
                const localBind = (ArrayBuffer.isView(bone.localBind) || Array.isArray(bone.localBind))
                    ? bone.localBind
                    : IDENTITY_M4;
                const pose = this.bones[i] ?? IDENTITY_M4;
                ZMath.M4.mul(localBind, pose, local);

                const parent = Number(bone.parent ?? -1) | 0;
                if (parent < 0 || !gc[parent]) gc[i].set(local);
                else ZMath.M4.mul(gc[parent], local, gc[i]);

                const inverseBind = (ArrayBuffer.isView(bone.inverseBind) || Array.isArray(bone.inverseBind))
                    ? bone.inverseBind
                    : IDENTITY_M4;
                ZMath.M4.mul(gc[i], inverseBind, skinned);
                out.set(skinned, i * 16);
            }
            return out;
        }

        #ensureBoneCapacity(count) {
            while (this.bones.length < count) {
                const pose = new Float32Array(16);
                pose.set(IDENTITY_M4);
                this.bones.push(pose);
            }
        }
    }

    class Custom {
        $ = {};
        log = new Log(256);

        #scene = null;
        #assets = null;
        #nodeId = null;

        constructor(opts = {}) {
            this.$ = (opts && typeof opts.$ === "object")
                ? cloneData(opts.$)
                : {};
        }

        __bindSceneContext(ctx = {}) {
            this.#scene = ctx.scene ?? null;
            this.#assets = ctx.assets ?? null;
            this.#nodeId = ctx.nodeId ?? null;
            return this;
        }

        get scene() { return this.#scene; }
        get assets() { return this.#assets; }
        get nodeId() { return this.#nodeId; }
        get node() {
            if (!this.#scene || this.#nodeId == null) return null;
            return this.#scene.node(this.#nodeId) ?? null;
        }

        run({ deltaTime = 0 } = {}) {
            void deltaTime;
            return this;
        }
    }

    function cloneComponent(value) {
        if (value instanceof Transform) return new Transform(value.local, value.world);
        if (value instanceof MeshRenderer) return new MeshRenderer(value);
        if (value instanceof Skeleton) return new Skeleton(value);
        if (value instanceof Custom) return new Custom(value);
        return cloneData(value);
    }

    class EzScene extends ZTree {
        sceneID = null;
        addedScenes = [];
        log = new Log(512);

        static COMPONENT = Object.freeze({
            Transform: "Transform",
            MeshRenderer: "MeshRenderer",
            Skeleton: "Skeleton",
            Custom: "Custom",
        });

        #runtime = { gl: null, assets: null, camera: null };

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

        get camera() { return this.#runtime.camera; }
        get assets() { return this.#runtime.assets; }

        bindRuntime(runtime = {}) {
            if (Object.prototype.hasOwnProperty.call(runtime, "gl")) this.#runtime.gl = runtime.gl ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "assets")) this.#runtime.assets = runtime.assets ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "camera")) this.#runtime.camera = runtime.camera ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "assets")) this.#bindAllComponents();
            return this;
        }

        addNode(name, parentId = null, options = {}) {
            const out = super.addNode(name, parentId, options);
            if (!out) return null;
            this.#ensureTransform(out.id);
            return out;
        }

        addComponent(nodeId, key, component) {
            return this.#setComponent(nodeId, key, component);
        }

        removeComponent(nodeId, key) {
            const node = this.node(nodeId);
            if (!node) {
                this.log.write("missing_node", `[EzScene] component remove failed, node "${nodeId}" does not exist`, { nodeId, key });
                return false;
            }
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
                if (Object.prototype.hasOwnProperty.call(node.$, key)) out.push({ id, node });
            }
            return out;
        }

        addScene(otherScene, opts = {}) {
            if (!otherScene || typeof otherScene.node !== "function" || !otherScene.rootId) {
                this.log.write("invalid_scene", "[EzScene] addScene() requires another EzScene-like tree", { opts });
                return null;
            }

            const parentId = opts.parentId == null ? this.rootId : String(opts.parentId);
            if (!this.hasNode(parentId)) {
                this.log.write("missing_parent", `[EzScene] parent node "${parentId}" does not exist`, { parentId });
                return null;
            }

            const suffixBase = Object.prototype.hasOwnProperty.call(opts, "suffix")
                ? String(opts.suffix ?? "")
                : "";
            const idMap = new Map();

            for (const [srcId, srcNode] of otherScene.traverse(otherScene.rootId, null, false)) {
                const srcKey = String(srcId);
                const srcParent = srcNode.parent == null ? parentId : idMap.get(String(srcNode.parent));
                if (!srcParent) {
                    this.log.write("missing_remapped_parent", `[EzScene] missing remapped parent for "${srcKey}"`, {
                        srcKey,
                        srcParentRaw: srcNode.parent,
                    });
                    return null;
                }

                let desiredId = suffixBase.length > 0 ? `${srcKey}${suffixBase}` : srcKey;
                if (typeof opts.idRemap === "function") desiredId = String(opts.idRemap(srcKey, desiredId));

                let finalId = desiredId;
                if (!finalId || this.hasNode(finalId)) {
                    let i = 0;
                    do { finalId = `${desiredId || "node"}_${i++}`; }
                    while (this.hasNode(finalId));
                }

                const added = super.addNode(srcNode.name, srcParent, { id: finalId });
                if (!added) {
                    this.log.write("add_node_failed", `[EzScene] failed to add remapped node "${finalId}"`, {
                        srcKey,
                        finalId,
                        srcParent,
                    });
                    return null;
                }

                for (const [compKey, compValue] of Object.entries(srcNode.$ ?? {})) {
                    this.#setComponent(added.id, compKey, cloneComponent(compValue));
                }
                this.#ensureTransform(added.id);
                idMap.set(srcKey, added.id);
            }

            for (const remappedId of idMap.values()) {
                const node = this.node(remappedId);
                const meshRenderer = node?.get(EzScene.COMPONENT.MeshRenderer) ?? node?.get("meshRenderer");
                if (!(meshRenderer instanceof MeshRenderer) || !meshRenderer.skeletonNode) continue;
                const remappedSkeleton = idMap.get(String(meshRenderer.skeletonNode));
                if (remappedSkeleton) meshRenderer.setSkeletonNode(remappedSkeleton);
            }

            const tracker = {
                sourceSceneID: otherScene.sceneID ?? null,
                suffix: suffixBase,
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
                const parentComp = parent?.get(EzScene.COMPONENT.Transform) ?? parent?.get("transform");
                const parentTx = parentComp instanceof Transform ? parentComp : this.#ensureTransform(node.parent);
                ZMath.M4.mul(parentTx.world, transform.local, transform.world);
            }
            return this;
        }

        update(deltaTime = 0) {
            this.updateTransforms();
            for (const [, node] of this.traverse(this.rootId, null, false)) {
                const custom = node.get(EzScene.COMPONENT.Custom) ?? node.get("custom");
                if (custom && typeof custom.run === "function") {
                    try {
                        custom.run({ deltaTime });
                    }
                    catch (error) {
                        if (custom.log?.write) {
                            custom.log.write("custom_run_error", "[Custom] run() failed", {
                                nodeId: node.id,
                                error: String(error?.message ?? error),
                            });
                        }
                        this.log.write("custom_run_error", `[EzScene] Custom.run() failed on node "${node.id}"`, {
                            nodeId: node.id,
                            error: String(error?.message ?? error),
                        });
                    }
                }
                const runner = node.get("update");
                if (typeof runner === "function") {
                    try { runner(node, deltaTime, this); }
                    catch (error) {
                        this.log.write("update_runner_error", `[EzScene] update() runner failed on node "${node.id}"`, {
                            nodeId: node.id,
                            error: String(error?.message ?? error),
                        });
                    }
                }
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
            const getSkinPaletteLoc = (shader) => {
                if (!shader?.program) return null;
                if (shader.other.__skinPaletteLoc !== undefined) return shader.other.__skinPaletteLoc;
                shader.other.__skinPaletteLoc = gl.getUniformLocation(shader.program, "u_skinPalette[0]");
                return shader.other.__skinPaletteLoc;
            };
            const computePalette = (draw) => {
                const skelComp = draw.renderComp.skeletonComponent;
                if (!(skelComp instanceof Skeleton)) return null;
                if (skelComp.skeletonAsset) skelComp.use(skelComp.skeletonAsset);
                return skelComp.buildPalette(Number(assets.constructor?.SKIN_BONE_CAP ?? 64) | 0);
            };

            const rigBit = window.EzMesh?.VertexType?.Rig ?? (1 << 0);
            const morphBit = window.EzMesh?.VertexType?.Morph ?? (1 << 1);
            const colorBit = window.EzMesh?.VertexType?.Color ?? (1 << 2);
            const vtxFlag = new Float32Array(4);

            const batches = new Map();
            for (const [id, node] of this.traverse(this.rootId, null, false)) {
                const renderComp = node.get(EzScene.COMPONENT.MeshRenderer) ?? node.get("meshRenderer");
                if (!(renderComp instanceof MeshRenderer) || !renderComp.active) continue;
                if (!renderComp.meshID || !renderComp.shaderID) continue;
                const key = `${renderComp.meshID}|${renderComp.shaderID}`;
                if (!batches.has(key)) batches.set(key, []);
                batches.get(key).push({
                    id,
                    node,
                    transform: this.#ensureTransform(id),
                    renderComp,
                });
            }

            for (const [key, drawList] of batches.entries()) {
                if (drawList.length === 0) continue;
                const [meshID, shaderID] = key.split("|");
                const mesh = assets.getMesh(meshID);
                const shader = assets.getShader(shaderID);
                if (!mesh || !shader) continue;

                const baseRenderCfg = { depthTest: true, depthWrite: true, cull: "back", blend: true };
                const mergedRenderCfg = shader.other?.renderCfg
                    ? { ...baseRenderCfg, ...shader.other.renderCfg }
                    : baseRenderCfg;
                ZRender.setState(gl, mergedRenderCfg);

                shader.bind(gl);
                if (camera) {
                    if (camera.view) setUniform(shader, "u_view", camera.view);
                    if (camera.projection) setUniform(shader, "u_proj", camera.projection);
                }
                const skinPaletteLoc = getSkinPaletteLoc(shader);

                for (const draw of drawList) {
                    const world = draw.transform.world;
                    mesh.updateInstanceChannel("instModel0", world.subarray(0, 4));
                    mesh.updateInstanceChannel("instModel1", world.subarray(4, 8));
                    mesh.updateInstanceChannel("instModel2", world.subarray(8, 12));
                    mesh.updateInstanceChannel("instModel3", world.subarray(12, 16));
                    for (let si = 0; si < 4; si++) {
                        mesh.updateInstanceChannel(`instData${si}`, draw.renderComp.getSlot(si) ?? new Float32Array([0, 0, 0, 0]));
                    }

                    const primaryMorph = draw.renderComp.getPrimaryMorph?.()
                        ?? { index: 0, weight: draw.renderComp.morphWeights?.[0] ?? 0 };
                    setUniform(shader, "u_morphWeight", Number(primaryMorph.weight ?? 0) || 0);
                    if (skinPaletteLoc != null) {
                        const palette = computePalette(draw);
                        if (palette) gl.uniformMatrix4fv(skinPaletteLoc, false, palette);
                    }

                    if (typeof opts.beforeDraw === "function") {
                        opts.beforeDraw({ scene: this, gl, mesh, shader, draw });
                    }

                    for (let submeshIndex = 0; submeshIndex < mesh.submeshes.length; submeshIndex++) {
                        const submesh = mesh.submeshes[submeshIndex];
                        const flags = Number(submesh?.vrtxFlags ?? 0) | 0;
                        vtxFlag[0] = (flags & rigBit) ? 1 : 0;
                        vtxFlag[1] = (flags & morphBit) ? 1 : 0;
                        vtxFlag[2] = (flags & colorBit) ? 1 : 0;
                        vtxFlag[3] = 0;
                        setUniform(shader, "u_vtxFlags", vtxFlag);

                        const mat = submesh?.material ?? {};
                        const albedoColorRaw = mat.albedoColor;
                        const albedoColor = (ArrayBuffer.isView(albedoColorRaw) || Array.isArray(albedoColorRaw))
                            ? albedoColorRaw
                            : [1, 1, 1, 1];
                        setUniform(shader, "u_matAlbedoColor", albedoColor);
                        const albedoTex = mat.albedoTex ? assets.getTexture(mat.albedoTex) : null;
                        const fallbackWhite = assets.getWhiteTexture?.();
                        const texLoc = shader.getUniformLocation("u_matAlbedoTex");
                        if (texLoc != null) {
                            const texHandle = albedoTex?.handle ?? fallbackWhite?.handle ?? null;
                            if (texHandle) ZRender.bindSampler(gl, texLoc, 0, texHandle, gl.TEXTURE_2D);
                            else {
                                gl.activeTexture(gl.TEXTURE0);
                                gl.bindTexture(gl.TEXTURE_2D, null);
                                gl.uniform1i(texLoc, 0);
                            }
                        }

                        const morphRef = Number(primaryMorph.index ?? 0) | 0;
                        const vao = assets.getOrCreateVAO(meshID, shaderID, submeshIndex, morphRef);
                        const drawCfg = mesh.getDrawCfg(submeshIndex);
                        ZRender.withVAO(gl, vao, () => ZRender.drawInstanced(gl, drawCfg, 1));
                    }
                }
            }

            return this;
        }

        #canonicalKey(key) {
            const raw = String(key ?? "");
            if (raw === "Transform" || raw === "transform") return "Transform";
            if (raw === "MeshRenderer" || raw === "meshRenderer") return "MeshRenderer";
            if (raw === "Skeleton" || raw === "skeleton") return "Skeleton";
            if (raw === "Custom" || raw === "custom") return "Custom";
            return raw;
        }

        #makeComponent(key, value) {
            if (key === "Transform") {
                if (value instanceof Transform) return value;
                const v = value && typeof value === "object" ? value : {};
                return new Transform(v.local ?? null, v.world ?? null);
            }
            if (key === "MeshRenderer") {
                if (value instanceof MeshRenderer) return value;
                return new MeshRenderer(value && typeof value === "object" ? value : {});
            }
            if (key === "Skeleton") {
                if (value instanceof Skeleton) return value;
                return new Skeleton(value && typeof value === "object" ? value : {});
            }
            if (key === "Custom") {
                if (value instanceof Custom) return value;
                return new Custom(value && typeof value === "object" ? value : {});
            }
            return value;
        }

        #bindComponent(nodeId, key, component) {
            if (!component || typeof component !== "object") return;
            if (typeof component.__bindSceneContext === "function") {
                component.__bindSceneContext({
                    scene: this,
                    assets: this.#runtime.assets,
                    nodeId: String(nodeId),
                    componentKey: key,
                });
            }
        }

        #setComponent(nodeId, key, value) {
            const node = this.node(nodeId);
            if (!node) {
                this.log.write("missing_node", `[EzScene] component set failed, node "${nodeId}" does not exist`, {
                    nodeId,
                    key,
                });
                return null;
            }

            const canonical = this.#canonicalKey(key);
            const comp = this.#makeComponent(canonical, value);
            node.set(canonical, comp);
            if (canonical !== key && node.get(key) != null) node.remove(key);
            this.#bindComponent(nodeId, canonical, comp);
            return comp;
        }

        #bindAllComponents() {
            for (const [nodeId, node] of this.nodes.entries()) {
                for (const [key, value] of Object.entries(node.$ ?? {})) {
                    this.#bindComponent(nodeId, key, value);
                }
            }
        }

        #ensureTransform(nodeId) {
            const node = this.node(nodeId);
            if (!node) return null;
            const existing = node.get(EzScene.COMPONENT.Transform) ?? node.get("transform");
            if (existing instanceof Transform) return existing;
            const base = existing && typeof existing === "object" ? existing : {};
            return this.#setComponent(nodeId, EzScene.COMPONENT.Transform, new Transform(base.local ?? null, base.world ?? null));
        }

    }

    window.Log = Log;
    window.Transform = Transform;
    window.MeshRenderer = MeshRenderer;
    window.Skeleton = Skeleton;
    window.Custom = Custom;
    window.EzScene = EzScene;
})();
