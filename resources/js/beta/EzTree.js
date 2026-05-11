/* EzTree
By Asciiz (duh)

An agnostic tree data structure for pretty much anything
You can use it for a file system, or a game object hierarchy, not my concern.

*/

class EzNode {
    kParent = null; // key ref to parent node
    kChildren = []; // array of child node keys
    $ = {}; // component storage
}

class EzTree {
    nodes = new Map();
    kRoot = null;

    behaviours = new Map(); // a map of traverse behaviours based on existing nodes' components

    constructor(rootKey) {
        const rootNode = new EzNode();
        this.nodes.set(rootKey, rootNode);
        this.kRoot = rootKey;
    }

    #genUniqueKey(key) {
        // Just iterate until key is unique
        let uniqueKey = key;
        while (this.nodes.has(uniqueKey)) {
            uniqueKey = `${key}_${Math.random().toString(36).substr(2, 5)}`;
        }
        return uniqueKey;
    }

    addNode(key, parentKey=null) {
        key = this.#genUniqueKey(key);

        parentKey = parentKey || this.kRoot;

        const parentNode = this.nodes.get(parentKey);
        if (!parentNode) return null; // parent must exist

        const node = new EzNode();
        node.kParent = parentKey;

        this.nodes.set(key, node);
        parentNode.kChildren.push(key);

        return { key, node };
    }

    getNode(key) { return this.nodes.get(key); }

    reparentNode(key, newParentKey) {
        if (key === newParentKey) return false;

        const node = this.nodes.get(key);
        const newParent = this.nodes.get(newParentKey);

        if (!node || !newParent) return false;

        let current = newParent;
        while (current) {
            if (current === node) return false;
            current = this.nodes.get(current.kParent);
        }

        const oldParent = this.nodes.get(node.kParent);
        if (oldParent) {
            const index = oldParent.kChildren.indexOf(key);
            if (index !== -1) oldParent.kChildren.splice(index, 1);
        }

        if (!newParent.kChildren.includes(key)) newParent.kChildren.push(key);

        node.kParent = newParentKey;
        return true;
    }

    // behaviourFn(nodeKey, node, tree) { ... }
    addBehaviour(compKey, behaviourFn) {
        this.behaviours.set(compKey, behaviourFn);
    }

    hasBehaviour(compKey) {
        return this.behaviours.has(compKey);
    }

    getBehaviour(compKey) {
        return this.behaviours.get(compKey);
    }

    traverse(startKey, DFS=true) {
        const startNode = this.nodes.get(startKey);
        if (!startNode) return;

        const queue = [startKey];
        while (queue.length > 0) {
            const currentKey = DFS ? queue.pop() : queue.shift();
            const currentNode = this.nodes.get(currentKey);
            if (!currentNode) continue;

            for (const compKey in currentNode.$) {
                if (this.hasBehaviour(compKey)) {
                    this.getBehaviour(compKey)(currentKey, currentNode, this);
                }
            }

            queue.push(...currentNode.kChildren);
            queue.push(...currentNode.kChildren);
        }
    }
}