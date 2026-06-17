# Awgpu

Minimal WebGPU execution layer for `Aflow`. Wraps raw WebGPU commands into `Afstep` components that execute within the `Aflow` graph traversal

**Awgpu does not provide:** game renderer, scene graph, mesh system, shader builder, asset loaders, or high-level abstractions. You manage GPU resources and define execution flow via the graph topology

* Note:

- The empty diag in `exec({ ctx, graph, diag } = {})` is cuz I haven't implemented diagnostics yet, sorry lol

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

## Steps Reference

### Lifecycle

#### `BeginFrame`

```cs
label?: string
```

Creates a command encoder for the frame. Executes once at the start of each frame

#### `EndFrame`

Submits the encoder to the GPU queue. Executes once at the end of each frame

---

### Passes

#### `RenderPass`

```cs
{
    colorAttachments?: Array[] {
        view: GPUTextureView,
        loadOp?: "clear" | "load",
        storeOp?: "store" | "discard",
        clearValue?: GPUColor
    }
    depthStencilAttachment?: {
        view: GPUTextureView,
        depthLoadOp?: "clear" | "load",
        depthStoreOp?: "store" | "discard",
        depthClearValue?: number,
        stencilLoadOp?: "clear" | "load",
        stencilStoreOp?: "store" | "discard",
        stencilClearValue?: number
    }
    label?: string,
    clearColor?: [r: number, g: number, b: number, a: number],
    clearColorEnabled?: boolean,
    storeOp?: "store" | "discard"
}
```

Begins a render pass for drawing operations. Automatically uses screen color attachment if none provided

**Methods:**
- `RenderPass.createScreenColorAttachment(ctx, options)` - Creates screen color attachment
- `RenderPass.createColorAttachments(ctx, customAttachments, defaultOptions)` - Creates color attachments
- `RenderPass.createDepthAttachment(customAttachment)` - Returns depth attachment

#### `ComputePass`

```cs
{
    label?: string,
    timestampWrites?: {
        querySet: GPUQuerySet,
        queryIndex: number,
        queryCount: number
    }
}
```

Begins a compute pass for compute shader operations

#### `EndPass`

Ends the current render or compute pass

---

### Pipeline & Binding

#### `UsePipeline`

```cs
pipeline: GPURenderPipeline | GPUComputePipeline
```

Binds a render or compute pipeline to the current pass

#### `SetBindGroups`

```cs
groups: Array[] {
    index?: number,
    bindGroup?: GPUBindGroup,
    offsets?: Iterable<number>
}
```

Binds one or more bind groups to the current pass

#### `SetBuffers`

```cs
{
    vertex?: Array[] {
        slot?: number,
        buffer: GPUBuffer,
        offset?: number,
        size?: number
    }
    index?: {
        buffer: GPUBuffer,
        format?: "uint16" | "uint32",
        offset?: number,
        size?: number
    }
    indirect?: {
        buffer: GPUBuffer,
        offset?: number
    }
}
```

Binds vertex, index, or indirect buffers to the current render pass

---

### Drawing (Render Pass)

#### `Draw`

```cs
{
    vertexCount: number
    instanceCount?: number
    firstVertex?: number
    firstInstance?: number
}
```

Issues a draw call with vertex and instance counts

#### `DrawIndexed`

```cs
{
    indexCount: number
    instanceCount?: number
    firstIndex?: number
    baseVertex?: number
    firstInstance?: number
}
```

Issues an indexed draw call

#### `DrawIndirect`

```cs
{
    buffer: GPUBuffer,
    offset?: number
}
```

Issues a draw call with parameters from an indirect buffer

#### `DrawIndexedIndirect`

```cs
{
    indexCount: number
    instanceCount?: number
    firstIndex?: number
    baseVertex?: number
    firstInstance?: number
}
```

Issues an indexed draw call with parameters from an indirect buffer

---

### Compute (Compute Pass)

#### `Dispatch`

```cs
{
    x?: number
    y?: number
    z?: number
}
```

Dispatches compute workgroups

#### `DispatchIndirect`

```cs
{
    buffer: GPUBuffer,
    offset?: number
}
```

Dispatches compute workgroups with parameters from an indirect buffer

---

### Memory Copies

#### `CopyBufferToBuffer`

```cs
{
    src: GPUBuffer,
    dst: GPUBuffer,
    srcOffset?: number,
    dstOffset?: number,
    size: number
}
```

Copies data between two buffers

#### `CopyBufferToTexture`

```cs
{
    src: {
        buffer: GPUBuffer,
        offset?: number,
        bytesPerRow?: number,
        rowsPerImage?: number
    }
    dst: {
        texture: GPUTexture,
        mipLevel?: number,
        origin?: [x, y, z]
    }
    size: [width, height, depthOrArrayLayers]
}
```

Copies buffer data into a texture

#### `CopyTextureToBuffer`

```cs
{
    src: {
        texture: GPUTexture,
        mipLevel?: number,
        origin?: [x, y, z]
    }
    dst: {
        buffer: GPUBuffer,
        offset?: number,
        bytesPerRow?: number,
        rowsPerImage?: number
    }
    size: [width, height, depthOrArrayLayers]
}
```

Copies texture data into a buffer

#### `CopyTextureToTexture`

```cs
{
    src: {
        texture: GPUTexture,
        mipLevel?: number,
        origin?: [x, y, z]
    }
    dst: {
        texture: GPUTexture,
        mipLevel?: number,
        origin?: [x, y, z]
    }
    size: [width, height, depthOrArrayLayers]
}
```

Copies data between two textures

---

**All components inherit from `Afstep` and receive `{ ctx, graph, link }` in `exec()`.**
- `ctx`: GPU primitives (device, queue, canvas, canvasContext), encoder, pass, pipeline, and resource tracking
- `graph`: Underlying `Agraph` instance
- `link`: Incoming edge context (src/dst/data)