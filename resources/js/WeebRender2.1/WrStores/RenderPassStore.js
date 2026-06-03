import WrStore from "../WrStore.js";
import { WrRenderPass } from "../WrAssets/RenderPass.js";

function asId(value) {
	if (value && typeof value === "object") return asId(value.ref?.id ?? value.id ?? value.hash);
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

function stampRef(store, asset, id) {
	asset.ref = { stores: store.stores ?? null, store, id };
	return asset;
}

export class WrRenderPassStore extends WrStore {
	add(pass) {
		const explicitId = asId(pass?.ref?.id ?? pass?.id);
		const value = pass instanceof WrRenderPass ? pass : WrRenderPass.from(pass ?? {});
		const preferredId = explicitId ?? asId(value.hash);
		if (preferredId && !this.has(preferredId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== preferredId) this.map.delete(autoId);
			this.map.set(preferredId, value);
			return stampRef(this, value, preferredId);
		}

		const id = super.add(value);
		return stampRef(this, value, id);
	}
}

if (typeof window !== "undefined") {
	window.WrRenderPassStore21 = WrRenderPassStore;
}

export default WrRenderPassStore;
