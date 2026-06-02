import { Component } from "./component.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

export class ShaderFSC extends Component {
	ids = [];
	textureSlots = {};

	useShader(value) {
		const id = asId(value);
		if (!id) return false;
		this.ids.push(id);
		return true;
	}

	disuseShader(value) {
		const id = asId(value);
		if (!id) return false;
		const index = this.ids.indexOf(id);
		if (index < 0) return false;
		this.ids.splice(index, 1);
		return true;
	}

	setIds(values) {
		this.ids.length = 0;
		const list = Array.isArray(values) ? values : [values];
		for (const value of list) this.useShader(value);
		return this.ids;
	}
}

if (typeof window !== "undefined") {
	window.WrShaderFSCComp21 = ShaderFSC;
}

export default ShaderFSC;
