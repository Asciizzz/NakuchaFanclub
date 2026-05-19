# AzWGL Readiness Spec

## Scope

- library file: `azcore/AzWGL.js`
- usage mode:
  - ESM import: `import * as AzWGL from "../azcore/AzWGL.js"`
  - global fallback: `window.AzWGL`
- examples root: `ABzExamples/`

---

## Readiness Model

Keep this weighting stable so future percentage updates are comparable

1. API usefulness and composability (`30%`)
2. Runtime reliability and lifecycle safety (`25%`)
3. Debuggability and error clarity (`20%`)
4. Validation evidence from examples (`15%`)
5. Documentation maintainability (`10%`)

`95%` for AzWGL means:

- robust render workflow coverage for realistic WebGL2 use
- clear capability/fallback handling for optional extensions
- stable multipass/stress validation, not just minimal rendering

---

## Component Registry

### Context

- class: `Context`
- purpose: create/resize/info for WebGL2 context
- methods:
  - `create(canvas, options = {})`
  - `resize(gl, canvas, options = {})`
  - `info(gl)`
- readiness: high

### Shader

- class: `Shader`
- purpose: GLSL compile/link/use
- methods:
  - `create(gl, descriptor)`
  - `createChecked(gl, descriptor, options = {})`
  - `summarizeInfoLog(log, options = {})`
  - `use(gl, program)`
- readiness: medium-high
- note:
  - checked and summary path now exists, still needs broader runtime validation logs

### Buffer

- class: `Buffer`
- purpose: ARRAY/ELEMENT buffer create/write
- methods:
  - `create(gl, target, dataOrSize, usage = null)`
  - `write(gl, target, buffer, data, offset = 0)`
- readiness: high

### VertexArray

- class: `VertexArray`
- purpose: VAO setup and bind helpers
- methods:
  - `create(gl, callback)`
  - `bind(gl, vao)`
- readiness: high

### Uniform

- class: `Uniform`
- purpose: common uniform upload helpers
- methods:
  - `mat4(gl, program, name, value)`
  - `vec4(gl, program, name, value)`
  - `float(gl, program, name, value)`
  - `int(gl, program, name, value)`
- readiness: medium-high

### UniformBlock

- class: `UniformBlock`
- purpose: UBO create/write/bind/layout support
- methods:
  - `create(gl, program, blockName, options = {})`
  - `write(gl, block, data, offset = 0)`
  - `bind(gl, block, binding = null)`
  - `layout(gl, program, blockName, uniformNames)`
- readiness: medium-high
- note:
  - capability checks and fallback notes need more consolidation

### Texture

- class: `Texture`
- purpose: 2D/cube/3D/array/depth creation and upload helpers
- methods:
  - `create2D(gl, options = {})`
  - `write2D(gl, texture, source, options = {})`
  - `createCube(gl, options = {})`
  - `writeCubeFace(gl, texture, face, source, options = {})`
  - `create3D(gl, options = {})`
  - `write3D(gl, texture, source, options = {})`
  - `create2DArray(gl, options = {})`
  - `write2DArrayLayer(gl, texture, layer, source, options = {})`
  - `createDepth2D(gl, options = {})`
- readiness: medium-high

### Draw

- class: `Draw`
- purpose: clear/indexed/indexed-instanced draw helpers
- methods:
  - `clear(gl, options = {})`
  - `drawIndexed(gl, options)`
  - `drawIndexedInstanced(gl, options)`
- readiness: high

### Limits

- class: `Limits`
- purpose: capability snapshot
- methods:
  - `inspect(gl)`
- readiness: medium-high
- note:
  - deeper requirement-style checks can still be expanded

### Ext

- class: `Ext`
- purpose: extension probe/get/require
- methods:
  - `get(gl, name, options = {})`
  - `has(gl, name)`
  - `require(gl, names)`
- readiness: medium-high
- note:
  - extension-driven fallback report surface needs stronger consistency

### State

- class: `State`
- purpose: state pack/apply/capture
- methods:
  - `create(options = {})`
  - `apply(gl, state)`
  - `capture(gl)`
- readiness: medium-high

### Framebuffer

- class: `Framebuffer`
- purpose: framebuffer/renderbuffer helpers and scoped bind workflow
- methods:
  - `create(gl, options = {})`
  - `createRenderbuffer(gl, options = {})`
  - `bind(gl, framebuffer, target = gl.FRAMEBUFFER)`
  - `check(gl, target = gl.FRAMEBUFFER)`
  - `with(gl, framebuffer, callback, options = {})`
- readiness: medium-high
- note:
  - multipass validation depth is still short of 95 gate

### Pipeline

- class: `Pipeline`
- purpose: bundle program+vao+state apply flow
- methods:
  - `create(gl, options = {})`
  - `createChecked(gl, options = {}, check = {})`
  - `use(gl, pipeline, options = {})`
- readiness: medium-high

### Readback

- class: `Readback`
- purpose: pixel read/sync
- methods:
  - `pixels(gl, options = {})`
  - `sync(gl)`
- readiness: medium-high
- note:
  - query/timing style helpers around this still need expansion

### ResourcePool

- class: `ResourcePool`
- purpose: transient reuse helpers
- methods:
  - `acquire(gl, kind, key, factory)`
  - `release(gl, kind, key, resource)`
  - `with(gl, kind, key, factory, callback)`
  - `stats(gl)`
  - `clear(gl, options = {})`
- readiness: medium-high

### LayoutCache

- class: `LayoutCache`
- purpose: repeated VAO layout cache helpers
- methods:
  - `keyFromAttributes(attributes, options = {})`
  - `get(gl, key)`
  - `set(gl, key, value)`
  - `getOrCreate(gl, options = {})`
  - `createVAO(gl, options = {})`
  - `clear(gl)`
- readiness: medium-high

### Timer

- class: `Timer`
- purpose: query timing wrapper with CPU fallback + reason reporting
- methods:
  - `supportInfo(gl)`
  - `supported(gl)`
  - `create(gl, options = {})`
  - `measure(gl, encode, options = {})`
- readiness: medium-high

---

## Validation Matrix

### Cross-backend parity preview

- validated by:
  - `ABzExamples/AzWRender.html`
- covers:
  - backend selection policy visibility
  - fallback display and compatibility report pattern

### Core helper integration set

- validated by:
  - `ABzExamples/AzWGL_v2.html`
- covers:
  - UBO flow
  - expanded texture helper coverage
  - resource pool churn comparison
  - layout cache churn comparison

### Reliability and tooling gate set

- validated by:
  - `ABzExamples/AzWGL_v3.html`
- covers:
  - long-run multipass reliability loop
  - checked shader/pipeline debug summary paths
  - timer support and fallback reason reporting
  - explicit state snapshot sanity checks

### Current evidence gap

- missing or insufficient proof depth:
  - runtime validation output from your environment for full V3 gate
  - soak-duration runs beyond default V3 round count

---

## Expected API Limits (Not Bugs)

AzWGL must stay honest about WebGL2 constraints

- no compute shader stage
- no WebGPU storage-buffer/bind-group model
- optional capability spread depends on extensions and drivers

Helpers should expose this clearly, never pretend feature parity where it does not exist

---

## Gap Tracker (92% -> 95%)

Main blockers are reliability proof + diagnostics depth, not missing baseline classes

1. Reliability stress suite
   - run and verify `AzWGL_v3` in target runtime, no warning cascade
2. Multipass confidence
   - verify multipass checksum stays stable in repeated runs
3. Query/timing and fallback reporting
   - confirm timer support/fallback message quality in target runtime
4. Debug summary tooling
   - confirm checked create paths report clear compact summaries
5. Documentation sync
   - update tracked score to 95 only after successful runtime log confirmation

---

## Change Protocol (For Future Me)

When editing AzWGL:

1. update component section here first
2. add or extend one proof scenario in `ABzExamples/`
3. ensure raw WebGL2 escape path remains open
4. avoid helpers that hide critical GL state mutation
5. re-score readiness using this file’s weighting model

Do not convert this file back into a timeline narrative
Keep it as a capability/readiness ledger
