# Wr Implementation Spec

## Scope

- Replace the current `WeebGL` runtime with `Wr`.
- Support two graphics backends:
  - `AzWGPU` (preferred)
  - `AzWGL` (fallback)
- Integrate `Azm` and `AzCamera` as the math/camera baseline.
- Keep scene update/render orchestration inside project code (backend only executes draw/dispatch operations).
- Keep mesh/texture/material/skeleton payloads backend-agnostic as raw data.
- Define a dual-language shader authoring system (WGSL + GLSL) with fixed templates and shared `$KEY$` placeholders.

---

## Goals

1. One runtime API for both WebGPU and WebGL2.
2. WebGPU-first backend selection with safe automatic fallback.
3. Internal engine data model that does not depend on backend API types.
4. Deterministic scene update and render flow in engine core.
5. Predictable shader authoring contract across both backends.

## Non-Goals

1. Exact feature parity for compute workloads on WebGL (impossible).
2. Hiding backend limits completely (must expose capability reports).
3. Replacing `AzWGPU` or `AzWGL` internals.

---

## Wr Style Baseline (AIsign Applied)

These rules apply to Wr code, comments, and docs in this project.

1. Keep naming direct and concrete.
2. Use stable prefixes for Wr internals (`wr`, `Wr*`).
3. Use short comments that explain constraints, not marketing language.
4. Prefer measurable wording over abstract claims.
5. Keep text ASCII-friendly in code comments and avoid decorative symbols.

Example:

- good: `wrVertexStride = 76`
- bad: `transformativeVertexBridge`

---

## Core Library Usage

- `Azm`:
  - vector/matrix/quaternion math
  - transform composition/decomposition
  - camera-space movement helpers
- `AzCamera`:
  - view/projection model
  - orientation and ray generation
- `AzWGPU`:
  - adapter/device/context lifecycle
  - pipeline/shader/buffer/texture/bind-group utilities
  - optional timer/resource pool/layout cache helpers
- `AzWGL`:
  - WebGL2 context/shader/buffer/texture/pipeline helpers
  - extension and capability inspection
  - timer/readback/framebuffer utilities

---

## Target Architecture

## 1) Runtime Layers

1. `WrCore` (backend-agnostic)
  - project lifecycle
  - scene graph update
  - culling/sorting/batching policy
  - render packet building
2. `WrAssets` (backend-agnostic CPU data registry)
  - textures/materials/meshes/skeletons/scenes/shaders
  - raw payload ownership + IDs
3. `WrBackend` interface
  - the contract every backend must implement
4. `WrBackendWGPU`
  - `AzWGPU` implementation
5. `WrBackendWGL`
  - `AzWGL` implementation

## 2) Recommended Module Split

- `resources/js/Wr/Core/Project.js`
- `resources/js/Wr/Core/SceneRuntime.js`
- `resources/js/Wr/Core/RenderQueue.js`
- `resources/js/Wr/Core/ShaderTemplate.js`
- `resources/js/Wr/Assets/AssetStore.js`
- `resources/js/Wr/Assets/AssetTypes.js`
- `resources/js/Wr/Backends/BackendBase.js`
- `resources/js/Wr/Backends/WGPUBackend.js`
- `resources/js/Wr/Backends/WGLBackend.js`
- `resources/js/Wr/Compat/WeebGLAliases.js` (temporary migration shim)

---

## Backend Selection (WebGPU-First)

## Selection Rules

1. If `navigator.gpu` exists and adapter/device creation succeeds, choose WebGPU.
2. If WebGPU is unavailable or initialization fails, choose WebGL2.
3. If both are unavailable, throw a boot-time error with full diagnostics.
4. Keep a capability report and fallback reason in runtime state.

## Selection Inputs

- Browser API support (`navigator.gpu`, `canvas.getContext("webgl2")`)
- Adapter/device limits (`AzWGPU.Limits.inspect/require`)
- Optional required features (project-level)
- OS/browser quirks surfaced by `Adapter.pickBest` policy

## Pseudocode

```js
async function chooseBackend(canvas, options) {
  const report = { preferred: "webgpu", chosen: null, reason: null, details: {} };

  if (globalThis.navigator?.gpu) {
    try {
      const pick = await AzWGPU.Adapter.pickBest(options.pickBest ?? {});
      const device = await AzWGPU.Device.create(pick.adapter, options.device ?? {});
      report.chosen = "webgpu";
      report.details.webgpu = { score: pick.score, request: pick.request };
      return { backend: new WrBackendWGPU(canvas, device, options), report };
    } catch (error) {
      report.details.webgpuError = String(error?.message ?? error);
    }
  }

  try {
    const gl = AzWGL.Context.create(canvas, options.webgl ?? {});
    report.chosen = "webgl2";
    report.reason = report.details.webgpuError ? "webgpu_failed_fallback_webgl2" : "webgpu_unavailable";
    return { backend: new WrBackendWGL(canvas, gl, options), report };
  } catch (error) {
    report.details.webglError = String(error?.message ?? error);
    throw new Error("[Wr] No supported backend: " + JSON.stringify(report));
  }
}
```

---

## Unified Internal Data Model

All core asset entries stay CPU/raw and backend-neutral.

## Asset Registry Shape

1. `TextureAsset`
  - `id`, `name`
  - source bytes/bitmap, size, format intent, wrap/filter intent
2. `MaterialAsset`
  - `id`, `name`
  - scalar/vector params
  - texture bindings by semantic (`albedo`, `normal`, etc.)
3. `MeshAsset`
  - `id`, `name`
  - vertex streams, index data
  - optional skin and morph metadata
  - submesh list with material references
4. `SkeletonAsset`
  - `id`, `bones`, inverse bind data
5. `SceneAsset`
  - node hierarchy and component payloads
6. `ShaderAsset`
  - WGSL module strings
  - GLSL module strings
  - resolved template metadata

## Backend Resource Caches

Each backend keeps GPU objects in backend-private caches keyed by asset ID and version:

- WebGPU: `GPUBuffer`, `GPUTexture`, `GPUSampler`, `GPURenderPipeline`, `GPUBindGroup`
- WebGL: `WebGLBuffer`, `WebGLTexture`, `WebGLProgram`, `WebGLVertexArrayObject`

Core code never touches these backend-native handles directly.

---

## Backend Contract

Each backend must implement the same engine contract.

```ts
interface WrBackend {
  kind: "webgpu" | "webgl2";
  init(initOptions): Promise<void>;
  resize(width: number, height: number): void;
  beginFrame(frameCtx): void;
  uploadOrUpdateAsset(assetRef): void;
  createOrUpdateShader(shaderRef): void;
  executeRenderQueue(queue, frameCtx): void;
  endFrame(frameCtx): void;
  destroy(): void;
  getCapabilities(): object;
}
```

Engine core responsibilities:

- scene transforms
- component updates
- draw list ordering
- material parameter resolve
- shader variant resolve

Backend responsibilities:

- translate render packets into API commands
- manage GPU resource lifetime
- own synchronization/copy rules

---

## Scene and Render Flow

Frame pipeline should be fixed and backend-agnostic:

1. `Project.update(dt)`
  - user/game update callbacks
  - scene component updates
2. `SceneRuntime.updateTransforms()`
3. `RenderQueue.build(scene, camera)`
  - culling
  - sort keys
  - render packets
4. `Backend.beginFrame()`
5. `Backend.executeRenderQueue()`
6. `Backend.endFrame()`

This keeps logic deterministic while backend implementation details stay isolated.

---

## Shader Authoring Contract (Dual WGSL/GLSL)

This section is strict because data mismatch bugs are expensive.

## Required Modules

Each shader asset contains both language variants:

1. Vertex WGSL
2. Vertex GLSL
3. Fragment WGSL
4. Fragment GLSL

If one required module is missing, registration fails.

## Entry Points and IO

1. WGSL vertex entry: `wr_vs_main`
2. WGSL fragment entry: `wr_fs_main`
3. GLSL vertex entry: `main`
4. GLSL fragment entry: `main`
5. Engine controls fixed location contracts. Shader text must follow those locations.

## Shared `$KEY$` Template Set (v1)

- `$POSITION$`
- `$NORMAL$`
- `$UV$`
- `$TANGENT$`
- `$BONE_ID$`
- `$BONE_WEIGHT$`
- `$MORPH_POS$`
- `$MORPH_WEIGHT$`
- `$INST_MODEL$`
- `$INST_DATA0$`
- `$INST_DATA1$`
- `$INST_DATA2$`
- `$INST_DATA3$`
- `$VIEW$`
- `$PROJECTION$`
- `$SKIN_PALETTE$`
- `$VTX_FLAGS$`
- `$HAS_RIG$`
- `$HAS_MORPH$`
- `$ALBEDO_TEX$`
- `$ALBEDO_COLOR$`
- `$OUT_COLOR$`

Rules:

1. Unknown key is a hard error.
2. Key in wrong stage is a hard error.
3. Required key missing for selected feature set is a hard error.

## Link Channels (Vertex -> Fragment)

Use named link declarations instead of hard-coded slot keys.

```js
links: [
  { name: "worldNormal", type: "vec3f" },
  { name: "worldPos", type: "vec3f" },
]
```

Rules:

1. `name` must be a valid identifier.
2. `type` can be WGSL (`vec3f`) or GLSL (`vec3`), Wr auto-resolves the pair.
3. Wr injects matching varyings in both shader languages.
4. The name is available in both `vertexMain` and `fragmentMain`.
5. You can still use `$LINK0$..$LINK7$` during migration, but only when links are declared.

## Vertex ABI Contract (v1)

Default interleaved vertex layout:

| Semantic | WGSL Location | GLSL Location | Format | Offset (bytes) | Size (bytes) |
| --- | --- | --- | --- | --- | --- |
| position | `@location(0)` | `layout(location=0)` | `float32x3` | 0 | 12 |
| normal | `@location(1)` | `layout(location=1)` | `float32x3` | 12 | 12 |
| uv | `@location(2)` | `layout(location=2)` | `float32x2` | 24 | 8 |
| boneID | `@location(3)` | `layout(location=3)` | `float32x4` | 32 | 16 |
| boneWeight | `@location(4)` | `layout(location=4)` | `float32x4` | 48 | 16 |
| morphPos | `@location(5)` | `layout(location=5)` | `float32x3` | 64 | 12 |

Stride: `76` bytes.

If future formats are added, they require explicit ABI version bump (`vertexAbiVersion`).

## Common Mismatch Cases

1. Wrong stride with correct offsets.
2. Correct stride but one offset drifted.
3. Type drift (`float32x4` vs `float32x3`).
4. Location mismatch between WGSL and GLSL variant.
5. Shader expects morph or skin data but mesh layout does not provide it.

## Uniform and Binding ABI (v1)

Cross-backend mapping:

| Logical Resource | WebGPU | WebGL2 |
| --- | --- | --- |
| Scene constants | `@group(0) @binding(0)` uniform buffer | UBO binding point `0` |
| Object constants | `@group(1) @binding(0)` uniform buffer | UBO binding point `1` |
| Sampler | `@group(1) @binding(1)` | texture unit `0` sampler uniform |
| Albedo texture | `@group(1) @binding(2)` | texture unit `0` texture uniform |

Use only `mat4` and `vec4` in shared blocks.

Do not place `vec3` or loose scalar fields directly in shared blocks.

Pack scalar/small values inside `vec4` lanes (`extras.x`, `extras.y`, etc).

## Canonical Block Layout (v1)

`SceneBlock`:

| Field | Type | Offset | Size |
| --- | --- | --- | --- |
| viewProj | `mat4` | 0 | 64 |
| cameraPos | `vec4` | 64 | 16 |

Total: `80` bytes.

`ObjectBlock`:

| Field | Type | Offset | Size |
| --- | --- | --- | --- |
| model | `mat4` | 0 | 64 |
| slot0 | `vec4` | 64 | 16 |
| albedoColor | `vec4` | 80 | 16 |
| vtxFlags | `vec4` | 96 | 16 |
| extras | `vec4` | 112 | 16 |
| skinPalette | `mat4[128]` | 128 | 8192 |

Total: `8320` bytes.

## Buffer Packing Example (Avoid Offset Drift)

```js
const OBJECT_BLOCK_BYTES = 8320;
const OBJECT_SKIN_OFFSET = 128;
const OBJECT_SKIN_STRIDE = 64; // mat4 per bone

function writeObjectBlock(outF32, src) {
  // mat4 model -> float index 0..15
  outF32.set(src.model, 0);

  // vec4 slot0 -> float index 16..19
  outF32.set(src.slot0, 16);

  // vec4 albedoColor -> float index 20..23
  outF32.set(src.albedoColor, 20);

  // vec4 vtxFlags -> float index 24..27
  outF32.set(src.vtxFlags, 24);

  // vec4 extras -> float index 28..31
  outF32.set(src.extras, 28);

  // skinPalette starts at byte 128 -> float index 32
  const base = OBJECT_SKIN_OFFSET >> 2;
  for (let i = 0; i < src.skinPalette.length; i++) {
    outF32.set(src.skinPalette[i], base + i * 16);
  }
}
```

## Vertex Layout Validation Example

```js
const WR_VERTEX_LAYOUT_V1 = {
  stride: 76,
  attributes: [
    { semantic: "position", location: 0, format: "float32x3", offset: 0 },
    { semantic: "normal", location: 1, format: "float32x3", offset: 12 },
    { semantic: "uv", location: 2, format: "float32x2", offset: 24 },
    { semantic: "boneID", location: 3, format: "float32x4", offset: 32 },
    { semantic: "boneWeight", location: 4, format: "float32x4", offset: 48 },
    { semantic: "morphPos", location: 5, format: "float32x3", offset: 64 },
  ],
};
```

Startup validation must check:

1. WebGL `MAX_UNIFORM_BLOCK_SIZE >= 8320`.
2. WebGPU required min uniform limits for block size and binding count.

If limit fails:

1. Reduce palette size for that shader variant.
2. Or split palette into another path.
3. Or disable skinning on that backend with explicit warning.

## Shader Compile and ABI Validation Pipeline

1. Parse shader asset.
2. Replace `$KEY$` placeholders.
3. Validate entry points and stage rules.
4. Build expected vertex signature from shader metadata.
5. Build mesh-provided vertex signature from mesh data.
6. Compare both signatures before pipeline creation.
7. Compile WGSL and GLSL variants.
8. Cache compiled variant with signature hash.

Signature compare pseudo-code:

```js
function compareVertexSignature(expected, provided) {
  if (expected.stride !== provided.stride) return fail("stride mismatch");
  for (const attr of expected.attributes) {
    const p = provided.bySemantic[attr.semantic];
    if (!p) return fail("missing attr: " + attr.semantic);
    if (p.format !== attr.format) return fail("format mismatch: " + attr.semantic);
    if (p.offset !== attr.offset) return fail("offset mismatch: " + attr.semantic);
    if (p.location !== attr.location) return fail("location mismatch: " + attr.semantic);
  }
  return ok();
}
```

On mismatch, error must print:

1. shader ID
2. backend kind
3. expected layout entry
4. provided layout entry
5. draw skipped flag

## Practical Authoring Rule

If shader behavior needs a new attribute or constant block change:

1. update ABI table
2. bump ABI version
3. regenerate both WGSL and GLSL template wrappers
4. re-run validation matrix on both backends

---

## WebGL Limitation Handling (Explicit)

WebGL2 limitations that cannot be bypassed:

1. No compute shader stage.
2. No storage buffer model equivalent to WebGPU `storage` bindings.
3. No native WebGPU-style bind-group system.
4. Feature spread depends heavily on extension availability.
5. Lower practical limits for buffer bindings/uniform data on weaker devices.

Required engine policy:

1. Any compute-dependent feature must declare a fallback path:
  - CPU path
  - render-pass emulation path
  - feature disabled path
2. Capability checks run at boot and when loading shader/pipeline variants.
3. Unsupported features fail with explicit diagnostics, never silent behavior changes.

---

## Migration Plan (WeebGL -> Wr)

## Phase 0: Rename and Compatibility

1. Create `resources/js/Wr/`.
2. Move or copy current WeebGL runtime into new structure.
3. Add temporary aliases so old imports still work while migrating.

## Phase 1: Core Extraction

1. Extract project/scene/assets into backend-agnostic core modules.
2. Remove direct WebGL object creation from core asset classes.

## Phase 2: Backend Adapters

1. Implement WebGPU backend using `AzWGPU`.
2. Implement WebGL backend using `AzWGL`.
3. Wire backend selection and capability reporting.

## Phase 3: Shader System

1. Implement template/key resolver.
2. Add dual-vertex-module validation (WGSL + GLSL).
3. Add per-backend compile cache and diagnostics.

## Phase 4: Scene Integration

1. Ensure existing `EzScene`-style component flow maps into render queue packets.
2. Integrate `AzCamera` and `Azm` math for all transform/camera operations.

## Phase 5: Verification

1. WebGPU preferred path test matrix.
2. WebGL fallback matrix.
3. Cross-backend visual parity checks for baseline materials/mesh skinning/morphing.
4. Capability and fallback reason logging verification.

---

## Runtime Diagnostics Requirements

At initialization, emit a structured report:

- selected backend
- attempted backend(s)
- failure reason(s) for skipped backend
- capability snapshot (limits/features/extensions)
- feature toggles enabled/disabled

This report should be queryable from project runtime and printable for debugging.

---

## Usage Examples (Target API)

The examples below define the expected developer-facing flow for `Wr`.

## Example 1: Boot + Auto Backend Selection

```js
import { WrProject } from "./Wr/Core/Project.js";
import { AzCamera } from "./AzLib/AzCamera.js";

const container = document.getElementById("main-canvas");
const project = new WrProject({
  canvas: { id: "main-canvas", alpha: true, maxPixelRatio: 2 },
  backend: {
    prefer: "webgpu", // engine still falls back to webgl2 automatically
    pickBest: {
      policy: { preferFallback: false },
    },
  },
});

await project.init();
project.mount(container).fitContainer();

const camera = new AzCamera({
  position: [0, 2, 5],
  near: 0.1,
  far: 500,
  fov: 45,
});
camera.lookAt([0, 1, 0]);
project.setCamera(camera);

console.log(project.runtimeReport.backend);
// Example:
// { preferred: "webgpu", chosen: "webgpu", reason: null, details: {...} }
```

## Example 2: Register Dual Shader + Baked RenderCfg

```js
project.registerShader("model-default", {
  vertexAbiVersion: 1,
  mode: "template",
  links: [
    { name: "worldNormal", type: "vec3f" }, // auto -> vec3 on GLSL
  ],
  renderCfg: {
    clearColor: [0.03, 0.05, 0.08, 1.0],
    clearDepth: 1.0,
    depthTest: true,
    depthWrite: true,
    cull: "back",
    blend: false,
  },
  vertex: {
    wgslMain: `
      worldNormal = normalize(($INST_MODEL$ * vec4f($NORMAL$, 0.0)).xyz);
      output.position = $VIEW$ * $INST_MODEL$ * vec4f($POSITION$, 1.0);
    `,
    glslMain: `
      worldNormal = normalize(($INST_MODEL$ * vec4($NORMAL$, 0.0)).xyz);
      gl_Position = $VIEW$ * $INST_MODEL$ * vec4($POSITION$, 1.0);
    `,
  },
  fragment: {
    wgslMain: `
      let lit = worldNormal * 0.5 + vec3f(0.5, 0.5, 0.5);
      $OUT_COLOR$ = vec4f(lit, 1.0) * $ALBEDO_COLOR$;
    `,
    glslMain: `
      vec3 lit = worldNormal * 0.5 + vec3(0.5, 0.5, 0.5);
      $OUT_COLOR$ = vec4(lit, 1.0) * $ALBEDO_COLOR$;
    `,
  },
});
```

## Example 3: Load a Model (GLB), Get Scene, Render It

```js
// Loader returns an internal scene asset ID
const sceneId = await project.loadModelFromURL("/Models/Nakurin.glb", {
  sceneName: "NakurinScene",
});

const scene = project.getScene(sceneId);
if (!scene) throw new Error("Scene load failed");

// Optional: find node(s) and assign shader/material overrides
for (const node of scene.findByComponent("MeshRenderer")) {
  const mr = node.get("MeshRenderer");
  mr.clearShaders().withShader("model-default");
}

project.useScene(scene);
```

## Example 4: Load a Full Scene Payload Instead of a Model

```js
const citySceneId = project.addScene({
  id: "CityScene",
  rootId: "Root",
  nodes: [
    {
      id: "Root",
      name: "Root",
      components: {
        Transform: { local: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
      },
    },
    {
      id: "HeroNode",
      name: "Hero",
      parent: "Root",
      components: {
        Transform: { local: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
        MeshRenderer: {
          meshID: "hero_mesh",
          shaderKeys: ["model-default"],
          skeletonNode: "HeroSkeletonNode",
        },
      },
    },
  ],
});

const cityScene = project.getScene(citySceneId);
project.useScene(cityScene);
```

## Example 5: Frame Loop (Update + Render)

```js
let last = performance.now();

function frame(now) {
  const dt = (now - last) * 0.001;
  last = now;

  // Game logic / animation systems
  project.update(dt);

  // Render active scene using selected backend
  project.render();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

## Example 6: Handle Backend-Specific Limits (Compute Feature)

```js
const caps = project.getCapabilities();

if (project.backendKind === "webgpu") {
  await project.runComputePass("particles-update");
} else {
  // WebGL path: CPU fallback or disabled feature path
  project.runParticlesCPUFallback();
}
```

---

## Test Matrix (Minimum)

1. Backend selection tests
  - WebGPU available -> selects WebGPU
  - WebGPU fails -> falls back to WebGL
  - both unavailable -> boot error
2. Shader template tests
  - valid key replacement WGSL/GLSL
  - unknown key rejection
  - missing required key rejection
3. Asset portability tests
  - one mesh/material/texture payload rendered on both backends
4. Limitation tests
  - compute feature request on WebGL produces explicit fallback/error path

---

## Final Notes

- The engine core owns scene logic and render orchestration.
- Backends are execution targets, not owners of game/scene behavior.
- WebGPU remains the preferred path by policy; WebGL exists as compatibility fallback.
- Dual vertex modules are a deliberate tradeoff for explicit cross-backend control and predictable compilation.

