# ExtWGPU Mesh Implementation

`ExtWGPU.Mesh` is the first real high-level helper for WR3.

It exists to package static mesh GPU data, submesh draw ranges, local materials, and local textures into an object that can attach draw nodes into any WR3 graph branch.

The graph still owns execution order.

## Core Idea

```txt
Shader
  Instance optional
    MeshDeform
      Submesh 0 draw
      Submesh 1 draw
      Submesh 2 draw
```

`Mesh` does not own the shader, pipeline, render pass, camera, transform, or instance buffer.

`Mesh` owns mesh-local GPU resources:

- vertex buffer
- index buffer
- morph delta buffers
- skeleton asset when the mesh is rigged
- local texture objects
- local material objects
- submesh metadata

`MeshDeform` owns mesh-wide live deformation data:

- skeleton matrix buffer
- morph weight buffer
- bind group for those buffers

The deform data affects the whole mesh, so it is attached once above all submesh draw nodes.

## Naming

Use:

```js
const deform = mesh.createDeform();
const deformNode = deform.attach(ctx, shaderNode);
mesh.attach(ctx, deformNode);
```

Names:

```js
ExtWGPU.Mesh
ExtWGPU.MeshDeform
ExtWGPU.Submesh
ExtWGPU.Skeleton
ExtWGPU.Material
ExtWGPU.Texture
```

`MeshDeform` is the right name because it covers both skeleton and morph without implying animation or instancing.

## Fixed Vertex Layout

`Mesh` uses one fixed standard vertex layout.

```txt
location 0 position    vec3f
location 1 normal      vec3f
location 2 uv          vec2f
location 3 tangent     vec4f
location 4 color       vec4f
location 5 boneID      vec4f
location 6 boneWeight  vec4f
```

Packed size:

```txt
position    12
normal      12
uv           8
tangent     16
color       16
boneID      16
boneWeight  16
total       96
```

Pipeline descriptor:

```js
const STD_VERTEX_BUFFER = {
	arrayStride: 96,
	attributes: [
		{ shaderLocation: 0, offset: 0, format: "float32x3" },
		{ shaderLocation: 1, offset: 12, format: "float32x3" },
		{ shaderLocation: 2, offset: 24, format: "float32x2" },
		{ shaderLocation: 3, offset: 32, format: "float32x4" },
		{ shaderLocation: 4, offset: 48, format: "float32x4" },
		{ shaderLocation: 5, offset: 64, format: "float32x4" },
		{ shaderLocation: 6, offset: 80, format: "float32x4" },
	],
};
```

Missing data is filled during packing:

```txt
normal      0 1 0
uv          0 0
tangent     1 0 0 1
color       1 1 1 1
boneID      0 0 0 0
boneWeight  0 0 0 0
```

Instance layout is not part of `Mesh`.

If the shader wants instance data, the user binds that before mesh/deform nodes.

## Mesh Shape

```js
class Mesh {
	constructor({ backend, label, vertices, indices, submeshes, materials, textures, skeleton, morphs }) {}

	createDeform(cfg = {}) {}
	attach(ctx, parent, index) {}
	destroy() {}
}
```

Internal shape:

```js
{
	backend,
	label,
	vertexBuffer,
	indexBuffer,
	indexFormat,
	vertexCount,
	indexCount,
	submeshes,
	materials,
	textures,
	skeleton,
	morphs,
	morphBuffers,
	bounds,
}
```

`materials` and `textures` are local arrays or maps.

They are not global stores.

They are not id-mapped.

Submeshes hold direct references.

The skeleton is also stored directly in the mesh.

One mesh can only have one skeleton.

If loaded file data has several source meshes that share one skeleton, the loader should combine them into one `Mesh`.

## Skeleton

Skeleton is mesh-local static rig data.

```js
class Skeleton {
	constructor({ name = "", joints = [], inverseBindMatrices = [] } = {}) {}

	find(name) {}
	index(name) {}
}
```

Shape:

```js
{
	name,
	joints,
	inverseBindMatrices,
	nameToIndex,
}
```

Joint shape:

```js
{
	name,
	parentIndex,
	inverseBindMatrix,
	bindMatrix,
}
```

The skeleton is not a component and not a global asset.

It exists inside the mesh:

```js
mesh.skeleton;
```

This gives `MeshDeform` enough information for:

- bone name lookup
- index lookup
- skeleton math helpers
- writing skin matrices to GPU buffers

`Skeleton` does not own GPU buffers.

`MeshDeform` owns the live GPU buffers.

## Morph Metadata

Morph data has two parts:

- static morph delta buffers in `Mesh`
- live morph weights in `MeshDeform`

Mesh morph metadata should keep names and buffer ranges:

```js
{
	name,
	targets: [
		{
			name,
			positionBuffer,
			normalBuffer,
			tangentBuffer,
			vertexCount,
		},
	],
	nameToIndex,
}
```

The exact storage shape can evolve, but `MeshDeform` must receive enough metadata to do:

```js
deform.setMorph(\"Blink\", 1);
deform.setMorph(0, 0.5);
```

## Texture

Texture is mesh-local GPU data.

```js
class Texture {
	constructor({ backend, label, image, width, height, format, sampler }) {}

	destroy() {}
}
```

Shape:

```js
{
	label,
	texture,
	view,
	sampler,
	width,
	height,
	format,
}
```

This class can be minimal.

It exists only to keep texture GPU resources grouped.

Materials reference the texture object directly:

```js
material.albedoTexture = texture;
```

No texture id is needed.

## Material

Material is lightweight data plus direct texture references.

```js
class Material {
	constructor({
		name = "",
		albedoColor = [1, 1, 1, 1],
		albedoTexture = null,
		normalTexture = null,
		metallicRoughnessTexture = null,
		emissiveTexture = null,
	} = {}) {}
}
```

Shape:

```js
{
	name,
	albedoColor,
	albedoTexture,
	normalTexture,
	metallicRoughnessTexture,
	emissiveTexture,
	extras,
}
```

The material does not use ids.

The material does not know which shader uses it.

The material can optionally cache bind groups later if a material layout is provided.

First version can avoid automatic material bind groups and only preserve material data.

## Submesh

Submesh owns draw range and material reference.

```js
class Submesh {
	constructor({
		name = "",
		indexStart = 0,
		indexCount = 0,
		vertexStart = 0,
		vertexCount = 0,
		material = null,
	} = {}) {}
}
```

Shape:

```js
{
	name,
	indexStart,
	indexCount,
	vertexStart,
	vertexCount,
	material,
	bounds,
}
```

`material` is a direct object reference.

This is intentional.

```js
submesh.material = material;
submesh.material.albedoTexture = texture;
```

## Mesh Attach

`mesh.attach(ctx, parent)` creates draw nodes under `parent`.

If the mesh has three submeshes:

```txt
parent
  Submesh 0 node
    SetBindGroups material optional
    SetBuffers mesh vertex/index
    DrawIndexed range 0
  Submesh 1 node
    SetBindGroups material optional
    SetBuffers mesh vertex/index
    DrawIndexed range 1
  Submesh 2 node
    SetBindGroups material optional
    SetBuffers mesh vertex/index
    DrawIndexed range 2
```

Multiple nodes are fine.

Submeshes are real draw calls.

The attach method should return a small result object:

```js
const draw = mesh.attach(ctx, deformNode);

draw.root;
draw.nodes;
draw.submeshes;
```

Recommended return:

```js
{
	root: firstSubmeshNode,
	nodes: [node0, node1, node2],
	submeshes: mesh.submeshes,
}
```

If there is only one submesh, `nodes` still contains one node.

### Draw Range

Submesh draw should use WebGPU draw range:

```js
new WrWGPU.DrawIndexed({
	indexCount: submesh.indexCount,
	instanceCount: 1,
	firstIndex: submesh.indexStart,
	baseVertex: submesh.vertexStart,
	firstInstance: 0,
});
```

If WR3 `DrawIndexed` does not support all range fields yet, add them there first.

Do not fake submesh drawing by slicing buffers.

## MeshDeform

`MeshDeform` is mesh-wide runtime deformation state.

```js
class MeshDeform {
	constructor(mesh, cfg = {}) {}

	setBone(index, mat4) {}
	setMorph(index, weight) {}
	write() {}
	attach(ctx, parent, index) {}
	destroy() {}
}
```

Shape:

```js
{
	mesh,
	skeleton,
	morphs,
	boneMatrices,
	localBoneMatrices,
	worldBoneMatrices,
	skinMatrices,
	morphWeights,
	boneBuffer,
	morphBuffer,
	bindGroup,
	bindGroupLayout,
}
```

`MeshDeform` is not animation.

It does not advance time.

It only owns buffers and mutation helpers.

`MeshDeform` must hold direct references to mesh static data:

```js
this.mesh = mesh;
this.skeleton = mesh.skeleton;
this.morphs = mesh.morphs;
```

Those references are needed for name lookup and runtime math.

User code decides how to update it:

```js
deform.setBone(3, handMatrix);
deform.setBone("Head", headMatrix);
deform.setMorph(1, 0.75);
deform.setMorph("Smile", 0.75);
deform.write();
```

Recommended methods:

```js
deform.findBone(name)
deform.findMorph(name)
deform.setBone(indexOrName, localMatrix)
deform.setWorldBone(indexOrName, worldMatrix)
deform.setMorph(indexOrName, weight)
deform.updateSkinMatrices()
deform.write()
```

`updateSkinMatrices()` computes:

```txt
skinMatrix = worldBoneMatrix * inverseBindMatrix
```

Then `write()` uploads the current skin and morph data to GPU buffers.

If `MeshDeform` has already been attached, the bind group/node keeps referencing the same GPU buffers, so updates reflect in the next render without rebuilding the graph.

Then graph binding:

```js
const deformNode = deform.attach(ctx, instanceNode);
mesh.attach(ctx, deformNode);
```

## Deform Attach

`deform.attach(ctx, parent)` creates exactly one node.

```txt
parent
  MeshDeform node
    SetBindGroups deform
```

The mesh draw branch attaches below this node.

```txt
Shader
  Instance optional
    MeshDeform
      Draw submesh 0
      Draw submesh 1
```

The single-node rule matters because users may want:

```txt
Shader
  Custom state
    Instance data
      MeshDeform
        Mesh draws
```

Or:

```txt
Shader
  MeshDeform
    Mesh draws
```

Both should work.

The node stores references to bind groups and buffers.

It does not copy deform data.

After attach:

```js
deform.setBone("Spine", spineMatrix);
deform.updateSkinMatrices();
deform.write();
```

The next `ctx.exec` uses the updated GPU buffer data through the same attached node.

## Material Binding

Material binding is submesh-level.

The first implementation can support two modes:

### Data Only

Material data is stored but not automatically bound.

This is enough for loader correctness and future shader builder work.

### Explicit Layout

If the user provides a material bind group layout, `Mesh` can create material bind groups.

```js
const mesh = new ExtWGPU.Mesh({
	backend,
	vertices,
	indices,
	submeshes,
	materials,
	textures,
	materialLayout,
});
```

Then each submesh draw node can add:

```js
new WrWGPU.SetBindGroups([
	{ index: materialGroupIndex, bindGroup: submesh.material.bindGroup },
])
```

Do not hardcode bind group index globally in the mesh.

Use config:

```js
mesh.attach(ctx, parent, {
	materialGroupIndex: 2,
});
```

If no bind group exists, skip material binding.

## Shader Builder Later

Shader builder can later support:

```txt
$STD_VERTEX_LAYOUT$
$STD_MATERIAL$
```

`$STD_MATERIAL$` should emit a fixed material contract, not hidden runtime behavior.

Possible WGSL shape:

```wgsl
struct WrMaterial {
	albedoColor: vec4f,
	flags: vec4u,
}

@group(MATERIAL_GROUP) @binding(0) var<uniform> wrMaterial: WrMaterial;
@group(MATERIAL_GROUP) @binding(1) var wrAlbedoSampler: sampler;
@group(MATERIAL_GROUP) @binding(2) var wrAlbedoTexture: texture_2d<f32>;
```

Exact group index cannot be hardcoded by the builder unless the user asks for it.

Better:

```js
ExtWGPU.ShaderBuilder.build({
	materialGroup: 2,
	code: `$STD_MATERIAL$`,
});
```

The mesh should not depend on this builder existing.

## Local Asset Management

`Mesh` owns local assets because global stores are unnecessary here.

```js
mesh.textures = [];
mesh.materials = [];
mesh.submeshes = [];
```

Direct references are enough:

```js
const tex = mesh.textures[0];
const mat = mesh.materials[0];
mat.albedoTexture = tex;
mesh.submeshes[0].material = mat;
```

This is simpler than:

```txt
submesh.materialId -> store.materials -> material.textureId -> store.textures
```

WR3 is JavaScript.

Direct object references are the clean path.

## Loader Direction

The loader should create a `Mesh`, not a scene.

```js
const mesh = await ExtWGPU.Loader.loadMeshFromURL(url, { backend });
```

Loader maps GLTF primitives to submeshes:

```txt
gltf mesh primitive -> ExtWGPU.Submesh
gltf material       -> ExtWGPU.Material
gltf image/texture  -> ExtWGPU.Texture
```

Skin and morph data become mesh metadata and optional `MeshDeform` capacity.

The loader does not attach the mesh to the graph.

### Shared Skeleton Merge Rule

If several source meshes share the same skeleton, the loader combines them into one `Mesh`.

That combined mesh has:

- one vertex buffer
- one index buffer
- one skeleton asset
- one material list
- one texture list
- many submeshes

Each source primitive becomes a submesh range.

The submesh name should preserve the original mesh/primitive name:

```txt
source mesh "Body" primitive 0 -> submesh "Body"
source mesh "Hair" primitive 0 -> submesh "Hair"
source mesh "Dress" primitive 1 -> submesh "Dress.1"
```

This matters because a single skeleton controls the full combined vertex/index data.

It also keeps rendering simple:

```txt
MeshDeform
  Draw Body
  Draw Hair
  Draw Dress.1
```

The deform object affects all of them.

If source meshes do not share a skeleton, the loader should create separate `Mesh` objects.

Do not support multiple skeletons inside one `Mesh`.

That state is not worth representing.

### Future Model Context

Later, `ExtWGPU.Model` can contain a tiny runtime hierarchy and many meshes.

That future model can organize:

- nodes
- transforms
- mesh attachments
- runtime branch configuration

For now, assume `Model` does not exist.

Focus only on `Mesh`, `Skeleton`, `MeshDeform`, submeshes, textures, and materials.

## Usage

```js
const mesh = await ExtWGPU.Loader.loadMeshFromURL("/Models/naku.glb", {
	backend,
});

const deform = mesh.createDeform();

const shaderNode = pass.addChild();
shaderNode.addComp(new WrWGPU.UsePipeline(pipeline));
shaderNode.addComp(new WrWGPU.SetBindGroups([
	{ index: 0, bindGroup: sceneBG },
]));

const deformNode = deform.attach(ctx, shaderNode, {
	groupIndex: 1,
});

mesh.attach(ctx, deformNode, {
	materialGroupIndex: 2,
});
```

Graph:

```txt
RenderPass
  Shader
    MeshDeform
      Submesh 0
      Submesh 1
      Submesh 2
```

With instances:

```js
const instanceNode = shaderNode.addChild();
instanceNode.addComp(new WrWGPU.SetBuffers({
	vertex: [
		{ slot: 1, buffer: instanceBuffer },
	],
}));

const deformNode = deform.attach(ctx, instanceNode);
mesh.attach(ctx, deformNode);
```

Graph:

```txt
RenderPass
  Shader
    Instance
      MeshDeform
        Submesh 0
        Submesh 1
```

## Implementation Order

1. Add `mesh.js`
2. Add `Texture`, `Material`, `Submesh`, `Mesh`, `MeshDeform`
3. Export them from `ExtWGPU/index.js`
4. Add standard vertex layout constants
5. Implement `Mesh` constructor with direct resource assignment
6. Implement `Mesh.attach`
7. Add draw range support to `WrWGPU.DrawIndexed` if missing
8. Implement `MeshDeform` empty buffers and `attach`
9. Add material data references without bind group creation
10. Add optional material bind group creation
11. Add a hardcoded mesh test
12. Add loader support after the graph behavior is proven

## Boundary

`Mesh` may create:

- `GPUBuffer`
- `GPUTexture`
- `GPUSampler`
- `GPUBindGroup` when layout is provided
- WR3 nodes for submesh draws

`Mesh` must not create:

- render pipeline
- compute pipeline
- render pass
- execution state
- camera
- transform system
- hidden instance buffer
- animation controller
- global asset store

This keeps WR3 flexible while making real mesh rendering less painful.

