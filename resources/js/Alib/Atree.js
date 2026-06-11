/* Atree
By Asciiz

Lightweight agnostic tree structure, you can do literally anything you want with it
Best used as inherited base (Scene extends Ctx, Entity extends Node, etc)

!!! OBSOLETED !!!
*/

const NODE_OP = Symbol("AtreeNodeOp");

function asId(value) {
	if (value && typeof value === "object") {
		const raw = value.id ?? value.ref?.id ?? null;
		const id = String(raw ?? "").trim();
		return id ? id : null;
	}
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

export class Node {
	#ctx = null;
	#parentId = null;
	#childIds = [];
	id = "";

	constructor(id = "") {
		this.id = asId(id) ?? "";
	}

	get ctx() { return this.#ctx; }
	get parentId() { return this.#parentId; }
	get childIds() { return this.#childIds.slice(); }

	get parent() {
		if (!this.#ctx || this.#parentId == null) return null;
		return this.#ctx.getNode(this.#parentId);
	}

	get children() {
		if (!this.#ctx || this.#childIds.length <= 0) return [];
		const out = [];
		for (const childId of this.#childIds) {
			const child = this.#ctx.getNode(childId);
			if (child) out.push(child);
		}
		return out;
	}

	newNode(index = -1) {
		if (!this.#ctx) return null;
		return this.#ctx.newNode(this, index);
	}

	moveTo(parent = null, index = -1) {
		if (!this.#ctx) return null;
		return this.#ctx.moveNode(this, parent, index);
	}

	deleteSelf(branch = false) {
		if (!this.#ctx) return null;
		return this.#ctx.deleteNode(this, branch);
	}
	kys(branch = false) { return this.deleteSelf(branch); }

	*traverse({ fromInclude = true, mode = "dfs_pre", prune = null } = {}) {
		if (!this.#ctx) return;
		yield* this.#ctx.traverse({ from: this, fromInclude, mode, prune });
	}

	[NODE_OP](op, a = null, b = null) {
		if (op === "bind") {
			if (this.#ctx) return false;
			this.#ctx = a;
			this.id = asId(b) ?? this.id;
			this.#parentId = null;
			this.#childIds.length = 0;
			return true;
		}
		if (op === "detach") {
			this.#ctx = null;
			this.#parentId = null;
			this.#childIds.length = 0;
			return true;
		}
		if (op === "setParent") {
			this.#parentId = a == null ? null : asId(a);
			return true;
		}
		if (op === "addChild") return putAt(this.#childIds, asId(a), b);
		if (op === "removeChild") return cut(this.#childIds, asId(a));
		if (op === "setChildAt") {
			const i = Number(a);
			if (!Number.isInteger(i) || i < 0 || i >= this.#childIds.length) return false;
			this.#childIds[i] = asId(b);
			return true;
		}
		if (op === "childIndex") return this.#childIds.indexOf(asId(a));
		if (op === "children") return this.#childIds;
		return null;
	}
}

export class Ctx {
	#nodes = new Map();
	#version = 0;
	#seed = 1;
	#prefix = "node_";

	constructor(options = {}) {
		this.#prefix = String(options?.prefix ?? "node_");
	}

	get version() { return this.#version; }
	get nodes() { return new Map(this.#nodes); }
	get nodeCount() { return this.#nodes.size; }

	createNode(id = "") {
		return new Node(id);
	}

	newNode(parent = null, index = -1) {
		return this.bindNode(this.createNode(), parent, index);
	}

	bindNode(node, parent = null, index = -1) {
		if (!node || typeof node[NODE_OP] !== "function") return null;
		if (node.ctx) return null;
		const parentNode = parent == null ? null : this.getNode(parent);
		if (parent != null && !parentNode) return null;

		const id = this.#nextId();
		if (!node[NODE_OP]("bind", this, id)) return null;
		this.#nodes.set(id, node);

		if (parentNode) {
			node[NODE_OP]("setParent", parentNode.id);
			parentNode[NODE_OP]("addChild", node.id, index);
		}

		this.#version++;
		return node;
	}

	hasNode(ref) {
		return !!this.getNode(ref);
	}

	nodeIds() {
		return Array.from(this.#nodes.keys());
	}

	getNode(ref) {
		if (ref && typeof ref === "object" && ref.ctx === this) return ref;
		const key = asId(ref);
		if (!key) return null;
		return this.#nodes.get(key) ?? null;
	}

	moveNode(id, newParent = null, index = -1) {
		const node = this.getNode(id);
		if (!node) return null;
		const nextParent = newParent == null ? null : this.getNode(newParent);
		if (newParent != null && !nextParent) return null;
		if (nextParent === node) return null;
		if (nextParent && !this.#isAcyclicMove(node.id, nextParent.id)) return null;

		const prevParent = node.parentId == null ? null : this.#nodes.get(node.parentId);
		if (prevParent) prevParent[NODE_OP]("removeChild", node.id);
		if (nextParent) nextParent[NODE_OP]("addChild", node.id, index);
		node[NODE_OP]("setParent", nextParent?.id ?? null);

		this.#version++;
		return node;
	}

	swapNodes(idA, idB) {
		const nodeA = this.getNode(idA);
		const nodeB = this.getNode(idB);
		if (!nodeA || !nodeB) return false;
		if (nodeA === nodeB) return true;
		if (this.#isAncestor(nodeA.id, nodeB.id) || this.#isAncestor(nodeB.id, nodeA.id)) return false;

		const parentA = nodeA.parentId == null ? null : this.#nodes.get(nodeA.parentId);
		const parentB = nodeB.parentId == null ? null : this.#nodes.get(nodeB.parentId);
		const indexA = parentA ? parentA[NODE_OP]("childIndex", nodeA.id) : -1;
		const indexB = parentB ? parentB[NODE_OP]("childIndex", nodeB.id) : -1;
		if (parentA && indexA < 0) return false;
		if (parentB && indexB < 0) return false;

		if (parentA) parentA[NODE_OP]("setChildAt", indexA, nodeB.id);
		if (parentB) parentB[NODE_OP]("setChildAt", indexB, nodeA.id);
		const parentAId = nodeA.parentId;
		const parentBId = nodeB.parentId;
		nodeA[NODE_OP]("setParent", parentBId);
		nodeB[NODE_OP]("setParent", parentAId);
		this.#version++;
		return true;
	}

	deleteNode(id, branch = false) {
		const node = this.getNode(id);
		if (!node) return null;
		return branch ? this.#deleteBranch(node) : this.#deleteSingle(node);
	}

	*traverse({ from = null, fromInclude = true, mode = "dfs_pre", prune = null } = {}) {
		mode = String(mode ?? "dfs_pre").toLowerCase();
		prune = typeof prune === "function" ? prune : null;
		const fromNode = this.getNode(from);
		if (!fromNode) return;

		const start = fromInclude !== false ? [fromNode.id] : fromNode.childIds;
		if (start.length <= 0) return;

		const shouldPrune = (node) => prune ? prune(node, this) === true : false;
		if (mode === "bfs") {
			const q = start.slice();
			for (let qi = 0; qi < q.length; qi++) {
				const node = this.#nodes.get(q[qi]);
				if (!node || shouldPrune(node)) continue;
				yield node;
				for (const childId of node.childIds) q.push(childId);
			}
			return;
		}

		if (mode === "dfs_post") {
			const stack = start.slice().reverse().map((id) => ({ id, exit: false }));
			while (stack.length > 0) {
				const cur = stack.pop();
				const node = this.#nodes.get(cur.id);
				if (!node) continue;
				if (cur.exit) {
					yield node;
					continue;
				}
				if (shouldPrune(node)) continue;
				stack.push({ id: node.id, exit: true });
				for (let i = node.childIds.length - 1; i >= 0; i--) stack.push({ id: node.childIds[i], exit: false });
			}
			return;
		}

		const stack = start.slice().reverse();
		while (stack.length > 0) {
			const node = this.#nodes.get(stack.pop());
			if (!node || shouldPrune(node)) continue;
			yield node;
			for (let i = node.childIds.length - 1; i >= 0; i--) stack.push(node.childIds[i]);
		}
	}

	#deleteSingle(node) {
		const id = node.id;
		const parent = node.parentId == null ? null : this.#nodes.get(node.parentId);
		const children = node.childIds;
		let insertAt = -1;
		if (parent) insertAt = parent[NODE_OP]("removeChild", id);
		for (const childId of children) {
			const child = this.#nodes.get(childId);
			if (!child) continue;
			child[NODE_OP]("setParent", parent?.id ?? null);
			if (parent) {
				parent[NODE_OP]("addChild", childId, insertAt);
				if (insertAt >= 0) insertAt++;
			}
		}

		this.#nodes.delete(id);
		node[NODE_OP]("detach");
		this.#version++;
		return node;
	}

	#deleteBranch(node) {
		const parent = node.parentId == null ? null : this.#nodes.get(node.parentId);
		if (parent) parent[NODE_OP]("removeChild", node.id);

		const order = Array.from(this.traverse({ from: node, fromInclude: true }), (item) => item);
		for (const cur of order) {
			this.#nodes.delete(cur.id);
			cur[NODE_OP]("detach");
		}

		this.#version++;
		return node;
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
}

export const Atree = {
	Node,
	Ctx,
};

if (typeof window !== "undefined") window.Atree = Atree;

export default Atree;
