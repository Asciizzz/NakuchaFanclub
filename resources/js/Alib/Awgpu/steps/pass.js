import { Afstep } from "../../Aflow.js";

/**
 * Begins a render pass for drawing operations
 * 
 * @param {string} [data.label] - Optional label for debugging
 * @param {Array<GPURenderPassColorAttachment>} [data.colorAttachments] - Color attachments
 * @param {GPURenderPassDepthStencilAttachment} [data.depthStencilAttachment] - Depth/stencil attachment
 */
export class RenderPass extends Afstep {
	constructor(data = {}) {
		super();
		this.data = data;
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.encoder) ctx.encoder = ctx.device.createCommandEncoder({ label: "AwgpuRenderFrame" });
		if (!ctx.encoder || ctx.pass) return;

		if (ctx.pass) {
			ctx.diag?.warn("RenderPass", "A pass is already active - ending it before starting a new one.");

			ctx.pass.end();
			ctx.pass = null;
			ctx.passKind = null;
			ctx.pipeline = null;
		}

		const colorAttachments = this.data.colorAttachments ?? undefined;
		const depthStencilAttachment = this.data.depthStencilAttachment ?? undefined;

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

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.encoder) ctx.encoder = ctx.device.createCommandEncoder({ label: "AwgpuComputeFrame" });
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
	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass) return;
		ctx.pass.end();
		ctx.pass = null;
		ctx.passKind = null;
		ctx.pipeline = null;
	}
}