# WeebGPU Implementation Levels

Date: 2026-05-15
Scope: `resources/js/**` only

## Goal
Replace legacy WeebGL runtime usage with a separate WeebGPU stack that:
- uses only `Azm.js` and `AzWGPU.js` as Az-level dependencies
- preserves ECS-style scene/object/component workflows
- splits legacy `ZShader` responsibilities into WebGPU-native render + compute shader paths
- ends with `resources/js/welcome/scene.js` running on WeebGPU with better CPU/GPU workload distribution

## Non-Negotiables
- No runtime dependency on `resources/js/WeebGL/*`.
- Keep global-style compatibility (`window.*`) so current script-style usage still works.
- Keep naming conventions:
  - `Az*`: core agnostic (`Azm`, `AzWGPU`)
  - `Z*`: engine specialization / important infra
  - `Ez*`: high-level scene/asset/project features

## Level 0 - Baseline + Safety Backup
Deliverables:
- Create/update `resources/js/welcome/scene.js.backup` from current `scene.js`.
- Record current scene behaviors to preserve:
  - pointer-lock camera move/look
  - GLB load (`/Models/Nakurin.glb`)
  - scene merge flow
  - custom `Nakurin` component driving skeleton head motion

Exit Criteria:
- `scene.js.backup` is a restorable snapshot.
- behavior checklist written in this file and used as migration validation.

## Level 1 - WeebGPU Core Runtime (No Scene Yet)
Files to create:
- `resources/js/WeebGPU/ZCanvasWGPU.js`
- `resources/js/WeebGPU/ZCamera.js`
- `resources/js/WeebGPU/ZRShader.js`
- `resources/js/WeebGPU/ZCShader.js`

What this level does:
- build WebGPU canvas/device/context lifecycle around `AzWGPU`
- implement resize + depth texture reallocation
- provide camera math with `Azm` (view/projection/forward/right/up)
- define render shader + compute shader wrappers (replacement direction for legacy `ZShader`)

Exit Criteria:
- a minimal render loop can clear + draw with a render pipeline
- render and compute shader wrappers can compile WGSL modules and report errors cleanly

## Level 2 - ECS Foundation (Renderer-Agnostic)
Files to create:
- `resources/js/WeebGPU/ZTree.js`
- `resources/js/WeebGPU/EzScene.js`

What this level does:
- implement tree + node/component system equivalent to WeebGL scene graph semantics
- keep canonical components:
  - `Transform`
  - `MeshRenderer`
  - `Skeleton`
  - `Custom`
- keep add/merge/remap/update behavior (including `__onSceneRemap`)

Exit Criteria:
- scene add/merge/update works without rendering
- custom component update path works and logs errors safely

## Level 3 - Loader + Asset Registry (GPU-Ready Data Model)
Files to create:
- `resources/js/WeebGPU/EzLoader.js`
- `resources/js/WeebGPU/EzAssets.js`

What this level does:
- port loader flow to produce WeebGPU-ready payloads (textures/materials/meshes/skeletons/scenes)
- keep GLB ingestion model from current loader logic
- asset registry owns CPU source data + GPU handles/buffers/textures/pipelines

Exit Criteria:
- `/Models/Nakurin.glb` loads into asset registry with stable IDs
- scene data can be instantiated as `EzScene` with runtime bindings

## Level 4 - Mesh Upload + Render Pipeline
Files to create:
- `resources/js/WeebGPU/EzMesh.js`
- `resources/js/WeebGPU/ZRenderGraph.js` (or equivalent render pass coordinator)

What this level does:
- create vertex/index/storage/uniform buffers in WebGPU
- material + texture bind groups
- batch draws by mesh + shader key
- move per-instance data to GPU buffers (replace per-draw WebGL uniform churn)

Exit Criteria:
- static mesh rendering path works for loaded scene content
- draw submission uses grouped passes with bounded bind-group churn

## Level 5 - Skinning + Morph + Shader Symbol Pipeline
Files to create/modify:
- `resources/js/WeebGPU/EzScene.js`
- `resources/js/WeebGPU/EzAssets.js`
- `resources/js/WeebGPU/ZRShader.js`
- `resources/js/WeebGPU/ZCShader.js`

What this level does:
- support skin palette and morph weights in WeebGPU pipeline
- support symbolic shader replacements currently used by `registerShader(...)`
- split shader logic:
  - render WGSL path for draw shading
  - optional compute WGSL path for pre-skinning/culling/animation prep

Exit Criteria:
- Nakurin skeleton animation path works (including `Nakurin.run`)
- morph + skin flags drive correct render behavior

## Level 6 - Project Orchestration API
Files to create:
- `resources/js/WeebGPU/EzProject.js`

What this level does:
- provide top-level API parity with current runtime shape:
  - mount/unmount/resize/fitContainer
  - `registerShader`, `loadModelFromURL`, `getScene`
  - scene runtime binding (assets/camera/device/context)

Exit Criteria:
- old scene bootstrap can be ported with small call-site changes

## Level 7 - Scene Migration + Performance Pass
Files to modify:
- `resources/js/welcome/scene.js` (new WeebGPU runtime)
- `resources/js/welcome/scene.js.backup` (kept as legacy snapshot)

What this level does:
- migrate behavior from backup scene to WeebGPU:
  - camera + pointer lock controls
  - model loading + scene merge
  - shader registration path
  - `Nakurin` custom component binding and update
- apply performance-first defaults:
  - persistent GPU buffers
  - batched draw submission
  - reduced per-frame CPU allocations
  - optional compute pre-pass for heavy animation/culling

Exit Criteria:
- `scene.js` runs the same gameplay/animation task as backup
- measured frame-time stability is improved under equivalent scene load

## Validation Checklist Per Level
- API surface documented at file top (public methods only).
- No references to `window.ZRender`, `window.ZShader`, `window.ZCanvas`, or other WeebGL-only runtime classes.
- No import/runtime dependency to `resources/js/WeebGL/*`.
- Keep all math through `Azm`.
- Keep all WebGPU setup and helpers through `AzWGPU`.

## Immediate Next Step
Start Level 0 -> Level 1 implementation in code, then checkpoint for review before entering Level 2.
