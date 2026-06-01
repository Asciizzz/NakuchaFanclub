export class Component {
	node = null;

	constructor(node = null) {
		this.node = node ?? null;
	}

	get world() {
		return this.node?.ctx ?? null;
	}

	reset() {
		for (const key of Object.keys(this)) {
			if (key === "node") continue;
			delete this[key];
		}
		return this;
	}

	destroy() {
		if (!this.node) return null;
		return this.node.removeComp(this.constructor);
	}
}

if (typeof window !== "undefined") {
	window.WrComponent21 = Component;
}

export default Component;
