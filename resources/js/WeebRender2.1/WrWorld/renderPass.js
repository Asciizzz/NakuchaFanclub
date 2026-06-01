import { Component } from "./component.js";

function normalizeColor(value) {
	const src = (Array.isArray(value) || ArrayBuffer.isView(value)) ? value : [0, 0, 0, 0];
	return [
		Number(src[0] ?? 0) || 0,
		Number(src[1] ?? 0) || 0,
		Number(src[2] ?? 0) || 0,
		Number(src[3] ?? 0) || 0,
	];
}

export class RenderPass extends Component {
	cfg = {
		clearColor: [0, 0, 0, 0],
		clearColorEnabled: true,
		clearDepth: 1,
		clearDepthEnabled: true,
		useDepth: true,
	};
	lastResult = null;

	set(next = {}) {
		const src = next && typeof next === "object" ? next : {};
		if (src.clearColor !== undefined) this.cfg.clearColor = normalizeColor(src.clearColor);
		if (src.clearColorEnabled !== undefined) this.cfg.clearColorEnabled = !!src.clearColorEnabled;
		if (src.clearDepth !== undefined) this.cfg.clearDepth = Number(src.clearDepth) || 0;
		if (src.clearDepthEnabled !== undefined) this.cfg.clearDepthEnabled = !!src.clearDepthEnabled;
		if (src.useDepth !== undefined) this.cfg.useDepth = !!src.useDepth;
		return this.cfg;
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
