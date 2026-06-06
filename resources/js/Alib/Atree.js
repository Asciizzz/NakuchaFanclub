/* Atree
By Asciiz

Lightweight agnostic tree structure, you can do literally anything you want with it
Best used as inherited base (Scene extends Ctx, Entity extends Node, etc)
*/

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

const AzTree_CHECK = Object.freeze({
	SKIP_CALL: 1 << 0,
	SKIP_YIELD: 1 << 1,
	TERMINATE: 1 << 2,
	BREAK_BRANCH: 1 << 3,
});

export class Node {
	ctx = null;
	id = "";
	parentId = null;
	childIds = [];

	constructor(ctx = null, id = "") {
		this.ctx = ctx;
		this.id = asId(id) ?? "";
	}

	get parent() {
		if (!this.ctx || this.parentId == null) return null;
		return this.ctx.getNode(this.parentId);
	}

	get children() {
		if (!this.ctx || this.childIds.length <= 0) return [];
		const out = [];
		for (const childId of this.childIds) {
			const child = this.ctx.getNode(childId);
			if (child) out.push(child);
		}
		return out;
	}

	// Useful call to Ctx

	addChild(index = -1) {
		if (!this.ctx) return null;
		return this.ctx.addNode(this.id, index);
	}

	moveTo(newParentId = null) {
		if (!this.ctx) return null;
		return this.ctx.moveNode(this.id, newParentId);
	}

	deleteSelf(branch = false) {
		if (!this.ctx) return null;
		return this.ctx.deleteNode(this.id, branch);
	}
	kys(branch = false) { return this.deleteSelf(branch); }

	*traverse(options = {}) {
		if (!this.ctx) return;
		const src = options && typeof options === "object" ? options : {};
		yield* this.ctx.traverse({
			...src,
			from: this.id,
		});
	}
}

export class Ctx {
	static CHECK = AzTree_CHECK;

	#nodes = new Map();
	#version = 0;
	#seed = 1;
	#prefix = "node_";

	constructor(options = {}) {
		this.#prefix = String(options?.prefix ?? "node_");
	}

	get version() { return this.#version; }
	get nodes() { return this.#nodes; }

	/**
	 * Create one node instance for this context
	 * Override in derived contexts to return inherited node classes
	 * @param {string} id node id
	 * @returns {Node}
	 */
	createNode(id) {
		return new Node(this, id);
	}

	/**
	 * Create empty node and add to tree
	 * @param {string|null} [parent=null] parent id
	 * @param {number} [index=-1] insert index
	 * @returns {Node|null}
	 */
	addNode(parent = null, index = -1) {
		const parentId = parent == null ? null : asId(parent);
		if (parent != null && parentId == null) return null;
		if (parentId != null && !this.#nodes.has(parentId)) return null;

		const id = this.#nextId();
		const node = this.createNode(id);
		if (!node) return null;

		node.parentId = parentId;
		node.childIds.length = 0;
		this.#nodes.set(id, node);

		if (parentId != null) {
			const parentNode = this.#nodes.get(parentId);
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
	getNode(id) {
		if (id && typeof id === "object" && id.ctx === this) return id;
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
	moveNode(id, newParentId = null) {
		const node = this.getNode(id);
		if (!node) return null;

		const nextParentId = newParentId == null ? null : asId(newParentId);
		if (newParentId != null && nextParentId == null) return null;
		if (nextParentId === node.id) return null;
		if (nextParentId != null && !this.#nodes.has(nextParentId)) return null;
		if (!this.#isAcyclicMove(node.id, nextParentId)) return null;

		const prevParentId = node.parentId;
		if (prevParentId != null) {
			const prevParent = this.#nodes.get(prevParentId);
			if (prevParent) cut(prevParent.childIds, node.id);
		}

		if (nextParentId != null) {
			const nextParent = this.#nodes.get(nextParentId);
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
	swapNodes(idA, idB) {
		const nodeA = this.getNode(idA);
		const nodeB = this.getNode(idB);
		if (!nodeA || !nodeB) return false;
		if (nodeA === nodeB) return true;

		const parentA = nodeA.parentId;
		const parentB = nodeB.parentId;

		if (parentA === parentB) {
			if (parentA == null) return true;
			const list = this.#nodes.get(parentA)?.childIds ?? null;
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

		const listA = parentA == null ? null : (this.#nodes.get(parentA)?.childIds ?? null);
		const listB = parentB == null ? null : (this.#nodes.get(parentB)?.childIds ?? null);
		const indexA = listA ? listA.indexOf(nodeA.id) : -1;
		const indexB = listB ? listB.indexOf(nodeB.id) : -1;
		if (listA && indexA < 0) return false;
		if (listB && indexB < 0) return false;

		if (listA) listA[indexA] = nodeB.id;
		if (listB) listB[indexB] = nodeA.id;
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
	deleteNode(id, branch = false) {
		const node = this.getNode(id);
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

		if (rescueParentId != null) {
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
		node.ctx = null;
		node.parentId = null;
		node.childIds.length = 0;
		this.#version++;
		return node;
	}

	#deleteBranch(node) {
		const id = node.id;
		const parentId = node.parentId;
		if (parentId != null) {
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
			curNode.ctx = null;
			curNode.parentId = null;
			curNode.childIds.length = 0;
		}

		this.#version++;
		return node;
	}

	/**
	 * Traverse tree
	 * @param {object} [options={}] traversal options
	 * @param {string|Node|{id:string}} options.from start node reference (required)
	 * @param {boolean} [options.includeFrom=true] include `from` node itself
	 * @param {"dfs_pre"|"dfs_post"|"bfs"} [options.mode="dfs_pre"] traversal mode
	 * @param {(node: Node, ctx: Ctx) => void} [options.callNode] callback run for every visited node
	 * @param {{checkNode?: (node: Node, ctx: Ctx) => number}} [options.ignore] returns bitmask from `Ctx.CHECK`
	 * @returns {Generator<[Node, any]>} yields `[node, callNodeResult]`
	 */
	*traverse(options = {}) {
		const mode = String(options?.mode ?? "dfs_pre").toLowerCase();
		const callNodeFn = typeof options?.callNode === "function" ? options.callNode : null;
		const checkNodeFn = typeof options?.ignore?.checkNode === "function" ? options.ignore.checkNode : null;
		const CHECK = Ctx.CHECK;

		const fromNode = this.getNode(options?.from ?? null);
		if (!fromNode) return;

		const includeFrom = options?.includeFrom !== false;
		const start = includeFrom ? [fromNode.id] : fromNode.childIds.slice();
		if (start.length <= 0) return;

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

		const pushDfsChildren = (stack, node) => {
			for (let i = node.childIds.length - 1; i >= 0; i--) {
				stack.push({
					id: node.childIds[i],
					phase: "enter",
				});
			}
		};

		const pushBfsChildren = (queue, node) => {
			for (let i = 0; i < node.childIds.length; i++) {
				queue.push(node.childIds[i]);
			}
		};

		if (mode === "bfs") {
			const q = start.slice();
			while (q.length > 0) {
				const id = q.shift();
				const node = this.#nodes.get(id);
				if (!node) continue;
				const visit = inspectNode(node);
				yield* yieldNode(node, visit);
				if (visit.flags & CHECK.TERMINATE) return;
				if (visit.flags & CHECK.BREAK_BRANCH) continue;
				pushBfsChildren(q, node);
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
					const visit = {
						flags: cur.flags ?? 0,
						callResult: cur.callResult,
					};
					yield* yieldNode(node, visit);
					if (visit.flags & CHECK.TERMINATE) return;
					continue;
				}

				const visit = inspectNode(node);
				if (visit.flags & CHECK.TERMINATE) {
					yield* yieldNode(node, visit);
					return;
				}

				stack.push({ ...cur, phase: "exit", ...visit });
				if (visit.flags & CHECK.BREAK_BRANCH) continue;
				pushDfsChildren(stack, node);
				continue;
			}

			const visit = inspectNode(node);
			yield* yieldNode(node, visit);
			if (visit.flags & CHECK.TERMINATE) return;
			if (visit.flags & CHECK.BREAK_BRANCH) continue;
			pushDfsChildren(stack, node);
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
}

export const Atree = {
	Node,
	Ctx,
};

if (typeof window !== "undefined") {
	window.Atree = Atree;
}

export default Atree;
