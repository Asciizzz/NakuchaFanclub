# WR2 Backend-Agnostic Render API

## Intent

Yes, this is possible

`WrBackend` can expose a fully agnostic render API that knows nothing about:

- world
- scene
- mesh
- skeleton
- 2D/3D semantics

It only knows:

- GPU resources
- pipeline state
- render targets
- draw commands

`WrWorld` can then optionally consume this API later, but `WrBackend` stays standalone

## Core Design Rule

Use handle-based rendering

- every created resource returns a handle
- draw code only references handles
- no backend method accepts domain objects like mesh/material/camera

## 1) Resource API (agnostic)

Minimal creation/destruction surface:

- `createShader(desc)` -> `shaderHandle`
- `createBuffer(desc)` -> `bufferHandle`
- `createTexture(desc)` -> `textureHandle`
- `createSampler(desc)` -> `samplerHandle`
- `createBindings(desc)` -> `bindingsHandle`
- `createPipeline(desc)` -> `pipelineHandle`
- `createRenderTarget(desc)` -> `targetHandle`
- `destroy(handle)`

`desc` is plain data only

No references to mesh/skeleton/world names in the schema

## 2) Frame/Pass API (agnostic)

- `beginFrame(frameDesc)` -> `frameHandle`
- `beginPass(frameHandle, passDesc)` -> `passHandle`
- `endPass(passHandle)`
- `endFrame(frameHandle)`

`frameDesc`/`passDesc` contain only GPU-pass data:

- clear values
- load/store ops
- target handles
- depth usage

## 3) Command API (agnostic)

Pass command methods:

- `setPipeline(pass, pipelineHandle)`
- `setBindings(pass, slot, bindingsHandle)`
- `setVertexBuffer(pass, slot, bufferHandle, offset = 0)`
- `setIndexBuffer(pass, bufferHandle, indexFormat, offset = 0)`
- `setViewport(pass, x, y, w, h, minDepth = 0, maxDepth = 1)`
- `setScissor(pass, x, y, w, h)`
- `draw(pass, vertexCount, instanceCount = 1, firstVertex = 0, firstInstance = 0)`
- `drawIndexed(pass, indexCount, instanceCount = 1, firstIndex = 0, baseVertex = 0, firstInstance = 0)`

No command should accept mesh/material/camera objects

## 4) Pipeline/Shader Data Shape

Pipeline desc is state-only:

- primitive: topology/cull/frontFace
- depth: test/write/compare
- blend: per target
- vertex layout: buffers/attributes
- shader stages + entry names

Shader desc should be backend-keyed:

```js
{
  vertex: {
    webgpu: { code: "...wgsl...", entry: "main" },
    webgl2: { code: "...glsl..." }
  },
  fragment: {
    webgpu: { code: "...wgsl...", entry: "main" },
    webgl2: { code: "...glsl..." }
  }
}
```

This keeps backend logic generic and avoids world-level shader assumptions

## 5) Bindings Model

Use abstract bindings, not world uniforms

Bindings desc example:

```js
{
  entries: [
    { binding: 0, type: "uniform-buffer", buffer: uboHandle },
    { binding: 1, type: "sampler", sampler: samplerHandle },
    { binding: 2, type: "texture-2d", texture: textureHandle }
  ]
}
```

WGPU maps this almost directly to bind groups

WGL2 emulates it with uniform locations + texture units + cached apply steps

## 6) WGPU/WGL2 Mapping Strategy

### WGPU

- resource handles wrap native GPU objects
- pipeline is native `GPURenderPipeline`
- bindings are native bind groups/layouts
- pass commands map 1:1 to encoder commands

### WGL2

- shader handle wraps compiled program
- pipeline handle emulates pipeline state + program + layout metadata
- bindings handle stores uniform/texture binding application plan
- set/draw commands apply state lazily with cache keys

Important:

- WGL2 does not have native pipeline objects
- emulate pipeline behavior with cached state blobs for parity

## 7) Fluent Rendering Without Domain Coupling

You can still keep a fluent style:

```js
const frame = backend.beginFrame({ target: "swapchain", clearColor: [0, 0, 0, 0], clearDepth: 1 })
const pass = backend.beginPass(frame, { color: true, depth: true })

backend.setPipeline(pass, pbrPipeline)
backend.setBindings(pass, 0, sceneBindings)
backend.setBindings(pass, 1, objectBindings)
backend.setVertexBuffer(pass, 0, vertexBuffer)
backend.setIndexBuffer(pass, indexBuffer, "uint32")
backend.drawIndexed(pass, indexCount, instanceCount)

backend.endPass(pass)
backend.endFrame(frame)
```

Still zero world/mesh/skeleton knowledge

## 8) Relationship With WrWorld

`WrWorld` should remain the render orchestrator

- collects branch traversal results
- resolves what to draw
- chooses draw order/batching/instancing
- calls backend agnostic commands

But backend API itself remains standalone and reusable without world

## 9) Implementation Steps

1. Add agnostic resource/command interfaces to `WrWBackend/WrBackend.js` (`WrBackend.Base`)
2. Implement WGPU backend first (closest to explicit API)
3. Implement WGL2 emulation layer with state/program caches
4. Add handle lifetime tracking + debug labels
5. Add minimal sample that draws a triangle without `WrWorld`
6. Later connect `WrWorld` traversal output into this command API

## 10) Guardrails

- Never add methods like `drawMesh`, `drawScene`, `applySkeleton`, `renderWorld` to backend
- Keep resource desc generic and serializable
- Keep backend command layer deterministic and cache-keyed
- Put domain logic in `WrWorld` or higher-level modules only

## Summary

You can have both:

- `WrWorld` as render logic owner
- `WrBackend` as pure agnostic GPU command executor

The key is a strict handle/instruction API with no domain objects crossing the backend boundary
