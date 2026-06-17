import { BeginFrame, EndFrame } from "./steps/frame.js";
import { RenderPass, EndPass } from "./steps/pass.js";
import { UseProgram } from "./steps/program.js";
import { SetBuffers } from "./steps/buffers.js";
import { SetTextures } from "./steps/textures.js";
import { SetUniforms } from "./steps/uniforms.js";
import { Draw, DrawIndexed } from "./steps/draw.js";
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
