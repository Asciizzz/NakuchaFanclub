import { Component } from "./component.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

export class RenderPass extends Component {
	id = null;
	cfg = null;
	lastResult = null;

	set(next = {}) {
		const src = next && typeof next === "object" ? next : {};
		if (src.id !== undefined) this.id = asId(src.id);
		if (src.passId !== undefined) this.id = asId(src.passId);
		this.cfg = { ...src };
		delete this.cfg.id;
		delete this.cfg.passId;
		return this;
	}

	usePass(id) {
		this.id = asId(id);
		return this.id;
	}

	setResult(result = null) {
		this.lastResult = result ?? null;
		return this.lastResult;
	}
}

if (typeof window !== "undefined") {
	window.WrRenderPass21 = RenderPass;
}

export default RenderPass;
