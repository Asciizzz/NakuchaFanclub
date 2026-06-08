# Awgl2

Tiny WebGL2 execution layer for `Aflow`

Awgl2 is the WebGL2 counterpart to `Awgpu`. Same idea: wrap raw GL calls in `Afcmd` nodes, plug them into an `Aflow` graph, and let the graph topology define the render sequence

It only provides:
*   `Backend` for canvas context, depth renderbuffer, viewport management, and per-frame state
*   `Afcmd` components that call raw WebGL2 commands during `Aflow` traversal
*   A mutable state object created by `backend.newState()`

Everything else (scene trees, mesh packing, shader builder) stays outside Awgl2

## Design

Same render-flow model as `Awgpu`. Build resources manually, wrap execution in `Afcmd` nodes, connect them in `Aflow`:

```js
import { Aflow, Agraph } from "./Alib/Aflow.js";
import { Awgl2 } from "./Alib/Awgl2/index.js";

const flow = new Aflow(new Agraph());
const backend = await Awgl2.Backend.create(canvas);

const root = flow.addNode({ payload: [
    new Awgl2.BeginFrame()
]});

const passNode = flow.addNode({ payload: [
    new Awgl2.RenderPass({ clearColor: [0.02, 0.02, 0.03, 1] }),
    new Awgl2.UseProgram(program),
    new Awgl2.SetBuffers({ vao }),
    new Awgl2.SetTextures([{ unit: 0, texture: albedo, uniform: "uAlbedo" }]),
    new Awgl2.SetUniforms([{ name: "uViewProj", type: "mat4", value: viewProjMat }]),
    new Awgl2.DrawIndexed({ count: indexCount }),
    new Awgl2.EndPass()
]});

const endNode = flow.addNode({ payload: [
    new Awgl2.EndFrame()
]});

flow.addLink({ srcId: root.id, dstId: passNode.id });
flow.addLink({ srcId: passNode.id, dstId: endNode.id });

flow.run({ from: root.id, state: backend.newState() });
```

## Important Rules

Awgl2 components do not own GL resources. They store references and call GL methods on whatever is in `state.gl`. You manage buffer/texture/program lifecycles yourself

Awgl2 has no concept of bind groups, pipelines, or command encoders - those are GPU-API concepts. The equivalents are:

| Awgpu            | Awgl2                           |
| ---------------- | ------------------------------- |
| `UsePipeline`    | `UseProgram`                    |
| `SetBindGroups`  | `SetTextures` + `SetUniforms`   |
| `SetBuffers`     | `SetBuffers` (VAO-based)        |
| `RenderPass`     | `RenderPass` (FBO + gl.clear)   |
| `ComputePass`    | *(no equivalent in WebGL2)*     |

## Execution Signature

All components inherit from `Afcmd`:
`exec({ state, graph, link })`

*   **state**: mutable object with `gl`, `program`, `vao`, `buffers`, `textures`, `framebuffer`, `passKind`, `ended`
*   **graph**: underlying `Agraph`
*   **link**: incoming connection context `{ data, src, dst }`

## Backend

`Backend` owns the WebGL2 setup:

```js
const backend = await Awgl2.Backend.create(canvas, {
    context: { antialias: false },
});
```

## Components

### Lifecycle
*   **BeginFrame**: resets per-frame state (program, vao, buffers, textures)
*   **EndFrame**: calls `gl.flush()`

### Pass
*   **RenderPass**: binds a framebuffer (null = default backbuffer), sets viewport, clears color/depth
*   **EndPass**: unbinds framebuffer, resets pass state

### Program
*   **UseProgram**: calls `gl.useProgram(program)`

### Data Binding
*   **SetBuffers**: binds a VAO plus optional raw VBO/EBO overrides
*   **SetTextures**: activates texture units and binds WebGLTextures; can auto-write sampler uniforms
*   **SetUniforms**: uploads uniform values (scalars, vectors, matrices) to the active program

### Drawing
*   **Draw**: `gl.drawArrays` / `gl.drawArraysInstanced`
*   **DrawIndexed**: `gl.drawElements` / `gl.drawElementsInstanced`

## Layout

```txt
Awgl2/
    index.js
    backend.js
    comps/
        frame.js    (BeginFrame, EndFrame)
        pass.js     (RenderPass, EndPass)
        program.js  (UseProgram)
        buffers.js  (SetBuffers)
        textures.js (SetTextures)
        uniforms.js (SetUniforms)
        draw.js     (Draw, DrawIndexed)
```
