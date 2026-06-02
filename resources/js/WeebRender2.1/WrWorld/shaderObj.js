import { Component } from "./component.js";

export class ShaderOBJ extends Component {
	shaders = [];

	useShader(shader) {
		if (!shader || typeof shader !== "object") return false;
		this.shaders.push(shader);
		return true;
	}

	disuseShader(shader) {
		const index = this.shaders.indexOf(shader);
		if (index < 0) return false;
		this.shaders.splice(index, 1);
		return true;
	}

	setShaders(values) {
		this.shaders.length = 0;
		const list = Array.isArray(values) ? values : [values];
		for (const value of list) this.useShader(value);
		return this.shaders;
	}
}

if (typeof window !== "undefined") {
	window.WrShaderOBJComp21 = ShaderOBJ;
}

export default ShaderOBJ;
