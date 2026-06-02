import { Component } from "./component.js";

export class RenderPass extends Component {
	pass = null;
	cfg = null;
	lastResult = null;

	set(next = {}) {
		const src = next && typeof next === "object" ? next : {};
		if (src.pass !== undefined) this.pass = src.pass ?? null;
		this.cfg = { ...src };
		delete this.cfg.pass;
		return this;
	}

	usePass(pass) {
		this.pass = pass && typeof pass === "object" ? pass : null;
		return this.pass;
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
