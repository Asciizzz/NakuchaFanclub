import AzStore from "../../AzLib/AzStore.js";

export class WrTextureStore extends AzStore {
	#world = null;

	constructor(world, options = {}) {
		super(options);
		this.#world = world ?? null;
	}

	get world() {
		return this.#world;
	}

	add(texture) {
		this.uploadToBackend(texture);
		return super.add(texture);
	}

	remove(id) {
		const texture = super.get(id);
		if (texture == null) return false;
		this.releaseFromBackend(texture);
		return super.remove(id);
	}

	uploadToBackend(_texture) {
		// TODO WR2 texture transform path
	}

	releaseFromBackend(_texture) {
		// TODO WR2 texture transform path
	}
}

if (typeof window !== "undefined") {
	window.WrTextureStore = WrTextureStore;
}

export default WrTextureStore;
