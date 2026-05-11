/* ZScene
By Asciiz

ZTree's extension for ECS-style scene management

*/

// Dedicated node's component

function Transform3D(local = new Mat4()) {
    return {local, world: new Mat4()};
}

function MeshRenderer3D(opts = {}) {
    return {
        active:       opts.active    ?? true,
        meshKey:      opts.meshKey   ?? null,
        shaderKey:    opts.shaderKey ?? null,
        color:        opts.color     ? Float32Array.from(opts.color) : new Float32Array([1, 1, 1, 1]),
        morphWeights: opts.morphWeights ? Float32Array.from(opts.morphWeights) : null,
        skeletonNode: opts.skeletonNode ?? null, // key to node with skeleton component
    }
}


/* IMPORTANT:

ZScene and its node components do not contain assets, only reference data
I don't know where you store them, that's none of my concern

*/
class ZScene extends ZTree {
    updateTransform(id, node) {
        const transform = node.get('transform');
        if (!transform) return;

        if (node.parent === null) {
            transform.world = transform.local;
        }
    }

    update(DFS=true) {

        for (const [id, node] of this.traverse(this.rootId, DFS)) {
            updateTransform(id, node);
        }
    }

}