import { Adiag } from "./Adiag.js";

/* Agraph
By Asciiz

Tiny directed graph. Stores topology only, traversal is your job
Pass { diag } to any method to collect errors into an Adiag instead of throwing

# Methods:

addNode({ data?: any, id?: string, diag?: Adiag })  -> Anode|null
getNode(id: string)                                 -> Anode|null
hasNode(id: string)                                 -> boolean
removeNode(id: string, { diag?: Adiag })            -> Anode|null
getNodes()                                          -> Anode[]

addEdge(srcId: string, dstId: string, {
    data?: any, id?: string, diag?: Adiag
})                                                  -> Aedge|null
getEdge(id: string)                                 -> Aedge|null
hasEdge(id: string)                                 -> boolean
removeEdge(id: string, { diag?: Adiag })            -> Aedge|null
getEdges()                                          -> Aedge[]

edgesOf(nodeId: string, { direction: string })      -> Aedge[]
outEdges(nodeId: string)                            -> Aedge[]
inEdges(nodeId: string)                             -> Aedge[]
edgesBetween(srcId: string, dstId: string)          -> Aedge[]
edgesConnecting(nodeId1: string, nodeId2: string)   -> Aedge[]

sortIncomingEdges(nodeId: string, compareFn: Func)  -> void
sortOutgoingEdges(nodeId: string, compareFn: Func)  -> void
* compareFn(
    edgeA: Aedge,
    edgeB: Aedge,
    node?: Anode,
    graph?: Agraph
) -> number (-1, 0 or 1)

connectionsOf(nodeId: string, { direction: string })-> Array<{from:Anode, to:Anode, edge:Aedge, dir:string}>
neighborsOf(nodeId: string, { direction: string })  -> Anode[]
successors(nodeId: string)                          -> Anode[]
predecessors(nodeId: string)                        -> Anode[]

degree(nodeId: string)                              -> number
outDegree(nodeId: string)                           -> number
inDegree(nodeId: string)                            -> number

forEachNode(fn: Func, { diag: Adiag })              -> void
forEachEdge(fn: Func, { diag: Adiag })              -> void
filterNodes(fn: Func, { diag: Adiag })              -> Anode[]|null
filterEdges(fn: Func, { diag: Adiag })              -> Aedge[]|null

* For nodes: fn(node: Anode) -> boolean
* For edges: fn(edge: Aedge) -> boolean

serialize({ diag: Adiag })                          -> object
deserialize(json: string, { diag: Adiag })          -> Agraph

*/

export class Anode {
    #id;

    /** @param {string} id @param {object} [data={}] */
    constructor(id, data = {}) {
        this.#id = id;
        this.data = data;
    }

    get id() { return this.#id; }
}

export class Aedge {
    #id;
    #srcId;
    #dstId;

    /** @param {string} id @param {string} srcId @param {string} dstId @param {object} [data={}] */
    constructor(id, srcId, dstId, data = {}) {
        this.#id    = id;
        this.#srcId = srcId;
        this.#dstId = dstId;
        this.data   = data;
    }

    get id()    { return this.#id; }
    get srcId() { return this.#srcId; }
    get dstId() { return this.#dstId; }
}

// ==================== Generic directed graph =====================

export class Agraph {
    static OUT  = "out";
    static IN   = "in";
    static BOTH = "both";

    static SELF    = "self";
    static UNKNOWN = "unknown";

    static isDirection(direction) {
        return direction === Agraph.OUT ||
               direction === Agraph.IN  ||
               direction === Agraph.BOTH;
    }

    constructor({ label = "" } = {}) {
        this.label = label;

        this.nodes = new Map();    // nodeId -> Anode
        this.edges = new Map();    // edgeId -> Aedge

        this.outgoing = new Map(); // nodeId -> Array(edgeId)
        this.incoming = new Map(); // nodeId -> Array(edgeId)

        this._nextNodeId = 0;
        this._nextEdgeId = 0;
    }

    makeNodeId() { return `${this.label}_n${this._nextNodeId++}`; }
    makeEdgeId() { return `${this.label}_e${this._nextEdgeId++}`; }

    // Nodes

    /**
     * @param {{ data?: object, id?: string|null, diag?: Adiag }} [options]
     * @returns {Anode|null}
     */
    addNode({ data = {}, id = null, diag } = {}) {
        const nodeId = id ?? this.makeNodeId();

        if (this.nodes.has(nodeId)) {
            return _agraphFail(diag,
                { code: "ADD_NODE_FAILED", raw: 'Could not add node "$nodeId$": node already exists', data: { nodeId } },
                `Agraph.addNode: node "${nodeId}" already exists`,
            );
        }

        const node = new Anode(nodeId, data);

        this.nodes.set(nodeId, node);
        this.outgoing.set(nodeId, []);
        this.incoming.set(nodeId, []);

        if (diag instanceof Adiag) diag.ok({ code: "ADD_NODE_OK", data: { nodeId } });
        return node;
    }

    /** @param {string} id @returns {Anode|null} */
    getNode(id) { return this.nodes.get(id) ?? null; }
    /** @param {string} id @returns {boolean} */
    hasNode(id) { return this.nodes.has(id); }


    /**
     * Remove node + its edges
     * @param {string} id
     * @param {{ diag?: Adiag }} [options]
     * @returns {Anode|null}
     */
    removeNode(id, { diag } = {}) {
        const node = this.nodes.get(id);

        if (!node) {
            return _agraphFail(diag,
                { code: "REMOVE_NODE_FAILED", raw: 'Could not remove node "$id$": node does not exist', data: { id } },
                `Agraph.removeNode: node "${id}" does not exist`,
            );
        }

        const edgeIds = new Set([
            ...this.outgoing.get(id),
            ...this.incoming.get(id)
        ]);

        for (const edgeId of edgeIds) {
            this.removeEdge(edgeId);
        }

        this.nodes.delete(id);
        this.outgoing.delete(id);
        this.incoming.delete(id);

        if (diag instanceof Adiag) diag.ok({ code: "REMOVE_NODE_OK", data: { id } });
        return node;
    }

    getNodes() { return [...this.nodes.values()]; }
    get nodeCount() { return this.nodes.size; }

    // Edges

    /**
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ data?: object, id?: string|null, diag?: Adiag }} [options]
     * @returns {Aedge|null}
     */
    addEdge(srcId, dstId, { data = {}, id = null, diag } = {}) {
        if (srcId == null) {
            return _agraphFail(diag,
                { code: "ADD_EDGE_FAILED", raw: "Could not add edge: srcId is required", data: { srcId, dstId } },
                `Agraph.addEdge: srcId is required`,
            );
        }
        if (dstId == null) {
            return _agraphFail(diag,
                { code: "ADD_EDGE_FAILED", raw: "Could not add edge: dstId is required", data: { srcId, dstId } },
                `Agraph.addEdge: dstId is required`,
            );
        }

        if (!this.nodes.has(srcId)) {
            return _agraphFail(diag,
                { code: "ADD_EDGE_FAILED", raw: 'Could not add edge "$srcId$" -> "$dstId$": source node does not exist', data: { srcId, dstId } },
                `Agraph.addEdge: source node "${srcId}" does not exist`,
            );
        }
        if (!this.nodes.has(dstId)) {
            return _agraphFail(diag,
                { code: "ADD_EDGE_FAILED", raw: 'Could not add edge "$srcId$" -> "$dstId$": destination node does not exist', data: { srcId, dstId } },
                `Agraph.addEdge: destination node "${dstId}" does not exist`,
            );
        }

        const edgeId = id ?? this.makeEdgeId();

        if (this.edges.has(edgeId)) {
            return _agraphFail(diag,
                { code: "ADD_EDGE_FAILED", raw: 'Could not add edge "$edgeId$": edge already exists', data: { edgeId, srcId, dstId } },
                `Agraph.addEdge: edge "${edgeId}" already exists`,
            );
        }

        const edge = new Aedge(edgeId, srcId, dstId, data);

        this.edges.set(edgeId, edge);
        this.outgoing.get(srcId).push(edgeId);
        this.incoming.get(dstId).push(edgeId);

        if (diag instanceof Adiag) diag.ok({ code: "ADD_EDGE_OK", data: { edgeId, srcId, dstId } });
        return edge;
    }

    /** @param {string} id @returns {Aedge|null} */
    getEdge(id) { return this.edges.get(id) ?? null; }

    /** @param {string} id @returns {boolean} */
    hasEdge(id) { return this.edges.has(id); }


    /**
     * @param {string} id
     * @param {{ diag?: Adiag }} [options]
     * @returns {Aedge|null}
     */
    removeEdge(id, { diag } = {}) {
        const edge = this.edges.get(id);

        if (!edge) {
            return _agraphFail(diag,
                { code: "REMOVE_EDGE_FAILED", raw: 'Could not remove edge "$id$": edge does not exist', data: { id } },
                `Agraph.removeEdge: edge "${id}" does not exist`,
            );
        }

        const outArr = this.outgoing.get(edge.srcId);
        if (outArr) {
            const idx = outArr.indexOf(id);
            if (idx !== -1) outArr.splice(idx, 1);
        }
        const inArr = this.incoming.get(edge.dstId);
        if (inArr) {
            const idx = inArr.indexOf(id);
            if (idx !== -1) inArr.splice(idx, 1);
        }
        this.edges.delete(id);

        if (diag instanceof Adiag) diag.ok({ code: "REMOVE_EDGE_OK", data: { id } });
        return edge;
    }

    /** @returns {Aedge[]} */
    getEdges() { return [...this.edges.values()]; }
    /** @type {number} */
    get edgeCount() { return this.edges.size; }


    // Direction

    // Edge queries

    /**
     * Edges touching `nodeId`, filtered by direction
     * @param {string} nodeId
     * @param {{ direction?: "out"|"in"|"both" }} [options]
     * @returns {Aedge[]}
     */
    edgesOf(nodeId, { direction = Agraph.OUT } = {}) {
        if (!Agraph.isDirection(direction)) return [];
        if (!this.nodes.has(nodeId)) return [];

        if (direction === Agraph.OUT) {
            return this.#edgesFromIds(this.outgoing.get(nodeId));
        }

        if (direction === Agraph.IN) {
            return this.#edgesFromIds(this.incoming.get(nodeId));
        }

        const edgeIds = new Set([
            ...this.outgoing.get(nodeId),
            ...this.incoming.get(nodeId)
        ]);

        return this.#edgesFromIds(edgeIds);
    }


    /** 
     * @param {string} nodeId
     * @returns {Aedge[]}
     */
    outEdges(nodeId) {
        return this.edgesOf(nodeId, { direction: Agraph.OUT });
    }

    /**
     * @param {string} nodeId
     * @returns {Aedge[]}
     */
    inEdges(nodeId) {
        return this.edgesOf(nodeId, { direction: Agraph.IN });
    }

    /**
     * In-place sort the outgoing edges of a node
     * @param {string} nodeId
     * @param {function(Aedge, Aedge, Anode, Agraph): number} sortFn
     * @param {{ diag?: Adiag }} [options]
     */
    sortOutgoingEdges(nodeId, sortFn, { diag } = {}) {
        if (typeof sortFn !== "function") {
            return _agraphFail(diag,
                { code: "SORT_OUTGOING_EDGES_FAILED", raw: 'Could not sort outgoing edges of node "$nodeId$": sortFn must be a function', data: { nodeId } },
                `Agraph.sortOutgoingEdges: sortFn must be a function`,
            );
        }
        const edgeIds = this.outgoing.get(nodeId);
        if (!edgeIds) return;
        const node = this.getNode(nodeId);
        edgeIds.sort((idA, idB) => {
            const a = this.edges.get(idA);
            const b = this.edges.get(idB);
            return sortFn(a, b, node, this);
        });
        if (diag instanceof Adiag) diag.ok({ code: "SORT_OUTGOING_EDGES_OK", data: { nodeId } });
    }

    /**
     * In-place sort the incoming edges of a node
     * @param {string} nodeId
     * @param {function(Aedge, Aedge, Anode, Agraph): number} sortFn
     * @param {{ diag?: Adiag }} [options]
     */
    sortIncomingEdges(nodeId, sortFn, { diag } = {}) {
        if (typeof sortFn !== "function") {
            return _agraphFail(diag,
                { code: "SORT_INCOMING_EDGES_FAILED", raw: 'Could not sort incoming edges of node "$nodeId$": sortFn must be a function', data: { nodeId } },
                `Agraph.sortIncomingEdges: sortFn must be a function`,
            );
        }
        const edgeIds = this.incoming.get(nodeId);
        if (!edgeIds) return;
        const node = this.getNode(nodeId);
        edgeIds.sort((idA, idB) => {
            const a = this.edges.get(idA);
            const b = this.edges.get(idB);
            return sortFn(a, b, node, this);
        });
        if (diag instanceof Adiag) diag.ok({ code: "SORT_INCOMING_EDGES_OK", data: { nodeId } });

        return this.#edgesFromIds(edgeIds);
    }

    /**
     * @param {string} srcId
     * @param {string} dstId
     * @returns {Aedge[]}
     */
    edgesBetween(srcId, dstId) {
        if (!this.nodes.has(srcId) || !this.nodes.has(dstId)) return [];

        const result = [];
        for (const edge of this.outEdges(srcId)) {
            if (edge.dstId === dstId) result.push(edge);
        }
        return result;
    }


    /**
     * Edges between `nodeId1` and `nodeId2`, both ways
     * @param {string} nodeId1
     * @param {string} nodeId2
     * @returns {Aedge[]}
     */
    edgesConnecting(nodeId1, nodeId2) {
        if (!this.nodes.has(nodeId1) || !this.nodes.has(nodeId2)) return [];

        const edgeIds = new Set();
        for (const edge of this.edgesBetween(nodeId1, nodeId2)) edgeIds.add(edge.id);
        for (const edge of this.edgesBetween(nodeId2, nodeId1)) edgeIds.add(edge.id);

        return this.#edgesFromIds(edgeIds);
    }



    // Connection / neighbor queries

    /**
     * Neighbor links with resolved nodes + dir tag
     * @param {string} nodeId
     * @param {{ direction?: "out"|"in"|"both" }} [options]
     * @returns {Array<{ from: Anode, to: Anode, edge: Aedge, dir: string }>}
     */
    connectionsOf(nodeId, { direction = Agraph.OUT } = {}) {
        if (!Agraph.isDirection(direction)) return [];
        if (!this.nodes.has(nodeId)) return [];

        const node  = this.getNode(nodeId);
        const edges = this.edgesOf(nodeId, { direction });

        const result = [];
        for (const edge of edges) {
            const dir =
                edge.srcId === edge.dstId ? Agraph.SELF    :
                edge.srcId === nodeId     ? Agraph.OUT     :
                edge.dstId === nodeId     ? Agraph.IN      :
                Agraph.UNKNOWN;

            const otherNodeId = dir === Agraph.OUT ? edge.dstId : edge.srcId;
            result.push({ from: node, to: this.getNode(otherNodeId), edge, dir });
        }

        return result;
    }


    /**
     * Unique neighbor nodes
     * @param {string} nodeId
     * @param {{ direction?: "out"|"in"|"both" }} [options]
     * @returns {Anode[]}
     */
    neighborsOf(nodeId, { direction = Agraph.OUT } = {}) {
        return this.connectionsOf(nodeId, { direction })
            .map(c => c.to)
            .filter(uniqueById());
    }

    /** @param {string} nodeId @returns {Anode[]} */
    successors(nodeId) {
        return this.neighborsOf(nodeId, { direction: Agraph.OUT });
    }
    /** @param {string} nodeId @returns {Anode[]} */
    predecessors(nodeId) {
        return this.neighborsOf(nodeId, { direction: Agraph.IN });
    }

    /** Total degree; self-loop counts once. @param {string} nodeId @returns {number} */
    degree(nodeId)    { return this.edgesOf(nodeId, { direction: Agraph.BOTH }).length; }
    /** @param {string} nodeId @returns {number} */
    outDegree(nodeId) { return this.outgoing.get(nodeId)?.length ?? 0; }
    /** @param {string} nodeId @returns {number} */
    inDegree(nodeId)  { return this.incoming.get(nodeId)?.length ?? 0; }

    // Iteration helpers

    /** @param {function(Anode): void} fn @param {{ diag?: Adiag }} [options] */
    forEachNode(fn, { diag } = {}) {
        try {
            for (const node of this.nodes.values()) fn(node);
            if (diag instanceof Adiag) diag.ok({ code: "FOR_EACH_NODE_OK" });
        } catch (error) {
            _agraphFail(diag,
                { code: "FOR_EACH_NODE_FAILED", raw: "Node callback failed: $error$", data: { error } },
                error,
            );
        }
    }

    /** @param {function(Aedge): void} fn @param {{ diag?: Adiag }} [options] */
    forEachEdge(fn, { diag } = {}) {
        try {
            for (const edge of this.edges.values()) fn(edge);
            if (diag instanceof Adiag) diag.ok({ code: "FOR_EACH_EDGE_OK" });
        } catch (error) {
            _agraphFail(diag,
                { code: "FOR_EACH_EDGE_FAILED", raw: "Edge callback failed: $error$", data: { error } },
                error,
            );
        }
    }

    /** @param {function(Anode): boolean} fn @param {{ diag?: Adiag }} [options] @returns {Anode[]|null} */
    filterNodes(fn, { diag } = {}) {
        try {
            const result = [];
            for (const node of this.nodes.values()) {
                if (fn(node)) result.push(node);
            }
            if (diag instanceof Adiag) diag.ok({ code: "FILTER_NODES_OK" });
            return result;
        } catch (error) {
            return _agraphFail(diag,
                { code: "FILTER_NODES_FAILED", raw: "Node filter callback failed: $error$", data: { error } },
                error,
            );
        }
    }

    /** @param {function(Aedge): boolean} fn @param {{ diag?: Adiag }} [options] @returns {Aedge[]|null} */
    filterEdges(fn, { diag } = {}) {
        try {
            const result = [];
            for (const edge of this.edges.values()) {
                if (fn(edge)) result.push(edge);
            }
            if (diag instanceof Adiag) diag.ok({ code: "FILTER_EDGES_OK" });
            return result;
        } catch (error) {
            return _agraphFail(diag,
                { code: "FILTER_EDGES_FAILED", raw: "Edge filter callback failed: $error$", data: { error } },
                error,
            );
        }
    }

    /** @param {function(Anode): *} fn @param {{ diag?: Adiag }} [options] @returns {Array<*>|null} */
    mapNodeData(fn, { diag } = {}) {
        try {
            const result = [];
            for (const node of this.nodes.values()) result.push(fn(node));
            if (diag instanceof Adiag) diag.ok({ code: "MAP_NODE_DATA_OK" });
            return result;
        } catch (error) {
            return _agraphFail(diag,
                { code: "MAP_NODE_DATA_FAILED", raw: "Node mapper callback failed: $error$", data: { error } },
                error,
            );
        }
    }

    /** @param {function(Aedge): *} fn @param {{ diag?: Adiag }} [options] @returns {Array<*>|null} */
    mapEdgeData(fn, { diag } = {}) {
        try {
            const result = [];
            for (const edge of this.edges.values()) result.push(fn(edge));
            if (diag instanceof Adiag) diag.ok({ code: "MAP_EDGE_DATA_OK" });
            return result;
        } catch (error) {
            return _agraphFail(diag,
                { code: "MAP_EDGE_DATA_FAILED", raw: "Edge mapper callback failed: $error$", data: { error } },
                error,
            );
        }
    }


    // Graph-level queries

    /** @returns {Anode[]} Nodes with no incoming edges */
    roots() { return this.filterNodes(node => this.inDegree(node.id) === 0); }
    /** @returns {Anode[]} Nodes with no outgoing edges */
    leaves() { return this.filterNodes(node => this.outDegree(node.id) === 0); }


    /**
     * BFS: can `srcId` reach `dstId`?
     * @param {string} srcId
     * @param {string} dstId
     * @returns {boolean}
     */
    hasPath(srcId, dstId) {
        if (!this.nodes.has(srcId) || !this.nodes.has(dstId)) return false;
        if (srcId === dstId) return true;

        const visited = new Set();
        const queue   = [srcId];
        let queueIndex = 0;

        while (queueIndex < queue.length) {
            const current = queue[queueIndex++];
            if (visited.has(current)) continue;
            visited.add(current);

            for (const edge of this.outEdges(current)) {
                if (edge.dstId === dstId) return true;
                if (!visited.has(edge.dstId)) queue.push(edge.dstId);
            }
        }

        return false;
    }


    /**
     * Topological order; cycles throw (or write to diag)
     * @param {{ diag?: Adiag }} [options]
     * @returns {Anode[]|null}
     */
    topoSort({ diag } = {}) {
        const inDegree = new Map();
        for (const id of this.nodes.keys()) inDegree.set(id, 0);
        for (const edge of this.edges.values()) {
            inDegree.set(edge.dstId, (inDegree.get(edge.dstId) ?? 0) + 1);
        }

        const queue = [];
        for (const [id, deg] of inDegree) {
            if (deg === 0) queue.push(id);
        }

        const sorted = [];
        let queueIndex = 0;
        while (queueIndex < queue.length) {
            const id = queue[queueIndex++];
            sorted.push(this.getNode(id));

            for (const edge of this.outEdges(id)) {
                const newDeg = inDegree.get(edge.dstId) - 1;
                inDegree.set(edge.dstId, newDeg);
                if (newDeg === 0) queue.push(edge.dstId);
            }
        }

        if (sorted.length !== this.nodes.size) {
            return _agraphFail(diag,
                { code: "TOPO_SORT_FAILED", raw: 'Could not topologically sort graph "$label$": graph contains a cycle', data: { label: this.label } },
                `Agraph.topoSort: graph contains a cycle -- topological sort is not possible`,
            );
        }

        if (diag instanceof Adiag) diag.ok({ code: "TOPO_SORT_OK", data: { label: this.label } });
        return sorted;
    }


    // Subgraph / clone / merge

    /**
     * @param {string[]} nodeIds
     * @param {{ diag?: Adiag }} [options]
     * @returns {Agraph|null}
     */
    subgraph(nodeIds, { diag } = {}) {
        const idSet = new Set(nodeIds);
        const sub   = new Agraph({ label: `${this.label}_sub` });

        for (const id of idSet) {
            const node = this.getNode(id);
            if (!node) {
                return _agraphFail(diag,
                    { code: "SUBGRAPH_FAILED", raw: 'Could not create subgraph: node "$id$" does not exist', data: { id, nodeIds } },
                    `Agraph.subgraph: node "${id}" does not exist`,
                );
            }
            sub.addNode({ id: node.id, data: structuredClone(node.data) });
        }

        for (const edge of this.edges.values()) {
            if (idSet.has(edge.srcId) && idSet.has(edge.dstId)) {
                sub.addEdge(edge.srcId, edge.dstId, {
                    id:   edge.id,
                    data: structuredClone(edge.data)
                });
            }
        }

        if (diag instanceof Adiag) diag.ok({ code: "SUBGRAPH_OK", data: { nodeIds } });
        return sub;
    }

    /**
     * Deep clone via `structuredClone`
     * @param {{ diag?: Adiag }} [options]
     * @returns {Agraph|null}
     */
    clone({ diag } = {}) {
        try {
            const g = new Agraph({ label: this.label });
            g._nextNodeId = this._nextNodeId;
            g._nextEdgeId = this._nextEdgeId;

            for (const node of this.nodes.values()) {
                g.addNode({ id: node.id, data: structuredClone(node.data) });
            }

            for (const edge of this.edges.values()) {
                g.addEdge(edge.srcId, edge.dstId, {
                    id:   edge.id,
                    data: structuredClone(edge.data)
                });
            }

            if (diag instanceof Adiag) diag.ok({ code: "CLONE_OK", data: { label: this.label } });
            return g;
        } catch (error) {
            return _agraphFail(diag,
                { code: "CLONE_FAILED", raw: 'Could not clone graph "$label$": $error$', data: { label: this.label, error } },
                error,
            );
        }
    }

    /**
     * Merge in; skip dupes
     * @param {Agraph} otherGraph
     * @param {{ diag?: Adiag }} [options]
     * @returns {this|null}
     */
    mergeFrom(otherGraph, { diag } = {}) {
        try {
            for (const node of otherGraph.nodes.values()) {
                if (!this.nodes.has(node.id)) {
                    this.addNode({ id: node.id, data: structuredClone(node.data) });
                }
            }

            for (const edge of otherGraph.edges.values()) {
                if (!this.edges.has(edge.id)) {
                    this.addEdge(edge.srcId, edge.dstId, {
                        id:   edge.id,
                        data: structuredClone(edge.data)
                    });
                }
            }

            if (diag instanceof Adiag) diag.ok({ code: "MERGE_FROM_OK", data: { label: this.label, otherLabel: otherGraph?.label } });
            return this;
        } catch (error) {
            return _agraphFail(diag,
                { code: "MERGE_FROM_FAILED", raw: 'Could not merge graph "$otherLabel$" into "$label$": $error$', data: { label: this.label, otherLabel: otherGraph?.label, error } },
                error,
            );
        }
    }


    // Serialization

    /**
     * JSON; only node/edge data survives
     * @param {{ diag?: Adiag }} [options]
     * @returns {string|null}
     */
    serialize({ diag } = {}) {
        try {
            const json = JSON.stringify({
                label:        this.label,
                _nextNodeId:  this._nextNodeId,
                _nextEdgeId:  this._nextEdgeId,
                nodes: [...this.nodes.values()].map(n => ({ id: n.id, data: n.data })),
                edges: [...this.edges.values()].map(e => ({ id: e.id, srcId: e.srcId, dstId: e.dstId, data: e.data })),
            });
            if (diag instanceof Adiag) diag.ok({ code: "SERIALIZE_OK", data: { label: this.label } });
            return json;
        } catch (error) {
            return _agraphFail(diag,
                { code: "SERIALIZE_FAILED", raw: 'Could not serialize graph "$label$": $error$', data: { label: this.label, error } },
                error,
            );
        }
    }

    /**
     * @param {string} json
     * @param {{ diag?: Adiag }} [options]
     * @returns {Agraph|null}
     */
    static deserialize(json, { diag } = {}) {
        try {
            const raw = JSON.parse(json);
            const g   = new Agraph({ label: raw.label });
            g._nextNodeId = raw._nextNodeId;
            g._nextEdgeId = raw._nextEdgeId;

            for (const node of raw.nodes) {
                g.addNode({ id: node.id, data: node.data });
            }
            for (const edge of raw.edges) {
                g.addEdge(edge.srcId, edge.dstId, { id: edge.id, data: edge.data });
            }

            if (diag instanceof Adiag) diag.ok({ code: "DESERIALIZE_OK" });
            return g;
        } catch (error) {
            return _agraphFail(diag,
                { code: "DESERIALIZE_FAILED", raw: "Could not deserialize graph JSON: $error$", data: { error } },
                error,
            );
        }
    }


    // Reset

    /** @param {{ resetIds?: boolean }} [options] @returns {this} */
    clear({ resetIds = true } = {}) {
        this.nodes.clear();
        this.edges.clear();
        this.outgoing.clear();
        this.incoming.clear();

        if (resetIds) {
            this._nextNodeId = 0;
            this._nextEdgeId = 0;
        }

        return this;
    }



    #edgesFromIds(ids) {
        if (!ids) return [];

        const result = [];
        for (const id of ids) {
            const edge = this.edges.get(id);
            if (edge) result.push(edge);
        }

        return result;
    }
}

// ==================== Directed acyclic graph rules =====================

export class Adag {
    /**
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ data?: object, id?: string|null, diag?: Adiag }} [options]
     * @returns {Aedge|null}
     */
    static addEdge(graph, srcId, dstId, { diag, ...options } = {}) {
        const canAdd = Adag.assertCanAddEdge(graph, srcId, dstId, { diag });
        if (canAdd === null) return null;
        return graph.addEdge(srcId, dstId, { ...options, diag });
    }

    /**
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ diag?: Adiag }} [options]
     * @returns {true|null}
     */
    static assertCanAddEdge(graph, srcId, dstId, { diag } = {}) {
        if (!(graph instanceof Agraph)) {
            return _agraphFail(diag,
                { code: "DAG_ADD_EDGE_FAILED", raw: "Adag.assertCanAddEdge: graph must be an Agraph instance", data: { srcId, dstId } },
                `Adag.assertCanAddEdge: graph must be an Agraph instance`,
            );
        }

        if (srcId == null) {
            return _agraphFail(diag,
                { code: "DAG_ADD_EDGE_FAILED", raw: "Adag.addEdge: srcId is required", data: { srcId, dstId } },
                `Adag.addEdge: srcId is required`,
            );
        }
        if (dstId == null) {
            return _agraphFail(diag,
                { code: "DAG_ADD_EDGE_FAILED", raw: "Adag.addEdge: dstId is required", data: { srcId, dstId } },
                `Adag.addEdge: dstId is required`,
            );
        }

        if (!graph.hasNode(srcId)) {
            return _agraphFail(diag,
                { code: "DAG_ADD_EDGE_FAILED", raw: 'Adag.addEdge: source node "$srcId$" does not exist', data: { srcId, dstId } },
                `Adag.addEdge: source node "${srcId}" does not exist`,
            );
        }
        if (!graph.hasNode(dstId)) {
            return _agraphFail(diag,
                { code: "DAG_ADD_EDGE_FAILED", raw: 'Adag.addEdge: destination node "$dstId$" does not exist', data: { srcId, dstId } },
                `Adag.addEdge: destination node "${dstId}" does not exist`,
            );
        }

        if (_agraphWouldCreateCycle(graph, srcId, dstId)) {
            return _agraphFail(diag,
                { code: "DAG_ADD_EDGE_FAILED", raw: 'Could not add DAG edge "$srcId$" -> "$dstId$": would create a cycle', data: { srcId, dstId } },
                `Adag.addEdge: edge "${srcId}" -> "${dstId}" would create a cycle`,
            );
        }

        return true;
    }

    /**
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ diag?: Adiag }} [options]
     * @returns {boolean}
     */
    static wouldCreateCycle(graph, srcId, dstId, { diag } = {}) {
        if (!(graph instanceof Agraph)) {
            _agraphFail(diag,
                { code: "WOULD_CREATE_CYCLE_FAILED", raw: "Adag.wouldCreateCycle: graph must be an Agraph instance", data: { srcId, dstId } },
                `Adag.wouldCreateCycle: graph must be an Agraph instance`,
            );
            return false;
        }
        if (srcId == null || dstId == null) {
            _agraphFail(diag,
                { code: "WOULD_CREATE_CYCLE_FAILED", raw: "Adag.wouldCreateCycle: srcId and dstId are required", data: { srcId, dstId } },
                `Adag.wouldCreateCycle: srcId and dstId are required`,
            );
            return false;
        }

        return _agraphWouldCreateCycle(graph, srcId, dstId);
    }

    /**
     * @param {Agraph} graph
     * @returns {boolean}
     */
    static hasCycle(graph) {
        if (!(graph instanceof Agraph)) {
            throw new TypeError(`Adag.hasCycle: graph must be an Agraph instance`);
        }

        try {
            graph.topoSort();
            return false;
        } catch {
            return true;
        }
    }

    /**
     * @param {Agraph} graph
     * @param {{ diag?: Adiag }} [options]
     * @returns {true|null}
     */
    static assertDag(graph, { diag } = {}) {
        if (!(graph instanceof Agraph)) {
            return _agraphFail(diag,
                { code: "DAG_ASSERT_FAILED", raw: "Adag.assertDag: graph must be an Agraph instance", data: {} },
                `Adag.assertDag: graph must be an Agraph instance`,
            );
        }

        const sorted = graph.topoSort({ diag });
        if (sorted === null) return null;

        if (diag instanceof Adiag) diag.ok({ code: "DAG_ASSERT_OK", data: { label: graph.label } });
        return true;
    }
}

// ==================== Tree / forest rules over Agraph =====================

export class Atree {
    /**
     * Add a tree node and optionally attach it to a parent with an edge
     * @param {Agraph} graph
     * @param {{ parentId?: string|null, data?: object, edgeData?: object, id?: string|null, edgeId?: string|null, diag?: Adiag }} options
     * @returns {{ node: Anode, edge: Aedge|null }|null}
     */
    static addNode(graph, {
        parentId = null,
        data = {},
        edgeData = {},
        id = null,
        edgeId = null,
        diag,
    } = {}) {
        const canAdd = Atree.assertCanAddNode(graph, { parentId, id, edgeId, diag });
        if (canAdd === null) return null;

        const node = graph.addNode({ id, data });
        let edge = null;

        try {
            if (parentId != null) {
                edge = graph.addEdge(parentId, node.id, {
                    id: edgeId,
                    data: edgeData,
                });
            }
        } catch (error) {
            graph.removeNode(node.id);
            return _agraphFail(diag,
                { code: "TREE_ADD_NODE_FAILED", raw: 'Could not add tree node "$id$" under parent "$parentId$": $error$', data: { id, parentId, error } },
                error,
            );
        }

        if (diag instanceof Adiag) diag.ok({ code: "TREE_ADD_NODE_OK", data: { id: node.id, parentId } });
        return { node, edge };
    }

    /**
     * Add a parent -> child edge
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ data?: object, id?: string|null, diag?: Adiag }} [options]
     * @returns {Aedge|null}
     */
    static addEdge(graph, srcId, dstId, { diag, ...options } = {}) {
        const canAdd = Atree.assertCanAddEdge(graph, srcId, dstId, { diag });
        if (canAdd === null) return null;
        return graph.addEdge(srcId, dstId, { ...options, diag });
    }

    /**
     * @param {Agraph} graph
     * @param {{ parentId?: string|null, id?: string|null, edgeId?: string|null, diag?: Adiag }} options
     * @returns {true|null}
     */
    static assertCanAddNode(graph, { parentId = null, id = null, edgeId = null, diag } = {}) {
        if (!(graph instanceof Agraph)) {
            return _agraphFail(diag,
                { code: "TREE_ADD_NODE_FAILED", raw: "Atree.assertCanAddNode: graph must be an Agraph instance", data: { id, parentId } },
                `Atree.assertCanAddNode: graph must be an Agraph instance`,
            );
        }

        if (id != null && graph.hasNode(id)) {
            return _agraphFail(diag,
                { code: "TREE_ADD_NODE_FAILED", raw: 'Atree.addNode: node "$id$" already exists', data: { id, parentId } },
                `Atree.addNode: node "${id}" already exists`,
            );
        }
        if (edgeId != null && graph.hasEdge(edgeId)) {
            return _agraphFail(diag,
                { code: "TREE_ADD_NODE_FAILED", raw: 'Atree.addNode: edge "$edgeId$" already exists', data: { id, edgeId, parentId } },
                `Atree.addNode: edge "${edgeId}" already exists`,
            );
        }
        if (parentId != null && !graph.hasNode(parentId)) {
            return _agraphFail(diag,
                { code: "TREE_ADD_NODE_FAILED", raw: 'Atree.addNode: parent node "$parentId$" does not exist', data: { id, parentId } },
                `Atree.addNode: parent node "${parentId}" does not exist`,
            );
        }

        return true;
    }

    /**
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ diag?: Adiag }} [options]
     * @returns {true|null}
     */
    static assertCanAddEdge(graph, srcId, dstId, { diag } = {}) {
        if (!(graph instanceof Agraph)) {
            return _agraphFail(diag,
                { code: "TREE_ADD_EDGE_FAILED", raw: "Atree.assertCanAddEdge: graph must be an Agraph instance", data: { srcId, dstId } },
                `Atree.assertCanAddEdge: graph must be an Agraph instance`,
            );
        }

        if (srcId == null) {
            return _agraphFail(diag,
                { code: "TREE_ADD_EDGE_FAILED", raw: "Atree.addEdge: srcId is required", data: { srcId, dstId } },
                `Atree.addEdge: srcId is required`,
            );
        }
        if (dstId == null) {
            return _agraphFail(diag,
                { code: "TREE_ADD_EDGE_FAILED", raw: "Atree.addEdge: dstId is required", data: { srcId, dstId } },
                `Atree.addEdge: dstId is required`,
            );
        }

        if (!graph.hasNode(srcId)) {
            return _agraphFail(diag,
                { code: "TREE_ADD_EDGE_FAILED", raw: 'Atree.addEdge: source node "$srcId$" does not exist', data: { srcId, dstId } },
                `Atree.addEdge: source node "${srcId}" does not exist`,
            );
        }
        if (!graph.hasNode(dstId)) {
            return _agraphFail(diag,
                { code: "TREE_ADD_EDGE_FAILED", raw: 'Atree.addEdge: destination node "$dstId$" does not exist', data: { srcId, dstId } },
                `Atree.addEdge: destination node "${dstId}" does not exist`,
            );
        }

        if (srcId === dstId) {
            return _agraphFail(diag,
                { code: "TREE_ADD_EDGE_FAILED", raw: 'Atree.addEdge: node "$srcId$" cannot be its own parent', data: { srcId, dstId } },
                `Atree.addEdge: node "${srcId}" cannot be its own parent`,
            );
        }
        if (graph.inDegree(dstId) > 0) {
            return _agraphFail(diag,
                { code: "TREE_ADD_EDGE_FAILED", raw: 'Atree.addEdge: child node "$dstId$" already has a parent', data: { srcId, dstId } },
                `Atree.addEdge: child node "${dstId}" already has a parent`,
            );
        }

        if (_agraphWouldCreateCycle(graph, srcId, dstId)) {
            return _agraphFail(diag,
                { code: "TREE_ADD_EDGE_FAILED", raw: 'Atree.addEdge: edge "$srcId$" -> "$dstId$" would create a cycle', data: { srcId, dstId } },
                `Atree.addEdge: edge "${srcId}" -> "${dstId}" would create a cycle`,
            );
        }

        return true;
    }

    /**
     * @param {Agraph} graph
     * @param {string} nodeId
     * @param {{ diag?: Adiag }} [options]
     * @returns {Aedge|null}
     */
    static parentEdgeOf(graph, nodeId, { diag } = {}) {
        Atree.#assertNode(graph, nodeId, "Atree.parentEdgeOf");

        const parentEdges = graph.inEdges(nodeId);
        if (parentEdges.length > 1) {
            return _agraphFail(diag,
                { code: "PARENT_EDGE_FAILED", raw: 'Atree.parentEdgeOf: node "$nodeId$" has multiple parent edges', data: { nodeId } },
                `Atree.parentEdgeOf: node "${nodeId}" has multiple parent edges`,
            );
        }

        return parentEdges[0] ?? null;
    }

    /** @param {Agraph} graph @param {string} nodeId @returns {Anode|null} */
    static parentOf(graph, nodeId) {
        const edge = Atree.parentEdgeOf(graph, nodeId);
        return edge ? graph.getNode(edge.srcId) : null;
    }

    /** @param {Agraph} graph @param {string} nodeId @returns {Aedge[]} */
    static childEdgesOf(graph, nodeId) {
        Atree.#assertNode(graph, nodeId, "Atree.childEdgesOf");
        return graph.outEdges(nodeId);
    }

    /** @param {Agraph} graph @param {string} nodeId @returns {Anode[]} */
    static childrenOf(graph, nodeId) {
        return Atree.childEdgesOf(graph, nodeId)
            .map(edge => graph.getNode(edge.dstId))
            .filter(Boolean);
    }

    /**
     * Validate the graph as a tree or forest
     * @param {Agraph} graph
     * @param {{ allowForest?: boolean, diag?: Adiag }} options
     * @returns {true|null}
     */
    static assertTree(graph, { allowForest = true, diag } = {}) {
        if (!(graph instanceof Agraph)) {
            return _agraphFail(diag,
                { code: "TREE_ASSERT_FAILED", raw: "Atree.assertTree: graph must be an Agraph instance", data: {} },
                `Atree.assertTree: graph must be an Agraph instance`,
            );
        }

        const dagOk = Adag.assertDag(graph, { diag });
        if (dagOk === null) return null;

        for (const node of graph.getNodes()) {
            if (graph.inDegree(node.id) > 1) {
                return _agraphFail(diag,
                    { code: "TREE_ASSERT_FAILED", raw: 'Graph "$label$" is not a tree: node "$nodeId$" has multiple parents', data: { label: graph.label, nodeId: node.id } },
                    `Atree.assertTree: node "${node.id}" has multiple parents`,
                );
            }
        }

        if (!allowForest) {
            const roots = graph.roots();
            if (roots.length !== 1) {
                return _agraphFail(diag,
                    { code: "TREE_ASSERT_FAILED", raw: 'Graph "$label$" is not a tree: expected exactly one root, got $rootCount$', data: { label: graph.label, rootCount: roots.length } },
                    `Atree.assertTree: expected exactly one root, got ${roots.length}`,
                );
            }
        }

        if (diag instanceof Adiag) diag.ok({ code: "TREE_ASSERT_OK", data: { label: graph.label } });
        return true;
    }

    static #assertNode(graph, nodeId, method) {
        if (!(graph instanceof Agraph)) {
            throw new TypeError(`${method}: graph must be an Agraph instance`);
        }
        if (!graph.hasNode(nodeId)) {
            throw new Error(`${method}: node "${nodeId}" does not exist`);
        }
    }
}


function uniqueById() {
    const seen = new Set();
    return node => {
        if (seen.has(node.id)) return false;
        seen.add(node.id);
        return true;
    };
}

function _agraphWouldCreateCycle(graph, srcId, dstId) {
    if (srcId === dstId) return true;
    return graph.hasPath(dstId, srcId);
}

// If diag is an Adiag, write an err and return null. Otherwise throw/rethrow
function _agraphFail(diag, { code, raw, data }, error) {
    if (diag instanceof Adiag) {
        diag.err({ code, raw, data });
        return null;
    }

    if (error instanceof Error || error instanceof TypeError) throw error;
    throw new Error(error);
}