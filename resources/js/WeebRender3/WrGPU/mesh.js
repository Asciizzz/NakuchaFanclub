import { Mat4 } from "../../Alib/Alm.js";
import { Awgpu } from "../../Alib/Awgpu/index.js";

export const STD_VERTEX_STRIDE = 96;

export const STD_VERTEX_BUFFER = Object.freeze({
	arrayStride: STD_VERTEX_STRIDE,
	attributes: Object.freeze([
		Object.freeze({ shaderLocation: 0, offset: 0, format: "float32x3" }),
		Object.freeze({ shaderLocation: 1, offset: 12, format: "float32x3" }),
		Object.freeze({ shaderLocation: 2, offset: 24, format: "float32x2" }),
		Object.freeze({ shaderLocation: 3, offset: 32, format: "float32x4" }),
		Object.freeze({ shaderLocation: 4, offset: 48, format: "float32x4" }),
		Object.freeze({ shaderLocation: 5, offset: 64, format: "float32x4" }),
		Object.freeze({ shaderLocation: 6, offset: 80, format: "float32x4" }),
	]),
});

const STD_VERTEX_FIELD_NAMES = Object.freeze([
	"position",
	"normal",
	"uv",
	"tangent",
	"color",
	"boneID",
	"boneWeight",
]);

function asList(value) {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

function deviceOf(backend) {
	return backend?.device ?? backend ?? null;
}

function gpuUsage() {
	return globalThis.GPUBufferUsage ?? null;
}

function makeGPUBuffer(device, label, data, usage) {
	if (!device || !data || !usage) return null;
	const buffer = device.createBuffer({
		label,
		size: Math.max(4, data.byteLength),
		usage,
	});
	device.queue?.writeBuffer?.(buffer, 0, data);
	return buffer;
}

function copyMat4(value, out, index) {
	const dst = index * 16;
	if (value && (ArrayBuffer.isView(value) || Array.isArray(value))) {
		out.set(value.subarray ? value.subarray(0, 16) : value.slice(0, 16), dst);
		return;
	}
	out.set(Mat4.IDENTITY, dst);
}

function resolveNode(ctx, ref) {
	if (!ctx) return null;
	return ctx.getNode(ref);
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

function metaObj(root, key) {
	if (!root[key] || typeof root[key] !== "object") root[key] = {};
	return root[key];
}

export class Texture {
	constructor(options = {}) {
		this.label = String(options.label ?? options.name ?? "");
		this.texture = options.texture ?? null;
		this.view = options.view ?? this.texture?.createView?.() ?? null;
		this.sampler = options.sampler ?? null;
		this.width = Math.max(0, Number(options.width ?? 0) | 0);
		this.height = Math.max(0, Number(options.height ?? 0) | 0);
		this.format = options.format ?? "rgba8unorm";
	}

	destroy() {
		this.texture?.destroy?.();
		this.texture = null;
		this.view = null;
		return this;
	}
}

export class Material {
	constructor(options = {}) {
		this.name = String(options.name ?? "");
		this.albedoColor = Float32Array.from(options.albedoColor ?? [1, 1, 1, 1]);
		this.albedoTexture = options.albedoTexture ?? null;
		this.normalTexture = options.normalTexture ?? null;
		this.metallicRoughnessTexture = options.metallicRoughnessTexture ?? null;
		this.emissiveTexture = options.emissiveTexture ?? null;
		this.bindGroup = options.bindGroup ?? null;
		this.extras = options.extras ?? null;
	}

	static createStandardBind(shader, slot, options = {}) {
		const group = Math.max(0, Number(options.group ?? 1) | 0);
		const materialBinding = Math.max(0, Number(options.materialBinding ?? 0) | 0);
		const textureBinding = Math.max(0, Number(options.albedoTextureBinding ?? 1) | 0);
		const samplerBinding = Math.max(0, Number(options.albedoSamplerBinding ?? 2) | 0);
		const structName = String(options.structName ?? "Material");
		const name = String(options.name ?? "material");
		const albedoColor = String(options.albedoColor ?? "albedoColor");
		const albedoTexture = String(options.albedoTexture ?? "albedoTexture");
		const albedoSampler = String(options.albedoSampler ?? "albedoSampler");

		shader.replace(slot, `struct ${structName} {
\t${albedoColor}: vec4f,
}

@group(${group}) @binding(${materialBinding}) var<uniform> ${name}: ${structName};
@group(${group}) @binding(${textureBinding}) var ${albedoTexture}: texture_2d<f32>;
@group(${group}) @binding(${samplerBinding}) var ${albedoSampler}: sampler;`);
		const bindGroups = metaObj(shader.meta, "bindGroups");
		const material = metaObj(shader.meta, "material");
		bindGroups.material = {
			group,
			binding: materialBinding,
			name,
			albedoTexture: { group, binding: textureBinding, name: albedoTexture },
			albedoSampler: { group, binding: samplerBinding, name: albedoSampler },
		};
		material.standard = {
			structName,
			name,
			albedoColor,
			albedoTexture,
			albedoSampler,
		};
		return shader;
	}
}

export class Skeleton {
	constructor(options = {}) {
		this.name = String(options.name ?? "");
		this.joints = asList(options.joints).map((joint, index) => ({
			name: String(joint?.name ?? `joint_${index}`),
			parentIndex: Number.isInteger(joint?.parentIndex) ? joint.parentIndex : -1,
			inverseBindMatrix: Mat4(joint?.inverseBindMatrix ?? options.inverseBindMatrices?.[index] ?? Mat4.IDENTITY),
			bindMatrix: Mat4(joint?.bindMatrix ?? Mat4.IDENTITY),
		}));
		this.inverseBindMatrices = this.joints.map((joint) => joint.inverseBindMatrix);
		this.nameToIndex = new Map();
		for (let i = 0; i < this.joints.length; i++) {
			const name = this.joints[i].name;
			if (name) this.nameToIndex.set(name, i);
		}
	}

	find(name) {
		const index = this.index(name);
		return index < 0 ? null : this.joints[index];
	}

	index(name) {
		if (Number.isInteger(name)) return name >= 0 && name < this.joints.length ? name : -1;
		return this.nameToIndex.get(String(name ?? "")) ?? -1;
	}
}

export class Submesh {
	constructor(options = {}) {
		this.name = String(options.name ?? "");
		this.indexStart = Math.max(0, Number(options.indexStart ?? options.firstIndex ?? 0) | 0);
		this.indexCount = Math.max(0, Number(options.indexCount ?? 0) | 0);
		this.vertexStart = Number(options.vertexStart ?? options.baseVertex ?? 0) | 0;
		this.vertexCount = Math.max(0, Number(options.vertexCount ?? 0) | 0);
		this.material = options.material ?? null;
		this.bounds = options.bounds ?? null;
	}
}

export class Mesh {
	static STD_VERTEX_STRIDE = STD_VERTEX_STRIDE;
	static STD_VERTEX_BUFFER = STD_VERTEX_BUFFER;

	static createVertexLayout(shader, slot, options = {}) {
		const structName = String(options.structName ?? "VertexIn");
		const inputName = String(options.inputName ?? "input");
		const fields = options.fields ?? {};
		const lines = [];
		const metaFields = {};
		for (let i = 0; i < STD_VERTEX_BUFFER.attributes.length; i++) {
			const attr = STD_VERTEX_BUFFER.attributes[i];
			const fallback = STD_VERTEX_FIELD_NAMES[i] ?? `field${i}`;
			const name = String(fields[fallback] ?? options[fallback] ?? fallback);
			lines.push(`\t@location(${attr.shaderLocation}) ${name}: ${wgslTypeOf(attr.format)},`);
			metaFields[fallback] = `${inputName}.${name}`;
		}
		shader.replace(slot, options.fieldsOnly
			? lines.join("\n")
			: `struct ${structName} {
${lines.join("\n")}
}`);
		const vertex = metaObj(shader.meta, "vertex");
		vertex.buffers = vertex.buffers ?? [];
		if (!vertex.buffers.includes(STD_VERTEX_BUFFER)) {
			vertex.buffers.push(STD_VERTEX_BUFFER);
		}
		vertex.structName = structName;
		vertex.inputName = inputName;
		vertex.fields = {
			...(vertex.fields ?? {}),
			...metaFields,
		};
		return shader;
	}

	constructor(options = {}) {
		const usage = gpuUsage();
		const device = deviceOf(options.backend);
		const vertices = options.vertices ?? null;
		const indices = options.indices ?? null;

		this.backend = options.backend ?? null;
		this.label = String(options.label ?? options.name ?? "");
		this.vertexBuffer = options.vertexBuffer ?? makeGPUBuffer(device, `${this.label || "Mesh"}VertexBuffer`, vertices, usage ? usage.VERTEX | usage.COPY_DST : 0);
		this.indexBuffer = options.indexBuffer ?? makeGPUBuffer(device, `${this.label || "Mesh"}IndexBuffer`, indices, usage ? usage.INDEX | usage.COPY_DST : 0);
		this.indexFormat = options.indexFormat ?? (indices instanceof Uint16Array ? "uint16" : "uint32");
		this.vertexCount = Math.max(0, Number(options.vertexCount ?? ((vertices?.length ?? 0) / 24)) | 0);
		this.indexCount = Math.max(0, Number(options.indexCount ?? (indices?.length ?? 0)) | 0);
		this.textures = asList(options.textures).map((texture) => texture instanceof Texture ? texture : new Texture(texture));
		this.materials = asList(options.materials).map((material) => material instanceof Material ? material : new Material(material));
		this.skeleton = options.skeleton instanceof Skeleton ? options.skeleton : (options.skeleton ? new Skeleton(options.skeleton) : null);
		this.morphs = options.morphs ?? null;
		this.morphBuffers = options.morphBuffers ?? [];
		this.bounds = options.bounds ?? null;
		this.submeshes = asList(options.submeshes).map((submesh) => submesh instanceof Submesh ? submesh : new Submesh(submesh));
		if (this.submeshes.length <= 0) {
			this.submeshes.push(new Submesh({
				name: this.label,
				indexStart: 0,
				indexCount: this.indexCount,
				vertexStart: 0,
				vertexCount: this.vertexCount,
				material: this.materials[0] ?? null,
			}));
		}
	}

	static packVertices(attributes = {}) {
		const positions = attributes.positions ?? [];
		const count = Math.max(0, Number(attributes.count ?? (positions.length / 3)) | 0);
		const out = new Float32Array(count * 24);
		for (let i = 0; i < count; i++) {
			const o = i * 24;
			out[o + 0] = positions[i * 3 + 0] ?? 0;
			out[o + 1] = positions[i * 3 + 1] ?? 0;
			out[o + 2] = positions[i * 3 + 2] ?? 0;
			out[o + 3] = attributes.normals?.[i * 3 + 0] ?? 0;
			out[o + 4] = attributes.normals?.[i * 3 + 1] ?? 1;
			out[o + 5] = attributes.normals?.[i * 3 + 2] ?? 0;
			out[o + 6] = attributes.uvs?.[i * 2 + 0] ?? 0;
			out[o + 7] = attributes.uvs?.[i * 2 + 1] ?? 0;
			out[o + 8] = attributes.tangents?.[i * 4 + 0] ?? 1;
			out[o + 9] = attributes.tangents?.[i * 4 + 1] ?? 0;
			out[o + 10] = attributes.tangents?.[i * 4 + 2] ?? 0;
			out[o + 11] = attributes.tangents?.[i * 4 + 3] ?? 1;
			out[o + 12] = attributes.colors?.[i * 4 + 0] ?? 1;
			out[o + 13] = attributes.colors?.[i * 4 + 1] ?? 1;
			out[o + 14] = attributes.colors?.[i * 4 + 2] ?? 1;
			out[o + 15] = attributes.colors?.[i * 4 + 3] ?? 1;
			out[o + 16] = attributes.boneIDs?.[i * 4 + 0] ?? 0;
			out[o + 17] = attributes.boneIDs?.[i * 4 + 1] ?? 0;
			out[o + 18] = attributes.boneIDs?.[i * 4 + 2] ?? 0;
			out[o + 19] = attributes.boneIDs?.[i * 4 + 3] ?? 0;
			out[o + 20] = attributes.boneWeights?.[i * 4 + 0] ?? 0;
			out[o + 21] = attributes.boneWeights?.[i * 4 + 1] ?? 0;
			out[o + 22] = attributes.boneWeights?.[i * 4 + 2] ?? 0;
			out[o + 23] = attributes.boneWeights?.[i * 4 + 3] ?? 0;
		}
		return out;
	}

	createDeform(cfg = {}) {
		return new MeshDeform(this, cfg);
	}

	attach(ctx, parent, options = {}) {
		const parentNode = resolveNode(ctx, parent);
		if (!parentNode) return null;

		const nodes = [];
		const materialGroupIndex = options.materialGroupIndex ?? null;
		for (const submesh of this.submeshes) {
			const node = parentNode.addChild();
			if (!node) continue;
			const groups = [];
			if (materialGroupIndex != null && submesh.material?.bindGroup) {
				groups.push({ index: materialGroupIndex, bindGroup: submesh.material.bindGroup });
			}
			if (groups.length > 0) node.addComp(new Awgpu.SetBindGroups(groups));
			node.addComp(new Awgpu.SetBuffers({
				vertex: [
					{ slot: options.vertexSlot ?? 0, buffer: this.vertexBuffer },
					...asList(options.vertex ?? options.vertices),
				],
				index: {
					buffer: this.indexBuffer,
					format: this.indexFormat,
				},
			}));
			node.addComp(new Awgpu.DrawIndexed({
				indexCount: submesh.indexCount,
				instanceCount: options.instanceCount ?? 1,
				firstIndex: submesh.indexStart,
				baseVertex: submesh.vertexStart,
				firstInstance: options.firstInstance ?? 0,
			}));
			nodes.push(node);
		}

		return {
			root: nodes[0] ?? null,
			nodes,
			submeshes: this.submeshes,
		};
	}

	destroy() {
		this.vertexBuffer?.destroy?.();
		this.indexBuffer?.destroy?.();
		for (const buffer of this.morphBuffers ?? []) buffer?.destroy?.();
		for (const texture of this.textures) texture?.destroy?.();
		return this;
	}
}

export class MeshDeform {
	constructor(mesh, cfg = {}) {
		this.mesh = mesh;
		this.skeleton = mesh?.skeleton ?? null;
		this.morphs = mesh?.morphs ?? null;
		this.groupIndex = Math.max(0, Number(cfg.groupIndex ?? 1) | 0);
		this.bindGroupLayout = cfg.bindGroupLayout ?? null;
		this.bindGroup = cfg.bindGroup ?? null;

		const jointCount = this.skeleton?.joints.length ?? 0;
		const morphCount = Math.max(0, Number(cfg.morphCount ?? this.morphs?.targets?.length ?? 0) | 0);
		this.boneCapacity = Math.max(1, Number(cfg.maxBones ?? 128) | 0, jointCount);
		this.morphCapacity = Math.max(4, Number(cfg.maxMorphs ?? 64) | 0, morphCount);
		this.localBoneMatrices = new Float32Array(this.boneCapacity * 16);
		this.worldBoneMatrices = new Float32Array(this.boneCapacity * 16);
		this.skinMatrices = new Float32Array(this.boneCapacity * 16);
		this.morphWeights = new Float32Array(this.morphCapacity);

		for (let i = 0; i < this.boneCapacity; i++) {
			copyMat4(this.skeleton?.joints[i]?.bindMatrix ?? Mat4.IDENTITY, this.localBoneMatrices, i);
			copyMat4(Mat4.IDENTITY, this.worldBoneMatrices, i);
			copyMat4(Mat4.IDENTITY, this.skinMatrices, i);
		}
		this.updateSkinMatrices();

		const usage = gpuUsage();
		const device = deviceOf(cfg.backend ?? mesh?.backend);
		const bufferUsage = usage ? usage.UNIFORM | usage.STORAGE | usage.COPY_DST : 0;
		this.boneBuffer = cfg.boneBuffer ?? makeGPUBuffer(device, `${mesh?.label || "Mesh"}BoneBuffer`, this.skinMatrices, bufferUsage);
		this.morphBuffer = cfg.morphBuffer ?? makeGPUBuffer(device, `${mesh?.label || "Mesh"}MorphBuffer`, this.morphWeights, bufferUsage);
		this.device = device;

		if (!this.bindGroup && this.bindGroupLayout && device) {
			const entries = [];
			if (this.boneBuffer) entries.push({ binding: cfg.boneBinding ?? 0, resource: { buffer: this.boneBuffer } });
			if (this.morphBuffer) entries.push({ binding: cfg.morphBinding ?? 1, resource: { buffer: this.morphBuffer } });
			this.bindGroup = device.createBindGroup({
				label: cfg.label ?? `${mesh?.label || "Mesh"}DeformBG`,
				layout: this.bindGroupLayout,
				entries,
			});
		}
	}

	static createSkinBind(shader, slot, options = {}) {
		const group = Math.max(0, Number(options.group ?? 2) | 0);
		const binding = Math.max(0, Number(options.binding ?? 0) | 0);
		const maxBones = Math.max(1, Number(options.maxBones ?? 128) | 0);
		const structName = String(options.structName ?? "Skin");
		const name = String(options.name ?? "skin");
		const matrices = String(options.matrices ?? "matrices");
		shader.replace(slot, `struct ${structName} {
\t${matrices}: array<mat4x4f, ${maxBones}>,
}

@group(${group}) @binding(${binding}) var<storage, read> ${name}: ${structName};`);
		const bindGroups = metaObj(shader.meta, "bindGroups");
		const deform = metaObj(shader.meta, "deform");
		bindGroups.skin = { group, binding, name };
		deform.skin = { group, binding, name, structName, matrices, maxBones };
		return shader;
	}

	static createMorphBind(shader, slot, options = {}) {
		const group = Math.max(0, Number(options.group ?? 2) | 0);
		const binding = Math.max(0, Number(options.binding ?? 1) | 0);
		const maxMorphs = Math.max(1, Number(options.maxMorphs ?? 64) | 0);
		const structName = String(options.structName ?? "Morph");
		const name = String(options.name ?? "morph");
		const weights = String(options.weights ?? "weights");
		shader.replace(slot, `struct ${structName} {
\t${weights}: array<f32, ${maxMorphs}>,
}

@group(${group}) @binding(${binding}) var<storage, read> ${name}: ${structName};`);
		const bindGroups = metaObj(shader.meta, "bindGroups");
		const deform = metaObj(shader.meta, "deform");
		bindGroups.morph = { group, binding, name };
		deform.morph = { group, binding, name, structName, weights, maxMorphs };
		return shader;
	}

	static createSkinFn(shader, slot, options = {}) {
		const functionName = String(options.functionName ?? "skinMatrix");
		const deform = metaObj(shader.meta, "deform");
		const bindName = String(options.bindName ?? deform.skin?.name ?? "skin");
		const matrices = String(options.matrices ?? deform.skin?.matrices ?? "matrices");
		shader.replace(slot, `fn ${functionName}(boneID: vec4f, boneWeight: vec4f) -> mat4x4f {
\tlet i0 = u32(boneID.x);
\tlet i1 = u32(boneID.y);
\tlet i2 = u32(boneID.z);
\tlet i3 = u32(boneID.w);
\treturn ${bindName}.${matrices}[i0] * boneWeight.x
\t\t+ ${bindName}.${matrices}[i1] * boneWeight.y
\t\t+ ${bindName}.${matrices}[i2] * boneWeight.z
\t\t+ ${bindName}.${matrices}[i3] * boneWeight.w;
}`);
		deform.skinFn = { functionName, bindName, matrices };
		return shader;
	}

	findBone(name) {
		return this.skeleton?.find(name) ?? null;
	}

	findMorph(name) {
		const index = this.#morphIndex(name);
		return index < 0 ? null : this.morphs?.targets?.[index] ?? null;
	}

	setBone(indexOrName, matrix) {
		const index = this.#boneIndex(indexOrName);
		if (index < 0) return false;
		copyMat4(matrix, this.localBoneMatrices, index);
		return true;
	}

	setWorldBone(indexOrName, matrix) {
		const index = this.#boneIndex(indexOrName);
		if (index < 0) return false;
		copyMat4(matrix, this.worldBoneMatrices, index);
		const inv = this.skeleton?.inverseBindMatrices?.[index] ?? Mat4.IDENTITY;
		Mat4.mul(this.worldBoneMatrices.subarray(index * 16, index * 16 + 16), inv, this.skinMatrices.subarray(index * 16, index * 16 + 16));
		return true;
	}

	setMorph(indexOrName, weight) {
		const index = this.#morphIndex(indexOrName);
		if (index < 0 || index >= this.morphWeights.length) return false;
		this.morphWeights[index] = Number(weight) || 0;
		return true;
	}

	updateSkinMatrices() {
		const count = this.skeleton?.joints.length ?? 0;
		for (let i = 0; i < count; i++) {
			const joint = this.skeleton.joints[i];
			const local = this.localBoneMatrices.subarray(i * 16, i * 16 + 16);
			const world = this.worldBoneMatrices.subarray(i * 16, i * 16 + 16);
			if (joint.parentIndex >= 0) {
				const parent = this.worldBoneMatrices.subarray(joint.parentIndex * 16, joint.parentIndex * 16 + 16);
				Mat4.mul(parent, local, world);
			} else {
				world.set(local);
			}
			const inv = this.skeleton.inverseBindMatrices[i] ?? Mat4.IDENTITY;
			Mat4.mul(world, inv, this.skinMatrices.subarray(i * 16, i * 16 + 16));
		}
		return this;
	}

	write() {
		this.device?.queue?.writeBuffer?.(this.boneBuffer, 0, this.skinMatrices);
		this.device?.queue?.writeBuffer?.(this.morphBuffer, 0, this.morphWeights);
		return this;
	}

	ensureGpu(backend = null) {
		const usage = gpuUsage();
		const device = deviceOf(backend) ?? this.device;
		if (!device || !usage) return this;
		this.device = device;
		const bufferUsage = usage.UNIFORM | usage.STORAGE | usage.COPY_DST;
		if (!this.boneBuffer) {
			this.boneBuffer = makeGPUBuffer(device, `${this.mesh?.label || "Mesh"}BoneBuffer`, this.skinMatrices, bufferUsage);
		}
		if (!this.morphBuffer) {
			this.morphBuffer = makeGPUBuffer(device, `${this.mesh?.label || "Mesh"}MorphBuffer`, this.morphWeights, bufferUsage);
		}
		this.write();
		return this;
	}

	attach(ctx, parent, options = {}) {
		const parentNode = resolveNode(ctx, parent);
		if (!parentNode) return null;
		const node = parentNode.addChild(options.index ?? -1);
		if (!node) return null;
		const bindGroup = options.bindGroup ?? this.bindGroup;
		const groupIndex = options.groupIndex ?? this.groupIndex;
		if (bindGroup) {
			node.addComp(new Awgpu.SetBindGroups([
				{ index: groupIndex, bindGroup },
			]));
		}
		return node;
	}

	destroy() {
		this.boneBuffer?.destroy?.();
		this.morphBuffer?.destroy?.();
		this.boneBuffer = null;
		this.morphBuffer = null;
		this.bindGroup = null;
		return this;
	}

	#boneIndex(value) {
		if (!this.skeleton) return -1;
		return this.skeleton.index(value);
	}

	#morphIndex(value) {
		if (Number.isInteger(value)) return value >= 0 ? value : -1;
		const key = String(value ?? "");
		const targets = this.morphs?.targets ?? [];
		if (this.morphs?.nameToIndex instanceof Map) return this.morphs.nameToIndex.get(key) ?? -1;
		return targets.findIndex((target) => target?.name === key);
	}
}
