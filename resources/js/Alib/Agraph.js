import { Ares } from "./Ares.js";

/* Agraph
By Asciiz

Tiny directed graph. Stores topology only; traversal is your job
tryX returns Aok or Aerr. Underlying errors live in data.error when useful
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
     * @param {{ data?: object, id?: string|null }} [options]
     * @returns {Anode}
     */
    addNode({ data = {}, id = null } = {}) {
        const nodeId = id ?? this.makeNodeId();

        if (this.nodes.has(nodeId)) {
            throw new Error(`Agraph.addNode: node "${nodeId}" already exists`);
        }

        const node = new Anode(nodeId, data);

        this.nodes.set(nodeId, node);
        this.outgoing.set(nodeId, []);
        this.incoming.set(nodeId, []);

        return node;
    }

    tryAddNode(options = {}) {
        return _agraphAresTry({
            src: "Agraph.tryAddNode",
            code: "ADD_NODE_FAILED",
            raw: 'Could not add node "$id$": $error$',
            data: options,
            fn: () => this.addNode(options),
        });
    }

    /** @param {string} id @returns {Anode|null} */
    getNode(id) { return this.nodes.get(id) ?? null; }
    /** @param {string} id @returns {boolean} */
    hasNode(id) { return this.nodes.has(id); }


    /** Remove node + its edges. @param {string} id @returns {Anode} */
    removeNode(id) {
        const node = this.nodes.get(id);

        if (!node) {
            throw new Error(`Agraph.removeNode: node "${id}" does not exist`);
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

        return node;
    }

    tryRemoveNode(id) {
        return _agraphAresTry({
            src: "Agraph.tryRemoveNode",
            code: "REMOVE_NODE_FAILED",
            raw: 'Could not remove node "$id$": $error$',
            data: { id },
            fn: () => this.removeNode(id),
        });
    }

    getNodes() { return [...this.nodes.values()]; }
    get nodeCount() { return this.nodes.size; }

    // Edges

    /**
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ data?: object, id?: string|null }} [options]
     * @returns {Aedge}
     */
    addEdge(srcId, dstId, { data = {}, id = null } = {}) {
        if (srcId == null) throw new Error(`Agraph.addEdge: srcId is required`);
        if (dstId == null) throw new Error(`Agraph.addEdge: dstId is required`);

        if (!this.nodes.has(srcId)) {
            throw new Error(`Agraph.addEdge: source node "${srcId}" does not exist`);
        }
        if (!this.nodes.has(dstId)) {
            throw new Error(`Agraph.addEdge: destination node "${dstId}" does not exist`);
        }

        const edgeId = id ?? this.makeEdgeId();

        if (this.edges.has(edgeId)) {
            throw new Error(`Agraph.addEdge: edge "${edgeId}" already exists`);
        }

        const edge = new Aedge(edgeId, srcId, dstId, data);

        this.edges.set(edgeId, edge);
        this.outgoing.get(srcId).push(edgeId);
        this.incoming.get(dstId).push(edgeId);

        return edge;
    }

    tryAddEdge(srcId, dstId, options = {}) {
        return _agraphAresTry({
            src: "Agraph.tryAddEdge",
            code: "ADD_EDGE_FAILED",
            raw: 'Could not add edge "$srcId$" -> "$dstId$": $error$',
            data: { srcId, dstId, ...options },
            fn: () => this.addEdge(srcId, dstId, options),
        });
    }

    /** @param {string} id @returns {Aedge|null} */
    getEdge(id) { return this.edges.get(id) ?? null; }

    /** @param {string} id @returns {boolean} */
    hasEdge(id) { return this.edges.has(id); }


    /** @param {string} id @returns {Aedge} */
    removeEdge(id) {
        const edge = this.edges.get(id);

        if (!edge) {
            throw new Error(`Agraph.removeEdge: edge "${id}" does not exist`);
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

        return edge;
    }

    tryRemoveEdge(id) {
        return _agraphAresTry({
            src: "Agraph.tryRemoveEdge",
            code: "REMOVE_EDGE_FAILED",
            raw: 'Could not remove edge "$id$": $error$',
            data: { id },
            fn: () => this.removeEdge(id),
        });
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

    /** @param {function(Anode): void} fn */
    forEachNode(fn) {
        for (const node of this.nodes.values()) fn(node);
    }

    tryForEachNode(fn) {
        return _agraphAresTry({
            src: "Agraph.tryForEachNode",
            code: "FOR_EACH_NODE_FAILED",
            raw: "Node callback failed: $error$",
            data: { fn },
            fn: () => this.forEachNode(fn),
        });
    }

    /** @param {function(Aedge): void} fn */
    forEachEdge(fn) {
        for (const edge of this.edges.values()) fn(edge);
    }

    tryForEachEdge(fn) {
        return _agraphAresTry({
            src: "Agraph.tryForEachEdge",
            code: "FOR_EACH_EDGE_FAILED",
            raw: "Edge callback failed: $error$",
            data: { fn },
            fn: () => this.forEachEdge(fn),
        });
    }

    /** @param {function(Anode): boolean} fn @returns {Anode[]} */
    filterNodes(fn) {
        const result = [];
        for (const node of this.nodes.values()) {
            if (fn(node)) result.push(node);
        }
        return result;
    }

    tryFilterNodes(fn) {
        return _agraphAresTry({
            src: "Agraph.tryFilterNodes",
            code: "FILTER_NODES_FAILED",
            raw: "Node filter callback failed: $error$",
            data: { fn },
            fn: () => this.filterNodes(fn),
        });
    }

    /** @param {function(Aedge): boolean} fn @returns {Aedge[]} */
    filterEdges(fn) {
        const result = [];
        for (const edge of this.edges.values()) {
            if (fn(edge)) result.push(edge);
        }
        return result;
    }

    tryFilterEdges(fn) {
        return _agraphAresTry({
            src: "Agraph.tryFilterEdges",
            code: "FILTER_EDGES_FAILED",
            raw: "Edge filter callback failed: $error$",
            data: { fn },
            fn: () => this.filterEdges(fn),
        });
    }

    /** @param {function(Anode): *} fn @returns {Array<*>} */
    mapNodeData(fn) {
        const result = [];
        for (const node of this.nodes.values()) result.push(fn(node));
        return result;
    }

    tryMapNodeData(fn) {
        return _agraphAresTry({
            src: "Agraph.tryMapNodeData",
            code: "MAP_NODE_DATA_FAILED",
            raw: "Node mapper callback failed: $error$",
            data: { fn },
            fn: () => this.mapNodeData(fn),
        });
    }

    /** @param {function(Aedge): *} fn @returns {Array<*>} */
    mapEdgeData(fn) {
        const result = [];
        for (const edge of this.edges.values()) result.push(fn(edge));
        return result;
    }

    tryMapEdgeData(fn) {
        return _agraphAresTry({
            src: "Agraph.tryMapEdgeData",
            code: "MAP_EDGE_DATA_FAILED",
            raw: "Edge mapper callback failed: $error$",
            data: { fn },
            fn: () => this.mapEdgeData(fn),
        });
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


    /** @returns {Anode[]} Topological order; cycles throw */
    topoSort() {
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
            throw new Error(`Agraph.topoSort: graph contains a cycle -- topological sort is not possible`);
        }

        return sorted;
    }

    tryTopoSort() {
        return _agraphAresTry({
            src: "Agraph.tryTopoSort",
            code: "TOPO_SORT_FAILED",
            raw: 'Could not topologically sort graph "$label$": $error$',
            data: { label: this.label },
            fn: () => this.topoSort(),
        });
    }


    // Subgraph / clone / merge

    /** @param {string[]} nodeIds @returns {Agraph} */
    subgraph(nodeIds) {
        const idSet = new Set(nodeIds);
        const sub   = new Agraph({ label: `${this.label}_sub` });

        for (const id of idSet) {
            const node = this.getNode(id);
            if (!node) throw new Error(`Agraph.subgraph: node "${id}" does not exist`);
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

        return sub;
    }

    trySubgraph(nodeIds) {
        return _agraphAresTry({
            src: "Agraph.trySubgraph",
            code: "SUBGRAPH_FAILED",
            raw: 'Could not create subgraph from nodes $nodeIds$: $error$',
            data: { nodeIds },
            fn: () => this.subgraph(nodeIds),
        });
    }

    /** @returns {Agraph} Deep clone via `structuredClone` (deep) */
    clone() {
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

        return g;
    }

    tryClone() {
        return _agraphAresTry({
            src: "Agraph.tryClone",
            code: "CLONE_FAILED",
            raw: 'Could not clone graph "$label$": $error$',
            data: { label: this.label },
            fn: () => this.clone(),
        });
    }

    /** @param {Agraph} otherGraph @returns {this} Merge in; skip dupes */
    mergeFrom(otherGraph) {
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

        return this;
    }

    tryMergeFrom(otherGraph) {
        return _agraphAresTry({
            src: "Agraph.tryMergeFrom",
            code: "MERGE_FROM_FAILED",
            raw: 'Could not merge graph "$otherLabel$" into "$label$": $error$',
            data: { label: this.label, otherLabel: otherGraph?.label, otherGraph },
            fn: () => this.mergeFrom(otherGraph),
        });
    }


    // Serialization

    /** @returns {string} JSON; only node/edge data survives */
    serialize() {
        return JSON.stringify({
            label:        this.label,
            _nextNodeId:  this._nextNodeId,
            _nextEdgeId:  this._nextEdgeId,
            nodes: [...this.nodes.values()].map(n => ({ id: n.id, data: n.data })),
            edges: [...this.edges.values()].map(e => ({ id: e.id, srcId: e.srcId, dstId: e.dstId, data: e.data })),
        });
    }

    trySerialize() {
        return _agraphAresTry({
            src: "Agraph.trySerialize",
            code: "SERIALIZE_FAILED",
            raw: 'Could not serialize graph "$label$": $error$',
            data: { label: this.label },
            fn: () => this.serialize(),
        });
    }

    /** @param {string} json @returns {Agraph} */
    static deserialize(json) {
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

        return g;
    }

    static tryDeserialize(json) {
        return _agraphAresTry({
            src: "Agraph.tryDeserialize",
            code: "DESERIALIZE_FAILED",
            raw: 'Could not deserialize graph JSON: $error$',
            data: { json },
            fn: () => Agraph.deserialize(json),
        });
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

    /**
     * In-place sort the outgoing edges of a node
     * @param {string} nodeId
     * @param {function(Aedge, Aedge, Anode, Agraph): number} sortFn
     */
    sortOutgoingEdges(nodeId, sortFn) {
        if (typeof sortFn !== "function") {
            throw new Error(`Agraph.sortOutgoingEdges: sortFn must be a function`);
        }
        const edgeIds = this.outgoing.get(nodeId);
        if (!edgeIds) return;
        const node = this.getNode(nodeId);
        edgeIds.sort((idA, idB) => {
            const a = this.edges.get(idA);
            const b = this.edges.get(idB);
            return sortFn(a, b, node, this);
        });
    }

    trySortOutgoingEdges(nodeId, sortFn) {
        return _agraphAresTry({
            src: "Agraph.trySortOutgoingEdges",
            code: "SORT_OUTGOING_EDGES_FAILED",
            raw: 'Could not sort outgoing edges of node "$nodeId$": $error$',
            data: { nodeId, sortFn },
            fn: () => this.sortOutgoingEdges(nodeId, sortFn),
        });
    }

    /**
     * In-place sort the incoming edges of a node
     * @param {string} nodeId
     * @param {function(Aedge, Aedge, Anode, Agraph): number} sortFn
     */
    sortIncomingEdges(nodeId, sortFn) {
        if (typeof sortFn !== "function") {
            throw new Error(`Agraph.sortIncomingEdges: sortFn must be a function`);
        }
        const edgeIds = this.incoming.get(nodeId);
        if (!edgeIds) return;
        const node = this.getNode(nodeId);
        edgeIds.sort((idA, idB) => {
            const a = this.edges.get(idA);
            const b = this.edges.get(idB);
            return sortFn(a, b, node, this);
        });
    }

    trySortIncomingEdges(nodeId, sortFn) {
        return _agraphAresTry({
            src: "Agraph.trySortIncomingEdges",
            code: "SORT_INCOMING_EDGES_FAILED",
            raw: 'Could not sort incoming edges of node "$nodeId$": $error$',
            data: { nodeId, sortFn },
            fn: () => this.sortIncomingEdges(nodeId, sortFn),
        });
    }
}

// ==================== Directed acyclic graph rules =====================

export class Adag {
    /**
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ data?: object, id?: string|null }} [options]
     * @returns {Aedge}
     */
    static addEdge(graph, srcId, dstId, options = {}) {
        Adag.assertCanAddEdge(graph, srcId, dstId);
        return graph.addEdge(srcId, dstId, options);
    }

    static tryAddEdge(graph, srcId, dstId, options = {}) {
        return _agraphAresTry({
            src: "Adag.tryAddEdge",
            code: "DAG_ADD_EDGE_FAILED",
            raw: 'Could not add DAG edge "$srcId$" -> "$dstId$": $error$',
            data: { srcId, dstId, ...options },
            fn: () => Adag.addEdge(graph, srcId, dstId, options),
        });
    }

    /**
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @returns {true}
     */
    static assertCanAddEdge(graph, srcId, dstId) {
        _agraphAssertGraph(graph, "Adag.assertCanAddEdge");
        _agraphAssertEdgeEndpointIds("Adag.addEdge", srcId, dstId);
        _agraphAssertEdgeEndpointNodes(graph, "Adag.addEdge", srcId, dstId);

        if (_agraphWouldCreateCycle(graph, srcId, dstId)) {
            throw new Error(`Adag.addEdge: edge "${srcId}" -> "${dstId}" would create a cycle`);
        }

        return true;
    }

    /**
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @returns {boolean}
     */
    static wouldCreateCycle(graph, srcId, dstId) {
        _agraphAssertGraph(graph, "Adag.wouldCreateCycle");
        _agraphAssertEdgeEndpointIds("Adag.wouldCreateCycle", srcId, dstId);
        _agraphAssertEdgeEndpointNodes(graph, "Adag.wouldCreateCycle", srcId, dstId);

        return _agraphWouldCreateCycle(graph, srcId, dstId);
    }

    /** @param {Agraph} graph @returns {boolean} */
    static hasCycle(graph) {
        _agraphAssertGraph(graph, "Adag.hasCycle");

        try {
            graph.topoSort();
            return false;
        } catch {
            return true;
        }
    }

    /** @param {Agraph} graph @returns {true} */
    static assertDag(graph) {
        _agraphAssertGraph(graph, "Adag.assertDag");
        graph.topoSort();
        return true;
    }

    static tryAssertDag(graph) {
        return _agraphAresTry({
            src: "Adag.tryAssertDag",
            code: "DAG_ASSERT_FAILED",
            raw: 'Graph "$label$" is not a DAG: $error$',
            data: { label: graph?.label, graph },
            fn: () => Adag.assertDag(graph),
        });
    }
}

// ==================== Tree / forest rules over Agraph =====================

export class Atree {
    /**
     * Add a tree node and optionally attach it to a parent with an edge
     * @param {Agraph} graph
     * @param {{ parentId?: string|null, data?: object, edgeData?: object, id?: string|null, edgeId?: string|null }} options
     * @returns {{ node: Anode, edge: Aedge|null }}
     */
    static addNode(graph, {
        parentId = null,
        data = {},
        edgeData = {},
        id = null,
        edgeId = null,
    } = {}) {
        Atree.assertCanAddNode(graph, { parentId, id, edgeId });

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
            throw error;
        }

        return { node, edge };
    }

    static tryAddNode(graph, options = {}) {
        return _agraphAresTry({
            src: "Atree.tryAddNode",
            code: "TREE_ADD_NODE_FAILED",
            raw: 'Could not add tree node "$id$" under parent "$parentId$": $error$',
            data: options,
            fn: () => Atree.addNode(graph, options),
        });
    }

    /**
     * Add a parent -> child edge
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @param {{ data?: object, id?: string|null }} [options]
     * @returns {Aedge}
     */
    static addEdge(graph, srcId, dstId, options = {}) {
        Atree.assertCanAddEdge(graph, srcId, dstId);
        return graph.addEdge(srcId, dstId, options);
    }

    static tryAddEdge(graph, srcId, dstId, options = {}) {
        return _agraphAresTry({
            src: "Atree.tryAddEdge",
            code: "TREE_ADD_EDGE_FAILED",
            raw: 'Could not add tree edge "$srcId$" -> "$dstId$": $error$',
            data: { srcId, dstId, ...options },
            fn: () => Atree.addEdge(graph, srcId, dstId, options),
        });
    }

    /**
     * @param {Agraph} graph
     * @param {{ parentId?: string|null, id?: string|null, edgeId?: string|null }} options
     * @returns {true}
     */
    static assertCanAddNode(graph, { parentId = null, id = null, edgeId = null } = {}) {
        _agraphAssertGraph(graph, "Atree.assertCanAddNode");

        if (id != null && graph.hasNode(id)) {
            throw new Error(`Atree.addNode: node "${id}" already exists`);
        }
        if (edgeId != null && graph.hasEdge(edgeId)) {
            throw new Error(`Atree.addNode: edge "${edgeId}" already exists`);
        }
        if (parentId != null && !graph.hasNode(parentId)) {
            throw new Error(`Atree.addNode: parent node "${parentId}" does not exist`);
        }

        return true;
    }

    /**
     * @param {Agraph} graph
     * @param {string} srcId
     * @param {string} dstId
     * @returns {true}
     */
    static assertCanAddEdge(graph, srcId, dstId) {
        _agraphAssertGraph(graph, "Atree.assertCanAddEdge");
        _agraphAssertEdgeEndpointIds("Atree.addEdge", srcId, dstId);
        _agraphAssertEdgeEndpointNodes(graph, "Atree.addEdge", srcId, dstId);

        if (srcId === dstId) {
            throw new Error(`Atree.addEdge: node "${srcId}" cannot be its own parent`);
        }
        if (graph.inDegree(dstId) > 0) {
            throw new Error(`Atree.addEdge: child node "${dstId}" already has a parent`);
        }

        if (_agraphWouldCreateCycle(graph, srcId, dstId)) {
            throw new Error(`Atree.addEdge: edge "${srcId}" -> "${dstId}" would create a cycle`);
        }

        return true;
    }

    /** @param {Agraph} graph @param {string} nodeId @returns {Aedge|null} */
    static parentEdgeOf(graph, nodeId) {
        Atree.#assertNode(graph, nodeId, "Atree.parentEdgeOf");

        const parentEdges = graph.inEdges(nodeId);
        if (parentEdges.length > 1) {
            throw new Error(`Atree.parentEdgeOf: node "${nodeId}" has multiple parent edges`);
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
     * @param {{ allowForest?: boolean }} options
     * @returns {true}
     */
    static assertTree(graph, { allowForest = true } = {}) {
        _agraphAssertGraph(graph, "Atree.assertTree");
        Adag.assertDag(graph);

        for (const node of graph.getNodes()) {
            if (graph.inDegree(node.id) > 1) {
                throw new Error(`Atree.assertTree: node "${node.id}" has multiple parents`);
            }
        }

        if (!allowForest) {
            const roots = graph.roots();
            if (roots.length !== 1) {
                throw new Error(`Atree.assertTree: expected exactly one root, got ${roots.length}`);
            }
        }

        return true;
    }

    static tryAssertTree(graph, options = {}) {
        return _agraphAresTry({
            src: "Atree.tryAssertTree",
            code: "TREE_ASSERT_FAILED",
            raw: 'Graph "$label$" is not a tree: $error$',
            data: { ...options, label: graph?.label, graph },
            fn: () => Atree.assertTree(graph, options),
        });
    }

    static #assertNode(graph, nodeId, method) {
        _agraphAssertGraph(graph, method);
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

function _agraphAssertGraph(graph, method) {
    if (!(graph instanceof Agraph)) {
        throw new TypeError(`${method}: graph must be an Agraph instance`);
    }
}

function _agraphAssertEdgeEndpointIds(method, srcId, dstId) {
    if (srcId == null) throw new Error(`${method}: srcId is required`);
    if (dstId == null) throw new Error(`${method}: dstId is required`);
}

function _agraphAssertEdgeEndpointNodes(graph, method, srcId, dstId) {
    if (!graph.hasNode(srcId)) {
        throw new Error(`${method}: source node "${srcId}" does not exist`);
    }
    if (!graph.hasNode(dstId)) {
        throw new Error(`${method}: destination node "${dstId}" does not exist`);
    }
}

function _agraphWouldCreateCycle(graph, srcId, dstId) {
    if (srcId === dstId) return true;
    return graph.hasPath(dstId, srcId);
}

function _agraphAresTry({ src, code, raw = "$error$", data = null, fn }) {
    try {
        return Ares.ok(fn());
    } catch (error) {
        const baseData = data && typeof data === "object" ? data : { data };
        return Ares.err({
            src,
            code,
            raw,
            data: { ...baseData, error },
        });
    }
}
