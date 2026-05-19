# WeebRender

WeebRender is a small runtime built around three core objects:

- `WrAsset`: shared rendering context and shared asset registry
- `WrScene`: standalone scene instance bound to one `WrAsset`
- `WrNode`: node wrapper for component and hierarchy access

There is no `WrProject` flow anymore.

## Quick Start

```js
import { AzCamera } from "../AzLib/AzCamera.js";
import { WrAsset } from "../WeebRender/index.js";

const container = document.getElementById("main-canvas");
const asset = new WrAsset({
    canvas: { id: "wr-canvas", alpha: true, maxPixelRatio: 2 },
    backend: { prefer: "webgpu" },
});

await asset.init();
asset.mount(container).fitContainer();

const camera = new AzCamera({
    position: [0, 1, 5],
    near: 0.1,
    far: 250,
    fov: 45,
});
camera.lookAt([0, 1, 0]);
asset.setCamera(camera);

asset.registerShader("wr-default", {
    vertexAbiVersion: 1,
    mode: "template",
    vertex: {
        wgslMain: `output.position = $VIEW$ * $INST_MODEL$ * vec4f($POSITION$, 1.0);`,
        glslMain: `gl_Position = $VIEW$ * $INST_MODEL$ * vec4($POSITION$, 1.0);`,
    },
    fragment: {
        wgslMain: `$OUT_COLOR$ = textureSample($ALBEDO_TEX$, texSampler, $UV$) * $ALBEDO_COLOR$;`,
        glslMain: `$OUT_COLOR$ = texture($ALBEDO_TEX$, $UV$) * $ALBEDO_COLOR$;`,
    },
});

const scene = await asset.loadModelFromURL("/Models/Nakurin.glb");

let lastTime = performance.now();
function frame(now) {
    const dt = (now - lastTime) * 0.001;
    lastTime = now;

    scene.update(dt);
    scene.render();
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

## WrAsset API

### constructor(options)
Creates the shared render context.

Important options:

- `canvas.id`: DOM id to reuse or create
- `canvas.element`: direct `HTMLCanvasElement`
- `canvas.maxPixelRatio`: pixel ratio clamp for resize
- `backend.prefer`: `"webgpu"` or `"webgl2"`
- `backend.pickBest`, `backend.device`, `backend.context`: WebGPU selection and device options

### init(options)
Initializes backend and runtime report.

```js
await asset.init();
console.log(asset.backendKind); // "webgpu" or "webgl2"
console.log(asset.runtimeReport);
```

### mount(target), unmount(), fitContainer(), resize(width, height)
Canvas control methods.

```js
asset.mount(container);
asset.fitContainer();
asset.resize(1280, 720);
asset.unmount();
```

### setCamera(camera)
Sets the default camera used by scenes unless scene render overrides it.

### getCapabilities()
Returns backend capability snapshot.

### registerShader(shaderId, shaderDesc, renderCfgInput?)
Registers dual WGSL/GLSL shader assets.

Template mode is supported through `mode: "template"` and `$KEY$` placeholders.

### validateShaderMeshLayout(shaderId, providedLayout)
Checks layout compatibility before drawing:

```js
const check = asset.validateShaderMeshLayout("wr-default", someLayout);
if (!check.ok) console.warn(check.reason);
```

### loadModelFromURL(url, options?)
Loads a model through EzLoader and returns a standalone `WrScene`.

```js
const scene = await asset.loadModelFromURL("/Models/Foo.glb");
```

### createScene(sceneData, options?)
Creates a `WrScene` from explicit scene payload:

```js
const scene = asset.createScene({
    id: "manual_scene",
    rootId: "Root",
    nodes: [
        {
            id: "Root",
            name: "Root",
            parent: null,
            children: [],
            components: {
                Transform: {
                    local: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                    world: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                },
            },
        },
    ],
});
```

### destroy()
Destroys backend resources owned by `WrAsset`.

## WrScene API

### node(nodeId)
Returns `WrNode` or `null`.

### hasNode(nodeId)
Checks node existence.

### getNodeDataById(nodeId)
Returns raw node data or `null`.

### findByComponent(key)
Returns `WrNode[]` that contain a component key.

### update(dt)
Runs transform propagation and node update hooks.

Supported hooks:

- `components.Custom.run({ deltaTime, scene, node })`
- `components.update(node, deltaTime, scene)`

### render(options?)
Builds render queue and submits draw calls using the bound `WrAsset` backend.

Optional overrides:

- `camera`
- `defaultShaderId`
- `renderCfg`

### instantiate(otherScene, parentNodeId?, options?)
Copies nodes from source scene into target scene.

Rules:

- Source and target must use the same `WrAsset` instance.
- Source data is copied. The original source scene is not mutated.
- Skeleton node links in `MeshRenderer.skeletonNode` are remapped automatically.

Example:

```js
const source = await asset.loadModelFromURL("/Models/A.glb");
const host = await asset.loadModelFromURL("/Models/B.glb");

const tracker = host.instantiate(source, host.rootId);
console.log(tracker.map);     // source node id -> host node id
console.log(tracker.nodeIds); // created node ids in host
```

### toData()
Returns detached scene data clone.

## WrNode API

### data
Raw node object reference from owner scene.

### exists
Boolean: whether this node id is still in the scene.

### name (get/set)
Node display name.

### parent, parentId, children
Hierarchy access as wrappers and ids.

### components
Resolved component map.

### get(componentKey)
Returns component payload or `null`.

### set(componentKey, value)
Sets component payload and returns current node wrapper.

### remove(componentKey)
Deletes component key and returns current node wrapper.

## Scene Data Shape

Current scene node shape:

```js
{
    id: "Node_1",
    name: "Node_1",
    parent: "Root",
    children: ["Node_2"],
    components: {
        Transform: {
            local: Float32Array(16),
            world: Float32Array(16),
        },
        MeshRenderer: {
            active: true,
            meshID: "mesh_x",
            shaderKeys: ["wr-default"],
            skeletonNode: null,
            morphWeights: null,
        },
    },
}
```

`Transform` is normalized automatically when scene data is created.

## Notes

- `WrAsset` stores shared GPU-facing assets (mesh/material/texture/shader).
- `WrAsset` does not own live scene instances.
- `WrScene` instances are standalone and can be created, copied, and destroyed independently.
