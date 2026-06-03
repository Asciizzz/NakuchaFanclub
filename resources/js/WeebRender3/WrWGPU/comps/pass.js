import { WrComponent } from "../../WrCtx/component.js";

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
		const color = run.backend.getScreenColorAttachment(this.options);
		if (!color) return;
		const depth = run.backend.getDepthAttachment(this.options);
		run.pass = run.encoder.beginRenderPass({
			label: this.options.label,
			colorAttachments: [color],
			depthStencilAttachment: depth ?? undefined,
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
