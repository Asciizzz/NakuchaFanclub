import * as Azm from "../../AzLib/Azm.js";

const WR_COMPONENT_CTX = Symbol("wr_component_ctx");
const WR_NODE_WORLD_FALLBACK = "__wrWorldFallback";
const WR_SKIN_BONE_CAP_DEFAULT = 128;
const WR_NODE_COMPONENT_SKIP_KEYS = new Set([
    "ctx",
    "id",
    "parentId",
    "childIds",
    "parent",
    "children",
    "components",
    "$",
]);

/**
 * Convert input to finite number with fallback
 * @param {any} value source value
 * @param {number} [fallback=0] fallback value
 * @returns {number}
 */
function wrNumberOr(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

/**
 * Convert input matrix data to Float32Array[16], fallback identity
 * @param {ArrayLike<number>|null|undefined} value matrix input
 * @returns {Float32Array}
 */
function wrReadMat4(value) {
    if (ArrayBuffer.isView(value) || Array.isArray(value)) {
        if (value.length >= 16) {
            const copy = value.slice ? value.slice(0, 16) : value.subarray(0, 16);
            return Float32Array.from(copy);
        }
    }
    return Azm.Mat4.IDENTITY;
}

/**
 * Resolve integer-like index from number or numeric string
 * @param {any} value source value
 * @returns {number}
 */
function wrReadIndex(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value | 0;
    if (typeof value === "string" && /^\s*-?\d+\s*$/.test(value)) return Number(value) | 0;
    return -1;
}

/**
 * Ensure method exists on component object without overriding user impl
 * @param {object} target component object
 * @param {string} key method name
 * @param {Function} impl method implementation
 * @returns {void}
 */
function wrDefineMethod(target, key, impl) {
    if (typeof target?.[key] === "function") return;
    Object.defineProperty(target, key, {
        value: impl,
        writable: true,
        configurable: true,
        enumerable: false,
    });
}

/**
 * Resolve asset store from scene context
 * @param {object|null|undefined} scene scene instance
 * @returns {import("/Assets/AssetStorejs")WrAssetStore|null}
 */
function wrSceneAssets(scene) {
    return scene?.assets ?? scene?.asset?.assets ?? null;
}

/**
 * Resolve mesh morph target count from mesh asset shape
 * @param {object|null|undefined} meshAsset mesh asset
 * @returns {number}
 */
function wrResolveMorphTargetCount(meshAsset) {
    if (meshAsset && typeof meshAsset.getMorphTargetCount === "function") {
        return Math.max(0, Number(meshAsset.getMorphTargetCount()) | 0);
    }
    if (!meshAsset || typeof meshAsset !== "object") return 0;
    let count = Math.max(0, Number(meshAsset.morphTargetCount ?? 0) | 0);
    if (Array.isArray(meshAsset.morphTargetNames)) count = Math.max(count, meshAsset.morphTargetNames.length);
    if (ArrayBuffer.isView(meshAsset.defaultMorphWeights) || Array.isArray(meshAsset.defaultMorphWeights)) {
        count = Math.max(count, meshAsset.defaultMorphWeights.length);
    }
    for (const submesh of Array.isArray(meshAsset.submeshes) ? meshAsset.submeshes : []) {
        count = Math.max(count, Math.max(0, Number(submesh?.morph?.targetCount ?? 0) | 0));
    }
    return count;
}

/**
 * Resolve mesh asset for one mesh renderer from scene context
 * @param {object|null|undefined} scene scene instance
 * @param {object} meshRenderer mesh renderer component
 * @returns {object|null}
 */
function wrResolveMeshAsset(scene, meshRenderer) {
    const assets = wrSceneAssets(scene);
    const meshID = String(meshRenderer?.meshID ?? "").trim();
    if (!assets || !meshID) return null;
    return assets.getMesh?.(meshID) ?? null;
}

/**
 * Ensure mesh renderer has morph weight array sized for referenced mesh
 * @param {object} meshRenderer mesh renderer component
 * @param {object|null|undefined} meshAsset mesh asset
 * @returns {Float32Array|null}
 */
function wrEnsureMeshRendererMorphWeights(meshRenderer, meshAsset) {
    if (!meshRenderer || typeof meshRenderer !== "object") return null;
    const targetCount = wrResolveMorphTargetCount(meshAsset);
    if (targetCount <= 0) {
        meshRenderer.morphWeights = null;
        return null;
    }

    const current = meshRenderer.morphWeights;
    if (current instanceof Float32Array && current.length === targetCount) {
        return current;
    }
    if ((ArrayBuffer.isView(current) || Array.isArray(current)) && current.length === targetCount) {
        meshRenderer.morphWeights = Float32Array.from(current);
        return meshRenderer.morphWeights;
    }

    const prev = (ArrayBuffer.isView(current) || Array.isArray(current))
        ? Float32Array.from(current)
        : null;
    const next = new Float32Array(targetCount);
    if (prev && prev.length > 0) {
        next.set(prev.subarray ? prev.subarray(0, targetCount) : prev.slice(0, targetCount));
    } else if (typeof meshAsset?.getDefaultMorphWeights === "function") {
        const defaults = meshAsset.getDefaultMorphWeights();
        if (defaults) next.set(defaults.subarray ? defaults.subarray(0, targetCount) : defaults.slice(0, targetCount));
    } else if (ArrayBuffer.isView(meshAsset?.defaultMorphWeights) || Array.isArray(meshAsset?.defaultMorphWeights)) {
        const defaults = meshAsset.defaultMorphWeights;
        next.set(defaults.subarray ? defaults.subarray(0, targetCount) : defaults.slice(0, targetCount));
    }
    meshRenderer.morphWeights = next;
    return next;
}

/**
 * Resolve morph target index by index or name with asset cache fallback
 * @param {object|null|undefined} scene scene instance
 * @param {object} meshRenderer mesh renderer component
 * @param {string|number} indexOrName morph target reference
 * @returns {number}
 */
function wrResolveMeshMorphIndex(scene, meshRenderer, indexOrName) {
    const meshAsset = wrResolveMeshAsset(scene, meshRenderer);
    if (meshAsset && typeof meshAsset.resolveMorphIndex === "function") {
        return meshAsset.resolveMorphIndex(indexOrName);
    }

    const idx = wrReadIndex(indexOrName);
    if (idx >= 0) {
        const count = wrResolveMorphTargetCount(meshAsset);
        return idx < count ? idx : -1;
    }

    const assets = wrSceneAssets(scene);
    const meshID = String(meshRenderer?.meshID ?? "").trim();
    if (!meshID) return -1;
    if (assets?.resolveMeshMorphIndex) {
        return assets.resolveMeshMorphIndex(meshID, indexOrName);
    }

    const name = String(indexOrName ?? "").trim();
    if (!name) return -1;
    const map = meshAsset?.morphTargetMap;
    if (!(map instanceof Map)) return -1;
    const exact = map.get(name);
    if (exact != null) return Number(exact) | 0;
    const lower = map.get(name.toLowerCase());
    return lower == null ? -1 : (Number(lower) | 0);
}

/**
 * Resolve skeleton asset for skeleton component
 * @param {object|null|undefined} scene scene instance
 * @param {object} skeletonComp skeleton component
 * @returns {object|null}
 */
function wrResolveSkeletonAsset(scene, skeletonComp) {
    if (skeletonComp?.skeleton && Array.isArray(skeletonComp.skeleton.bones)) {
        return skeletonComp.skeleton;
    }
    const skeletonID = String(skeletonComp?.skeletonID ?? skeletonComp?.skeletonId ?? "").trim();
    if (!skeletonID) return null;
    return wrSceneAssets(scene)?.getSkeleton?.(skeletonID) ?? null;
}

/**
 * Ensure skeleton local pose array is at least `count` long
 * @param {object} skeletonComp skeleton component
 * @param {number} count minimum length
 * @returns {void}
 */
function wrEnsureSkeletonPoseCapacity(skeletonComp, count) {
    if (!Array.isArray(skeletonComp.bones)) skeletonComp.bones = [];
    if (typeof skeletonComp?.skeleton?.ensurePoseCapacity === "function") {
        skeletonComp.bones = skeletonComp.skeleton.ensurePoseCapacity(skeletonComp.bones, count);
        return;
    }
    while (skeletonComp.bones.length < count) {
        skeletonComp.bones.push(Azm.Mat4.makeIdentity());
    }
}

/**
 * Resolve skeleton bone index by index or name
 * @param {object|null|undefined} scene scene instance
 * @param {object} skeletonComp skeleton component
 * @param {string|number} indexOrName bone reference
 * @returns {number}
 */
function wrResolveSkeletonBoneIndex(scene, skeletonComp, indexOrName) {
    const skeletonAsset = wrResolveSkeletonAsset(scene, skeletonComp);
    if (skeletonAsset && typeof skeletonAsset.resolveBoneIndex === "function") {
        return skeletonAsset.resolveBoneIndex(indexOrName);
    }

    const idx = wrReadIndex(indexOrName);
    if (idx >= 0) return idx;

    const name = String(indexOrName ?? "").trim();
    if (!name) return -1;

    const skeletonID = String(skeletonComp?.skeletonID ?? skeletonComp?.skeletonId ?? "").trim();
    const assets = wrSceneAssets(scene);
    if (assets?.resolveSkeletonBoneIndex && skeletonID) {
        const fromAssets = assets.resolveSkeletonBoneIndex(skeletonID, name);
        if (fromAssets >= 0) return fromAssets;
    }

    const map = skeletonAsset?.map;
    if (!(map instanceof Map)) return -1;
    const exact = map.get(name);
    if (exact != null) return Number(exact) | 0;
    const lower = map.get(name.toLowerCase());
    return lower == null ? -1 : (Number(lower) | 0);
}

/**
 * Build skeleton skinning palette from local pose overrides and skeleton asset
 * @param {object|null|undefined} scene scene instance
 * @param {object} skeletonComp skeleton component
 * @param {number} [maxBones=WR_SKIN_BONE_CAP_DEFAULT] palette cap
 * @returns {Float32Array|null}
 */
function wrBuildSkeletonPalette(scene, skeletonComp, maxBones = WR_SKIN_BONE_CAP_DEFAULT) {
    const skeletonAsset = wrResolveSkeletonAsset(scene, skeletonComp);
    if (skeletonAsset && typeof skeletonAsset.buildPalette === "function") {
        const sourceBones = Array.isArray(skeletonAsset.bones) ? skeletonAsset.bones : [];
        wrEnsureSkeletonPoseCapacity(skeletonComp, sourceBones.length);
        return skeletonAsset.buildPalette(skeletonComp.bones, maxBones);
    }

    const sourceBones = Array.isArray(skeletonAsset?.bones) ? skeletonAsset.bones : [];
    if (sourceBones.length <= 0) return null;
    wrEnsureSkeletonPoseCapacity(skeletonComp, sourceBones.length);
    const cap = Math.max(1, Number(maxBones) | 0);
    const out = new Float32Array(cap * 16);
    for (let i = 0; i < cap; i++) out.set(Azm.Mat4.IDENTITY, i * 16);

    const global = new Array(sourceBones.length);
    const count = Math.min(sourceBones.length, cap);
    for (let i = 0; i < count; i++) {
        const bone = sourceBones[i] ?? {};
        const localBind = wrReadMat4(bone.localBind);
        const pose = wrReadMat4(skeletonComp.bones?.[i]);
        const local = Azm.Mat4.mul(localBind, pose);
        const parent = Number(bone.parent ?? -1) | 0;
        if (parent < 0 || !global[parent]) global[i] = local;
        else global[i] = Azm.Mat4.mul(global[parent], local);
        const inverseBind = wrReadMat4(bone.inverseBind);
        const skinned = Azm.Mat4.mul(global[i], inverseBind);
        out.set(skinned, i * 16);
    }
    return out;
}

/**
 * Bind runtime helpers to MeshRenderer component
 * @param {object} scene scene instance
 * @param {string} nodeId owner node id
 * @param {object} meshRenderer mesh renderer component
 * @returns {object}
 */
function wrBindMeshRenderer(scene, nodeId, meshRenderer) {
    if (!meshRenderer || typeof meshRenderer !== "object") return meshRenderer;
    meshRenderer[WR_COMPONENT_CTX] = { scene, nodeId };
    if (meshRenderer.active == null) meshRenderer.active = true;
    meshRenderer.meshID = meshRenderer.meshID == null ? null : String(meshRenderer.meshID);
    if (meshRenderer.skeletonNode != null) {
        if (typeof meshRenderer.skeletonNode === "object" && meshRenderer.skeletonNode.id != null) {
            meshRenderer.skeletonNode = String(meshRenderer.skeletonNode.id);
        } else {
            meshRenderer.skeletonNode = String(meshRenderer.skeletonNode);
        }
    } else if (meshRenderer.skeletonNode === undefined) {
        meshRenderer.skeletonNode = null;
    }

    const keys = Array.isArray(meshRenderer.shaderKeys)
        ? meshRenderer.shaderKeys
        : meshRenderer.shaderKeys instanceof Set
            ? Array.from(meshRenderer.shaderKeys.values())
            : (meshRenderer.shaderKey != null ? [meshRenderer.shaderKey] : []);
    meshRenderer.shaderKeys = keys
        .map((it) => String(it ?? "").trim())
        .filter((it, index, arr) => !!it && arr.indexOf(it) === index);

    if (ArrayBuffer.isView(meshRenderer.morphWeights) || Array.isArray(meshRenderer.morphWeights)) {
        if (!(meshRenderer.morphWeights instanceof Float32Array)) {
            meshRenderer.morphWeights = Float32Array.from(meshRenderer.morphWeights);
        }
    }
    wrEnsureMeshRendererMorphWeights(meshRenderer, wrResolveMeshAsset(scene, meshRenderer));

    wrDefineMethod(meshRenderer, "withShader", function withShader(shaderID) {
        const id = String(shaderID ?? "").trim();
        if (!id) return this;
        if (!Array.isArray(this.shaderKeys)) this.shaderKeys = [];
        if (!this.shaderKeys.includes(id)) this.shaderKeys.push(id);
        return this;
    });

    wrDefineMethod(meshRenderer, "hasShader", function hasShader(shaderID) {
        const id = String(shaderID ?? "").trim();
        if (!id) return false;
        return Array.isArray(this.shaderKeys) ? this.shaderKeys.includes(id) : false;
    });

    wrDefineMethod(meshRenderer, "removeShader", function removeShader(shaderID) {
        const id = String(shaderID ?? "").trim();
        if (!id || !Array.isArray(this.shaderKeys)) return this;
        this.shaderKeys = this.shaderKeys.filter((next) => next !== id);
        return this;
    });

    wrDefineMethod(meshRenderer, "clearShaders", function clearShaders() {
        this.shaderKeys = [];
        return this;
    });

    wrDefineMethod(meshRenderer, "resolveMorphIndex", function resolveMorphIndex(indexOrName) {
        const ctx = this[WR_COMPONENT_CTX] ?? {};
        return wrResolveMeshMorphIndex(ctx.scene, this, indexOrName);
    });

    wrDefineMethod(meshRenderer, "setMorphWeight", function setMorphWeight(indexOrName, weight = 0) {
        const ctx = this[WR_COMPONENT_CTX] ?? {};
        const meshAsset = wrResolveMeshAsset(ctx.scene, this);
        const morphWeights = wrEnsureMeshRendererMorphWeights(this, meshAsset);
        if (!morphWeights || morphWeights.length <= 0) return this;
        const index = wrResolveMeshMorphIndex(ctx.scene, this, indexOrName);
        if (index < 0 || index >= morphWeights.length) return this;
        morphWeights[index] = wrNumberOr(weight, 0);
        return this;
    });

    wrDefineMethod(meshRenderer, "getMorphWeight", function getMorphWeight(indexOrName) {
        const ctx = this[WR_COMPONENT_CTX] ?? {};
        const meshAsset = wrResolveMeshAsset(ctx.scene, this);
        const morphWeights = wrEnsureMeshRendererMorphWeights(this, meshAsset);
        if (!morphWeights || morphWeights.length <= 0) return 0;
        const index = wrResolveMeshMorphIndex(ctx.scene, this, indexOrName);
        return index >= 0 && index < morphWeights.length ? wrNumberOr(morphWeights[index], 0) : 0;
    });

    wrDefineMethod(meshRenderer, "setMorphExclusive", function setMorphExclusive(indexOrName, weight = 1) {
        const ctx = this[WR_COMPONENT_CTX] ?? {};
        const meshAsset = wrResolveMeshAsset(ctx.scene, this);
        const morphWeights = wrEnsureMeshRendererMorphWeights(this, meshAsset);
        if (!morphWeights || morphWeights.length <= 0) return this;
        morphWeights.fill(0);
        return this.setMorphWeight(indexOrName, weight);
    });

    wrDefineMethod(meshRenderer, "getPrimaryMorph", function getPrimaryMorph() {
        const ctx = this[WR_COMPONENT_CTX] ?? {};
        const meshAsset = wrResolveMeshAsset(ctx.scene, this);
        const morphWeights = wrEnsureMeshRendererMorphWeights(this, meshAsset);
        if (!morphWeights || morphWeights.length <= 0) return { index: 0, weight: 0 };

        let bestIndex = 0;
        let bestAbs = Math.abs(morphWeights[0] ?? 0);
        for (let i = 1; i < morphWeights.length; i++) {
            const magnitude = Math.abs(morphWeights[i] ?? 0);
            if (magnitude > bestAbs) {
                bestAbs = magnitude;
                bestIndex = i;
            }
        }
        return { index: bestIndex, weight: wrNumberOr(morphWeights[bestIndex], 0) };
    });

    return meshRenderer;
}

/**
 * Bind runtime helpers to Skeleton component
 * @param {object} scene scene instance
 * @param {string} nodeId owner node id
 * @param {object} skeletonComp skeleton component
 * @returns {object}
 */
function wrBindSkeleton(scene, nodeId, skeletonComp) {
    if (!skeletonComp || typeof skeletonComp !== "object") return skeletonComp;
    skeletonComp[WR_COMPONENT_CTX] = { scene, nodeId };
    const rawSkeletonID = skeletonComp.skeletonID ?? skeletonComp.skeletonId ?? null;
    skeletonComp.skeletonID = rawSkeletonID == null ? null : String(rawSkeletonID);
    skeletonComp.skeletonId = skeletonComp.skeletonID;
    if (!Array.isArray(skeletonComp.bones)) skeletonComp.bones = [];
    else {
        skeletonComp.bones = skeletonComp.bones.map((pose) => {
            if (pose instanceof Float32Array && pose.length >= 16) return pose;
            return wrReadMat4(pose);
        });
    }

    const linkedSkeleton = wrResolveSkeletonAsset(scene, skeletonComp);
    if (linkedSkeleton?.id && !skeletonComp.skeletonID) {
        skeletonComp.skeletonID = String(linkedSkeleton.id);
        skeletonComp.skeletonId = skeletonComp.skeletonID;
    }
    if (Array.isArray(linkedSkeleton?.bones)) {
        if (typeof linkedSkeleton.ensurePoseCapacity === "function") {
            skeletonComp.bones = linkedSkeleton.ensurePoseCapacity(skeletonComp.bones, linkedSkeleton.bones.length);
        } else {
            wrEnsureSkeletonPoseCapacity(skeletonComp, linkedSkeleton.bones.length);
        }
    }

    wrDefineMethod(skeletonComp, "use", function use(skeleton) {
        if (!skeleton || !Array.isArray(skeleton.bones)) return this;
        this.skeleton = skeleton;
        if (skeleton.id != null) {
            this.skeletonID = String(skeleton.id);
            this.skeletonId = this.skeletonID;
        }
        if (typeof skeleton.ensurePoseCapacity === "function") {
            this.bones = skeleton.ensurePoseCapacity(this.bones, skeleton.bones.length);
        } else {
            wrEnsureSkeletonPoseCapacity(this, skeleton.bones.length);
        }
        return this;
    });

    wrDefineMethod(skeletonComp, "bindSkeletonData", function bindSkeletonData(skeletonData) {
        return this.use(skeletonData);
    });

    wrDefineMethod(skeletonComp, "resolveBoneIndex", function resolveBoneIndex(indexOrName, skeletonData = null) {
        if (skeletonData) this.bindSkeletonData(skeletonData);
        const ctx = this[WR_COMPONENT_CTX] ?? {};
        return wrResolveSkeletonBoneIndex(ctx.scene, this, indexOrName);
    });

    wrDefineMethod(skeletonComp, "set", function set(indexOrName, localTransform, skeletonData = null) {
        const index = this.resolveBoneIndex(indexOrName, skeletonData);
        if (index < 0) return this;
        wrEnsureSkeletonPoseCapacity(this, index + 1);
        this.bones[index] = wrReadMat4(localTransform);
        return this;
    });

    wrDefineMethod(skeletonComp, "get", function get(indexOrName, skeletonData = null) {
        const index = this.resolveBoneIndex(indexOrName, skeletonData);
        if (index < 0 || !Array.isArray(this.bones)) return null;
        const pose = this.bones[index];
        if (!(ArrayBuffer.isView(pose) || Array.isArray(pose)) || pose.length < 16) return null;
        return pose;
    });

    wrDefineMethod(skeletonComp, "buildPalette", function buildPalette(maxBones = WR_SKIN_BONE_CAP_DEFAULT) {
        const ctx = this[WR_COMPONENT_CTX] ?? {};
        return wrBuildSkeletonPalette(ctx.scene, this, maxBones);
    });

    return skeletonComp;
}

/**
 * Runtime helpers for world branch traversal and transform updates
 */
export class WrWorldRuntime {
    /**
     * Resolve component map from supported node shapes
     * @param {object} node scene node
     * @returns {object}
     */
    static getNodeComponents(node) {
        if (!node || typeof node !== "object") return {};
        if (node.components && typeof node.components === "object") return node.components;
        if (node.$ && typeof node.$ === "object") return node.$;
        return node;
    }

    /**
     * Bind runtime component methods for one scene node
     * @param {object} scene owner scene
     * @param {object} node scene node
     * @returns {void}
     */
    static bindNodeComponents(scene, node) {
        if (!node || typeof node !== "object") return;
        const nodeId = String(node.id ?? "");
        const comps = WrWorldRuntime.getNodeComponents(node);
        const entries = comps === node
            ? Object.entries(node).filter(([key]) => !WR_NODE_COMPONENT_SKIP_KEYS.has(key))
            : Object.entries(comps);
        for (const [key, value] of entries) {
            if (!value || typeof value !== "object") continue;
            WrWorldRuntime.bindComponent(scene, nodeId, key, value);
        }
    }

    /**
     * Bind runtime component methods for all scene nodes
     * @param {object} scene owner scene
     * @returns {void}
     */
    static bindSceneComponents(scene) {
        if (!scene) return;
        const nodes = Array.isArray(scene.nodes)
            ? scene.nodes
            : (scene?.nodes instanceof Map ? Array.from(scene.nodes.values()) : []);
        for (const node of nodes) {
            WrWorldRuntime.bindNodeComponents(scene, node);
        }
    }

    /**
     * Bind runtime helper methods for one component instance
     * @param {object} scene owner scene
     * @param {string} nodeId owner node id
     * @param {string} key component key
     * @param {object} value component payload
     * @returns {object}
     */
    static bindComponent(scene, nodeId, key, value) {
        const rawKey = String(key ?? "").trim();
        if (!value || typeof value !== "object" || !rawKey) return value;
        if (rawKey === "MeshRenderer" || rawKey === "meshRenderer") {
            return wrBindMeshRenderer(scene, nodeId, value);
        }
        if (rawKey === "Skeleton" || rawKey === "skeleton") {
            return wrBindSkeleton(scene, nodeId, value);
        }
        value[WR_COMPONENT_CTX] = { scene, nodeId };
        return value;
    }

    /**
     * Resolve mesh renderer component from node
     * @param {object} node scene node
     * @returns {object|null}
     */
    static getMeshRenderer(node) {
        const comps = WrWorldRuntime.getNodeComponents(node);
        return comps.MeshRenderer ?? comps.meshRenderer ?? null;
    }

    /**
     * Resolve and normalize transform component from node
     * @param {object} node scene node
     * @param {object} [options={}] transform resolve options
     * @param {boolean} [optionscreate=true] create transform when missing
     * @returns {{local: Float32Array, world: Float32Array}|null}
     */
    static getTransform(node, options = {}) {
        const create = options?.create !== false;
        const comps = WrWorldRuntime.getNodeComponents(node);
        let tx = comps.Transform ?? comps.transform ?? null;
        if (!tx || typeof tx !== "object") {
            if (!create) return null;
            tx = {
                local: Azm.Mat4.makeIdentity(),
                world: Azm.Mat4.makeIdentity(),
            };
            comps.Transform = tx;
            if (comps.transform && comps.transform !== tx) delete comps.transform;
            return tx;
        }

        if (!tx.local || !(ArrayBuffer.isView(tx.local) || Array.isArray(tx.local)) || tx.local.length < 16) {
            tx.local = Azm.Mat4.makeIdentity();
        } else if (!(tx.local instanceof Float32Array)) {
            tx.local = wrReadMat4(tx.local);
        }

        if (!tx.world || !(ArrayBuffer.isView(tx.world) || Array.isArray(tx.world)) || tx.world.length < 16) {
            tx.world = wrReadMat4(tx.local);
        } else if (!(tx.world instanceof Float32Array)) {
            tx.world = wrReadMat4(tx.world);
        }

        comps.Transform = tx;
        if (comps.transform && comps.transform !== tx) delete comps.transform;
        return tx;
    }

    /**
     * Rebuild hierarchy links and propagate world transforms
     * @param {object} scene scene-like object with nodes array
     * @returns {object|null}
     */
    static updateTransforms(scene, options = {}) {
        if (!scene) return scene ?? null;
        const fromId = String(options?.from ?? "").trim();
        if (!fromId) return scene ?? null;

        for (const _node of WrWorldRuntime.traverseNodes(scene, {
            from: fromId,
            mode: "dfs_pre",
            includeFrom: true,
            updateTransforms: true,
            bindComponents: false,
        })) {
            // traversal performs in-place world transform update
        }

        return scene;
    }

    /**
     * Traverse one branch and optionally update transforms and bind components inline
     * Uses scenetraverseRaw when available to avoid recursive wrapper overhead
     * @param {object} scene scene-like object
     * @param {object} [options={}] traverse options
     * @param {string|object} [optionsfrom] branch root id
     * @param {string} [optionsmode="dfs_pre"] traversal mode
     * @param {boolean} [optionsincludeFrom=true] include from node
     * @param {boolean} [optionsupdateTransforms=true] update transform world during traversal
     * @param {boolean} [optionsbindComponents=true] bind runtime component helpers
     * @returns {Generator<object>}
     */
    static *traverseNodes(scene, options = {}) {
        if (!scene) return;
        const fromId = String(options?.from ?? "").trim();
        if (!fromId) return;

        const mode = String(options?.mode ?? "dfs_pre");
        const includeFrom = options?.includeFrom !== false;
        const updateTransforms = options?.updateTransforms !== false;
        const bindComponents = options?.bindComponents !== false;
        const closestWorldById = updateTransforms ? new Map() : null;

        const baseIter = (() => {
            if (typeof scene?.traverseRaw === "function") {
                return scene.traverseRaw({ from: fromId, mode, includeFrom });
            }
            if (typeof scene?.traverse === "function") {
                return scene.traverse({ from: fromId, mode, includeFrom });
            }
            return [];
        })();

        for (const entry of baseIter) {
            const node = Array.isArray(entry) ? entry[0] : entry;
            if (!node || typeof node !== "object") continue;
            const nodeId = String(node.id ?? "").trim();

            if (updateTransforms && nodeId) {
                const parentRaw = node.parentId ?? node.parent ?? null;
                const parentId = parentRaw == null ? null : String(parentRaw).trim();
                const parentWorld = parentId ? (closestWorldById.get(parentId) ?? null) : null;
                const tx = WrWorldRuntime.getTransform(node, { create: false });
                if (!tx) {
                    node[WR_NODE_WORLD_FALLBACK] = parentWorld ?? Azm.Mat4.IDENTITY;
                    closestWorldById.set(nodeId, parentWorld);
                } else {
                    if (parentWorld) {
                        Azm.Mat4.mul(parentWorld, tx.local, tx.world);
                    } else {
                        tx.world.set(tx.local);
                    }
                    node[WR_NODE_WORLD_FALLBACK] = tx.world;
                    closestWorldById.set(nodeId, tx.world);
                }
            }

            if (bindComponents) WrWorldRuntime.bindNodeComponents(scene, node);
            yield node;
        }
    }

    /**
     * Return active renderable nodes with mesh renderer payload
     * @param {object} scene scene-like object with nodes array
     * @returns {{node: object, meshRenderer: object}[]}
     */
    static iterRenderableNodes(scene, options = {}) {
        if (!scene) return [];
        const out = [];
        const fromId = String(options?.from ?? "").trim();
        if (fromId) {
            for (const node of WrWorldRuntime.traverseNodes(scene, {
                from: fromId,
                mode: options.mode ?? "dfs_pre",
                includeFrom: options.includeFrom !== false,
                updateTransforms: options.updateTransforms !== false,
                bindComponents: true,
            })) {
                const meshRenderer = WrWorldRuntime.getMeshRenderer(node);
                if (!meshRenderer) continue;
                if (meshRenderer.active === false) continue;
                if (!meshRenderer.meshID) continue;
                out.push({ node, meshRenderer });
            }
            return out;
        }

        const nodes = Array.isArray(scene.nodes)
            ? scene.nodes
            : (scene?.nodes instanceof Map ? Array.from(scene.nodes.values()) : []);
        for (const node of nodes) {
            WrWorldRuntime.bindNodeComponents(scene, node);
            const meshRenderer = WrWorldRuntime.getMeshRenderer(node);
            if (!meshRenderer) continue;
            if (meshRenderer.active === false) continue;
            if (!meshRenderer.meshID) continue;
            out.push({ node, meshRenderer });
        }

        return out;
    }
}

export default WrWorldRuntime;


