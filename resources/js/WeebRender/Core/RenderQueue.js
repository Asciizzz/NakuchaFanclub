import WrSceneRuntime from "./SceneRuntime.js";
import { wrResolveNodeModelMatrix } from "./MeshPacking.js";
import { WR_DEFAULT_RENDER_CFG, wrNormalizeRenderCfg } from "./RenderConfig.js";

export class WrRenderQueue {
    static build(scene, camera, assets, options = {}) {
        const drawList = [];
        const items = WrSceneRuntime.iterRenderableNodes(scene);
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
            drawList.push({
                nodeId: String(node.id ?? ""),
                meshID: String(meshRenderer.meshID),
                shaderKeys,
                shaderID: shaderId,
                modelMatrix: wrResolveNodeModelMatrix(node),
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
