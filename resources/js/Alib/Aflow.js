/* Aflow
By Asciiz

A execution flow system built on top of Agraph

*/


import { Agraph } from "./Agraph.js";

export class Afcmd {
    constructor(data = {}) {
        this.data = data;
    }

    exec({ state, graph, link }) {}
    destroy({ node, graph }) {}
}

export class Aflow {
    constructor(graph = new Agraph()) {
        this.graph = graph;
    }

    addNode({ payload = [], id = null } = {}) {
        return this.graph.addNode({ id, data: payload });
    }

    addLink({ srcId, dstId, data = {} } = {}) {
        const existing = this.graph.edgesBetween({ srcId, dstId });
        if (existing.length > 0) throw new Error(`Aflow: Duplicate link between ${srcId} and ${dstId}`);

        return this.graph.addEdge({
            srcId,
            dstId,
            data: { enabled: true, order: 0, ...data }
        });
    }

    removeNode(id) {
        return this.graph.removeNode(id);
    }

    run({ from, state = {} } = {}) {
        const rootNode = this.graph.getNode(from);
        if (!rootNode) return state;

        // Stack for traversal: [{ path, link: { data, src, dst } }]
        const stack = [{ 
            path: new Set(), 
            link: { data: {}, src: null, dst: rootNode } 
        }];

        while (stack.length > 0) {
            const { path, link } = stack.pop();
            const node = link.dst;

            if (path.has(node.id)) throw new Error(`Aflow: Cycle detected at ${node.id}`);
            
            // Run Components (Afcmd instances)
            for (const cmd of node.data ?? []) {
                if (cmd instanceof Afcmd) {
                    cmd.exec({ state, graph: this.graph, link });
                }
            }

            // Get and Sort Links
            const outEdges = this.graph.outEdges(node.id)
                .filter(e => e.data.enabled !== false)
                .sort((a, b) => b.data.order - a.data.order); // Reverse sort for stack popping

            // Validation: Unique src-dst pairs
            const seenDst = new Set();
            for (const edge of outEdges) {
                if (seenDst.has(edge.dstId)) {
                    throw new Error(`Aflow: Multiple edges found for pair ${node.id} -> ${edge.dstId}`);
                }
                seenDst.add(edge.dstId);
            }

            // Push children to stack
            const nextPath = new Set(path);
            nextPath.add(node.id);

            for (const edge of outEdges) {
                const dstNode = this.graph.getNode(edge.dstId);
                if (!dstNode) continue;

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

        return state;
    }
}
