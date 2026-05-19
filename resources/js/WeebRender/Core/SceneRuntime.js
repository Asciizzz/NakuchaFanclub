export class WrSceneRuntime {
    static getNodeComponents(node) {
        if (!node || typeof node !== "object") return {};
        if (node.components && typeof node.components === "object") return node.components;
        if (node.$ && typeof node.$ === "object") return node.$;
        return {};
    }

    static getMeshRenderer(node) {
        const comps = WrSceneRuntime.getNodeComponents(node);
        return comps.MeshRenderer ?? comps.meshRenderer ?? null;
    }

    static updateTransforms(scene) {
        if (!scene || !Array.isArray(scene.nodes)) return scene ?? null;
        return scene;
    }

    static iterRenderableNodes(scene) {
        if (!scene || !Array.isArray(scene.nodes)) return [];
        const out = [];
        for (const node of scene.nodes) {
            const meshRenderer = WrSceneRuntime.getMeshRenderer(node);
            if (!meshRenderer) continue;
            if (meshRenderer.active === false) continue;
            if (!meshRenderer.meshID) continue;
            out.push({ node, meshRenderer });
        }
        return out;
    }
}

export default WrSceneRuntime;
