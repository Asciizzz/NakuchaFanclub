import * as Azm from "../../AzLib/Azm.js";

function asVec4(value = [0, 0, 0, 0]) {
	const src = (Array.isArray(value) || ArrayBuffer.isView(value)) ? value : [0, 0, 0, 0];
	return new Float32Array([
		Number(src[0] ?? 0) || 0,
		Number(src[1] ?? 0) || 0,
		Number(src[2] ?? 0) || 0,
		Number(src[3] ?? 0) || 0,
	]);
}

export class Component {
	node = null;

	constructor(node = null) {
		this.node = node ?? null;
	}
}

export class Transform extends Component {
	local = Azm.Mat4.makeIdentity();
	world = Azm.Mat4.makeIdentity();
}

export class MeshRenderer extends Component {
	meshId = null;
	morphWeights = null;
	instData = {
		slot0: asVec4([0, 0, 0, 0]),
		slot1: asVec4([0, 0, 0, 0]),
		slot2: asVec4([0, 0, 0, 0]),
		slot3: asVec4([0, 0, 0, 0]),
	};
	cfg = {
		shaderIds: [],
		hasRig: false,
		display: true,
	};
}

export class LiveSkeleton extends Component {
	skeletonId = null;
	bones = [];
}

if (typeof window !== "undefined") {
	window.WrComponent = Component;
	window.WrTransform = Transform;
	window.WrMeshRenderer = MeshRenderer;
	window.WrLiveSkeleton = LiveSkeleton;
}

export default {
	Component,
	Transform,
	MeshRenderer,
	LiveSkeleton,
};
