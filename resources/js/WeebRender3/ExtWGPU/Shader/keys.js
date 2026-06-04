import { STD_VERTEX_BUFFER } from "../mesh.js";

const KEY_PATTERN = /^\$[A-Z0-9_]+\$/;
const FIND_KEYS = /\$[A-Z0-9_]+\$/g;

function num(value, fallback) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function standardVertexFields() {
	const names = [
		"position",
		"normal",
		"uv",
		"tangent",
		"color",
		"boneID",
		"boneWeight",
	];
	return STD_VERTEX_BUFFER.attributes
		.map((attr, index) => `\t@location(${attr.shaderLocation}) ${names[index]}: ${wgslTypeOf(attr.format)},`)
		.join("\n");
}

function wgslTypeOf(format) {
	if (format === "float32") return "f32";
	if (format === "float32x2") return "vec2f";
	if (format === "float32x3") return "vec3f";
	if (format === "float32x4") return "vec4f";
	if (format === "uint32") return "u32";
	if (format === "uint32x2") return "vec2u";
	if (format === "uint32x3") return "vec3u";
	if (format === "uint32x4") return "vec4u";
	if (format === "sint32") return "i32";
	if (format === "sint32x2") return "vec2i";
	if (format === "sint32x3") return "vec3i";
	if (format === "sint32x4") return "vec4i";
	return "vec4f";
}

function stdCamera(ctx) {
	const cfg = ctx.cfg;
	const group = num(cfg.sceneGroup, 0);
	const binding = num(cfg.cameraBinding, 0);
	return `struct StdCamera {
\tview: mat4x4f,
\tprojection: mat4x4f,
\tviewProj: mat4x4f,
\tposition: vec4f,
\ttime: vec4f,
}

@group(${group}) @binding(${binding}) var<uniform> camera: StdCamera;`;
}

function stdMaterial(ctx) {
	const cfg = ctx.cfg;
	const group = num(cfg.materialGroup, 1);
	const materialBinding = num(cfg.materialBinding, 0);
	const textureBinding = num(cfg.albedoTextureBinding, 1);
	const samplerBinding = num(cfg.albedoSamplerBinding, 2);
	ctx.meta.bindings.material = { group, binding: materialBinding };
	ctx.meta.bindings.albedoTexture = { group, binding: textureBinding };
	ctx.meta.bindings.albedoSampler = { group, binding: samplerBinding };
	return `struct StdMaterial {
\talbedoColor: vec4f,
}

@group(${group}) @binding(${materialBinding}) var<uniform> material: StdMaterial;
@group(${group}) @binding(${textureBinding}) var albedoTexture: texture_2d<f32>;
@group(${group}) @binding(${samplerBinding}) var albedoSampler: sampler;`;
}

function stdSkin(ctx) {
	const cfg = ctx.cfg;
	const group = num(cfg.deformGroup, 2);
	const binding = num(cfg.boneBinding, 0);
	const maxBones = Math.max(1, num(cfg.maxBones, 128) | 0);
	ctx.meta.bindings.skin = { group, binding };
	return `struct StdSkin {
\tmatrices: array<mat4x4f, ${maxBones}>,
}

@group(${group}) @binding(${binding}) var<storage, read> skin: StdSkin;`;
}

function stdSkinMatrix() {
	return `stdSkinMatrix`;
}

function stdSkinMatrixFn() {
	return `fn stdSkinMatrix(boneID: vec4f, boneWeight: vec4f) -> mat4x4f {
\tlet i0 = u32(boneID.x);
\tlet i1 = u32(boneID.y);
\tlet i2 = u32(boneID.z);
\tlet i3 = u32(boneID.w);
\treturn skin.matrices[i0] * boneWeight.x
\t\t+ skin.matrices[i1] * boneWeight.y
\t\t+ skin.matrices[i2] * boneWeight.z
\t\t+ skin.matrices[i3] * boneWeight.w;
}`;
}

function stdMorph(ctx) {
	const cfg = ctx.cfg;
	const group = num(cfg.deformGroup, 2);
	const binding = num(cfg.morphBinding, 1);
	const maxMorphs = Math.max(1, num(cfg.maxMorphs, 64) | 0);
	ctx.meta.bindings.morph = { group, binding };
	return `struct StdMorph {
\tweights: array<f32, ${maxMorphs}>,
}

@group(${group}) @binding(${binding}) var<storage, read> morph: StdMorph;`;
}

export function builtInKeys() {
	const vertexFields = standardVertexFields();
	return new Map([
		["$STD_VERTEX_FIELDS$", vertexFields],
		["$STD_VERTEX_IN$", `struct StdVertexIn {\n${vertexFields}\n}`],
		["$POSITION$", "input.position"],
		["$NORMAL$", "input.normal"],
		["$UV$", "input.uv"],
		["$TANGENT$", "input.tangent"],
		["$COLOR$", "input.color"],
		["$BONE_ID$", "input.boneID"],
		["$BONE_WEIGHT$", "input.boneWeight"],
		["$STD_CAMERA$", stdCamera],
		["$VIEW$", "camera.view"],
		["$PROJECTION$", "camera.projection"],
		["$VIEW_PROJ$", "camera.viewProj"],
		["$CAMERA_POS$", "camera.position"],
		["$TIME$", "camera.time.x"],
		["$STD_MATERIAL$", stdMaterial],
		["$STD_MATERIAL_EXT$", ""],
		["$ALBEDO_COLOR$", "material.albedoColor"],
		["$ALBEDO_TEXTURE$", "albedoTexture"],
		["$ALBEDO_SAMPLER$", "albedoSampler"],
		["$STD_SKIN$", stdSkin],
		["$SKIN_PALETTE$", "skin.matrices"],
		["$STD_SKIN_MATRIX_FN$", stdSkinMatrixFn],
		["$SKIN_MATRIX$", stdSkinMatrix],
		["$STD_MORPH$", stdMorph],
		["$STD_DEFORM_EXT$", ""],
		["$MORPH_WEIGHTS$", "morph.weights"],
	]);
}

export function assertKeyName(key) {
	if (!KEY_PATTERN.test(String(key ?? ""))) {
		throw new Error(`[ExtWGPU.ShaderBuilder] invalid key "${key}"`);
	}
}

export function findKeys(source) {
	return Array.from(new Set(String(source ?? "").match(FIND_KEYS) ?? []));
}
