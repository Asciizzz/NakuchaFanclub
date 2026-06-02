import { wrHashText, wrHashValue } from "./hash.js";

function normalizeColor(value) {
	const src = (Array.isArray(value) || ArrayBuffer.isView(value)) ? value : [0, 0, 0, 0];
	return [
		Number(src[0] ?? 0) || 0,
		Number(src[1] ?? 0) || 0,
		Number(src[2] ?? 0) || 0,
		Number(src[3] ?? 0) || 0,
	];
}

function normalizeTarget(value) {
	if (typeof value === "string") return { type: value.trim() || "screen" };
	const src = value && typeof value === "object" ? value : {};
	return {
		type: String(src.type ?? "screen"),
		color: src.color ?? null,
		depth: src.depth ?? null,
		width: src.width ?? null,
		height: src.height ?? null,
		format: src.format ?? null,
	};
}

export class WrRenderPass {
	hash = "";
	target = { type: "screen" };
	clearColor = [0, 0, 0, 0];
	clearColorEnabled = true;
	clearDepth = 1;
	clearDepthEnabled = true;
	useDepth = true;
	sampleCount = null;
	traverseMode = "bfs";
	batchMode = "shader";

	constructor(options = {}) {
		this.set(options);
	}

	static from(value = {}) {
		if (value instanceof WrRenderPass) return value;
		return new WrRenderPass(value);
	}

	set(next = {}) {
		const src = next && typeof next === "object" ? next : {};
		if (src.target !== undefined) this.target = normalizeTarget(src.target);
		if (src.clearColor !== undefined) this.clearColor = normalizeColor(src.clearColor);
		if (src.clearColorEnabled !== undefined) this.clearColorEnabled = !!src.clearColorEnabled;
		if (src.clearDepth !== undefined) this.clearDepth = Number(src.clearDepth) || 0;
		if (src.clearDepthEnabled !== undefined) this.clearDepthEnabled = !!src.clearDepthEnabled;
		if (src.useDepth !== undefined) this.useDepth = !!src.useDepth;
		if (src.sampleCount !== undefined) this.sampleCount = src.sampleCount == null ? null : Math.max(1, Number(src.sampleCount) || 1);
		if (src.traverseMode !== undefined) this.traverseMode = String(src.traverseMode || "bfs").toLowerCase();
		if (src.batchMode !== undefined) this.batchMode = String(src.batchMode || "shader").toLowerCase();
		this.updateHash();
		return this;
	}

	updateHash() {
		this.hash = `pass_${wrHashText([
			wrHashValue(this.target),
			wrHashValue(this.clearColor),
			this.clearColorEnabled ? 1 : 0,
			this.clearDepth,
			this.clearDepthEnabled ? 1 : 0,
			this.useDepth ? 1 : 0,
			this.sampleCount ?? "",
			this.traverseMode,
			this.batchMode,
		].join("|"))}`;
		return this.hash;
	}

	toFrameOptions() {
		return {
			clearColor: this.clearColor,
			clearColorEnabled: this.clearColorEnabled,
			clearDepth: this.clearDepth,
			clearDepthEnabled: this.clearDepthEnabled,
			useDepth: this.useDepth,
			sampleCount: this.sampleCount,
			traverseMode: this.traverseMode,
			batchMode: this.batchMode,
		};
	}
}

if (typeof window !== "undefined") {
	window.WrRenderPassAsset21 = WrRenderPass;
}

export default WrRenderPass;
