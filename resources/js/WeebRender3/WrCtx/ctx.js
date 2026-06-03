import { Ctx, Node } from "../../AzLib/AzDAG.js";
import { WrComponent } from "./component.js";

function isComp(value) {
	return value && typeof value === "object";
}

export class WrNode extends Node {
	components = [];

	addComp(comp) {
		if (!isComp(comp)) return null;
		if (comp.node && comp.node !== this) return null;
		comp.node = this;
		this.components.push(comp);
		return comp;
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

export class WrCtx extends Ctx {
	createNode(id) {
		return new WrNode(this, id);
	}

	copyBranch(from, parent = null, index = -1) {
		const source = this.getNode(from);
		if (!source) return null;
		const parentNode = parent == null ? null : this.getNode(parent);
		if (parent != null && !parentNode) return null;

		const sourceIds = this.#collectReachable(source.id);
		const map = new Map();

		for (const sourceId of sourceIds) {
			const next = this.addNode();
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
		target.components.length = 0;
		for (const comp of source.components ?? []) {
			let next = comp;
			if (comp && typeof comp.copy === "function") next = comp.copy(target);
			else if (comp && typeof comp.clone === "function") next = comp.clone(target);
			else if (comp && typeof comp === "object") {
				next = Object.create(Object.getPrototypeOf(comp));
				Object.assign(next, comp);
			}
			if (next && typeof next === "object") next.node = target;
			target.components.push(next);
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

export { WrComponent };

if (typeof window !== "undefined") {
	window.WrCtx3 = WrCtx;
	window.WrNode3 = WrNode;
	window.WrComponent3 = WrComponent;
}

export default WrCtx;
