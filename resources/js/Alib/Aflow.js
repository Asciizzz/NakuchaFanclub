/* Aflow
By Asciiz

An ECS-like extension of Adag that focuses on execution flow

Utilizes Render-As-A-Component (RAAC, shi that I thought of lmao)
where execution policies are defined by components

*/

import { Ctx as BaseCtx, Node as BaseNode } from "./Adag.js";

function isComp(value) {
	return value && typeof value === "object";
}

export class Component {
	constructor(options = {}) {
		this.options = options ?? {};
	}

	/**
	 * Execute component logic during Ctx.exec
	 * @param {object} _input execution input
	 * @param {object} _input.state mutable execution state
	 * @param {Node} _input.node node that owns this component
	 * @param {Ctx} _input.ctx execution context
	 */
	exec({ state: _state, node: _node, ctx: _ctx } = {}) {}

	/**
	 * Clean up external resources before removal
	 * @param {object} _input destroy input
	 * @param {Node} _input.node node that owned this component
	 * @param {Ctx} _input.ctx owning context
	 */
	destroy({ node: _node, ctx: _ctx } = {}) {}
}

export class Node extends BaseNode {
	#components = [];

	get components() { return this.#components.slice(); }

	/**
	 * Add a component object to this node
	 * @param {object} comp component instance
	 * @returns {object|null}
	 */
	addComp(comp) {
		if (!isComp(comp)) return null;
		this.#components.push(comp);
		return comp;
	}

	/**
	 * Remove the exact component instance from this node
	 * @param {object} comp component instance
	 * @returns {boolean}
	 */
	removeComp(comp) {
		const index = this.#components.indexOf(comp);
		if (index < 0) return false;
		const [removed] = this.#components.splice(index, 1);
		if (removed && typeof removed.destroy === "function") removed.destroy({ node: this, ctx: this.ctx });
		return true;
	}

	/**
	 * Remove all component instances from this node
	 * @returns {object[]}
	 */
	clearComp() {
		const out = this.#components.splice(0);
		for (const comp of out) {
			if (comp && typeof comp.destroy === "function") comp.destroy({ node: this, ctx: this.ctx });
		}
		return out;
	}
}

export class Ctx extends BaseCtx {
	createNode(id) {
		return new Node(id);
	}

	/**
	 * Execute components while walking from a node
	 * @param {object} input execution input
	 * @param {string|Node|{id:string}} input.from start node reference
	 * @param {object} input.state mutable execution state
	 * @param {boolean} [input.fromInclude=true] include the start node
	 * @param {"dfs"|"dfs_pre"|"dfs_post"|"bfs"} [input.mode="dfs_pre"] walk mode
	 * @param {boolean} [input.dedupe=false] yield shared nodes once
	 * @param {(node: Node, ctx: Ctx) => boolean} [input.prune] return true to skip a branch
	 * @returns {Generator<{node: Node, comp: object, result: any}>}
	 */
	*execEach({
		from = null,
		state = null,
		fromInclude = true,
		mode = "dfs_pre",
		dedupe = false,
		prune = null,
	} = {}) {
		if (!state) return state;

		const node = this.getNode(from);
		if (!node) return state;

		for (const current of this.walk({ from: node, fromInclude, mode, dedupe, prune })) {
			for (const comp of current.components ?? []) {
				if (!comp || comp.enabled === false) continue;
				if (typeof comp.exec !== "function") continue;
				const result = comp.exec({ state, node: current, ctx: this });
				yield { node: current, comp, result };
			}
		}
	}

	/**
	 * Execute components and return the mutated state
	 * @param {object} input execution input
	 * @param {string|Node|{id:string}} input.from start node reference
	 * @param {object} input.state mutable execution state
	 * @param {boolean} [input.fromInclude=true] include the start node
	 * @param {"dfs"|"dfs_pre"|"dfs_post"|"bfs"} [input.mode="dfs_pre"] walk mode
	 * @param {boolean} [input.dedupe=false] yield shared nodes once
	 * @param {(node: Node, ctx: Ctx) => boolean} [input.prune] return true to skip a branch
	 * @returns {object}
	 */
	exec(input = {}) {
		for (const _event of this.execEach(input)) {}
		return input?.state ?? null;
	}

	/**
	 * Copy a reachable DAG branch and attach the copy to one parent
	 * @param {string|Node|{id:string}} from source node reference
	 * @param {string|Node|{id:string}|null} [parent=null] parent for copied root
	 * @param {number} [index=-1] insert index
	 * @returns {Node|null}
	 */
	copyBranch(from, parent = null, index = -1) {
		const source = this.getNode(from);
		if (!source) return null;
		const parentNode = parent == null ? null : this.getNode(parent);
		if (parent != null && !parentNode) return null;

		const sourceIds = this.#collectReachable(source.id);
		const map = new Map();

		for (const sourceId of sourceIds) {
			const next = this.newNode();
			if (!next) return null;
			const src = this.getNode(sourceId);
			map.set(sourceId, next);
			this.#copyNodeData(src, next);
		}

		for (const sourceId of sourceIds) {
			const src = this.getNode(sourceId);
			const copy = map.get(sourceId);
			if (!src || !copy) continue;
			for (const childId of src.childIds) {
				const childCopy = map.get(childId);
				if (childCopy) this.link(copy, childCopy);
			}
		}

		const rootCopy = map.get(source.id) ?? null;
		if (rootCopy && parentNode) this.link(parentNode, rootCopy, index);
		return rootCopy;
	}

	#copyNodeData(source, target) {
		target.clearComp();
		for (const comp of source.components ?? []) {
			let next = comp;
			if (comp && typeof comp.copy === "function") next = comp.copy();
			else if (comp && typeof comp.clone === "function") next = comp.clone();
			else if (comp && typeof comp === "object") {
				next = Object.create(Object.getPrototypeOf(comp));
				for (const key of Reflect.ownKeys(comp)) {
					if (key === "node") continue;
					next[key] = comp[key];
				}
			}
			target.addComp(next);
		}
	}

	#collectReachable(fromId) {
		const out = [];
		const seen = new Set();
		const stack = [fromId];
		while (stack.length > 0) {
			const id = stack.pop();
			if (seen.has(id)) continue;
			const node = this.getNode(id);
			if (!node) continue;
			seen.add(id);
			out.push(id);
			for (let i = node.childIds.length - 1; i >= 0; i--) {
				stack.push(node.childIds[i]);
			}
		}
		return out;
	}
}

export const Aflow = {
	Component,
	Node,
	Ctx,
};

if (typeof window !== "undefined") {
	window.Aflow = Aflow;
}

export default Aflow;
