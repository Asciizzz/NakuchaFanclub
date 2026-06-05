import * as mAth from "../../Alib/mAth.js";
import { Component } from "./component.js";

export class Transform extends Component {
	local = mAth.Mat4.makeIdentity();
	world = mAth.Mat4.makeIdentity();
}

if (typeof window !== "undefined") {
	window.WrTransform21 = Transform;
}

export default Transform;
