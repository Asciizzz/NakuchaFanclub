import AzStore from "../../AzLib/AzStore.js";

export class WrShaderStore extends AzStore {
	#world = null;

	constructor(world, options = {}) {
		super(options);
		this.#world = world ?? null;
	}

	get world() {
		return this.#world;
	}

	add(shader) {
		this.buildBackendVariants(shader);
		return super.add(shader);
	}

	remove(id) {
		const shader = super.get(id);
		if (shader == null) return false;
		this.dropBackendVariants(shader);
		return super.remove(id);
	}

	buildBackendVariants(_shader) {
		// TODO WR2 shader transform path
	}

	dropBackendVariants(_shader) {
		// TODO WR2 shader transform path
	}
}

if (typeof window !== "undefined") {
	window.WrShaderStore = WrShaderStore;
}

export default WrShaderStore;
