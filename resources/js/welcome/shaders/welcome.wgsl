struct Scene {
	viewProj: mat4x4f,
	lightDir: vec4f,
	time: vec4f,
}

@group(0) @binding(0) var<uniform> scene: Scene;
$SKIN_BIND$
$MORPH_BIND$
$MATERIAL_BIND$
$INSTANCE_BIND$
$SKIN_FN$

struct VertexIn {
$VERTEX_FIELDS$
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
fn vs_main(input: VertexIn, @builtin(instance_index) instanceIndex: u32) -> VertexOut {
	let inst = instances[instanceIndex];
	let skinMat = vertexSkin(input);
	let localPos = skinMat * vec4f(input.position, 1.0);
	let localNrm = normalize((skinMat * vec4f(input.normal, 0.0)).xyz);
	var out: VertexOut;
	out.position = scene.viewProj * inst.modelMat * localPos;
	out.uv = input.uv;
	out.normal = normalize((inst.modelMat * vec4f(localNrm, 0.0)).xyz);
	return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
	let tex = textureSample(albedoTexture, albedoSampler, input.uv);
	return tex * material.albedoColor;
}

@vertex
fn vs_outline(input: VertexIn, @builtin(instance_index) instanceIndex: u32) -> VertexOut {
	let inst = instances[instanceIndex];
	let skinMat = vertexSkin(input);
	let localPos = skinMat * vec4f(input.position, 1.0);
	let localNrm = normalize((skinMat * vec4f(input.normal, 0.0)).xyz);
	let worldNrm = normalize((inst.modelMat * vec4f(localNrm, 0.0)).xyz);
	let worldPos = (inst.modelMat * localPos).xyz + worldNrm * inst.outlineThickness.x;
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
