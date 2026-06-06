/* Adag
By Asciiz

Lightweight directed acyclic graph context
Best served as inherited base (yummers)
*/

const NODE_OP = Symbol("AdagNodeOp");

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

function uniquePut(list, value, index = -1) {
	if (list.includes(value)) return false;
	putAt(list, value, index);
	return true;
}

export class Node {
	#ctx = null;
	#parentIds = [];
	#childIds = [];
	id = "";

	constructor(id = "") {
		this.id = asId(id) ?? "";
	}

	get ctx() { return this.#ctx; }
	get parentIds() { return this.#parentIds.slice(); }
	get childIds() { return this.#childIds.slice(); }

	get parent() {
		if (!this.#ctx || this.#parentIds.length <= 0) return null;
		return this.#ctx.getNode(this.#parentIds[0]);
	}

	get parents() {
		if (!this.#ctx || this.#parentIds.length <= 0) return [];
		const out = [];
		for (const id of this.#parentIds) {
			const node = this.#ctx.getNode(id);
			if (node) out.push(node);
		}
		return out;
	}

	get children() {
		if (!this.#ctx || this.#childIds.length <= 0) return [];
		const out = [];
		for (const id of this.#childIds) {
			const node = this.#ctx.getNode(id);
			if (node) out.push(node);
		}
		return out;
	}

	newNode(index = -1) {
		if (!this.#ctx) return null;
		return this.#ctx.newNode(this, index);
	}

	linkChild(child, index = -1) {
		if (!this.#ctx) return false;
		return this.#ctx.link(this, child, index);
	}

	unlinkChild(child) {
		if (!this.#ctx) return false;
		return this.#ctx.unlink(this, child);
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

	*walk({ fromInclude = true, mode = "dfs_pre", dedupe = false, prune = null } = {}) {
		if (!this.#ctx) return;
		yield* this.#ctx.walk({ from: this, fromInclude, mode, dedupe, prune });
	}

	*schedule({ fromInclude = true, prune = null } = {}) {
		if (!this.#ctx) return;
		yield* this.#ctx.schedule({ from: this, fromInclude, prune });
	}

	[NODE_OP](op, a = null, b = null) {
		if (op === "bind") {
			if (this.#ctx) return false;
			this.#ctx = a;
			this.id = asId(b) ?? this.id;
			this.#parentIds.length = 0;
			this.#childIds.length = 0;
			return true;
		}
		if (op === "detach") {
			this.#ctx = null;
			this.#parentIds.length = 0;
			this.#childIds.length = 0;
			return true;
		}
		if (op === "addParent") return uniquePut(this.#parentIds, asId(a), b);
		if (op === "removeParent") return cut(this.#parentIds, asId(a));
		if (op === "addChild") return uniquePut(this.#childIds, asId(a), b);
		if (op === "removeChild") return cut(this.#childIds, asId(a));
		if (op === "parents") return this.#parentIds;
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
	get roots() {
		const out = [];
		for (const node of this.#nodes.values()) {
			if (node.parentIds.length <= 0) out.push(node);
		}
		return out;
	}

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

		if (parentNode) this.link(parentNode, node, index);
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

	link(parentRef, childRef, index = -1) {
		const parent = this.getNode(parentRef);
		const child = this.getNode(childRef);
		if (!parent || !child) return false;
		if (parent === child) return false;
		if (parent.childIds.includes(child.id)) return true;
		if (this.#isReachable(child.id, parent.id)) return false;

		parent[NODE_OP]("addChild", child.id, index);
		child[NODE_OP]("addParent", parent.id);
		this.#version++;
		return true;
	}

	unlink(parentRef, childRef) {
		const parent = this.getNode(parentRef);
		const child = this.getNode(childRef);
		if (!parent || !child) return false;
		const a = parent[NODE_OP]("removeChild", child.id);
		const b = child[NODE_OP]("removeParent", parent.id);
		if (a < 0 && b < 0) return false;
		this.#version++;
		return true;
	}

	moveNode(id, parent = null, index = -1) {
		const node = this.getNode(id);
		if (!node) return null;
		const oldParents = node.parentIds;
		for (const parentId of oldParents) this.unlink(parentId, node);
		if (parent != null && !this.link(parent, node, index)) {
			for (const parentId of oldParents) this.link(parentId, node);
			return null;
		}
		this.#version++;
		return node;
	}

	deleteNode(id, branch = false) {
		const node = this.getNode(id);
		if (!node) return null;
		return branch ? this.#deleteBranch(node) : this.#deleteSingle(node);
	}

	*walk({ from = null, fromInclude = true, mode = "dfs_pre", dedupe = false, prune = null } = {}) {
		mode = String(mode ?? "dfs_pre").toLowerCase();
		dedupe = dedupe === true;
		prune = typeof prune === "function" ? prune : null;

		const fromNode = this.getNode(from);
		if (!fromNode) return;
		const start = fromInclude !== false ? [fromNode.id] : fromNode.childIds;
		if (start.length <= 0) return;

		const visited = new Set();
		const shouldSkip = (node) => {
			if (!node) return true;
			if (dedupe && visited.has(node.id)) return true;
			if (dedupe) visited.add(node.id);
			return prune ? prune(node, this) === true : false;
		};

		if (mode === "bfs") {
			const q = start.slice();
			for (let qi = 0; qi < q.length; qi++) {
				const node = this.#nodes.get(q[qi]);
				if (shouldSkip(node)) continue;
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
				if (shouldSkip(node)) continue;
				stack.push({ id: node.id, exit: true });
				for (let i = node.childIds.length - 1; i >= 0; i--) stack.push({ id: node.childIds[i], exit: false });
			}
			return;
		}

		const stack = start.slice().reverse();
		while (stack.length > 0) {
			const node = this.#nodes.get(stack.pop());
			if (shouldSkip(node)) continue;
			yield node;
			for (let i = node.childIds.length - 1; i >= 0; i--) stack.push(node.childIds[i]);
		}
	}

	*schedule({ from = null, fromInclude = true, prune = null } = {}) {
		prune = typeof prune === "function" ? prune : null;
		const fromNode = this.getNode(from);
		if (!fromNode) return;
		const start = fromInclude !== false ? [fromNode.id] : fromNode.childIds;
		if (start.length <= 0) return;

		const reachable = new Set();
		const discovery = [];
		const stack = start.slice().reverse();
		while (stack.length > 0) {
			const id = stack.pop();
			if (reachable.has(id)) continue;
			const node = this.#nodes.get(id);
			if (!node) continue;
			if (prune && prune(node, this) === true) continue;
			reachable.add(id);
			discovery.push(id);
			for (let i = node.childIds.length - 1; i >= 0; i--) stack.push(node.childIds[i]);
		}

		const pendingParents = new Map();
		for (const id of discovery) {
			const node = this.#nodes.get(id);
			let count = 0;
			for (const parentId of node.parentIds) {
				if (reachable.has(parentId)) count++;
			}
			pendingParents.set(id, count);
		}

		const q = [];
		for (const id of discovery) {
			if ((pendingParents.get(id) ?? 0) === 0) q.push(id);
		}

		const done = new Set();
		for (let qi = 0; qi < q.length; qi++) {
			const id = q[qi];
			if (done.has(id)) continue;
			const node = this.#nodes.get(id);
			if (!node) continue;
			done.add(id);
			yield node;

			for (const childId of node.childIds) {
				if (!reachable.has(childId)) continue;
				const left = (pendingParents.get(childId) ?? 0) - 1;
				pendingParents.set(childId, left);
				if (left === 0) q.push(childId);
			}
		}
	}

	#deleteSingle(node) {
		for (const parentId of node.parentIds) this.unlink(parentId, node);
		for (const childId of node.childIds) this.unlink(node, childId);
		this.#nodes.delete(node.id);
		node[NODE_OP]("detach");
		this.#version++;
		return node;
	}

	#deleteBranch(node) {
		const reachable = this.#collectReachable(node.id);
		const protect = new Set();
		for (const id of reachable) {
			if (id === node.id) continue;
			const cur = this.#nodes.get(id);
			if (!cur) continue;
			for (const parentId of cur.parentIds) {
				if (!reachable.has(parentId)) {
					protect.add(id);
					break;
				}
			}
		}

		const protectStack = Array.from(protect);
		while (protectStack.length > 0) {
			const id = protectStack.pop();
			const cur = this.#nodes.get(id);
			if (!cur) continue;
			for (const childId of cur.childIds) {
				if (!reachable.has(childId) || protect.has(childId)) continue;
				protect.add(childId);
				protectStack.push(childId);
			}
		}

		const deleted = [];
		for (const id of reachable) {
			if (!protect.has(id)) deleted.push(id);
		}

		for (const id of deleted) {
			const cur = this.#nodes.get(id);
			if (!cur) continue;
			for (const parentId of cur.parentIds) this.unlink(parentId, cur);
			for (const childId of cur.childIds) this.unlink(cur, childId);
			this.#nodes.delete(id);
			cur[NODE_OP]("detach");
		}

		this.#version++;
		return node;
	}

	#collectReachable(fromId) {
		const out = new Set();
		const stack = [fromId];
		while (stack.length > 0) {
			const id = stack.pop();
			if (out.has(id)) continue;
			const node = this.#nodes.get(id);
			if (!node) continue;
			out.add(id);
			for (const childId of node.childIds) stack.push(childId);
		}
		return out;
	}

	#isReachable(fromId, targetId) {
		const stack = [fromId];
		const seen = new Set();
		while (stack.length > 0) {
			const id = stack.pop();
			if (id === targetId) return true;
			if (seen.has(id)) continue;
			seen.add(id);
			const node = this.#nodes.get(id);
			if (!node) continue;
			for (const childId of node.childIds) stack.push(childId);
		}
		return false;
	}

	#nextId() {
		let id = "";
		do {
			id = `${this.#prefix}${this.#seed++}`;
		} while (this.#nodes.has(id));
		return id;
	}
}

export const Adag = {
	Node,
	Ctx,
};

if (typeof window !== "undefined") window.Adag = Adag;

export default Adag;
