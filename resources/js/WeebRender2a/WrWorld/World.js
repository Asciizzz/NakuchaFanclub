import { Ctx } from "../../AzLib/AzHie.js";
import { WrNode } from "./Node.js";

const WR_NODE_STATIC_KEYS = new Set(["ctx", "id", "parentId", "childIds", "components"]);

function asId(value) {
	if (value == null) return null;
	const key = String(value).trim();
	return key || null;
}

function asNodeId(value) {
	if (value && typeof value === "object") return asId(value.id);
	return asId(value);
}

function cloneData(value) {
	if (value == null) return value;
	if (ArrayBuffer.isView(value)) return new value.constructor(value);
	if (Array.isArray(value)) return value.map((item) => cloneData(item));
	if (typeof value === "object") {
		const out = {};
		for (const [key, next] of Object.entries(value)) out[key] = cloneData(next);
		return out;
	}
	return value;
}

function copyNodeData(source, target) {
	for (const key of Object.keys(source)) {
		if (WR_NODE_STATIC_KEYS.has(key)) continue;
		target[key] = cloneData(source[key]);
	}
}

function copyNodeComponents(source, target) {
	if (!(source?.components instanceof Map)) return;
	for (const [Type, comp] of source.components.entries()) {
		if (!comp || typeof comp !== "object") continue;
		const next = target.addComp(Type);
		if (!next) continue;
		for (const key of Object.keys(comp)) {
			if (key === "node") continue;
			next[key] = cloneData(comp[key]);
		}
	}
}

function canAttachBranch(world, sourceNode, targetId) {
	for (const [node] of world.traverse({ from: sourceNode.id, mode: "dfs_pre", includeFrom: true })) {
		if (node.id === targetId) return false;
	}
	return true;
}

export class WrWorld extends Ctx {
	#roots = new Set();

	constructor(options = {}) {
		super({
			prefix: options?.prefix ?? options?.nodePrefix ?? "wr_node_",
		});
		this.options = options ?? {};
	}

	get roots() {
		return Array.from(this.#roots);
	}

	createNode(id) {
		return new WrNode(this, id);
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
			? Array.from(this.traverse({ from: source.id, mode: "dfs_pre", includeFrom: true }), ([node]) => node.id)
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
		const fromKey = asNodeId(fromId);
		if (!fromKey) return null;
		const source = this.getNode(fromKey);
		if (!source) return null;

		const targetKey = toId == null ? null : asNodeId(toId);
		if (toId != null && !targetKey) return null;
		if (targetKey != null && !this.getNode(targetKey)) return null;
		if (targetKey != null && !canAttachBranch(this, source, targetKey)) return null;

		const remap = new Map();
		for (const [current] of this.traverse({ from: source.id, mode: "dfs_pre", includeFrom: true })) {
			const nextParentId = current.id === fromKey
				? targetKey
				: (remap.get(current.parentId)?.id ?? null);
			const clone = this.addNode(nextParentId);
			if (!clone) return null;
			copyNodeData(current, clone);
			copyNodeComponents(current, clone);
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
}

if (typeof window !== "undefined") {
	window.WrWorld = WrWorld;
	window.WrWorld2 = WrWorld;
}

export default WrWorld;
