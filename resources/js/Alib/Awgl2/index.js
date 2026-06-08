import { BeginFrame, EndFrame } from "./comps/frame.js";
import { RenderPass, EndPass } from "./comps/pass.js";
import { UseProgram } from "./comps/program.js";
import { SetBuffers } from "./comps/buffers.js";
import { SetTextures } from "./comps/textures.js";
import { SetUniforms } from "./comps/uniforms.js";
import { Draw, DrawIndexed } from "./comps/draw.js";
import { Backend } from "./backend.js";

export {
	// Components
	BeginFrame,
	EndFrame,
	RenderPass,
	EndPass,
	UseProgram,
	SetBuffers,
	SetTextures,
	SetUniforms,
	Draw,
	DrawIndexed,
	// Other
	Backend,
};

export const Awgl2 = Object.freeze({
	BeginFrame,
	EndFrame,
	RenderPass,
	EndPass,
	UseProgram,
	SetBuffers,
	SetTextures,
	SetUniforms,
	Draw,
	DrawIndexed,

	Backend,
});

export default Awgl2;
