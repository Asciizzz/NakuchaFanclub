import * as Azm from "../../AzLib/Azm.js";

export class Component {
	node = null;

	constructor(node = null) {
		this.node = node ?? null;
	}

	get world() {
		return this.node?.ctx ?? null;
	}
}

export class Transform extends Component {
	local = Azm.Mat4.makeIdentity();
	world = Azm.Mat4.makeIdentity();
}

export class MeshRenderer extends Component {}

export class LiveSkeleton extends Component {}

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
