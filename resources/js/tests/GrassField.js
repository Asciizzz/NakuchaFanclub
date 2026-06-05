import * as mAth from "../Alib/mAth.js";

class GrassTexture {
	constructor(owner) {
		this.owner = owner;
		this.url = null;
		this.bitmap = null;
		this.gpu = null;
		this.view = null;
		this.size = { width: 0, height: 0 };
	}

	rebuildGPU() {
		this.destroyGPU();
		return this.createGPU();
	}

	async setFromURL(url) {
		const nextURL = String(url ?? "").trim();
		if (!nextURL) return null;

		this.destroyCPU();
		this.destroyGPU();

		const response = await fetch(nextURL);
		if (!response.ok) {
			throw new Error(`[GrassField] failed to fetch texture: ${response.status} ${response.statusText}`);
		}
		const blob = await response.blob();
		const bitmap = await createImageBitmap(blob);

		this.url = nextURL;
		this.bitmap = bitmap;
		this.size.width = bitmap.width;
		this.size.height = bitmap.height;
		return this.createGPU();
	}

	destroyCPU() {
		if (this.bitmap && typeof this.bitmap.close === "function") {
			this.bitmap.close();
		}
		this.bitmap = null;
		this.url = null;
		this.size.width = 0;
		this.size.height = 0;
	}

	destroyGPU() {
		if (this.gpu && typeof this.gpu.destroy === "function") {
			this.gpu.destroy();
		}
		this.gpu = null;
		this.view = null;
	}

	createGPU() {
		const backend = this.owner.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready || !backend.device || !this.bitmap) {
			return null;
		}

		const usage =
			(globalThis.GPUTextureUsage?.TEXTURE_BINDING ?? 0x04) |
			(globalThis.GPUTextureUsage?.COPY_DST ?? 0x02) |
			(globalThis.GPUTextureUsage?.RENDER_ATTACHMENT ?? 0x10);

		const texture = backend.createTexture2D({
			label: "GrassFieldTexture",
			width: this.bitmap.width,
			height: this.bitmap.height,
			format: "rgba8unorm",
			usage,
		});
		if (!texture) return null;

		backend.device.queue.copyExternalImageToTexture(
			{ source: this.bitmap, flipY: false },
			{ texture },
			[this.bitmap.width, this.bitmap.height]
		);

		this.gpu = texture;
		this.view = texture.createView();
		return texture;
	}
}

class GrassShader {
	constructor(backendRef = null) {
		this.backend = backendRef ?? null;
		this.module = null;
		this.pipeline = null;
		this.pipelineCfg = null;
		this.pipelineSig = "";
	}

	setBackend(backendRef) {
		if (this.backend !== backendRef) {
			if (this.uniformBuffer && typeof this.uniformBuffer.destroy === "function") {
				this.uniformBuffer.destroy();
			}
			this.backend = backendRef ?? null;
			this.module = null;
			this.pipeline = null;
			this.pipelineCfg = null;
			this.pipelineSig = "";
		}
		return this.backend;
	}

	createModule() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return null;
		if (this.module) return this.module;

		this.module = backend.createShaderModule({
			label: "GrassShaderModule",
			code: `
struct SceneUBO {
	viewProj: mat4x4f,
	model: mat4x4f,
	grid: vec4f,
	height: vec4f,
	light: vec4f,
	misc: vec4f,
	camPos: vec4f,
	fog: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUBO;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var texAlbedo: texture_2d<f32>;
@group(0) @binding(3) var heightSampler: sampler;
@group(0) @binding(4) var texHeight: texture_2d<f32>;

struct VSIn {
	@location(0) position: vec3f,
	@location(1) uv: vec2f,
	@location(2) instData: vec4f,
}

struct VSOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
	@location(1) patchNormal: vec3f,
	@location(2) tintData: vec2f,
	@location(3) worldPos: vec3f,
}

fn rotateAxis(v: vec3f, axis: vec3f, ang: f32) -> vec3f {
	let s = sin(ang);
	let c = cos(ang);
	return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

fn sampleHeight(uv: vec2f) -> f32 {
	let c = textureSampleLevel(texHeight, heightSampler, uv, 0.0).r;
	return c * scene.height.y;
}

@vertex
fn vs_main(input: VSIn) -> VSOut {
	var out: VSOut;
	let baseXZ = vec2f(input.instData.x, input.instData.z);
	let halfExtent = scene.grid.w;
	let uv = vec2f(
		baseXZ.x / (halfExtent * 2.0) + 0.5,
		baseXZ.y / (halfExtent * 2.0) + 0.5
	);

	let texel = 1.0 / max(scene.height.x, 1.0);
	let hC = sampleHeight(uv);
	let hL = sampleHeight(uv + vec2f(-texel, 0.0));
	let hR = sampleHeight(uv + vec2f(texel, 0.0));
	let hD = sampleHeight(uv + vec2f(0.0, -texel));
	let hU = sampleHeight(uv + vec2f(0.0, texel));
	let slope = scene.height.z;
	let patchNormal = normalize(vec3f((hL - hR) * slope, 2.0, (hD - hU) * slope));

	let basisRef = select(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), abs(patchNormal.y) > 0.99);
	let right = normalize(cross(basisRef, patchNormal));
	let forward = normalize(cross(patchNormal, right));
	let orientedLocal0 = right * input.position.x + patchNormal * input.position.y + forward * input.position.z;
	let tip = 1.0 - input.uv.y;
	let swayAng = input.instData.y * tip;
	let orientedLocal1 = rotateAxis(orientedLocal0, patchNormal, swayAng);
	let orientedLocal = orientedLocal1 + forward * (tip * tip) * (input.instData.y * 0.2);

	let worldBase = vec3f(baseXZ.x, hC, baseXZ.y);
	let worldPos = scene.model * vec4f(worldBase + orientedLocal, 1.0);
	let h01 = clamp(hC / max(scene.height.y, 0.001), 0.0, 1.0);
	let noise = fract(sin(dot(baseXZ, vec2f(12.9898, 78.233))) * 43758.5453);
	out.position = scene.viewProj * worldPos;
	out.uv = input.uv;
	out.patchNormal = patchNormal;
	out.tintData = vec2f(h01, noise);
	out.worldPos = worldPos.xyz;
	return out;
}

@fragment
fn fs_main(input: VSOut) -> @location(0) vec4f {
				let tex = textureSample(texAlbedo, texSampler, input.uv);
				if (tex.a < 0.9) {
					discard;
				}
	let lightDir = normalize(scene.light.xyz);
	let ndl = max(dot(normalize(input.patchNormal), lightDir), 0.0);
	let h01 = input.tintData.x;
	let noise = input.tintData.y;
	let lowTint = vec3f(0.18, 0.44, 0.15);
	let midTint = vec3f(0.31, 0.66, 0.24);
	let highTint = vec3f(0.46, 0.78, 0.30);
	let elevTint0 = mix(lowTint, midTint, smoothstep(0.0, 0.6, h01));
	let elevTint = mix(elevTint0, highTint, smoothstep(0.55, 1.0, h01));
	let patchVar = 0.98 + (noise - 0.5) * 0.08;
	let baseColor = tex.rgb * elevTint * patchVar;
	let lit = baseColor * (0.8 + 0.2 * ndl);
	let fogDist = length(input.worldPos - scene.camPos.xyz);
	let fogDensity = scene.fog.x;
	let fogExp = scene.fog.y;
	let fogMix = clamp(1.0 - exp(-pow(fogDist * fogDensity, fogExp)), 0.0, 1.0);
	let fogTint = vec3f(0.64, 0.80, 1.04);
	let fogLift = vec3f(0.03, 0.06, 0.10);
	let fogged = lit * fogTint + fogLift;
	let finalColor = mix(lit, fogged, fogMix);
	return vec4f(finalColor, tex.a);
}
			`,
		});
		return this.module;
	}

	createPipeline(cfg = {}) {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return null;

		const nextCfg = this.#normalizePipelineCfg(cfg);
		const nextSig = JSON.stringify(nextCfg);
		if (this.pipeline && this.pipelineSig === nextSig) {
			return this.pipeline;
		}

		this.pipeline = null;
		this.pipelineCfg = null;
		this.pipelineSig = "";

		const module = this.createModule();
		if (!module) return null;

		const pipeline = backend.createRenderPipeline({
			label: "GrassShaderPipeline",
			layout: "auto",
			vertex: {
				module,
				entryPoint: "vs_main",
				buffers: [GrashMesh.vertexBufferLayout(), GrashMesh.instanceBufferLayout()],
			},
			fragment: {
				module,
				entryPoint: "fs_main",
				targets: [{
					format: nextCfg.format,
					blend: nextCfg.blend ? {
						color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
						alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
					} : undefined,
					writeMask: 0xF,
				}],
			},
			primitive: {
				topology: nextCfg.topology,
				frontFace: nextCfg.frontFace,
				cullMode: nextCfg.cullMode,
			},
			depthStencil: nextCfg.useDepth ? {
				format: nextCfg.depthFormat,
				depthWriteEnabled: nextCfg.depthWriteEnabled,
				depthCompare: nextCfg.depthCompare,
			} : undefined,
		});

		this.pipeline = pipeline ?? null;
		this.pipelineCfg = nextCfg;
		this.pipelineSig = this.pipeline ? nextSig : "";
		return this.pipeline;
	}

	#normalizePipelineCfg(cfg) {
		const src = cfg && typeof cfg === "object" ? cfg : {};
		const backend = this.backend;
		return {
			format: String(src.format ?? backend?.format ?? "bgra8unorm"),
			depthFormat: String(src.depthFormat ?? "depth24plus"),
			topology: String(src.topology ?? "triangle-list"),
			frontFace: String(src.frontFace ?? "ccw"),
			cullMode: src.cullMode == null ? "back" : String(src.cullMode),
			depthCompare: String(src.depthCompare ?? "less"),
			depthWriteEnabled: src.depthWriteEnabled !== false,
			useDepth: src.useDepth !== false,
			blend: src.blend !== false,
		};
	}
}

export class SkyObject {
	constructor(backendRef = null) {
		this.backend = backendRef ?? null;
		this.camera = null;
		this.module = null;
		this.pipeline = null;
		this.pipelineCfg = null;
		this.pipelineSig = "";
		this.uniformBuffer = null;
		this.uniformData = new Float32Array(32);
		this.bindGroup = null;
	}

	setBackend(backendRef) {
		if (this.backend !== backendRef) {
			this.backend = backendRef ?? null;
			this.module = null;
			this.pipeline = null;
			this.pipelineCfg = null;
			this.pipelineSig = "";
			this.uniformBuffer = null;
			this.bindGroup = null;
		}
		return this.backend;
	}

	setCamera(cameraRef) {
		this.camera = cameraRef ?? null;
		return this.camera;
	}

	createModule() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return null;
		if (this.module) return this.module;
		this.module = backend.createShaderModule({
			label: "SkyShaderModule",
			code: `
struct SkyUBO {
	invViewProj: mat4x4f,
	camPos: vec4f,
	sunDir: vec4f,
	fogColor: vec4f,
	params: vec4f,
}

@group(0) @binding(0) var<uniform> sky: SkyUBO;

struct VSOut {
	@builtin(position) position: vec4f,
	@location(0) ndc: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VSOut {
	var out: VSOut;
	var p = array<vec2f, 3>(
		vec2f(-1.0, -1.0),
		vec2f(3.0, -1.0),
		vec2f(-1.0, 3.0)
	);
	let xy = p[vi];
	out.position = vec4f(xy, 0.0, 1.0);
	out.ndc = xy;
	return out;
}

@fragment
fn fs_main(input: VSOut) -> @location(0) vec4f {
	let ndc = input.ndc;
	let nearClip = vec4f(ndc, 0.0, 1.0);
	let farClip = vec4f(ndc, 1.0, 1.0);
	let worldNear4 = sky.invViewProj * nearClip;
	let worldFar4 = sky.invViewProj * farClip;
	let worldNear = worldNear4.xyz / max(worldNear4.w, 0.00001);
	let worldFar = worldFar4.xyz / max(worldFar4.w, 0.00001);
	let rayDir = normalize(worldFar - worldNear);

	let h = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
	// let skyTop = vec3f(0.60, 0.76, 0.86);
	// let skyMid = vec3f(0.71, 0.81, 0.77);
	// let skyHorizon = vec3f(0.90, 0.89, 0.72);
	let skyTop = vec3f(0.2, 0.2, 0.35);
	let skyMid = vec3f(0.2, 0.2, 0.35);
	let skyHorizon = vec3f(0.3, 0.3, 0.45);
	let t0 = smoothstep(0.0, 0.58, h);
	let t1 = smoothstep(0.58, 1.0, h);
	let lower = mix(skyHorizon, skyMid, t0);
	var color = mix(lower, skyTop, t1);

	let sunDot = max(dot(rayDir, normalize(sky.sunDir.xyz)), 0.0);
	let sunCore = pow(sunDot, 1100.0);
	let sunGlow = pow(sunDot, 70.0) * 0.42;
	color += vec3f(1.0, 1.0, 1.0) * sunCore;
	color += vec3f(1.0, 0.98, 0.90) * sunGlow;

	let haze = smoothstep(0.18, -0.12, rayDir.y);
	color = mix(color, sky.fogColor.xyz, haze * 0.33);
	return vec4f(color, 1.0);
}
			`,
		});
		return this.module;
	}

	createPipeline(cfg = {}) {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return null;
		const nextCfg = this.#normalizePipelineCfg(cfg);
		const nextSig = JSON.stringify(nextCfg);
		if (this.pipeline && this.pipelineSig === nextSig) return this.pipeline;

		this.pipeline = null;
		this.pipelineCfg = null;
		this.pipelineSig = "";
		const module = this.createModule();
		if (!module) return null;

		const pipeline = backend.createRenderPipeline({
			label: "SkyShaderPipeline",
			layout: "auto",
			vertex: {
				module,
				entryPoint: "vs_main",
				buffers: [],
			},
			fragment: {
				module,
				entryPoint: "fs_main",
				targets: [{ format: nextCfg.format, writeMask: 0xF }],
			},
			primitive: {
				topology: "triangle-list",
				frontFace: "ccw",
				cullMode: "none",
			},
			depthStencil: {
				format: nextCfg.depthFormat,
				depthWriteEnabled: false,
				depthCompare: "always",
			},
		});

		this.pipeline = pipeline ?? null;
		this.pipelineCfg = nextCfg;
		this.pipelineSig = this.pipeline ? nextSig : "";
		return this.pipeline;
	}

	createEngine(cfg = {}) {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return false;
		this.createModule();
		this.createPipeline(cfg);
		if (!this.uniformBuffer) {
			const usage =
				(globalThis.GPUBufferUsage?.UNIFORM ?? 0x40) |
				(globalThis.GPUBufferUsage?.COPY_DST ?? 0x08);
			this.uniformBuffer = backend.createBuffer({
				label: "SkyUBO",
				size: this.uniformData.byteLength,
				usage,
				mappedAtCreation: false,
			});
		}
		if (!this.uniformBuffer) return false;
		this.#rebuildBinding();
		return !!this.bindGroup;
	}

	update(cfg = {}) {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready || !this.camera) return false;
		if (!this.createEngine(cfg)) return false;
		const vp = mAth.Mat4.mul(this.camera.projection, this.camera.view);
		const invVp = mAth.Mat4.invert(vp);
		if (!invVp) return false;
		this.uniformData.set(invVp, 0);
		this.uniformData[16] = this.camera.position[0];
		this.uniformData[17] = this.camera.position[1];
		this.uniformData[18] = this.camera.position[2];
		this.uniformData[19] = 1;
		this.uniformData[20] = Number.isFinite(cfg.sunX) ? cfg.sunX : 0.0;
		this.uniformData[21] = Number.isFinite(cfg.sunY) ? cfg.sunY : 0.86;
		this.uniformData[22] = Number.isFinite(cfg.sunZ) ? cfg.sunZ : 0.5;
		this.uniformData[23] = 0;
		this.uniformData[24] = Number.isFinite(cfg.fogR) ? cfg.fogR : 0.74;
		this.uniformData[25] = Number.isFinite(cfg.fogG) ? cfg.fogG : 0.80;
		this.uniformData[26] = Number.isFinite(cfg.fogB) ? cfg.fogB : 0.83;
		this.uniformData[27] = 1;
		this.uniformData[28] = 0;
		this.uniformData[29] = 0;
		this.uniformData[30] = 0;
		this.uniformData[31] = 0;
		backend.writeBuffer(this.uniformBuffer, this.uniformData, 0);
		return true;
	}

	draw(pass, cfg = {}) {
		if (!pass) return false;
		if (!this.update(cfg)) return false;
		const pipeline = this.createPipeline(cfg);
		if (!pipeline || !this.bindGroup) return false;
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, this.bindGroup);
		pass.draw(3, 1, 0, 0);
		return true;
	}

	#rebuildBinding() {
		const backend = this.backend;
		const pipeline = this.pipeline ?? this.createPipeline();
		if (!backend || !pipeline || !this.uniformBuffer) return false;
		const layout = pipeline.getBindGroupLayout(0);
		this.bindGroup = backend.createBindGroup({
			label: "SkyBG",
			layout,
			entries: [{ binding: 0, resource: { buffer: this.uniformBuffer, offset: 0, size: this.uniformData.byteLength } }],
		});
		return !!this.bindGroup;
	}

	#normalizePipelineCfg(cfg) {
		const src = cfg && typeof cfg === "object" ? cfg : {};
		const backend = this.backend;
		return {
			format: String(src.format ?? backend?.format ?? "bgra8unorm"),
			depthFormat: String(src.depthFormat ?? "depth24plus"),
		};
	}
}

class GrassCompute {
	constructor(backendRef = null) {
		this.backend = backendRef ?? null;
		this.module = null;
		this.pipeline = null;
		this.bindGroup = null;
	}

	setBackend(backendRef) {
		if (this.backend !== backendRef) {
			this.backend = backendRef ?? null;
			this.module = null;
			this.pipeline = null;
			this.bindGroup = null;
		}
		return this.backend;
	}

	createModule() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return null;
		if (this.module) return this.module;
		this.module = backend.createShaderModule({
			label: "GrassComputeModule",
			code: `
struct SceneUBO {
	viewProj: mat4x4f,
	model: mat4x4f,
	grid: vec4f,
	height: vec4f,
	light: vec4f,
	misc: vec4f,
	camPos: vec4f,
	fog: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUBO;
@group(0) @binding(1) var<storage, read_write> instances: array<vec4f>;
@group(0) @binding(2) var heightSampler: sampler;
@group(0) @binding(3) var texHeight: texture_2d<f32>;

fn sampleHeight(uv: vec2f) -> f32 {
	let c = textureSampleLevel(texHeight, heightSampler, uv, 0.0).r;
	return c * scene.height.y;
}

@compute @workgroup_size(64)
fn cp_main(@builtin(global_invocation_id) gid: vec3u) {
	let i = gid.x;
	let total = u32(max(1.0, scene.grid.x * scene.grid.y));
	if (i >= total) {
		return;
	}

	var d = instances[i];
	let baseXZ = vec2f(d.x, d.z);
	let halfExtent = scene.grid.w;
	let uv = vec2f(
		baseXZ.x / (halfExtent * 2.0) + 0.5,
		baseXZ.y / (halfExtent * 2.0) + 0.5
	);

	let h = sampleHeight(uv);
	let phase = d.w * 6.28318530718;
	let t = scene.misc.x;
	let freq = scene.misc.z;
	let amp = scene.misc.w;
	let primary = sin(t * freq + phase + baseXZ.x * 0.13 + baseXZ.y * 0.17);
	let secondary = cos(t * (freq * 0.57) + phase * 1.71 + h * 0.61);
	let localSway = (primary * 0.7 + secondary * 0.3) * amp;

	let windDir = normalize(vec2f(0.82, 0.57));
	let along = dot(baseXZ, windDir);
	let tc = fract(t * 0.055 + 0.13);
	let burst = exp(-pow((tc - 0.55) * 4.8, 2.0));
	let lineCenter = mix(-scene.grid.w * 1.35, scene.grid.w * 1.35, tc);
	let lineDist = abs(along - lineCenter);
	let lineBand = exp(-pow(lineDist * 0.095, 2.0));
	let ripple = sin(t * (freq * 2.4) + along * 0.42 + phase * 0.35);
	let gust = lineBand * burst * ripple * (amp * 2.6);

	let sway = localSway + gust;
	d.y = sway;
	instances[i] = d;
}
			`,
		});
		return this.module;
	}

	createPipeline() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return null;
		if (this.pipeline) return this.pipeline;
		const module = this.createModule();
		if (!module) return null;
		this.pipeline = backend.createComputePipeline({
			label: "GrassComputePipeline",
			layout: "auto",
			compute: {
				module,
				entryPoint: "cp_main",
			},
		});
		return this.pipeline;
	}
}

export class GrashMesh {
	constructor(backendRef = null, data = null) {
		this.backend = backendRef ?? null;
		this.vertices = null;
		this.indices = null;
		this.vertexStride = 5 * 4;
		this.vertexCount = 0;
		this.indexCount = 0;
		this.indexFormat = "uint32";
		this.vertexBuffer = null;
		this.indexBuffer = null;

		if (data && typeof data === "object") {
			this.setData(data);
		}
	}

	static vertexBufferLayout() {
		return {
			arrayStride: 5 * 4,
			stepMode: "vertex",
			attributes: [
				{ shaderLocation: 0, offset: 0, format: "float32x3" },
				{ shaderLocation: 1, offset: 3 * 4, format: "float32x2" },
			],
		};
	}

	static instanceBufferLayout() {
		return {
			arrayStride: 4 * 4,
			stepMode: "instance",
			attributes: [
				{ shaderLocation: 2, offset: 0, format: "float32x4" },
			],
		};
	}

	static bladeData(size = 1.0) {
		const half = size * 0.5;
		const heights = [0, size];
		const pos = [];
		const uv = [];
		const idx = [];
		const angles = [0, Math.PI * (2 / 3), Math.PI * (4 / 3)];

		for (let q = 0; q < angles.length; q += 1) {
			const a = angles[q];
			const dx = Math.cos(a);
			const dz = Math.sin(a);
			const base = q * 4;

			pos.push(-dx * half, heights[0], -dz * half);
			pos.push(dx * half, heights[0], dz * half);
			pos.push(dx * half, heights[1], dz * half);
			pos.push(-dx * half, heights[1], -dz * half);

			uv.push(0, 1);
			uv.push(1, 1);
			uv.push(1, 0);
			uv.push(0, 0);

			idx.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3);
		}

		return {
			positions: new Float32Array(pos),
			uvs: new Float32Array(uv),
			indices: new Uint16Array(idx),
		};
	}

	setBackend(backendRef) {
		this.backend = backendRef ?? null;
		return this.backend;
	}

	setData(data = {}) {
		const src = data && typeof data === "object" ? data : {};
		if (src.vertices && src.indices) {
			this.vertices = src.vertices instanceof Float32Array ? src.vertices : new Float32Array(src.vertices);
			this.indices = this.#toIndexArray(src.indices);
		} else {
			this.vertices = this.#buildVertices(src.positions, src.uvs);
			this.indices = this.#toIndexArray(src.indices);
		}

		this.vertexCount = this.vertices ? (this.vertices.length / 5) | 0 : 0;
		this.indexCount = this.indices ? this.indices.length : 0;
		this.indexFormat = this.indices instanceof Uint16Array ? "uint16" : "uint32";
		return this;
	}

	createGPU() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready || !this.vertices || !this.indices) {
			return false;
		}

		this.destroyGPU();

		const vbUsage =
			(globalThis.GPUBufferUsage?.VERTEX ?? 0x20) |
			(globalThis.GPUBufferUsage?.COPY_DST ?? 0x08);
		const ibUsage =
			(globalThis.GPUBufferUsage?.INDEX ?? 0x10) |
			(globalThis.GPUBufferUsage?.COPY_DST ?? 0x08);

		this.vertexBuffer = backend.createBuffer({
			label: "GrashMeshVB",
			size: this.vertices.byteLength,
			usage: vbUsage,
			mappedAtCreation: false,
		});
		this.indexBuffer = backend.createBuffer({
			label: "GrashMeshIB",
			size: this.indices.byteLength,
			usage: ibUsage,
			mappedAtCreation: false,
		});
		if (!this.vertexBuffer || !this.indexBuffer) {
			this.destroyGPU();
			return false;
		}

		backend.writeBuffer(this.vertexBuffer, this.vertices);
		backend.writeBuffer(this.indexBuffer, this.indices);
		return true;
	}

	destroyGPU() {
		if (this.vertexBuffer && typeof this.vertexBuffer.destroy === "function") {
			this.vertexBuffer.destroy();
		}
		if (this.indexBuffer && typeof this.indexBuffer.destroy === "function") {
			this.indexBuffer.destroy();
		}
		this.vertexBuffer = null;
		this.indexBuffer = null;
	}

	#toIndexArray(indices) {
		if (!indices) return null;
		if (indices instanceof Uint16Array || indices instanceof Uint32Array) return indices;
		const arr = Array.isArray(indices) ? indices : Array.from(indices);
		let max = 0;
		for (let i = 0; i < arr.length; i += 1) {
			const v = Number(arr[i]) | 0;
			if (v > max) max = v;
		}
		return max <= 65535 ? new Uint16Array(arr) : new Uint32Array(arr);
	}

	#buildVertices(positions, uvs) {
		const pos = positions instanceof Float32Array ? positions : new Float32Array(positions ?? []);
		const uv = uvs instanceof Float32Array ? uvs : new Float32Array(uvs ?? []);
		const count = (pos.length / 3) | 0;
		const out = new Float32Array(count * 5);

		for (let i = 0; i < count; i += 1) {
			const p3 = i * 3;
			const t2 = i * 2;
			const o = i * 5;
			out[o + 0] = pos[p3 + 0] ?? 0;
			out[o + 1] = pos[p3 + 1] ?? 0;
			out[o + 2] = pos[p3 + 2] ?? 0;
			out[o + 3] = uv[t2 + 0] ?? 0;
			out[o + 4] = uv[t2 + 1] ?? 0;
		}

		return out;
	}
}

export class GrassField {
	constructor(backendRef = null, texture = null) {
		this.backend = null;
		this.camera = null;
		this.texture = new GrassTexture(this);
		this.shader = new GrassShader(this.backend);
		this.compute = new GrassCompute(this.backend);
		this.mesh = new GrashMesh(this.backend, GrashMesh.bladeData());
		this.scene = {
			ubo: null,
			bindGroup: null,
			uniformBuffer: null,
			uniformData: new Float32Array(56),
			modelMatrix: mAth.Mat4.makeIdentity(),
			gridCountX: 640,
			gridCountZ: 640,
			gridSpacing: 0.2,
			instanceData: null,
			instanceBuffer: null,
			instanceCount: 0,
			heightResolution: 1024,
			heightData: null,
			heightTexture: null,
			heightView: null,
			heightSampler: null,
			albedoSampler: null,
			computeBindGroup: null,
		};

		if (backendRef && typeof backendRef === "object" && ("backend" in backendRef || "texture" in backendRef)) {
			this.setBackend(backendRef.backend ?? null);
			if (backendRef.camera) this.setCamera(backendRef.camera);
			if (backendRef.texture != null) {
				if (typeof backendRef.texture === "string") {
					void this.setTextureFromURL(backendRef.texture);
				}
			}
			return;
		}

		this.setBackend(backendRef);
		if (typeof texture === "string" && texture.length > 0) {
			void this.setTextureFromURL(texture);
		}
	}

	setBackend(backendRef) {
		if (this.scene.uniformBuffer && typeof this.scene.uniformBuffer.destroy === "function") {
			this.scene.uniformBuffer.destroy();
		}
		if (this.scene.instanceBuffer && typeof this.scene.instanceBuffer.destroy === "function") {
			this.scene.instanceBuffer.destroy();
		}
		if (this.scene.heightTexture && typeof this.scene.heightTexture.destroy === "function") {
			this.scene.heightTexture.destroy();
		}
		this.backend = backendRef ?? null;
		this.shader.setBackend(this.backend);
		this.compute.setBackend(this.backend);
		this.mesh.setBackend(this.backend);
		this.scene.bindGroup = null;
		this.scene.uniformBuffer = null;
		this.scene.ubo = null;
		this.scene.instanceBuffer = null;
		this.scene.heightTexture = null;
		this.scene.heightView = null;
		this.scene.heightSampler = null;
		this.scene.albedoSampler = null;
		this.scene.computeBindGroup = null;
		if (this.texture.bitmap) {
			this.texture.rebuildGPU();
		}
		return this.backend;
	}

	async setTextureFromURL(url) {
		const texture = await this.texture.setFromURL(url);
		this.#rebuildSceneBinding();
		this.#rebuildComputeBinding();
		return texture;
	}

	setCamera(cameraRef) {
		this.camera = cameraRef ?? null;
		return this.camera;
	}

	createEngine() {
		this.shader.createModule();
		this.shader.createPipeline();
		this.compute.createModule();
		this.compute.createPipeline();
		this.mesh.createGPU();
		this.#buildInstances();
		this.#buildHeightMapTexture();
		this.#rebuildSceneBinding();
		this.#rebuildComputeBinding();
	}

	render(cfg = {}) {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready || !this.camera) return false;

		const frameCfg = this.#normalizeFrameCfg(cfg.frame);
		const passCfg = this.#normalizePassCfg(cfg.pass);
		const ok = this.#ensureResources(cfg.pipeline ?? passCfg.pipeline ?? {});
		if (!ok) return false;
		this.update(cfg.sim);

		backend.beginFrame(frameCfg);
		this.#runComputePass();
		const pass = backend.beginRenderPass(passCfg);
		if (!pass) {
			backend.endFrame();
			return false;
		}
		this.draw(pass, cfg.pipeline ?? passCfg.pipeline ?? {});
		pass.end();
		backend.endFrame();
		return true;
	}

	update(simCfg = {}) {
		const ok = this.#ensureResources({});
		if (!ok) return false;
		this.#writeSceneUniform(this.#normalizeSimCfg(simCfg));
		return true;
	}

	simulate(simCfg = {}) {
		if (!this.update(simCfg)) return false;
		return this.#runComputePass();
	}

	draw(pass, pipelineCfg = {}) {
		if (!pass) return false;
		const pipeline = this.shader.createPipeline(pipelineCfg ?? {});
		if (!pipeline || !this.scene.bindGroup || !this.mesh.vertexBuffer || !this.scene.instanceBuffer || !this.mesh.indexBuffer) {
			return false;
		}
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, this.scene.bindGroup);
		pass.setVertexBuffer(0, this.mesh.vertexBuffer);
		pass.setVertexBuffer(1, this.scene.instanceBuffer);
		pass.setIndexBuffer(this.mesh.indexBuffer, this.mesh.indexFormat);
		pass.drawIndexed(this.mesh.indexCount, this.scene.instanceCount, 0, 0, 0);
		return true;
	}

	#ensureResources(pipelineCfg = {}) {
		const pipeline = this.shader.createPipeline(pipelineCfg ?? {});
		if (!pipeline) return false;
		if (!this.mesh.vertexBuffer || !this.mesh.indexBuffer) {
			if (!this.mesh.createGPU()) return false;
		}
		if (!this.scene.instanceBuffer) {
			if (!this.#buildInstances()) return false;
		}
		if (!this.scene.heightView) {
			if (!this.#buildHeightMapTexture()) return false;
		}
		if (!this.scene.bindGroup) {
			this.#rebuildSceneBinding();
			if (!this.scene.bindGroup) return false;
		}
		if (!this.scene.computeBindGroup) {
			this.#rebuildComputeBinding();
			if (!this.scene.computeBindGroup) return false;
		}
		return true;
	}

	#writeSceneUniform(simCfg) {
		const viewProj = mAth.Mat4.mul(this.camera.projection, this.camera.view);
		this.scene.uniformData.set(viewProj, 0);
		this.scene.uniformData.set(this.scene.modelMatrix, 16);
		const halfExtentX = this.scene.gridCountX * this.scene.gridSpacing * 0.5;
		const halfExtentZ = this.scene.gridCountZ * this.scene.gridSpacing * 0.5;
		const halfExtent = Math.max(halfExtentX, halfExtentZ, 0.001);
		const gridOffset = 32;
		const heightOffset = 36;
		const lightOffset = 40;
		const miscOffset = 44;
		const camOffset = 48;
		const fogOffset = 52;
		this.scene.uniformData[gridOffset + 0] = this.scene.gridCountX;
		this.scene.uniformData[gridOffset + 1] = this.scene.gridCountZ;
		this.scene.uniformData[gridOffset + 2] = this.scene.gridSpacing;
		this.scene.uniformData[gridOffset + 3] = halfExtent;
		this.scene.uniformData[heightOffset + 0] = this.scene.heightResolution;
		this.scene.uniformData[heightOffset + 1] = 15.0;
		this.scene.uniformData[heightOffset + 2] = 5.0;
		this.scene.uniformData[heightOffset + 3] = 0;
		this.scene.uniformData[lightOffset + 0] = 0.35;
		this.scene.uniformData[lightOffset + 1] = 1.0;
		this.scene.uniformData[lightOffset + 2] = 0.25;
		this.scene.uniformData[lightOffset + 3] = 0;
		this.scene.uniformData[miscOffset + 0] = simCfg.time;
		this.scene.uniformData[miscOffset + 1] = simCfg.delta;
		this.scene.uniformData[miscOffset + 2] = simCfg.freq;
		this.scene.uniformData[miscOffset + 3] = simCfg.amp;
		this.scene.uniformData[camOffset + 0] = this.camera.position[0];
		this.scene.uniformData[camOffset + 1] = this.camera.position[1];
		this.scene.uniformData[camOffset + 2] = this.camera.position[2];
		this.scene.uniformData[camOffset + 3] = 1;
		this.scene.uniformData[fogOffset + 0] = 0.09;
		this.scene.uniformData[fogOffset + 1] = 1.18;
		this.scene.uniformData[fogOffset + 2] = 0;
		this.scene.uniformData[fogOffset + 3] = 0;
		this.backend.writeBuffer(this.scene.uniformBuffer, this.scene.uniformData, 0);
	}

	#rebuildSceneBinding() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return false;
		const pipeline = this.shader.pipeline ?? this.shader.createPipeline();
		if (!pipeline || !this.texture.view || !this.scene.heightView) return false;

		if (this.scene.uniformBuffer && typeof this.scene.uniformBuffer.destroy === "function") {
			this.scene.uniformBuffer.destroy();
		}
		const uboSize = this.scene.uniformData.byteLength;
		const usage =
			(globalThis.GPUBufferUsage?.UNIFORM ?? 0x40) |
			(globalThis.GPUBufferUsage?.COPY_DST ?? 0x08);

		this.scene.uniformBuffer = backend.createBuffer({
			label: "GrassSceneUBO",
			size: uboSize,
			usage,
			mappedAtCreation: false,
		});
		if (!this.scene.uniformBuffer) return false;

		this.scene.ubo = {
			buffer: this.scene.uniformBuffer,
			size: uboSize,
		};

		this.scene.albedoSampler = backend.createSampler({
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
		});
		if (!this.scene.albedoSampler) return false;

		this.scene.heightSampler = backend.createSampler({
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "nearest",
		});
		if (!this.scene.heightSampler) return false;

		const bindGroupLayout = pipeline.getBindGroupLayout(0);
		this.scene.bindGroup = backend.createBindGroup({
			label: "GrassSceneBG",
			layout: bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: this.scene.ubo.buffer, offset: 0, size: this.scene.ubo.size } },
				{ binding: 1, resource: this.scene.albedoSampler },
				{ binding: 2, resource: this.texture.view },
				{ binding: 3, resource: this.scene.heightSampler },
				{ binding: 4, resource: this.scene.heightView },
			],
		});
		this.scene.computeBindGroup = null;
		return !!this.scene.bindGroup;
	}

	#rebuildComputeBinding() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return false;
		const pipeline = this.compute.pipeline ?? this.compute.createPipeline();
		if (!pipeline || !this.scene.uniformBuffer || !this.scene.instanceBuffer || !this.scene.heightView || !this.scene.heightSampler) {
			return false;
		}

		const layout = pipeline.getBindGroupLayout(0);
		this.scene.computeBindGroup = backend.createBindGroup({
			label: "GrassComputeBG",
			layout,
			entries: [
				{ binding: 0, resource: { buffer: this.scene.uniformBuffer, offset: 0, size: this.scene.uniformData.byteLength } },
				{ binding: 1, resource: { buffer: this.scene.instanceBuffer, offset: 0, size: this.scene.instanceData.byteLength } },
				{ binding: 2, resource: this.scene.heightSampler },
				{ binding: 3, resource: this.scene.heightView },
			],
		});
		return !!this.scene.computeBindGroup;
	}

	#runComputePass() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return false;
		const pipeline = this.compute.pipeline ?? this.compute.createPipeline();
		if (!pipeline || !this.scene.computeBindGroup) return false;
		const pass = backend.beginComputePass({ label: "GrassComputePass" });
		if (!pass) return false;
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, this.scene.computeBindGroup);
		const groups = Math.ceil(this.scene.instanceCount / 64);
		pass.dispatchWorkgroups(Math.max(1, groups), 1, 1);
		pass.end();
		return true;
	}

	#buildInstances() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return false;
		if (this.scene.instanceBuffer && typeof this.scene.instanceBuffer.destroy === "function") {
			this.scene.instanceBuffer.destroy();
		}

		const countX = Math.max(1, this.scene.gridCountX | 0);
		const countZ = Math.max(1, this.scene.gridCountZ | 0);
		const spacing = this.scene.gridSpacing;
		const total = countX * countZ;
		const data = new Float32Array(total * 4);
		const halfX = (countX - 1) * spacing * 0.5;
		const halfZ = (countZ - 1) * spacing * 0.5;
		let p = 0;
		for (let z = 0; z < countZ; z += 1) {
			const wz = z * spacing - halfZ;
			for (let x = 0; x < countX; x += 1) {
				const wx = x * spacing - halfX;
				data[p + 0] = wx;
				data[p + 1] = 0;
				data[p + 2] = wz;
				data[p + 3] = (Math.sin(wx * 11.73 + wz * 7.91) * 0.5 + 0.5);
				p += 4;
			}
		}

		const usage =
			(globalThis.GPUBufferUsage?.VERTEX ?? 0x20) |
			(globalThis.GPUBufferUsage?.STORAGE ?? 0x80) |
			(globalThis.GPUBufferUsage?.COPY_DST ?? 0x08);
		this.scene.instanceBuffer = backend.createBuffer({
			label: "GrassInstanceBuffer",
			size: data.byteLength,
			usage,
			mappedAtCreation: false,
		});
		if (!this.scene.instanceBuffer) return false;
		backend.writeBuffer(this.scene.instanceBuffer, data, 0);
		this.scene.instanceData = data;
		this.scene.instanceCount = total;
		return true;
	}

	#buildHeightMapTexture() {
		const backend = this.backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return false;
		if (this.scene.heightTexture && typeof this.scene.heightTexture.destroy === "function") {
			this.scene.heightTexture.destroy();
		}

		const resolution = Math.max(64, this.scene.heightResolution | 0);
		const data = this.#generateHeightMapRGBA(resolution);
		const usage =
			(globalThis.GPUTextureUsage?.TEXTURE_BINDING ?? 0x04) |
			(globalThis.GPUTextureUsage?.COPY_DST ?? 0x02);
		const texture = backend.createTexture2D({
			label: "GrassHeightMap",
			width: resolution,
			height: resolution,
			format: "rgba8unorm",
			usage,
		});
		if (!texture) return false;

		backend.device.queue.writeTexture(
			{ texture },
			data,
			{ offset: 0, bytesPerRow: resolution * 4, rowsPerImage: resolution },
			{ width: resolution, height: resolution, depthOrArrayLayers: 1 }
		);

		this.scene.heightData = data;
		this.scene.heightTexture = texture;
		this.scene.heightView = texture.createView();
		this.scene.bindGroup = null;
		this.scene.computeBindGroup = null;
		return true;
	}

	#generateHeightMapRGBA(size) {
		const data = new Uint8Array(size * size * 4);
		let p = 0;
		for (let z = 0; z < size; z += 1) {
			const nz = z / (size - 1);
			for (let x = 0; x < size; x += 1) {
				const nx = x / (size - 1);
				const fx = nx * 7.0;
				const fz = nz * 7.0;
				const h0 = Math.sin(fx * 1.25) * Math.cos(fz * 1.10);
				const h1 = Math.sin(fx * 3.2 + fz * 2.1) * 0.35;
				const h2 = Math.cos(fx * 5.7 - fz * 4.9) * 0.15;
				const h = Math.max(-1, Math.min(1, h0 * 0.7 + h1 + h2));
				const u8 = Math.max(0, Math.min(255, Math.round((h * 0.5 + 0.5) * 255)));
				data[p + 0] = u8;
				data[p + 1] = u8;
				data[p + 2] = u8;
				data[p + 3] = 255;
				p += 4;
			}
		}
		return data;
	}

	#normalizeFrameCfg(cfg) {
		const src = cfg && typeof cfg === "object" ? cfg : {};
		return {
			clearColor: Array.isArray(src.clearColor) ? src.clearColor : [0.52, 0.68, 0.9, 1],
			clearColorEnabled: src.clearColorEnabled !== false,
			clearDepth: Number.isFinite(src.clearDepth) ? src.clearDepth : 1,
			clearDepthEnabled: src.clearDepthEnabled !== false,
			useDepth: src.useDepth !== false,
		};
	}

	#normalizePassCfg(cfg) {
		const src = cfg && typeof cfg === "object" ? cfg : {};
		const out = {};
		if (Array.isArray(src.clearColor)) out.clearColor = src.clearColor;
		if (src.clearColorEnabled === true || src.clearColorEnabled === false) out.clearColorEnabled = src.clearColorEnabled;
		if (Number.isFinite(src.clearDepth)) out.clearDepth = src.clearDepth;
		if (src.clearDepthEnabled === true || src.clearDepthEnabled === false) out.clearDepthEnabled = src.clearDepthEnabled;
		if (src.useDepth === true || src.useDepth === false) out.useDepth = src.useDepth;
		if (src.pipeline && typeof src.pipeline === "object") out.pipeline = src.pipeline;
		return out;
	}

	#normalizeSimCfg(cfg) {
		const src = cfg && typeof cfg === "object" ? cfg : {};
		const time = Number.isFinite(src.time) ? src.time : performance.now() * 0.001;
		const delta = Number.isFinite(src.delta) ? src.delta : 1 / 60;
		const freq = Number.isFinite(src.freq) ? src.freq : 1.8;
		const amp = Number.isFinite(src.amp) ? src.amp : 0.22;
		return { time, delta, freq, amp };
	}
}

export default GrassField;
