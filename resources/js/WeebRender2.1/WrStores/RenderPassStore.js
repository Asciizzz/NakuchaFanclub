import AzStore from "../../AzLib/AzStore.js";
import { WrRenderPass } from "../WrAssets/RenderPass.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

export class WrRenderPassStore extends AzStore {
	add(pass) {
		const value = pass instanceof WrRenderPass ? pass : WrRenderPass.from(pass ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			value.id = explicitId;
			return explicitId;
		}

		const id = super.add(value);
		value.id = id;
		return id;
	}
}

if (typeof window !== "undefined") {
	window.WrRenderPassStore21 = WrRenderPassStore;
}

export default WrRenderPassStore;
