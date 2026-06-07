/* Agraph
By Asciiz

Generic directed graph structure (can be used without directness)

- Stores topology
- Does not own traversal policy
- YOU decide how/when/where to traverse, whether to revisit nodes.
- Traversal can be finite, random, weighted, filtered, cyclic, etc. sky's the limit
*/

export class Agraph {
    static OUT = "out";
    static IN = "in";
    static BOTH = "both";

    static SELF = "self";
    static UNKNOWN = "unknown";

    constructor({ label = "" } = {}) {
        this.label = label;

        this.nodes = new Map();    // nodeId -> { id, data }
        this.edges = new Map();    // edgeId -> { id, src, dst, data }

        this.outgoing = new Map(); // nodeId -> Set(edgeId)
        this.incoming = new Map(); // nodeId -> Set(edgeId)

        this._nextNodeId = 0;
        this._nextEdgeId = 0;
    }

    makeNodeId() { return `${this.label}_n${this._nextNodeId++}`; }
    makeEdgeId() { return `${this.label}_e${this._nextEdgeId++}`; }

    addNode({ data, id = null } = {}) {
        const nodeId = id ?? this.makeNodeId();

        if (nodeId == null) return null;
        if (this.nodes.has(nodeId)) return null;

        const node = { id: nodeId, data };

        this.nodes.set(nodeId, node);
        this.outgoing.set(nodeId, new Set());
        this.incoming.set(nodeId, new Set());

        return node;
    }

    getNode(id) { return this.nodes.get(id) ?? null; }
    hasNode(id) { return this.nodes.has(id); }

    removeNode(id) {
        const node = this.nodes.get(id);
        if (!node) return null;

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


    addEdge({ srcId, dstId, data, id = null } = {}) {
        const edgeId = id ?? this.makeEdgeId();
        if (edgeId == null) return null;

        if (srcId == null || dstId == null) return null;

        if (this.edges.has(edgeId)) return null;
        if (!this.nodes.has(srcId)) return null;
        if (!this.nodes.has(dstId)) return null;

        const edge = { id: edgeId, srcId, dstId, data };

        this.edges.set(edgeId, edge);
        this.outgoing.get(srcId).add(edgeId);
        this.incoming.get(dstId).add(edgeId);

        return edge;
    }

    // An alias for addEdge
    connect({ srcId, dstId, data, id = null } = {}) {
        return this.addEdge({ srcId, dstId, data, id });
    }

    getEdge(id) { return this.edges.get(id) ?? null; }
    hasEdge(id) { return this.edges.has(id); }

    removeEdge(id) {
        const edge = this.edges.get(id);
        if (!edge) return null;

        this.outgoing.get(edge.srcId)?.delete(id);
        this.incoming.get(edge.dstId)?.delete(id);
        this.edges.delete(id);

        return edge;
    }

    // Invalid direction -> You're fcked
    assertDirection(direction) {
        if (direction !== Agraph.OUT &&
            direction !== Agraph.IN &&
            direction !== Agraph.BOTH) {
            throw new Error(`Invalid direction: ${direction}`);
        }
    }

    /**
     * Return edges touching a node from direction
     *
     * "out"  -> edges where nodeId is src
     * "in"   -> edges where nodeId is dst
     * "both" -> incoming + outgoing, deduped by edge id
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

    outEdges(nodeId) { return this.edgesOf({ nodeId, direction: Agraph.OUT }); }
    inEdges(nodeId) { return this.edgesOf({ nodeId, direction: Agraph.IN }); }


    /**
     * Return all possible connections from a node in the requested direction
     */
    connectionsOf({ nodeId, direction = Agraph.OUT } = {}) {
        this.assertDirection(direction);
        if (!this.nodes.has(nodeId)) return [];

        const node = this.getNode(nodeId);

        const edges = this.edgesOf({ nodeId, direction });

        const result = [];
        for (const edge of edges) {
            const dir =
                edge.srcId === edge.dstId ? Agraph.SELF :
                edge.srcId === nodeId ? Agraph.OUT :
                edge.dstId === nodeId ? Agraph.IN :
                Agraph.UNKNOWN;

            const otherNodeId = dir === Agraph.OUT ? edge.dstId : edge.srcId;
            result.push({ from: node, to: this.getNode(otherNodeId), edge, dir });
        }

        return result;
    }

    /**
     * Return unique neighboring nodes
     */
    neighborsOf({ nodeId, direction = Agraph.OUT } = {}) {
        return this.connectionsOf({ nodeId, direction })
            .map(connection => connection.to)
            .filter(uniqueByValue());
    }

    successors(nodeId) {
        return this.neighborsOf({ nodeId, direction: Agraph.OUT });
    }

    predecessors(nodeId) {
        return this.neighborsOf({ nodeId, direction: Agraph.IN });
    }


    edgesBetween({ srcId, dstId } = {}) {
        if (!this.nodes.has(srcId) || !this.nodes.has(dstId)) return [];

        const result = [];

        for (const edge of this.outEdges(srcId)) {
            if (edge.dstId === dstId) result.push(edge);
        }

        return result;
    }

    edgesConnecting({ a, b } = {}) {
        if (!this.nodes.has(a) || !this.nodes.has(b)) return [];

        const edgeIds = new Set();

        for (const edge of this.edgesBetween({ srcId: a, dstId: b })) edgeIds.add(edge.id);
        for (const edge of this.edgesBetween({ srcId: b, dstId: a })) edgeIds.add(edge.id);

        return this.#edgesFromIdSet(edgeIds);
    }


    degree(nodeId) { return this.edgesOf({ nodeId, direction: Agraph.BOTH }).length; }
    outDegree(nodeId) { return this.outgoing.get(nodeId)?.size ?? 0; }
    inDegree(nodeId) { return this.incoming.get(nodeId)?.size ?? 0; }


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

function uniqueByValue() {
    const seen = new Set();

    return value => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    };
}