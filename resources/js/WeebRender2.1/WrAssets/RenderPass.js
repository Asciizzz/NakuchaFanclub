function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

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
		color: asId(src.color),
		depth: asId(src.depth),
		width: src.width ?? null,
		height: src.height ?? null,
		format: src.format ?? null,
	};
}

export class WrRenderPass {
	id = null;
	target = { type: "screen" };
	clearColor = [0, 0, 0, 0];
	clearColorEnabled = true;
	clearDepth = 1;
	clearDepthEnabled = true;
	useDepth = true;
	sampleCount = null;

	constructor(options = {}) {
		this.set(options);
	}

	static from(value = {}) {
		if (value instanceof WrRenderPass) return value;
		return new WrRenderPass(value);
	}

	set(next = {}) {
		const src = next && typeof next === "object" ? next : {};
		if (src.id !== undefined) this.id = asId(src.id);
		if (src.target !== undefined) this.target = normalizeTarget(src.target);
		if (src.clearColor !== undefined) this.clearColor = normalizeColor(src.clearColor);
		if (src.clearColorEnabled !== undefined) this.clearColorEnabled = !!src.clearColorEnabled;
		if (src.clearDepth !== undefined) this.clearDepth = Number(src.clearDepth) || 0;
		if (src.clearDepthEnabled !== undefined) this.clearDepthEnabled = !!src.clearDepthEnabled;
		if (src.useDepth !== undefined) this.useDepth = !!src.useDepth;
		if (src.sampleCount !== undefined) this.sampleCount = src.sampleCount == null ? null : Math.max(1, Number(src.sampleCount) || 1);
		return this;
	}

	toFrameOptions() {
		return {
			clearColor: this.clearColor,
			clearColorEnabled: this.clearColorEnabled,
			clearDepth: this.clearDepth,
			clearDepthEnabled: this.clearDepthEnabled,
			useDepth: this.useDepth,
			sampleCount: this.sampleCount,
		};
	}
}

if (typeof window !== "undefined") {
	window.WrRenderPassAsset21 = WrRenderPass;
}

export default WrRenderPass;
