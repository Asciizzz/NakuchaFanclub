# WeebRender (Wr) - World API

Wr is now fully world-centric.

- No `WrScene`
- No `WrNode` wrapper
- One `WrWorld` graph (`Azt.Ctx`) with many branches
- Components are direct node fields (`node.Transform`, `node.MeshRenderer`, etc)

## Exports

- `WrWorld`
- `WrAsset` (compat alias of `WrWorld`)
- `WrWorldRuntime`
- `WrRenderQueue`
- backend, shader, and asset helpers

## Core flow

```js
import { WrWorld } from "./index.js";
import { AzCamera } from "../AzLib/AzCamera.js";

const world = new WrWorld({
  canvas: { id: "wr-canvas", alpha: true },
  backend: { prefer: "webgpu" },
});

await world.init();
world.mount(document.getElementById("main-canvas")).fitContainer();

const camera = new AzCamera({ position: [0, 1, 5], fov: 45, near: 0.1, far: 250 });
camera.lookAt([0, 1, 0]);
world.setCamera(camera);

world.registerShader("wr-default", shaderDesc);
const modelRoot = await world.loadModelFromURL("/Models/Agnes.glb");

world.update(0.016, { from: modelRoot.id });
world.render({ from: modelRoot.id });
```

## Branch operations

```js
const a = world.addNode(null);        // root branch
const b = a.add();                    // child
b.move(null);                         // detach -> root

const cloneRoot = world.copyBranch(a.id, b.id); // copy a branch under b
```

Notes:

- `null` parent is valid and means root.
- `world.roots` is reference metadata only.
- Traversal is node-entry based:
  - root traversal = whole branch
  - interior traversal = sub-branch
