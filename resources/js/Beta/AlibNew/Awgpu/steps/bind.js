import { Afstep } from "../../Aflow.js";

/**
 * Sets one or more bind groups on the active pass
 *
 * @param {Array<Object>} groups - Array of bind group entries
 * @param {number} [groups[].index] - Slot index for the bind group (default: 0)
 * @param {GPUBindGroup} [groups[].bindGroup] - The bind group to set
 * @param {Iterable<number>} [groups[].offsets] - Dynamic offsets for the bind group
 */
export class SetBindGroups extends Afstep {
	groups = [];

	constructor(groups = []) {
		super();
		this.groups = Array.isArray(groups) ? groups.slice() : [];
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass) return;
		for (const entry of this.groups) {
			const index = Math.max(0, Number(entry?.index ?? 0) | 0);
			const bindGroup = entry?.bindGroup ?? null;
			if (!bindGroup) continue;
			const offsets = entry?.offsets;
			if (offsets) ctx.pass.setBindGroup(index, bindGroup, offsets);
			else ctx.pass.setBindGroup(index, bindGroup);
			ctx.bindGroups.set(index, { bindGroup, offsets: offsets ?? null });
		}
	}
}

