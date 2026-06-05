struct Scene {
	viewProj: mat4x4f,
	lightDir: vec4f,
	time: vec4f,
}

@group(0) @binding(0) var<uniform> scene: Scene;

struct Skin {
	matrices: array<mat4x4f, 128>,
}

@group(1) @binding(0) var<storage, read> skin: Skin;

struct Morph {
	weights: array<f32, 64>,
}

@group(1) @binding(1) var<storage, read> morph: Morph;

struct Material {
	albedoColor: vec4f,
}

@group(2) @binding(0) var<uniform> material: Material;
@group(2) @binding(1) var albedoTexture: texture_2d<f32>;
@group(2) @binding(2) var albedoSampler: sampler;

struct Model {
	modelMat: mat4x4f,
	outlineThickness: vec4f,
	defaultSlot1: vec4f,
	defaultSlot2: vec4f,
	defaultSlot3: vec4f,
}

@group(3) @binding(0) var<uniform> model: Model;

fn skinMatrix(boneID: vec4f, boneWeight: vec4f) -> mat4x4f {
	let i0 = u32(boneID.x);
	let i1 = u32(boneID.y);
	let i2 = u32(boneID.z);
	let i3 = u32(boneID.w);
	return skin.matrices[i0] * boneWeight.x
		+ skin.matrices[i1] * boneWeight.y
		+ skin.matrices[i2] * boneWeight.z
		+ skin.matrices[i3] * boneWeight.w;
}

struct VertexIn {
	@location(0) position: vec3f,
	@location(1) normal: vec3f,
	@location(2) uv: vec2f,
	@location(3) tangent: vec4f,
	@location(4) color: vec4f,
	@location(5) boneID: vec4f,
	@location(6) boneWeight: vec4f,
}

struct VertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
	@location(1) normal: vec3f,
}

fn identity4() -> mat4x4f {
	return mat4x4f(
		vec4f(1.0, 0.0, 0.0, 0.0),
		vec4f(0.0, 1.0, 0.0, 0.0),
		vec4f(0.0, 0.0, 1.0, 0.0),
		vec4f(0.0, 0.0, 0.0, 1.0)
	);
}

fn vertexSkin(input: VertexIn) -> mat4x4f {
	let wsum = input.boneWeight.x + input.boneWeight.y + input.boneWeight.z + input.boneWeight.w;
	if (wsum <= 0.00001) {
		return identity4();
	}
	return skinMatrix(input.boneID, input.boneWeight);
}

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
	let skinMat = vertexSkin(input);
	let localPos = skinMat * vec4f(input.position, 1.0);
	let localNrm = normalize((skinMat * vec4f(input.normal, 0.0)).xyz);
	var out: VertexOut;
	out.position = scene.viewProj * model.modelMat * localPos;
	out.uv = input.uv;
	out.normal = normalize((model.modelMat * vec4f(localNrm, 0.0)).xyz);
	return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
	let tex = textureSample(albedoTexture, albedoSampler, input.uv);
	let lit = max(0.18, dot(normalize(input.normal), normalize(scene.lightDir.xyz)));
	let rgb = tex.rgb * material.albedoColor.rgb * (0.62 + 0.38 * lit);
	return vec4f(rgb, tex.a * material.albedoColor.a);
}

@vertex
fn vs_outline(input: VertexIn) -> VertexOut {
	let skinMat = vertexSkin(input);
	let localPos = skinMat * vec4f(input.position, 1.0);
	let localNrm = normalize((skinMat * vec4f(input.normal, 0.0)).xyz);
	let worldNrm = normalize((model.modelMat * vec4f(localNrm, 0.0)).xyz);
	let worldPos = (model.modelMat * localPos).xyz + worldNrm * model.outlineThickness.x;
	var out: VertexOut;
	out.position = scene.viewProj * vec4f(worldPos, 1.0);
	out.uv = input.uv;
	out.normal = worldNrm;
	return out;
}

@fragment
fn fs_outline(_input: VertexOut) -> @location(0) vec4f {
	return vec4f(0.025, 0.018, 0.04, 1.0);
}
