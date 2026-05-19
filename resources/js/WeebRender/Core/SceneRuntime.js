import * as Azm from "../../AzLib/Azm.js";

const WR_IDENTITY_M4 = Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
]);

/**
 * Convert input matrix data to Float32Array[16], fallback identity.
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
 * Runtime helpers for scene graph traversal and transform updates.
 */
export class WrSceneRuntime {
    /**
     * Resolve component map from supported node shapes.
     * @param {object} node scene node
     * @returns {object}
     */
    static getNodeComponents(node) {
        if (!node || typeof node !== "object") return {};
        if (node.components && typeof node.components === "object") return node.components;
        if (node.$ && typeof node.$ === "object") return node.$;
        return {};
    }

    /**
     * Resolve mesh renderer component from node.
     * @param {object} node scene node
     * @returns {object|null}
     */
    static getMeshRenderer(node) {
        const comps = WrSceneRuntime.getNodeComponents(node);
        return comps.MeshRenderer ?? comps.meshRenderer ?? null;
    }

    /**
     * Resolve and normalize transform component from node.
     * @param {object} node scene node
     * @returns {{local: Float32Array, world: Float32Array}}
     */
    static getTransform(node) {
        const comps = WrSceneRuntime.getNodeComponents(node);
        let tx = comps.Transform ?? comps.transform ?? null;
        if (!tx || typeof tx !== "object") {
            tx = {
                local: Float32Array.from(WR_IDENTITY_M4),
                world: Float32Array.from(WR_IDENTITY_M4),
            };
            comps.Transform = tx;
            if (comps.transform && comps.transform !== tx) delete comps.transform;
            return tx;
        }

        if (!tx.local || !(ArrayBuffer.isView(tx.local) || Array.isArray(tx.local)) || tx.local.length < 16) {
            tx.local = Float32Array.from(WR_IDENTITY_M4);
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
     * Rebuild hierarchy links and propagate world transforms.
     * @param {object} scene scene-like object with nodes array
     * @returns {object|null}
     */
    static updateTransforms(scene) {
        if (!scene || !Array.isArray(scene.nodes)) return scene ?? null;
        const nodeById = new Map();
        for (const node of scene.nodes) {
            const id = String(node?.id ?? "");
            if (!id) continue;
            nodeById.set(id, node);
        }

        const childrenByParent = new Map();
        for (const node of scene.nodes) {
            const id = String(node?.id ?? "");
            if (!id) continue;
            if (!childrenByParent.has(id)) childrenByParent.set(id, []);
        }

        const roots = [];
        for (const node of scene.nodes) {
            const id = String(node?.id ?? "");
            if (!id) continue;
            const parentId = node.parent == null ? null : String(node.parent);
            if (!parentId || !nodeById.has(parentId)) {
                roots.push(id);
                node.parent = null;
                continue;
            }
            const children = childrenByParent.get(parentId) ?? [];
            children.push(id);
            childrenByParent.set(parentId, children);
        }

        for (const [parentId, childIds] of childrenByParent.entries()) {
            const parentNode = nodeById.get(parentId);
            if (!parentNode) continue;
            parentNode.children = Array.from(new Set(childIds));
        }

        const visited = new Set();
        const walk = (nodeId, parentWorld) => {
            const node = nodeById.get(nodeId);
            if (!node) return;
            if (visited.has(nodeId)) return;
            visited.add(nodeId);

            const tx = WrSceneRuntime.getTransform(node);
            if (parentWorld) {
                Azm.Mat4.mul(parentWorld, tx.local, tx.world);
            } else {
                tx.world.set(tx.local);
            }

            const children = childrenByParent.get(nodeId) ?? [];
            for (const childId of children) {
                walk(childId, tx.world);
            }
        };

        for (const rootId of roots) walk(rootId, null);

        for (const node of scene.nodes) {
            const id = String(node?.id ?? "");
            if (!id || visited.has(id)) continue;
            walk(id, null);
        }

        return scene;
    }

    /**
     * Return active renderable nodes with mesh renderer payload.
     * @param {object} scene scene-like object with nodes array
     * @returns {{node: object, meshRenderer: object}[]}
     */
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
