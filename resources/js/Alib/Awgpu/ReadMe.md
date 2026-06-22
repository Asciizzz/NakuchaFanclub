# Awgpu

Minimal WebGPU execution layer for `Aflow`. Wraps raw WebGPU commands into `Afstep` components that execute within the `Aflow` graph traversal

**Awgpu does not provide:** game renderer, scene graph, mesh system, shader builder, asset loaders, or high-level abstractions. You manage GPU resources and define execution flow via the graph topology

---

## Quick Start

```js
import { Aflow, Agraph } from "./Alib/Aflow.js";
import { Awgpu } from "./Alib/Awgpu/index.js";

const flow = new Aflow(new Agraph());
const backend = await Awgpu.Backend.create(canvas);

// Build execution graph
const root = flow.addNode({ payload: [new Awgpu.BeginFrame()] });
const pass = flow.addNode({ payload: [
    new Awgpu.RenderPass({}),
    new Awgpu.UsePipeline(pipeline),
    new Awgpu.SetBindGroups([{ index: 0, bindGroup }]),
    new Awgpu.SetBuffers({ vertex: [{ slot: 0, buffer }] }),
    new Awgpu.DrawIndexed({ indexCount: 36 }),
    new Awgpu.EndPass()
]});
const end = flow.addNode({ payload: [new Awgpu.EndFrame()] });

flow.addLink(root.id, pass.id, { order: 0 });
flow.addLink(root.id, end.id, { order: 1 });
flow.sortOutgoingLinks(root.id, (a, b) => a.order - b.order);

// Execute
flow.run(root.id, { ctx: backend.newCtx() });
```

---

## Steps Reference

### Lifecycle

#### `BeginFrame`

```
label?: string
```

```js
new Awgpu.BeginFrame()
new Awgpu.BeginFrame({ label: "MainFrame" })
```

> Creates a command encoder for the frame. Executes once at the start of each frame

#### `EndFrame`

```js
new Awgpu.EndFrame()
```

> Submits the encoder to the GPU queue. Executes once at the end of each frame

---

### Passes

#### `RenderPass`

```
{
    label?: string,
    colorAttachments?: Array[] {
        view: GPUTextureView,
        loadOp?: "clear" | "load",
        storeOp?: "store" | "discard",
        clearValue?: GPUColor
    },
    depthStencilAttachment?: {
        view: GPUTextureView,
        depthLoadOp?: "clear" | "load",
        depthStoreOp?: "store" | "discard",
        depthClearValue?: number,
        stencilLoadOp?: "clear" | "load",
        stencilStoreOp?: "store" | "discard",
        stencilClearValue?: number
    }
}
```

```js

// MSAA + depth (view created externally)
new Awgpu.RenderPass({
    label: "MSAAPass",
    get colorAttachments() {
        return [{
            view: msaaView,
            resolveTarget: backend.currentView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: "clear",
            storeOp: "discard",
        }];
    },
    get depthStencilAttachment() {
        return {
            view: depthView,
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "discard",
        };
    },
})
```

> Begins a render pass for drawing operations. Automatically uses screen color attachment if none provided

* Note
> `colorAttachments` and `depthStencilAttachment` SHOULD be provided as getters to obtain the latest `GPUTextureView` for the current frame

**Methods:**
- `RenderPass.buildScreenColorAttachment(ctx, options)` - Build screen color attachment
- `RenderPass.buildColorAttachments(ctx, customAttachments, defaultOptions)` - Build color attachments

#### `ComputePass`

```
{
    label?: string,
    timestampWrites?: {
        querySet: GPUQuerySet,
        queryIndex: number,
        queryCount: number
    }
}
```

```js
new Awgpu.ComputePass({})
new Awgpu.ComputePass({ label: "ParticleUpdate" })
new Awgpu.ComputePass({
    label: "TimestampedPass",
    timestampWrites: {
        querySet,
        queryIndex: 0,
        queryCount: 2,
    }
})
```

> Begins a compute pass for compute shader operations

#### `EndPass`

```js
new Awgpu.EndPass()
```

> Ends the current render or compute pass

---

### Pipeline & Binding

#### `UsePipeline`

```
pipeline: GPURenderPipeline | GPUComputePipeline
```

```js
new Awgpu.UsePipeline(renderPipeline)
new Awgpu.UsePipeline(computePipeline)
```

> Binds a render or compute pipeline to the current pass

#### `SetBindGroups`

```
groups: Array[] {
    index?: number,
    bindGroup?: GPUBindGroup,
    offsets?: Iterable<number>
}
```

```js
new Awgpu.SetBindGroups([
    { index: 0, bindGroup: sceneBindGroup },
])

new Awgpu.SetBindGroups([
    { index: 0, bindGroup: globalUniforms },
    { index: 1, bindGroup: materialBindGroup },
    { index: 2, bindGroup: objectBindGroup, offsets: [0] },
])
```

> Binds one or more bind groups to the current pass

#### `SetBuffers`

```
{
    vertex?: Array[] {
        slot?: number,  
        buffer: GPUBuffer,
        offset?: number,
        size?: number
    },
    index?: {
        buffer: GPUBuffer,
        format?: "uint16" | "uint32",
        offset?: number,
        size?: number
    },
    indirect?: {
        buffer: GPUBuffer,
        offset?: number
    }
}
```

```js
// Vertex only
new Awgpu.SetBuffers({
    vertex: [{ slot: 0, buffer: positionBuffer }],
})

// Vertex + index
new Awgpu.SetBuffers({
    vertex: [
        { slot: 0, buffer: positionBuffer },
        { slot: 1, buffer: normalBuffer },
    ],
    index: { buffer: indexBuffer, format: "uint32" },
})

// With explicit offsets and sizes
new Awgpu.SetBuffers({
    vertex: [{ slot: 0, buffer: interleavedBuffer, offset: 0, size: vertexDataSize }],
    index:  { buffer: indexBuffer, format: "uint16", offset: 0 },
})
```

> Binds vertex, index, or indirect buffers to the current render pass

---

### Drawing (Render Pass)

#### `Draw`

```
{
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number
}
```

```js
new Awgpu.Draw({ vertexCount: 3 })
new Awgpu.Draw({ vertexCount: 6, instanceCount: 100 })
new Awgpu.Draw({ vertexCount: 4, firstVertex: 8, instanceCount: 1 })
```

> Issues a draw call with vertex and instance counts

#### `DrawIndexed`

```
{
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number
}
```

```js
new Awgpu.DrawIndexed({ indexCount: 36 })
new Awgpu.DrawIndexed({ indexCount: 36, instanceCount: 64 })
new Awgpu.DrawIndexed({ indexCount: 36, firstIndex: 0, baseVertex: 0, instanceCount: 1 })
```

> Issues an indexed draw call

#### `DrawIndirect`

```
{
    buffer: GPUBuffer,
    offset?: number
}
```

```js
new Awgpu.DrawIndirect({ buffer: indirectBuffer })
new Awgpu.DrawIndirect({ buffer: indirectBuffer, offset: 16 })
```

> Issues a draw call with parameters from an indirect buffer

#### `DrawIndexedIndirect`

```
{
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number
}
```

```js
new Awgpu.DrawIndexedIndirect({ buffer: indirectBuffer })
new Awgpu.DrawIndexedIndirect({ buffer: indirectBuffer, offset: 20 })
```

> Issues an indexed draw call with parameters from an indirect buffer

---

### Compute (Compute Pass)

#### `Dispatch`

```
{
    x?: number,
    y?: number,
    z?: number
}
```

```js
new Awgpu.Dispatch({ x: 64 })
new Awgpu.Dispatch({ x: 16, y: 16 })
new Awgpu.Dispatch({ x: 8, y: 8, z: 8 })
```

> Dispatches compute workgroups

#### `DispatchIndirect`

```
{
    buffer: GPUBuffer,
    offset?: number
}
```

```js
new Awgpu.DispatchIndirect({ buffer: dispatchBuffer })
new Awgpu.DispatchIndirect({ buffer: dispatchBuffer, offset: 0 })
```

> Dispatches compute workgroups with parameters from an indirect buffer

---

### Memory Copies

No explanation because it's LITERALLY IN THE STEP NAME

#### `CopyBufferToBuffer`

```
{
    src: GPUBuffer,
    dst: GPUBuffer,
    srcOffset?: number,
    dstOffset?: number,
    size: number
}
```

```js
new Awgpu.CopyBufferToBuffer({
    src: stagingBuffer,
    dst: gpuBuffer,
    size: byteLength,
})

new Awgpu.CopyBufferToBuffer({
    src: srcBuffer,
    dst: dstBuffer,
    srcOffset: 0,
    dstOffset: 256,
    size: 1024,
})
```

#### `CopyBufferToTexture`

```
{
    src: {
        buffer: GPUBuffer,
        offset?: number,
        bytesPerRow?: number,
        rowsPerImage?: number
    },
    dst: {
        texture: GPUTexture,
        mipLevel?: number,
        origin?: [x, y, z]
    },
    size: [width, height, depthOrArrayLayers]
}
```

```js
new Awgpu.CopyBufferToTexture({
    src: { buffer: uploadBuffer, bytesPerRow: width * 4 },
    dst: { texture: gpuTexture },
    size: [width, height, 1],
})
```

#### `CopyTextureToBuffer`

```
{
    src: {
        texture: GPUTexture,
        mipLevel?: number,
        origin?: [x, y, z]
    },
    dst: {
        buffer: GPUBuffer,
        offset?: number,
        bytesPerRow?: number,
        rowsPerImage?: number
    },
    size: [width, height, depthOrArrayLayers]
}
```

```js
new Awgpu.CopyTextureToBuffer({
    src: { texture: renderTarget, mipLevel: 0, origin: [0, 0, 0] },
    dst: { buffer: readbackBuffer, bytesPerRow: width * 4 },
    size: [width, height, 1],
})
```

#### `CopyTextureToTexture`

```
{
    src: {
        texture: GPUTexture,
        mipLevel?: number,
        origin?: [x, y, z]
    },
    dst: {
        texture: GPUTexture,
        mipLevel?: number,
        origin?: [x, y, z]
    },
    size: [width, height, depthOrArrayLayers]
}
```

```js
new Awgpu.CopyTextureToTexture({
    src: { texture: srcTex, mipLevel: 0, origin: [0, 0, 0] },
    dst: { texture: dstTex, mipLevel: 0, origin: [0, 0, 0] },
    size: [width, height, 1],
})
```

---

## Execution Quirks (refer to `Aflow` and `Agraph`)

### Graph Traversal and Step Repetition

`Aflow` traverses the graph by following outgoing edges from each node. **Repetition is fully intentional and supported** - the same node can be visited multiple times during a single traversal if multiple paths lead to it

This enables patterns like shared draw-call nodes visited with different pipeline states:

```js
// RenderPass -0-> ShaderA -> DrawMesh
// RenderPass -1-> ShaderB -> DrawMesh  (same DrawMesh node, visited twice)
// Renderpass -2-> Endpass

const renderPass  = flow.addNode({ payload: [new Awgpu.RenderPass({})] });
const shaderA     = flow.addNode({ payload: [new Awgpu.UsePipeline(pipelineA)] });
const shaderB     = flow.addNode({ payload: [new Awgpu.UsePipeline(pipelineB)] });
const drawMesh    = flow.addNode({ payload: [
    new Awgpu.SetBindGroups([{ index: 0, bindGroup }]),
    new Awgpu.SetBuffers({ vertex: [{ slot: 0, buffer }] }),
    new Awgpu.DrawIndexed({ indexCount: meshIndexCount }),
]});
const endpass     = flow.addNode({ payload: [new Awgpu.EndPass()] });

flow.addLink(renderPass.id, shaderA.id,  { order: 0 });
flow.addLink(renderPass.id, shaderB.id,  { order: 1 });
flow.addLink(renderPass.id, endpass.id,  { order: 2 });
// Sort outgoing edges based on <order>
flow.sortOutgoingLinks(renderPass.id, (a, b) => a.data.order - b.data.order);
// 2 Shader nodes use the same DrawMesh node
flow.addLink(shaderA.id,   drawMesh.id);
flow.addLink(shaderB.id,   drawMesh.id);

// Traversal: RenderPass -> ShaderA -> DrawMesh -> ShaderB -> DrawMesh -> EndPass
// DrawMesh executes twice - once per pipeline - against the same geometry
```

The `drawMesh` node's payload runs each time it's reached, inheriting whatever pipeline was last bound via `ctx`. This means you can express multi-pass rendering, material variants, or layered effects purely through graph topology rather than duplicating nodes

### Edge Ordering and `sortOutgoingLinks`/`sortIncomingLinks`

The traversal order of outgoing edges is explicit - edges are visited in whatever order they were sorted. Use `sortOutgoingLinks` to control which branch executes first:

```js
flow.sortOutgoingLinks(
    nodeId,
    (edgeA, edgeB, node, graph) => <comparator_logic>
);
```

`Comparator args`:
| Parameter | Type | Description | Required |
|-----------|------|-------------| -------- |
| `edgeA` | `Aedge` | First edge being compared | Yes |
| `edgeB` | `Aedge` | Second edge being compared | Yes |
| `node?` | `Anode` | The node whose edges are being sorted | No |
| `graph?` | `Agraph` | The full graph instance | No |

```js
// Simple: sort by a numeric priority stamped onto each link
flow.sortOutgoingLinks(root.id, (a, b) => a.data.priority - b.data.priority);

// Advanced: sort based on destination node metadata
flow.sortOutgoingLinks(root.id, (a, b, node, graph) => {
    const dstA = graph.getNode(a.dst);
    const dstB = graph.getNode(b.dst);
    return dstA.data.renderOrder - dstB.data.renderOrder;
});

// Advanced: deprioritize compute passes relative to render passes
flow.sortOutgoingLinks(root.id, (a, b, node, graph) => {
    const isCompute = (edge) => graph.getNode(edge.dst).data.isComputePass;
    return isCompute(a) - isCompute(b);
});
```

`sortIncomingLinks` works the same way, but is really niche, since `Aflow` execution follows the `src` -> `dst` (outgoing) direction, sorting incoming edges doesn't do like... anything?

### `ctx` Carries State Between Steps

All steps in a traversal share the same `ctx` object. Mutations made by one step - binding a pipeline, beginning a pass - are immediately visible to subsequent steps in the same traversal. This is how `UsePipeline` affects the following `Draw` call even when they live in separate nodes

**All components inherit from `Afstep` and receive `{ ctx, graph, link }` in `exec()`.**
- `ctx`: GPU primitives (device, queue, canvas, canvasCtx), encoder, pass, pipeline, and resource tracking
- `graph`: Underlying `Agraph` instance
- `link`: Incoming edge context (src/dst/data)

---

## Note

* The empty `diag` in `exec({ ctx, graph, diag } = {})` is because diagnostics haven't been implemented yet, sorry lol

* `Awgpu`'s `Afstep`s do NOT create or manage GPU resources - pipelines, modules, buffers, textures, etc must be created and maintained externally, `Afstep`s only reference them and do things and stuff to them