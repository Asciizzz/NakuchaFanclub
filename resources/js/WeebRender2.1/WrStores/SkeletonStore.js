import AzStore from "../../AzLib/AzStore.js";
import { WrSkeleton } from "../WrAssets/Skeleton.js";

function asId(value) {
	if (value && typeof value === "object") return asId(value.ref?.id ?? value.id);
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

function stampRef(store, asset, id) {
	asset.id = id;
	asset.ref = { stores: store.stores ?? null, store, id };
	return asset;
}

export class WrSkeletonStore extends AzStore {
	add(skeleton) {
		const value = skeleton instanceof WrSkeleton ? skeleton : WrSkeleton.from(skeleton ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			return stampRef(this, value, explicitId);
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
