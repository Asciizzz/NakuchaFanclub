import AzStore from "../../AzLib/AzStore.js";
import { WrTexture } from "../WrAssets/Texture.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

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
		const value = texture instanceof WrTexture ? texture : new WrTexture(texture ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			value.id = explicitId;
			this.uploadToBackend(value);
			return explicitId;
		}

		const id = super.add(value);
		value.id = id;
		this.uploadToBackend(value);
		return id;
	}

	remove(id) {
		const texture = super.get(id);
		if (!texture) return false;
		this.releaseFromBackend(texture);
		return super.remove(id);
	}

	uploadToBackend(_texture) {
		void _texture;
	}

	releaseFromBackend(_texture) {
		void _texture;
	}
}

if (typeof window !== "undefined") {
	window.WrTextureStore = WrTextureStore;
}

export default WrTextureStore;
