import WrSceneRuntime from "./SceneRuntime.js";
import { wrResolveNodeModelMatrix } from "./MeshPacking.js";
import { WR_DEFAULT_RENDER_CFG, wrNormalizeRenderCfg } from "./RenderConfig.js";

const WR_SKIN_BONE_CAP = 128;
const WR_IDENTITY_M4 = Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
]);

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
 * Read one mat4 from array-like input, fallback identity.
 * @param {any} value matrix input
 * @returns {Float32Array}
 */
function wrReadMat4(value) {
    if (ArrayBuffer.isView(value) || Array.isArray(value)) {
        if (value.length >= 16) {
            const source = value.slice ? value.slice(0, 16) : value.subarray(0, 16);
            return Float32Array.from(source);
        }
    }
    return Float32Array.from(WR_IDENTITY_M4);
}

/**
 * Multiply two column-major mat4 values.
 * @param {ArrayLike<number>} a left matrix
 * @param {ArrayLike<number>} b right matrix
 * @returns {Float32Array}
 */
function wrMulM4(a, b) {
    const out = new Float32Array(16);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0; let b1; let b2; let b3;

    b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
}

/**
 * Build fast scene node id map.
 * @param {object} scene scene object
 * @returns {Map<string, object>}
 */
function wrBuildSceneNodeMap(scene) {
    const map = new Map();
    const nodes = Array.isArray(scene?.nodes) ? scene.nodes : [];
    for (const node of nodes) {
        const id = String(node?.id ?? "").trim();
        if (!id) continue;
        map.set(id, node);
    }
    return map;
}

/**
 * Resolve first morph weight from mesh renderer or mesh defaults.
 * @param {object} meshRenderer mesh renderer component
 * @param {object} meshAsset mesh asset
 * @returns {number}
 */
function wrResolveMorphWeight(meshRenderer, meshAsset) {
    if (Number.isFinite(Number(meshRenderer?.morphWeight))) {
        return Number(meshRenderer.morphWeight);
    }

    const localWeights = meshRenderer?.morphWeights;
    if ((ArrayBuffer.isView(localWeights) || Array.isArray(localWeights)) && localWeights.length > 0) {
        return wrNumberOr(localWeights[0], 0);
    }

    const defaultWeights = meshAsset?.defaultMorphWeights;
    if ((ArrayBuffer.isView(defaultWeights) || Array.isArray(defaultWeights)) && defaultWeights.length > 0) {
        return wrNumberOr(defaultWeights[0], 0);
    }

    return 0;
}

/**
 * Build skin palette for one mesh renderer skeleton binding.
 * Palette format: mat4[128] flattened float array.
 * @param {Map<string, object>} sceneNodeById node map
 * @param {object} meshRenderer mesh renderer component
 * @param {object} assets asset store
 * @returns {Float32Array|null}
 */
function wrBuildSkinPalette(sceneNodeById, meshRenderer, assets) {
    const skeletonNodeId = String(meshRenderer?.skeletonNode ?? "").trim();
    if (!skeletonNodeId) return null;
    const skeletonNode = sceneNodeById.get(skeletonNodeId);
    if (!skeletonNode) return null;

    const skeletonComps = WrSceneRuntime.getNodeComponents(skeletonNode);
    const skeletonComp = skeletonComps.Skeleton ?? skeletonComps.skeleton ?? null;
    if (!skeletonComp || typeof skeletonComp !== "object") return null;

    const skeletonID = String(skeletonComp.skeletonID ?? skeletonComp.skeletonId ?? "").trim();
    if (!skeletonID) return null;
    const skeletonAsset = assets?.getSkeleton?.(skeletonID) ?? null;
    const sourceBones = Array.isArray(skeletonAsset?.bones) ? skeletonAsset.bones : [];
    if (sourceBones.length <= 0) return null;

    const palette = new Float32Array(WR_SKIN_BONE_CAP * 16);
    for (let i = 0; i < WR_SKIN_BONE_CAP; i++) {
        palette.set(WR_IDENTITY_M4, i * 16);
    }

    const poseSource = Array.isArray(skeletonComp.bones) ? skeletonComp.bones : [];
    const global = new Array(sourceBones.length);
    const count = Math.min(sourceBones.length, WR_SKIN_BONE_CAP);
    for (let i = 0; i < count; i++) {
        const bone = sourceBones[i] ?? {};
        const localBind = wrReadMat4(bone.localBind);
        const pose = wrReadMat4(poseSource[i]);
        const local = wrMulM4(localBind, pose);

        const parent = Number(bone.parent ?? -1) | 0;
        if (parent < 0 || !global[parent]) {
            global[i] = local;
        } else {
            global[i] = wrMulM4(global[parent], local);
        }

        const inverseBind = wrReadMat4(bone.inverseBind);
        const skinned = wrMulM4(global[i], inverseBind);
        palette.set(skinned, i * 16);
    }

    return palette;
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
        const items = WrSceneRuntime.iterRenderableNodes(scene);
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
            const morphWeight = wrResolveMorphWeight(meshRenderer, meshAsset);
            const skinPalette = wrBuildSkinPalette(sceneNodeById, meshRenderer, assets);
            drawList.push({
                nodeId: String(node.id ?? ""),
                meshID: String(meshRenderer.meshID),
                shaderKeys,
                shaderID: shaderId,
                modelMatrix: wrResolveNodeModelMatrix(node),
                morphWeight,
                skinPalette,
                renderCfg,
                sortKey: `${shaderId ?? ""}|${meshRenderer.meshID}`,
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
