# Wr Rework Spec (World + Assets)

## Scope

This rework is focused on `World` and asset/component structure only.

Goals:

- Remove scattered free-function style from core flow.
- Move asset and runtime responsibility into focused classes (`Mesh`, `Skeleton`, etc).
- Cut default behavior aggressively.
- Cut defensive runtime checks that are only needed for external/untrusted data.

Non-goal:

- Keep compatibility with every current helper/export.

## Main Problems (Current)

- Logic is split across many utility-style modules (`WorldRuntime`, `MeshPacking`, loader helpers, asset store helpers).
- Too many optional fallbacks and defaults in hot paths.
- Components are treated as generic bags even though they are world-context objects.
- Runtime does repeated shape/type checking for data that should already be validated at creation/load time.
- Asset system is map-of-plain-objects; behavior is detached from data.

## Hard Rules For Rework

1. Class-first design for World-facing and asset-facing behavior.
2. Only one meaningful default: shared white texture.
3. No hidden auto-defaults for camera, shader, render cfg, transform, skeleton, morph, etc.
4. Validation happens at boundaries only:
5. Boundary A: loader parse/ingest.
6. Boundary B: explicit constructor/factory calls.
7. Frame/update/render paths should not re-validate numeric structure repeatedly.
8. No exported helper clutter for internals that only World uses.

## Target Class Model

## Core

- `WrWorld extends Azt.Ctx`
- `WrRenderer` (or backend bridge owned by `WrWorld`)
- `WrAssets` (owned by `WrWorld`)

## Assets

- `WrTexture`
- `WrMaterial`
- `WrShader`
- `WrMesh`
- `WrSkeleton`

Each asset class owns both data and behavior. Plain object assets should be removed from public flow.

## Components (Node-attached)

- `WrTransform`
- `WrMeshInstance`
- `WrSkeletonPose`

Components are class instances attached directly to node fields (`node.transform`, `node.mesh`, etc).

## Responsibility Split

`WrWorld`:

- node graph ownership
- branch traversal entry
- update and render orchestration
- model load + branch construction

`WrAssets`:

- registry maps by id
- create/register/get for typed asset instances
- no scene branch ownership

`WrMesh`:

- CPU mesh payload (`submeshes`, morph metadata, material refs)
- backend GPU cache for itself (by backend instance/key)
- upload/update lifecycle

`WrSkeleton`:

- bind/inverse bind definitions
- bone lookup map
- pose/palette helpers

`WrShader`:

- dual source (WGSL/GLSL)
- linkage metadata
- render state config baked with shader registration
- backend-specific pipeline cache ownership

## GPU Ownership Rule

GPU data should live with owning asset, not in detached global helper maps.

Example:

- `WrMesh` holds `gpuByBackend: Map<string, WrMeshGpuState>`
- `WrShader` holds `pipelineByBackend: Map<string, WrShaderPipelineState>`
- `WrTexture` holds `gpuByBackend: Map<string, WrTextureGpuState>`

Backends receive typed asset instances and ask assets for prepared GPU state.

## Defaults Policy

Allowed default:

- Global shared white texture (`WrTexture.White`).

Disallowed defaults:

- auto camera
- auto shader selection
- auto render cfg
- auto transform injection for random nodes
- auto skeleton/morph fallback injection

If required objects are missing, fail fast at call boundary (`throw`) or skip draw with one clear warning in dev mode.

## Validation Policy

Do this once:

- loader ingest (`GLB -> typed asset instances`)
- explicit constructors/factories (`new WrMesh(...)`, `new WrSkeleton(...)`)

Do not do this every frame:

- repeated matrix length checks in traversal/render loops
- repeated component shape checks when component class already guarantees shape

## API Simplification (World)

Keep `WrWorld` API small and explicit:

1. `init()`
2. `setCamera(camera)` (required before render)
3. `registerShader(shader)`
4. `loadModelFromURL(url)` -> returns branch root node
5. `addNode(parentId, index?)`
6. `moveNode(id, parentId)`
7. `deleteNode(id, branch?)`
8. `copyBranch(fromId, toId?)`
9. `traverse({ from })`
10. `update(dt, { from })`
11. `render({ from })`

No giant option bags that silently fill missing values.

## File Reorganization

Target structure:

- `Core/World.js`
- `Core/Components.js`
- `Core/Renderer.js`
- `Assets/WrAssets.js`
- `Assets/WrTexture.js`
- `Assets/WrMaterial.js`
- `Assets/WrShader.js`
- `Assets/WrMesh.js`
- `Assets/WrSkeleton.js`
- `Loaders/GLBLoader.js` (outputs typed asset constructors, not plain maps)
- `Backends/WGPUBackend.js`
- `Backends/WGLBackend.js`

Merge or remove these as standalone utility surfaces:

- `Core/WorldRuntime.js`
- `Core/MeshPacking.js`
- `Assets/AssetStore.js`
- `Assets/AssetTypes.js`

Their behavior should be moved into class methods.

## Loader Contract (New)

`loadModelFromURL()` pipeline:

1. Parse GLB.
2. Build typed assets (`WrTexture`, `WrMaterial`, `WrMesh`, `WrSkeleton`).
3. Register assets in `WrAssets`.
4. Build branch nodes with typed components (`WrTransform`, `WrMeshInstance`, `WrSkeletonPose`).
5. Return branch root node.

No detached "scene payload object" clone pipeline.

## Render Path (Lean)

1. Traverse branch from `from`.
2. Update transforms using `WrTransform` instances only.
3. Collect draw items directly from `WrMeshInstance`.
4. Resolve shader + render state from `WrShader`.
5. Ask asset objects to prepare/upload GPU state as needed.
6. Submit via backend.

No runtime binding injection on plain object components.

## Migration Plan

Phase 1:

- Introduce typed asset classes and `WrAssets`.
- Keep old API shim for one transition pass.

Phase 2:

- Move `WorldRuntime` responsibilities into component/asset methods.
- Remove repeated runtime validators in frame path.

Phase 3:

- Remove old store/helpers (`AssetStore`, `AssetTypes`, packing helpers).
- Keep only class-based flow.

Phase 4:

- Delete compatibility shim and freeze new API.

## Done Criteria

- World/asset/component code path is class-based and not helper-scattered.
- White texture is the only implicit default.
- Frame path has no repeated structural validation noise.
- Mesh/Skeleton/Shader own their GPU/runtime behavior directly.
- `WrWorld` public API is smaller and explicit.
