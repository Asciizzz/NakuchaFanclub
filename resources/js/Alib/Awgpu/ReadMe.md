# Awgpu

Tiny WebGPU execution layer for `AwDAG`

Awgpu is not a game renderer, scene renderer, mesh system, shader builder, loader, or asset manager

It only provides:

* `Backend` for device, canvas context, frame encoder, screen attachments, and depth attachment
* DAG components that call raw WebGPU commands in traversal order
* A small state object created by `backend.newState()`

Everything else stays outside of Awgpu

## Design

Awgpu follows the render-flow model

You create raw WebGPU resources yourself, then attach small command components to an `AwDAG.Ctx` node graph

The graph shape is the execution flow

```js
const ctx = new Ctx();
const backend = await Awgpu.Backend.create(canvas);

const root = ctx.addNode();
root.addComp(new Awgpu.BeginFrame());

const pass = root.addNode();
pass.addComp(new Awgpu.RenderPass({
	clearColor: [0.02, 0.02, 0.03, 1],
}));

const draw = pass.addNode();
draw.addComp(new Awgpu.UsePipeline(pipeline));
draw.addComp(new Awgpu.SetBindGroups([
	{ index: 0, bindGroup: cameraBG },
]));
draw.addComp(new Awgpu.SetBuffers({
	vertex: [{ slot: 0, buffer: vertexBuffer }],
	index: { buffer: indexBuffer, format: "uint32" },
}));
draw.addComp(new Awgpu.DrawIndexed({ indexCount: 36 }));

const endPass = root.addNode();
endPass.addComp(new Awgpu.EndPass());

const endFrame = root.addNode();
endFrame.addComp(new Awgpu.EndFrame());

ctx.exec(root, backend.newState());
```

## Important Rules

Awgpu components do not own GPU resources

They store references and call methods on the active pass

If you create a buffer, texture, bind group, module, or pipeline, you manage it yourself

If a helper class exists somewhere else, pass its `.raw` resource into Awgpu components

```js
node.addComp(new Awgpu.SetBuffers({
	vertex: [{ slot: 0, buffer: instanceBuffer.raw }],
}));
```

Awgpu does not understand:

* mesh
* material
* skeleton
* morph
* transform
* camera
* model
* scene
* world

Those belong in higher layers like `ExtWGPU`

## Backend

`Backend` owns the browser WebGPU setup

```js
const backend = await Awgpu.Backend.create(canvas, {
	format: navigator.gpu.getPreferredCanvasFormat(),
	depthFormat: "depth24plus",
	context: {
		alphaMode: "premultiplied",
	},
});
```

### Fields

* `canvas`
* `adapter`
* `device`
* `queue`
* `context`
* `format`
* `depthFormat`
* `ready`

### Methods

* `Backend.create(canvas, options)`
* `init()`
* `resize(options)`
* `createEncoder(label)`
* `newState()`
* `getScreenColorAttachment(options)`
* `getDepthAttachment(options)`
* `getDepthView()`
* `submit(encoderOrCommands)`
* `destroy()`
* `releaseDepth()`

## State

`backend.newState()` creates the mutable execution state used by `AwDAG.Ctx.exec`

```js
const state = backend.newState();
ctx.exec(root, state);
```

Shape:

```js
{
	backend,
	device,
	queue,
	encoder,
	pass,
	passKind,
	pipeline,
	buffers,
	bindGroups,
	ended,
}
```

Components mutate this object as they execute

This is why `BeginFrame`, `RenderPass`, `UsePipeline`, `SetBuffers`, `DrawIndexed`, `EndPass`, and `EndFrame` can live on separate nodes

## Components

### BeginFrame

Creates a command encoder if one does not already exist

```js
node.addComp(new Awgpu.BeginFrame({ label: "MainFrame" }));
```

### EndFrame

Submits the command encoder through `backend.submit`

```js
node.addComp(new Awgpu.EndFrame());
```

### RenderPass

Begins a render pass

If `colorAttachments` is not provided, it uses the screen texture from the backend

If `depthStencilAttachment` is not provided, it uses the backend depth texture unless `useDepth` is false

```js
node.addComp(new Awgpu.RenderPass({
	label: "main-pass",
	clearColor: [0.1, 0.12, 0.15, 1],
	clearColorEnabled: true,
	clearDepth: 1,
	clearDepthEnabled: true,
	useDepth: true,
}));
```

Render to a texture by providing explicit attachments:

```js
node.addComp(new Awgpu.RenderPass({
	colorAttachments: [{
		view: targetTexture.createView(),
		loadOp: "clear",
		storeOp: "store",
		clearValue: { r: 0, g: 0, b: 0, a: 1 },
	}],
	depthStencilAttachment: undefined,
}));
```

### ComputePass

Begins a compute pass

```js
node.addComp(new Awgpu.ComputePass({ label: "compute-instances" }));
```

### EndPass

Ends the current render or compute pass

```js
node.addComp(new Awgpu.EndPass());
```

### UsePipeline

Binds a render or compute pipeline to the current pass

```js
node.addComp(new Awgpu.UsePipeline(pipeline));
```

### SetBindGroups

Binds one or more bind groups

```js
node.addComp(new Awgpu.SetBindGroups([
	{ index: 0, bindGroup: sceneBG },
	{ index: 1, bindGroup: materialBG, offsets: [offset] },
]));
```

### SetBuffers

Binds vertex, index, and indirect buffers for render passes

```js
node.addComp(new Awgpu.SetBuffers({
	vertex: [
		{ slot: 0, buffer: vertexBuffer },
		{ slot: 1, buffer: instanceBuffer, offset: 0 },
	],
	index: {
		buffer: indexBuffer,
		format: "uint32",
	},
	indirect: {
		buffer: indirectBuffer,
		offset: 0,
	},
}));
```

### Draw

Calls `pass.draw`

```js
node.addComp(new Awgpu.Draw({
	vertexCount: 3,
	instanceCount: 1,
}));
```

### DrawIndexed

Calls `pass.drawIndexed`

```js
node.addComp(new Awgpu.DrawIndexed({
	indexCount: 36,
	instanceCount: 10,
}));
```

### DrawIndirect

Calls `pass.drawIndirect`

Uses the component buffer if provided, otherwise uses the indirect buffer from `SetBuffers`

```js
node.addComp(new Awgpu.DrawIndirect({
	buffer: indirectBuffer,
	offset: 0,
}));
```

### DrawIndexedIndirect

Calls `pass.drawIndexedIndirect`

```js
node.addComp(new Awgpu.DrawIndexedIndirect({
	buffer: indirectBuffer,
	offset: 0,
}));
```

### Dispatch

Calls `pass.dispatchWorkgroups`

```js
node.addComp(new Awgpu.Dispatch({
	x: 8,
	y: 1,
	z: 1,
}));
```

### DispatchIndirect

Calls `pass.dispatchWorkgroupsIndirect`

```js
node.addComp(new Awgpu.DispatchIndirect({
	buffer: indirectBuffer,
	offset: 0,
}));
```

## Render And Compute In One Frame

Compute and render can share one frame encoder

End the compute pass before starting the render pass

```js
const root = ctx.addNode();
root.addComp(new Awgpu.BeginFrame());

const compute = root.addNode();
compute.addComp(new Awgpu.ComputePass());
compute.addComp(new Awgpu.UsePipeline(computePipeline));
compute.addComp(new Awgpu.SetBindGroups([{ index: 0, bindGroup: computeBG }]));
compute.addComp(new Awgpu.Dispatch({ x: 64 }));
compute.addComp(new Awgpu.EndPass());

const render = root.addNode();
render.addComp(new Awgpu.RenderPass({ clearColor: [0, 0, 0, 1] }));
render.addComp(new Awgpu.UsePipeline(renderPipeline));
render.addComp(new Awgpu.SetBindGroups([{ index: 0, bindGroup: renderBG }]));
render.addComp(new Awgpu.SetBuffers({
	vertex: [{ slot: 0, buffer: vertexBuffer }],
	index: { buffer: indexBuffer, format: "uint32" },
}));
render.addComp(new Awgpu.DrawIndexed({ indexCount: 36, instanceCount: 3 }));
render.addComp(new Awgpu.EndPass());

root.addNode().addComp(new Awgpu.EndFrame());

ctx.exec(root, backend.newState());
```

## Why This Exists

Raw WebGPU is already explicit and good

Awgpu does not try to hide it

The useful part is putting command execution into a node graph, so render flow can be branched, shared, reordered, copied, or generated by higher-level tools

The components are intentionally thin

If something requires domain knowledge, it does not belong here

## File Layout

```txt
Awgpu/
	index.js
	backend.js
	comps/
		frame.js
		pass.js
		pipeline.js
		bind.js
		buffers.js
		draw.js
		dispatch.js
```
