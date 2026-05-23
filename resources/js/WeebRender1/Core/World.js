import { Ctx } from "../../AzLib/AzHie.js";
import { AzCamera } from "../../AzLib/AzCamera.js";
import WrAssetStore from "../Assets/AssetStore.js";
import WrBackendBase from "../Backends/BackendBase.js";
import { wrCompareVertexSignatures, wrValidateShaderDefinition } from "./ShaderAbi.js";
import {
    wrDefaultKeyMapGlsl,
    wrDefaultKeyMapWgsl,
    wrReplaceTemplateKeys,
    wrTemplateKeyMapGlsl,
    wrTemplateKeyMapWgsl,
} from "./ShaderTemplate.js";
import { wrBuildTemplateShaderDefinition, wrIsTemplateShaderDefinition } from "./ShaderBuilder.js";
import { WR_DEFAULT_RENDER_CFG, wrNormalizeRenderCfg } from "./RenderConfig.js";
import { load as wrLoadGLB } from "../Loaders/GLBLoader.js";
import WrWorldRuntime from "./WorldRuntime.js";
import WrRenderQueue from "./RenderQueue.js";

const WR_WORLD_NODE_CORE_KEYS = new Set(["ctx", "id", "parentId", "childIds"]);
const WR_WORLD_SCENE_NODE_SKIP_KEYS = new Set(["id", "parent", "children", "components", "$"]);

/**
 * Check whether value is a canvas element
 * @param {any} value input value
 * @returns {boolean}
 */
function isCanvasElement(value) {
    return value instanceof HTMLCanvasElement;
}

/**
 * Resolve or create a canvas using canvas options
 * @param {object} [opts={}] canvas options
 * @returns {HTMLCanvasElement}
 */
function ensureCanvas(opts = {}) {
    if (isCanvasElement(opts.element)) return opts.element;

    const id = String(opts.id ?? "wr-canvas");
    const found = globalThis.document?.getElementById?.(id);
    if (isCanvasElement(found)) return found;

    const canvas = globalThis.document?.createElement?.("canvas");
    if (!isCanvasElement(canvas)) {
        throw new Error("[WrWorld] failed to create canvas");
    }

    let canvasId = id;
    if (found && !isCanvasElement(found)) {
        canvasId = `${id}-canvas`;
    }
    if (globalThis.document?.getElementById) {
        let suffix = 1;
        while (globalThis.document.getElementById(canvasId)) {
            canvasId = `${id}-canvas-${suffix++}`;
        }
    }
    canvas.id = canvasId;
    return canvas;
}

/**
 * Resolve string id from id-like input
 * @param {string|object|null|undefined} value id input
 * @returns {string|null}
 */
function resolveNodeRefId(value) {
    if (value == null) return null;
    if (typeof value === "object") {
        const id = String(value.id ?? "").trim();
        return id || null;
    }
    const id = String(value).trim();
    return id || null;
}

/**
 * Copy direct payload fields from one ctx node to another
 * Core hierarchy keys are skipped
 * @param {object} target target node
 * @param {object} source source node
 * @returns {void}
 */
function copyNodePayload(target, source) {
    if (!target || !source) return;
    for (const key of Object.keys(source)) {
        if (WR_WORLD_NODE_CORE_KEYS.has(key)) continue;
        target[key] = WrAssetStore.cloneData(source[key]);
    }
}

/**
 * Copy scene-node payload into one ctx node
 * @param {object} target target node
 * @param {object} source source scene node
 * @returns {void}
 */
function copySceneNodePayload(target, source) {
    if (!target || !source) return;

    for (const key of Object.keys(source)) {
        if (WR_WORLD_SCENE_NODE_SKIP_KEYS.has(key)) continue;
        target[key] = WrAssetStore.cloneData(source[key]);
    }

    const comps = (source.components && typeof source.components === "object")
        ? source.components
        : ((source.$ && typeof source.$ === "object") ? source.$ : {});
    for (const [key, value] of Object.entries(comps)) {
        target[key] = WrAssetStore.cloneData(value);
    }
}

/**
 * Remap known node-id links and fire optional remap hooks
 * @param {object} node target node
 * @param {Map<string, string>} idMap source->target id map
 * @param {WrWorld} world world context
 * @returns {void}
 */
function remapNodeLinks(node, idMap, world) {
    if (!node || !(idMap instanceof Map)) return;
    for (const [key, value] of Object.entries(node)) {
        if (WR_WORLD_NODE_CORE_KEYS.has(key)) continue;
        if (!value || typeof value !== "object") continue;

        if (key === "MeshRenderer" || key === "meshRenderer") {
            if (value.skeletonNode != null) {
                const sourceId = String(value.skeletonNode);
                const nextId = idMap.get(sourceId) ?? null;
                if (nextId) value.skeletonNode = nextId;
            }
        }

        if (typeof value.__onSceneRemap === "function") {
            try {
                value.__onSceneRemap(idMap, world);
            } catch (error) {
                console.warn(
                    `[WrWorld] component remap hook failed on node "${node.id}": ${String(error?.message ?? error)}`
                );
            }
        }
    }
}

/**
 * Main Wr world context
 * Owns backend lifecycle, shared asset registry, and one shared branch graph
 */
export class WrWorld extends Ctx {
    /**
     * Create a new world context
     * @param {object} [options={}] initialization options
     */
    constructor(options = {}) {
        super({
            prefix: options.nodePrefix ?? "wr_node_",
        });
        this.options = options ?? {};
        this.canvasOptions = this.options.canvas ?? {};
        this.canvas = ensureCanvas(this.canvasOptions);
        this.backendOptions = this.options.backend ?? {};
        this.camera = this.options.camera instanceof AzCamera
            ? this.options.camera
            : new AzCamera();

        this.assets = new WrAssetStore();
        this.backend = null;
        this.runtimeReport = null;
        this.id = String(this.options.id ?? "world");
        this.defaultShaderId = null;
        this.defaultRenderCfg = wrNormalizeRenderCfg(this.options.renderCfg ?? WR_DEFAULT_RENDER_CFG);
        this.deltaTime = 0;
        this.roots = [];
    }

    /**
     * Active backend kind string
     * @returns {string|null}
     */
    get backendKind() { return this.backend?.kind ?? null; }
    /**
     * Backend capability report
     * @returns {object}
     */
    get capabilities() { return this.backend?.getCapabilities?.() ?? {}; }

    /**
     * Read backend capabilities
     * @returns {object}
     */
    getCapabilities() {
        return this.capabilities;
    }

    /**
     * Set active camera
     * @param {AzCamera} camera camera instance
     * @returns {WrWorld}
     */
    setCamera(camera) {
        this.camera = camera instanceof AzCamera ? camera : this.camera;
        return this;
    }

    /**
     * Initialize backend and configure initial size
     * @param {object} [options={}] backend override options
     * @returns {Promise<WrWorld>}
     */
    async init(options = {}) {
        const mergedBackendOpts = {
            ...this.backendOptions,
            ...options,
        };
        const webgl2Options = {
            ...(mergedBackendOpts.webgl2 ?? {}),
        };
        if (webgl2Options.alpha == null && this.canvasOptions.alpha != null) {
            webgl2Options.alpha = !!this.canvasOptions.alpha;
        }
        if (webgl2Options.premultipliedAlpha == null && this.canvasOptions.premultipliedAlpha != null) {
            webgl2Options.premultipliedAlpha = !!this.canvasOptions.premultipliedAlpha;
        }
        mergedBackendOpts.webgl2 = webgl2Options;

        const { backend, report } = await WrBackendBase.choose(this.canvas, mergedBackendOpts);
        this.backend = backend;
        this.runtimeReport = { backend: report };
        this.resize(
            this.canvas.clientWidth || this.canvas.width || 800,
            this.canvas.clientHeight || this.canvas.height || 600
        );
        return this;
    }

    /**
     * Mount canvas into a DOM target
     * @param {Element} target target DOM element
     * @returns {WrWorld}
     */
    mount(target) {
        if (!(target instanceof Element)) return this;
        if (this.canvas.parentElement !== target) {
            this.unmount();
            target.appendChild(this.canvas);
        }
        return this;
    }

    /**
     * Unmount canvas from current parent
     * @returns {WrWorld}
     */
    unmount() {
        this.canvas.parentElement?.removeChild(this.canvas);
        return this;
    }

    /**
     * Resize canvas to current parent client rect
     * @returns {WrWorld}
     */
    fitContainer() {
        const parent = this.canvas.parentElement;
        if (!parent) return this;
        const rect = parent.getBoundingClientRect();
        return this.resize(rect.width, rect.height);
    }

    /**
     * Resize canvas and backend buffers using DPR scaling
     * @param {number} width css width
     * @param {number} height css height
     * @returns {WrWorld}
     */
    resize(width, height) {
        const w = Math.max(1, Math.round(Number(width) || 1));
        const h = Math.max(1, Math.round(Number(height) || 1));
        const maxPixelRatio = Math.max(1, Number(this.canvasOptions.maxPixelRatio ?? 2) || 2);
        const dpr = Math.min(maxPixelRatio, globalThis.devicePixelRatio || 1);
        const drawWidth = Math.max(1, Math.round(w * dpr));
        const drawHeight = Math.max(1, Math.round(h * dpr));

        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.canvas.width = drawWidth;
        this.canvas.height = drawHeight;
        this.camera.aspect = w / Math.max(1, h);
        this.backend?.resize?.(drawWidth, drawHeight);
        return this;
    }

    /**
     * Register shader with dual WGSL/GLSL support and resolved template keys
     * @param {string} shaderId shader id
     * @param {object} [shaderDesc={}] shader description
     * @param {object|undefined} [renderCfgInput=undefined] optional render config override
     * @returns {string}
     */
    registerShader(shaderId, shaderDesc = {}, renderCfgInput = undefined) {
        const id = String(shaderId ?? "").trim();
        if (!id) throw new Error("[WrWorld] shaderId is required");

        const isTemplate = wrIsTemplateShaderDefinition(shaderDesc);
        const sourceDesc = isTemplate ? wrBuildTemplateShaderDefinition(shaderDesc) : shaderDesc;
        const validated = wrValidateShaderDefinition(sourceDesc);
        const renderCfg = wrNormalizeRenderCfg(renderCfgInput ?? shaderDesc.renderCfg ?? sourceDesc.renderCfg ?? null);
        const defaultWgslMap = isTemplate ? wrTemplateKeyMapWgsl() : wrDefaultKeyMapWgsl();
        const defaultGlslMap = isTemplate ? wrTemplateKeyMapGlsl() : wrDefaultKeyMapGlsl();
        const autoKeyMap = sourceDesc.linkKeyMap ?? {};
        const keyMap = {
            wgsl: { ...defaultWgslMap, ...(autoKeyMap.wgsl ?? {}), ...(shaderDesc.keyMap?.wgsl ?? {}) },
            glsl: { ...defaultGlslMap, ...(autoKeyMap.glsl ?? {}), ...(shaderDesc.keyMap?.glsl ?? {}) },
        };

        const resolved = {
            vertex: {
                wgsl: wrReplaceTemplateKeys(validated.vertex.wgsl, "vertex", keyMap.wgsl),
                glsl: wrReplaceTemplateKeys(validated.vertex.glsl, "vertex", keyMap.glsl),
            },
            fragment: {
                wgsl: wrReplaceTemplateKeys(validated.fragment.wgsl, "fragment", keyMap.wgsl),
                glsl: wrReplaceTemplateKeys(validated.fragment.glsl, "fragment", keyMap.glsl),
            },
        };

        this.assets.addShader({
            id,
            ...validated,
            resolved,
            keyMap,
            renderCfg,
        });
        if (!this.defaultShaderId) {
            this.defaultShaderId = id;
            this.defaultRenderCfg = renderCfg;
        }
        return id;
    }

    /**
     * Compare shader vertex layout with provided mesh layout
     * @param {string} shaderId shader id
     * @param {object} providedLayout mesh vertex layout
     * @returns {object}
     */
    validateShaderMeshLayout(shaderId, providedLayout) {
        const shader = this.assets.getShader(shaderId);
        if (!shader) throw new Error(`[WrWorld] shader "${shaderId}" not found`);
        return wrCompareVertexSignatures(shader.vertexLayout, providedLayout);
    }

    /**
     * Create empty node and track roots list
     * @param {string|null} [parentId=null] parent node id
     * @param {number} [index=-1] insert index
     * @returns {import("//AzLib/Aztjs")Node|null}
     */
    addNode(parentId = null, index = -1) {
        const node = super.addNode(parentId, index);
        if (node && node.parentId == null) this.#addRootId(node.id);
        return node;
    }

    /**
     * Reparent node and track roots list
     * @param {string} id node id
     * @param {string|null} [newParentId=null] new parent id
     * @returns {import("//AzLib/Aztjs")Node|null}
     */
    moveNode(id, newParentId = null) {
        const source = this.getNode(id);
        const wasRoot = source?.parentId == null;
        const node = super.moveNode(id, newParentId);
        if (!node) return null;
        const isRoot = node.parentId == null;
        if (wasRoot !== isRoot) {
            if (isRoot) this.#addRootId(node.id);
            else this.#removeRootId(node.id);
        }
        return node;
    }

    /**
     * Delete one node or branch and track roots list
     * @param {string} id node id
     * @param {boolean} [branch=false] delete branch toggle
     * @returns {import("//AzLib/Aztjs")Node|null}
     */
    deleteNode(id, branch = false) {
        const source = this.getNode(id);
        if (!source) return null;

        const wasRoot = source.parentId == null;
        const childIds = Array.isArray(source.childIds) ? source.childIds.slice() : [];
        const node = super.deleteNode(id, branch);
        if (!node) return null;

        if (wasRoot) this.#removeRootId(id);
        if (wasRoot && !branch) {
            for (const childId of childIds) {
                const childNode = this.getNode(childId);
                if (childNode?.parentId == null) this.#addRootId(childId);
            }
        }
        return node;
    }

    /**
     * Swap two node positions and track roots list
     * @param {string} idA first node id
     * @param {string} idB second node id
     * @returns {boolean}
     */
    swapNodes(idA, idB) {
        const ok = super.swapNodes(idA, idB);
        if (!ok) return false;
        this.#replaceRootState(idA);
        this.#replaceRootState(idB);
        return ok;
    }

    /**
     * Raw branch traversal that directly proxies AztCtx traversal
     * @param {object} [options={}] traverse options
     * @returns {Generator<import("//AzLib/Aztjs")Node>}
     */
    *traverseRaw(options = {}) {
        const src = options && typeof options === "object" ? options : {};
        const fromId = resolveNodeRefId(src.from ?? null);
        if (!fromId) return;
        yield* super.traverse({
            ...src,
            from: fromId,
        });
    }

    /**
     * Traverse one branch with transform/runtime binding updates
     * @param {object} [options={}] traverse options
     * @returns {Generator<import("//AzLib/Aztjs")Node>}
     */
    *traverse(options = {}) {
        const src = options && typeof options === "object" ? options : {};
        const fromId = resolveNodeRefId(src.from ?? null);
        if (!fromId) return;
        yield* WrWorldRuntime.traverseNodes(this, {
            ...src,
            from: fromId,
            updateTransforms: src.updateTransforms !== false,
            bindComponents: true,
        });
    }

    /**
     * Load model via internal GLB loader, ingest assets, and return copied branch root
     * @param {string} url model URL
     * @returns {Promise<import("//AzLib/Aztjs")Node>}
     */
    async loadModelFromURL(url) {
        const targetUrl = String(url ?? "").trim();
        if (!targetUrl) throw new Error("[WrWorld] model URL is required");

        const payload = await wrLoadGLB(targetUrl);
        const sceneData = this.assets.addFromLoader(payload);
        const sourceNodes = Array.isArray(sceneData?.nodes) ? sceneData.nodes : [];
        if (sourceNodes.length <= 0) {
            throw new Error("[WrWorld] loader scene has no nodes");
        }

        const sourceById = new Map();
        for (const sourceNode of sourceNodes) {
            const sourceId = String(sourceNode?.id ?? "").trim();
            if (!sourceId) continue;
            sourceById.set(sourceId, sourceNode);
        }
        if (sourceById.size <= 0) {
            throw new Error("[WrWorld] loader scene has no valid node ids");
        }

        const sourceRootIdRaw = String(sceneData.rootId ?? sourceNodes[0]?.id ?? "").trim();
        const sourceRootId = sourceById.has(sourceRootIdRaw)
            ? sourceRootIdRaw
            : (sourceById.keys().next().value ?? "");
        if (!sourceRootId) throw new Error("[WrWorld] loader scene root is missing");

        const sourceChildren = new Map();
        for (const sourceNode of sourceById.values()) {
            const sourceId = String(sourceNode.id);
            sourceChildren.set(sourceId, []);
        }
        for (const sourceNode of sourceById.values()) {
            const sourceId = String(sourceNode.id);
            const children = Array.isArray(sourceNode.children) ? sourceNode.children : [];
            for (const childRef of children) {
                const childId = String(childRef ?? "").trim();
                if (!childId || !sourceById.has(childId)) continue;
                sourceChildren.get(sourceId).push(childId);
            }
        }
        for (const sourceNode of sourceById.values()) {
            const sourceId = String(sourceNode.id);
            const parentId = sourceNode.parent == null ? null : String(sourceNode.parent);
            if (!parentId || !sourceById.has(parentId)) continue;
            const children = sourceChildren.get(parentId) ?? [];
            if (!children.includes(sourceId)) children.push(sourceId);
            sourceChildren.set(parentId, children);
        }

        const visitOrder = [];
        const visitQueue = [sourceRootId];
        const visited = new Set();
        while (visitQueue.length > 0) {
            const sourceId = visitQueue.shift();
            if (!sourceId || visited.has(sourceId) || !sourceById.has(sourceId)) continue;
            visited.add(sourceId);
            visitOrder.push(sourceId);
            for (const childId of sourceChildren.get(sourceId) ?? []) {
                if (!visited.has(childId)) visitQueue.push(childId);
            }
        }

        const idMap = new Map();
        const copied = [];
        for (const sourceId of visitOrder) {
            const sourceNode = sourceById.get(sourceId);
            const sourceParentId = sourceNode.parent == null ? null : String(sourceNode.parent);
            const mappedParentId = sourceId === sourceRootId
                ? null
                : (idMap.get(sourceParentId) ?? null);
            const targetNode = this.addNode(mappedParentId);
            if (!targetNode) {
                throw new Error(`[WrWorld] failed to add node copied from "${sourceId}"`);
            }
            copySceneNodePayload(targetNode, sourceNode);
            copied.push(targetNode);
            idMap.set(sourceId, targetNode.id);
        }

        for (const node of copied) {
            remapNodeLinks(node, idMap, this);
            WrWorldRuntime.bindNodeComponents(this, node);
        }

        const rootNode = this.getNode(idMap.get(sourceRootId));
        if (!rootNode) throw new Error("[WrWorld] copied root could not be resolved");
        rootNode.name = String(sceneData.name ?? payload.name ?? rootNode.id);
        return rootNode;
    }

    /**
     * Duplicate one branch and optionally attach copied root under target parent
     * @param {string|object} fromId source branch root id or node ref
     * @param {string|object|null} [toId=null] attach parent id or node ref
     * @returns {import("//AzLib/Aztjs")Node|null}
     */
    copyBranch(fromId, toId = null) {
        const sourceId = resolveNodeRefId(fromId);
        const targetParentId = resolveNodeRefId(toId);
        if (!sourceId) return null;

        const sourceRoot = this.getNode(sourceId);
        if (!sourceRoot) return null;
        if (targetParentId && !this.getNode(targetParentId)) return null;

        const sourceOrder = [];
        for (const sourceNode of super.traverse({
            from: sourceRoot.id,
            mode: "dfs_pre",
            includeFrom: true,
        })) {
            sourceOrder.push(sourceNode);
        }
        if (sourceOrder.length <= 0) return null;

        const idMap = new Map();
        const copied = [];
        for (const sourceNode of sourceOrder) {
            const mappedParentId = sourceNode.id === sourceRoot.id
                ? (targetParentId ?? null)
                : (idMap.get(sourceNode.parentId) ?? (targetParentId ?? null));
            const targetNode = this.addNode(mappedParentId);
            if (!targetNode) return null;
            copyNodePayload(targetNode, sourceNode);
            copied.push(targetNode);
            idMap.set(sourceNode.id, targetNode.id);
        }

        for (const node of copied) {
            remapNodeLinks(node, idMap, this);
            WrWorldRuntime.bindNodeComponents(this, node);
        }

        return this.getNode(idMap.get(sourceRoot.id));
    }

    /**
     * Update one branch and run node update callbacks
     * @param {number} [deltaTime=0] frame delta time in seconds
     * @param {object} [options={}] update options
     * @returns {WrWorld}
     */
    update(deltaTime = 0, options = {}) {
        this.deltaTime = Number(deltaTime) || 0;
        const fromId = resolveNodeRefId(options?.from ?? this.roots[0] ?? null);
        if (!fromId) return this;

        for (const node of this.traverse({
            from: fromId,
            mode: "dfs_pre",
            includeFrom: true,
        })) {
            const comps = WrWorldRuntime.getNodeComponents(node);
            const custom = comps.Custom ?? comps.custom ?? null;
            if (custom && typeof custom.run === "function") {
                try {
                    custom.run({
                        deltaTime: this.deltaTime,
                        world: this,
                        node,
                    });
                } catch (error) {
                    console.warn(
                        `[WrWorld] Custom.run() failed on node "${node.id}": ${String(error?.message ?? error)}`
                    );
                }
            }

            const runner = comps.update;
            if (typeof runner === "function") {
                try {
                    runner(node, this.deltaTime, this);
                } catch (error) {
                    console.warn(
                        `[WrWorld] update() runner failed on node "${node.id}": ${String(error?.message ?? error)}`
                    );
                }
            }
        }

        return this;
    }

    /**
     * Render world branches with backend
     * @param {object} [options={}] render options
     * @returns {WrWorld}
     */
    render(options = {}) {
        const backend = this.backend ?? null;
        if (!backend || !backend.ready) return this;

        const camera = options.camera ?? this.camera ?? null;
        const defaultShaderId = options.defaultShaderId ?? this.defaultShaderId ?? null;
        const defaultRenderCfg = wrNormalizeRenderCfg(
            options.renderCfg ?? this.defaultRenderCfg ?? WR_DEFAULT_RENDER_CFG
        );
        const singleFromId = resolveNodeRefId(options?.from ?? null);
        const fromIds = singleFromId
            ? [singleFromId]
            : this.roots.slice();
        if (fromIds.length <= 0) return this;

        const draws = [];
        let frameRenderCfg = defaultRenderCfg;
        for (const fromId of fromIds) {
            const queue = WrRenderQueue.build(this, camera, this.assets, {
                from: fromId,
                defaultShaderId,
                defaultRenderCfg,
            });
            if (draws.length <= 0 && queue.renderCfg) {
                frameRenderCfg = queue.renderCfg;
            }
            draws.push(...(queue.draws ?? []));
        }
        if (draws.length <= 0) return this;
        draws.sort((a, b) => (a.sortKey < b.sortKey ? -1 : (a.sortKey > b.sortKey ? 1 : 0)));

        const queue = {
            sceneId: String(this.id ?? "world"),
            clearColor: frameRenderCfg.clearColor,
            renderCfg: frameRenderCfg,
            camera,
            assets: this.assets,
            draws,
        };

        backend.beginFrame({
            camera,
            renderCfg: frameRenderCfg,
        });
        backend.executeRenderQueue(queue, { world: this, camera });
        backend.endFrame({ world: this, camera });
        return this;
    }

    /**
     * Destroy backend resources for this world context
     * @returns {void}
     */
    destroy() {
        this.backend?.destroy?.();
        this.backend = null;
        this.runtimeReport = null;
    }

    /**
     * Add one root id if it is not already tracked
     * @param {string} id node id
     * @returns {void}
     */
    #addRootId(id) {
        const key = String(id ?? "").trim();
        if (!key) return;
        if (this.roots.includes(key)) return;
        this.roots.push(key);
    }

    /**
     * Remove one root id from tracked list
     * @param {string} id node id
     * @returns {void}
     */
    #removeRootId(id) {
        const key = String(id ?? "").trim();
        if (!key) return;
        const index = this.roots.indexOf(key);
        if (index < 0) return;
        this.roots.splice(index, 1);
    }

    /**
     * Re-evaluate one node root state and sync root list
     * @param {string} id node id
     * @returns {void}
     */
    #replaceRootState(id) {
        const node = this.getNode(id);
        if (!node) {
            this.#removeRootId(id);
            return;
        }
        if (node.parentId == null) this.#addRootId(node.id);
        else this.#removeRootId(node.id);
    }
}

export default WrWorld;




