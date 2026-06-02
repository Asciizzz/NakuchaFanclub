import { Component } from "./component.js";

export class ShaderFSC extends Component {
	shaders = [];
	textureSlots = {};

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

	setChannel(slot, value) {
		const index = Number(slot) | 0;
		if (index < 0 || index > 3) return false;
		this.textureSlots[`slot${index}`] = value && typeof value === "object" ? value : null;
		return true;
	}

	clearChannel(slot) {
		const index = Number(slot) | 0;
		if (index < 0 || index > 3) return false;
		this.textureSlots[`slot${index}`] = null;
		return true;
	}
}

if (typeof window !== "undefined") {
	window.WrShaderFSCComp21 = ShaderFSC;
}

export default ShaderFSC;
