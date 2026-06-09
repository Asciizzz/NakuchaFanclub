import { Afstep } from "../../Aflow.js";

function uint(value, fallback = 1) {
	return Math.max(1, Number(value ?? fallback) | 0);
}

export class Dispatch extends Afstep {
	x = 1;
	y = 1;
	z = 1;

	constructor(data = {}) {
		super();
		this.x = uint(data.x);
		this.y = uint(data.y);
		this.z = uint(data.z);
	}

	exec({ state, graph, link } = {}) {
		if (!state.pass || state.passKind !== "compute") return;
		if (!state.pipeline) return;
		state.pass.dispatchWorkgroups(this.x, this.y, this.z);
	}
}

export class DispatchIndirect extends Afstep {
	buffer = null;
	offset = 0;

	constructor(data = {}) {
		super();
		this.buffer = data.buffer ?? null;
		this.offset = Math.max(0, Number(data.offset ?? 0) | 0);
	}

	exec({ state, graph, link } = {}) {
		if (!state.pass || state.passKind !== "compute") return;
		if (!state.pipeline || !this.buffer) return;
		state.pass.dispatchWorkgroupsIndirect(this.buffer, this.offset);
	}
}

