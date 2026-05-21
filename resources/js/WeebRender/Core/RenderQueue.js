import WrWorldRuntime from "./WorldRuntime.js";
import { wrResolveNodeModelMatrix } from "./MeshPacking.js";
import { WR_DEFAULT_RENDER_CFG, wrNormalizeRenderCfg } from "./RenderConfig.js";

const WR_SKIN_BONE_CAP = 128;

/**
 * Convert numeric input with fallback.
 * @param {any} value input value
 * @param {number} [fallback=0] fallback value
 * @returns {number}
 */
function wrNumberOr(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve morph selection from mesh renderer and mesh defaults.
 * Returns dominant target index and weight.
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

/**
 * Build fast scene node id map.
 * @param {object} scene scene object
 * @returns {Map<string, object>}
 */
function wrBuildSceneNodeMap(scene) {
    const map = new Map();
    if (scene?.nodes instanceof Map) {
        for (const [idRaw, node] of scene.nodes.entries()) {
            const id = String(idRaw ?? node?.id ?? "").trim();
            if (!id) continue;
            map.set(id, node);
        }
        return map;
    }

    if (Array.isArray(scene?.nodes)) {
        for (const node of scene.nodes) {
            const id = String(node?.id ?? "").trim();
            if (!id) continue;
            map.set(id, node);
        }
    }
    return map;
}

/**
 * Resolve skeleton palette from mesh renderer skeleton link.
 * @param {object} scene active scene
 * @param {Map<string, object>} sceneNodeById node map
 * @param {object} meshRenderer mesh renderer component
 * @returns {Float32Array|null}
 */
function wrResolveSkinPalette(scene, sceneNodeById, meshRenderer) {
    const skeletonNodeId = String(meshRenderer?.skeletonNode ?? "").trim();
    if (!skeletonNodeId) return null;

    const skeletonNode = sceneNodeById.get(skeletonNodeId);
    if (!skeletonNode) return null;

    const skeletonComps = WrWorldRuntime.getNodeComponents(skeletonNode);
    const skeletonComp = skeletonComps.Skeleton ?? skeletonComps.skeleton ?? null;
    if (!skeletonComp || typeof skeletonComp !== "object") return null;

    WrWorldRuntime.bindComponent(scene, skeletonNodeId, "Skeleton", skeletonComp);
    if (typeof skeletonComp.buildPalette !== "function") return null;
    return skeletonComp.buildPalette(WR_SKIN_BONE_CAP);
}

/**
 * Build backend-agnostic draw queue from scene data.
 */
export class WrRenderQueue {
    /**
     * Build one frame queue.
     * @param {object} scene active scene
     * @param {object} camera active camera
     * @param {object} assets asset registry
     * @param {object} [options={}] build options
     * @returns {object}
     */
    static build(scene, camera, assets, options = {}) {
        const drawList = [];
        const items = WrWorldRuntime.iterRenderableNodes(scene, {
            from: options.from ?? null,
        });
        const sceneNodeById = wrBuildSceneNodeMap(scene);
        const defaultShaderId = options.defaultShaderId ?? null;
        const defaultRenderCfg = wrNormalizeRenderCfg(options.defaultRenderCfg ?? WR_DEFAULT_RENDER_CFG);
        for (const { node, meshRenderer } of items) {
            const shaderKeys = Array.isArray(meshRenderer.shaderKeys)
                ? meshRenderer.shaderKeys.slice()
                : meshRenderer.shaderKeys instanceof Set
                    ? Array.from(meshRenderer.shaderKeys.values())
                    : (meshRenderer.shaderKey ? [meshRenderer.shaderKey] : []);
            const shaderId = shaderKeys[0] ?? defaultShaderId ?? null;
            const shaderAsset = shaderId ? assets?.getShader?.(shaderId) : null;
            const renderCfg = shaderAsset?.renderCfg
                ? wrNormalizeRenderCfg(shaderAsset.renderCfg)
                : defaultRenderCfg;
            const meshAsset = assets?.getMesh?.(meshRenderer.meshID) ?? null;
            const morph = wrResolveMorphSelection(meshRenderer, meshAsset);
            const skinPalette = wrResolveSkinPalette(scene, sceneNodeById, meshRenderer);
            drawList.push({
                nodeId: String(node.id ?? ""),
                meshID: String(meshRenderer.meshID),
                shaderKeys,
                shaderID: shaderId,
                modelMatrix: wrResolveNodeModelMatrix(node),
                morphWeight: morph.weight,
                primaryMorphIndex: morph.index,
                skinPalette,
                renderCfg,
                sortKey: `${shaderId ?? ""}|${meshRenderer.meshID}|${morph.index}`,
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


