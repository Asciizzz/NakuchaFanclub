# WR3 Runtime First Pass

This is the small implementation path.

Goal: get WR3 rendering one triangle through the new graph model before building the full resource system.

No WGL2, no presets, no mesh, no stores, no loader.

## Target

Make this work:

```js
const backend = await WrWGPU.Backend.create(canvas);
const ctx = new WrCtx();
const runner = new WrWGPU.Runner({ backend });

const shader = backend.device.createShaderModule({ code });
const pipeline = backend.device.createRenderPipeline({
	layout: "auto",
	vertex: { module: shader, entryPoint: "vs_main" },
	fragment: {
		module: shader,
		entryPoint: "fs_main",
		targets: [{ format: backend.format }],
	},
	primitive: { topology: "triangle-list" },
});

const root = ctx.addNode();
root.addComp(new WrWGPU.BeginFrame());

const pass = root.addChild();
pass.addComp(new WrWGPU.RenderPass({
	clearColor: [0.08, 0.09, 0.12, 1],
	useDepth: false,
}));

const tri = pass.addChild();
tri.addComp(new WrWGPU.UsePipeline(pipeline));
tri.addComp(new WrWGPU.Draw({ vertexCount: 3 }));

runner.run(root);
```

That is the first milestone.

## Files

Create only these files first:

```txt
WeebRender3/
  index.js
  rtImpl.md
  impl.md
  WrCtx/
    component.js
    ctx.js
  WrWGPU/
    backend.js
    comps/
      frame.js
      pass.js
      pipeline.js
      buffers.js
      bind.js
      draw.js
      dispatch.js
    runner.js
```

Do not create buffer/texture/bindgroup/compute/resource wrapper files yet.

## Step 1: WrCtx

`WrCtx` is just the graph.

### Component

```js
class WrComponent {
	node = null;
	enabled = true;

	constructor(options = {}) {
		this.enabled = options.enabled !== false;
	}

	exec(_run, _node) {}
	destroy() {}
}
```

### Node

Node stores components in an array.

```js
class WrNode extends AzDAG.Node {
	components = [];

	addComp(comp) {}
	clearComp() {}
}
```

Rules:

- `addComp` accepts component instances, not classes
- Multiple components of the same class are allowed
- Execution order is insertion order
- Component gets `comp.node = this`
- No `getComp`, `getComps`, or `removeComp`
- Components are command entries, not unique node state

### Ctx

```js
class WrCtx extends AzDAG.Ctx {
	createNode(id) {
		return new WrNode(this, id);
	}
}
```

Do not add roots logic. AzDAG already exposes roots from parent links.

## Step 2: WGPU Backend

`WrWGPU.Backend` is standalone.

It has nothing to do with `AzWBackend`.

It may use `AzWGPU` internally.

### Minimal API

```js
class Backend {
	canvas = null;
	adapter = null;
	device = null;
	queue = null;
	context = null;
	format = null;

	static async create(canvas, options = {}) {}
	async init() {}
	resize(options = {}) {}
	createEncoder(label = "Wr3Frame") {}
	getScreenColorAttachment(options = {}) {}
	submit(encoderOrCommands) {}
	destroy() {}
}
```

First version only needs screen color rendering.

Skip:

- depth texture
- MSAA
- render-to-texture
- compute
- resource pool

### Screen Attachment

```js
getScreenColorAttachment(options = {}) {
	const view = this.context.getCurrentTexture().createView();
	return {
		view,
		loadOp: options.clearColorEnabled === false ? "load" : "clear",
		storeOp: "store",
		clearValue: toColor(options.clearColor ?? [0, 0, 0, 1]),
	};
}
```

## Step 3: WGPU Run State

Keep it as a plain object inside `runner.js` for now.

```js
function makeRun(backend, options) {
	return {
		backend,
		device: backend.device,
		queue: backend.queue,
		encoder: null,
		pass: null,
		passKind: null,
		pipeline: null,
		ended: false,
		stats: {
			nodes: 0,
			components: 0,
			draws: 0,
			skipped: {
				noPass: 0,
				noPipeline: 0,
			},
		},
		options,
	};
}
```

No separate `state.js` yet.

## Step 4: Command Components

WR3 does not wrap shader modules, pipelines, buffers, textures, or bind groups in this first pass.

Create those with raw WebGPU or AzWGPU, then pass the GPU handles into components.

`SetBuffers` handles render-pass buffers:

- `vertex`
- `index`
- `indirect`

Uniform and storage buffers are not part of `SetBuffers`. They are resources inside bind groups, so use `SetBindGroups`.

### BeginFrame

```js
class BeginFrame extends WrComponent {
	exec(run) {
		if (run.encoder) return;
		run.encoder = run.backend.createEncoder("Wr3Frame");
	}
}
```

### RenderPass

```js
class RenderPass extends WrComponent {
	constructor(options = {}) {
		super(options);
		this.options = options;
	}

	exec(run) {
		if (!run.encoder) run.encoder = run.backend.createEncoder("Wr3Frame");
		if (run.pass) run.pass.end();
		run.pass = run.encoder.beginRenderPass({
			colorAttachments: [
				run.backend.getScreenColorAttachment(this.options),
			],
		});
		run.passKind = "render";
		run.pipeline = null;
	}
}
```

### UsePipeline

```js
class UsePipeline extends WrComponent {
	constructor(pipeline) {
		super();
		this.pipeline = pipeline;
	}

	exec(run) {
		if (!run.pass || run.passKind !== "render") return;
		run.pass.setPipeline(this.pipeline);
		run.pipeline = this.pipeline;
	}
}
```

### SetBuffers

```js
node.addComp(new WrWGPU.SetBuffers({
	vertex: [
		{ slot: 0, buffer: vertexBuffer },
		{ slot: 1, buffer: instanceBuffer },
	],
	index: {
		buffer: indexBuffer,
		format: "uint16",
	},
	indirect: {
		buffer: indirectBuffer,
		offset: 0,
	},
}));
```

### SetBindGroups

```js
node.addComp(new WrWGPU.SetBindGroups([
	{ index: 0, bindGroup: sceneBG },
	{ index: 1, bindGroup: objectBG },
]));
```

### Draw

```js
class Draw extends WrComponent {
	constructor(options = {}) {
		super(options);
		this.vertexCount = options.vertexCount ?? 0;
		this.instanceCount = options.instanceCount ?? 1;
		this.firstVertex = options.firstVertex ?? 0;
		this.firstInstance = options.firstInstance ?? 0;
	}

	exec(run) {
		if (!run.pass) {
			run.stats.skipped.noPass++;
			return;
		}
		if (!run.pipeline) {
			run.stats.skipped.noPipeline++;
			return;
		}
		run.pass.draw(this.vertexCount, this.instanceCount, this.firstVertex, this.firstInstance);
		run.stats.draws++;
	}
}
```

`DrawIndexed`, `DrawIndirect`, and `DrawIndexedIndirect` follow the same rule: they only draw if a render pass and pipeline are active.

## Step 5: Runner

```js
class Runner {
	constructor(options = {}) {
		this.backend = options.backend ?? null;
	}

	run(from, options = {}) {
		const node = resolveNode(from);
		const run = makeRun(this.backend, options);

		for (const [current] of node.walk({
			mode: options.mode ?? "dfs_pre",
			includeFrom: options.includeFrom !== false,
		})) {
			run.stats.nodes++;
			for (const comp of current.components) {
				if (!comp || comp.enabled === false) continue;
				if (typeof comp.exec !== "function") continue;
				run.stats.components++;
				comp.exec(run, current);
			}
		}

		if (run.pass) {
			run.pass.end();
			run.pass = null;
		}

		if (run.encoder && !run.ended) {
			run.backend.submit(run.encoder);
			run.ended = true;
		}

		return run.stats;
	}
}
```

Keep `resolveNode` simple:

- If object has `walk`, use it
- Else return null

Do not support node id lookup in the runner yet.

## Step 6: Test

Create `resources/js/welcome/test3.js` after the runtime files exist.

First shader should use `vertex_index`, no vertex buffer.

```wgsl
@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
	let p = array<vec2f, 3>(
		vec2f(-0.6, -0.5),
		vec2f( 0.6, -0.5),
		vec2f( 0.0,  0.6)
	);
	return vec4f(p[id], 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4f {
	return vec4f(0.95, 0.25, 0.75, 1.0);
}
```

If this renders, WR3 core exists.

## Stop Point

Stop after the triangle works.

Do not immediately add:

- vertex buffers
- index buffers
- bind groups
- uniforms
- textures
- compute
- WGL2
- builders
- shader/pipeline wrapper assets

The first goal is proving the graph executes WGPU render flow correctly.
