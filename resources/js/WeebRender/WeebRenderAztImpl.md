# WeebRender Azt World Migration (Wr)

## Goal

- Remove standalone `WrScene`
- Use one `WrWorld` that extends `Azt.Ctx`
- Keep one shared node map (`Ctx.nodes`) for all loaded branches
- Keep `roots` (plural) only as reference ids, not traversal control

## Branch-First World Model

- `Scene` is no longer a core concept in Wr
- `World` is a single shared node graph with many independent branches
- Any node with `parentId == null` is a branch root
- Branches can be built manually by adding nodes/components directly on nodes
- Branches can be permanently composed with `moveNode` (attach branch to another branch)
- Branches can be instantiated with `copyBranch`
- Traversal is node-entry based:
  - starting from a branch root updates/renders the full branch
  - starting from any interior node updates/renders only that sub-branch
- This avoids multi-scene map/cross-link complexity because all nodes live in one `Ctx`

## Azt API Baseline

- `Azt.Ctx`: `addNode`, `getNode`, `moveNode`, `swapNodes`, `deleteNode`, `traverse`
- `Azt.Node`: `ctx`, `id`, `parentId`, `childIds`, `parent`, `children`, `traverse`, `swapChildrenOrder`
- Components/payload are direct properties on `Node` objects
- No component container API (`get/has/set`) in Wr; use direct assignment (`node.transform = ...`)

## New Core Type

- Add `Core/World.js`
- `class WrWorld extends Azt.Ctx`
- `WrWorld` owns backend + assets + node graph

`WrWorld` fields:

- `canvas`
- `backend`
- `assets` (`WrAssetStore`)
- `camera`
- `defaultShaderId`
- `defaultRenderCfg`
- `roots: string[]` (reference ids only)

## WrWorld Methods

- `init(options)`
- `mount(target)`
- `unmount()`
- `resize(width, height)`
- `fitContainer()`
- `registerShader(shaderId, shaderDesc, renderCfg)`
- `loadModelFromURL(url, options)` -> returns branch root node (`Azt.Node`)
- `copyBranch(fromId, toId)` -> returns copied branch root node (`Azt.Node|null`)
- `update(deltaTime, options)`
- `render()` (pipeline/module-baked state; no per-call state object)
- `destroy()`

## Ctx Override Contract (Same API Names)

WrWorld keeps the same public method names as `Ctx` and calls `super` first:

- `addNode(parentId, index)` -> `super.addNode(...)`, then maintain `roots`
- `moveNode(id, newParentId)` -> `super.moveNode(...)`, then maintain `roots`
- `deleteNode(id, branch)` -> `super.deleteNode(...)`, then maintain `roots`
- `swapNodes(idA, idB)` -> `super.swapNodes(...)`, roots unchanged unless a node becomes/drops root through other ops

`roots` maintenance rule:

- node with `parentId == null` should exist in `roots`
- node with `parentId != null` should not exist in `roots`
- `roots` is metadata/reference only

## Node-Oriented Traverse Contract

- `loadModelFromURL` returns a branch root node
- Caller traverses through that node (`for (const node of branchRoot.traverse(...))`)
- `World.traverse` extends `Ctx.traverse` to inject Wr runtime logic (transform propagation, render sorting hints, batching hints)
- `World.traverse` should not auto-run every id in `roots`
- If `from` is missing, return no nodes (same explicit-start behavior as `Ctx`)

Behavior intent:

- branch root traversal = full "scene-like" update/render for that branch
- arbitrary node traversal = partial branch update/render for sub-graph workflows

## loadModelFromURL Flow

1. `payload = await wrLoadGLB(url)`
2. `sceneData = this.assets.addFromLoader(payload)` for mesh/material/texture data
3. Clone source hierarchy into world nodes with `addNode(parentMappedId, index)`
4. Copy source payload into each node using direct fields:
   - `node.name`
   - `node.transform`
   - `node.meshRenderer`
   - any custom user fields
5. Build source->target id remap
6. Rebind id-based references after clone:
   - skeleton/root node links
   - skin joint node ids
   - any component field that stores node id references
7. Add resulting root id into `roots`
8. Set root node `name` to loaded model name
9. Return root node

Notes:

- Rebinding is runtime-only; no extra side registry required
- No special root naming helper logic required

## copyBranch(fromId, toId)

Purpose:

- Duplicate a full branch and remap all internal node-id references
- Attach copied branch under `toId` (or keep detached root when `toId` is null)

Flow:

1. Resolve `fromNode = getNode(fromId)` and optional `toNode = getNode(toId)`
2. Traverse source branch from `fromId`
3. For each source node:
   - create target node via `addNode(mappedParentId, index)`
   - copy direct payload fields onto target node
   - record `idRemap[sourceId] = targetId`
4. Second pass: remap copied node references using `idRemap`
5. If `toId` exists, reparent copied root with `moveNode(copiedRootId, toId)`
6. Update `roots` based on final copied root parent state
7. Return copied root node or `null` on failure

## Runtime / Queue Refactor

- Replace scene-array assumptions with traversal from an explicit branch root
- Expected helpers:
  - `bindNodePayload(world, node)`
  - `updateBranchTransforms(world, { from })`
  - `collectRenderableNodes(world, { from })`
- `WrRenderQueue.build(...)` should consume node traversal output, not `scene.nodes`

## File Changes

- Add:
  - `Core/World.js`
- Remove/deprecate:
  - `Core/Scene.js`
  - `Core/Node.js` (WrNode facade)
- Refactor:
  - `Core/SceneRuntime.js` -> world/node traversal helpers
  - `Core/RenderQueue.js` -> branch-root traversal input
  - `Core/Asset.js` -> keep thin store helper or fold into `World`
  - `index.js` exports -> export `WrWorld`, drop `WrScene`/`WrNode`

## Minimal Migration Sequence

1. Add `WrWorld extends Azt.Ctx` with backend/asset ownership
2. Move model loading into `WrWorld.loadModelFromURL`
3. Implement `roots` reference tracking via `addNode/moveNode/deleteNode` overrides
4. Implement `copyBranch(fromId, toId)` with id remap pass
5. Switch runtime + queue to explicit node-root traversal
6. Remove scene wrappers from exports
