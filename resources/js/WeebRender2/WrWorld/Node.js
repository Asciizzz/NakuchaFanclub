import { Node } from "../../AzLib/Azt.js";
import {
	Component,
} from "./Components.js";

function isCompType(Type) {
	return typeof Type === "function" && (Type === Component || Type.prototype instanceof Component);
}

export class WrNode extends Node {
	components = new Map();

	addComp(Type) {
		if (!isCompType(Type)) return null;
		const existing = this.components.get(Type) ?? null;
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
		const value = this.components.get(Type) ?? null;
		if (!value) return null;
		this.components.delete(Type);
		return value;
	}
}

if (typeof window !== "undefined") {
	window.WrNode = WrNode;
}

export default WrNode;
