import { WrComponent } from "../../WrCtx/component.js";

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

export class RenderPass extends WrComponent {
	options = null;

	constructor(options = {}) {
		super(options);
		this.options = options ?? {};
	}

	exec(run) {
		if (!run.encoder) run.encoder = run.backend.createEncoder("Wr3Frame");
		if (!run.encoder) return;
		if (run.pass) run.pass.end();

		const colorAttachments = hasOwn(this.options, "colorAttachments")
			? normalizeColorAttachments(this.options.colorAttachments)
			: [run.backend.getScreenColorAttachment(this.options)].filter(Boolean);
		const depthStencilAttachment = hasOwn(this.options, "depthStencilAttachment")
			? (this.options.depthStencilAttachment ?? undefined)
			: (run.backend.getDepthAttachment(this.options) ?? undefined);

		if (colorAttachments.length <= 0 && !depthStencilAttachment) return;

		run.pass = run.encoder.beginRenderPass({
			label: this.options.label,
			colorAttachments,
			depthStencilAttachment,
		});
		run.passKind = "render";
		run.pipeline = null;
	}
}

export class ComputePass extends WrComponent {
	options = null;

	constructor(options = {}) {
		super(options);
		this.options = options ?? {};
	}

	exec(run) {
		if (!run.encoder) run.encoder = run.backend.createEncoder("Wr3Frame");
		if (!run.encoder) return;
		if (run.pass) run.pass.end();
		run.pass = run.encoder.beginComputePass({
			label: this.options.label,
			timestampWrites: this.options.timestampWrites,
		});
		run.passKind = "compute";
		run.pipeline = null;
	}
}

export class EndPass extends WrComponent {
	exec(run) {
		if (!run.pass) return;
		run.pass.end();
		run.pass = null;
		run.passKind = null;
		run.pipeline = null;
	}
}
