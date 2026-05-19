import WrSceneRuntime from "./SceneRuntime.js";

/**
 * Thin node facade for scene node access and component edits.
 */
export class WrNode {
    /**
     * @param {import("./Scene.js").WrScene} scene owner scene
     * @param {string} nodeId node id
     */
    constructor(scene, nodeId) {
        this.scene = scene ?? null;
        this.id = String(nodeId ?? "");
    }

    /**
     * Raw node data reference in owner scene.
     * @returns {object|null}
     */
    get data() {
        if (!this.scene?.getNodeDataById) return null;
        return this.scene.getNodeDataById(this.id);
    }

    /**
     * True when node id exists in owner scene index.
     * @returns {boolean}
     */
    get exists() {
        return !!this.data;
    }

    /**
     * Node display name.
     * @returns {string}
     */
    get name() {
        return this.data?.name ?? "";
    }

    /**
     * Update node display name.
     * @param {string} value next name
     * @returns {void}
     */
    set name(value) {
        const node = this.data;
        if (!node) return;
        node.name = String(value ?? "");
    }

    /**
     * Parent node wrapper.
     * @returns {WrNode|null}
     */
    get parent() {
        const parentId = this.parentId;
        return parentId ? this.scene.node(parentId) : null;
    }

    /**
     * Parent node id.
     * @returns {string|null}
     */
    get parentId() {
        const parentId = this.data?.parent;
        return parentId == null ? null : String(parentId);
    }

    /**
     * Child node wrappers.
     * @returns {WrNode[]}
     */
    get children() {
        if (!Array.isArray(this.data?.children)) return [];
        return this.data.children.map((id) => this.scene.node(id));
    }

    /**
     * Resolved node component map.
     * @returns {object}
     */
    get components() {
        const node = this.data;
        return WrSceneRuntime.getNodeComponents(node);
    }

    /**
     * Read one component by key.
     * @param {string} componentKey component key
     * @returns {any}
     */
    get(componentKey) {
        const key = String(componentKey ?? "").trim();
        if (!key) return null;
        const comps = this.components;
        return comps[key] ?? null;
    }

    /**
     * Set one component payload by key.
     * @param {string} componentKey component key
     * @param {any} value component payload
     * @returns {WrNode}
     */
    set(componentKey, value) {
        const key = String(componentKey ?? "").trim();
        const node = this.data;
        if (!node || !key) return this;
        if (!node.components || typeof node.components !== "object") {
            node.components = {};
        }
        node.components[key] = value;
        return this;
    }

    /**
     * Remove one component key from node map.
     * @param {string} componentKey component key
     * @returns {WrNode}
     */
    remove(componentKey) {
        const key = String(componentKey ?? "").trim();
        const node = this.data;
        if (!node || !key) return this;
        const comps = WrSceneRuntime.getNodeComponents(node);
        if (Object.prototype.hasOwnProperty.call(comps, key)) {
            delete comps[key];
        }
        return this;
    }
}

export default WrNode;
