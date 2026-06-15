import { Mat4 } from "../../Alib/Alm.js";
import { Ctx as TreeCtx, Node as TreeNode } from "../../Alib/Atree.js";
import { Afstep } from "../../Alib/Aflow.js";
import { Material, Mesh, MeshDeform, Texture } from "./mesh.js";

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

function nameOf(value, fallback) {
	return String(value ?? fallback);
}

function asList(value) {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

function deviceOf(backend) {
	return backend?.device ?? backend ?? null;
}

function nodeId(value) {
	if (value && typeof value === "object") return value.id ?? null;
	return value ?? null;
}

function cloneMat4(value) {
	const out = new Float32Array(16);
	out.set(value?.subarray ? value.subarray(0, 16) : Array.from(value ?? Mat4.IDENTITY).slice(0, 16));
	return out;
}

function copyVec4(out, offset, value) {
	const src = value && (ArrayBuffer.isView(value) || Array.isArray(value)) ? value : [0, 0, 0, 0];
	out[offset + 0] = Number(src[0] ?? 0);
	out[offset + 1] = Number(src[1] ?? 0);
	out[offset + 2] = Number(src[2] ?? 0);
	out[offset + 3] = Number(src[3] ?? 0);
}

function metaObj(root, key) {
	if (!root[key] || typeof root[key] !== "object") root[key] = {};
	return root[key];
}

function sameArrayRef(a, b) {
	if (a === b) return true;
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function copyComp(comp, target) {
	if (!comp || typeof comp !== "object") return null;
	if (typeof comp.copy === "function") return comp.copy(target);
	const out = Object.create(Object.getPrototypeOf(comp));
	Object.assign(out, comp);
	return out;
}

function createBuffer(device, label, size, usage) {
	return device.createBuffer({
		label,
		size: Math.max(4, Number(size ?? 0) | 0),
		usage,
	});
}

function gpuStages() {
	return globalThis.GPUShaderStage ?? null;
}

function gpuBufferUsage() {
	return globalThis.GPUBufferUsage ?? null;
}

function gpuTextureUsage() {
	return globalThis.GPUTextureUsage ?? null;
}

export const INSTANCE_F32 = 32;
export const INSTANCE_BYTES = INSTANCE_F32 * 4;

export class InstanceData {
	constructor(options = {}) {
		this.data = new Float32Array(INSTANCE_F32);
		this.setModel(options.model ?? Mat4.IDENTITY);
		for (let i = 0; i < 4; i++) this.setSlot(i, options[`slot${i}`] ?? [0, 0, 0, 0]);
	}

	copy() {
		const out = new InstanceData();
		out.data.set(this.data);
		return out;
	}

	setModel(value) {
		this.data.set(value?.subarray ? value.subarray(0, 16) : Array.from(value ?? Mat4.IDENTITY).slice(0, 16), 0);
		return this;
	}

	setSlot(index, value) {
		const i = uint(index);
		if (i > 3) return this;
		copyVec4(this.data, 16 + i * 4, value);
		return this;
	}

	slot(index) {
		const i = uint(index);
		if (i > 3) return null;
		return this.data.subarray(16 + i * 4, 20 + i * 4);
	}
}

export class WorldComponent {
	enabled = true;

	copy(target = null) {
		const out = Object.create(Object.getPrototypeOf(this));
		Object.assign(out, this);
		return out;
	}
}

export class Transform extends WorldComponent {
	constructor(options = {}) {
		super();
		this.local = cloneMat4(options.local ?? options.matrix ?? Mat4.IDENTITY);
		this.world = cloneMat4(options.world ?? Mat4.IDENTITY);
	}

	copy(target = null) {
		return Object.assign(new Transform({
			local: this.local,
			world: this.world,
		}), {
			enabled: this.enabled,
		});
	}
}

export class MeshRenderer extends WorldComponent {
	constructor(options = {}) {
		super();
		this.mesh = options.mesh ?? null;
		this.shaders = asList(options.shaders ?? options.shader).slice();
		this.instanceData = options.instanceData instanceof InstanceData
			? options.instanceData
			: new InstanceData(options.instanceData ?? {});
		this.deform = options.deform ?? null;
		this.bindGroups = asList(options.bindGroups).slice();
		this.vertex = asList(options.vertex ?? options.vertices).slice();
		this.cfg = {
			display: options.display !== false,
			materialGroupIndex: options.materialGroupIndex ?? null,
			instanceGroupIndex: options.instanceGroupIndex ?? null,
			deformGroupIndex: options.deformGroupIndex ?? null,
		};
	}

	copy(target = null) {
		return Object.assign(new MeshRenderer({
			mesh: this.mesh,
			shaders: this.shaders.slice(),
			instanceData: this.instanceData.copy(),
			deform: this.mesh instanceof Mesh && (this.mesh.skeleton || this.mesh.morphs)
				? this.mesh.createDeform({ backend: target?.ctx?.backend ?? null })
				: null,
			bindGroups: this.bindGroups.slice(),
			vertex: this.vertex.slice(),
			display: this.cfg.display,
			materialGroupIndex: this.cfg.materialGroupIndex,
			instanceGroupIndex: this.cfg.instanceGroupIndex,
			deformGroupIndex: this.cfg.deformGroupIndex,
		}), {
			enabled: this.enabled,
		});
	}

	setMesh(mesh) {
		this.mesh = mesh ?? null;
		this.deform = null;
		return this;
	}

	useShader(shader) {
		if (shader && !this.shaders.includes(shader)) this.shaders.push(shader);
		return this;
	}

	disuseShader(shader) {
		const i = this.shaders.indexOf(shader);
		if (i >= 0) this.shaders.splice(i, 1);
		return this;
	}

	clearShaders() {
		this.shaders.length = 0;
		return this;
	}

	setSlot(index, value) {
		this.instanceData.setSlot(index, value);
		return this;
	}

	ensureDeform(backend = null) {
		if (!this.deform && this.mesh instanceof Mesh && (this.mesh.skeleton || this.mesh.morphs)) {
			this.deform = this.mesh.createDeform({ backend });
		}
		return this.deform;
	}

	setBone(indexOrName, matrix) {
		this.ensureDeform()?.setBone(indexOrName, matrix);
		return this;
	}

	setWorldBone(indexOrName, matrix) {
		this.ensureDeform()?.setWorldBone(indexOrName, matrix);
		return this;
	}

	setMorph(indexOrName, weight) {
		this.ensureDeform()?.setMorph(indexOrName, weight);
		return this;
	}
}

export class WorldNode extends TreeNode {
	components = [];
	name = "";

	addComp(comp, options = {}) {
		const value = typeof comp === "function" ? new comp(options) : comp;
		if (!value || typeof value !== "object") return null;
		this.components.push(value);
		return value;
	}

	removeComp(comp) {
		const index = this.components.indexOf(comp);
		if (index < 0) return false;
		this.components.splice(index, 1);
		return true;
	}

	clearComp() {
		return this.components.splice(0);
	}
}

export class WorldRenderCmd extends Afstep {
	constructor(world, data = {}) {
		super();
		this.world = world;
	}

	exec({ ctx, graph, diag } = {}) {
		this.world?.execRender?.(ctx);
	}
}

export class World extends TreeCtx {
	constructor(options = {}) {
		super({ prefix: options.prefix ?? "wr_node_" });
		this.backend = options.backend ?? null;
		this.camera = options.camera ?? null;
		this.renderEntry = options.renderEntry ?? null;
		this.assets = {
			meshes: new Set(),
			shaders: new Set(),
			materials: new Set(),
			textures: new Set(),
		};
		this.layouts = {
			scene: null,
			deform: null,
			material: null,
			instance: null,
		};
		this.scene = null;
		this.cfg = {
			instanceBindGroupLayout: options.instanceBindGroupLayout ?? null,
			materialBindGroupLayout: options.materialBindGroupLayout ?? null,
			deformBindGroupLayout: options.deformBindGroupLayout ?? null,
			instanceGroupIndex: options.instanceGroupIndex ?? 3,
			materialGroupIndex: options.materialGroupIndex ?? 2,
			deformGroupIndex: options.deformGroupIndex ?? 1,
			instanceBinding: options.instanceBinding ?? 0,
			materialBinding: options.materialBinding ?? 0,
			albedoTextureBinding: options.albedoTextureBinding ?? 1,
			albedoSamplerBinding: options.albedoSamplerBinding ?? 2,
			boneBinding: options.boneBinding ?? 0,
			morphBinding: options.morphBinding ?? 1,
			maxBones: options.maxBones ?? 128,
			maxMorphs: options.maxMorphs ?? 64,
			fallbackTexture: options.fallbackTexture ?? null,
			instanceCapacity: Math.max(1, Number(options.instanceCapacity ?? 4096) | 0),
			sampleCount: Math.max(1, Number(options.sampleCount ?? this.backend?.sampleCount ?? 1) | 0),
		};
		this.result = null;
		this.#instance = {
			buffer: null,
			data: null,
			capacity: 0,
			count: 0,
			bindGroups: new WeakMap(),
		};
	}

	#instance = null;
	#defaultMaterial = null;
	#renderCmd = null;

	createNode(id) {
		return new WorldNode(id);
	}

	setBackend(backend) {
		this.backend = backend ?? null;
		return this;
	}

	setCamera(camera) {
		this.camera = camera ?? null;
		return this;
	}

	setRenderEntry(node) {
		if (!node) return this;
		this.#renderCmd = new WorldRenderCmd(this);
		// node.data.appendPayload(this.#renderCmd);
		node.data.push(this.#renderCmd);
		return this;
	}

	setRenderConfig(options = {}) {
		Object.assign(this.cfg, options);
		return this;
	}

	createDefaultGpu(options = {}) {
		this.createSceneBind(options.scene);
		this.createDeformBindGroupLayout(options.deform);
		this.createMaterialBindGroupLayout(options.material);
		this.createInstanceBindGroupLayout(options.instance);
		this.createFallbackTexture(options.texture);
		return this;
	}

	createSceneBind(options = {}) {
		const device = deviceOf(options.backend ?? this.backend);
		const usage = gpuBufferUsage();
		const stages = gpuStages();
		if (!device || !usage || !stages) return null;
		const binding = uint(options.binding, 0);
		const layout = options.layout ?? device.createBindGroupLayout({
			label: options.layoutLabel ?? "WrGPUWorldSceneBGL",
			entries: [
				{ binding, visibility: stages.VERTEX | stages.FRAGMENT, buffer: { type: "uniform" } },
			],
		});
		const buffer = options.buffer ?? createBuffer(device, options.bufferLabel ?? "WrGPUWorldSceneBuffer", 96, usage.UNIFORM | usage.COPY_DST);
		const bindGroup = options.bindGroup ?? device.createBindGroup({
			label: options.bindGroupLabel ?? "WrGPUWorldSceneBG",
			layout,
			entries: [
				{ binding, resource: { buffer } },
			],
		});
		this.scene = {
			binding,
			layout,
			buffer,
			bindGroup,
			data: options.data ?? new Float32Array(24),
		};
		this.layouts.scene = layout;
		return this.scene;
	}

	writeScene(options = {}) {
		if (!this.scene) return this;
		const camera = options.camera ?? this.camera;
		const viewProj = options.viewProj ?? (camera ? Mat4.mul(camera.projection, camera.view) : Mat4.IDENTITY);
		this.scene.data.set(viewProj, 0);
		this.scene.data.set(options.lightDir ?? [0.5, 1.0, 0.5, 0.0], 16);
		this.scene.data.set([
			Number(options.time ?? 0),
			Number(options.deltaTime ?? options.dt ?? 0),
			Number(options.timeZ ?? 0),
			Number(options.timeW ?? 0),
		], 20);
		deviceOf(options.backend ?? this.backend)?.queue?.writeBuffer?.(this.scene.buffer, 0, this.scene.data);
		return this;
	}

	createDeformBindGroupLayout(options = {}) {
		const device = deviceOf(options.backend ?? this.backend);
		const stages = gpuStages();
		if (!device || !stages) return null;
		const layout = options.layout ?? device.createBindGroupLayout({
			label: options.label ?? "WrGPUWorldDeformBGL",
			entries: [
				{ binding: uint(options.boneBinding, this.cfg.boneBinding), visibility: stages.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: uint(options.morphBinding, this.cfg.morphBinding), visibility: stages.VERTEX, buffer: { type: "read-only-storage" } },
			],
		});
		this.cfg.deformBindGroupLayout = layout;
		this.cfg.boneBinding = uint(options.boneBinding, this.cfg.boneBinding);
		this.cfg.morphBinding = uint(options.morphBinding, this.cfg.morphBinding);
		this.layouts.deform = layout;
		return layout;
	}

	createMaterialBindGroupLayout(options = {}) {
		const device = deviceOf(options.backend ?? this.backend);
		const stages = gpuStages();
		if (!device || !stages) return null;
		const layout = options.layout ?? device.createBindGroupLayout({
			label: options.label ?? "WrGPUWorldMaterialBGL",
			entries: [
				{ binding: uint(options.materialBinding, this.cfg.materialBinding), visibility: stages.FRAGMENT, buffer: { type: "uniform" } },
				{ binding: uint(options.albedoTextureBinding, this.cfg.albedoTextureBinding), visibility: stages.FRAGMENT, texture: { sampleType: "float" } },
				{ binding: uint(options.albedoSamplerBinding, this.cfg.albedoSamplerBinding), visibility: stages.FRAGMENT, sampler: { type: "filtering" } },
			],
		});
		this.cfg.materialBindGroupLayout = layout;
		this.cfg.materialBinding = uint(options.materialBinding, this.cfg.materialBinding);
		this.cfg.albedoTextureBinding = uint(options.albedoTextureBinding, this.cfg.albedoTextureBinding);
		this.cfg.albedoSamplerBinding = uint(options.albedoSamplerBinding, this.cfg.albedoSamplerBinding);
		this.layouts.material = layout;
		return layout;
	}

	createInstanceBindGroupLayout(options = {}) {
		const device = deviceOf(options.backend ?? this.backend);
		const stages = gpuStages();
		if (!device || !stages) return null;
		const layout = options.layout ?? device.createBindGroupLayout({
			label: options.label ?? "WrGPUWorldInstanceBGL",
			entries: [
				{ binding: uint(options.binding, this.cfg.instanceBinding), visibility: stages.VERTEX, buffer: { type: "read-only-storage" } },
			],
		});
		this.cfg.instanceBindGroupLayout = layout;
		this.cfg.instanceBinding = uint(options.binding, this.cfg.instanceBinding);
		this.layouts.instance = layout;
		return layout;
	}

	createFallbackTexture(options = {}) {
		if (this.cfg.fallbackTexture) return this.cfg.fallbackTexture;
		const device = deviceOf(options.backend ?? this.backend);
		const usage = gpuTextureUsage();
		if (!device || !usage || typeof document === "undefined") return null;
		const texture = device.createTexture({
			label: options.label ?? "WrGPUWhiteTexture",
			size: [1, 1, 1],
			format: "rgba8unorm",
			usage: usage.TEXTURE_BINDING | usage.COPY_DST | usage.RENDER_ATTACHMENT,
		});
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const ctx = canvas.getContext("2d");
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, 1, 1);
		device.queue.copyExternalImageToTexture(
			{ source: canvas, flipY: false },
			{ texture },
			{ width: 1, height: 1 },
		);
		const sampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
			addressModeU: "repeat",
			addressModeV: "repeat",
		});
		this.cfg.fallbackTexture = new Texture({
			label: options.label ?? "WrGPUWhiteTexture",
			texture,
			view: texture.createView(),
			sampler,
			width: 1,
			height: 1,
		});
		this.addTexture(this.cfg.fallbackTexture);
		return this.cfg.fallbackTexture;
	}

	prepareMaterials() {
		const layout = this.cfg.materialBindGroupLayout;
		if (!layout) return this;
		const fallback = this.#ensureDefaultMaterial();
		for (const material of this.assets.materials) this.#ensureMaterialBindGroup(material);
		for (const mesh of this.assets.meshes) {
			for (const submesh of mesh.submeshes ?? []) {
				if (!submesh.material) submesh.material = fallback;
				this.#ensureMaterialBindGroup(submesh.material);
			}
		}
		return this;
	}

	createShader(shader, options = {}) {
		if (!shader) return null;
		if (options.src != null || options.source != null) shader.setSrc(options.src ?? options.source);
		for (const instruction of asList(options.instructions ?? options.replacements ?? options.replace)) {
			if (!instruction) continue;
			if (instruction.key != null) shader.replace(instruction.key, instruction.value ?? "", instruction.rules ?? null);
			else shader.addInstruction(instruction);
		}
		if (options.vertex) Mesh.createVertexLayout(shader, options.vertex.slot ?? "$VERTEX_FIELDS$", options.vertex);
		if (options.skin) MeshDeform.createSkinBind(shader, options.skin.slot ?? "$SKIN_BIND$", options.skin);
		if (options.morph) MeshDeform.createMorphBind(shader, options.morph.slot ?? "$MORPH_BIND$", options.morph);
		if (options.skinFn) MeshDeform.createSkinFn(shader, options.skinFn.slot ?? "$SKIN_FN$", options.skinFn);
		if (options.material) Material.createStandardBind(shader, options.material.slot ?? "$MATERIAL_BIND$", options.material);
		if (options.instance ?? options.model) World.createInstanceLayout(shader, (options.instance ?? options.model).slot ?? "$INSTANCE_BIND$", options.instance ?? options.model);
		if (options.camera) World.createCameraLayout(shader, options.camera.slot ?? "$CAMERA_BIND$", options.camera);
		if (options.module !== false) shader.createModule({ backend: options.backend ?? this.backend, label: options.label ?? shader.label });
		this.addShader(shader);
		return shader;
	}

	createRenderPipeline(shader, options = {}) {
		const device = deviceOf(options.backend ?? this.backend);
		const module = options.module ?? shader?.module ?? null;
		if (!device || !shader || !module) return null;
		const bindGroupLayouts = options.bindGroupLayouts ?? [
			this.scene?.layout,
			this.cfg.deformBindGroupLayout,
			this.cfg.materialBindGroupLayout,
			this.cfg.instanceBindGroupLayout,
		].filter(Boolean);
		const pipeline = device.createRenderPipeline({
			label: options.label ?? shader.label ?? "WrGPUWorldPipeline",
			layout: options.layout ?? device.createPipelineLayout({
				label: options.layoutLabel ?? `${options.label ?? shader.label ?? "WrGPUWorld"}Layout`,
				bindGroupLayouts,
			}),
			vertex: {
				module,
				entryPoint: options.vertexEntry ?? "vs_main",
				buffers: options.vertexBuffers ?? shader.meta?.vertex?.buffers ?? [Mesh.STD_VERTEX_BUFFER],
			},
			fragment: options.fragmentEntry === false ? undefined : {
				module,
				entryPoint: options.fragmentEntry ?? "fs_main",
				targets: options.targets ?? [{ format: options.format ?? this.backend?.format }],
			},
			primitive: {
				topology: options.topology ?? "triangle-list",
				cullMode: options.cullMode ?? "back",
				frontFace: options.frontFace ?? "ccw",
			},
			multisample: {
				count: Math.max(1, Number(options.sampleCount ?? this.cfg.sampleCount ?? this.backend?.sampleCount ?? 1) | 0),
			},
			depthStencil: options.depthStencil ?? {
				format: options.depthFormat ?? this.backend?.depthFormat,
				depthWriteEnabled: options.depthWriteEnabled !== false,
				depthCompare: options.depthCompare ?? "less",
			},
		});
		shader.backend = options.backend ?? this.backend;
		shader.module = module;
		shader.pipeline = pipeline;
		shader.meta = options.meta ?? shader.meta;
		shader.setBindGroups(options.bindGroups ?? (this.scene?.bindGroup ? [{ index: options.sceneGroupIndex ?? 0, bindGroup: this.scene.bindGroup }] : []));
		if (this.cfg.instanceBindGroupLayout) {
			shader.setInstanceBindGroupLayout(this.cfg.instanceBindGroupLayout, {
				group: this.cfg.instanceGroupIndex,
				binding: this.cfg.instanceBinding,
			});
		}
		this.addShader(shader);
		return shader;
	}

	addMesh(mesh) {
		if (!mesh) return null;
		this.assets.meshes.add(mesh);
		for (const material of mesh.materials ?? []) this.addMaterial(material);
		for (const texture of mesh.textures ?? []) this.addTexture(texture);
		return mesh;
	}

	addShader(shader) {
		if (shader) this.assets.shaders.add(shader);
		return shader ?? null;
	}

	addMaterial(material) {
		if (!material) return null;
		this.assets.materials.add(material);
		this.addTexture(material.albedoTexture);
		this.addTexture(material.normalTexture);
		this.addTexture(material.metallicRoughnessTexture);
		this.addTexture(material.emissiveTexture);
		return material;
	}

	addTexture(texture) {
		if (texture) this.assets.textures.add(texture);
		return texture ?? null;
	}

	copyBranch(from, parent = null, index = -1) {
		const source = this.getNode(from);
		if (!source) return null;
		const parentNode = parent == null ? null : this.getNode(parent);
		if (parent != null && !parentNode) return null;

		const copyNode = (src, parentId, insertIndex = -1) => {
			const next = this.newNode(parentId, insertIndex);
			if (!next) return null;
			next.name = src.name;
			for (const comp of src.components ?? []) {
				const copy = copyComp(comp, next);
				if (copy) next.addComp(copy);
			}
			for (const child of src.children) copyNode(child, next.id);
			return next;
		};
		return copyNode(source, parentNode?.id ?? null, index);
	}

	update(from = null) {
		const start = this.getNode(nodeId(from)) ?? this.getNode(from) ?? this.#firstRoot();
		if (!start) return null;
		const items = [];
		this.#collect(start, Mat4.IDENTITY, items);
		const batches = this.#batch(items);
		this.prepareMaterials();
		this.#writeInstances(batches);
		this.result = {
			from: start.id,
			items,
			batches,
		};
		return this.result;
	}

	execRender(ctx) {
		if (!ctx?.pass || ctx.passKind !== "render") return false;
		const batches = this.result?.batches ?? [];
		if (batches.length <= 0) return false;
		for (const batch of batches) this.#drawBatch(ctx, batch);
		return true;
	}

	static createInstanceLayout(shader, slot, options = {}) {
		const group = uint(options.group, 3);
		const binding = uint(options.binding, 0);
		const structName = nameOf(options.structName, "Instance");
		const name = nameOf(options.name, "instances");
		const indexName = nameOf(options.index, "instanceIndex");
		const model = nameOf(options.model, "modelMat");
		const slots = [
			nameOf(options.slot0, "slot0"),
			nameOf(options.slot1, "slot1"),
			nameOf(options.slot2, "slot2"),
			nameOf(options.slot3, "slot3"),
		];
		shader.replace(slot, `struct ${structName} {
\t${model}: mat4x4f,
\t${slots[0]}: vec4f,
\t${slots[1]}: vec4f,
\t${slots[2]}: vec4f,
\t${slots[3]}: vec4f,
}

@group(${group}) @binding(${binding}) var<storage, read> ${name}: array<${structName}>;`);
		const bindGroups = metaObj(shader.meta, "bindGroups");
		const world = metaObj(shader.meta, "world");
		bindGroups.instance = { group, binding, name };
		world.instance = { structName, name, index: indexName, model, slots };
		shader.instanceGroupIndex = group;
		shader.instanceBinding = binding;
		return shader;
	}

	static createModelLayout(shader, slot, options = {}) {
		return World.createInstanceLayout(shader, slot, options);
	}

	static createCameraLayout(shader, slot, options = {}) {
		const group = uint(options.group, 0);
		const binding = uint(options.binding, 0);
		const structName = nameOf(options.structName, "Camera");
		const name = nameOf(options.name, "camera");
		const view = nameOf(options.view, "view");
		const projection = nameOf(options.projection, "projection");
		const viewProj = nameOf(options.viewProj, "viewProj");
		const position = nameOf(options.position, "position");
		const time = nameOf(options.time, "time");
		shader.replace(slot, `struct ${structName} {
\t${view}: mat4x4f,
\t${projection}: mat4x4f,
\t${viewProj}: mat4x4f,
\t${position}: vec4f,
\t${time}: vec4f,
}

@group(${group}) @binding(${binding}) var<uniform> ${name}: ${structName};`);
		const bindGroups = metaObj(shader.meta, "bindGroups");
		const world = metaObj(shader.meta, "world");
		bindGroups.camera = { group, binding, name };
		world.camera = { structName, name, view, projection, viewProj, position, time };
		return shader;
	}

	#firstRoot() {
		for (const node of this.nodes.values()) {
			if (node.parentId == null) return node;
		}
		return null;
	}

	#collect(node, parentWorld, items) {
		const tx = node.components.find((comp) => comp instanceof Transform && comp.enabled !== false) ?? null;
		const worldMat = tx ? Mat4.mul(parentWorld, tx.local, tx.world) : parentWorld;

		for (const renderer of node.components) {
			if (!(renderer instanceof MeshRenderer)) continue;
			if (renderer.enabled === false || renderer.cfg.display === false) continue;
			if (!renderer.mesh || renderer.shaders.length <= 0) continue;
			this.addMesh(renderer.mesh);
			renderer.instanceData.setModel(worldMat);
			if (!renderer.deform && this.cfg.deformBindGroupLayout) {
				renderer.deform = renderer.mesh.createDeform({
					backend: this.backend,
					maxBones: this.cfg.maxBones,
					maxMorphs: this.cfg.maxMorphs,
				});
			}
			renderer.ensureDeform(this.backend)?.updateSkinMatrices?.()?.write?.();
			for (const shader of renderer.shaders) {
				if (!shader?.pipeline) continue;
				this.addShader(shader);
				items.push({ node, renderer, shader });
			}
		}

		for (const child of node.children) this.#collect(child, worldMat, items);
	}

	#batch(items) {
		const batches = [];
		for (const item of items) {
			const renderer = item.renderer;
			let batch = batches.find((candidate) => (
				candidate.shader === item.shader
				&& candidate.mesh === renderer.mesh
				&& candidate.deform === renderer.deform
				&& sameArrayRef(candidate.bindGroups, renderer.bindGroups)
				&& sameArrayRef(candidate.vertex, renderer.vertex)
			));
			if (!batch) {
				batch = {
					shader: item.shader,
					mesh: renderer.mesh,
					deform: renderer.deform,
					bindGroups: renderer.bindGroups,
					vertex: renderer.vertex,
					items: [],
				};
				batches.push(batch);
			}
			batch.items.push(item);
		}
		return batches;
	}

	#drawBatch(ctx, batch) {
		const pass = ctx.pass;
		const mesh = batch.mesh ?? null;
		const shader = batch.shader ?? null;
		if (!pass || !mesh?.vertexBuffer || !mesh?.indexBuffer || !shader?.pipeline) return false;

		pass.setPipeline(shader.pipeline);
		ctx.pipeline = shader.pipeline;

		const shaderGroups = [...asList(shader.bindGroups)];
		const instanceBG = this.#instanceBindGroup(shader);
		if (instanceBG) {
			shaderGroups.push({
				index: batch.items[0]?.renderer.cfg.instanceGroupIndex ?? shader.instanceGroupIndex ?? this.cfg.instanceGroupIndex,
				bindGroup: instanceBG,
			});
		}
		this.#setBindGroups(ctx, shaderGroups);

		const groups = [...asList(batch.bindGroups)];
		const deformBG = this.#ensureDeformBindGroup(batch.deform);
		if (deformBG) {
			groups.push({
				index: batch.items[0]?.renderer.cfg.deformGroupIndex ?? this.cfg.deformGroupIndex,
				bindGroup: deformBG,
			});
		}
		this.#setBindGroups(ctx, groups);

		pass.setVertexBuffer(0, mesh.vertexBuffer);
		for (const entry of asList(batch.vertex)) {
			if (!entry?.buffer) continue;
			pass.setVertexBuffer(uint(entry.slot, 0), entry.buffer, entry.offset ?? 0, entry.size);
		}
		pass.setIndexBuffer(mesh.indexBuffer, mesh.indexFormat);

		const materialGroupIndex = batch.items[0]?.renderer.cfg.materialGroupIndex ?? this.cfg.materialGroupIndex;
		for (const submesh of mesh.submeshes ?? []) {
			if (materialGroupIndex != null && submesh.material?.bindGroup) {
				this.#setBindGroups(ctx, [{ index: materialGroupIndex, bindGroup: submesh.material.bindGroup }]);
			}
			pass.drawIndexed(
				submesh.indexCount,
				batch.items.length,
				submesh.indexStart,
				submesh.vertexStart,
				batch.firstInstance ?? 0,
			);
		}
		return true;
	}

	#setBindGroups(ctx, groups) {
		if (!ctx?.pass) return;
		for (const entry of groups) {
			const index = uint(entry?.index ?? entry?.group, 0);
			const bindGroup = entry?.bindGroup ?? entry?.groupRef ?? null;
			if (!bindGroup) continue;
			const offsets = entry?.offsets ?? entry?.dynamicOffsets;
			if (offsets) ctx.pass.setBindGroup(index, bindGroup, offsets);
			else ctx.pass.setBindGroup(index, bindGroup);
			ctx.bindGroups?.set?.(index, { bindGroup, offsets: offsets ?? null });
		}
	}

	#ensureInstanceCapacity(count) {
		const device = deviceOf(this.backend);
		const usage = gpuBufferUsage();
		if (!device || !usage) return false;
		const capacity = Math.max(this.cfg.instanceCapacity, count, 1);
		if (this.#instance.buffer && this.#instance.capacity >= capacity) return true;
		this.#instance.buffer = device.createBuffer({
			label: "WrGPUWorldInstanceBuffer",
			size: capacity * INSTANCE_BYTES,
			usage: usage.STORAGE | usage.COPY_DST,
		});
		this.#instance.data = new Float32Array(capacity * INSTANCE_F32);
		this.#instance.capacity = capacity;
		this.#instance.bindGroups = new WeakMap();
		return true;
	}

	#writeInstances(batches) {
		const total = batches.reduce((sum, batch) => sum + batch.items.length, 0);
		this.#instance.count = total;
		if (total <= 0 || !this.#ensureInstanceCapacity(total)) return;
		let cursor = 0;
		for (const batch of batches) {
			batch.firstInstance = cursor;
			for (const item of batch.items) {
				this.#instance.data.set(item.renderer.instanceData.data, cursor * INSTANCE_F32);
				cursor++;
			}
		}
		deviceOf(this.backend)?.queue?.writeBuffer?.(
			this.#instance.buffer,
			0,
			this.#instance.data.subarray(0, total * INSTANCE_F32),
		);
	}

	#instanceBindGroup(shader) {
		const device = deviceOf(this.backend);
		const buffer = this.#instance?.buffer ?? null;
		const layout = shader?.instanceBindGroupLayout ?? this.cfg.instanceBindGroupLayout;
		if (!device || !buffer || !layout) return null;
		let bindGroup = this.#instance.bindGroups.get(layout);
		if (bindGroup) return bindGroup;
		bindGroup = device.createBindGroup({
			label: "WrGPUWorldInstanceBG",
			layout,
			entries: [
				{
					binding: shader?.instanceBinding ?? this.cfg.instanceBinding,
					resource: { buffer },
				},
			],
		});
		this.#instance.bindGroups.set(layout, bindGroup);
		return bindGroup;
	}

	#ensureDefaultMaterial() {
		if (this.#defaultMaterial) return this.#defaultMaterial;
		this.#defaultMaterial = new Material({
			name: "default",
			albedoColor: [1, 1, 1, 1],
			albedoTexture: this.cfg.fallbackTexture ?? this.createFallbackTexture(),
		});
		this.addMaterial(this.#defaultMaterial);
		this.#ensureMaterialBindGroup(this.#defaultMaterial);
		return this.#defaultMaterial;
	}

	#ensureMaterialBindGroup(material) {
		const device = deviceOf(this.backend);
		const usage = gpuBufferUsage();
		const layout = this.cfg.materialBindGroupLayout;
		if (!material || !device || !usage || !layout) return null;
		if (material.bindGroup && material.bindGroupLayout === layout) return material.bindGroup;
		if (!material.uniformBuffer) {
			material.uniformBuffer = createBuffer(device, `WrGPUMaterial:${material.name}`, 16, usage.UNIFORM | usage.COPY_DST);
		}
		device.queue.writeBuffer(material.uniformBuffer, 0, material.albedoColor);
		const texture = material.albedoTexture ?? this.cfg.fallbackTexture ?? this.createFallbackTexture();
		const view = texture?.view ?? this.cfg.fallbackTexture?.view ?? null;
		const sampler = texture?.sampler ?? this.cfg.fallbackTexture?.sampler ?? null;
		if (!view || !sampler) return null;
		material.bindGroupLayout = layout;
		material.bindGroup = device.createBindGroup({
			label: `WrGPUMaterialBG:${material.name}`,
			layout,
			entries: [
				{ binding: this.cfg.materialBinding, resource: { buffer: material.uniformBuffer } },
				{ binding: this.cfg.albedoTextureBinding, resource: view },
				{ binding: this.cfg.albedoSamplerBinding, resource: sampler },
			],
		});
		return material.bindGroup;
	}

	#ensureDeformBindGroup(deform) {
		const device = deviceOf(this.backend);
		const layout = this.cfg.deformBindGroupLayout;
		if (!deform || !device || !layout) return null;
		deform.ensureGpu?.(this.backend);
		if (deform.bindGroup && deform.bindGroupLayout === layout) return deform.bindGroup;
		deform.bindGroupLayout = layout;
		const entries = [];
		if (deform.boneBuffer) entries.push({ binding: this.cfg.boneBinding, resource: { buffer: deform.boneBuffer } });
		if (deform.morphBuffer) entries.push({ binding: this.cfg.morphBinding, resource: { buffer: deform.morphBuffer } });
		if (entries.length <= 0) return null;
		deform.bindGroup = device.createBindGroup({
			label: "WrGPUDeformBG",
			layout,
			entries,
		});
		return deform.bindGroup;
	}
}

export default World;
