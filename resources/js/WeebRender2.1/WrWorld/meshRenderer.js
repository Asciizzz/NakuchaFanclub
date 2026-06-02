import { Component } from "./component.js";

function vec4(value = null) {
	const src = (Array.isArray(value) || ArrayBuffer.isView(value)) ? value : [0, 0, 0, 0];
	return new Float32Array([
		Number(src[0] ?? 0) || 0,
		Number(src[1] ?? 0) || 0,
		Number(src[2] ?? 0) || 0,
		Number(src[3] ?? 0) || 0,
	]);
}

export class MeshRenderer extends Component {
	mesh = null;
	morphWeights = null;
	instData = {
		slot0: vec4(),
		slot1: vec4(),
		slot2: vec4(),
		slot3: vec4(),
	};
	textures = {
		albedo: null,
	};
	cfg = {
		hasRig: false,
		display: true,
	};
}

if (typeof window !== "undefined") {
	window.WrMeshRenderer21 = MeshRenderer;
}

export default MeshRenderer;
