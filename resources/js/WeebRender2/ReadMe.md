# WeebRender2 - By Asciiz

Usage guide for the runtime side
Keep it simple and use the parts you need

## Setup

Pick a backend, create a world, set a camera

```js
	import { AzWBackend } from "../AzLib/AzWBackend.js";
	import { AzCamera } from "../AzLib/AzCamera.js";
	import { WrWorld } from "../WeebRender2/index.js";

	const canvas = document.getElementById("wr-canvas");
	const { backend } = await AzWBackend.Base.choose(canvas, { prefer: "webgpu" });

	const world = new WrWorld({ backend });
	const camera = new AzCamera({ position: [0, 1.2, 4.5], near: 0.1, far: 250, fov: 45 });
	camera.lookAt([0, 1, 0]);
	world.setCamera(camera);
```

##### `AzWBackend.Base.choose(canvas, options)`

* Creates a backend for the canvas
* `options`:
	* `prefer`: "webgpu" or "webgl2" - fallback to the other if the preferred is unavailable (99% of the time it will fall back to webgl2)
* Call `backend.resize` when the canvas size changes

## World

##### `new WrWorld({ backend })`

* Creates the runtime scene container
* `backend`:
	* Result of `AzWBackend.Base.choose`
* Keep one world per canvas

##### `world.setBackend(backend)`

* Swaps backend and rebuilds shader variants
* Use when you change backend or context is lost

##### `world.setCamera(camera)`

* Sets the active camera used during render
* Camera is not owned by the world

##### `world.registerShader(id, desc)`

* Stores shader code and render config in the shader store
* `id`:
	* String shader id used by MeshRenderer
* `desc`:
	* `renderCfg`: depth, blend, clear color
	* `wgsl`: WGSL source parts
	* `glsl`: GLSL source parts

##### `world.getShader(id)`

* Returns a shader asset or null

##### `world.removeShader(id)`

* Removes a shader asset from the store

##### `world.loadModelFromURL(url, options)`

* Loads a GLB and returns the root node of that scene
* `options`:
	* `shaderId`: default shader id for MeshRenderer

```js
	const root = await world.loadModelFromURL("/Models/Agnes.glb", {
		shaderId: "wr-default",
	});
```

##### `world.render(root, options)`

* Builds a draw queue and renders it
* `options`:
	* `time`: time value passed to shaders
	* `includeHidden`: render nodes with display false
	* `collectOnly`: build queue but do not draw

## Shaders

```js
	world.registerShader("wr-default", {
		renderCfg: {
			depthTest: true,
			depthWrite: true,
			cull: "back",
			blend: false,
			clearColor: [0.62, 0.72, 0.92, 1],
			clearDepth: 1,
		},
		wgsl: { vertex: { main: "..." }, fragment: { main: "..." } },
		glsl: { vertex: { main: "..." }, fragment: { main: "..." } },
	});
```

## Nodes

##### `world.addNode(parent, index)`

* Creates a node under `parent`
* `parent`:
	* Node id, node object, or null for root
* `index`:
	* Optional child index

##### `world.getNode(id)`

* Returns a node by id or null

##### `world.moveNode(id, newParentId)`

* Re-parents a node
* Keeps the subtree intact

##### `world.deleteNode(id, branch)`

* Deletes one node or the entire branch
* `branch`:
	* true to delete children too

##### `world.copyBranch(fromId, toId)`

* Clones a subtree and keeps component data
* Returns the new root clone

```js
	const cloneRoot = world.addNode(null);
	const clone = world.copyBranch(root.id, cloneRoot.id);
```

## Components

##### `node.addComp(Type)`

* Adds a component to a node
* Returns existing instance if it already exists

##### `node.getComp(Type)`

* Returns a component instance or null

##### `node.removeComp(Type)`

* Removes a component and returns it

```js
	import { WrTransform, WrMeshRenderer, WrLiveSkeleton } from "../WeebRender2/index.js";

	const node = world.addNode(null);
	const tx = node.addComp(WrTransform);
	const mr = node.addComp(WrMeshRenderer);
	const skel = node.addComp(WrLiveSkeleton);
```

## Transform

##### `transform.applyRaw(raw)`

* Applies loader transform data
* `raw`:
	* `local`: local matrix
	* `world`: world matrix fallback

```js
	tx.local = Azm.Mat4.fromTranslation([1, 0, 0]);
	tx.world.set(tx.local);
```

## MeshRenderer

##### `meshRenderer.setCfg(opts)`

* Updates shader, rig, and visibility flags
* `opts`:
	* `shaderId`: shader id string
	* `hasRig`: enable rig lookups
	* `display`: visibility flag

##### `meshRenderer.bindMesh(meshRef, opts)`

* Sets mesh id and pulls basic defaults
* `meshRef`:
	* mesh id or mesh asset
* `opts`:
	* `applyDefaults`: true by default
	* `ensureMorphWeights`: allocate morph weights

##### `meshRenderer.setTexture(slot, textureRef)`

* Assigns a texture to the slot
* `slot`:
	* "albedo" or custom slot
* `textureRef`:
	* texture id or texture asset

##### `meshRenderer.setMorphWeight(name, weight)`

* Sets a single morph weight by name or index

##### `meshRenderer.setMorphExclusive(name, weight)`

* Zeros all weights and sets one target

##### `meshRenderer.getPrimaryMorph()`

* Returns the strongest morph target

```js
	mr.meshId = "mesh_foo";
	mr.setCfg({ shaderId: "wr-default", hasRig: true, display: true });
	mr.setMorphWeight("Smile", 1.0);
	mr.setMorphExclusive("Blink", 0.8);
```

## LiveSkeleton

##### `liveSkeleton.setSkeleton(skeletonRef)`

* Links a skeleton asset by id or object

##### `liveSkeleton.resolveBoneIndex(indexOrName)`

* Finds a bone by name or index

##### `liveSkeleton.setBonePose(indexOrName, matrix)`

* Updates one bone local pose

##### `liveSkeleton.buildPalette(maxBones)`

* Returns a skinning palette for shaders

```js
	const skel = node.addComp(WrLiveSkeleton);
	skel.set("Hips", Azm.Mat4.fromRotationY(0.3));
```

## Rigging flow

Rig lookup is structural, not by id
`MeshRenderer.resolveLiveSkeleton` walks parents to find the nearest LiveSkeleton
If `hasRig` is false it will not look

```js
	const rigRoot = world.addNode(null);
	rigRoot.addComp(WrLiveSkeleton);
	const meshNode = world.addNode(rigRoot.id);
	const mr = meshNode.addComp(WrMeshRenderer);
	mr.setCfg({ hasRig: true });
```

## Render loop

```js
	let t = 0;
	function frame(now) {
		t += Math.max(0, (now - (frame.last ?? now)) * 0.001);
		frame.last = now;

		world.render(root, { time: t });
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
```

* Note: you can store references to nodes, components or assets and apply modifications directly if you wish