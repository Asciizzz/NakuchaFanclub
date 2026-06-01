import * as Azm from "../../AzLib/Azm.js";
import { Component } from "./component.js";

export class Transform extends Component {
	local = Azm.Mat4.makeIdentity();
	world = Azm.Mat4.makeIdentity();
}

if (typeof window !== "undefined") {
	window.WrTransform21 = Transform;
}

export default Transform;
