import { Component } from "./component.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

export class ShaderObj extends Component {
	shaderIds = [];

	useShader(value) {
		const id = asId(value);
		if (!id) return false;
		this.shaderIds.push(id);
		return true;
	}

	disuseShader(value) {
		const id = asId(value);
		if (!id) return false;
		const index = this.shaderIds.indexOf(id);
		if (index < 0) return false;
		this.shaderIds.splice(index, 1);
		return true;
	}

	setShaderIds(values) {
		this.shaderIds.length = 0;
		const list = Array.isArray(values) ? values : [values];
		for (const value of list) this.useShader(value);
		return this.shaderIds;
	}
}

if (typeof window !== "undefined") {
	window.WrShaderObjComp21 = ShaderObj;
}

export default ShaderObj;
