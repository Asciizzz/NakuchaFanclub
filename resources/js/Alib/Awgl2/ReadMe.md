# Awgpu

Tiny WebGPU execution layer for `Aflow`

Awgpu is not a game renderer, scene renderer, mesh system, shader builder, loader, or asset manager. It provides a bridge between raw WebGPU commands and the `Aflow` execution model

It only provides:
*   `Backend` for device, canvas context, frame encoder, screen attachments, and depth attachment management
*   `Afstep` components that call raw WebGPU commands during `Aflow` traversal
*   A mutable ctx object created by `backend.newCtx()`

Everything else (scene trees, model packing, asset management) stays outside of Awgpu

Note: Awgl2 current API is pretty outdated right now, will change soon, specifically regarding the `Backend` behaviour and scope. It will only act as optional wrapper + execution context provider, no more no less

## Design

Awgpu follows the **render-flow model**. You create WebGPU resources yourself, then wrap execution logic into `Afstep` instances and attach them to `Aflow` nodes. The graph topology defines the execution sequence

```js
import { Aflow, Agraph } from "./Alib/Aflow.js";
import { Awgpu } from "./Alib/Awgpu/index.js";

const flow = new Aflow(new Agraph());
const backend = await Awgpu.Backend.create(canvas);

// Root Node: Start Frame
const root = flow.addNode({ payload: [
    new Awgpu.BeginFrame()
]});

// Render Pass Node
const passNode = flow.addNode({ payload: [
    new Awgpu.RenderPass({ clearColor: [0.02, 0.02, 0.03, 1] }),
    new Awgpu.UsePipeline({ pipeline: renderPipeline }),
    new Awgpu.SetBindGroups([{ index: 0, bindGroup: cameraBG }]),
    new Awgpu.SetBuffers({
        vertex: [{ slot: 0, buffer: vertexBuffer }],
        index: { buffer: indexBuffer, format: "uint32" },
    }),
    new Awgpu.DrawIndexed({ indexCount: 36 }),
    new Awgpu.EndPass()
]});

// End Node: Finish Frame
const endNode = flow.addNode({ payload: [
    new Awgpu.EndFrame()
]});

// Build Topology
flow.addLink(root.id, passNode.id, { order: 0 });
flow.addLink(root.id, endNode.id, { order: 1 });

flow.sortOutgoingLinks(root.id, (a, b) => a.order - b.order);

// Execute
flow.run(root.id, { ctx: backend.newCtx() });
```

## Important Rules

Awgpu components **do not own GPU resources**. They store references and call methods on the active pass in the `ctx` object. If you create a buffer, texture, or pipeline, you manage its lifecycle yourself

Awgpu does not understand high-level concepts like `mesh`, `material`, `camera`, or `scene`. Those belong in higher layers like `WrGPU`

## Execution Signature

All components inherit from `Afstep` and implement the following signature:
`exec({ ctx, graph, link })`

*   **ctx**: The mutable object containing the encoder, current pass, and global backend references
*   **graph**: The underlying `Agraph` instance
*   **link**: The incoming connection context `{ data, src, dst }`. For root nodes, `link.src` is `null`

## Backend

`Backend` owns the browser WebGPU setup

```js
const backend = await Awgpu.Backend.create(canvas, {
    format: navigator.gpu.getPreferredCanvasFormat(),
    context: { alphaMode: "premultiplied" },
});
```

## Components

### Lifecycle
*   **BeginFrame**: Creates a command encoder if one does not exist
*   **EndFrame**: Submits the command encoder to the GPU
*   **EndPass**: Ends the current render or compute pass

### Passes
*   **RenderPass**: Begins a render pass. Supports `colorAttachments` and `depthStencilAttachment` overrides
*   **ComputePass**: Begins a compute pass

### Pipeline & Binding
*   **UsePipeline**: Binds a `GPURenderPipeline` or `GPUComputePipeline`
*   **SetBindGroups**: Binds one or more `GPUBindGroup` instances
*   **SetBuffers**: Binds vertex, index, and indirect buffers

### Drawing & Dispatching
*   **Draw / DrawIndexed**: Standard vertex/index drawing
*   **DrawIndirect / DrawIndexedIndirect**: Indirect drawing from a buffer
*   **Dispatch / DispatchIndirect**: Compute workgroup dispatching

## Why This Exists

Awgpu puts command execution into a node graph, allowing render flows to be branched, shared, reordered, or generated dynamically. The components are intentionally thin to remain as close to the WebGPU specification as possible

## Layout

```txt
Awgpu/
    index.js
    backend.js
    comps/
        frame.js    (BeginFrame, EndFrame)
        pass.js     (RenderPass, ComputePass, EndPass)
        pipeline.js (UsePipeline)
        bind.js     (SetBindGroups)
        buffers.js  (SetBuffers)
        draw.js     (Draw, DrawIndexed, etc.)
        dispatch.js (Dispatch, DispatchIndirect)
```
