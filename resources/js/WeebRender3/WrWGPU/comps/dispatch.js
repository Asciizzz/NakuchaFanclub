import { WrComponent } from "../../WrCtx/component.js";

function uint(value, fallback = 1) {
	return Math.max(1, Number(value ?? fallback) | 0);
}

export class Dispatch extends WrComponent {
	x = 1;
	y = 1;
	z = 1;

	constructor(options = {}) {
		super(options);
		this.x = uint(options.x);
		this.y = uint(options.y);
		this.z = uint(options.z);
	}

	exec(run) {
		if (!run.pass || run.passKind !== "compute") {
			run.stats.skipped.noPass++;
			return;
		}
		if (!run.pipeline) {
			run.stats.skipped.noPipeline++;
			return;
		}
		run.pass.dispatchWorkgroups(this.x, this.y, this.z);
		run.stats.dispatches++;
	}
}

export class DispatchIndirect extends WrComponent {
	buffer = null;
	offset = 0;

	constructor(options = {}) {
		super(options);
		this.buffer = options.buffer ?? null;
		this.offset = Math.max(0, Number(options.offset ?? 0) | 0);
	}

	exec(run) {
		if (!run.pass || run.passKind !== "compute") {
			run.stats.skipped.noPass++;
			return;
		}
		if (!run.pipeline) {
			run.stats.skipped.noPipeline++;
			return;
		}
		if (!this.buffer) {
			run.stats.skipped.noIndirectBuffer++;
			return;
		}
		run.pass.dispatchWorkgroupsIndirect(this.buffer, this.offset);
		run.stats.dispatches++;
	}
}
