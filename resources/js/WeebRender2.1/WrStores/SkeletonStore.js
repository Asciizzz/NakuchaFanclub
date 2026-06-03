import WrStore from "../WrStore.js";
import { WrSkeleton } from "../WrAssets/Skeleton.js";

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

export class WrSkeletonStore extends WrStore {
	add(skeleton) {
		const explicitId = asId(skeleton?.ref?.id ?? skeleton?.id);
		const value = skeleton instanceof WrSkeleton ? skeleton : WrSkeleton.from(skeleton ?? {});
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

	resolveBoneIndex(id, indexOrName) {
		const skeleton = this.get(id);
		if (!skeleton || typeof skeleton.resolveBoneIndex !== "function") return -1;
		return skeleton.resolveBoneIndex(indexOrName);
	}

	createGpu(_backend, _id) {
		void _backend;
		void _id;
		return null;
	}
}

if (typeof window !== "undefined") {
	window.WrSkeletonStore21 = WrSkeletonStore;
}

export default WrSkeletonStore;
