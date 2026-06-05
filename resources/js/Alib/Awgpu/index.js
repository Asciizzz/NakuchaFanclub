import { BeginFrame, EndFrame } from "./comps/frame.js";
import { RenderPass, ComputePass, EndPass } from "./comps/pass.js";
import { UsePipeline } from "./comps/pipeline.js";
import { SetBuffers } from "./comps/buffers.js";
import { SetBindGroups } from "./comps/bind.js";
import { Draw, DrawIndexed, DrawIndirect, DrawIndexedIndirect } from "./comps/draw.js";
import { Dispatch, DispatchIndirect } from "./comps/dispatch.js";
import { CopyBufferToBuffer, CopyBufferToTexture, CopyTextureToBuffer, CopyTextureToTexture } from "./comps/copy.js";
import { Backend } from "./backend.js";

export {
	// Components
	BeginFrame,
	EndFrame,
	RenderPass,
	EndPass,
	ComputePass,
	UsePipeline,
	SetBuffers,
	SetBindGroups,
	Draw,
	DrawIndexed,
	DrawIndirect,
	DrawIndexedIndirect,
	Dispatch,
	DispatchIndirect,
	CopyBufferToBuffer,
	CopyBufferToTexture,
	CopyTextureToBuffer,
	CopyTextureToTexture,
	// Other
	Backend,
};

export const Awgpu = Object.freeze({
	BeginFrame,
	EndFrame,
	RenderPass,
	EndPass,
	ComputePass,
	UsePipeline,
	SetBuffers,
	SetBindGroups,
	Draw,
	DrawIndexed,
	DrawIndirect,
	DrawIndexedIndirect,
	Dispatch,
	DispatchIndirect,
	CopyBufferToBuffer,
	CopyBufferToTexture,
	CopyTextureToBuffer,
	CopyTextureToTexture,
	
	Backend,
});

export default Awgpu;
