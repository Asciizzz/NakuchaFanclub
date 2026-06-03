# WeebRender2

Runtime notes for the current WR2 branch  
This file matches current `WrWorld`, `WrShader`, and `WrWorld/Components`

## Quick Start

```js
import { AzCamera } from "../AzLib/AzCamera.js";
import { WrBackend, WrWorld } from "../WeebRender2/index.js";

const canvas = document.getElementById("wr-canvas");
const { backend } = await WrBackend.Base.choose(canvas, { prefer: "webgpu" });

const world = new WrWorld({ backend });
const camera = new AzCamera({ position: [0, 1.2, 4.5], near: 0.1, far: 250, fov: 45 });
camera.lookAt([0, 1, 0]);
world.setCamera(camera);
```

## World API

### `new WrWorld({ backend })`
Creates a world with shared node map and shared stores

### `world.setBackend(backend)`
Swaps backend and drops cached GPU resources

### `world.setCamera(camera)`
Sets active camera reference

### `world.registerShader(id, desc)`
Registers a WR shader, refer to Shader section for more details

### `world.registerGLTF(url, options)`
Loads GLB and returns copied branch root node

`options.shaderIds` is optional and gets appended to each loaded MeshRenderer

### `world.render(fromNode, options)`
Builds draw queue from `fromNode` branch and optionally draws it

Options:
- `collectOnly` default `false`
- `includeHidden` default `false`
- `time` default `performance.now() * 0.001`
- `deltaTime` default `0`
- `beginFrame` default `true`
- `endFrame` default `true`
- `clearColor` default `shader.renderCfg.clearColor` then `[0.62, 0.72, 0.92, 1]`
- `clearDepth` default `shader.renderCfg.clearDepth` then `1`
- `useDepth` default `true`
- `clearColorEnabled` default `true` only when starting frame, else `false`
- `clearDepthEnabled` default `true` only when starting frame, else `false`

### Node-centric Multi-branch Rendering

```js
rootA.render({
  time: t,
  deltaTime: dt,
  beginFrame: true,
  endFrame: false,
  clearColorEnabled: true,
  clearDepthEnabled: true,
});

rootB.render({
  time: t,
  deltaTime: dt,
  beginFrame: false,
  endFrame: true,
  clearColorEnabled: false,
  clearDepthEnabled: false,
});
```

## Node API

### `node.addComp(Type)`
Add component instance to node

### `node.getComp(Type)`
Read component instance

### `node.removeComp(Type)`
Remove component instance

### `node.render(options)`
Proxy to `world.render(node, options)`

## Components

### `WrTransform`
- `local: mat4`
- `world: mat4`
- `applyRaw(raw)`

### `WrMeshRenderer`
- `meshId`
- `textures.albedo`
- `morphWeights`
- `instData.slot0..slot3` each vec4
- `cfg.shaderIds: string[]`
- `cfg.hasRig: boolean`
- `cfg.display: boolean`

Methods:
- `setCfg({ shaderIds, hasRig, display })`
- `useShader(id)`
- `disuseShader(id)`
- `bindMesh(meshRef, options)`
- `setTexture(slot, textureRef)`
- `setMorphWeight(nameOrIndex, value)`
- `setMorphExclusive(nameOrIndex, value)`
- `getPrimaryMorph()`
- `setInstData("slot0"|"slot1"|"slot2"|"slot3", vec4)`
- `getInstData(slot)`

Notes:
- One mesh renderer can draw with multiple shaders in one render call
- If no valid shader id is present, it does not draw

### `WrLiveSkeleton`
- `skeletonId`
- `bones[]`
- `setSkeleton(ref)`
- `setBonePose(indexOrName, mat4)`
- `buildPalette(maxBones)`

## Shader

### Descriptor

```js
world.registerShader("main", {
  renderCfg: {
    depthTest: true,
    depthWrite: true,
    cull: "back",
    blend: false,
    clearColor: [0.62, 0.72, 0.92, 1],
    clearDepth: 1,
  },
  wgsl: {
    links: [
      { name: "out_uv", type: "vec2f" },
      { name: "out_nrm", type: "vec3f" },
    ],
    vertex: { methods: [], main: "..." },
    fragment: { methods: [], main: "..." },
  },
  glsl: {
    links: [
      { name: "out_uv", type: "vec2" },
      { name: "out_nrm", type: "vec3" },
    ],
    vertex: { methods: [], main: "..." },
    fragment: { methods: [], main: "..." },
  },
});
```

`links` is the vertex->fragment data contract  
Legacy `$LINK0...$LINK7$` keys are removed

### `renderCfg`

`renderCfg` is fixed shader state for WR2.  
WrShader enforces this consistently across WGPU and WGL2.

Fields:
- `depthTest: boolean`
- `depthWrite: boolean`
- `cull: "none" | "back" | "front"`
- `blend: boolean`
- `clearColor: [r, g, b, a]` default clear color when render options do not override it
- `clearDepth: number` default depth clear when render options do not override it

Notes:
- In WGPU this maps to baked pipeline state
- In WGL2 WR2 still treats this as fixed per shader to match WR2 behavior
- Per-frame clear behavior can still be overridden in `world.render(..., options)`

### Stage Key Reference

Stage tags:
- `V` vertex only
- `F` fragment only
- `VF` both

| Key | Stage | Meaning |
| --- | --- | --- |
| `$POSITION$` | V | Vertex position input |
| `$NORMAL$` | V | Vertex normal input |
| `$UV$` | VF | UV input in vertex, linked UV in fragment |
| `$TANGENT$` | V | Tangent input or fallback |
| `$BONE_ID$` | V | Bone index vec4 |
| `$BONE_WEIGHT$` | V | Bone weight vec4 |
| `$MORPH_POS$` | V | Morph position delta |
| `$MORPH_WEIGHT$` | V | Active morph weight |
| `$INST_MODEL$` | V | Model matrix |
| `$INST_DATA0$` | V | MeshRenderer instData slot0 |
| `$INST_DATA1$` | V | MeshRenderer instData slot1 |
| `$INST_DATA2$` | V | MeshRenderer instData slot2 |
| `$INST_DATA3$` | V | MeshRenderer instData slot3 |
| `$VIEW$` | VF | View matrix |
| `$PROJECTION$` | VF | Projection matrix |
| `$TIME$` | VF | Time scalar (`u_time.x`) |
| `$DELTA_TIME$` | VF | Delta time scalar (`u_time.y`) |
| `$SKIN_PALETTE$` | V | Skin palette array |
| `$VTX_FLAGS$` | VF | Primary runtime flags vector |
| `$SKIN_ENABLED$` | VF | Runtime skinning active flag |
| `$HAS_MORPH$` | VF | Morph path available flag |
| `$HAS_UV$` | VF | UV attribute exists flag |
| `$HAS_NORMAL$` | VF | Normal attribute exists flag |
| `$HAS_COLOR$` | VF | Color attribute exists flag |
| `$HAS_BONE$` | VF | Bone attributes exist flag |
| `$HAS_TANGENT$` | VF | Tangent attribute exists flag |
| `$MORPH_HAS_POS$` | VF | Morph position stream exists |
| `$MORPH_HAS_NORMAL$` | VF | Morph normal stream exists |
| `$MORPH_HAS_TANGENT$` | VF | Morph tangent stream exists |
| `$ALBEDO_TEX$` | F | Albedo texture sampler |
| `$ALBEDO_COLOR$` | F | Albedo color factor |
| `$OUT_COLOR$` | F | Fragment output color target |

### Important Rules

- `$INST_DATA0..3$` are custom instance data only
- Fragment stage does not accept `$INST_DATA0..3$`
- If fragment needs instance custom data, pass it through explicit `link`
- Material color/texture are separate from instance data
- `hasRig` in component is config intent, `$SKIN_ENABLED$` is runtime shader flag

## Minimal Render Loop

```js
let last = performance.now();
let t = 0;

function frame(now) {
  const dt = Math.max(0, (now - last) * 0.001);
  last = now;
  t += dt;

  root.render({ time: t, deltaTime: dt });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```
