export class Loader {
	static async readShader(url) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`[ExtWGPU.Loader] Failed to read shader "${url}"`);
		}
		return response.text();
	}

	static readWGSL(url) {
		return Loader.readShader(url);
	}

	static readGLSL(url) {
		return Loader.readShader(url);
	}
}

