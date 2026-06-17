import { Afstep } from "../../Aflow.js";

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

export class RenderPass extends Afstep {
	constructor(data = {}) {
		super();
		this.data = data;
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.encoder) ctx.encoder = ctx.backend.createEncoder("Wr3Frame");
		if (!ctx.encoder || ctx.pass) return;

		const colorAttachments = hasOwn(this.data, "colorAttachments")
			? normalizeColorAttachments(this.data.colorAttachments)
			: [ctx.backend.getScreenColorAttachment(this.data, ctx)].filter(Boolean);
		const depthStencilAttachment = hasOwn(this.data, "depthStencilAttachment")
			? (this.data.depthStencilAttachment ?? undefined)
			: (ctx.backend.getDepthAttachment(this.data) ?? undefined);

		if (colorAttachments.length <= 0 && !depthStencilAttachment) return;

		ctx.pass = ctx.encoder.beginRenderPass({
			label: this.data.label,
			colorAttachments,
			depthStencilAttachment,
		});
		ctx.passKind = "render";
		ctx.pipeline = null;
	}
}

export class ComputePass extends Afstep {
	constructor(data = {}) {
		super();
		this.data = data;
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.encoder) ctx.encoder = ctx.backend.createEncoder("Wr3Frame");
		if (!ctx.encoder || ctx.pass) return;
		ctx.pass = ctx.encoder.beginComputePass({
			label: this.data.label,
			timestampWrites: this.data.timestampWrites,
		});
		ctx.passKind = "compute";
		ctx.pipeline = null;
	}
}

export class EndPass extends Afstep {
	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass) return;
		ctx.pass.end();
		ctx.pass = null;
		ctx.passKind = null;
		ctx.pipeline = null;
	}
}
