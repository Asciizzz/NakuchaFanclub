import { Afstep } from "../../Aflow.js";

function toNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

// RenderPass: binds a framebuffer (null = default), sets the viewport, and
// clears color / depth based on options. No "pass object" in WebGL2 - the
// "pass" is just the currently bound framebuffer. We store the kind in state
// so downstream comps can guard themselves.
export class RenderPass extends Afstep {
	constructor(data = {}) {
		super();
		this.data = data;
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || ctx.passKind) return;
		const gl = ctx.gl;

		const fbo = this.data.framebuffer ?? null;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		ctx.framebuffer = fbo;

		const canvas = ctx.backend.canvas;
		const w = Math.max(1, (this.data.width ?? canvas?.width ?? 1) | 0);
		const h = Math.max(1, (this.data.height ?? canvas?.height ?? 1) | 0);
		gl.viewport(0, 0, w, h);

		// Scissors
		if (this.data.scissor) {
			const s = this.data.scissor;
			gl.enable(gl.SCISSOR_TEST);
			gl.scissor(s.x ?? 0, s.y ?? 0, s.width ?? w, s.height ?? h);
		} else {
			gl.disable(gl.SCISSOR_TEST);
		}

		// Clear
		let clearMask = 0;

		if (this.data.clearColorEnabled !== false) {
			const c = this.data.clearColor ?? [0, 0, 0, 1];
			gl.clearColor(
				toNumber(c[0], 0),
				toNumber(c[1], 0),
				toNumber(c[2], 0),
				toNumber(c[3], 1),
			);
			gl.colorMask(true, true, true, true);
			clearMask |= gl.COLOR_BUFFER_BIT;
		}

		if (this.data.useDepth !== false && this.data.clearDepthEnabled !== false) {
			gl.clearDepth(toNumber(this.data.clearDepth, 1));
			gl.depthMask(true);
			clearMask |= gl.DEPTH_BUFFER_BIT;
		}

		if (clearMask) gl.clear(clearMask);

		ctx.passKind = "render";
		ctx.program = null;
	}
}

// EndPass: unbinds the framebuffer and resets pass state
export class EndPass extends Afstep {
	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || !ctx.passKind) return;
		ctx.gl.bindFramebuffer(ctx.gl.FRAMEBUFFER, null);
		ctx.framebuffer = null;
		ctx.passKind = null;
		ctx.program = null;
	}
}
