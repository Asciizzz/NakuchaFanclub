import { Ctx, Node } from "../../Alib/Atree.js";
import { Component } from "./component.js";

const WR_NODE_STATIC_KEYS = new Set(["ctx", "id", "parentId", "childIds", "components"]);

function asId(value) {
	if (value == null) return null;
	const out = String(value).trim();
	return out || null;
}

function asNodeId(ctx, value) {
	if (value && typeof value === "object") {
		if (value.ctx !== ctx) return null;
		return asId(value.id);
	}
	return asId(value);
}

function cloneData(value) {
	if (value == null) return value;
	if (ArrayBuffer.isView(value)) return new value.constructor(value);
	if (Array.isArray(value)) return value.map((item) => cloneData(item));
	if (typeof value === "object") {
		if (value.ref?.store) return value;
		const proto = Object.getPrototypeOf(value);
		const isPlain = proto === Object.prototype || proto === null;
		if (!isPlain) return value;
		const out = {};
		for (const [key, next] of Object.entries(value)) out[key] = cloneData(next);
		return out;
	}
	return value;
}

function isCompType(Type) {
	return typeof Type === "function" && (Type === Component || Type.prototype instanceof Component);
}

export class WrNode extends Node {
	components = new Map();

	addComp(Type) {
		if (!isCompType(Type)) return null;
		const existing = this.components.get(Type);
		if (existing) return existing;
		const comp = new Type(this);
		this.components.set(Type, comp);
		return comp;
	}

	getComp(Type) {
		if (!isCompType(Type)) return null;
		return this.components.get(Type) ?? null;
	}

	removeComp(Type) {
		if (!isCompType(Type)) return null;
		const comp = this.components.get(Type) ?? null;
		if (!comp) return null;
		this.components.delete(Type);
		comp.node = null;
		return comp;
	}

	clearComp() {
		const out = [];
		for (const Type of this.components.keys()) {
			const comp = this.removeComp(Type);
			if (comp) out.push(comp);
		}
		return out;
	}

	attachCopy(source) {
		if (!(source instanceof WrNode)) return null;
		return this.ctx.copyBranch(source, this);
	}
}

export class WrWorld extends Ctx {
	#roots = new Set();

	get roots() {
		return Array.from(this.#roots);
	}

	createNode(id) {
		return new WrNode(id);
	}

	getNode(ref) {
		return super.getNode(asNodeId(this, ref));
	}

	newNode(parent = null, index = -1) {
		const parentId = parent == null ? null : asNodeId(this, parent);
		const node = super.newNode(parentId, index);
		if (!node) return null;
		if (node.parentId == null) this.#roots.add(node.id);
		return node;
	}

	moveNode(id, newParentId = null) {
		const nodeId = asNodeId(this, id);
		const parentId = newParentId == null ? null : asNodeId(this, newParentId);
		const node = super.moveNode(nodeId, parentId);
		if (!node) return null;
		this.#syncRoot(node.id);
		return node;
	}

	deleteNode(id, branch = false) {
		const key = asNodeId(this, id);
		if (!key) return null;
		const source = this.getNode(key);
		if (!source) return null;

		const parentBefore = source.parentId;
		const childrenBefore = source.childIds.slice();
		const branchIds = branch
			? Array.from(source.traverse({ mode: "dfs_pre", fromInclude: true }), (node) => node.id)
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
		const keyA = asNodeId(this, idA);
		const keyB = asNodeId(this, idB);
		const ok = super.swapNodes(keyA, keyB);
		if (!ok) return false;
		this.#syncRoot(keyA);
		this.#syncRoot(keyB);
		return true;
	}

	refreshRoots() {
		this.#roots.clear();
		for (const node of this.nodes.values()) {
			if (node.parentId == null) this.#roots.add(node.id);
		}
		return this.roots;
	}

	copyBranch(fromId, toId = null) {
		const sourceId = asNodeId(this, fromId);
		const source = this.getNode(sourceId);
		if (!source) return null;

		const targetId = toId == null ? null : asNodeId(this, toId);
		if (targetId != null && !this.getNode(targetId)) return null;

		const remap = new Map();
		for (const current of source.traverse({ mode: "dfs_pre", fromInclude: true })) {
			const nextParentId = current.id === source.id
				? targetId
				: (remap.get(current.parentId)?.id ?? null);

			const clone = this.newNode(nextParentId);
			if (!clone) return null;

			for (const key of Object.keys(current)) {
				if (WR_NODE_STATIC_KEYS.has(key)) continue;
				clone[key] = cloneData(current[key]);
			}

			for (const [Type, comp] of current.components.entries()) {
				const nextComp = clone.addComp(Type);
				if (!nextComp) continue;
				for (const key of Object.keys(comp)) {
					if (key === "node") continue;
					nextComp[key] = cloneData(comp[key]);
				}
			}

			remap.set(current.id, clone);
		}

		return remap.get(source.id) ?? null;
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
	window.WrWorld21 = WrWorld;
	window.WrNode21 = WrNode;
}

export default WrWorld;
