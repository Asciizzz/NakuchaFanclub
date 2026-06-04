import { Mat4 } from "../../AzLib/Azm.js";
import { WrWGPU } from "../WrWGPU/index.js";

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
			if (groups.length > 0) node.addComp(new WrWGPU.SetBindGroups(groups));
			node.addComp(new WrWGPU.SetBuffers({
				vertex: [
					{ slot: options.vertexSlot ?? 0, buffer: this.vertexBuffer },
					...asList(options.vertex ?? options.vertices),
				],
				index: {
					buffer: this.indexBuffer,
					format: this.indexFormat,
				},
			}));
			node.addComp(new WrWGPU.DrawIndexed({
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
		this.localBoneMatrices = new Float32Array(Math.max(1, jointCount) * 16);
		this.worldBoneMatrices = new Float32Array(Math.max(1, jointCount) * 16);
		this.skinMatrices = new Float32Array(Math.max(1, jointCount) * 16);
		this.morphWeights = new Float32Array(Math.max(4, morphCount));

		for (let i = 0; i < Math.max(1, jointCount); i++) {
			copyMat4(this.skeleton?.joints[i]?.bindMatrix ?? Mat4.IDENTITY, this.localBoneMatrices, i);
			copyMat4(Mat4.IDENTITY, this.worldBoneMatrices, i);
			copyMat4(Mat4.IDENTITY, this.skinMatrices, i);
		}

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

	attach(ctx, parent, options = {}) {
		const parentNode = resolveNode(ctx, parent);
		if (!parentNode) return null;
		const node = parentNode.addChild(options.index ?? -1);
		if (!node) return null;
		const bindGroup = options.bindGroup ?? this.bindGroup;
		const groupIndex = options.groupIndex ?? this.groupIndex;
		if (bindGroup) {
			node.addComp(new WrWGPU.SetBindGroups([
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

