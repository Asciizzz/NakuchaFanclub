import { WrComponent } from "../../WrCtx/component.js";

export class Draw extends WrComponent {
	vertexCount = 0;
	instanceCount = 1;
	firstVertex = 0;
	firstInstance = 0;

	constructor(options = {}) {
		super(options);
		this.vertexCount = Math.max(0, Number(options.vertexCount ?? 0) | 0);
		this.instanceCount = Math.max(1, Number(options.instanceCount ?? 1) | 0);
		this.firstVertex = Math.max(0, Number(options.firstVertex ?? 0) | 0);
		this.firstInstance = Math.max(0, Number(options.firstInstance ?? 0) | 0);
	}

	exec(run) {
		if (!run.pass || run.passKind !== "render") {
			run.stats.skipped.noPass++;
			return;
		}
		if (!run.pipeline) {
			run.stats.skipped.noPipeline++;
			return;
		}
		run.pass.draw(this.vertexCount, this.instanceCount, this.firstVertex, this.firstInstance);
		run.stats.draws++;
	}
}

export class DrawIndexed extends WrComponent {
	indexCount = 0;
	instanceCount = 1;
	firstIndex = 0;
	baseVertex = 0;
	firstInstance = 0;

	constructor(options = {}) {
		super(options);
		this.indexCount = Math.max(0, Number(options.indexCount ?? 0) | 0);
		this.instanceCount = Math.max(1, Number(options.instanceCount ?? 1) | 0);
		this.firstIndex = Math.max(0, Number(options.firstIndex ?? 0) | 0);
		this.baseVertex = Number(options.baseVertex ?? 0) | 0;
		this.firstInstance = Math.max(0, Number(options.firstInstance ?? 0) | 0);
	}

	exec(run) {
		if (!run.pass || run.passKind !== "render") {
			run.stats.skipped.noPass++;
			return;
		}
		if (!run.pipeline) {
			run.stats.skipped.noPipeline++;
			return;
		}
		run.pass.drawIndexed(this.indexCount, this.instanceCount, this.firstIndex, this.baseVertex, this.firstInstance);
		run.stats.draws++;
	}
}

export class DrawIndirect extends WrComponent {
	buffer = null;
	offset = 0;

	constructor(options = {}) {
		super(options);
		this.buffer = options.buffer ?? null;
		this.offset = Math.max(0, Number(options.offset ?? 0) | 0);
	}

	exec(run) {
		if (!run.pass || run.passKind !== "render") {
			run.stats.skipped.noPass++;
			return;
		}
		if (!run.pipeline) {
			run.stats.skipped.noPipeline++;
			return;
		}
		const indirect = this.buffer ? { buffer: this.buffer, offset: this.offset } : run.buffers.indirect;
		if (!indirect?.buffer) {
			run.stats.skipped.noIndirectBuffer++;
			return;
		}
		run.pass.drawIndirect(indirect.buffer, indirect.offset ?? 0);
		run.stats.draws++;
	}
}

export class DrawIndexedIndirect extends WrComponent {
	buffer = null;
	offset = 0;

	constructor(options = {}) {
		super(options);
		this.buffer = options.buffer ?? null;
		this.offset = Math.max(0, Number(options.offset ?? 0) | 0);
	}

	exec(run) {
		if (!run.pass || run.passKind !== "render") {
			run.stats.skipped.noPass++;
			return;
		}
		if (!run.pipeline) {
			run.stats.skipped.noPipeline++;
			return;
		}
		const indirect = this.buffer ? { buffer: this.buffer, offset: this.offset } : run.buffers.indirect;
		if (!indirect?.buffer) {
			run.stats.skipped.noIndirectBuffer++;
			return;
		}
		run.pass.drawIndexedIndirect(indirect.buffer, indirect.offset ?? 0);
		run.stats.draws++;
	}
}
