import { AfCmd } from "../../Aflow.js";

export class SetBindGroups extends AfCmd {
	groups = [];

	constructor(groups = [], data = {}) {
		super(data);
		this.groups = Array.isArray(groups) ? groups.slice() : [];
	}

	exec({ state, graph, link } = {}) {
		if (!state.pass) return;
		for (const entry of this.groups) {
			const index = Math.max(0, Number(entry?.index ?? entry?.group ?? 0) | 0);
			const bindGroup = entry?.bindGroup ?? entry?.groupRef ?? null;
			if (!bindGroup) continue;
			const offsets = entry?.offsets ?? entry?.dynamicOffsets;
			if (offsets) state.pass.setBindGroup(index, bindGroup, offsets);
			else state.pass.setBindGroup(index, bindGroup);
			state.bindGroups.set(index, { bindGroup, offsets: offsets ?? null });
		}
	}
}

