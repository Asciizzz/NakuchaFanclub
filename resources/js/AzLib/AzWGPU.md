# AzWGPU Readiness Spec

## Scope

- library file: `azcore/AzWGPU.js`
- usage mode:
  - ESM import: `import * as AzWGPU from "../azcore/AzWGPU.js"`
  - global fallback: `window.AzWGPU`
- examples root: `ABzExamples/`

---

## Readiness Model

Scoring is weighted so future updates stay consistent

1. API usefulness and composability (`30%`)
2. Runtime reliability and lifecycle safety (`25%`)
3. Debuggability and error clarity (`20%`)
4. Validation evidence from examples (`15%`)
5. Documentation maintainability (`10%`)

`95%` means:

- no unresolved core correctness blocker in validated examples
- fallback behavior is explicit for unsupported capabilities
- high-friction workflows have helper coverage without locking raw control

---

## Component Registry

This section is the main truth source for future edits

### Adapter

- class: `Adapter`
- purpose: adapter request/select and capability snapshot
- methods:
  - `request(options = {})`
  - `pickBest(options = {})`
  - `getCapabilities(adapter)`
- readiness: high
- notes:
  - `pickBest` supports policy-based selection and candidate scoring
  - windows `powerPreference` warning path is handled by candidate sanitation

### Device

- class: `Device`
- purpose: device creation, queue, lifecycle hooks, scoped validation capture
- methods:
  - `create(adapter, options = {})`
  - `getQueue(device)`
  - `onLost(device, handler)`
  - `withErrorScope(device, filter, callback)`
- readiness: high
- notes:
  - `withErrorScope` is a core debug primitive reused by checked helpers

### Context

- class: `Context`
- purpose: canvas context configure/reconfigure/unconfigure
- methods:
  - `create(device, canvas, config = {})`
  - `reconfigure(context, descriptor)`
  - `unconfigure(context)`
- readiness: high

### Buffer

- class: `Buffer`
- purpose: buffer create/write/read/copy/cleanup helpers
- methods:
  - `create(device, descriptor)`
  - `createMapped(device, descriptor, source = null, sourceOffset = 0)`
  - `write(device, buffer, data, offset = 0)`
  - `read(device, buffer, size, offset = 0)`
  - `readTyped(device, buffer, TypedArrayCtor, count, options = {})`
  - `copy(device, sourceBuffer, destinationBuffer, size, options = {})`
  - `destroyAll(buffers)`
- readiness: high
- notes:
  - readback path uses staging copy model and is validated in stress example

### Texture

- class: `Texture`
- purpose: texture create/upload/view/copy-support and cleanup
- methods:
  - `create(device, descriptor)`
  - `create2D(device, options = {})`
  - `createCube(device, options = {})`
  - `create3D(device, options = {})`
  - `create2DArray(device, options = {})`
  - `createDepth2D(device, options = {})`
  - `write(device, texture, source, layout, size)`
  - `writeLayer(device, texture, source, options = {})`
  - `writeExternal(device, texture, source, options = {})`
  - `createView(texture, descriptor)`
  - `destroyAll(textures)`
- readiness: high

### Sampler

- class: `Sampler`
- purpose: sampler creation convenience
- methods:
  - `create(device, descriptor = {})`
- readiness: high

### BindGroup

- class: `BindGroup`
- purpose: bind group layout/group creation
- methods:
  - `createLayout(device, descriptor)`
  - `create(device, descriptor)`
- readiness: high

### Pipeline

- class: `Pipeline`
- purpose: render/compute pipeline creation + checked variants
- methods:
  - `createRender(device, descriptor)`
  - `createCompute(device, descriptor)`
  - `createRenderChecked(device, descriptor, options = {})`
  - `createComputeChecked(device, descriptor, options = {})`
- readiness: high
- notes:
  - checked variants capture validation errors through error scopes

### Pass

- class: `Pass`
- purpose: pass begin/end and scoped pass execution
- methods:
  - `beginRender(encoder, descriptor)`
  - `beginCompute(encoder, descriptor = {})`
  - `withRender(encoder, descriptor, callback)`
  - `withCompute(encoder, descriptor, callback)`
  - `end(passEncoder)`
- readiness: high

### Command

- class: `Command`
- purpose: encoder lifecycle, submit flow, copy command wrappers
- methods:
  - `createEncoder(device, label)`
  - `finish(encoder)`
  - `withEncoder(device, callback, options = {})`
  - `submit(device, commandBuffers)`
  - `submitAndWait(device, commandBuffers)`
  - `copyBufferToBuffer(device, source, destination, size, options = {})`
  - `copyBufferToTexture(device, source, destination, copySize, options = {})`
  - `copyTextureToBuffer(device, source, destination, copySize, options = {})`
  - `copyTextureToTexture(device, source, destination, copySize, options = {})`
- readiness: high
- notes:
  - default encoder labeling exists for debug readability

### Shader

- class: `Shader`
- purpose: WGSL module creation and message-aware validation
- methods:
  - `create(device, descriptor)`
  - `createChecked(device, descriptor, options = {})`
  - `summarizeMessages(messages, options = {})`
- readiness: high
- notes:
  - summary helper gives compact logs for tool/example HUD output

### Format

- class: `Format`
- purpose: safe defaults
- methods:
  - `preferredCanvas()`
  - `depthDefaults()`
- readiness: high

### Limits

- class: `Limits`
- purpose: inspect/feature checks/require fail-fast
- methods:
  - `inspect(adapterOrDevice)`
  - `hasFeatures(adapterOrDevice, featureList)`
  - `require(adapterOrDevice, constraints = {})`
- readiness: high

### Frame

- class: `Frame`
- purpose: scoped frame encode-submit flow
- methods:
  - `begin(device, options = {})`
  - `finish(frame)`
  - `submit(device, frameOrCommandBuffer, options = {})`
  - `with(device, callback, options = {})`
- readiness: high

### ResourcePool

- class: `ResourcePool`
- purpose: transient resource reuse and pool stats
- methods:
  - `create(options = {})`
  - `acquireBuffer(pool, device, descriptor, key)`
  - `releaseBuffer(pool, buffer, key)`
  - `acquireTexture(pool, device, descriptor, key)`
  - `releaseTexture(pool, texture, key)`
  - `stats(pool)`
  - `destroy(pool)`
- readiness: medium-high
- notes:
  - helper is validated, still optional and explicit by design

### LayoutCache

- class: `LayoutCache`
- purpose: cache layout objects by stable key
- methods:
  - `create(options = {})`
  - `getBindGroupLayout(cache, device, descriptor, key)`
  - `getPipelineLayout(cache, device, descriptor, key)`
  - `stats(cache)`
  - `clear(cache)`
- readiness: high

### Timer

- class: `Timer`
- purpose: GPU timestamp timing with safe CPU fallback and reason reporting
- methods:
  - `supportInfo(device)`
  - `supported(device)`
  - `create(device, options = {})`
  - `measure(device, encode, options = {})`
  - `destroy(timer)`
- readiness: high
- notes:
  - fallback reason should always be explicit, not ambiguous

---

## Validation Matrix

Each row links helper areas to proof pages

### Core flow and capability checks

- validated by:
  - `ABzExamples/AzWGPU_v0.html`
  - `ABzExamples/AzWGPU_v1.html`
- covers:
  - adapter/device/context setup
  - capability require pass/fail behavior

### Command flow, cleanup, compute correctness

- validated by:
  - `ABzExamples/AzWGPU_v2.html`
- covers:
  - scoped passes
  - submit/wait flow
  - cleanup helpers
  - compute correctness benchmark shape

### Reuse/caching/timer baseline

- validated by:
  - `ABzExamples/AzWGPU_v3.html`
- covers:
  - frame chain
  - ping-pong
  - pool/cache behavior
  - timer mode handling

### High-load render confidence

- validated by:
  - `ABzExamples/AzWGPU_v4.html`
- covers:
  - large instancing and sustained render loop

### Reliability and debug gate

- validated by:
  - `ABzExamples/AzWGPU_v5.html`
- covers:
  - long-run compute+render frame chain
  - buffer/texture copy readback checks
  - shader message summary
  - checked pipeline error capture
  - timer support reason/fallback reporting

---

## Known Runtime-Dependent Behavior

- `timestamp-query` may be unavailable on some browser/runtime/device combos
  - this is expected
  - `Timer.supportInfo(...).reason` must explain why
- compute and copy timings vary by hardware and browser implementation details
  - correctness checks matter more than raw ms in readiness gating

---

## Gaps (Remaining 5%)

The remaining gap is mostly confidence depth, not missing major API surface

1. Multi-environment validation depth
   - same v5 suite should be rerun on more driver/browser combos
2. Longer soak coverage
   - longer-duration stress loop checks (not only short demo cycles)
3. Optional advanced diagnostics
   - richer structured reporting output for automation-friendly logs

These are quality-hardening tasks, not core design blockers

---

## Change Protocol (For Future Me)

When adding/changing a helper:

1. Update component section in this file first
2. Add/extend one example proof point in `ABzExamples/`
3. Verify no helper hides raw WebGPU control
4. Keep `window.AzWGPU` compatibility intact
5. Re-evaluate readiness score using same weighting model

Do not reintroduce timeline narration (`v0 -> v1 -> ...`) into this spec
Use capability/coverage grouping only
