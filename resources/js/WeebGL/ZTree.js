/* ZTree
By Asciiz (duh)

Agnostic tree structure with stable string node IDs.
*/

(function () {
    class ZNode {
        id = null;
        name = "";
        parent = null;
        children = [];
        $ = {};

        constructor(name = "", id = null, parent = null) {
            this.name = String(name ?? "");
            this.id = id == null ? null : String(id);
            this.parent = parent == null ? null : String(parent);
        }

        rename(newName) { this.name = String(newName ?? ""); }
        set(compKey, compData) { this.$[compKey] = compData; return compData; }
        get(compKey) { return this.$[compKey]; }
        remove(compKey) { delete this.$[compKey]; }
    }

    class ZTree {
        nodes = new Map();
        rootId = null;
        #idCounter = 0;

        #genId(prefix = "node") {
            const head = String(prefix || "node").replace(/[^a-zA-Z0-9_\-]/g, "_");
            return `${head}_${this.#idCounter++}`;
        }

        #claimId(id, prefix = "node") {
            const next = id == null ? this.#genId(prefix) : String(id);
            if (!next.length) throw new Error("[ZTree] node ID cannot be empty");
            if (this.nodes.has(next)) throw new Error(`[ZTree] duplicate node ID "${next}"`);
            return next;
        }

        constructor(rootName = "root", rootId = null) {
            const id = this.#claimId(rootId, "root");
            const rootNode = new ZNode(rootName, id, null);
            this.nodes.set(id, rootNode);
            this.rootId = id;
        }

        root() { return this.nodes.get(this.rootId) ?? null; }
        rootEntry() { return { id: this.rootId, node: this.root() }; }

        node(id) { return this.nodes.get(String(id)); }
        hasNode(id) { return this.nodes.has(String(id)); }

        addNode(name, parentId = null, options = {}) {
            const parentKey = parentId == null ? this.rootId : String(parentId);
            const parentNode = this.nodes.get(parentKey);
            if (!parentNode) return null;

            const id = this.#claimId(options.id, options.idPrefix ?? "node");
            const node = new ZNode(name, id, parentKey);

            this.nodes.set(id, node);
            parentNode.children.push(id);

            return { id, node };
        }

        reparentNode(id, newParentId) {
            const nodeKey = String(id);
            const parentKey = String(newParentId);
            if (nodeKey === parentKey) return false;

            const node = this.nodes.get(nodeKey);
            const newParent = this.nodes.get(parentKey);
            if (!node || !newParent) return false;

            // Cycle detection
            let current = newParent;
            while (current) {
                if (current.id === node.id) return false;
                current = current.parent == null ? null : this.nodes.get(current.parent);
            }

            const oldParent = node.parent == null ? null : this.nodes.get(node.parent);
            if (oldParent) {
                const index = oldParent.children.indexOf(node.id);
                if (index !== -1) oldParent.children.splice(index, 1);
            }

            newParent.children.push(node.id);
            node.parent = newParent.id;
            return true;
        }

        removeNode(id, recursive = true) {
            const nodeKey = String(id);
            if (nodeKey === this.rootId) return false;

            const node = this.nodes.get(nodeKey);
            if (!node) return false;

            if (recursive) {
                const toRemove = [node.id];
                const stack = [...node.children];
                while (stack.length > 0) {
                    const currentId = stack.pop();
                    const currentNode = this.nodes.get(currentId);
                    if (!currentNode) continue;
                    toRemove.push(currentId);
                    stack.push(...currentNode.children);
                }

                for (const removeId of toRemove) this.nodes.delete(removeId);

                const parentNode = node.parent == null ? null : this.nodes.get(node.parent);
                if (parentNode) {
                    const index = parentNode.children.indexOf(node.id);
                    if (index !== -1) parentNode.children.splice(index, 1);
                }
            } else {
                for (const childId of node.children) {
                    const child = this.nodes.get(childId);
                    if (child) child.parent = node.parent;
                }

                const parentNode = node.parent == null ? null : this.nodes.get(node.parent);
                if (parentNode) {
                    parentNode.children = parentNode.children
                        .filter(c => c !== node.id)
                        .concat(node.children);
                }
                this.nodes.delete(node.id);
            }

            return true;
        }

        // filter(id, node) { return 0: yield, 1: skip current, 2: prune branch }
        *traverse(startId = null, filter = null, DFS = true) {
            const root = startId == null ? this.rootId : String(startId);
            if (!this.nodes.has(root)) return;

            const queue = [root];
            while (queue.length > 0) {
                const currentId = DFS ? queue.pop() : queue.shift();
                const currentNode = this.nodes.get(currentId);
                if (!currentNode) continue;

                const result = filter ? filter(currentId, currentNode) : 0;
                if (result === 2) continue;

                queue.push(...currentNode.children);
                if (result === 1) continue;

                yield [currentId, currentNode];
            }
        }
    }

    window.ZNode = ZNode;
    window.ZTree = ZTree;
})();
