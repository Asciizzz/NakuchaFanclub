import { Ctx } from "../../AzLib/Azt.js";
import WrBackend from "../WrBackends/Base.js";
import {
	WrMeshStore,
	WrTextureStore,
	WrShaderStore,
	WrSkeletonStore,
} from "./Assets.js";

const WR_NODE_STATIC_KEYS = new Set(["ctx", "id", "parentId", "childIds"]);

function asId(value) {
	const key = String(value ?? "").trim();
	return key.length > 0 ? key : null;
}

function cloneValue(value) {
	if (typeof structuredClone === "function") {
		try {
			return structuredClone(value);
		} catch (_error) {}
	}
	if (Array.isArray(value)) {
		return value.map((item) => cloneValue(item));
	}
	if (value && typeof value === "object") {
		const out = {};
		for (const [key, next] of Object.entries(value)) out[key] = cloneValue(next);
		return out;
	}
	return value;
}

function copyNodeData(source, target) {
	for (const key of Object.keys(source)) {
		if (WR_NODE_STATIC_KEYS.has(key)) continue;
		target[key] = cloneValue(source[key]);
	}
}

function canAttachBranch(source, targetId) {
	for (const node of source.traverse({ mode: "dfs_pre", includeFrom: true })) {
		if (node.id === targetId) return false;
	}
	return true;
}

export class WrWorld extends Ctx {
	constructor(options = {}) {
		super(options.ctx ?? {});
		this.options = options ?? {};
		this.canvas = WrBackend.resolveCanvas(options.canvas ?? null);
		this.backend = options.backend ?? null;
		this.backendReport = null;

		this.#roots = new Set();
		this.#meshStore = new WrMeshStore(this, {
			prefix: options.store?.meshPrefix ?? "mesh_",
		});
		this.#textureStore = new WrTextureStore(this, {
			prefix: options.store?.texturePrefix ?? "tex_",
		});
		this.#shaderStore = new WrShaderStore(this, {
			prefix: options.store?.shaderPrefix ?? "shader_",
		});
		this.#skeletonStore = new WrSkeletonStore(this, {
			prefix: options.store?.skeletonPrefix ?? "skel_",
		});
		this.#store = Object.freeze({
			meshes: this.#meshStore,
			textures: this.#textureStore,
			shaders: this.#shaderStore,
			skeletons: this.#skeletonStore,
		});
	}

	get store() { return this.#store; }
	get roots() { return Array.from(this.#roots); }

	setCanvas(canvasRef) {
		this.canvas = WrBackend.resolveCanvas(canvasRef);
		return this.canvas;
	}

	setBackend(backend, report = null) {
		this.backend = backend ?? null;
		this.backendReport = report ?? null;
		return this.backend;
	}

	resize(options = {}) {
		if (!this.backend) return false;
		return this.backend.resize(options);
	}

	render(frameOptions = {}, callback = null) {
		if (!this.backend || !this.backend.ready) return false;
		this.backend.beginFrame(frameOptions);
		const fn = typeof callback === "function"
			? callback
			: (typeof frameOptions?.draw === "function" ? frameOptions.draw : null);
		if (fn) fn(this.backend, this);
		this.backend.endFrame();
		return true;
	}

	destroy() {
		if (this.backend?.destroy) this.backend.destroy();
		this.backend = null;
		this.backendReport = null;
	}

	addNode(parent = null, index = -1) {
		const node = super.addNode(parent, index);
		if (!node) return null;
		if (node.parentId == null) this.#roots.add(node.id);
		return node;
	}

	moveNode(id, newParentId = null) {
		const node = super.moveNode(id, newParentId);
		if (!node) return null;
		this.#syncRoot(node.id);
		return node;
	}

	deleteNode(id, branch = false) {
		const key = asId(id);
		if (!key) return null;
		const source = this.getNode(key);
		if (!source) return null;

		const parentBefore = source.parentId;
		const childrenBefore = source.childIds.slice();
		const branchIds = branch
			? Array.from(source.traverse({ mode: "dfs_pre", includeFrom: true }), (node) => node.id)
			: [source.id];

		const out = super.deleteNode(key, branch);
		if (!out) return null;

		if (branch) {
			for (const nodeId of branchIds) this.#roots.delete(nodeId);
			return out;
		}

		this.#roots.delete(key);
		if (parentBefore == null) {
			for (const childId of childrenBefore) this.#syncRoot(childId);
		}
		return out;
	}

	swapNodes(idA, idB) {
		const ok = super.swapNodes(idA, idB);
		if (!ok) return false;
		this.#syncRoot(idA);
		this.#syncRoot(idB);
		return true;
	}

	copyBranch(fromId, toId = null) {
		const fromKey = asId(fromId);
		if (!fromKey) return null;
		const source = this.getNode(fromKey);
		if (!source) return null;

		const targetKey = toId == null ? null : asId(toId);
		if (toId != null && !targetKey) return null;
		if (targetKey != null && !this.getNode(targetKey)) return null;
		if (targetKey != null && !canAttachBranch(source, targetKey)) return null;

		const remap = new Map();
		for (const current of source.traverse({ mode: "dfs_pre", includeFrom: true })) {
			const nextParentId = current.id === fromKey
				? targetKey
				: (remap.get(current.parentId)?.id ?? null);
			const clone = this.addNode(nextParentId);
			if (!clone) return null;
			copyNodeData(current, clone);
			remap.set(current.id, clone);
		}

		return remap.get(fromKey) ?? null;
	}

	refreshRoots() {
		this.#roots.clear();
		for (const node of this.nodes.values()) {
			if (node.parentId == null) this.#roots.add(node.id);
		}
		return this.roots;
	}

	async loadModelFromURL(_url, _options = {}) {
		return null;
	}

	#syncRoot(id) {
		const key = asId(id);
		if (!key) return;
		const node = this.getNode(key);
		if (!node) {
			this.#roots.delete(key);
			return;
		}
		if (node.parentId == null) this.#roots.add(key);
		else this.#roots.delete(key);
	}

	#roots;
	#meshStore;
	#textureStore;
	#shaderStore;
	#skeletonStore;
	#store;
}

if (typeof window !== "undefined") {
	window.WrWorld2 = WrWorld;
}

export default WrWorld;
