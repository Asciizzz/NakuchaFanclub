export class Loader {
	static async readText(url) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`[WeebRender3.Other.Loader] failed to read "${url}"`);
		}
		return response.text();
	}

	static readShader(url) {
		return Loader.readText(url);
	}

	static readWGSL(url) {
		return Loader.readText(url);
	}

	static readGLSL(url) {
		return Loader.readText(url);
	}
}

export default Loader;
