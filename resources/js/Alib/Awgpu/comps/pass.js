import { Afcmd } from "../../Aflow.js";

function hasOwn(obj, key) {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

function toNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function toColor(value) {
	const src = (Array.isArray(value) || ArrayBuffer.isView(value)) ? value : null;
	if (!src) return value;
	return {
		r: toNumber(src[0], 0),
		g: toNumber(src[1], 0),
		b: toNumber(src[2], 0),
		a: toNumber(src[3], 1),
	};
}

function normalizeColorAttachments(value) {
	const list = Array.isArray(value) ? value : [];
	return list.map((attachment) => {
		if (!attachment || typeof attachment !== "object") return attachment;
		if (!Array.isArray(attachment.clearValue) && !ArrayBuffer.isView(attachment.clearValue)) return attachment;
		return {
			...attachment,
			clearValue: toColor(attachment.clearValue),
		};
	});
}

export class RenderPass extends Afcmd {
	constructor() { super(); }

	exec({ state, graph, link } = {}) {
		if (!state.encoder) state.encoder = state.backend.createEncoder("Wr3Frame");
		if (!state.encoder || state.pass) return;

		const colorAttachments = hasOwn(this.data, "colorAttachments")
			? normalizeColorAttachments(this.data.colorAttachments)
			: [state.backend.getScreenColorAttachment(this.data, state)].filter(Boolean);
		const depthStencilAttachment = hasOwn(this.data, "depthStencilAttachment")
			? (this.data.depthStencilAttachment ?? undefined)
			: (state.backend.getDepthAttachment(this.data) ?? undefined);

		if (colorAttachments.length <= 0 && !depthStencilAttachment) return;

		state.pass = state.encoder.beginRenderPass({
			label: this.data.label,
			colorAttachments,
			depthStencilAttachment,
		});
		state.passKind = "render";
		state.pipeline = null;
	}
}

export class ComputePass extends Afcmd {
	constructor() { super(); }

	exec({ state, graph, link } = {}) {
		if (!state.encoder) state.encoder = state.backend.createEncoder("Wr3Frame");
		if (!state.encoder || state.pass) return;
		state.pass = state.encoder.beginComputePass({
			label: this.data.label,
			timestampWrites: this.data.timestampWrites,
		});
		state.passKind = "compute";
		state.pipeline = null;
	}
}

export class EndPass extends Afcmd {
	constructor() { super(); }

	exec({ state, graph, link } = {}) {
		if (!state.pass) return;
		state.pass.end();
		state.pass = null;
		state.passKind = null;
		state.pipeline = null;
	}
}
