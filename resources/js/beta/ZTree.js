/* ZTree
By Asciiz (duh)

An agnostic tree data structure for pretty much anything
You can use it for a file system, or a game object hierarchy, not my concern.
*/

class ZNode {
    name = "";
    parent = null;
    children = [];
    $ = {};

    // Mostly for convenience since everything is public anyway
    rename(newName) { this.name = newName; }
    set(compKey, compData) { this.$[compKey] = compData; }
    get(compKey) { return this.$[compKey]; }
    remove(compKey) { delete this.$[compKey]; }
}

class ZTree {
    nodes = new Map();
    rootId = null;
    #idCounter = 0;

    #genId() { return this.#idCounter++; }

    constructor(rootName) {
        const rootNode = new ZNode();
        rootNode.name = rootName;
        const id = this.#genId();
        this.nodes.set(id, rootNode);
        this.rootId = id;
    }

    addNode(name, parentId = null) {
        parentId = parentId ?? this.rootId;

        const parentNode = this.nodes.get(parentId);
        if (!parentNode) return null;

        const node = new ZNode();
        node.name = name;
        node.parent = parentId;

        const id = this.#genId();
        this.nodes.set(id, node);
        parentNode.children.push(id);

        return { id, node };
    }

    getNode(id) { return this.nodes.get(id); }

    reparentNode(id, newParentId) {
        if (id === newParentId) return false;

        const node = this.nodes.get(id);
        const newParent = this.nodes.get(newParentId);
        if (!node || !newParent) return false;

        // Cycle detection
        let current = newParent;
        while (current) {
            if (current === node) return false;
            current = this.nodes.get(current.parent);
        }

        const oldParent = this.nodes.get(node.parent);
        if (oldParent) {
            const index = oldParent.children.indexOf(id);
            if (index !== -1) oldParent.children.splice(index, 1);
        }

        newParent.children.push(id);
        node.parent = newParentId;
        return true;
    }

    removeNode(id, recursive = true) {
        if (id === this.rootId) return false;

        const node = this.nodes.get(id);
        if (!node) return false;

        if (recursive) {
            const toRemove = [id];
            const stack = [...node.children];
            while (stack.length > 0) {
                const currentId = stack.pop();
                const currentNode = this.nodes.get(currentId);
                if (!currentNode) continue;
                toRemove.push(currentId);
                stack.push(...currentNode.children);
            }
            for (const removeId of toRemove) this.nodes.delete(removeId);

            const parentNode = this.nodes.get(node.parent);
            if (parentNode) {
                const index = parentNode.children.indexOf(id);
                if (index !== -1) parentNode.children.splice(index, 1);
            }
        } else {
            for (const childId of node.children) {
                const child = this.nodes.get(childId);
                if (child) child.parent = node.parent;
            }
            const parentNode = this.nodes.get(node.parent);
            if (parentNode) {
                parentNode.children = parentNode.children
                    .filter(c => c !== id)
                    .concat(node.children);
            }
            this.nodes.delete(id);
        }

        return true;
    }

    // filter(id, node) { return 0: yield, 1: skip current, 2: prune branch }
    *traverse(startId = this.rootId, filter=null, DFS=true) {
        const startNode = this.nodes.get(startId);
        if (!startNode) return;

        const queue = [startId];
        while (queue.length > 0) {
            const currentId = DFS ? queue.pop() : queue.shift();
            const currentNode = this.nodes.get(currentId);
            if (!currentNode) continue;

            const result = filter ? filter(currentId, currentNode) : 0;

            if (result === 2) continue; // Prune branch

            queue.push(...currentNode.children);

            if (result === 1) continue; // Skip current only
            yield [currentId, currentNode];
        }
    }
}