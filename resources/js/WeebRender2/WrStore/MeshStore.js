import AzStore from "../../AzLib/AzStore.js";

export class WrMeshStore extends AzStore {
	#world = null;

	constructor(world, options = {}) {
		super(options);
		this.#world = world ?? null;
	}

	get world() {
		return this.#world;
	}

	add(mesh) {
		this.uploadToBackend(mesh);
		return super.add(mesh);
	}

	remove(id) {
		const mesh = super.get(id);
		if (mesh == null) return false;
		this.releaseFromBackend(mesh);
		return super.remove(id);
	}

	uploadToBackend(_mesh) {
		// TODO WR2 mesh transform path
	}

	releaseFromBackend(_mesh) {
		// TODO WR2 mesh transform path
	}
}

if (typeof window !== "undefined") {
	window.WrMeshStore = WrMeshStore;
}

export default WrMeshStore;
