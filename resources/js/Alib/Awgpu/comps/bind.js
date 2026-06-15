import { Afstep } from "../../Aflow.js";

export class SetBindGroups extends Afstep {
	groups = [];

	constructor(groups = []) {
		super();
		this.groups = Array.isArray(groups) ? groups.slice() : [];
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass) return;
		for (const entry of this.groups) {
			const index = Math.max(0, Number(entry?.index ?? entry?.group ?? 0) | 0);
			const bindGroup = entry?.bindGroup ?? entry?.groupRef ?? null;
			if (!bindGroup) continue;
			const offsets = entry?.offsets ?? entry?.dynamicOffsets;
			if (offsets) ctx.pass.setBindGroup(index, bindGroup, offsets);
			else ctx.pass.setBindGroup(index, bindGroup);
			ctx.bindGroups.set(index, { bindGroup, offsets: offsets ?? null });
		}
	}
}

