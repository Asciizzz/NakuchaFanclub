/*
AzDAG
By Asciiz

Lightweight directed acyclic graph context
*/

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

function uniquePush(list, value, index = -1) {
	if (list.includes(value)) return false;
	putAt(list, value, index);
	return true;
}

const AZDAG_CHECK = Object.freeze({
	SKIP_CALL: 1 << 0,
	SKIP_YIELD: 1 << 1,
	TERMINATE: 1 << 2,
	BREAK_BRANCH: 1 << 3,
});

export class Node {
	ctx = null;
	id = "";
	parentIds = [];
	childIds = [];

	constructor(ctx = null, id = "") {
		this.ctx = ctx;
		this.id = asId(id) ?? "";
	}

	get parent() {
		if (!this.ctx || this.parentIds.length <= 0) return null;
		return this.ctx.getNode(this.parentIds[0]);
	}

	get parents() {
		if (!this.ctx || this.parentIds.length <= 0) return [];
		const out = [];
		for (const id of this.parentIds) {
			const node = this.ctx.getNode(id);
			if (node) out.push(node);
		}
		return out;
	}

	get children() {
		if (!this.ctx || this.childIds.length <= 0) return [];
		const out = [];
		for (const id of this.childIds) {
			const node = this.ctx.getNode(id);
			if (node) out.push(node);
		}
		return out;
	}

	addChild(index = -1) {
		if (!this.ctx) return null;
		return this.ctx.addNode(this.id, index);
	}

	linkChild(child, index = -1) {
		if (!this.ctx) return null;
		return this.ctx.link(this.id, child, index);
	}

	unlinkChild(child) {
		if (!this.ctx) return false;
		return this.ctx.unlink(this.id, child);
	}

	moveTo(parent = null, index = -1) {
		if (!this.ctx) return null;
		return this.ctx.moveNode(this.id, parent, index);
	}

	deleteSelf(branch = false) {
		if (!this.ctx) return null;
		return this.ctx.deleteNode(this.id, branch);
	}
	kys(branch = false) { return this.deleteSelf(branch); }

	*walk(options = {}) {
		if (!this.ctx) return;
		const src = options && typeof options === "object" ? options : {};
		yield* this.ctx.walk({
			...src,
			from: this.id,
		});
	}

	*schedule(options = {}) {
		if (!this.ctx) return;
		const src = options && typeof options === "object" ? options : {};
		yield* this.ctx.schedule({
			...src,
			from: this.id,
		});
	}
}

export class Ctx {
	static CHECK = AZDAG_CHECK;

	#nodes = new Map();
	#version = 0;
	#seed = 1;
	#prefix = "node_";

	constructor(options = {}) {
		this.#prefix = String(options?.prefix ?? "node_");
	}

	get version() { return this.#version; }
	get nodes() { return this.#nodes; }
	get roots() {
		const out = [];
		for (const node of this.#nodes.values()) {
			if (node.parentIds.length <= 0) out.push(node);
		}
		return out;
	}

	createNode(id) {
		return new Node(this, id);
	}

	addNode(parent = null, index = -1) {
		const id = this.#nextId();
		const node = this.createNode(id);
		if (!node) return null;

		node.parentIds.length = 0;
		node.childIds.length = 0;
		this.#nodes.set(id, node);

		if (parent != null && !this.link(parent, id, index)) {
			this.#nodes.delete(id);
			node.ctx = null;
			return null;
		}

		this.#version++;
		return node;
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

		uniquePush(parent.childIds, child.id, index);
		uniquePush(child.parentIds, parent.id);
		this.#version++;
		return true;
	}

	unlink(parentRef, childRef) {
		const parent = this.getNode(parentRef);
		const child = this.getNode(childRef);
		if (!parent || !child) return false;

		const a = cut(parent.childIds, child.id);
		const b = cut(child.parentIds, parent.id);
		if (a < 0 && b < 0) return false;

		this.#version++;
		return true;
	}

	moveNode(id, parent = null, index = -1) {
		const node = this.getNode(id);
		if (!node) return null;

		const oldParents = node.parentIds.slice();
		for (const parentId of oldParents) this.unlink(parentId, node.id);
		if (parent != null && !this.link(parent, node.id, index)) {
			for (const parentId of oldParents) this.link(parentId, node.id);
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

	*walk(options = {}) {
		const mode = String(options?.mode ?? "dfs_pre").toLowerCase();
		const callNodeFn = typeof options?.callNode === "function" ? options.callNode : null;
		const checkNodeFn = typeof options?.ignore?.checkNode === "function" ? options.ignore.checkNode : null;
		const dedupe = options?.dedupe === true;
		const CHECK = Ctx.CHECK;

		const fromNode = this.getNode(options?.from ?? null);
		if (!fromNode) return;

		const includeFrom = options?.includeFrom !== false;
		const start = includeFrom ? [fromNode.id] : fromNode.childIds.slice();
		if (start.length <= 0) return;

		const visited = new Set();
		const inspectNode = (node) => {
			const rawFlags = checkNodeFn ? Number(checkNodeFn(node, this)) : 0;
			const flags = Number.isFinite(rawFlags) ? (rawFlags | 0) : 0;
			let callResult;
			if (!(flags & CHECK.SKIP_CALL) && callNodeFn) callResult = callNodeFn(node, this);
			return { flags, callResult };
		};

		function* yieldNode(node, visit) {
			if (!(visit.flags & CHECK.SKIP_YIELD)) yield [node, visit.callResult];
		}

		const shouldSkip = (id) => {
			if (!dedupe) return false;
			if (visited.has(id)) return true;
			visited.add(id);
			return false;
		};

		if (mode === "bfs") {
			const q = start.slice();
			while (q.length > 0) {
				const id = q.shift();
				if (shouldSkip(id)) continue;
				const node = this.#nodes.get(id);
				if (!node) continue;
				const visit = inspectNode(node);
				yield* yieldNode(node, visit);
				if (visit.flags & CHECK.TERMINATE) return;
				if (visit.flags & CHECK.BREAK_BRANCH) continue;
				for (const childId of node.childIds) q.push(childId);
			}
			return;
		}

		const stack = start.slice().reverse().map((id) => ({ id, phase: "enter" }));
		while (stack.length > 0) {
			const cur = stack.pop();
			const node = this.#nodes.get(cur.id);
			if (!node) continue;

			if (mode === "dfs_post") {
				if (cur.phase === "exit") {
					const visit = { flags: cur.flags ?? 0, callResult: cur.callResult };
					yield* yieldNode(node, visit);
					if (visit.flags & CHECK.TERMINATE) return;
					continue;
				}
				if (shouldSkip(cur.id)) continue;
				const visit = inspectNode(node);
				if (visit.flags & CHECK.TERMINATE) {
					yield* yieldNode(node, visit);
					return;
				}
				stack.push({ ...cur, phase: "exit", ...visit });
				if (visit.flags & CHECK.BREAK_BRANCH) continue;
				for (let i = node.childIds.length - 1; i >= 0; i--) {
					stack.push({ id: node.childIds[i], phase: "enter" });
				}
				continue;
			}

			if (shouldSkip(cur.id)) continue;
			const visit = inspectNode(node);
			yield* yieldNode(node, visit);
			if (visit.flags & CHECK.TERMINATE) return;
			if (visit.flags & CHECK.BREAK_BRANCH) continue;
			for (let i = node.childIds.length - 1; i >= 0; i--) {
				stack.push({ id: node.childIds[i], phase: "enter" });
			}
		}
	}

	*schedule(options = {}) {
		const callNodeFn = typeof options?.callNode === "function" ? options.callNode : null;
		const checkNodeFn = typeof options?.ignore?.checkNode === "function" ? options.ignore.checkNode : null;
		const CHECK = Ctx.CHECK;

		const fromNode = this.getNode(options?.from ?? null);
		if (!fromNode) return;

		const includeFrom = options?.includeFrom !== false;
		const start = includeFrom ? [fromNode.id] : fromNode.childIds.slice();
		if (start.length <= 0) return;

		const reachable = new Set();
		const discovery = [];
		const stack = start.slice().reverse();
		while (stack.length > 0) {
			const id = stack.pop();
			if (reachable.has(id)) continue;
			const node = this.#nodes.get(id);
			if (!node) continue;
			reachable.add(id);
			discovery.push(id);
			for (let i = node.childIds.length - 1; i >= 0; i--) {
				stack.push(node.childIds[i]);
			}
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

			const rawFlags = checkNodeFn ? Number(checkNodeFn(node, this)) : 0;
			const flags = Number.isFinite(rawFlags) ? (rawFlags | 0) : 0;
			let callResult;
			if (!(flags & CHECK.SKIP_CALL) && callNodeFn) callResult = callNodeFn(node, this);
			if (!(flags & CHECK.SKIP_YIELD)) yield [node, callResult];
			if (flags & CHECK.TERMINATE) return;
			if (flags & CHECK.BREAK_BRANCH) continue;

			for (const childId of node.childIds) {
				if (!reachable.has(childId)) continue;
				const left = (pendingParents.get(childId) ?? 0) - 1;
				pendingParents.set(childId, left);
				if (left === 0) q.push(childId);
			}
		}
	}

	#deleteSingle(node) {
		for (const parentId of node.parentIds.slice()) this.unlink(parentId, node.id);
		for (const childId of node.childIds.slice()) this.unlink(node.id, childId);
		this.#nodes.delete(node.id);
		node.ctx = null;
		node.parentIds.length = 0;
		node.childIds.length = 0;
		this.#version++;
		return node;
	}

	#deleteBranch(node) {
		const marked = new Set();
		const stack = [node.id];
		while (stack.length > 0) {
			const id = stack.pop();
			if (marked.has(id)) continue;
			const cur = this.#nodes.get(id);
			if (!cur) continue;
			marked.add(id);
			for (const childId of cur.childIds) stack.push(childId);
		}

		for (const id of Array.from(marked)) {
			const cur = this.#nodes.get(id);
			if (!cur) continue;
			for (const parentId of cur.parentIds) {
				if (!marked.has(parentId)) marked.delete(id);
			}
		}

		const out = node;
		for (const id of Array.from(marked)) {
			const cur = this.#nodes.get(id);
			if (!cur) continue;
			for (const parentId of cur.parentIds.slice()) this.unlink(parentId, id);
			for (const childId of cur.childIds.slice()) this.unlink(id, childId);
			this.#nodes.delete(id);
			cur.ctx = null;
			cur.parentIds.length = 0;
			cur.childIds.length = 0;
		}
		this.#version++;
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

export const AzDAG = {
	Node,
	Ctx,
};

if (typeof window !== "undefined") {
	window.AzDAG = AzDAG;
}

export default AzDAG;
