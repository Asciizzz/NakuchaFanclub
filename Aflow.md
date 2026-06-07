# Aflow Implementation & Architectural Review

Aflow is an execution flow manager built on top of `Agraph`. It treats the graph as a series of instructions where nodes contain payloads of components, and edges define the sequence and conditions of execution.

## 1. Implementation Strategy

### Core Structure
`Aflow` will act as a wrapper/manager for an `Agraph` instance. It enforces a "Local Ruleset" on the graph during execution, even if the underlying `Agraph` allows more flexible structures.

### Execution Model (RAAC)
- **AfCmd (Base Class):** All components should inherit from `AfCmd`.
    - `data`: Stores component configuration.
    - `fstaticValid`: Boolean (default true) indicating if the component can be used in an `Afstatic` snapshot.
    - `exec({ state, graph, link })`: Core execution logic. `link` provides the incoming connection context `{ data, src, dst }`.
    - `destroy({ node, graph })`: Cleanup logic for external resources.
- **Node Payload:** Each node's `data` property is an array of `AfCmd` instances.
- **Flow Control (Iterative):**
    1. Utilize a **stack-based traversal** (non-recursive) to handle arbitrary depth.
    2. Retrieve outgoing links using `graph.outEdges(nodeId)`.
    3. **Sort:** Order links by `data.order`.
    4. **Branching:** Follow links where `data.enabled !== false`.
    5. **Revisitation:** Like `Adag`, nodes are executed every time they are reached via a valid path.
    6. **Link Context:** Each `exec` call receives a `link` object representing the edge that led to this node. `link.dst` provides a reference to the current node being executed. For root nodes, `link.src` is `null`.

### Static Baking (Afstatic)
`Aflow` provides a `makeStatic(from)` method that generates an `Afstatic` object.
- **Flattened Flow:** The snapshot traverses the branch once and bakes the path into a linear sequence.
- **Independent Execution:** `Afstatic.run()` executes the baked list without referencing the original graph topology or link logic.
- **Multi-Edge Support:** Multiple links between the same node pair are fully supported. The destination node will be executed once for every incoming link, preserving the exact traversal order.
- **Integrity:** If a node contains a component with `fstaticValid === false`, `makeStatic` will throw an error.

### Constraint Enforcement
Since `Aflow` allows the graph to be "impure", constraints are checked **lazily** during `run()` or `makeStatic()`:
- **Cycle Detection:** While nodes can be revisited from *different* paths, a node cannot be reached if it is already in the **active path stack**.

---

## 2. Architectural Review

### The "Super Graph" Concept
**Pros:**
- **Extreme Flexibility:** Embed execution flow inside a larger heterogeneous graph.
- **Implicit Instancing**: Convergence (multiple links to one node) naturally creates multiple execution instances.
- **Multi-Link Interaction**: Allowing multiple edges per pair enables sophisticated node interactions and state injections.

**Cons/Risks:**
- **Performance:** Dynamic traversal has overhead.
- **Mitigation:** `Afstatic` snapshots eliminate this overhead by baking the graph into a flat array.

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

export class Afstatic {
    // ... (Layered node and flow sequence)
}

export class Aflow {
    // ... (Multi-link aware snapshot and run)
}
```
