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
}

export { WrComponent };

if (typeof window !== "undefined") {
	window.WrCtx3 = WrCtx;
	window.WrNode3 = WrNode;
	window.WrComponent3 = WrComponent;
}

export default WrCtx;
