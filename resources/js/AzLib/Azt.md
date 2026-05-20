# Azt Namespace Tree Spec

## Scope

- target module: `resources/js/AzLib/Azt.js`
- export shape:
  - `export class Node`
  - `export class Tree`
  - `export const Azt = { Node, Tree }`

## Kept API

Tree:

1. `add(parent, index)`
2. `get(id)`
3. `move(id, newParentId)`
4. `delete(id, branch=false)`
5. `traverse(options)`

Node:

1. `add(index)` -> `this.$.add(this.id, index)`
2. `move(newParentId)` -> `this.$.move(this.id, newParentId)`
3. `remove(key)` removes one custom key from the node

## Node Data

Public fields:

1. `$` owner tree ref
2. `id` immutable intent (do not mutate after add)
3. `parentId`
4. `childIds`

Useful getters:

1. `get parent()`
2. `get children()`

No component API in core. Data extension is direct injection.

## Delete Semantics

`Tree.delete(id, branch=false)` has 2 modes:

1. single mode (`branch=false`, default):
   - delete only the target node
   - reparent its children to target parent (rescue parent)
2. branch mode (`branch=true`):
   - delete target node and all descendants

No throw; invalid id returns `null`.

## Usage

```js
import Azt from "./Azt.js";

const scene = new Azt.Tree();

const root = scene.add(null, -1);
root.name = "Root";

const child = root.add();
child.health = 100;
child.mesh = { key: "hero" };

child.move(null);
const removed = child.remove("mesh");
console.log(removed);

scene.delete(child.id, false); // single
scene.delete(root.id, true); // branch

for (const node of scene.traverse({ mode: "dfs_pre" })) {
	console.log(node.id, node.parentId);
}
```
