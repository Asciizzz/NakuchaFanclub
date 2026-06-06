import { Mat4 } from "../../Alib/Alm.js";
import { Ctx as TreeCtx, Node as TreeNode } from "../../Alib/Atree.js";
import { Awgpu } from "../../Alib/Awgpu/index.js";
import { Mesh, MeshDeform } from "./mesh.js";

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

function nameOf(value, fallback) {
	return String(value ?? fallback);
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

function copyComp(comp, target) {
	if (!comp || typeof comp !== "object") return null;
	if (typeof comp.instantiate === "function") return comp.instantiate(target);
	if (typeof comp.copy === "function") return comp.copy(target);
	if (typeof comp.clone === "function") return comp.clone(target);
	const out = Object.create(Object.getPrototypeOf(comp));
	Object.assign(out, comp);
	out.node = target ?? null;
	return out;
}

export const MODEL_F32 = 32;
export const MODEL_BYTES = MODEL_F32 * 4;

export class ModelData {
	constructor(options = {}) {
		this.data = new Float32Array(MODEL_F32);
		this.buffer = options.buffer ?? null;
		this.device = options.backend?.device ?? options.device ?? null;
		this.bindGroups = new WeakMap();
		this.setModel(options.model ?? Mat4.IDENTITY);
		for (let i = 0; i < 4; i++) this.setSlot(i, options[`slot${i}`] ?? [0, 0, 0, 0]);
		if (!this.buffer && this.device && globalThis.GPUBufferUsage) {
			this.buffer = this.device.createBuffer({
				label: options.label ?? "WrGPUModelBuffer",
				size: MODEL_BYTES,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});
			this.write();
		}
	}

	ensureGpu(backend = null) {
		const device = deviceOf(backend) ?? this.device;
		if (!this.buffer && device && globalThis.GPUBufferUsage) {
			this.device = device;
			this.buffer = device.createBuffer({
				label: "WrGPUModelBuffer",
				size: MODEL_BYTES,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});
			this.write();
		}
		return this.buffer;
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

	write() {
		this.device?.queue?.writeBuffer?.(this.buffer, 0, this.data);
		return this;
	}

	destroy() {
		this.buffer?.destroy?.();
		this.buffer = null;
		return this;
	}
}

export class WorldComponent {
	node = null;
	enabled = true;

	copy(target = null) {
		const out = Object.create(Object.getPrototypeOf(this));
		Object.assign(out, this);
		out.node = target;
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
			node: target,
			enabled: this.enabled,
		});
	}
}

export class ShaderComponent extends WorldComponent {
	constructor(options = {}) {
		super();
		this.pipeline = options.pipeline ?? null;
		this.bindGroups = asList(options.bindGroups).slice();
		this.label = String(options.label ?? "");
	}

	copy(target = null) {
		return Object.assign(new ShaderComponent({
			pipeline: this.pipeline,
			bindGroups: this.bindGroups.slice(),
			label: this.label,
		}), {
			node: target,
			enabled: this.enabled,
		});
	}
}

export class MeshRenderer extends WorldComponent {
	constructor(options = {}) {
		super();
		this.mesh = options.mesh ?? null;
		this.modelData = options.modelData ?? null;
		this.deform = options.deform ?? null;
		this.bindGroups = asList(options.bindGroups).slice();
		this.vertex = asList(options.vertex ?? options.vertices).slice();
		this.cfg = {
			display: options.display !== false,
			instanceCount: Math.max(1, Number(options.instanceCount ?? 1) | 0),
			firstInstance: Math.max(0, Number(options.firstInstance ?? 0) | 0),
			materialGroupIndex: options.materialGroupIndex ?? null,
			modelGroupIndex: options.modelGroupIndex ?? null,
			deformGroupIndex: options.deformGroupIndex ?? null,
		};
	}

	instantiate(target = null, options = {}) {
		const backend = options.backend ?? target?.ctx?.backend ?? null;
		const modelData = new ModelData({
			backend,
			model: this.modelData?.data?.subarray?.(0, 16) ?? Mat4.IDENTITY,
		});
		for (let i = 0; i < 4; i++) {
			modelData.setSlot(i, this.modelData?.data?.subarray?.(16 + i * 4, 20 + i * 4) ?? [0, 0, 0, 0]);
		}
		modelData.write();

		const mesh = this.mesh;
		const deform = mesh instanceof Mesh && (mesh.skeleton || mesh.morphs)
			? mesh.createDeform({ backend })
			: null;

		return Object.assign(new MeshRenderer({
			mesh,
			modelData,
			deform,
			bindGroups: this.bindGroups.slice(),
			vertex: this.vertex.slice(),
			display: this.cfg.display,
			instanceCount: this.cfg.instanceCount,
			firstInstance: this.cfg.firstInstance,
			materialGroupIndex: this.cfg.materialGroupIndex,
			modelGroupIndex: this.cfg.modelGroupIndex,
			deformGroupIndex: this.cfg.deformGroupIndex,
		}), {
			node: target,
			enabled: this.enabled,
		});
	}

	copy(target = null) {
		return this.instantiate(target);
	}
}

export class WorldNode extends TreeNode {
	components = [];
	name = "";

	addComp(comp, options = {}) {
		const value = typeof comp === "function" ? new comp(options) : comp;
		if (!value || typeof value !== "object") return null;
		if (value.node && value.node !== this) return null;
		value.node = this;
		this.components.push(value);
		return value;
	}

	removeComp(comp) {
		const index = this.components.indexOf(comp);
		if (index < 0) return false;
		this.components.splice(index, 1);
		if (comp && typeof comp === "object") comp.node = null;
		return true;
	}

	clearComp() {
		const out = this.components.splice(0);
		for (const comp of out) comp.node = null;
		return out;
	}
}

export class ModelNode {
	name = "";
	components = [];
	children = [];

	constructor(options = {}) {
		this.name = String(options.name ?? "");
		for (const comp of asList(options.components)) this.addComp(comp);
		for (const child of asList(options.children)) this.addChild(child);
	}

	addComp(comp, options = {}) {
		const value = typeof comp === "function" ? new comp(options) : comp;
		if (!value || typeof value !== "object") return null;
		this.components.push(value);
		return value;
	}

	addChild(child = null) {
		const node = child instanceof ModelNode ? child : new ModelNode(child ?? {});
		this.children.push(node);
		return node;
	}
}

export class Model {
	constructor(options = {}) {
		this.name = String(options.name ?? "");
		this.root = options.root instanceof ModelNode ? options.root : new ModelNode(options.root ?? {});
		this.meshes = asList(options.meshes).slice();
		this.materials = asList(options.materials).slice();
		this.textures = asList(options.textures).slice();
	}

	static fromMesh(mesh, options = {}) {
		const root = new ModelNode({
			name: String(options.name ?? mesh?.label ?? "model"),
		});
		root.addComp(new Transform());
		root.addComp(new MeshRenderer({ mesh }));
		return new Model({
			name: root.name,
			root,
			meshes: mesh ? [mesh] : [],
		});
	}

	instantiate(world, parent = null, options = {}) {
		return world?.instantiate?.(this, parent, options) ?? null;
	}
}

export class WorldBinding {
	constructor(world, renderNode, options = {}) {
		this.world = world;
		this.renderNode = renderNode ?? null;
		this.node = this.renderNode?.addChild?.() ?? null;
		this.options = { ...options };
		this.result = null;
	}

	clear() {
		const node = this.node;
		const ctx = node?.ctx ?? null;
		if (!node || !ctx) return this;
		node.clearComp?.();
		for (const childId of node.childIds.slice()) {
			ctx.unlink(node.id, childId);
			ctx.deleteNode(childId, true);
		}
		this.result = null;
		return this;
	}

	render(from = this.options.from ?? null, options = {}) {
		this.clear();
		this.result = this.world.renderTo(this.node, from, {
			...this.options,
			...options,
		});
		return this.result;
	}
}

export class World extends TreeCtx {
	constructor(options = {}) {
		super({ prefix: options.prefix ?? "wr_node_" });
		this.backend = options.backend ?? null;
		this.bindings = new Set();
	}

	createNode(id) {
		return new WorldNode(this, id);
	}

	setBackend(backend) {
		this.backend = backend ?? null;
		return this;
	}

	instantiate(modelOrMesh, parent = null, options = {}) {
		const model = modelOrMesh instanceof Model
			? modelOrMesh
			: (modelOrMesh instanceof Mesh ? Model.fromMesh(modelOrMesh) : null);
		if (!model?.root) return null;

		const backend = options.backend ?? this.backend ?? null;
		const copyNode = (source, parentId) => {
			const node = this.addNode(parentId);
			if (!node) return null;
			node.name = String(source.name ?? "");
			for (const comp of source.components ?? []) {
				const next = comp instanceof MeshRenderer
					? comp.instantiate(node, { backend })
					: copyComp(comp, node);
				if (next) node.addComp(next);
			}
			for (const child of source.children ?? []) copyNode(child, node.id);
			return node;
		};

		const parentNode = parent == null ? null : this.getNode(nodeId(parent));
		if (parent != null && !parentNode) return null;
		return copyNode(model.root, parentNode?.id ?? null);
	}

	bind(renderNode, options = {}) {
		if (!renderNode?.addChild) return null;
		const binding = new WorldBinding(this, renderNode, options);
		this.bindings.add(binding);
		if (options.renderNow !== false) binding.render(options.from ?? null);
		return binding;
	}

	renderTo(renderNode, from = null, options = {}) {
		if (!renderNode?.ctx) return null;
		const start = this.getNode(nodeId(from)) ?? this.getNode(nodeId(options.from)) ?? null;
		if (!start) return null;

		const result = {
			from: start.id,
			items: [],
			nodes: [],
		};
		const backend = options.backend ?? this.backend ?? null;
		this.#emitBranch(renderNode, start, {
			backend,
			parentWorld: Mat4.IDENTITY,
			shaders: [],
			options,
			result,
		});
		return result;
	}

	static createModelLayout(shader, slot, options = {}) {
		const group = uint(options.group, 0);
		const binding = uint(options.binding, 0);
		const structName = nameOf(options.structName, "Model");
		const name = nameOf(options.name, "model");
		const model = nameOf(options.model, "modelMat");
		const slots = [
			nameOf(options.slot0, "defaultSlot0"),
			nameOf(options.slot1, "defaultSlot1"),
			nameOf(options.slot2, "defaultSlot2"),
			nameOf(options.slot3, "defaultSlot3"),
		];
		shader.replace(slot, `struct ${structName} {
\t${model}: mat4x4f,
\t${slots[0]}: vec4f,
\t${slots[1]}: vec4f,
\t${slots[2]}: vec4f,
\t${slots[3]}: vec4f,
}

@group(${group}) @binding(${binding}) var<uniform> ${name}: ${structName};`);
		const bindGroups = metaObj(shader.meta, "bindGroups");
		const world = metaObj(shader.meta, "world");
		bindGroups.model = { group, binding, name };
		world.model = { structName, name, model, slots };
		return shader;
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

	static createModelBindGroup(backend, layout, modelData, options = {}) {
		const device = deviceOf(backend);
		const buffer = modelData?.ensureGpu?.(backend) ?? modelData?.buffer ?? null;
		if (!device || !layout || !buffer) return null;
		const cached = modelData.bindGroups?.get?.(layout);
		if (cached) return cached;
		const bindGroup = device.createBindGroup({
			label: options.label ?? "WrGPUModelBG",
			layout,
			entries: [
				{ binding: uint(options.binding, 0), resource: { buffer } },
			],
		});
		modelData.bindGroups?.set?.(layout, bindGroup);
		return bindGroup;
	}

	#emitBranch(renderParent, worldNode, state) {
		const tx = worldNode.components.find((comp) => comp instanceof Transform && comp.enabled !== false) ?? null;
		const worldMat = tx ? Mat4.mul(state.parentWorld, tx.local, tx.world) : state.parentWorld;
		const shaders = state.shaders.slice();
		for (const shader of worldNode.components) {
			if (shader instanceof ShaderComponent && shader.enabled !== false) shaders.push(shader);
		}

		for (const renderer of worldNode.components) {
			if (!(renderer instanceof MeshRenderer)) continue;
			if (renderer.enabled === false || renderer.cfg.display === false) continue;
			if (!renderer.mesh || shaders.length <= 0) continue;
			this.#emitMesh(renderParent, renderer, shaders, worldMat, state);
		}

		for (const child of worldNode.children) {
			this.#emitBranch(renderParent, child, {
				...state,
				parentWorld: worldMat,
				shaders,
			});
		}
	}

	#emitMesh(renderParent, renderer, shaders, worldMat, state) {
		const options = state.options;
		const modelData = renderer.modelData ?? new ModelData({ backend: state.backend });
		renderer.modelData = modelData;
		modelData.setModel(worldMat).write();

		if (!modelData.buffer) modelData.ensureGpu(state.backend);
		let modelBindGroup = null;
		const modelLayout = options.modelBindGroupLayout ?? renderer.modelBindGroupLayout ?? null;
		if (modelLayout) {
			modelBindGroup = World.createModelBindGroup(state.backend, modelLayout, modelData, {
				binding: options.modelBinding ?? 0,
			});
		}

		const mesh = renderer.mesh;
		if (!renderer.deform && options.deformBindGroupLayout) {
			renderer.deform = mesh.createDeform({
				backend: state.backend,
				maxBones: options.maxBones ?? 128,
				maxMorphs: options.maxMorphs ?? 64,
			});
		}
		const deform = renderer.deform ?? null;
		if (deform && !deform.bindGroup && options.deformBindGroupLayout) {
			this.#createDeformBindGroup(deform, options);
		}
		const deformNodeOptions = {
			groupIndex: renderer.cfg.deformGroupIndex ?? options.deformGroupIndex ?? 1,
		};

		for (const shader of shaders) {
			const shaderNode = renderParent.addChild();
			if (!shaderNode) continue;
			if (shader.pipeline) shaderNode.addComp(new Awgpu.UsePipeline(shader.pipeline));
			const shaderGroups = asList(shader.bindGroups);
			if (shaderGroups.length > 0) shaderNode.addComp(new Awgpu.SetBindGroups(shaderGroups));

			const stateNode = shaderNode.addChild();
			if (!stateNode) continue;
			const groups = [
				...asList(renderer.bindGroups),
			];
			if (modelBindGroup) {
				groups.push({
					index: renderer.cfg.modelGroupIndex ?? options.modelGroupIndex ?? 3,
					bindGroup: modelBindGroup,
				});
			}
			if (groups.length > 0) stateNode.addComp(new Awgpu.SetBindGroups(groups));

			if (renderer.vertex.length > 0) {
				stateNode.addComp(new Awgpu.SetBuffers({ vertex: renderer.vertex }));
			}

			const drawParent = deform?.bindGroup
				? (deform.attach(shaderNode.ctx, stateNode, deformNodeOptions) ?? stateNode)
				: stateNode;
			const draw = mesh.attach(shaderNode.ctx, drawParent, {
				instanceCount: renderer.cfg.instanceCount,
				firstInstance: renderer.cfg.firstInstance,
				materialGroupIndex: renderer.cfg.materialGroupIndex ?? options.materialGroupIndex ?? null,
			});
			state.result.items.push({ renderer, shader, draw });
			state.result.nodes.push(shaderNode);
		}
	}

	#createDeformBindGroup(deform, options) {
		const device = deviceOf(options.backend ?? this.backend);
		if (!device || !options.deformBindGroupLayout) return null;
		deform.ensureGpu?.(options.backend ?? this.backend);
		deform.bindGroupLayout = options.deformBindGroupLayout;
		const entries = [];
		if (deform.boneBuffer) entries.push({ binding: options.boneBinding ?? 0, resource: { buffer: deform.boneBuffer } });
		if (deform.morphBuffer) entries.push({ binding: options.morphBinding ?? 1, resource: { buffer: deform.morphBuffer } });
		if (entries.length <= 0) return null;
		deform.bindGroup = device.createBindGroup({
			label: options.deformLabel ?? "WrGPUDeformBG",
			layout: options.deformBindGroupLayout,
			entries,
		});
		return deform.bindGroup;
	}
}

export default World;
