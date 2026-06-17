import { Afstep } from "../../Aflow.js";

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

/**
 * Begins a render pass for drawing operations
 *
 * @param {Object} data - Configuration object
 * @param {Array<GPURenderPassColorAttachment>} [data.colorAttachments] - Color attachments; if omitted, uses screen color attachment
 * @param {GPURenderPassDepthStencilAttachment} [data.depthStencilAttachment] - Depth/stencil attachment; if omitted, uses default depth attachment
 * @param {string} [data.label] - Optional label for debugging
 */
export class RenderPass extends Afstep {
	constructor(data = {}) {
		super();
		this.data = data;
	}

	/**
	 * Static helper: creates screen color attachment from canvas
	 */
	static createScreenColorAttachment(ctx, options = {}) {
		const screenTexture = ctx.canvasContext.getCurrentTexture();
		return {
			view: screenTexture.createView(),
			clearValue: toColor(options.clearColor ?? [0, 0, 0, 1]),
			loadOp: options.clearColorEnabled === false ? "load" : "clear",
			storeOp: options.storeOp ?? "store",
		};
	}

	/**
	 * Static helper: creates color attachments from custom or screen default
	 */
	static createColorAttachments(ctx, customAttachments, defaultOptions = {}) {
		if (Array.isArray(customAttachments)) {
			return normalizeColorAttachments(customAttachments);
		}
		return [RenderPass.createScreenColorAttachment(ctx, defaultOptions)];
	}

	/**
	 * Static helper: passthrough for depth attachment.
	 * Unlike createColorAttachments, this does NOT provision a default depth
	 * texture/view when omitted — callers must build and supply a real
	 * GPURenderPassDepthStencilAttachment (with a `view`) themselves, or the
	 * pass runs with no depth attachment at all.
	 */
	static createDepthAttachment(customAttachment) {
		return customAttachment ?? undefined;
	}

	exec({ ctx, graph } = {}) {
		if (!ctx.encoder) ctx.encoder = ctx.device.createCommandEncoder({ label: "RenderFrame" });
		if (!ctx.encoder || ctx.pass) return;

		const colorAttachments = RenderPass.createColorAttachments(ctx, this.data.colorAttachments, this.data);
		const depthStencilAttachment = RenderPass.createDepthAttachment(this.data.depthStencilAttachment);

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

/**
 * Begins a compute pass for compute shader operations
 *
 * @param {Object} data - Configuration object
 * @param {string} [data.label] - Optional label for debugging
 * @param {GPUComputePassTimestampWrites} [data.timestampWrites] - Optional timestamp writes configuration
 */
export class ComputePass extends Afstep {
	constructor(data = {}) {
		super();
		this.data = data;
	}

	exec({ ctx, graph } = {}) {
		if (!ctx.encoder) ctx.encoder = ctx.device.createCommandEncoder({ label: "ComputeFrame" });
		if (!ctx.encoder || ctx.pass) return;
		ctx.pass = ctx.encoder.beginComputePass({
			label: this.data.label,
			timestampWrites: this.data.timestampWrites,
		});
		ctx.passKind = "compute";
		ctx.pipeline = null;
	}
}

/**
 * Ends the current render or compute pass
 * No constructor parameters required
 */
export class EndPass extends Afstep {
	exec({ ctx, graph } = {}) {
		if (!ctx.pass) return;
		ctx.pass.end();
		ctx.pass = null;
		ctx.passKind = null;
		ctx.pipeline = null;
	}
}