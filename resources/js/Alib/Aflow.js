/* Aflow
By Asciiz

A execution flow system built on top of Agraph

*/

import { Agraph } from "./Agraph.js";

export class Afcmd {
    fstaticValid = true;

    constructor(data = {}) {
        this.data = data;
    }

    exec({ state, graph, link }) {}
    destroy({ node, graph }) {}
}

export class Afstatic {
    constructor(nodes = [], flow = []) {
        this.nodes = nodes; // Layer 1: Unique mutable node objects
        this.flow = flow;   // Layer 2: Execution sequence [{ payload, link }]
    }

    run({ state } = {}) {
        for (const { payload, link } of this.flow) {
            for (const cmd of payload) {
                cmd.exec({ state, graph: null, link });
            }
        }
        return state;
    }
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
            data: { 
                enabled: true,
                order: 0,
                ...data
            }
        });
    }

    removeNode(id) {
        return this.graph.removeNode(id);
    }

    makeStatic(from) {
        const root = this.graph.getNode(from);
        if (!root) return new Afstatic();

        const uniqueNodes = new Map(); // originalId -> newNodeRef
        const flowSequence = [];
        
        const getNewNode = (originalNode) => {
            if (uniqueNodes.has(originalNode.id)) return uniqueNodes.get(originalNode.id);

            // Check static validity and copy components
            const payload = (originalNode.data ?? []).map(cmd => {
                if (cmd.fstaticValid === false) {
                    throw new Error(`Aflow.makeStatic: Component in node ${originalNode.id} is not static-valid`);
                }
                // Copy component instance
                const copy = Object.create(Object.getPrototypeOf(cmd));
                Object.assign(copy, cmd);
                return copy;
            });

            const newNode = {
                id: originalNode.id,
                data: payload
            };
            
            uniqueNodes.set(originalNode.id, newNode);
            return newNode;
        };

        const stack = [{ 
            path: new Set(), 
            link: { data: {}, src: null, dst: root } 
        }];

        while (stack.length > 0) {
            const { path, link } = stack.pop();
            const originalNode = link.dst;

            if (path.has(originalNode.id)) throw new Error(`Aflow: Cycle detected at ${originalNode.id}`);
            
            const newNode = getNewNode(originalNode);
            const newSrc = link.src ? getNewNode(link.src) : null;
            
            // Record execution entry with path-specific link and shared mutable node
            flowSequence.push({
                payload: newNode.data,
                link: {
                    data: { ...(link.data ?? {}) },
                    src: newSrc,
                    dst: newNode
                }
            });

            const outEdges = this.graph.outEdges(originalNode.id)
                .filter(e => e.data.enabled !== false)
                .sort((a, b) => b.data.order - a.data.order);

            const nextPath = new Set(path);
            nextPath.add(originalNode.id);

            for (const edge of outEdges) {
                const dstNode = this.graph.getNode(edge.dstId);
                if (!dstNode) continue;
                
                stack.push({ 
                    path: nextPath,
                    link: {
                        data: edge.data,
                        src: originalNode,
                        dst: dstNode
                    }
                });
            }
        }

        return new Afstatic(Array.from(uniqueNodes.values()), flowSequence);
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
