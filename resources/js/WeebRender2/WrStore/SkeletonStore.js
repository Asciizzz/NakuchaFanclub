import AzStore from "../../AzLib/AzStore.js";
import { WrSkeleton } from "../WrAssets/Skeleton.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

export class WrSkeletonStore extends AzStore {
	#world = null;

	constructor(world, options = {}) {
		super(options);
		this.#world = world ?? null;
	}

	get world() {
		return this.#world;
	}

	add(skeleton) {
		const value = skeleton instanceof WrSkeleton ? skeleton : new WrSkeleton(skeleton ?? {});
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

	resolveBoneIndex(id, indexOrName) {
		const skeleton = super.get(id);
		if (!skeleton || typeof skeleton.resolveBoneIndex !== "function") return -1;
		return skeleton.resolveBoneIndex(indexOrName);
	}
}

if (typeof window !== "undefined") {
	window.WrSkeletonStore = WrSkeletonStore;
}

export default WrSkeletonStore;
