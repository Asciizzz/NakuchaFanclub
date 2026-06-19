import { Afstep } from "../../Aflow.js";

/**
 * Creates and begins a new command encoder for the current frame
 * Called at the start of a render frame to initialize command recording
 *
 * @param {string} [label] - Optional label for the encoder (default: "AwgpuFrame")
 */
export class BeginFrame extends Afstep {
	constructor(label = "AwgpuFrame") {
		super();
		this.label = label;
	}

	exec({ ctx, graph, diag } = {}) {
		if (ctx.encoder) return;
		ctx.encoder = ctx.device.createCommandEncoder({ label: this.label });
		ctx.ended = false;
	}
}

/**
 * Submits the accumulated command encoder to the GPU and ends the frame
 * Should be called at the end of a render frame after all passes and commands are recorded
 *
 * No constructor parameters required
 */
export class EndFrame extends Afstep {
	exec({ ctx, graph, diag } = {}) {
		if (ctx.encoder && !ctx.ended) {
			// Submit directly to queue
			ctx.queue.submit([ctx.encoder.finish()]);
			ctx.ended = true;
		}
	}
}

