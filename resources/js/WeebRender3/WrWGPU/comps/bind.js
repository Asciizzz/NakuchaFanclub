import { WrComponent } from "../../WrCtx/component.js";

export class SetBindGroups extends WrComponent {
	groups = [];

	constructor(groups = [], options = {}) {
		super(options);
		this.groups = Array.isArray(groups) ? groups.slice() : [];
	}

	exec(run) {
		if (!run.pass) {
			run.stats.skipped.noPass++;
			return;
		}
		for (const entry of this.groups) {
			const index = Math.max(0, Number(entry?.index ?? entry?.group ?? 0) | 0);
			const bindGroup = entry?.bindGroup ?? entry?.groupRef ?? null;
			if (!bindGroup) continue;
			const offsets = entry?.offsets ?? entry?.dynamicOffsets;
			if (offsets) run.pass.setBindGroup(index, bindGroup, offsets);
			else run.pass.setBindGroup(index, bindGroup);
			run.bindGroups.set(index, { bindGroup, offsets: offsets ?? null });
		}
	}
}
