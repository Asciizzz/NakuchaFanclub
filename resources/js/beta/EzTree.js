/* EzTree
By Asciiz (duh)

An agnostic tree data structure for pretty much anything
You can use it for a file system, or a game object hierarchy, not my concern.

*/

class EzNode {
    name = "";
    parent = null; // key ref to parent node
    children = []; // array of child node keys
    $ = {}; // component storage

    rename(newName) { this.name = newName; }
    set(compKey, compData) { this.$[compKey] = compData; }
    get(compKey) { return this.$[compKey]; }
}

class EzTree {
    nodes = new Map();
    rootId = null;
    #idCounter = 0;

    compBehaviours = new Map();

    #genId() { return this.#idCounter++; }

    constructor(rootName) {
        const rootNode = new EzNode();
        rootNode.name = rootName;
        const id = this.#genId();
        this.nodes.set(id, rootNode);
        this.rootId = id;
    }

    addNode(name, parentId=null) {
        parentId = parentId ?? this.rootId;

        const parentNode = this.nodes.get(parentId);
        if (!parentNode) return null;

        const node = new EzNode();
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

    removeNode(id, recursive=true) {
        if (id === this.rootId) return false; // can't remove root

        const node = this.nodes.get(id);
        if (!node) return false;

        if (recursive) {
            // DFS to collect all descendants
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
        } else {
            // Reparent children to removed node's parent before deleting
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

        // Clean up parent's reference if recursive
        if (recursive) {
            const parentNode = this.nodes.get(node.parent);
            if (parentNode) {
                const index = parentNode.children.indexOf(id);
                if (index !== -1) parentNode.children.splice(index, 1);
            }
        }

        return true;
    }


    // behaviourFn(nodeId, nodeData, treeRef, parentData) { ... return dataToPassDown }
    addBehaviour(compKey, behaviourFn) {
        this.compBehaviours.set(compKey, behaviourFn);
    }

    traverse(startId, DFS=true) {
        const startNode = this.nodes.get(startId);
        if (!startNode) return;

        const queue = [{ id: startId, parentData: {} }];
        while (queue.length > 0) {
            const { id: currentId, parentData } = DFS ? queue.pop() : queue.shift();
            const currentNode = this.nodes.get(currentId);
            if (!currentNode) continue;

            const childData = {};
            for (const compKey in currentNode.$) {
                if (this.compBehaviours.has(compKey)) {
                    childData[compKey] = this.compBehaviours.get(compKey)(
                        currentId, currentNode, this, parentData[compKey]
                    );
                }
            }

            queue.push(...currentNode.children.map(id => ({ id, parentData: childData })));
        }
    }
}