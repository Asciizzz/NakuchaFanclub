import { WrTransform } from "../WeebRender2/index.js";

export class WrScreenHover {
	constructor(options = {}) {
		this.world = options.world ?? null;
		this.camera = options.camera ?? null;
		this.canvas = options.canvas ?? null;
		this.element = options.element ?? null;
		this.offsetY = Number(options.offsetY ?? -10) || -10;
		this.renderFunc = null;
		this.renderCondition = null;
		this.node = null;
		this.ndc = null;
		this.host = null;
	}

	setRenderFunc(fn) {
		this.renderFunc = fn;
		return this;
	}

	setRenderCondition(fn) {
		this.renderCondition = fn;
		return this;
	}

	render(nodeId) {
		if (!this.renderFunc) return;
		const root = this.world.getNode(nodeId);
		if (!root) return;

		this.element.replaceChildren();
		const rect = this.canvas.getBoundingClientRect();
		const halfW = rect.width * 0.5;
		const halfH = rect.height * 0.5;

		for (const node of root.traverse({ mode: "dfs_pre", includeFrom: true })) {
			if (this.renderCondition && !this.renderCondition(this.world, node)) continue;
			const tx = node.getComp(WrTransform);
			if (!tx || !tx.world) continue;

			const m = tx.world;
			const ndc = this.camera.findNDC([m[12], m[13], m[14]]);
			if (!ndc) continue;

			const x = rect.left + (ndc[0] * halfW + halfW);
			const y = rect.top + (-ndc[1] * halfH + halfH) + this.offsetY;
			const host = document.createElement("div");
			host.className = "wr-hover-node";
			host.style.left = `${x}px`;
			host.style.top = `${y}px`;

			this.node = node;
			this.ndc = ndc;
			this.host = host;
			const child = this.renderFunc(this.world, this);
			if (!child) continue;
			host.appendChild(child);

			const nearFadeStart = -0.72;
			const nearFadeEnd = -1.0;
			const nearT = (ndc[2] - nearFadeEnd) / (nearFadeStart - nearFadeEnd);
			const nearAlpha = Math.max(0, Math.min(1, nearT));
			host.style.opacity = String(0.25 + nearAlpha * 0.75);
			this.element.appendChild(host);
		}

		this.node = null;
		this.ndc = null;
		this.host = null;
		this.element.hidden = this.element.childElementCount <= 0;
	}
}

export default WrScreenHover;

