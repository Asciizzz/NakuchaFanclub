const WR_LINK_RESERVED = new Set([
	"input",
	"output",
	"outputColor",
	"gl_Position",
	"fragColor",
	"wr_position",
	"wr_normal",
	"wr_uv",
	"wr_tangent",
	"wr_boneID",
	"wr_boneWeight",
	"wr_morphPos",
]);

const WR_SHADER_KEYS = Object.freeze([
	"$POSITION$",
	"$NORMAL$",
	"$UV$",
	"$TANGENT$",
	"$BONE_ID$",
	"$BONE_WEIGHT$",
	"$MORPH_POS$",
	"$MORPH_WEIGHT$",
	"$INST_MODEL$",
	"$INST_DATA0$",
	"$INST_DATA1$",
	"$INST_DATA2$",
	"$INST_DATA3$",
	"$VIEW$",
	"$PROJECTION$",
	"$TIME$",
	"$DELTA_TIME$",
	"$SKIN_PALETTE$",
	"$VTX_FLAGS$",
	"$HAS_RIG$",
	"$HAS_MORPH$",
	"$HAS_UV$",
	"$HAS_NORMAL$",
	"$HAS_COLOR$",
	"$HAS_BONE$",
	"$HAS_TANGENT$",
	"$MORPH_HAS_POS$",
	"$MORPH_HAS_NORMAL$",
	"$MORPH_HAS_TANGENT$",
	"$ALBEDO_TEX$",
	"$ALBEDO_COLOR$",
	"$OUT_COLOR$",
]);

const WR_KEY_SET = new Set(WR_SHADER_KEYS);

const WR_STAGE_KEYS = Object.freeze({
	vertex: new Set([
		"$POSITION$",
		"$NORMAL$",
		"$UV$",
		"$TANGENT$",
		"$BONE_ID$",
		"$BONE_WEIGHT$",
		"$MORPH_POS$",
		"$MORPH_WEIGHT$",
		"$INST_MODEL$",
		"$INST_DATA0$",
		"$INST_DATA1$",
		"$INST_DATA2$",
		"$INST_DATA3$",
		"$VIEW$",
		"$PROJECTION$",
		"$TIME$",
		"$DELTA_TIME$",
		"$SKIN_PALETTE$",
		"$VTX_FLAGS$",
		"$HAS_RIG$",
		"$HAS_MORPH$",
		"$HAS_UV$",
		"$HAS_NORMAL$",
		"$HAS_COLOR$",
		"$HAS_BONE$",
		"$HAS_TANGENT$",
		"$MORPH_HAS_POS$",
		"$MORPH_HAS_NORMAL$",
		"$MORPH_HAS_TANGENT$",
	]),
	fragment: new Set([
		"$UV$",
		"$VIEW$",
		"$PROJECTION$",
		"$TIME$",
		"$DELTA_TIME$",
		"$ALBEDO_TEX$",
		"$ALBEDO_COLOR$",
		"$OUT_COLOR$",
		"$VTX_FLAGS$",
		"$HAS_RIG$",
		"$HAS_MORPH$",
		"$HAS_UV$",
		"$HAS_NORMAL$",
		"$HAS_COLOR$",
		"$HAS_BONE$",
		"$HAS_TANGENT$",
		"$MORPH_HAS_POS$",
		"$MORPH_HAS_NORMAL$",
		"$MORPH_HAS_TANGENT$",
		"$INST_DATA0$",
		"$INST_DATA1$",
		"$INST_DATA2$",
		"$INST_DATA3$",
	]),
});

const WR_DEFAULT_RENDER_CFG = Object.freeze({
	topology: "triangle-list",
	frontFace: "ccw",
	cull: "back",
	depthTest: true,
	depthWrite: true,
	depthCompare: "less",
	blend: false,
	colorWriteMask: Object.freeze([true, true, true, true]),
});

const WR_WGPU_BLEND_ALPHA = Object.freeze({
	color: {
		srcFactor: "src-alpha",
		dstFactor: "one-minus-src-alpha",
		operation: "add",
	},
	alpha: {
		srcFactor: "one",
		dstFactor: "one-minus-src-alpha",
		operation: "add",
	},
});

const WR_WGPU_VERTEX_LAYOUT = Object.freeze({
	arrayStride: 76,
	stepMode: "vertex",
	attributes: Object.freeze([
		Object.freeze({ shaderLocation: 0, offset: 0, format: "float32x3" }),
		Object.freeze({ shaderLocation: 1, offset: 12, format: "float32x3" }),
		Object.freeze({ shaderLocation: 2, offset: 24, format: "float32x2" }),
		Object.freeze({ shaderLocation: 3, offset: 32, format: "float32x4" }),
		Object.freeze({ shaderLocation: 4, offset: 48, format: "float32x4" }),
		Object.freeze({ shaderLocation: 5, offset: 64, format: "float32x3" }),
	]),
});

function asText(value, fallback = "") {
	const text = String(value ?? "").trim();
	return text.length > 0 ? text : fallback;
}

function asBool(value, fallback = false) {
	if (value == null) return fallback;
	return !!value;
}

function asList(value) {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

function toNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function normalizeDepthCompare(value) {
	const raw = asText(value, "less").toLowerCase();
	if (raw === "never") return "never";
	if (raw === "less") return "less";
	if (raw === "equal") return "equal";
	if (raw === "less-equal" || raw === "lequal") return "less-equal";
	if (raw === "greater") return "greater";
	if (raw === "greater-equal" || raw === "gequal") return "greater-equal";
	if (raw === "not-equal" || raw === "notequal") return "not-equal";
	if (raw === "always") return "always";
	return "less";
}

function normalizeTopology(value) {
	const raw = asText(value, "triangle-list").toLowerCase();
	if (raw === "point-list") return "point-list";
	if (raw === "line-list") return "line-list";
	if (raw === "line-strip") return "line-strip";
	if (raw === "triangle-strip") return "triangle-strip";
	return "triangle-list";
}

function normalizeFrontFace(value) {
	const raw = asText(value, "ccw").toLowerCase();
	return raw === "cw" ? "cw" : "ccw";
}

function normalizeCull(value) {
	const raw = asText(value, "back").toLowerCase();
	if (raw === "front") return "front";
	if (raw === "none" || raw === "off" || raw === "disable" || raw === "disabled") return "none";
	return "back";
}

function normalizeColorWriteMask(value) {
	if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return [true, true, true, true];
	return [
		!!value[0],
		!!value[1],
		!!value[2],
		!!value[3],
	];
}

function inferGlslFromWgsl(type) {
	const t = asText(type);
	if (t === "f32") return "float";
	if (t === "i32") return "int";
	if (t === "u32") return "uint";
	if (t === "vec2f") return "vec2";
	if (t === "vec3f") return "vec3";
	if (t === "vec4f") return "vec4";
	if (t === "mat3x3f") return "mat3";
	if (t === "mat4x4f") return "mat4";
	return "vec4";
}

function inferWgslFromGlsl(type) {
	const t = asText(type);
	if (t === "float") return "f32";
	if (t === "int") return "i32";
	if (t === "uint") return "u32";
	if (t === "vec2") return "vec2f";
	if (t === "vec3") return "vec3f";
	if (t === "vec4") return "vec4f";
	if (t === "mat3") return "mat3x3f";
	if (t === "mat4") return "mat4x4f";
	return "vec4f";
}

function defaultWgslLiteral(type) {
	const t = asText(type);
	if (t === "f32") return "0.0";
	if (t === "i32") return "0";
	if (t === "u32") return "0u";
	if (t === "vec2f") return "vec2f(0.0, 0.0)";
	if (t === "vec3f") return "vec3f(0.0, 0.0, 0.0)";
	if (t === "vec4f") return "vec4f(0.0, 0.0, 0.0, 0.0)";
	if (t === "mat3x3f") return "mat3x3f(1.0)";
	if (t === "mat4x4f") return "mat4x4f(1.0)";
	return "vec4f(0.0, 0.0, 0.0, 0.0)";
}

function defaultGlslLiteral(type) {
	const t = asText(type);
	if (t === "float") return "0.0";
	if (t === "int") return "0";
	if (t === "uint") return "0u";
	if (t === "vec2") return "vec2(0.0, 0.0)";
	if (t === "vec3") return "vec3(0.0, 0.0, 0.0)";
	if (t === "vec4") return "vec4(0.0, 0.0, 0.0, 0.0)";
	if (t === "mat3") return "mat3(1.0)";
	if (t === "mat4") return "mat4(1.0)";
	return "vec4(0.0, 0.0, 0.0, 0.0)";
}

function assertLinkName(name) {
	const clean = asText(name);
	if (!clean) throw new Error("[WrShader] link name is required");
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean)) {
		throw new Error(`[WrShader] invalid link name "${clean}"`);
	}
	if (WR_LINK_RESERVED.has(clean)) {
		throw new Error(`[WrShader] link name "${clean}" is reserved`);
	}
	return clean;
}

function parseTypePair(raw, preferredLang) {
	const input = raw && typeof raw === "object" ? raw : {};
	const direct = asText(input.type);
	let inferredWgsl = "";
	let inferredGlsl = "";
	if (direct) {
		if (direct === "f32" || direct === "i32" || direct === "u32" || direct.startsWith("vec") && direct.endsWith("f") || direct.startsWith("mat") && direct.endsWith("f")) {
			inferredWgsl = direct;
		} else if (
			direct === "float" ||
			direct === "int" ||
			direct === "uint" ||
			direct === "vec2" ||
			direct === "vec3" ||
			direct === "vec4" ||
			direct === "mat3" ||
			direct === "mat4"
		) {
			inferredGlsl = direct;
		} else if (preferredLang === "wgsl") {
			inferredWgsl = direct;
		} else {
			inferredGlsl = direct;
		}
	}

	const wgslTypeRaw = asText(input.wgslType || input.type?.wgsl || inferredWgsl);
	const glslTypeRaw = asText(input.glslType || input.type?.glsl || inferredGlsl);

	if (wgslTypeRaw && glslTypeRaw) {
		return { wgslType: wgslTypeRaw, glslType: glslTypeRaw };
	}
	if (wgslTypeRaw) {
		return { wgslType: wgslTypeRaw, glslType: inferGlslFromWgsl(wgslTypeRaw) };
	}
	if (glslTypeRaw) {
		return { wgslType: inferWgslFromGlsl(glslTypeRaw), glslType: glslTypeRaw };
	}
	return { wgslType: "vec4f", glslType: "vec4" };
}

function normalizeOneLink(raw, index, preferredLang) {
	const source = raw && typeof raw === "object" ? raw : { name: raw };
	const name = assertLinkName(source.name ?? `link${index}`);
	const pair = parseTypePair(source, preferredLang);
	const defaultWgsl = asText(source.defaultWgsl, defaultWgslLiteral(pair.wgslType));
	const defaultGlsl = asText(source.defaultGlsl, defaultGlslLiteral(pair.glslType));
	return {
		name,
		fieldName: `wr_link_${name}`,
		wgslType: pair.wgslType,
		glslType: pair.glslType,
		defaultWgsl,
		defaultGlsl,
	};
}

function normalizeLinksByLanguage(links, preferredLang) {
	const out = [];
	const seen = new Set();
	const list = asList(links);
	for (let i = 0; i < list.length; i += 1) {
		const link = normalizeOneLink(list[i], i, preferredLang);
		if (seen.has(link.name)) throw new Error(`[WrShader] duplicate link name "${link.name}"`);
		seen.add(link.name);
		out.push(link);
	}
	return out;
}

function mergeLinks(wgslLinks, glslLinks) {
	if (wgslLinks.length <= 0 && glslLinks.length <= 0) return [];
	if (wgslLinks.length <= 0) return glslLinks.map((link) => ({ ...link }));
	if (glslLinks.length <= 0) return wgslLinks.map((link) => ({ ...link }));

	if (wgslLinks.length !== glslLinks.length) {
		throw new Error("[WrShader] wgsl/glsl link count mismatch");
	}

	const out = [];
	for (let i = 0; i < wgslLinks.length; i += 1) {
		const a = wgslLinks[i];
		const b = glslLinks[i];
		if (a.name !== b.name) {
			throw new Error(`[WrShader] link mismatch at index ${i}: "${a.name}" vs "${b.name}"`);
		}
		out.push({
			name: a.name,
			fieldName: `wr_link_${a.name}`,
			wgslType: a.wgslType,
			glslType: b.glslType,
			defaultWgsl: a.defaultWgsl,
			defaultGlsl: b.defaultGlsl,
		});
	}
	return out;
}

function normalizeMethods(value) {
	if (typeof value === "string") {
		const text = value.trim();
		return text ? [text] : [];
	}
	if (!Array.isArray(value)) return [];
	const out = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		const text = item.trim();
		if (!text) continue;
		out.push(text);
	}
	return out;
}

function ensureStageMain(main, label) {
	const text = asText(main);
	if (!text) throw new Error(`[WrShader] ${label} main is required`);
	return text;
}

function extractTemplateKeys(source) {
	const text = String(source ?? "");
	const found = text.match(/\$[A-Z0-9_]+\$/g) ?? [];
	return Array.from(new Set(found));
}

function validateTemplateKeys(source, stage) {
	const stageName = asText(stage).toLowerCase();
	const allowed = WR_STAGE_KEYS[stageName];
	if (!allowed) throw new Error(`[WrShader] unknown stage "${stage}"`);

	const keys = extractTemplateKeys(source);
	for (const key of keys) {
		if (!WR_KEY_SET.has(key)) throw new Error(`[WrShader] unknown template key "${key}"`);
		if (!allowed.has(key)) throw new Error(`[WrShader] key "${key}" is not valid in ${stageName}`);
	}
	return keys;
}

function replaceTemplateKeys(source, stage, keyMap) {
	const text = String(source ?? "");
	const stageName = asText(stage).toLowerCase();
	const keys = validateTemplateKeys(text, stageName);
	let out = text;
	for (const key of keys) {
		if (!Object.prototype.hasOwnProperty.call(keyMap ?? {}, key)) {
			throw new Error(`[WrShader] missing replacement for "${key}" in ${stageName}`);
		}
		const raw = keyMap[key];
		let next = raw;
		if (raw && typeof raw === "object" && !Array.isArray(raw)) {
			next = raw[stageName] ?? raw.default ?? null;
		}
		if (next == null) throw new Error(`[WrShader] missing stage replacement for "${key}" in ${stageName}`);
		out = out.split(key).join(String(next));
	}
	return out;
}

function defaultKeyMapWgsl() {
	return {
		"$POSITION$": "wr_position",
		"$NORMAL$": "wr_normal",
		"$UV$": "wr_uv",
		"$TANGENT$": "wr_tangent",
		"$BONE_ID$": "wr_boneID",
		"$BONE_WEIGHT$": "wr_boneWeight",
		"$MORPH_POS$": "wr_morphPos",
		"$MORPH_WEIGHT$": "objectUBO.extras.x",
		"$INST_MODEL$": "objectUBO.model",
		"$INST_DATA0$": "objectUBO.slot0",
		"$INST_DATA1$": "objectUBO.albedoColor",
		"$INST_DATA2$": "objectUBO.vtxFlags",
		"$INST_DATA3$": "objectUBO.extras",
		"$VIEW$": "sceneUBO.view",
		"$PROJECTION$": "sceneUBO.projection",
		"$TIME$": "sceneUBO.time.x",
		"$DELTA_TIME$": "sceneUBO.time.y",
		"$SKIN_PALETTE$": "objectUBO.skinPalette",
		"$VTX_FLAGS$": "objectUBO.vtxFlags",
		"$HAS_RIG$": "(objectUBO.vtxFlags.x > 0.5)",
		"$HAS_MORPH$": "(objectUBO.vtxFlags.y > 0.5)",
		"$HAS_UV$": "(objectUBO.vtxFlags.z > 0.5)",
		"$HAS_NORMAL$": "(objectUBO.vtxFlags.w > 0.5)",
		"$HAS_COLOR$": "(objectUBO.slot0.x > 0.5)",
		"$HAS_BONE$": "(objectUBO.slot0.y > 0.5)",
		"$HAS_TANGENT$": "(objectUBO.slot0.z > 0.5)",
		"$MORPH_HAS_POS$": "(objectUBO.extras.y > 0.5)",
		"$MORPH_HAS_NORMAL$": "(objectUBO.extras.z > 0.5)",
		"$MORPH_HAS_TANGENT$": "(objectUBO.extras.w > 0.5)",
		"$ALBEDO_TEX$": "albedoTex",
		"$ALBEDO_COLOR$": "objectUBO.albedoColor",
		"$OUT_COLOR$": "outputColor",
	};
}

function defaultKeyMapGlsl() {
	return {
		"$POSITION$": "wr_position",
		"$NORMAL$": "wr_normal",
		"$UV$": "wr_uv",
		"$TANGENT$": "wr_tangent",
		"$BONE_ID$": "wr_boneID",
		"$BONE_WEIGHT$": "wr_boneWeight",
		"$MORPH_POS$": "wr_morphPos",
		"$MORPH_WEIGHT$": "u_extras.x",
		"$INST_MODEL$": "u_model",
		"$INST_DATA0$": "u_slot0",
		"$INST_DATA1$": "u_albedoColor",
		"$INST_DATA2$": "u_vtxFlags",
		"$INST_DATA3$": "u_extras",
		"$VIEW$": "u_view",
		"$PROJECTION$": "u_projection",
		"$TIME$": "u_time.x",
		"$DELTA_TIME$": "u_time.y",
		"$SKIN_PALETTE$": "u_skinPalette",
		"$VTX_FLAGS$": "u_vtxFlags",
		"$HAS_RIG$": "(u_vtxFlags.x > 0.5)",
		"$HAS_MORPH$": "(u_vtxFlags.y > 0.5)",
		"$HAS_UV$": "(u_vtxFlags.z > 0.5)",
		"$HAS_NORMAL$": "(u_vtxFlags.w > 0.5)",
		"$HAS_COLOR$": "(u_slot0.x > 0.5)",
		"$HAS_BONE$": "(u_slot0.y > 0.5)",
		"$HAS_TANGENT$": "(u_slot0.z > 0.5)",
		"$MORPH_HAS_POS$": "(u_extras.y > 0.5)",
		"$MORPH_HAS_NORMAL$": "(u_extras.z > 0.5)",
		"$MORPH_HAS_TANGENT$": "(u_extras.w > 0.5)",
		"$ALBEDO_TEX$": "u_albedoTex",
		"$ALBEDO_COLOR$": "u_albedoColor",
		"$OUT_COLOR$": "outputColor",
	};
}

function joinSection(lines) {
	return lines.filter((line) => typeof line === "string" && line.trim().length > 0).join("\n");
}

function buildWgslSource(stageDesc, links, keyMap) {
	const linkFields = joinSection(links.map((link, i) => `    @location(${i + 1}) ${link.fieldName}: ${link.wgslType},`));
	const linkInit = joinSection(links.map((link) => `    var ${link.name}: ${link.wgslType} = ${link.defaultWgsl};`));
	const linkWrite = joinSection(links.map((link) => `    output.${link.fieldName} = ${link.name};`));
	const linkRead = joinSection(links.map((link) => `    var ${link.name}: ${link.wgslType} = input.${link.fieldName};`));

	const vertexMain = replaceTemplateKeys(stageDesc.vertex.main, "vertex", keyMap);
	const fragmentMain = replaceTemplateKeys(stageDesc.fragment.main, "fragment", keyMap);
	const vertexMethods = joinSection(stageDesc.vertex.methods);
	const fragmentMethods = joinSection(stageDesc.fragment.methods);

	const vertex = `
struct SceneUBO {
    view: mat4x4f,
    projection: mat4x4f,
    viewProj: mat4x4f,
    cameraPos: vec4f,
    time: vec4f,
}

struct ObjectUBO {
    model: mat4x4f,
    slot0: vec4f,
    albedoColor: vec4f,
    vtxFlags: vec4f,
    extras: vec4f,
    skinPalette: array<mat4x4f, 128>,
}

@group(0) @binding(0) var<uniform> sceneUBO: SceneUBO;
@group(1) @binding(0) var<uniform> objectUBO: ObjectUBO;

struct WrVertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) boneID: vec4f,
    @location(4) boneWeight: vec4f,
    @location(5) morphPos: vec3f,
}

struct WrVertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
${linkFields}
}

${vertexMethods}

@vertex
fn wr_vs_main(input: WrVertexIn) -> WrVertexOut {
    var output: WrVertexOut;
    var wr_position = input.position;
    var wr_normal = input.normal;
    var wr_uv = input.uv;
    var wr_tangent = vec4f(1.0, 0.0, 0.0, 1.0);
    var wr_boneID = input.boneID;
    var wr_boneWeight = input.boneWeight;
    var wr_morphPos = input.morphPos;

    output.uv = wr_uv;
${linkInit}
    output.position = sceneUBO.viewProj * objectUBO.model * vec4f(wr_position, 1.0);
${vertexMain}
${linkWrite}
    return output;
}
`;

	const fragment = `
struct SceneUBO {
    view: mat4x4f,
    projection: mat4x4f,
    viewProj: mat4x4f,
    cameraPos: vec4f,
    time: vec4f,
}

struct ObjectUBO {
    model: mat4x4f,
    slot0: vec4f,
    albedoColor: vec4f,
    vtxFlags: vec4f,
    extras: vec4f,
    skinPalette: array<mat4x4f, 128>,
}

@group(0) @binding(0) var<uniform> sceneUBO: SceneUBO;
@group(1) @binding(0) var<uniform> objectUBO: ObjectUBO;
@group(1) @binding(1) var texSampler: sampler;
@group(1) @binding(2) var albedoTex: texture_2d<f32>;

struct WrVertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
${linkFields}
}

${fragmentMethods}

@fragment
fn wr_fs_main(input: WrVertexOut) -> @location(0) vec4f {
    var wr_uv = input.uv;
${linkRead}
    var outputColor = textureSample(albedoTex, texSampler, wr_uv) * objectUBO.albedoColor;
${fragmentMain}
    return outputColor;
}
`;

	return {
		vertex: vertex.trim() + "\n",
		fragment: fragment.trim() + "\n",
		module: "",
	};
}

function buildGlslSource(stageDesc, links, keyMap) {
	const linkVertexDecl = joinSection(links.map((link) => `out ${link.glslType} ${link.fieldName};`));
	const linkFragmentDecl = joinSection(links.map((link) => `in ${link.glslType} ${link.fieldName};`));
	const linkInit = joinSection(links.map((link) => `    ${link.glslType} ${link.name} = ${link.defaultGlsl};`));
	const linkWrite = joinSection(links.map((link) => `    ${link.fieldName} = ${link.name};`));
	const linkRead = joinSection(links.map((link) => `    ${link.glslType} ${link.name} = ${link.fieldName};`));

	const vertexMain = replaceTemplateKeys(stageDesc.vertex.main, "vertex", keyMap);
	const fragmentMain = replaceTemplateKeys(stageDesc.fragment.main, "fragment", keyMap);
	const vertexMethods = joinSection(stageDesc.vertex.methods);
	const fragmentMethods = joinSection(stageDesc.fragment.methods);

	const vertex = `#version 300 es
precision highp float;
precision highp int;

layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
layout(location=3) in vec4 a_boneID;
layout(location=4) in vec4 a_boneWeight;
layout(location=5) in vec3 a_morphPos;

uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_viewProj;
uniform vec4 u_cameraPos;
uniform vec4 u_time;

uniform mat4 u_model;
uniform vec4 u_slot0;
uniform vec4 u_albedoColor;
uniform vec4 u_vtxFlags;
uniform vec4 u_extras;
uniform mat4 u_skinPalette[128];

out vec2 v_uv;
${linkVertexDecl}

${vertexMethods}

void main() {
    vec3 wr_position = a_position;
    vec3 wr_normal = a_normal;
    vec2 wr_uv = a_uv;
    vec4 wr_tangent = vec4(1.0, 0.0, 0.0, 1.0);
    vec4 wr_boneID = a_boneID;
    vec4 wr_boneWeight = a_boneWeight;
    vec3 wr_morphPos = a_morphPos;

    v_uv = wr_uv;
${linkInit}
    gl_Position = u_viewProj * u_model * vec4(wr_position, 1.0);
${vertexMain}
${linkWrite}
}
`;

	const fragment = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 v_uv;
${linkFragmentDecl}
layout(location=0) out vec4 fragColor;

uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_viewProj;
uniform vec4 u_cameraPos;
uniform vec4 u_time;

uniform vec4 u_slot0;
uniform vec4 u_albedoColor;
uniform vec4 u_vtxFlags;
uniform vec4 u_extras;
uniform mat4 u_skinPalette[128];
uniform sampler2D u_albedoTex;

${fragmentMethods}

void main() {
    vec2 wr_uv = v_uv;
${linkRead}
    vec4 outputColor = texture(u_albedoTex, wr_uv) * u_albedoColor;
${fragmentMain}
    fragColor = outputColor;
}
`;

	return {
		vertex: vertex.trim() + "\n",
		fragment: fragment.trim() + "\n",
	};
}

function normalizeDescriptor(desc = {}) {
	const source = desc && typeof desc === "object" ? desc : {};
	const id = asText(source.id, "wr-shader");
	const renderCfg = normalizeRenderCfg(source.renderCfg);

	const wgsl = source.wgsl && typeof source.wgsl === "object" ? source.wgsl : {};
	const glsl = source.glsl && typeof source.glsl === "object" ? source.glsl : {};
	const wgslVertex = wgsl.vertex && typeof wgsl.vertex === "object" ? wgsl.vertex : {};
	const wgslFragment = wgsl.fragment && typeof wgsl.fragment === "object" ? wgsl.fragment : {};
	const glslVertex = glsl.vertex && typeof glsl.vertex === "object" ? glsl.vertex : {};
	const glslFragment = glsl.fragment && typeof glsl.fragment === "object" ? glsl.fragment : {};

	const wgslLinks = normalizeLinksByLanguage(wgsl.link ?? wgsl.links ?? wgsl.linkage, "wgsl");
	const glslLinks = normalizeLinksByLanguage(glsl.link ?? glsl.links ?? glsl.linkage, "glsl");
	const links = mergeLinks(wgslLinks, glslLinks);

	const out = {
		id,
		label: asText(source.label, id),
		renderCfg,
		links,
		wgsl: {
			vertex: {
				methods: normalizeMethods(wgslVertex.methods),
				main: ensureStageMain(wgslVertex.main, "wgsl.vertex"),
			},
			fragment: {
				methods: normalizeMethods(wgslFragment.methods),
				main: ensureStageMain(wgslFragment.main, "wgsl.fragment"),
			},
		},
		glsl: {
			vertex: {
				methods: normalizeMethods(glslVertex.methods),
				main: ensureStageMain(glslVertex.main, "glsl.vertex"),
			},
			fragment: {
				methods: normalizeMethods(glslFragment.methods),
				main: ensureStageMain(glslFragment.main, "glsl.fragment"),
			},
		},
		keyMap: {
			wgsl: (source.keyMap && source.keyMap.wgsl && typeof source.keyMap.wgsl === "object")
				? source.keyMap.wgsl
				: {},
			glsl: (source.keyMap && source.keyMap.glsl && typeof source.keyMap.glsl === "object")
				? source.keyMap.glsl
				: {},
		},
	};

	return out;
}

function normalizeRenderCfg(renderCfg = null) {
	const src = (renderCfg && typeof renderCfg === "object") ? renderCfg : {};
	const blend = src.blend;
	const blendEnabled = typeof blend === "object" ? true : asBool(blend, WR_DEFAULT_RENDER_CFG.blend);

	return {
		topology: normalizeTopology(src.topology ?? WR_DEFAULT_RENDER_CFG.topology),
		frontFace: normalizeFrontFace(src.frontFace ?? WR_DEFAULT_RENDER_CFG.frontFace),
		cull: normalizeCull(src.cull ?? WR_DEFAULT_RENDER_CFG.cull),
		depthTest: asBool(src.depthTest, WR_DEFAULT_RENDER_CFG.depthTest),
		depthWrite: asBool(src.depthWrite, WR_DEFAULT_RENDER_CFG.depthWrite),
		depthCompare: normalizeDepthCompare(src.depthCompare ?? WR_DEFAULT_RENDER_CFG.depthCompare),
		blend: blendEnabled,
		blendState: (blend && typeof blend === "object")
			? {
				color: {
					srcFactor: asText(blend.color?.srcFactor, WR_WGPU_BLEND_ALPHA.color.srcFactor),
					dstFactor: asText(blend.color?.dstFactor, WR_WGPU_BLEND_ALPHA.color.dstFactor),
					operation: asText(blend.color?.operation, WR_WGPU_BLEND_ALPHA.color.operation),
				},
				alpha: {
					srcFactor: asText(blend.alpha?.srcFactor, WR_WGPU_BLEND_ALPHA.alpha.srcFactor),
					dstFactor: asText(blend.alpha?.dstFactor, WR_WGPU_BLEND_ALPHA.alpha.dstFactor),
					operation: asText(blend.alpha?.operation, WR_WGPU_BLEND_ALPHA.alpha.operation),
				},
			}
			: null,
		colorWriteMask: normalizeColorWriteMask(src.colorWriteMask),
	};
}

function renderCfgKey(renderCfg = null) {
	const cfg = normalizeRenderCfg(renderCfg);
	return [
		`topo:${cfg.topology}`,
		`front:${cfg.frontFace}`,
		`cull:${cfg.cull}`,
		`dt:${cfg.depthTest ? "1" : "0"}`,
		`dw:${cfg.depthWrite ? "1" : "0"}`,
		`dc:${cfg.depthCompare}`,
		`bl:${cfg.blend ? "1" : "0"}`,
		`cm:${cfg.colorWriteMask.map((v) => (v ? "1" : "0")).join("")}`,
	].join("|");
}

function buildResolvedSources(norm) {
	const keyMapWgsl = {
		...defaultKeyMapWgsl(),
		...(norm.keyMap.wgsl ?? {}),
	};
	const keyMapGlsl = {
		...defaultKeyMapGlsl(),
		...(norm.keyMap.glsl ?? {}),
	};

	return {
		keyMap: {
			wgsl: keyMapWgsl,
			glsl: keyMapGlsl,
		},
		wgsl: buildWgslSource(norm.wgsl, norm.links, keyMapWgsl),
		glsl: buildGlslSource(norm.glsl, norm.links, keyMapGlsl),
	};
}

function colorWriteMaskToWgpu(bits) {
	let mask = 0;
	const GPUColorWrite = globalThis.GPUColorWrite;
	const R = GPUColorWrite?.RED ?? 1;
	const G = GPUColorWrite?.GREEN ?? 2;
	const B = GPUColorWrite?.BLUE ?? 4;
	const A = GPUColorWrite?.ALPHA ?? 8;
	if (bits[0]) mask |= R;
	if (bits[1]) mask |= G;
	if (bits[2]) mask |= B;
	if (bits[3]) mask |= A;
	return mask;
}

function toWglDepthFunc(gl, compare) {
	if (!gl) return null;
	if (compare === "never") return gl.NEVER;
	if (compare === "less") return gl.LESS;
	if (compare === "equal") return gl.EQUAL;
	if (compare === "less-equal") return gl.LEQUAL;
	if (compare === "greater") return gl.GREATER;
	if (compare === "greater-equal") return gl.GEQUAL;
	if (compare === "not-equal") return gl.NOTEQUAL;
	return gl.ALWAYS;
}

function makeWglState(gl, cfg) {
	if (!gl) return null;
	const out = {
		depthTest: cfg.depthTest,
		depthMask: cfg.depthWrite,
		depthFunc: cfg.depthTest ? toWglDepthFunc(gl, cfg.depthCompare) : gl.ALWAYS,
		blend: cfg.blend,
		cull: cfg.cull !== "none",
		frontFace: cfg.frontFace === "cw" ? gl.CW : gl.CCW,
		colorMask: cfg.colorWriteMask.slice(0, 4),
	};
	if (cfg.cull === "front") out.cullFace = gl.FRONT;
	else out.cullFace = gl.BACK;
	if (cfg.blend) {
		out.blendFuncSeparate = [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA];
		out.blendEquationSeparate = [gl.FUNC_ADD, gl.FUNC_ADD];
	}
	return out;
}

function wgpuPipelineDescriptor(shader, backend, options = {}) {
	const cfg = shader.renderCfg;
	const colorFormat = asText(options.colorFormat, backend?.format ?? "bgra8unorm");
	const depthFormat = asText(options.depthFormat, "depth24plus");
	const colorWrite = colorWriteMaskToWgpu(cfg.colorWriteMask);
	const blend = cfg.blend
		? (cfg.blendState ?? WR_WGPU_BLEND_ALPHA)
		: undefined;

	const desc = {
		label: asText(options.label, `Wr2:${shader.id}|${colorFormat}`),
		layout: options.layout ?? "auto",
		vertex: {
			module: options.moduleVertex,
			entryPoint: "wr_vs_main",
			buffers: options.vertexBuffers ?? [WR_WGPU_VERTEX_LAYOUT],
		},
		fragment: {
			module: options.moduleFragment,
			entryPoint: "wr_fs_main",
			targets: [{
				format: colorFormat,
				blend,
				writeMask: colorWrite,
			}],
		},
		primitive: {
			topology: cfg.topology,
			frontFace: cfg.frontFace,
			cullMode: cfg.cull,
		},
		multisample: {
			count: Math.max(1, Math.floor(toNumber(options.sampleCount, 1))),
		},
	};

	if (cfg.depthTest || cfg.depthWrite) {
		desc.depthStencil = {
			format: depthFormat,
			depthWriteEnabled: cfg.depthWrite,
			depthCompare: cfg.depthCompare,
		};
	}

	return desc;
}

/**
 * WrShader
 * Backend-aware WR2 shader asset with fixed template wrappers
 */
export class WrShader {
	static Keys = WR_SHADER_KEYS;
	static DefaultRenderCfg = WR_DEFAULT_RENDER_CFG;
	static WgpuVertexLayout = WR_WGPU_VERTEX_LAYOUT;

	constructor(desc = {}) {
		this.id = "wr-shader";
		this.label = "wr-shader";
		this.links = [];
		this.keyMap = { wgsl: {}, glsl: {} };
		this.renderCfg = normalizeRenderCfg(null);
		this.renderCfgKey = renderCfgKey(this.renderCfg);
		this.source = {
			wgsl: { vertex: "", fragment: "", module: "" },
			glsl: { vertex: "", fragment: "" },
		};
		this.backend = {
			kind: null,
			module: null,
			pipeline: null,
			program: null,
			glPipeline: null,
			error: null,
		};
		this.configure(desc);
	}

	static normalizeRenderCfg(renderCfg = null) {
		return normalizeRenderCfg(renderCfg);
	}

	static renderCfgKey(renderCfg = null) {
		return renderCfgKey(renderCfg);
	}

	static normalize(desc = {}) {
		const norm = normalizeDescriptor(desc);
		const resolved = buildResolvedSources(norm);
		return {
			...norm,
			...resolved,
			renderCfgKey: renderCfgKey(norm.renderCfg),
		};
	}

	configure(desc = {}) {
		const norm = WrShader.normalize(desc);
		this.id = norm.id;
		this.label = norm.label;
		this.links = norm.links;
		this.keyMap = norm.keyMap;
		this.renderCfg = norm.renderCfg;
		this.renderCfgKey = norm.renderCfgKey;
		this.source = {
			wgsl: {
				vertex: norm.wgsl.vertex,
				fragment: norm.wgsl.fragment,
				module: norm.wgsl.module,
			},
			glsl: {
				vertex: norm.glsl.vertex,
				fragment: norm.glsl.fragment,
			},
		};
		return this;
	}

	buildBackend(backend, options = {}) {
		if (!backend || !backend.kind) return null;
		if (backend.kind === "webgpu") return this.#buildWgpu(backend, options);
		if (backend.kind === "webgl2") return this.#buildWgl2(backend, options);
		return null;
	}

	dropBackend() {
		this.backend = {
			kind: null,
			module: null,
			pipeline: null,
			program: null,
			glPipeline: null,
			error: null,
		};
	}

	getSource(language, stage = null) {
		const lang = asText(language).toLowerCase();
		const src = this.source[lang] ?? null;
		if (!src) return null;
		if (!stage) return src;
		const key = asText(stage).toLowerCase();
		return src[key] ?? null;
	}

	#buildWgpu(backend, options = {}) {
		try {
			const moduleVertex = backend.createShaderModule({
				label: asText(options.moduleVertexLabel, `${this.id}:wgsl:vs`),
				code: this.source.wgsl.vertex,
			});
			const moduleFragment = backend.createShaderModule({
				label: asText(options.moduleFragmentLabel, `${this.id}:wgsl:fs`),
				code: this.source.wgsl.fragment,
			});
			const pipeline = options.createPipeline === false
				? null
				: backend.createRenderPipeline(
					wgpuPipelineDescriptor(this, backend, {
						...options,
						moduleVertex,
						moduleFragment,
					})
				);
			this.backend = {
				kind: "webgpu",
				module: {
					vertex: moduleVertex,
					fragment: moduleFragment,
				},
				pipeline,
				program: null,
				glPipeline: null,
				error: null,
			};
			return this.backend;
		} catch (error) {
			this.backend = {
				kind: "webgpu",
				module: null,
				pipeline: null,
				program: null,
				glPipeline: null,
				error: String(error?.message ?? error),
			};
			throw error;
		}
	}

	#buildWgl2(backend, options = {}) {
		const gl = backend.gl ?? null;
		try {
			const program = backend.createShaderProgram({
				vertex: this.source.glsl.vertex,
				fragment: this.source.glsl.fragment,
				vertexLabel: asText(options.vertexLabel, `${this.id}:vs`),
				fragmentLabel: asText(options.fragmentLabel, `${this.id}:fs`),
				attribLocations: {
					a_position: 0,
					a_normal: 1,
					a_uv: 2,
					a_boneID: 3,
					a_boneWeight: 4,
					a_morphPos: 5,
				},
			});
			const state = makeWglState(gl, this.renderCfg);
			const glPipeline = backend.createPipeline({
				label: asText(options.pipelineLabel, `${this.id}:pipeline`),
				program,
				state,
			});
			this.backend = {
				kind: "webgl2",
				module: null,
				pipeline: null,
				program,
				glPipeline,
				error: null,
			};
			return this.backend;
		} catch (error) {
			this.backend = {
				kind: "webgl2",
				module: null,
				pipeline: null,
				program: null,
				glPipeline: null,
				error: String(error?.message ?? error),
			};
			throw error;
		}
	}
}

if (typeof window !== "undefined") {
	window.WrShader = WrShader;
}

export default WrShader;
