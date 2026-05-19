# WeebRender

## 1. Runtime Hierarchy

WeebRender has 3 runtime layers.

1. `WrAsset`
	Owns backend, canvas, camera, and shared asset registry.
2. `WrScene`
	Owns scene graph data and frame update/render flow.
3. `WrNode`
	Thin accessor for one node inside a scene.

Ownership rules:

- `WrAsset` can create many scenes.
- `WrScene` is detached data and is not tracked by `WrAsset` after creation.
- `scene.update(dt)` and `scene.render()` are the only required per-frame calls.

## 2. API Reference

### 2.1 `WrAsset` (Context Layer)

#### `new WrAsset(options = {})`
Create rendering context.

Parameters:

- `options.canvas.id: string` canvas id to find or create.
- `options.canvas.element: HTMLCanvasElement` use existing canvas directly.
- `options.canvas.alpha: boolean` alpha mode hint.
- `options.canvas.maxPixelRatio: number` DPR clamp.
- `options.backend.prefer: "webgpu" | "webgl2"` backend preference.
- `options.backend.pickBest: object` WebGPU adapter policy.
- `options.camera: AzCamera` initial camera.

Short example:

```js
const asset = new WrAsset({
	canvas: { id: "wr-canvas", maxPixelRatio: 2 },
	backend: { prefer: "webgpu" },
});
```

#### `await asset.init(options = {})`
Initialize backend.

Parameters:

- `options: object` backend override options.

Returns:

- `Promise<WrAsset>`

Short example:

```js
await asset.init();
console.log(asset.backendKind);
```

#### `asset.mount(target)`
Attach canvas to DOM container.

Parameters:

- `target: Element`

Returns:

- `WrAsset`

#### `asset.unmount()`
Detach canvas from DOM.

Returns:

- `WrAsset`

#### `asset.fitContainer()`
Resize canvas to parent element size.

Returns:

- `WrAsset`

#### `asset.resize(width, height)`
Manual resize in CSS pixels.

Parameters:

- `width: number`
- `height: number`

Returns:

- `WrAsset`

Short example:

```js
asset.mount(container).fitContainer();
asset.resize(1280, 720);
```

#### `asset.setCamera(camera)`
Set default camera for scenes using asset defaults.

Parameters:

- `camera: AzCamera`

Returns:

- `WrAsset`

#### `asset.getCapabilities()`
Read backend capabilities report.

Returns:

- `object`

#### `asset.registerShader(shaderId, shaderDesc = {}, renderCfgInput)`
Register shader with WGSL and GLSL sources.

Parameters:

- `shaderId: string` unique id.
- `shaderDesc: object` shader definition.
- `renderCfgInput: object` optional render config override.

Returns:

- `string` registered shader id.

Short example:

```js
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
```

#### `asset.validateShaderMeshLayout(shaderId, providedLayout)`
Check vertex layout compatibility.

Parameters:

- `shaderId: string`
- `providedLayout: object`

Returns:

- `object` with validation result.

#### `asset.createScene(sceneData = {}, options = {})`
Create scene from explicit payload.

Parameters:

- `sceneData: object`
- `options: object`

Returns:

- `WrScene`

#### `await asset.loadModelFromURL(url, options = {})`
Load GLB, ingest textures/materials/meshes/skeletons, and return scene.

Parameters:

- `url: string`
- `options.camera: AzCamera` optional scene camera override.
- `options.defaultShaderId: string` optional scene shader default.
- `options.renderCfg: object` optional scene render config default.

Returns:

- `Promise<WrScene>`

Short example:

```js
const scene = await asset.loadModelFromURL("/Models/Nakurin.glb");
```

#### `asset.destroy()`
Release backend resources.

Returns:

- `void`

### 2.2 `WrScene` (Scene Layer)

#### `scene.node(nodeId)`
Get node wrapper.

Parameters:

- `nodeId: string`

Returns:

- `WrNode | null`

#### `scene.hasNode(nodeId)`
Check node existence.

Parameters:

- `nodeId: string`

Returns:

- `boolean`

#### `scene.getNodeDataById(nodeId)`
Read raw node data.

Parameters:

- `nodeId: string`

Returns:

- `object | null`

#### `scene.findByComponent(key)`
Find nodes containing a component key.

Parameters:

- `key: string`

Returns:

- `WrNode[]`

Short example:

```js
const renderNodes = scene.findByComponent("MeshRenderer");
```

#### `scene.update(dt = 0)`
Update transforms and run node update hooks.

Parameters:

- `dt: number` seconds.

Returns:

- `WrScene`

Supported hooks:

- `components.Custom.run({ deltaTime, scene, node })`
- `components.update(node, deltaTime, scene)`

#### `scene.render(options = {})`
Build render queue and draw.

Parameters:

- `options.camera: AzCamera`
- `options.defaultShaderId: string`
- `options.renderCfg: object`

Returns:

- `WrScene`

#### `scene.instantiate(otherSceneLike, parentNodeId = null, options = {})`
Copy another scene graph into this scene.

Parameters:

- `otherSceneLike: WrScene | object` source scene or scene payload.
- `parentNodeId: string | null` attach point.
- `options.idRemap: function` optional id remap callback.

Returns:

- `{ sourceSceneID, parentId, map, nodeIds }`

Rules:

- source and target must share the same `WrAsset` instance.
- source scene is not mutated.
- skeleton links in `MeshRenderer.skeletonNode` are remapped.

Short example:

```js
const src = await asset.loadModelFromURL("/Models/A.glb");
const dst = await asset.loadModelFromURL("/Models/B.glb");
const ref = dst.instantiate(src, dst.rootId);
```

#### `scene.toData()`
Export detached scene payload clone.

Returns:

- `object`

### 2.3 `WrNode` (Node Layer)

#### `node.data`
Raw node object.

Type:

- `object | null`

#### `node.exists`
Whether node id is still valid.

Type:

- `boolean`

#### `node.name`
Node display name getter/setter.

Type:

- `string`

#### `node.parent`
Parent wrapper.

Type:

- `WrNode | null`

#### `node.parentId`
Parent id.

Type:

- `string | null`

#### `node.children`
Child wrappers.

Type:

- `WrNode[]`

#### `node.components`
Node component map.

Type:

- `object`

#### `node.get(componentKey)`
Read component.

Parameters:

- `componentKey: string`

Returns:

- `any`

#### `node.set(componentKey, value)`
Write component.

Parameters:

- `componentKey: string`
- `value: any`

Returns:

- `WrNode`

#### `node.remove(componentKey)`
Remove component.

Parameters:

- `componentKey: string`

Returns:

- `WrNode`

Short example:

```js
const root = scene.node(scene.rootId);
const tx = root.get("Transform");
root.set("Tag", { value: "player" });
root.remove("Tag");
```

## 3. Runtime Components

### 3.1 `MeshRenderer` Helper Methods

Component fields:

- `active: boolean`
- `meshID: string`
- `shaderKeys: string[]`
- `skeletonNode: string | null`
- `morphWeights: Float32Array | null`

Helper methods:

- `withShader(shaderID): this`
- `hasShader(shaderID): boolean`
- `removeShader(shaderID): this`
- `clearShaders(): this`
- `resolveMorphIndex(indexOrName): number`
- `setMorphWeight(indexOrName, weight): this`
- `getMorphWeight(indexOrName): number`
- `setMorphExclusive(indexOrName, weight = 1): this`
- `getPrimaryMorph(): { index, weight }`

Short example:

```js
const mr = scene.findByComponent("MeshRenderer")[0].get("MeshRenderer");
mr.clearShaders().withShader("wr-default");
mr.setMorphWeight("Smile", 0.7);
```

### 3.2 `Skeleton` Helper Methods

Component fields:

- `skeletonID: string`
- `bones: Float32Array[]` local pose overrides

Helper methods:

- `use(skeletonAssetLike): this`
- `bindSkeletonData(skeletonAssetLike): this`
- `resolveBoneIndex(indexOrName): number`
- `set(indexOrName, localTransform): this`
- `get(indexOrName): Float32Array | null`
- `buildPalette(maxBones = 128): Float32Array | null`

Short example:

```js
const mr = scene.findByComponent("MeshRenderer")[0].get("MeshRenderer");
const skeleton = scene.node(mr.skeletonNode).get("Skeleton");
skeleton.set("Head", Azm.Mat4.fromRotationY(0.25));
```

### 3.3 Morph Example

```js
const meshNode = scene.findByComponent("MeshRenderer")[0];
const mr = meshNode.get("MeshRenderer");

// by name (preferred when names exist from GLB extras/weights)
mr.setMorphWeight("Smile", 0.8);
mr.setMorphWeight("Blink_L", 0.25);

// by index (always valid when target exists)
mr.setMorphWeight(0, 0.5);

// optional utility: keep only one active target
mr.setMorphExclusive("Smile", 1.0);

// inspect dominant target used by render path
const primary = mr.getPrimaryMorph();
console.log(primary.index, primary.weight);
```

## 4. Asset Cache Helpers

`asset.assets` exposes lookup caches used by runtime components.

### 4.1 `asset.assets.resolveMeshMorphIndex(meshID, indexOrName)`

Parameters:

- `meshID: string`
- `indexOrName: string | number`

Returns:

- `number` morph index or `-1`.

### 4.2 `asset.assets.resolveSkeletonBoneIndex(skeletonID, indexOrName)`

Parameters:

- `skeletonID: string`
- `indexOrName: string | number`

Returns:

- `number` bone index or `-1`.

Short example:

```js
const mr = scene.findByComponent("MeshRenderer")[0].get("MeshRenderer");
const skeleton = scene.node(mr.skeletonNode).get("Skeleton");

const morphIndex = asset.assets.resolveMeshMorphIndex(mr.meshID, "Smile");
const boneIndex = asset.assets.resolveSkeletonBoneIndex(skeleton.skeletonID, "Hips");
```

## 5. Scene Data Shape

Minimum node shape:

```js
{
	id: "Node_1",
	name: "Node_1",
	parent: "Root",
	children: [],
	components: {
		Transform: {
			local: Float32Array(16),
			world: Float32Array(16),
		},
	},
}
```

`Transform` is normalized automatically.

## 6. Full Example

```js
import { AzCamera } from "../AzLib/AzCamera.js";
import * as Azm from "../AzLib/Azm.js";
import { WrAsset } from "../WeebRender/index.js";

const container = document.getElementById("main-canvas");
const asset = new WrAsset({
	canvas: { id: "wr-canvas", alpha: true, maxPixelRatio: 2 },
	backend: { prefer: "webgpu" },
});

await asset.init();
asset.mount(container).fitContainer();

const camera = new AzCamera({ position: [0, 1, 5], near: 0.1, far: 250, fov: 45 });
camera.lookAt([0, 1, 0]);
asset.setCamera(camera);

asset.registerShader("wr-default", {
	vertexAbiVersion: 1,
	mode: "template",
	links: [{ name: "out_uv", type: "vec2f" }],
	vertex: {
		wgslMain: `
			out_uv = $UV$;
			var localPos = $POSITION$;
			if ($HAS_MORPH$) {
				localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
			}

			var skinned = vec4f(localPos, 1.0);
			if ($HAS_RIG$) {
				let weights = $BONE_WEIGHT$;
				let wsum = weights.x + weights.y + weights.z + weights.w;
				if (wsum > 0.00001) {
					let ids = vec4i($BONE_ID$);
					let skin =
						weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
						weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
						weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
						weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
					skinned = skin * vec4f(localPos, 1.0);
				}
			}

			output.position = $VIEW$ * $INST_MODEL$ * skinned;
		`,
		glslMain: `
			out_uv = $UV$;
			vec3 localPos = $POSITION$;
			if ($HAS_MORPH$) {
				localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
			}

			vec4 skinned = vec4(localPos, 1.0);
			if ($HAS_RIG$) {
				vec4 weights = $BONE_WEIGHT$;
				float wsum = weights.x + weights.y + weights.z + weights.w;
				if (wsum > 0.00001) {
					ivec4 ids = ivec4($BONE_ID$);
					mat4 skin =
						weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
						weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
						weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
						weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
					skinned = skin * vec4(localPos, 1.0);
				}
			}

			gl_Position = $VIEW$ * $INST_MODEL$ * skinned;
		`,
	},
	fragment: {
		wgslMain: `$OUT_COLOR$ = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;`,
		glslMain: `$OUT_COLOR$ = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;`,
	},
});

const scene = await asset.loadModelFromURL("/Models/Nakurin.glb");
const mr = scene.findByComponent("MeshRenderer")[0]?.get("MeshRenderer") ?? null;
const skeleton = mr?.skeletonNode ? scene.node(mr.skeletonNode)?.get("Skeleton") : null;

let hipRef = null;
if (skeleton) {
	if (skeleton.resolveBoneIndex("hip") >= 0) hipRef = "hip";
	else if (skeleton.resolveBoneIndex("Hips") >= 0) hipRef = "Hips";
	else hipRef = 0;
}

let last = performance.now();
let time = 0;
function frame(now) {
	const dt = (now - last) * 0.001;
	last = now;
	time += dt;

	if (skeleton && hipRef != null) {
		const angle = Math.sin(time * 2.0) * 0.35;
		skeleton.set(hipRef, Azm.Mat4.fromRotationY(angle));
	}

	scene.update(dt);
	scene.render();
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```
