import { Ares } from "./Ares.js";

/* Agraph
By Asciiz

Tiny directed graph. Stores topology only; traversal is your job. tryX returns Aok or Aerr. Underlying errors live in data.error when useful.
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

        this.outgoing = new Map(); // nodeId -> Set(edgeId)
        this.incoming = new Map(); // nodeId -> Set(edgeId)

        this._nextNodeId = 0;
        this._nextEdgeId = 0;
    }

    makeNodeId() { return `${this.label}_n${this._nextNodeId++}`; }
    makeEdgeId() { return `${this.label}_e${this._nextEdgeId++}`; }

    // Nodes

    /**
     * Add node. `id` is optional; dupe IDs throw
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
        this.outgoing.set(nodeId, new Set());
        this.incoming.set(nodeId, new Set());

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
     * Add edge: `srcId -> dstId`. Missing nodes / dupe IDs throw
     * @param {{ srcId: string, dstId: string, data?: object, id?: string|null }} options
     * @returns {Aedge}
     */
    addEdge({ srcId, dstId, data = {}, id = null } = {}) {
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
        this.outgoing.get(srcId).add(edgeId);
        this.incoming.get(dstId).add(edgeId);

        return edge;
    }

    tryAddEdge(options = {}) {
        return _agraphAresTry({
            src: "Agraph.tryAddEdge",
            code: "ADD_EDGE_FAILED",
            raw: 'Could not add edge "$srcId$" -> "$dstId$": $error$',
            data: options,
            fn: () => this.addEdge(options),
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

        this.outgoing.get(edge.srcId)?.delete(id);
        this.incoming.get(edge.dstId)?.delete(id);
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

    /** @param {"out"|"in"|"both"} direction */
    assertDirection(direction) {
        if (direction !== Agraph.OUT &&
            direction !== Agraph.IN  &&
            direction !== Agraph.BOTH) {
            throw new Error(`Agraph: invalid direction "${direction}" -- expected Agraph.OUT, Agraph.IN, or Agraph.BOTH`);
        }
    }



    // Edge queries

    /**
     * Edges touching `nodeId`, filtered by direction. Missing node => `[]`
     * @param {{ nodeId: string, direction?: "out"|"in"|"both" }} options
     * @returns {Aedge[]}
     */
    edgesOf({ nodeId, direction = Agraph.OUT } = {}) {
        if (!Agraph.isDirection(direction)) return [];
        if (!this.nodes.has(nodeId)) return [];

        if (direction === Agraph.OUT) {
            return this.#edgesFromIdSet(this.outgoing.get(nodeId));
        }

        if (direction === Agraph.IN) {
            return this.#edgesFromIdSet(this.incoming.get(nodeId));
        }

        const edgeIds = new Set([
            ...this.outgoing.get(nodeId),
            ...this.incoming.get(nodeId)
        ]);

        return this.#edgesFromIdSet(edgeIds);
    }


    /** @param {string} nodeId @returns {Aedge[]} */
    outEdges(nodeId) { return this.edgesOf({ nodeId, direction: Agraph.OUT }); }
    /** @param {string} nodeId @returns {Aedge[]} */
    inEdges(nodeId) { return this.edgesOf({ nodeId, direction: Agraph.IN }); }

    /**
     * Edges from `srcId` to `dstId` only. Missing node => `[]`
     * @param {{ srcId: string, dstId: string }} options
     * @returns {Aedge[]}
     */
    edgesBetween({ srcId, dstId } = {}) {
        if (!this.nodes.has(srcId) || !this.nodes.has(dstId)) return [];

        const result = [];
        for (const edge of this.outEdges(srcId)) {
            if (edge.dstId === dstId) result.push(edge);
        }
        return result;
    }


    /**
     * Edges between `a` and `b`, both ways. Missing node => `[]`
     * @param {{ a: string, b: string }} options
     * @returns {Aedge[]}
     */
    edgesConnecting({ a, b } = {}) {
        if (!this.nodes.has(a) || !this.nodes.has(b)) return [];

        const edgeIds = new Set();
        for (const edge of this.edgesBetween({ srcId: a, dstId: b })) edgeIds.add(edge.id);
        for (const edge of this.edgesBetween({ srcId: b, dstId: a })) edgeIds.add(edge.id);

        return this.#edgesFromIdSet(edgeIds);
    }



    // Connection / neighbor queries

    /**
     * Neighbor links with resolved nodes + dir tag
     * @param {{ nodeId: string, direction?: "out"|"in"|"both" }} options
     * @returns {Array<{ from: Anode, to: Anode, edge: Aedge, dir: string }>}
     */
    connectionsOf({ nodeId, direction = Agraph.OUT } = {}) {
        if (!Agraph.isDirection(direction)) return [];
        if (!this.nodes.has(nodeId)) return [];

        const node  = this.getNode(nodeId);
        const edges = this.edgesOf({ nodeId, direction });

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
     * @param {{ nodeId: string, direction?: "out"|"in"|"both" }} options
     * @returns {Anode[]}
     */
    neighborsOf({ nodeId, direction = Agraph.OUT } = {}) {
        return this.connectionsOf({ nodeId, direction })
            .map(c => c.to)
            .filter(uniqueById());
    }


    /** @param {string} nodeId @returns {Anode[]} */
    successors(nodeId)   { return this.neighborsOf({ nodeId, direction: Agraph.OUT }); }
    /** @param {string} nodeId @returns {Anode[]} */
    predecessors(nodeId) { return this.neighborsOf({ nodeId, direction: Agraph.IN }); }

    /** Total degree; self-loop counts once. @param {string} nodeId @returns {number} */
    degree(nodeId)    { return this.edgesOf({ nodeId, direction: Agraph.BOTH }).length; }
    /** @param {string} nodeId @returns {number} */
    outDegree(nodeId) { return this.outgoing.get(nodeId)?.size ?? 0; }
    /** @param {string} nodeId @returns {number} */
    inDegree(nodeId)  { return this.incoming.get(nodeId)?.size ?? 0; }

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
     * @param {{ srcId: string, dstId: string }} options
     * @returns {boolean}
     */
    hasPath({ srcId, dstId } = {}) {
        if (!this.nodes.has(srcId) || !this.nodes.has(dstId)) return false;
        if (srcId === dstId) return true;

        const visited = new Set();
        const queue   = [srcId];

        while (queue.length > 0) {
            const current = queue.shift();
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
        while (queue.length > 0) {
            const id = queue.shift();
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

    /** @param {string[]} nodeIds @returns {Agraph} Subgraph with those nodes + inner edges */
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
                sub.addEdge({
                    id:    edge.id,
                    srcId: edge.srcId,
                    dstId: edge.dstId,
                    data:  structuredClone(edge.data)
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

    /** @returns {Agraph} Deep clone via `structuredClone` */
    clone() {
        const g = new Agraph({ label: this.label });
        g._nextNodeId = this._nextNodeId;
        g._nextEdgeId = this._nextEdgeId;

        for (const node of this.nodes.values()) {
            g.addNode({ id: node.id, data: structuredClone(node.data) });
        }

        for (const edge of this.edges.values()) {
            g.addEdge({
                id:    edge.id,
                srcId: edge.srcId,
                dstId: edge.dstId,
                data:  structuredClone(edge.data)
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
                this.addEdge({
                    id:    edge.id,
                    srcId: edge.srcId,
                    dstId: edge.dstId,
                    data:  structuredClone(edge.data)
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
            g.addEdge({ id: edge.id, srcId: edge.srcId, dstId: edge.dstId, data: edge.data });
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



    #edgesFromIdSet(ids) {
        if (!ids) return [];

        const result = [];
        for (const id of ids) {
            const edge = this.edges.get(id);
            if (edge) result.push(edge);
        }
        return result;
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