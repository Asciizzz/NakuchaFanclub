/* Aflow
By Asciiz

Execution flow on top of Agraph
*/

import { Agraph, Anode, Aedge } from "./Agraph.js";

/** Base step. Extend it, override `exec`. */
export class Afstep {
    /**
     * Runs when its node is hit.
     * @param {{ ctx: *, graph: Agraph, link: { data: AfEdgeData|null, src: Anode|null, dst: Anode } }} args
     */
    exec({ ctx, graph, link }) {
        throw new Error("Afstep.exec not implemented");
    }
}

export class AfNodeData {
    constructor(data = {}) {
        Object.assign(this, data);
    }

    payload = [];
    linkSortFn = defaultLinkSortFn;

    appendPayload(step) {
        this.payload.push(step);
        return this;
    }
}

export class AfEdgeData {
    constructor({ srcId, dstId, ...data } = {}) {
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

/**
 * Static flow helpers over `Agraph`.
 *
 * Can be used directly:
 * `Aflow.addNode(graph, options)`
 *
 * Or as wrapper:
 * `const flow = new Aflow(graph)`
 * `flow.addNode(options)`
 */
export class Aflow {
    /** @param {Agraph} [graph] */
    constructor(graph = new Agraph()) {
        this.graph = graph;
    }

    // Nodes

    /**
     * Add node. Payload runs on visit.
     * @param {Agraph} graph
     * @param {{ payload?: Afstep[], linkSortFn?: (a: Aedge, b: Aedge) => number, id?: string|null }} [options]
     * @returns {Anode}
     */
    static addNode(graph, {
        payload = [],
        linkSortFn = defaultLinkSortFn,
        id = null
    } = {}) {
        Aflow.#assertGraph(graph, "addNode");

        const data = new AfNodeData({ payload, linkSortFn });
        return graph.addNode({ id, data });
    }

    /** @param {string} id @returns {Anode} */
    addNode(options = {}) {
        return Aflow.addNode(this.graph, options);
    }

    /** @param {Agraph} graph @param {string} id @returns {Anode|null} */
    static getNode(graph, id) {
        Aflow.#assertGraph(graph, "getNode");
        return graph.getNode(id);
    }

    /** @param {string} id @returns {Anode|null} */
    getNode(id) {
        return Aflow.getNode(this.graph, id);
    }

    /** @param {Agraph} graph @param {string} id @returns {boolean} */
    static hasNode(graph, id) {
        Aflow.#assertGraph(graph, "hasNode");
        return graph.hasNode(id);
    }

    /** @param {string} id @returns {boolean} */
    hasNode(id) {
        return Aflow.hasNode(this.graph, id);
    }

    /** @param {Agraph} graph @param {string} id @returns {Anode} */
    static removeNode(graph, id) {
        Aflow.#assertGraph(graph, "removeNode");
        return graph.removeNode(id);
    }

    /** @param {string} id @returns {Anode} */
    removeNode(id) {
        return Aflow.removeNode(this.graph, id);
    }

    // Links

    /**
     * Add link. `data.enabled = false` skips it during run.
     * @param {Agraph} graph
     * @param {{ srcId: string, dstId: string, id?: string|null, data?: object }} options
     * @returns {Aedge}
     */
    static addLink(graph, { srcId, dstId, data = {}, id = null } = {}) {
        Aflow.#assertGraph(graph, "addLink");

        if (!graph.hasNode(srcId)) {
            throw new Error(`Aflow.addLink: source node "${srcId}" does not exist`);
        }
        if (!graph.hasNode(dstId)) {
            throw new Error(`Aflow.addLink: destination node "${dstId}" does not exist`);
        }

        const edgeData = new AfEdgeData({ srcId, dstId, ...data });
        return graph.addEdge({ srcId, dstId, id, data: edgeData });
    }

    /** @param {{ srcId: string, dstId: string, id?: string|null, data?: object }} options @returns {Aedge} */
    addLink(options = {}) {
        return Aflow.addLink(this.graph, options);
    }

    /** @param {Agraph} graph @param {string} id @returns {Aedge|null} */
    static getLink(graph, id) {
        Aflow.#assertGraph(graph, "getLink");
        return graph.getEdge(id);
    }

    /** @param {string} id @returns {Aedge|null} */
    getLink(id) {
        return Aflow.getLink(this.graph, id);
    }

    /** @param {Agraph} graph @param {string} id @returns {Aedge} */
    static removeLink(graph, id) {
        Aflow.#assertGraph(graph, "removeLink");
        return graph.removeEdge(id);
    }

    /** @param {string} id @returns {Aedge} */
    removeLink(id) {
        return Aflow.removeLink(this.graph, id);
    }

    // Queries

    /** @param {Agraph} graph @param {string} a @param {string} b @returns {Aedge[]} */
    static connectivity(graph, a, b) {
        Aflow.#assertGraph(graph, "connectivity");
        return graph.edgesConnecting({ a, b });
    }

    /** @param {string} a @param {string} b @returns {Aedge[]} */
    connectivity(a, b) {
        return Aflow.connectivity(this.graph, a, b);
    }

    /** @param {Agraph} graph @param {string} srcId @param {string} dstId @returns {boolean} */
    static hasPath(graph, srcId, dstId) {
        Aflow.#assertGraph(graph, "hasPath");
        return graph.hasPath({ srcId, dstId });
    }

    /** @param {string} srcId @param {string} dstId @returns {boolean} */
    hasPath(srcId, dstId) {
        return Aflow.hasPath(this.graph, srcId, dstId);
    }

    // Run

    /**
     * Run DFS from `from`. Payloads get `{ ctx, graph, link }`.
     * @param {Agraph} graph
     * @param {{ from: string, ctx?: * }} options
     * @returns {*} Final ctx
     */
    static run(graph, { from = null, ctx = {} } = {}) {
        Aflow.#assertGraph(graph, "run");

        if (from == null) throw new Error(`Aflow.run: "from" node id is required`);

        const rootNode = graph.getNode(from);
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

            for (let i = 0; i < nodeData.payload.length; i++) {
                const step = nodeData.payload[i];
                if (!(step instanceof Afstep)) {
                    throw new Error(`Aflow.run: node "${node.id}" payload[${i}] is not an Afstep instance`);
                }
                step.exec({ ctx, graph, link });
            }

            const outEdges = graph.outEdges(node.id)
                .filter(edge => {
                    if (!(edge.data instanceof AfEdgeData)) {
                        throw new Error(`Aflow.run: link "${edge.id}" data is not an AfEdgeData instance`);
                    }
                    return edge.data.enabled;
                })
                // Reverse comparator because stack push is LIFO. User sort still means run order.
                .sort((b, a) => nodeData.linkSortFn(a, b));

            const nextPath = new Set(path);
            nextPath.add(node.id);

            for (const edge of outEdges) {
                const dstNode = graph.getNode(edge.dstId);
                if (!dstNode) throw new Error(`Aflow.run: link "${edge.id}" points to non-existent node "${edge.dstId}"`);

                stack.push({
                    path: nextPath,
                    link: {
                        data: edge.data,
                        src: node,
                        dst: dstNode
                    }
                });
            }
        }

        return ctx;
    }

    /**
     * Run DFS from `from`. Payloads get `{ ctx, graph, link }`.
     * @param {{ from: string, ctx?: * }} options
     * @returns {*} Final ctx
     */
    run(options = {}) {
        return Aflow.run(this.graph, options);
    }

    static #assertGraph(graph, method) {
        if (!(graph instanceof Agraph)) {
            throw new TypeError(`Aflow.${method}: graph must be an Agraph instance`);
        }
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