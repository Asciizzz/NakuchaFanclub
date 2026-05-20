/*
Azt - Tree structure
By Asciiz

Lightweight agnostic tree structure, you can do literally anything you want with it
*/

const NODE_CORE_KEYS = new Set(["$", "id", "parentId", "childIds"]);

function asId(value) {
	const id = String(value ?? "").trim();
	return id ? id : null;
}

function putAt(list, value, index = -1) {
	const i = Number(index);
	if (!Number.isInteger(i) || i < 0 || i >= list.length) {
		list.push(value);
		return list.length - 1;
	}
	list.splice(i, 0, value);
	return i;
}

function cut(list, value) {
	const i = list.indexOf(value);
	if (i < 0) return -1;
	list.splice(i, 1);
	return i;
}

function isObject(value) {
	return !!value && typeof value === "object";
}

export class Node {
	$ = null;
	id = "";
	parentId = null;
	childIds = [];

	constructor($ = null, id = "") {
		this.$ = $;
		this.id = asId(id) ?? "";
	}

	get parent() {
		if (!this.$ || this.parentId == null) return null;
		return this.$.get(this.parentId);
	}

	get children() {
		if (!this.$ || this.childIds.length <= 0) return [];
		const out = [];
		for (const childId of this.childIds) {
			const child = this.$.get(childId);
			if (child) out.push(child);
		}
		return out;
	}

	// Useful call to Ctx

	add(index = -1) {
		if (!this.$) return null;
		return this.$.add(this.id, index);
	}

	move(newParentId = null) {
		if (!this.$) return null;
		return this.$.move(this.id, newParentId);
	}

	// Node exclusive behaviours

	remove(key) {
		if (NODE_CORE_KEYS.has(key)) return false;
		if (!(key in this)) return false;
		delete this[key];
		return true;
	}

	clear() {
		for (const key in this) {
			if (NODE_CORE_KEYS.has(key)) continue;
			delete this[key];
		}
	}

	swapChildrenOrder(indexA, indexB) {
		const iA = Number(indexA);
		const iB = Number(indexB);
		if (!Number.isInteger(iA) || !Number.isInteger(iB)) return false;
		if (iA < 0 || iA >= this.childIds.length) return false;
		if (iB < 0 || iB >= this.childIds.length) return false;
		if (iA === iB) return true;

		const temp = this.childIds[iA];
		this.childIds[iA] = this.childIds[iB];
		this.childIds[iB] = temp;
		return true;
	}
}

export class Ctx {
	#nodes = new Map();
	#roots = [];
	#version = 0;
	#seed = 1;
	#prefix = "node_";

	constructor(options = {}) {
		const src = isObject(options) ? options : {};
		this.#prefix = String(src.prefix ?? "node_");
	}

	get version() { return this.#version; }
	get roots() { return this.#roots.slice(); }

	/**
	 * Create empty node and add to tree
	 * @param {string|null} [parent=null] parent id
	 * @param {number} [index=-1] insert index
	 * @returns {Node|null}
	 */
	add(parent = null, index = -1) {
		const parentId = parent == null ? null : asId(parent);
		if (parent != null && parentId == null) return null;
		if (parentId != null && !this.#nodes.has(parentId)) return null;

		const id = this.#nextId();
		const node = new Node(this, id);
		if (!node.id || this.#nodes.has(node.id)) return null;

		node.parentId = parentId;
		node.childIds.length = 0;
		this.#nodes.set(id, node);

		if (parentId == null) {
			putAt(this.#roots, id, index);
		} else {
			const parentNode = this.#nodes.get(parentId);
			if (!parentNode) {
				this.#nodes.delete(id);
				node.$ = null;
				return null;
			}
			putAt(parentNode.childIds, id, index);
		}

		this.#version++;
		return node;
	}

	/**
	 * Get node
	 * @param {string} id node id
	 * @returns {Node|null}
	 */
	get(id) {
		const key = asId(id);
		if (!key) return null;
		return this.#nodes.get(key) ?? null;
	}

	/**
	 * Reparent node
	 * @param {string} id node id
	 * @param {string|null} [newParentId=null] next parent id
	 * @returns {Node|null}
	 */
	move(id, newParentId = null) {
		const node = this.get(id);
		if (!node) return null;

		const nextParentId = newParentId == null ? null : asId(newParentId);
		if (newParentId != null && nextParentId == null) return null;
		if (nextParentId === node.id) return null;
		if (nextParentId != null && !this.#nodes.has(nextParentId)) return null;
		if (!this.#isAcyclicMove(node.id, nextParentId)) return null;

		const prevParentId = node.parentId;
		if (prevParentId == null) {
			cut(this.#roots, node.id);
		} else {
			const prevParent = this.#nodes.get(prevParentId);
			if (prevParent) cut(prevParent.childIds, node.id);
		}

		if (nextParentId == null) {
			this.#roots.push(node.id);
		} else {
			const nextParent = this.#nodes.get(nextParentId);
			if (!nextParent) return null;
			nextParent.childIds.push(node.id);
		}

		node.parentId = nextParentId;
		this.#version++;
		return node;
	}

	/**
	 * Swap two node positions in tree
	 * @param {string} idA first node id
	 * @param {string} idB second node id
	 * @returns {boolean}
	 */
	swap(idA, idB) {
		const nodeA = this.get(idA);
		const nodeB = this.get(idB);
		if (!nodeA || !nodeB) return false;
		if (nodeA === nodeB) return true;

		const parentA = nodeA.parentId;
		const parentB = nodeB.parentId;

		if (parentA === parentB) {
			const list = parentA == null ? this.#roots : (this.#nodes.get(parentA)?.childIds ?? null);
			if (!list) return false;
			const indexA = list.indexOf(nodeA.id);
			const indexB = list.indexOf(nodeB.id);
			if (indexA < 0 || indexB < 0) return false;
			if (indexA === indexB) return true;
			const temp = list[indexA];
			list[indexA] = list[indexB];
			list[indexB] = temp;
			this.#version++;
			return true;
		}

		if (this.#isAncestor(nodeA.id, nodeB.id) || this.#isAncestor(nodeB.id, nodeA.id)) {
			return false;
		}

		const listA = parentA == null ? this.#roots : (this.#nodes.get(parentA)?.childIds ?? null);
		const listB = parentB == null ? this.#roots : (this.#nodes.get(parentB)?.childIds ?? null);
		if (!listA || !listB) return false;

		const indexA = listA.indexOf(nodeA.id);
		const indexB = listB.indexOf(nodeB.id);
		if (indexA < 0 || indexB < 0) return false;

		listA[indexA] = nodeB.id;
		listB[indexB] = nodeA.id;
		nodeA.parentId = parentB;
		nodeB.parentId = parentA;
		this.#version++;
		return true;
	}

	/**
	 * Delete node/branch
	 * @param {string} id node id
	 * @param {boolean} [branch=false] delete subtree branch when true
	 * @returns {Node|null}
	 */
	delete(id, branch = false) {
		const node = this.get(id);
		if (!node) return null;
		return branch ? this.#deleteBranch(node) : this.#deleteSingle(node);
	}

	#deleteSingle(node) {
		const id = node.id;
		const rescueParentId = node.parentId;
		const rescueChildren = [];
		for (const childId of node.childIds) {
			if (this.#nodes.has(childId)) rescueChildren.push(childId);
		}

		if (rescueParentId == null) {
			const idx = cut(this.#roots, id);
			for (let i = 0; i < rescueChildren.length; i++) {
				putAt(this.#roots, rescueChildren[i], idx < 0 ? -1 : (idx + i));
			}
		} else {
			const rescueParent = this.#nodes.get(rescueParentId);
			if (rescueParent) {
				const idx = cut(rescueParent.childIds, id);
				for (let i = 0; i < rescueChildren.length; i++) {
					putAt(rescueParent.childIds, rescueChildren[i], idx < 0 ? -1 : (idx + i));
				}
			}
		}

		for (const childId of rescueChildren) {
			const child = this.#nodes.get(childId);
			if (child) child.parentId = rescueParentId;
		}

		this.#nodes.delete(id);
		node.$ = null;
		node.parentId = null;
		node.childIds.length = 0;
		this.#version++;
		return node;
	}

	#deleteBranch(node) {
		const id = node.id;
		const parentId = node.parentId;
		if (parentId == null) {
			cut(this.#roots, id);
		} else {
			const parent = this.#nodes.get(parentId);
			if (parent) cut(parent.childIds, id);
		}

		const order = [];
		const stack = [id];
		while (stack.length > 0) {
			const curId = stack.pop();
			const curNode = this.#nodes.get(curId);
			if (!curNode) continue;
			order.push(curNode);
			for (let i = curNode.childIds.length - 1; i >= 0; i--) {
				stack.push(curNode.childIds[i]);
			}
		}

		for (const curNode of order) {
			this.#nodes.delete(curNode.id);
			curNode.$ = null;
			curNode.parentId = null;
			curNode.childIds.length = 0;
		}

		this.#version++;
		return node;
	}

	/**
	 * Traverse tree
	 * @param {object} [options={}] traversal options
	 * @returns {Generator<Node>}
	 */
	*traverse(options = {}) {
		const mode = String(options?.mode ?? "dfs_pre").toLowerCase();
		const includeFrom = options?.includeFrom !== false;
		const filter = typeof options?.filter === "function" ? options.filter : null;
		const start = this.#resolveStart(options?.from ?? null, includeFrom);
		if (start.length <= 0) return;

		if (mode === "bfs") {
			const q = start.slice();
			while (q.length > 0) {
				const id = q.shift();
				const node = this.#nodes.get(id);
				if (!node) continue;
				if (!filter || filter(node)) yield node;
				for (let i = 0; i < node.childIds.length; i++) {
					q.push(node.childIds[i]);
				}
			}
			return;
		}

		const stack = start.slice().reverse().map((id) => ({ id, phase: "enter" }));
		while (stack.length > 0) {
			const cur = stack.pop();
			const node = this.#nodes.get(cur.id);
			if (!node) continue;

			if (mode === "dfs_post" && cur.phase === "exit") {
				if (!filter || filter(node)) yield node;
				continue;
			}

			if (mode === "dfs_pre") {
				if (!filter || filter(node)) yield node;
			} else {
				stack.push({ ...cur, phase: "exit" });
			}

			for (let i = node.childIds.length - 1; i >= 0; i--) {
				stack.push({
					id: node.childIds[i],
					phase: "enter",
				});
			}
		}
	}

	#nextId() {
		let id = "";
		do {
			id = `${this.#prefix}${this.#seed++}`;
		} while (this.#nodes.has(id));
		return id;
	}

	#isAcyclicMove(id, nextParentId) {
		let cur = nextParentId;
		while (cur != null) {
			if (cur === id) return false;
			const node = this.#nodes.get(cur);
			cur = node ? node.parentId : null;
		}
		return true;
	}

	#isAncestor(ancestorId, nodeId) {
		let cur = this.#nodes.get(nodeId);
		while (cur && cur.parentId != null) {
			if (cur.parentId === ancestorId) return true;
			cur = this.#nodes.get(cur.parentId);
		}
		return false;
	}

	#resolveStart(from, includeFrom) {
		if (from == null) {
			return this.#roots.slice();
		}

		const start = this.get(from);
		if (!start) return [];
		if (includeFrom) return [start.id];
		return start.childIds.slice();
	}
}

export const Azt = {
	Node,
	Ctx,
};

if (typeof window !== "undefined") {
	window.Azt = Azt;
}

export default Azt;
