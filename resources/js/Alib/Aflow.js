/* Aflow
By Asciiz

Execution flow on top of Agraph
*/

import { Agraph, Anode, Aedge } from "./Agraph.js";

/** Base command. Extend it, override `exec`. */
export class Afcmd {
    /**
     * Runs when its node is hit. Root has `link.src = null`
     * @param {{ state: object, graph: Agraph, link: { data: object, src: Anode|null, dst: Anode } }} ctx
     */
    exec({ state, graph, link }) {
        throw new Error("Afcmd.exec not implemented");
    }
}

export class AfNodeData {
    constructor(data = {}) {
        Object.assign(this, data);
    }

    payload = [];
    linkSortFn = defaultLinkSortFn;

    appendPayload(cmd) {
        this.payload.push(cmd);
        return this;
    }
}

export class AfEdgeData {
    constructor({srcId, dstId, ...data} = {}) {
        Object.assign(this, data);
        this.#srcId = srcId;
        this.#dstId = dstId;
    }

    #srcId = null;
    #dstId = null;

    order = 0;
    enabled = true;

    enable() { this.enabled = true; return this; }
    disable() { this.enabled = false; return this; }
    toggle() { this.enabled = !this.enabled; return this; }
}

/** Flow runner over `Agraph`. Nodes carry hidden `Afcmd[]` payloads */
export class Aflow {
    /** @param {Agraph} [graph] */
    constructor(graph = new Agraph()) {
        this.graph = graph;
    }

    // Nodes

    /**
     * Add node. Payload runs on visit
     * @param {{ payload?: Afcmd[], linkSortFn?: (a: Aedge, b: Aedge) => number, id?: string|null }} [options]
     * @returns {Anode}
     */
    addNode({
        payload = [],
        linkSortFn = defaultLinkSortFn,
        id = null
    } = {}) {
        const data = new AfNodeData({ payload, linkSortFn });
        const node = this.graph.addNode({ id, data });

        return node;
    }

    /** @param {string} id @returns {Anode|null} */
    getNode(id) {
        return this.graph.getNode(id);
    }

    /** @param {string} id @returns {boolean} */
    hasNode(id) {
        return this.graph.hasNode(id);
    }

    /** @param {string} id @returns {Anode} */
    removeNode(id) {
        return this.graph.removeNode(id);
    }

    // Links

    /**
     * Add link. `data.enabled = false` skips it during run
     * @param {{ srcId: string, dstId: string, id?: string|null, data?: object }} options
     * @returns {Aedge}
     */
    addLink({ srcId, dstId, data = {}, id = null } = {}) {
        if (!this.graph.hasNode(srcId)) {
            throw new Error(`Aflow.addLink: source node "${srcId}" does not exist`);
        }
        if (!this.graph.hasNode(dstId)) {
            throw new Error(`Aflow.addLink: destination node "${dstId}" does not exist`);
        }

        const edgeData = new AfEdgeData({ srcId, dstId, ...data });

        return this.graph.addEdge({ srcId, dstId, id, data: edgeData });
    }

    /** @param {string} id @returns {Aedge|null} */
    getLink(id) {
        return this.graph.getEdge(id);
    }

    /** @param {string} id @returns {Aedge} */
    removeLink(id) {
        return this.graph.removeEdge(id);
    }


    // Queries

    /** @param {string} a @param {string} b @returns {Aedge[]} */
    connectivity(a, b) {
        return this.graph.edgesConnecting({ a, b });
    }

    /** @param {string} srcId @param {string} dstId @returns {boolean} */
    hasPath(srcId, dstId) {
        return this.graph.hasPath({ srcId, dstId });
    }

    // Run

    /**
     * Run DFS from `from`. Payloads get `{ state, graph, link }`
     * @param {{ from: string, state?: object }} options
     * @returns {object} Final state
     */
    run({ from = null, state = {} } = {}) {
        if (from == null) throw new Error(`Aflow.run: "from" node id is required`);

        const rootNode = this.graph.getNode(from);
        if (!rootNode) throw new Error(`Aflow.run: starting node "${from}" does not exist`);

        // Stack entries: { path: Set<nodeId>, link: { data, src: Anode|null, dst: Anode } }
        const stack = [{
            path: new Set(),
            link: { data: null, src: null, dst: rootNode }
        }];

        while (stack.length > 0) {
            const { path, link } = stack.pop();
            const node = link.dst;

            if (path.has(node.id)) {
                throw new Error(`Aflow.run: cycle detected at node "${node.id}"`);
            }

            const nodeData = node.data;
            if (!(nodeData instanceof AfNodeData)) {
                throw new Error(`Aflow.run: node "${node.id}" data is not an AfNodeData instance`);
            }

            const payload = nodeData.payload;

            for (let i = 0; i < payload.length; i++) {
                const cmd = payload[i];
                if (!(cmd instanceof Afcmd)) {
                    throw new Error(`Aflow.run: node "${node.id}" payload[${i}] is not an Afcmd instance`);
                }
                cmd.exec({ state, graph: this.graph, link });
            }

            const outEdges = this.graph.outEdges(node.id)
                .filter(e => e.data instanceof AfEdgeData && e.data.enabled)
                .sort((b, a) => nodeData.linkSortFn(a, b));

                // Note: reverse the sort because the order would be reversed when pushing to stack (LIFO)

            const nextPath = new Set(path);
            nextPath.add(node.id);

            for (const edge of outEdges) {
                const dstNode = this.graph.getNode(edge.dstId);
                if (!dstNode) throw new Error(`Aflow.run: link "${edge.id}" points to non-existent node "${edge.dstId}"`);

                stack.push({
                    path: nextPath,
                    link: {
                        data: edge.data,
                        src:  node,
                        dst:  dstNode
                    }
                });
            }
        }

        return state;
    }
}


/* Default link sort
Note:

This sort is lower order first
*/
function defaultLinkSortFn(a, b) {
    const orderA = a.data?.order ?? 0;
    const orderB = b.data?.order ?? 0;
    return orderA - orderB;
}