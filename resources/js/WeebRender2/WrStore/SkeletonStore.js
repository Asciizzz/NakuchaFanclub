import AzStore from "../../AzLib/AzStore.js";

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
		return super.add(skeleton);
	}
}

if (typeof window !== "undefined") {
	window.WrSkeletonStore = WrSkeletonStore;
}

export default WrSkeletonStore;
