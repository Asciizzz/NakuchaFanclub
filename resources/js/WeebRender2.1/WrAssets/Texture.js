import { wrHashText, wrHashValue } from "./hash.js";

function asText(value, fallback = "") {
	const text = String(value ?? "").trim();
	return text.length > 0 ? text : fallback;
}

function asInt(value, fallback = 0) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(0, Math.floor(n));
}

function cloneSource(value) {
	if (ArrayBuffer.isView(value)) return new value.constructor(value);
	return value ?? null;
}

function isImageLike(value) {
	if (!value || typeof value !== "object") return false;
	if (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) return true;
	if (typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement) return true;
	if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) return true;
	if (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas) return true;
	if (typeof ImageData !== "undefined" && value instanceof ImageData) return true;
	if (typeof HTMLVideoElement !== "undefined" && value instanceof HTMLVideoElement) return true;
	return false;
}

function normalizeSampler(source = {}) {
	const raw = source && typeof source === "object" ? source : {};
	return {
		minFilter: asText(raw.minFilter, "linear"),
		magFilter: asText(raw.magFilter, "linear"),
		mipmapFilter: asText(raw.mipmapFilter, "linear"),
		wrapU: asText(raw.wrapU, "clamp-to-edge"),
		wrapV: asText(raw.wrapV, "clamp-to-edge"),
	};
}

export class WrTexture {
	constructor(source = {}) {
		this.name = "";
		this.hash = "";
		this.width = 1;
		this.height = 1;
		this.format = "rgba8unorm";
		this.bytesPerPixel = 4;
		this.source = null;
		this.sampler = normalizeSampler();
		this.runtime = {
			kind: null,
			texture: null,
			view: null,
			sampler: null,
			gl: null,
		};
		this.configure(source);
	}

	static from(source = {}) {
		return source instanceof WrTexture ? new WrTexture(source.toJSON()) : new WrTexture(source);
	}

	configure(source = {}) {
		const raw = source && typeof source === "object" ? source : {};
		if (raw.name !== undefined) this.name = asText(raw.name, this.name);
		if (raw.width !== undefined) this.width = Math.max(1, asInt(raw.width, this.width));
		if (raw.height !== undefined) this.height = Math.max(1, asInt(raw.height, this.height));
		if (raw.format !== undefined) this.format = asText(raw.format, this.format);
		if (raw.bytesPerPixel !== undefined) this.bytesPerPixel = Math.max(1, asInt(raw.bytesPerPixel, this.bytesPerPixel));
		if (raw.source !== undefined) this.setSource(raw.source, raw.width, raw.height);
		if (raw.sampler !== undefined) this.sampler = normalizeSampler(raw.sampler);
		this.updateHash();
		return this;
	}

	setSource(source, width = undefined, height = undefined) {
		this.source = cloneSource(source);
		if (width !== undefined) this.width = Math.max(1, asInt(width, this.width));
		if (height !== undefined) this.height = Math.max(1, asInt(height, this.height));

		if (isImageLike(source)) {
			const nextWidth = asInt(source.width, 0);
			const nextHeight = asInt(source.height, 0);
			if (nextWidth > 0) this.width = nextWidth;
			if (nextHeight > 0) this.height = nextHeight;
		}

		this.updateHash();
		return this;
	}

	updateHash() {
		this.hash = `tex_${wrHashText([
			this.name,
			this.width,
			this.height,
			this.format,
			this.bytesPerPixel,
			wrHashValue(this.sampler),
			wrHashValue(this.source),
		].join("|"))}`;
		return this.hash;
	}

	toJSON() {
		return {
			name: this.name,
			width: this.width,
			height: this.height,
			format: this.format,
			bytesPerPixel: this.bytesPerPixel,
			source: ArrayBuffer.isView(this.source) ? cloneSource(this.source) : null,
			sampler: { ...this.sampler },
		};
	}
}

if (typeof window !== "undefined") {
	window.WrTexture = WrTexture;
}

export default WrTexture;
