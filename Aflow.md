# Aflow Implementation & Architectural Review

Aflow is an execution flow manager built on top of `Agraph`. It treats the graph as a series of instructions where nodes contain payloads of components, and edges define the sequence and conditions of execution.

## 1. Implementation Strategy

### Core Structure
`Aflow` will act as a wrapper/manager for an `Agraph` instance. It enforces a "Local Ruleset" on the graph during execution, even if the underlying `Agraph` allows more flexible (or even invalid) structures.

### Execution Model (RAAC)
- **AfCmd (Base Class):** All components should inherit from `AfCmd`.
    - `data`: Replaces the old `options` object; stores component configuration.
    - `exec({ state, graph, link })`: Core execution logic. `link` provides the incoming connection context `{ data, src, dst }`.
    - `destroy({ node, graph })`: Cleanup logic for external resources.
- **Node Payload:** Each node's `data` property is an array of `AfCmd` instances.
- **Flow Control (Iterative):**
    1. Utilize a **stack-based traversal** (non-recursive) to handle arbitrary depth.
    2. Retrieve outgoing links using `graph.outEdges(nodeId)`.
    3. **Enforce Uniqueness:** Ensure no two edges share the same `src -> dst` pair.
    4. **Sort:** Order links by `data.order`.
    5. **Branching:** Follow links where `data.enabled !== false`.
    6. **Revisitation:** Like `Adag`, nodes are executed every time they are reached via a valid path.
    7. **Link Context:** Each `exec` call receives a `link` object representing the edge that led to this node. `link.dst` provides a reference to the current node being executed. For root nodes, `link.src` is `null`.

### Constraint Enforcement
Since `Aflow` allows the graph to be "impure", constraints are checked **lazily** during `run()`:
- **Duplicate Edge Detection:** If `graph.outEdges(nodeId)` contains multiple edges to the same `dstId`, throw an error.
- **Cycle Detection:** While nodes can be revisited from *different* paths, a node cannot be reached if it is already in the **active path stack**.

---

## 2. Architectural Review

### The "Super Graph" Concept
**Pros:**
- **Extreme Flexibility:** Embed execution flow inside a larger heterogeneous graph (like a game scene).
- **Decoupled Rules:** `Agraph` is the topology; `Aflow` is the behavior.
- **Convergent Flow:** Supporting node revisitation allows for complex logic where multiple branches trigger the same sequence without duplicating the nodes.

**Cons/Risks:**
- **Performance:** Iterative depth-first execution with sorting and uniqueness checks on every node has a cost, though it's the most robust way to handle dynamic flow.
- **Cycle Complexity:** Detecting cycles in a "revisit-friendly" flow requires tracking the current path, not just a global "visited" set.

---

## 3. Proposed API (Aflow.js)

```javascript
import { Agraph } from "./Agraph.js";

export class AfCmd {
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
            
            // 1. Run Components (AfCmd instances)
            for (const cmd of node.data ?? []) {
                if (cmd instanceof AfCmd) {
                    cmd.exec({ state, graph: this.graph, link });
                }
            }

            // 2. Get and Sort Links
            const outEdges = this.graph.outEdges(node.id)
                .filter(e => e.data.enabled !== false)
                .sort((a, b) => b.data.order - a.data.order); // Reverse sort for stack popping

            // 3. Validation: Unique src-dst pairs
            const seenDst = new Set();
            for (const edge of outEdges) {
                if (seenDst.has(edge.dstId)) {
                    throw new Error(`Aflow: Multiple edges found for pair ${node.id} -> ${edge.dstId}`);
                }
                seenDst.add(edge.dstId);
            }

            // 4. Push children to stack
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
```
