import { MeshRenderer } from "../WrWorld/Components.js";
import { WrMesh } from "../Assets/Mesh.js";
import { WR_DEFAULT_RENDER_CFG, wrNormalizeRenderCfg } from "./RenderConfig.js";

const WR_SKIN_BONE_CAP = 128;

/**
 * Convert numeric input with fallback
 * @param {any} value input value
 * @param {number} [fallback=0] fallback value
 * @returns {number}
 */
function wrNumberOr(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve morph selection from mesh renderer and mesh defaults
 * Returns dominant target index and weight
 * @param {object} meshRenderer mesh renderer component
 * @param {object|null} meshAsset mesh asset
 * @returns {{index:number,weight:number}}
 */
function wrResolveMorphSelection(meshRenderer, meshAsset) {
    if (typeof meshRenderer?.getPrimaryMorph === "function") {
        const primary = meshRenderer.getPrimaryMorph();
        if (primary && Number.isFinite(Number(primary.index))) {
            return {
                index: Math.max(0, Number(primary.index) | 0),
                weight: wrNumberOr(primary.weight, 0),
            };
        }
    }

    if (Number.isFinite(Number(meshRenderer?.morphWeight))) {
        return { index: 0, weight: Number(meshRenderer.morphWeight) };
    }

    const weights = (ArrayBuffer.isView(meshRenderer?.morphWeights) || Array.isArray(meshRenderer?.morphWeights))
        ? meshRenderer.morphWeights
        : ((ArrayBuffer.isView(meshAsset?.defaultMorphWeights) || Array.isArray(meshAsset?.defaultMorphWeights))
            ? meshAsset.defaultMorphWeights
            : null);
    if (weights && weights.length > 0) {
        let bestIndex = 0;
        let bestAbs = Math.abs(wrNumberOr(weights[0], 0));
        for (let i = 1; i < weights.length; i++) {
            const magnitude = Math.abs(wrNumberOr(weights[i], 0));
            if (magnitude > bestAbs) {
                bestAbs = magnitude;
                bestIndex = i;
            }
        }
        return { index: bestIndex, weight: wrNumberOr(weights[bestIndex], 0) };
    }

    return { index: 0, weight: 0 };
}

function wrGetMeshRenderer(node) {
    if (!node || typeof node !== "object") return null;
    if (typeof node.getComp === "function") return node.getComp(MeshRenderer);
    if (node.components instanceof Map) {
        const direct = node.components.get(MeshRenderer);
        if (direct) return direct;
        for (const comp of node.components.values()) {
            if (comp instanceof MeshRenderer) return comp;
        }
    }
    return null;
}

function *wrIterNodes(scene, options = {}) {
    if (!scene) return;
    const fromId = String(options?.from ?? "").trim();
    const mode = String(options?.mode ?? "dfs_pre");
    const includeFrom = options?.includeFrom !== false;

    if (fromId) {
        if (typeof scene?.getNode === "function") {
            const fromNode = scene.getNode(fromId);
            if (fromNode && typeof fromNode.traverse === "function") {
                yield* fromNode.traverse({ mode, includeFrom });
                return;
            }
        }
        if (typeof scene?.traverseRaw === "function") {
            yield* scene.traverseRaw({ from: fromId, mode, includeFrom });
            return;
        }
        if (typeof scene?.traverse === "function") {
            yield* scene.traverse({ from: fromId, mode, includeFrom });
            return;
        }
        return;
    }

    if (scene?.nodes instanceof Map) {
        yield* scene.nodes.values();
        return;
    }
    if (Array.isArray(scene?.nodes)) {
        yield* scene.nodes;
    }
}

function wrIterRenderableNodes(scene, options = {}) {
    const out = [];
    const includeHidden = options.includeHidden === true;
    for (const node of wrIterNodes(scene, options)) {
        const meshRenderer = wrGetMeshRenderer(node);
        if (!meshRenderer) continue;
        const visible = meshRenderer.cfg?.display ?? meshRenderer.active;
        if (visible === false && !includeHidden) continue;
        const meshId = meshRenderer.meshId ?? meshRenderer.meshID ?? null;
        if (!meshId) continue;
        out.push({ node, meshRenderer });
    }
    return out;
}

/**
 * Resolve skeleton palette from mesh renderer hierarchy
 * @param {object} meshRenderer mesh renderer component
 * @returns {Float32Array|null}
 */
function wrResolveSkinPalette(meshRenderer) {
    const hasRig = meshRenderer?.cfg?.hasRig === true;
    if (!hasRig) return null;
    if (typeof meshRenderer?.resolveLiveSkeleton === "function") {
        const live = meshRenderer.resolveLiveSkeleton();
        if (typeof live?.buildPalette === "function") {
            return live.buildPalette(WR_SKIN_BONE_CAP);
        }
    }
    return null;
}

/**
 * Build backend-agnostic draw queue from scene data
 */
export class WrRenderQueue {
    /**
     * Build one frame queue
     * @param {object} scene active scene
     * @param {object} camera active camera
     * @param {object} assets asset registry
     * @param {object} [options={}] build options
     * @returns {object}
     */
    static build(scene, camera, assets, options = {}) {
        const drawList = [];
        const items = wrIterRenderableNodes(scene, {
            from: options.from ?? null,
            mode: options.mode ?? "dfs_pre",
            includeFrom: options.includeFrom !== false,
            includeHidden: options.includeHidden === true,
        });
        const defaultShaderId = options.defaultShaderId ?? null;
        const defaultRenderCfg = wrNormalizeRenderCfg(options.defaultRenderCfg ?? WR_DEFAULT_RENDER_CFG);
        for (const { node, meshRenderer } of items) {
            const shaderKeys = Array.isArray(meshRenderer.shaderKeys)
                ? meshRenderer.shaderKeys.slice()
                : meshRenderer.shaderKeys instanceof Set
                    ? Array.from(meshRenderer.shaderKeys.values())
                    : (meshRenderer.shaderKey ? [meshRenderer.shaderKey] : []);
            const shaderId = meshRenderer.cfg?.shaderId
                ?? meshRenderer.shaderId
                ?? shaderKeys[0]
                ?? meshRenderer.shaderID
                ?? defaultShaderId
                ?? null;
            const shaderAsset = shaderId ? assets?.getShader?.(shaderId) : null;
            const renderCfg = shaderAsset?.renderCfg
                ? wrNormalizeRenderCfg(shaderAsset.renderCfg)
                : defaultRenderCfg;
            const meshId = String(meshRenderer.meshId ?? meshRenderer.meshID ?? "").trim();
            if (!meshId) continue;
            const meshAsset = assets?.getMesh?.(meshId) ?? null;
            const morph = wrResolveMorphSelection(meshRenderer, meshAsset);
            const skinPalette = wrResolveSkinPalette(meshRenderer);
            drawList.push({
                nodeId: String(node.id ?? ""),
                meshID: meshId,
                shaderKeys: shaderKeys.length > 0 ? shaderKeys : (shaderId ? [shaderId] : []),
                shaderID: shaderId,
                modelMatrix: WrMesh.resolveNodeModelMatrix(node),
                morphWeight: morph.weight,
                primaryMorphIndex: morph.index,
                skinPalette,
                renderCfg,
                sortKey: `${shaderId ?? ""}|${meshId}|${morph.index}`,
            });
        }

        drawList.sort((a, b) => (a.sortKey < b.sortKey ? -1 : (a.sortKey > b.sortKey ? 1 : 0)));
        const frameRenderCfg = drawList[0]?.renderCfg ?? defaultRenderCfg;

        return {
            sceneId: String(scene?.id ?? scene?.sceneID ?? ""),
            clearColor: frameRenderCfg.clearColor,
            renderCfg: frameRenderCfg,
            camera,
            assets,
            draws: drawList,
        };
    }
}

export default WrRenderQueue;



