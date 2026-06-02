import { Component } from "./component.js";

export class LiveSkeleton extends Component {
	skeleton = null;
	bones = [];
}

if (typeof window !== "undefined") {
	window.WrLiveSkeleton21 = LiveSkeleton;
}

export default LiveSkeleton;
