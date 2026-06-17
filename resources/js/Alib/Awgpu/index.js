import { BeginFrame, EndFrame } from "./steps/frame.js";
import { RenderPass, ComputePass, EndPass } from "./steps/pass.js";
import { UsePipeline } from "./steps/pipeline.js";
import { SetBuffers } from "./steps/buffers.js";
import { SetBindGroups } from "./steps/bind.js";
import { Draw, DrawIndexed, DrawIndirect, DrawIndexedIndirect } from "./steps/draw.js";
import { Dispatch, DispatchIndirect } from "./steps/dispatch.js";
import { CopyBufferToBuffer, CopyBufferToTexture, CopyTextureToBuffer, CopyTextureToTexture } from "./steps/copy.js";
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
