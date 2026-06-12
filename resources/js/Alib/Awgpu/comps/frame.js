import { Afstep } from "../../Aflow.js";

export class BeginFrame extends Afstep {
	constructor(label = "AwgpuFrame") {
		super();
		this.label = label;
	}

	exec({ ctx, graph } = {}) {
		if (ctx.encoder) return;
		ctx.encoder = ctx.backend.createEncoder(this.label);
		ctx.ended = false;
	}
}

export class EndFrame extends Afstep {
	exec({ ctx, graph } = {}) {
		if (ctx.encoder && !ctx.ended) {
			ctx.backend.submit(ctx.encoder);
			ctx.ended = true;
		}
	}
}

