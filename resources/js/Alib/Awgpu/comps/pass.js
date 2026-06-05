import { Component } from "../../AwDAG.js";

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

export class RenderPass extends Component {
	options = null;

	constructor(options = {}) {
		super(options);
		this.options = options ?? {};
	}

	exec(state) {
		if (!state.encoder) state.encoder = state.backend.createEncoder("Wr3Frame");
		if (!state.encoder || state.pass) return;

		const colorAttachments = hasOwn(this.options, "colorAttachments")
			? normalizeColorAttachments(this.options.colorAttachments)
			: [state.backend.getScreenColorAttachment(this.options)].filter(Boolean);
		const depthStencilAttachment = hasOwn(this.options, "depthStencilAttachment")
			? (this.options.depthStencilAttachment ?? undefined)
			: (state.backend.getDepthAttachment(this.options) ?? undefined);

		if (colorAttachments.length <= 0 && !depthStencilAttachment) return;

		state.pass = state.encoder.beginRenderPass({
			label: this.options.label,
			colorAttachments,
			depthStencilAttachment,
		});
		state.passKind = "render";
		state.pipeline = null;
	}
}

export class ComputePass extends Component {
	options = null;

	constructor(options = {}) {
		super(options);
		this.options = options ?? {};
	}

	exec(state) {
		if (!state.encoder) state.encoder = state.backend.createEncoder("Wr3Frame");
		if (!state.encoder || state.pass) return;
		state.pass = state.encoder.beginComputePass({
			label: this.options.label,
			timestampWrites: this.options.timestampWrites,
		});
		state.passKind = "compute";
		state.pipeline = null;
	}
}

export class EndPass extends Component {
	exec(state) {
		if (!state.pass) return;
		state.pass.end();
		state.pass = null;
		state.passKind = null;
		state.pipeline = null;
	}
}


