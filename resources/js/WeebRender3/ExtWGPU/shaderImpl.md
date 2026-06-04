# ExtWGPU Shader Builder

This is the first shader helper for WR3 WGPU

It does not create a renderer

It does not own pipelines, passes, bind groups, materials, cameras, or meshes

Its job is only:

- take shader source
- resolve `$KEY$` template values
- optionally emit standard WGSL snippets
- create a `GPUShaderModule`
- keep enough metadata to make pipeline creation less painful

WR3 core stays raw and graph driven

ExtWGPU shader builder is a preset helper, not a render architecture

## Goal

Writing full WGSL inside `test3.js` is already getting noisy

The builder should let us keep full shader control while avoiding repeated boilerplate for things that are already known:

- `ExtWGPU.Mesh.STD_VERTEX_BUFFER`
- standard vertex input declarations
- standard material binding shape
- optional skeleton binding shape
- optional morph binding shape
- common type-safe named keys
- bind group location customization

The user still writes the real shader entrypoints

The builder does not hide WebGPU concepts

## Non Goals

Do not build a WR2 shader system again

Do not force object shader versus fullscreen shader identities

Do not force a default scene UBO

Do not assume camera, transform, instance matrix, material, skeleton, or morph exists

Do not create render pipelines automatically in the first pass

Do not generate hidden bind groups

Do not create GLSL or WGL2 support yet

Do not make components know about shader helper classes

## First Class

Create `ExtWGPU/shader.js`

Export:

```js
export class ShaderBuilder {}
export class ShaderModule {}
```

`ShaderBuilder` resolves source

`ShaderModule` stores the created `GPUShaderModule` and resolved metadata

Possible use:

```js
const shader = await ExtWGPU.ShaderBuilder.create({
	backend,
	label: "scene-shader",
	source: await Other.Loader.readWGSL(url),
	keys: {
		sceneGroup: 0,
		sceneBinding: 0,
		materialGroup: 1,
		materialBinding: 0,
		deformGroup: 2,
		boneBinding: 0,
		morphBinding: 1,
	},
});

const module = shader.module;
```

Pipeline creation remains explicit:

```js
const pipeline = device.createRenderPipeline({
	label: "main-pipeline",
	layout,
	vertex: {
		module: shader.module,
		entryPoint: "vs_main",
		buffers: [
			ExtWGPU.Mesh.STD_VERTEX_BUFFER,
			instanceLayout,
		],
	},
	fragment: {
		module: shader.module,
		entryPoint: "fs_main",
		targets: [{ format: backend.format }],
	},
});
```

## Source Shape

The source is normal WGSL

The user writes all entrypoints manually:

```wgsl
$STD_VERTEX_IN$
$STD_MATERIAL$

@vertex
fn vs_main(input: StdVertexIn) -> VertexOut {
	var out: VertexOut;
	out.position = camera.viewProj * model * vec4f(input.position, 1.0);
	out.uv = input.uv;
	return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
	return textureSample($ALBEDO_TEXTURE$, $ALBEDO_SAMPLER$, input.uv) * $ALBEDO_COLOR$;
}
```

The builder replaces keys with WGSL snippets or expressions

The final source must be valid WGSL before `device.createShaderModule`

## Key Types

Keys should support two forms:

### String key

String keys directly expand to strings

```js
keys: {
	"$MODEL$": "instance.model",
}
```

This is useful for simple expression substitution

### Function key

Function keys receive a context object and return a string

```js
keys: {
	"$SKIN_PALETTE$": ({ cfg }) => `skinUBO.matrices`,
}
```

This is required for bind groups and configurable layout snippets

The context should include:

```js
{
	backend,
	device,
	cfg,
	meta,
	builder,
}
```

Function keys are the important part

They let the same shader template place material, skeleton, morph, scene, or user data in different bind groups without hardcoding the binding layout into ExtWGPU

## Resolver Order

Resolve in this order:

1. built-in snippet keys
2. built-in expression keys
3. user keys override built-ins
4. validation for unknown remaining `$KEY$`

User override is important

If the default `$ALBEDO_TEXTURE$` is wrong for a shader, the user can replace it without editing ExtWGPU

## Built In Keys

### Vertex Layout

These keys match `ExtWGPU.Mesh.STD_VERTEX_BUFFER`

```txt
$STD_VERTEX_IN$
$POSITION$
$NORMAL$
$UV$
$TANGENT$
$COLOR$
$BONE_ID$
$BONE_WEIGHT$
```

`$STD_VERTEX_IN$` emits:

```wgsl
struct StdVertexIn {
	@location(0) position: vec3f,
	@location(1) normal: vec3f,
	@location(2) uv: vec2f,
	@location(3) tangent: vec4f,
	@location(4) color: vec4f,
	@location(5) boneID: vec4f,
	@location(6) boneWeight: vec4f,
}
```

Expression keys expand to:

```txt
$POSITION$    input.position
$NORMAL$      input.normal
$UV$          input.uv
$TANGENT$     input.tangent
$COLOR$       input.color
$BONE_ID$     input.boneID
$BONE_WEIGHT$ input.boneWeight
```

The expression keys assume the vertex input variable is named `input`

If the user uses another variable name, they can override these keys:

```js
keys: {
	"$POSITION$": "v.position",
	"$UV$": "v.uv",
}
```

### Material

Material is optional

First pass material shape:

```txt
$STD_MATERIAL$
$ALBEDO_COLOR$
$ALBEDO_TEXTURE$
$ALBEDO_SAMPLER$
```

Default binding cfg:

```js
{
	materialGroup: 1,
	materialBinding: 0,
	albedoTextureBinding: 1,
	albedoSamplerBinding: 2,
}
```

`$STD_MATERIAL$` emits:

```wgsl
struct StdMaterial {
	albedoColor: vec4f,
}

@group(MATERIAL_GROUP) @binding(MATERIAL_BINDING)
var<uniform> material: StdMaterial;

@group(MATERIAL_GROUP) @binding(ALBEDO_TEXTURE_BINDING)
var albedoTexture: texture_2d<f32>;

@group(MATERIAL_GROUP) @binding(ALBEDO_SAMPLER_BINDING)
var albedoSampler: sampler;
```

Expression keys expand to:

```txt
$ALBEDO_COLOR$   material.albedoColor
$ALBEDO_TEXTURE$ albedoTexture
$ALBEDO_SAMPLER$ albedoSampler
```

Material can be extended by user keys:

```js
keys: {
	"$ROUGHNESS$": "material.roughness",
	"$NORMAL_TEXTURE$": "normalTexture",
}
```

The builder should not know what these custom values mean

It only substitutes text

### Skeleton

Skeleton is optional

First pass skeleton shape:

```txt
$STD_SKIN$
$SKIN_PALETTE$
$SKIN_MATRIX$
```

Default cfg:

```js
{
	deformGroup: 2,
	boneBinding: 0,
	maxBones: 128,
}
```

`$STD_SKIN$` emits:

```wgsl
struct StdSkin {
	matrices: array<mat4x4f, MAX_BONES>,
}

@group(DEFORM_GROUP) @binding(BONE_BINDING)
var<storage, read> skin: StdSkin;
```

`$SKIN_PALETTE$` expands to:

```wgsl
skin.matrices
```

`$SKIN_MATRIX$` can expand to a helper function:

```wgsl
fn stdSkinMatrix(boneID: vec4f, boneWeight: vec4f) -> mat4x4f {
	let i0 = u32(boneID.x);
	let i1 = u32(boneID.y);
	let i2 = u32(boneID.z);
	let i3 = u32(boneID.w);
	return skin.matrices[i0] * boneWeight.x
		+ skin.matrices[i1] * boneWeight.y
		+ skin.matrices[i2] * boneWeight.z
		+ skin.matrices[i3] * boneWeight.w;
}
```

Then user code can do:

```wgsl
let skinMat = $SKIN_MATRIX$($BONE_ID$, $BONE_WEIGHT$);
let skinnedPos = skinMat * vec4f($POSITION$, 1.0);
```

This keeps skeleton optional and explicit

If the shader does not include `$STD_SKIN$`, no skeleton binding is emitted

If the shader includes `$SKIN_MATRIX$` without `$STD_SKIN$`, the builder should throw or require user override

### Morph

Morph support should remain minimal until mesh morph data is confirmed

First pass keys:

```txt
$STD_MORPH$
$MORPH_WEIGHTS$
```

Default cfg:

```js
{
	deformGroup: 2,
	morphBinding: 1,
	maxMorphs: 64,
}
```

`$STD_MORPH$` emits:

```wgsl
struct StdMorph {
	weights: array<f32, MAX_MORPHS>,
}

@group(DEFORM_GROUP) @binding(MORPH_BINDING)
var<storage, read> morph: StdMorph;
```

`$MORPH_WEIGHTS$` expands to:

```wgsl
morph.weights
```

Do not solve morph delta layout here yet

Morph deltas are mesh-owned static buffers, so their binding shape depends on how `Mesh` finally stores them

### Scene And Time

Scene data should not be assumed

But the helper can provide optional common snippets:

```txt
$STD_CAMERA$
$VIEW_PROJ$
$VIEW$
$PROJECTION$
$CAMERA_POS$
$TIME$
```

Default cfg:

```js
{
	sceneGroup: 0,
	cameraBinding: 0,
	timeBinding: null,
}
```

`$STD_CAMERA$` emits:

```wgsl
struct StdCamera {
	view: mat4x4f,
	projection: mat4x4f,
	viewProj: mat4x4f,
	position: vec4f,
	time: vec4f,
}

@group(SCENE_GROUP) @binding(CAMERA_BINDING)
var<uniform> camera: StdCamera;
```

Expression keys:

```txt
$VIEW$       camera.view
$PROJECTION$ camera.projection
$VIEW_PROJ$ camera.viewProj
$CAMERA_POS$ camera.position
$TIME$       camera.time.x
```

This does not mean WR3 owns camera state

It only emits a known binding shape if the user wants that preset

## Custom Layouts

The builder must not lock users into the standard mesh layout

Allow:

```js
const shader = await ExtWGPU.ShaderBuilder.create({
	backend,
	source,
	vertex: {
		layouts: [
			ExtWGPU.Mesh.STD_VERTEX_BUFFER,
			instanceLayout,
			customParticleLayout,
		],
	},
	keys: {
		"$PARTICLE_COLOR$": "particle.color",
		"$INSTANCE_MODEL$": "instance.model",
	},
});
```

The builder stores `vertex.layouts`

It does not inject those layouts into any pipeline by itself

Pipeline creation reads them explicitly:

```js
vertex: {
	module: shader.module,
	entryPoint: "vs_main",
	buffers: shader.vertex.layouts,
}
```

This keeps mesh, shader, and pipeline relationship clear

## Key Function API

`ShaderBuilder` should expose a small key registration API:

```js
const builder = new ExtWGPU.ShaderBuilder({ backend });

builder.key("$MY_KEY$", "someExpression");

builder.key("$MY_FUNC$", ({ cfg }) => {
	return `@group(${cfg.group}) @binding(${cfg.binding}) var data: texture_2d<f32>;`;
});

const shader = builder.create({ source, cfg });
```

Static convenience should also exist:

```js
const shader = await ExtWGPU.ShaderBuilder.create({ backend, source, keys, cfg });
```

Rules:

- key names must match `/^\$[A-Z0-9_]+\$/`
- user keys override built-in keys
- function key result must be a string
- unknown keys after resolve are errors
- recursive keys are not resolved in the first pass

No recursive resolve keeps behavior predictable

## Metadata

`ShaderModule` should store:

```js
class ShaderModule {
	constructor(options = {}) {
		this.label = options.label ?? "";
		this.backend = options.backend ?? null;
		this.module = options.module ?? null;
		this.source = options.source ?? "";
		this.resolvedSource = options.resolvedSource ?? "";
		this.vertex = options.vertex ?? {};
		this.bindings = options.bindings ?? {};
		this.keys = options.keys ?? {};
	}
}
```

`bindings` should be informational in the first pass

Example:

```js
bindings: {
	camera: { group: 0, binding: 0 },
	material: { group: 1, binding: 0 },
	albedoTexture: { group: 1, binding: 1 },
	albedoSampler: { group: 1, binding: 2 },
	skin: { group: 2, binding: 0 },
	morph: { group: 2, binding: 1 },
}
```

This helps pipeline layout creation later without making the shader builder own pipeline creation

## Friendly With Mesh

`mesh.js` already exposes:

```js
ExtWGPU.Mesh.STD_VERTEX_BUFFER
ExtWGPU.Mesh.STD_VERTEX_STRIDE
```

Shader builder should mirror that ABI:

```js
ShaderBuilder.STD_VERTEX_IN
ShaderBuilder.STD_VERTEX_KEYS
```

The standard vertex snippet must match the mesh locations exactly:

```txt
0 position  vec3f
1 normal    vec3f
2 uv        vec2f
3 tangent   vec4f
4 color     vec4f
5 boneID    vec4f
6 boneWeight vec4f
```

If this ever changes, mesh and shader snippets must change together

Do not duplicate numeric layout definitions in many places

Prefer importing the semantic layout from `mesh.js` later if we split it out

## Material Bind Groups And Mesh Attach

`Mesh.attach` already supports:

```js
mesh.attach(ctx, parent, {
	materialGroupIndex,
});
```

That means shader material group index must be easy to read:

```js
mesh.attach(ctx, parent, {
	materialGroupIndex: shader.bindings.material.group,
});
```

The builder should not make material bind groups

That belongs to mesh/material helper logic

The builder only tells shader code which group and binding it expects

## Deform Bind Groups And MeshDeform Attach

`MeshDeform.attach` already supports:

```js
deform.attach(ctx, parent, {
	groupIndex,
});
```

That should line up with shader metadata:

```js
deform.attach(ctx, parent, {
	groupIndex: shader.bindings.skin.group,
});
```

Again, the builder does not own the bind group

It only emits source that expects one

## Custom Material Example

User shader:

```wgsl
$STD_VERTEX_IN$
$STD_CAMERA$
$STD_MATERIAL$
$CUSTOM_MATERIAL$

struct Out {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
}

@vertex
fn vs_main(input: StdVertexIn) -> Out {
	var out: Out;
	out.position = $VIEW_PROJ$ * instanceModel * vec4f($POSITION$, 1.0);
	out.uv = $UV$;
	return out;
}

@fragment
fn fs_main(input: Out) -> @location(0) vec4f {
	let base = textureSample($ALBEDO_TEXTURE$, $ALBEDO_SAMPLER$, input.uv) * $ALBEDO_COLOR$;
	return base * $EMISSIVE_COLOR$;
}
```

Builder call:

```js
const shader = await ExtWGPU.ShaderBuilder.create({
	backend,
	source,
	keys: {
		"$CUSTOM_MATERIAL$": ({ cfg }) => `
struct CustomMaterial {
	emissiveColor: vec4f,
}
@group(${cfg.customGroup}) @binding(${cfg.customBinding})
var<uniform> customMaterial: CustomMaterial;
`,
		"$EMISSIVE_COLOR$": "customMaterial.emissiveColor",
	},
	cfg: {
		customGroup: 3,
		customBinding: 0,
	},
});
```

This is the main design point

The builder gives useful defaults without blocking custom data

## Validation

First pass validation should be practical:

- source must be a string
- backend must expose `device`
- unresolved `$KEY$` after replacement is an error
- key callback must return a string
- duplicate keys are overwritten by the last provided value
- optional warning if `$SKIN_MATRIX$` is used without `$STD_SKIN$`
- optional warning if `$ALBEDO_TEXTURE$` is used without `$STD_MATERIAL$`

Do not parse WGSL deeply

Let WebGPU validation report real shader syntax errors

## File Layout

Target files:

```txt
WeebRender3/
  ExtWGPU/
    shader.js
    shaderImpl.md
    index.js
```

`index.js` should export:

```js
export {
	ShaderBuilder,
	ShaderModule,
} from "./shader.js";
```

## First Implementation Scope

Implement only:

- `ShaderBuilder`
- `ShaderModule`
- `ShaderBuilder.create({ backend, source, keys, cfg, label, vertex })`
- key replacement
- unknown key validation
- standard vertex keys
- standard camera keys
- standard material keys
- standard skin keys
- standard morph weight keys
- `device.createShaderModule`

Do not implement:

- pipeline creation
- bind group creation
- texture upload
- GLSL
- WGL2
- shader hot reload
- dependency graph
- recursive templating

## Practical First Test

Rewrite `welcome/shaders/scene4.wgsl` to use:

```wgsl
$STD_VERTEX_IN$
$STD_CAMERA$
$STD_MATERIAL$
```

Keep the existing entrypoints:

- `vs_main`
- `vs_outline`
- `fs_main`
- `fs_outline`
- `vs_gradient`
- `fs_gradient`
- `cs_main`

Then `test3.js` becomes:

```js
const shader = await ExtWGPU.ShaderBuilder.create({
	backend,
	label: "WR3SceneShader",
	source: await Other.Loader.readWGSL(SCENE_SHADER_URL),
	cfg: {
		sceneGroup: 0,
		cameraBinding: 0,
		materialGroup: 1,
		materialBinding: 0,
	},
});

const sceneModule = shader.module;
```

Everything else stays explicit

That is the correct first milestone
