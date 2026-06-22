/* Aflow
By Asciiz

Execution flow on top of Agraph

# Afstep: base inheritance class for node payload steps

# Aflow (the wrapper one)

addNode({ payload: Array<Afstep>, id: string }?): Anode
addLink(srcId: string, dstId: string, { id: string, data: anything }?): Aedge

addPayload(nodeId: string, step: Afstep): this
addPayloads(nodeId: string, steps: Afstep[]): this

getNode(id: string): Anode|null
hasNode(id: string): boolean
removeNode(id: string): Anode

getLink(id: string): Aedge|null
removeLink(id: string): Aedge

sortOutgoingLinks(nodeId: string, sortFn: Function): this
sortIncomingLinks(nodeId: string, sortFn: Function): this
* sortFn(edgeA: Aedge, edgeB: Aedge, node?: Anode, graph?: Agraph): number

connectivity(nodeId1: string, nodeId2: string): Aedge[]
hasPath(srcId: string, dstId: string): boolean

run(from: string, { ctx: anything, diag: Adiag }?): { ctx: any, diag: Adiag }
*/

import { Agraph, Adag, Anode, Aedge } from "./Agraph.js";
import { Adiag } from "./Adiag.js";

export { Agraph, Adag, Anode, Aedge, Adiag };

/** Base step. Extend it, override `exec`. */
export class Afstep {
    /**
     * Runs when it's node's turn
     * @param {{ ctx: *, graph: Agraph, entry: {src: Anode|null, dst: Anode, link: Aedge|null } }} options
     */
    exec({ ctx, graph, entry, diag } = {}) {
        throw new Error("Afstep.exec not implemented");
    }
}

/**
 * Static flow helpers over `Agraph`
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
     * Add node. Payload runs on visit
     * @param {Agraph} graph
     * @param {{ payload?: Afstep[], id?: string|null }} [options]
     * @returns {Anode}
     */
    static addNode(graph, { payload = [], id = null } = {}) {
        Aflow.#assertGraph(graph, "addNode");
        return graph.addNode({ id, data: payload });
    }

    /** @param { { payload?: Afstep[], id?: string|null }} [options] @returns {Anode} */
    addNode(options = {}) {
        return Aflow.addNode(this.graph, options);
    }

    /** @param {Agraph} graph @param {string} nodeId @param {Afstep} step @returns {this} */
    static addPayload(graph, nodeId, step) {
        const node = graph.getNode(nodeId);
        if (!node) {
            throw new Error(`Aflow.addPayload: node "${nodeId}" does not exist`);
        }
        if (!(node.data instanceof Array)) {
            throw new Error(`Aflow.addPayload: node "${nodeId}" data is not an array`);
        }
        node.data.push(step);
        return this;
    }

    /** @param {string} nodeId @param {Afstep} step @returns {this} */
    addPayload(nodeId, step) {
        return Aflow.addPayload(this.graph, nodeId, step);
    }

    /** @param {Agraph} graph @param {string} nodeId @param {Afstep[]} steps @returns {this} */
    static addPayloads(graph, nodeId, steps) {
        const node = graph.getNode(nodeId);
        if (!node) {
            throw new Error(`Aflow.addPayloads: node "${nodeId}" does not exist`);
        }
        if (!(node.data instanceof Array)) {
            throw new Error(`Aflow.addPayloads: node "${nodeId}" data is not an array`);
        }
        node.data.push(...steps);
        return this;
    }

    /** @param {string} nodeId @param {Afstep[]} steps @returns {this} */
    addPayloads(nodeId, steps) {
        return Aflow.addPayloads(this.graph, nodeId, steps);
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
     * Add link. `data.enabled = false` skips it during run
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ id?: string|null, data?: any }} [options]
     * @returns {Aedge}
     */
    static addLink(graph, srcId, dstId, { data = null, id = null } = {}) {
        Aflow.#assertGraph(graph, "addLink");

        if (!graph.hasNode(srcId)) {
            throw new Error(`Aflow.addLink: source node "${srcId}" does not exist`);
        }
        if (!graph.hasNode(dstId)) {
            throw new Error(`Aflow.addLink: destination node "${dstId}" does not exist`);
        }

        return Adag.addEdge(graph, srcId, dstId, { id, data });
    }

    /** @param {string} srcId @param {string} dstId @param {{ id?: string|null, data?: any }} [options] @returns {Aedge} */
    addLink(srcId, dstId, options = {}) {
        return Aflow.addLink(this.graph, srcId, dstId, options);
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

    // Link Sorting

    /**
     * In-place sort the outgoing links of a node
     * @param {Agraph} graph
     * @param {string} nodeId
     * @param {function(Aedge, Aedge, Anode, Agraph): number} sortFn
     */
    static sortOutgoingLinks(graph, nodeId, sortFn) {
        Aflow.#assertGraph(graph, "sortOutgoingLinks");
        graph.sortOutgoingEdges(nodeId, sortFn);
    }

    /**
     * In-place sort the outgoing links of a node
     * @param {string} nodeId
     * @param {function(Aedge, Aedge, Anode, Agraph): number} sortFn
     * @returns {this}
     */
    sortOutgoingLinks(nodeId, sortFn) {
        Aflow.sortOutgoingLinks(this.graph, nodeId, sortFn);
        return this;
    }

    /**
     * In-place sort the incoming links of a node
     * @param {Agraph} graph
     * @param {string} nodeId
     * @param {function(Aedge, Aedge, Anode, Agraph): number} [sortFn=defaultLinkSortFn]
     */
    static sortIncomingLinks(graph, nodeId, sortFn = defaultLinkSortFn) {
        Aflow.#assertGraph(graph, "sortIncomingLinks");
        graph.sortIncomingEdges(nodeId, sortFn);
    }

    /**
     * In-place sort the incoming links of a node
     * @param {string} nodeId
     * @param {function(Aedge, Aedge, Anode, Agraph): number} [sortFn=defaultLinkSortFn]
     * @returns {this}
     */
    sortIncomingLinks(nodeId, sortFn = defaultLinkSortFn) {
        Aflow.sortIncomingLinks(this.graph, nodeId, sortFn);
        return this;
    }

    // Queries

    /** @param {Agraph} graph @param {string} nodeId1 @param {string} nodeId2 @returns {Aedge[]} */
    static connectivity(graph, nodeId1, nodeId2) {
        Aflow.#assertGraph(graph, "connectivity");
        return graph.edgesConnecting(nodeId1, nodeId2);
    }

    /** @param {string} nodeId1 @param {string} nodeId2 @returns {Aedge[]} */
    connectivity(nodeId1, nodeId2) {
        return Aflow.connectivity(this.graph, nodeId1, nodeId2);
    }

    /** @param {Agraph} graph @param {string} srcId @param {string} dstId @returns {boolean} */
    static hasPath(graph, srcId, dstId) {
        Aflow.#assertGraph(graph, "hasPath");
        return graph.hasPath(srcId, dstId);
    }

    /** @param {string} srcId @param {string} dstId @returns {boolean} */
    hasPath(srcId, dstId) {
        return Aflow.hasPath(this.graph, srcId, dstId);
    }

    // Run

    /**
     * Run DFS from `from`. Payloads get `{ ctx, graph, link }`
     * @param {Agraph} graph
     * @param {string} from
     * @param {{ ctx?: * }} [options]
     * @returns {*} Final ctx
     */
    static run(graph, from, { ctx = {}, diag = new Adiag() } = {}) {
        Aflow.#assertGraph(graph, "run");

        if (from == null) throw new Error(`Aflow.run: "from" node id is required`);

        const rootNode = graph.getNode(from);
        if (!rootNode) throw new Error(`Aflow.run: starting node "${from}" does not exist`);

        // Stack entries: { path: Set<nodeId>, link: { data, src: Anode|null, dst: Anode } }
        const stack = [{
            path: new Set(),
            entry: { link: null, src: null, dst: rootNode }
        }];

        while (stack.length > 0) {
            const { path, entry } = stack.pop();
            const node = entry.dst;

            if (path.has(node.id)) {
                throw new Error(`Aflow.run: cycle detected at node "${node.id}"`);
            }

            const nodeData = node.data;
            if (!(nodeData instanceof Array)) {
                throw new Error(`Aflow.run: node "${node.id}" data is not an array`);
            }

            for (let i = 0; i < nodeData.length; i++) {
                const step = nodeData[i];
                if (!(step instanceof Afstep)) {
                    throw new Error(`Aflow.run: node "${node.id}" payload[${i}] is not an Afstep instance`);
                }
                step.exec({ ctx, graph, entry, diag });
            }

            const outEdges = graph.outEdges(node.id);

            const nextPath = new Set(path);
            nextPath.add(node.id);

            for (let i = outEdges.length - 1; i >= 0; i--) {
                const edge = outEdges[i];
                const dstNode = graph.getNode(edge.dstId);
                if (!dstNode) throw new Error(`Aflow.run: link "${edge.id}" points to non-existent node "${edge.dstId}"`);

                stack.push({
                    path: nextPath,
                    entry: { link: edge, src: node, dst: dstNode }
                });
            }
        }

        return { ctx, diag };
    }

    /**
     * Run DFS from `from`. Payloads get `{ ctx, graph, link }`
     * @param {string} from
     * @param {{ ctx?: * }} [options]
     * @returns {*} Final ctx
     */
    run(from, options = {}) {
        return Aflow.run(this.graph, from, options);
    }

    static #assertGraph(graph, method) {
        if (!(graph instanceof Agraph)) {
            throw new TypeError(`Aflow.${method}: graph must be an Agraph instance`);
        }
    }
}
