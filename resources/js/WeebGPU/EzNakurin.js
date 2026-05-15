/* EzNakurin

BONE_LIST (reference):
[
    "Root",
    "Hip",
    "Chest",
    "Neck",
    "Head",
    "HairBRoot",
        "HairBL1_A", "HairBL1_B",
        "HairBL2_A", "HairBL2_B",
        "HairBL3_A", "HairBL3_B",
        "HairBR1_A", "HairBR1_B",
        "HairBR2_A", "HairBR2_B",
        "HairBR3_A", "HairBR3_B",
    "HairF0",
    "HairFL1", "HairFL2",
    "HairFR1", "HairFR2",
    "HairSL1", "HairSL2",
    "ShoulderLeft",
    "ForearmLeft",
    "ShoulderRight",
    "ForearmRight",
    "ThighLeft",
    "ShinLeft",
    "ThighRight",
    "ShinRight"
]
*/

(function () {
    if (typeof window.Custom !== "function") throw new Error("[EzNakurin] Custom is required");
    if (typeof window.MeshRenderer !== "function") throw new Error("[EzNakurin] MeshRenderer is required");
    if (typeof window.Skeleton !== "function") throw new Error("[EzNakurin] Skeleton is required");
    if (!window.Azm?.Q || !window.Azm?.V3) throw new Error("[EzNakurin] Azm is required");

    class Nakurin extends Custom {
        boundNodeId = null;
        time = 0;

        constructor(opts = {}) {
            super(opts);
            const seedNodeId = opts.nodeId ?? opts.boundNodeId ?? null;
            if (seedNodeId != null) this.boundNodeId = String(seedNodeId);
        }

        bind(nodeId) {
            const id = String(nodeId ?? "");
            this.boundNodeId = id;

            if (!this.boundNode) {
                this.boundNodeId = null;
                return this.#fail("nakurin_bind_missing_node", "bind() failed: node is missing", { nodeId: id });
            }
            if (!(this.meshRenderer instanceof MeshRenderer)) {
                this.boundNodeId = null;
                return this.#fail("nakurin_bind_missing_mesh_renderer", "bind() failed: node has no MeshRenderer", { nodeId: id });
            }
            if (!this.meshRenderer.skeletonNode) {
                this.boundNodeId = null;
                return this.#fail("nakurin_bind_missing_skeleton_node_ref", "bind() failed: MeshRenderer has no skeletonNode", { nodeId: id });
            }
            if (!(this.skeleton instanceof Skeleton)) {
                const skeletonNodeId = this.meshRenderer.skeletonNode;
                this.boundNodeId = null;
                return this.#fail("nakurin_bind_invalid_skeleton_node", "bind() failed: skeletonNode is invalid", {
                    nodeId: id,
                    skeletonNodeId,
                });
            }

            return true;
        }

        get boundNode() {
            const id = this.boundNodeId;
            return id ? this.scene?.node(id) ?? null : null;
        }
        get meshRenderer() { return this.boundNode?.get("MeshRenderer") ?? this.boundNode?.get("meshRenderer") ?? null; }
        get skeletonNode() {
            const id = this.meshRenderer?.skeletonNode;
            return id ? this.scene?.node(id) ?? null : null;
        }
        get skeleton() { return this.skeletonNode?.get("Skeleton") ?? this.skeletonNode?.get("skeleton") ?? null; }

        setBone(indexOrName, localTransform) {
            const skeleton = this.skeleton;
            if (!(skeleton instanceof Skeleton)) return this;
            skeleton.set(indexOrName, localTransform);
            return this;
        }

        setSlot(slot, vec4) {
            const meshRenderer = this.meshRenderer;
            if (!(meshRenderer instanceof MeshRenderer)) return this;
            meshRenderer.setSlot(slot, vec4);
            return this;
        }

        run({ deltaTime = 0 } = {}) {

            this.time += deltaTime;

            const q = Azm.Q.fromAxisAngle(Azm.V3.UP, Math.sin(this.time) * 0.5);
            this.skeleton.set("Head", { rotate: q });

            return this;
        }

        __onSceneRemap(idMap) {
            const sourceId = this.boundNodeId;
            if (!sourceId || !(idMap instanceof Map)) return this;
            const remapped = idMap.get(String(sourceId));
            if (remapped) this.boundNodeId = String(remapped);
            return this;
        }

        #fail(code, message, extra) {
            this.log?.write(code, `[Nakurin] ${message}`, extra ?? null);
            return false;
        }
    }

    window.Nakurin = Nakurin;
})();
