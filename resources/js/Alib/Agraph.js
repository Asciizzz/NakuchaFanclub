/* Agraph
By Asciiz

Tiny directed graph. Stores topology only; traversal is your job
*/

export class Anode {
    #id;

    /** @param {string} id @param {object} [data={}] */
    constructor(id, data = {}) {
        this.#id = id;
        this.data = data;
    }

    /** @returns {string} */
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

    /** @returns {string} */
    get id()    { return this.#id; }
    /** @returns {string} */
    get srcId() { return this.#srcId; }
    /** @returns {string} */
    get dstId() { return this.#dstId; }
}

export class Agraph {
    static OUT  = "out";
    static IN   = "in";
    static BOTH = "both";

    static SELF    = "self";
    static UNKNOWN = "unknown";

    /** @param {{ label?: string }} [options] - Prefix for auto IDs */
    constructor({ label = "" } = {}) {
        this.label = label;

        this.nodes = new Map();    // nodeId -> Anode
        this.edges = new Map();    // edgeId -> Aedge

        this.outgoing = new Map(); // nodeId -> Set(edgeId)
        this.incoming = new Map(); // nodeId -> Set(edgeId)

        this._nextNodeId = 0;
        this._nextEdgeId = 0;
    }

    /** @returns {string} */
    makeNodeId() { return `${this.label}_n${this._nextNodeId++}`; }
    /** @returns {string} */
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

    /** @returns {Anode[]} */
    getNodes() { return [...this.nodes.values()]; }

    /** @type {number} */
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
        this.assertDirection(direction);
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

    /**
     * @param {string} nodeId
     * @returns {Aedge[]}
     */
    outEdges(nodeId) { return this.edgesOf({ nodeId, direction: Agraph.OUT }); }

    /**
     * @param {string} nodeId
     * @returns {Aedge[]}
     */
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
        this.assertDirection(direction);
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

    /**
     * @param {string} nodeId
     * @returns {Anode[]}
     */
    successors(nodeId)   { return this.neighborsOf({ nodeId, direction: Agraph.OUT }); }

    /**
     * @param {string} nodeId
     * @returns {Anode[]}
     */
    predecessors(nodeId) { return this.neighborsOf({ nodeId, direction: Agraph.IN }); }


    // Degree

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

    /** @param {function(Aedge): void} fn */
    forEachEdge(fn) {
        for (const edge of this.edges.values()) fn(edge);
    }

    /** @param {function(Anode): boolean} fn @returns {Anode[]} */
    filterNodes(fn) {
        const result = [];
        for (const node of this.nodes.values()) {
            if (fn(node)) result.push(node);
        }
        return result;
    }

    /** @param {function(Aedge): boolean} fn @returns {Aedge[]} */
    filterEdges(fn) {
        const result = [];
        for (const edge of this.edges.values()) {
            if (fn(edge)) result.push(edge);
        }
        return result;
    }

    /** @param {function(Anode): *} fn @returns {Array<*>} */
    mapNodeData(fn) {
        const result = [];
        for (const node of this.nodes.values()) result.push(fn(node));
        return result;
    }

    /** @param {function(Aedge): *} fn @returns {Array<*>} */
    mapEdgeData(fn) {
        const result = [];
        for (const edge of this.edges.values()) result.push(fn(edge));
        return result;
    }


    // Graph-level queries

    /** @returns {Anode[]} Nodes with no incoming edges */
    roots() {
        return this.filterNodes(node => this.inDegree(node.id) === 0);
    }

    /** @returns {Anode[]} Nodes with no outgoing edges */
    leaves() {
        return this.filterNodes(node => this.outDegree(node.id) === 0);
    }

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