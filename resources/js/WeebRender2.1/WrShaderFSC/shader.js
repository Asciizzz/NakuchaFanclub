const WR_FSC_KEYS = Object.freeze([
	"$UV$",
	"$NDC$",
	"$FRAG_COORD$",
	"$RESOLUTION$",
	"$TIME$",
	"$DELTA_TIME$",
	"$VIEW$",
	"$PROJECTION$",
	"$VIEW_PROJ$",
	"$CAMERA_POS$",
	"$OUT_COLOR$",
]);

const WR_KEY_SET = new Set(WR_FSC_KEYS);

const WR_DEFAULT_RENDER_CFG = Object.freeze({
	topology: "triangle-list",
	depthTest: false,
	depthWrite: false,
	depthCompare: "always",
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

function asText(value, fallback = "") {
	const text = String(value ?? "").trim();
	return text.length > 0 ? text : fallback;
}

function asBool(value, fallback = false) {
	if (value == null) return fallback;
	return !!value;
}

function toNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function normalizeDepthCompare(value) {
	const raw = asText(value, "always").toLowerCase();
	if (raw === "never") return "never";
	if (raw === "less") return "less";
	if (raw === "equal") return "equal";
	if (raw === "less-equal" || raw === "lequal") return "less-equal";
	if (raw === "greater") return "greater";
	if (raw === "greater-equal" || raw === "gequal") return "greater-equal";
	if (raw === "not-equal" || raw === "notequal") return "not-equal";
	return "always";
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

function normalizeRenderCfg(renderCfg = null) {
	const src = (renderCfg && typeof renderCfg === "object") ? renderCfg : {};
	const blend = src.blend;
	const blendEnabled = typeof blend === "object" ? true : asBool(blend, WR_DEFAULT_RENDER_CFG.blend);

	return {
		topology: "triangle-list",
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
		if (text) out.push(text);
	}
	return out;
}

function ensureMain(value, label) {
	const text = asText(value);
	if (!text) throw new Error(`[WrShaderFSC] ${label} fragment is required`);
	return text;
}

function extractTemplateKeys(source) {
	const text = String(source ?? "");
	const found = text.match(/\$[A-Z0-9_]+\$/g) ?? [];
	return Array.from(new Set(found));
}

function replaceTemplateKeys(source, keyMap) {
	const keys = extractTemplateKeys(source);
	let out = String(source ?? "");
	for (const key of keys) {
		if (!WR_KEY_SET.has(key)) throw new Error(`[WrShaderFSC] unknown template key "${key}"`);
		const value = keyMap[key];
		if (value == null) throw new Error(`[WrShaderFSC] missing replacement for "${key}"`);
		out = out.split(key).join(String(value));
	}
	return out;
}

function normalizeDescriptor(desc = {}) {
	const source = desc && typeof desc === "object" ? desc : {};
	const wgsl = source.wgsl && typeof source.wgsl === "object" ? source.wgsl : {};
	const glsl = source.glsl && typeof source.glsl === "object" ? source.glsl : {};

	return {
		id: asText(source.id, "shaderFSC"),
		label: asText(source.label, source.id ?? "shaderFSC"),
		renderCfg: normalizeRenderCfg(source.renderCfg),
		wgsl: {
			methods: normalizeMethods(wgsl.methods),
			fragment: ensureMain(wgsl.fragment ?? wgsl.main, "wgsl"),
		},
		glsl: {
			methods: normalizeMethods(glsl.methods),
			fragment: ensureMain(glsl.fragment ?? glsl.main, "glsl"),
		},
		keyMap: {
			wgsl: source.keyMap?.wgsl ?? {},
			glsl: source.keyMap?.glsl ?? {},
		},
	};
}

function defaultKeyMapWgsl() {
	return {
		"$UV$": "wr_uv",
		"$NDC$": "wr_ndc",
		"$FRAG_COORD$": "wr_fragCoord",
		"$RESOLUTION$": "sceneUBO.time.zw",
		"$TIME$": "sceneUBO.time.x",
		"$DELTA_TIME$": "sceneUBO.time.y",
		"$VIEW$": "sceneUBO.view",
		"$PROJECTION$": "sceneUBO.projection",
		"$VIEW_PROJ$": "sceneUBO.viewProj",
		"$CAMERA_POS$": "sceneUBO.cameraPos",
		"$OUT_COLOR$": "outputColor",
	};
}

function defaultKeyMapGlsl() {
	return {
		"$UV$": "wr_uv",
		"$NDC$": "wr_ndc",
		"$FRAG_COORD$": "wr_fragCoord",
		"$RESOLUTION$": "u_time.zw",
		"$TIME$": "u_time.x",
		"$DELTA_TIME$": "u_time.y",
		"$VIEW$": "u_view",
		"$PROJECTION$": "u_projection",
		"$VIEW_PROJ$": "u_viewProj",
		"$CAMERA_POS$": "u_cameraPos",
		"$OUT_COLOR$": "outputColor",
	};
}

function joinSection(lines) {
	return lines.filter((line) => typeof line === "string" && line.trim().length > 0).join("\n");
}

function buildWgslSource(norm) {
	const keyMap = { ...defaultKeyMapWgsl(), ...(norm.keyMap.wgsl ?? {}) };
	const methods = joinSection(norm.wgsl.methods);
	const fragment = replaceTemplateKeys(norm.wgsl.fragment, keyMap);
	return `
struct SceneUBO {
    view: mat4x4f,
    projection: mat4x4f,
    viewProj: mat4x4f,
    cameraPos: vec4f,
    time: vec4f,
}

@group(0) @binding(0) var<uniform> sceneUBO: SceneUBO;

struct WrFSCOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn wr_vs_main(@builtin(vertex_index) vid: u32) -> WrFSCOut {
    let pos = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f( 3.0, -1.0),
        vec2f(-1.0,  3.0)
    );
    var output: WrFSCOut;
    output.position = vec4f(pos[vid], 0.0, 1.0);
    output.uv = pos[vid] * 0.5 + vec2f(0.5, 0.5);
    return output;
}

${methods}

@fragment
fn wr_fs_main(input: WrFSCOut) -> @location(0) vec4f {
    let wr_uv = input.uv;
    let wr_ndc = wr_uv * 2.0 - vec2f(1.0, 1.0);
    let wr_fragCoord = input.position.xy;
    var outputColor = vec4f(0.0, 0.0, 0.0, 1.0);
${fragment}
    return outputColor;
}
`.trim() + "\n";
}

function buildGlslSource(norm) {
	const keyMap = { ...defaultKeyMapGlsl(), ...(norm.keyMap.glsl ?? {}) };
	const methods = joinSection(norm.glsl.methods);
	const fragment = replaceTemplateKeys(norm.glsl.fragment, keyMap);
	const vertex = `#version 300 es
precision highp float;

out vec2 v_uv;

void main() {
    vec2 pos[3] = vec2[3](
        vec2(-1.0, -1.0),
        vec2( 3.0, -1.0),
        vec2(-1.0,  3.0)
    );
    vec2 p = pos[gl_VertexID];
    gl_Position = vec4(p, 0.0, 1.0);
    v_uv = p * 0.5 + vec2(0.5, 0.5);
}
`;
	const frag = `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
layout(location=0) out vec4 fragColor;

uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_viewProj;
uniform vec4 u_cameraPos;
uniform vec4 u_time;

${methods}

void main() {
    vec2 wr_uv = v_uv;
    vec2 wr_ndc = wr_uv * 2.0 - vec2(1.0, 1.0);
    vec2 wr_fragCoord = gl_FragCoord.xy;
    vec4 outputColor = vec4(0.0, 0.0, 0.0, 1.0);
${fragment}
    fragColor = outputColor;
}
`;
	return {
		vertex,
		fragment: frag,
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
		cull: false,
		colorMask: cfg.colorWriteMask.slice(0, 4),
	};
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
	const desc = {
		label: asText(options.label, `Wr2FSC:${shader.id}|${colorFormat}`),
		layout: options.layout ?? "auto",
		vertex: {
			module: options.module,
			entryPoint: "wr_vs_main",
		},
		fragment: {
			module: options.module,
			entryPoint: "wr_fs_main",
			targets: [{
				format: colorFormat,
				blend: cfg.blend ? (cfg.blendState ?? WR_WGPU_BLEND_ALPHA) : undefined,
				writeMask: colorWriteMaskToWgpu(cfg.colorWriteMask),
			}],
		},
		primitive: {
			topology: "triangle-list",
			cullMode: "none",
		},
		multisample: {
			count: Math.max(1, Math.floor(toNumber(options.sampleCount, 1))),
		},
	};
	if (options.useDepth || cfg.depthTest || cfg.depthWrite) {
		desc.depthStencil = {
			format: depthFormat,
			depthWriteEnabled: cfg.depthWrite,
			depthCompare: cfg.depthTest ? cfg.depthCompare : "always",
		};
	}
	return desc;
}

export class WrShaderFSC {
	static Keys = WR_FSC_KEYS;
	static DefaultRenderCfg = WR_DEFAULT_RENDER_CFG;

	constructor(desc = {}) {
		this.id = "shaderFSC";
		this.label = "shaderFSC";
		this.kind = "fullscreen";
		this.renderCfg = normalizeRenderCfg(null);
		this.source = {
			wgsl: "",
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

	static from(desc = {}) {
		if (desc instanceof WrShaderFSC) return desc;
		return new WrShaderFSC(desc);
	}

	configure(desc = {}) {
		const norm = normalizeDescriptor(desc);
		this.id = norm.id;
		this.label = norm.label;
		this.renderCfg = norm.renderCfg;
		this.source = {
			wgsl: buildWgslSource(norm),
			glsl: buildGlslSource(norm),
		};
		return this;
	}

	buildBackend(backend, options = {}) {
		if (!backend || !backend.kind) return null;
		if (backend.kind === "webgpu") return this.#buildWgpu(backend, options);
		if (backend.kind === "webgl2") return this.#buildWgl2(backend, options);
		return null;
	}

	getSource(language, stage = null) {
		const lang = asText(language).toLowerCase();
		if (lang === "wgsl") return this.source.wgsl;
		if (lang !== "glsl") return null;
		if (!stage) return this.source.glsl;
		return this.source.glsl[asText(stage).toLowerCase()] ?? null;
	}

	#buildWgpu(backend, options = {}) {
		try {
			const module = backend.createShaderModule({
				label: asText(options.moduleLabel, `${this.id}:fsc:wgsl`),
				code: this.source.wgsl,
			});
			const pipeline = options.createPipeline === false
				? null
				: backend.createRenderPipeline(wgpuPipelineDescriptor(this, backend, { ...options, module }));
			this.backend = {
				kind: "webgpu",
				module,
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
				vertexLabel: asText(options.vertexLabel, `${this.id}:fsc:vs`),
				fragmentLabel: asText(options.fragmentLabel, `${this.id}:fsc:fs`),
			});
			const state = makeWglState(gl, this.renderCfg);
			const glPipeline = backend.createPipeline({
				label: asText(options.pipelineLabel, `${this.id}:fsc:pipeline`),
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
	window.WrShaderFSC = WrShaderFSC;
}

export default WrShaderFSC;
