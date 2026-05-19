import { wrCloneData } from "../Assets/AssetTypes.js";
import WrNode from "./Node.js";
import WrRenderQueue from "./RenderQueue.js";
import WrSceneRuntime from "./SceneRuntime.js";
import { WR_DEFAULT_RENDER_CFG, wrNormalizeRenderCfg } from "./RenderConfig.js";

let wrSceneAutoId = 0;
let wrSceneAutoNodeId = 0;

const WR_IDENTITY_M4 = Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
]);

/**
 * Resolve scene id with auto id fallback.
 * @param {string|null|undefined} rawId preferred id
 * @returns {string}
 */
function wrSceneId(rawId) {
    const value = String(rawId ?? "").trim();
    if (value) return value;
    return `scene_${wrSceneAutoId++}`;
}

/**
 * Resolve node id with auto id fallback.
 * @param {string|null|undefined} rawId preferred id
 * @returns {string}
 */
function wrNodeId(rawId) {
    const value = String(rawId ?? "").trim();
    if (value) return value;
    return `node_${wrSceneAutoNodeId++}`;
}

/**
 * Convert input matrix to Float32Array[16], fallback identity.
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
    return Float32Array.from(WR_IDENTITY_M4);
}

/**
 * Normalize component map and ensure Transform matrices exist.
 * @param {object|null|undefined} rawComponents source components
 * @returns {object}
 */
function wrNormalizeComponents(rawComponents) {
    const source = (rawComponents && typeof rawComponents === "object")
        ? rawComponents
        : {};
    const next = wrCloneData(source);
    const tx = next.Transform ?? next.transform ?? null;
    if (tx && typeof tx === "object") {
        next.Transform = {
            ...tx,
            local: wrReadMat4(tx.local ?? null),
            world: wrReadMat4(tx.world ?? tx.local ?? null),
        };
        if (next.transform && next.transform !== next.Transform) {
            delete next.transform;
        }
    } else {
        next.Transform = {
            local: Float32Array.from(WR_IDENTITY_M4),
            world: Float32Array.from(WR_IDENTITY_M4),
        };
    }
    return next;
}

/**
 * Normalize raw scene data into WrScene internal shape.
 * @param {object} [sceneData={}] scene payload
 * @returns {{id:string,name:string,rootId:string,nodes:object[]}}
 */
function wrNormalizeSceneData(sceneData = {}) {
    const rawNodes = Array.isArray(sceneData.nodes) ? sceneData.nodes : [];
    const nodes = [];
    const nodeById = new Map();

    for (let i = 0; i < rawNodes.length; i++) {
        const rawNode = rawNodes[i] ?? {};
        const id = wrNodeId(rawNode.id);
        if (nodeById.has(id)) continue;

        const parentRaw = rawNode.parent == null ? null : String(rawNode.parent);
        const childrenRaw = Array.isArray(rawNode.children)
            ? rawNode.children.map((childId) => String(childId))
            : [];
        const componentsRaw = (rawNode.components && typeof rawNode.components === "object")
            ? rawNode.components
            : ((rawNode.$ && typeof rawNode.$ === "object") ? rawNode.$ : {});
        const node = {
            id,
            name: String(rawNode.name ?? id),
            parent: parentRaw,
            children: childrenRaw,
            components: wrNormalizeComponents(componentsRaw),
        };
        nodes.push(node);
        nodeById.set(id, node);
    }

    const childrenByParent = new Map();
    for (const node of nodes) {
        if (node.parent == null) continue;
        if (!nodeById.has(node.parent)) {
            node.parent = null;
            continue;
        }
        if (!childrenByParent.has(node.parent)) childrenByParent.set(node.parent, []);
        childrenByParent.get(node.parent).push(node.id);
    }

    for (const node of nodes) {
        const fromParent = childrenByParent.get(node.id) ?? [];
        const dedup = [];
        const seen = new Set();
        for (const nextId of [...node.children, ...fromParent]) {
            const childId = String(nextId);
            if (!nodeById.has(childId)) continue;
            if (seen.has(childId)) continue;
            seen.add(childId);
            dedup.push(childId);
        }
        node.children = dedup;
    }

    let rootId = String(sceneData.rootId ?? sceneData.rootID ?? sceneData.root ?? "").trim();
    if (!rootId || !nodeById.has(rootId)) {
        rootId = nodes[0]?.id ?? wrNodeId("Root");
    }
    if (!nodeById.has(rootId)) {
        const rootNode = {
            id: rootId,
            name: "Root",
            parent: null,
            children: [],
            components: wrNormalizeComponents({}),
        };
        nodes.push(rootNode);
        nodeById.set(rootId, rootNode);
    }

    const rootNode = nodeById.get(rootId);
    if (rootNode) rootNode.parent = null;

    return {
        id: wrSceneId(sceneData.id ?? sceneData.sceneID),
        name: String(sceneData.name ?? "Scene"),
        rootId,
        nodes,
    };
}

/**
 * Standalone scene bound to one WrAsset context.
 */
export class WrScene {
    /**
     * @param {import("./Asset.js").WrAsset} asset owning asset context
     * @param {object} [sceneData={}] scene data payload
     * @param {object} [options={}] runtime options
     */
    constructor(asset, sceneData = {}, options = {}) {
        if (!asset) throw new Error("[WrScene] asset context is required");
        this.asset = asset;

        const normalized = wrNormalizeSceneData(sceneData);
        this.id = normalized.id;
        this.sceneID = this.id;
        this.name = normalized.name;
        this.rootId = normalized.rootId;
        this.nodes = normalized.nodes;
        this.deltaTime = 0;
        this.camera = options.camera ?? asset.camera ?? null;
        this.defaultShaderId = options.defaultShaderId ?? asset.defaultShaderId ?? null;
        this.defaultRenderCfg = wrNormalizeRenderCfg(
            options.renderCfg ?? sceneData.renderCfg ?? asset.defaultRenderCfg ?? WR_DEFAULT_RENDER_CFG
        );
        this.instancedScenes = [];

        this.#rebuildIndex();
        WrSceneRuntime.bindSceneComponents(this);
    }

    /**
     * Get node wrapper by id.
     * @param {string} nodeId node id
     * @returns {WrNode|null}
     */
    node(nodeId) {
        const id = String(nodeId ?? "").trim();
        if (!id) return null;
        if (!this.#nodeById.has(id)) return null;
        const rawNode = this.#nodeById.get(id);
        WrSceneRuntime.bindNodeComponents(this, rawNode);
        if (this.#nodeCache.has(id)) return this.#nodeCache.get(id);
        const wrapped = new WrNode(this, id);
        this.#nodeCache.set(id, wrapped);
        return wrapped;
    }

    /**
     * Check if scene contains node id.
     * @param {string} nodeId node id
     * @returns {boolean}
     */
    hasNode(nodeId) {
        return this.#nodeById.has(String(nodeId ?? "").trim());
    }

    /**
     * Get raw node data by id.
     * @param {string} nodeId node id
     * @returns {object|null}
     */
    getNodeDataById(nodeId) {
        return this.#nodeById.get(String(nodeId ?? "").trim()) ?? null;
    }

    /**
     * Find all nodes that contain a component key.
     * @param {string} key component key
     * @returns {WrNode[]}
     */
    findByComponent(key) {
        const target = String(key ?? "").trim();
        if (!target) return [];
        const out = [];
        for (const node of this.nodes) {
            const comps = WrSceneRuntime.getNodeComponents(node);
            if (!Object.prototype.hasOwnProperty.call(comps, target)) continue;
            const wrapped = this.node(node.id);
            if (wrapped) out.push(wrapped);
        }
        return out;
    }

    /**
     * Update transforms and run node update callbacks.
     * @param {number} [deltaTime=0] frame delta time in seconds
     * @returns {WrScene}
     */
    update(deltaTime = 0) {
        this.deltaTime = Number(deltaTime) || 0;
        WrSceneRuntime.bindSceneComponents(this);
        WrSceneRuntime.updateTransforms(this);

        for (const node of this.nodes) {
            const comps = WrSceneRuntime.getNodeComponents(node);
            const custom = comps.Custom ?? comps.custom ?? null;
            if (custom && typeof custom.run === "function") {
                try {
                    custom.run({
                        deltaTime: this.deltaTime,
                        scene: this,
                        node: this.node(node.id),
                    });
                } catch (error) {
                    console.warn(
                        `[WrScene] Custom.run() failed on node "${node.id}": ${String(error?.message ?? error)}`
                    );
                }
            }
            const runner = comps.update;
            if (typeof runner === "function") {
                try {
                    runner(this.node(node.id), this.deltaTime, this);
                } catch (error) {
                    console.warn(
                        `[WrScene] update() runner failed on node "${node.id}": ${String(error?.message ?? error)}`
                    );
                }
            }
        }

        return this;
    }

    /**
     * Render this scene with asset backend.
     * @param {object} [options={}] optional render overrides
     * @returns {WrScene}
     */
    render(options = {}) {
        const backend = this.asset?.backend ?? null;
        if (!backend || !backend.ready) return this;

        WrSceneRuntime.bindSceneComponents(this);
        WrSceneRuntime.updateTransforms(this);

        const camera = options.camera ?? this.camera ?? this.asset.camera ?? null;
        const defaultShaderId = options.defaultShaderId ?? this.defaultShaderId ?? this.asset.defaultShaderId ?? null;
        const defaultRenderCfg = wrNormalizeRenderCfg(
            options.renderCfg ?? this.defaultRenderCfg ?? this.asset.defaultRenderCfg ?? WR_DEFAULT_RENDER_CFG
        );

        const queue = WrRenderQueue.build(this, camera, this.asset.assets, {
            defaultShaderId,
            defaultRenderCfg,
        });
        backend.beginFrame({
            camera,
            renderCfg: queue.renderCfg ?? defaultRenderCfg,
        });
        backend.executeRenderQueue(queue, { scene: this, camera });
        backend.endFrame({ scene: this, camera });
        return this;
    }

    /**
     * Instantiate another scene as a copied branch under parent node.
     * Source and target scenes must share the same WrAsset context.
     * @param {WrScene|object} otherSceneLike source scene or scene-like payload
     * @param {string|null} [parentNodeId=null] attach parent id
     * @param {object} [options={}] instantiate options
     * @returns {{sourceSceneID:string,parentId:string,map:object,nodeIds:string[]}}
     */
    instantiate(otherSceneLike, parentNodeId = null, options = {}) {
        const sourceScene = this.#resolveSourceScene(otherSceneLike);
        if (!sourceScene) {
            throw new Error("[WrScene] instantiate() requires a WrScene or scene-like data");
        }
        if (sourceScene.asset !== this.asset) {
            throw new Error("[WrScene] instantiate() requires both scenes to share the same WrAsset context");
        }

        const targetParentId = String(parentNodeId ?? this.rootId ?? "").trim();
        if (!targetParentId || !this.#nodeById.has(targetParentId)) {
            throw new Error(`[WrScene] parent node "${targetParentId}" does not exist`);
        }

        const sourceNodes = sourceScene.nodes.map((node) => wrCloneData(node));
        if (sourceNodes.length <= 0) {
            return {
                sourceSceneID: sourceScene.id,
                parentId: targetParentId,
                map: {},
                nodeIds: [],
            };
        }

        const sourceById = new Map(sourceNodes.map((node) => [String(node.id), node]));
        const sourceRootId = String(sourceScene.rootId ?? sourceNodes[0]?.id ?? "");
        if (!sourceById.has(sourceRootId)) {
            throw new Error("[WrScene] source scene root is missing");
        }

        const sourceChildrenByParent = new Map();
        for (const sourceNode of sourceNodes) {
            const srcParent = sourceNode.parent == null ? null : String(sourceNode.parent);
            if (!srcParent || !sourceById.has(srcParent)) continue;
            if (!sourceChildrenByParent.has(srcParent)) sourceChildrenByParent.set(srcParent, []);
            sourceChildrenByParent.get(srcParent).push(String(sourceNode.id));
        }

        const visitOrder = [];
        const visitQueue = [sourceRootId];
        const visited = new Set();
        while (visitQueue.length > 0) {
            const sourceId = visitQueue.shift();
            if (!sourceId || visited.has(sourceId) || !sourceById.has(sourceId)) continue;
            visited.add(sourceId);
            visitOrder.push(sourceId);
            const sourceNode = sourceById.get(sourceId);
            const children = sourceChildrenByParent.get(sourceId)
                ?? (Array.isArray(sourceNode.children)
                    ? sourceNode.children.map((id) => String(id)).filter((id) => sourceById.has(id))
                    : []);
            for (const childId of children) {
                if (!visited.has(childId)) visitQueue.push(childId);
            }
        }

        const idMap = new Map();
        const nextNodes = [];

        for (const sourceId of visitOrder) {
            const sourceNode = sourceById.get(sourceId);
            const wantedId = typeof options.idRemap === "function"
                ? String(options.idRemap(sourceId, sourceNode, sourceScene, this))
                : String(sourceId);
            const finalId = this.#createUniqueNodeId(wantedId);
            const sourceParentId = sourceNode.parent == null ? null : String(sourceNode.parent);
            const mappedParentId = sourceId === sourceRootId
                ? targetParentId
                : (idMap.get(sourceParentId) ?? targetParentId);
            const components = wrNormalizeComponents(sourceNode.components ?? sourceNode.$ ?? {});

            const nextNode = {
                id: finalId,
                name: String(sourceNode.name ?? sourceId),
                parent: mappedParentId,
                children: [],
                components,
            };
            nextNodes.push(nextNode);
            idMap.set(sourceId, finalId);
        }

        for (const nextNode of nextNodes) {
            this.nodes.push(nextNode);
            this.#nodeById.set(nextNode.id, nextNode);
            this.#appendChild(nextNode.parent, nextNode.id);
            WrSceneRuntime.bindNodeComponents(this, nextNode);
        }

        for (const nextNode of nextNodes) {
            const comps = WrSceneRuntime.getNodeComponents(nextNode);
            const meshRenderer = comps.MeshRenderer ?? comps.meshRenderer ?? null;
            if (meshRenderer && meshRenderer.skeletonNode != null) {
                const remappedSkeletonId = idMap.get(String(meshRenderer.skeletonNode));
                if (remappedSkeletonId) meshRenderer.skeletonNode = remappedSkeletonId;
            }
            for (const compValue of Object.values(comps)) {
                if (!compValue || typeof compValue.__onSceneRemap !== "function") continue;
                try {
                    compValue.__onSceneRemap(idMap, this);
                } catch (error) {
                    console.warn(
                        `[WrScene] component remap hook failed on node "${nextNode.id}": ${String(error?.message ?? error)}`
                    );
                }
            }
        }

        const tracker = {
            sourceSceneID: sourceScene.id,
            parentId: targetParentId,
            map: Object.fromEntries(idMap.entries()),
            nodeIds: nextNodes.map((node) => node.id),
        };
        this.instancedScenes.push(tracker);
        return tracker;
    }

    /**
     * Export detached scene data clone.
     * @returns {object}
     */
    toData() {
        return {
            id: this.id,
            name: this.name,
            rootId: this.rootId,
            nodes: wrCloneData(this.nodes),
        };
    }

    /**
     * Normalize source scene input.
     * @param {WrScene|object} otherSceneLike source input
     * @returns {WrScene|null}
     */
    #resolveSourceScene(otherSceneLike) {
        if (otherSceneLike instanceof WrScene) return otherSceneLike;
        if (!otherSceneLike || typeof otherSceneLike !== "object") return null;
        return new WrScene(this.asset, otherSceneLike, {
            camera: this.camera,
            defaultShaderId: this.defaultShaderId,
            renderCfg: this.defaultRenderCfg,
        });
    }

    /**
     * Append child id to parent children array if missing.
     * @param {string|null} parentId parent id
     * @param {string} childId child id
     * @returns {void}
     */
    #appendChild(parentId, childId) {
        if (!parentId) return;
        const parentNode = this.#nodeById.get(String(parentId)) ?? null;
        if (!parentNode) return;
        if (!Array.isArray(parentNode.children)) parentNode.children = [];
        if (!parentNode.children.includes(childId)) parentNode.children.push(childId);
    }

    /**
     * Resolve unique node id inside this scene.
     * @param {string} baseId preferred id
     * @returns {string}
     */
    #createUniqueNodeId(baseId) {
        const rawBase = String(baseId ?? "").trim() || "node";
        if (!this.#nodeById.has(rawBase)) return rawBase;
        let suffix = 1;
        while (this.#nodeById.has(`${rawBase}_${suffix}`)) suffix++;
        return `${rawBase}_${suffix}`;
    }

    /**
     * Rebuild fast node index and wrapper cache.
     * @returns {void}
     */
    #rebuildIndex() {
        this.#nodeById.clear();
        this.#nodeCache.clear();
        for (const node of this.nodes) {
            this.#nodeById.set(String(node.id), node);
        }
    }

    #nodeById = new Map();
    #nodeCache = new Map();
}

export default WrScene;
