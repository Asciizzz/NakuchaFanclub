import * as Alm from "../../Alib/Alm.js";
import { Component } from "./component.js";

export class Transform extends Component {
	local = Alm.Mat4.makeIdentity();
	world = Alm.Mat4.makeIdentity();
}

if (typeof window !== "undefined") {
	window.WrTransform21 = Transform;
}

export default Transform;
