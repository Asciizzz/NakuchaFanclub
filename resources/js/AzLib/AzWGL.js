/* AzWGL
By Asciiz

WebGL sidekick for AzWGPU
No compute wizardry here, just practical render helpers

#Context:
* Gets WebGL2 context and keeps canvas resize sane
* Methods
	+ create(canvas, options = {})
	+ resize(gl, canvas, options = {})
	+ info(gl)

#Shader:
* Compile + link GLSL program, throw readable error on fail
* Methods
	+ create(gl, descriptor)
	+ createChecked(gl, descriptor, options = {})
	+ summarizeInfoLog(log, options = {})
	+ use(gl, program)

#Buffer:
* Create/write ARRAY or ELEMENT buffers
* Methods
	+ create(gl, target, dataOrSize, usage = gl.STATIC_DRAW)
	+ write(gl, target, buffer, data, offset = 0)

#VertexArray:
* VAO setup helper so vertex layout code stays in one place
* Methods
	+ create(gl, callback)
	+ bind(gl, vao)

#Uniform:
* Small uniform setters, mostly to avoid typo hunts
* Methods
	+ mat4(gl, program, name, value)
	+ vec4(gl, program, name, value)
	+ float(gl, program, name, value)
	+ int(gl, program, name, value)

#UniformBlock:
* UBO create/write/bind + layout offsets when you need std140 details
* Methods
	+ create(gl, program, blockName, options = {})
	+ write(gl, block, data, offset = 0)
	+ bind(gl, block, binding = null)
	+ layout(gl, program, blockName, uniformNames)

#Texture:
* 2D/cube/3D/array/depth texture helpers with upload paths
* Methods
	+ create2D(gl, options = {})
	+ write2D(gl, texture, source, options = {})
	+ createCube(gl, options = {})
	+ writeCubeFace(gl, texture, face, source, options = {})
	+ create3D(gl, options = {})
	+ write3D(gl, texture, source, options = {})
	+ create2DArray(gl, options = {})
	+ write2DArrayLayer(gl, texture, layer, source, options = {})
	+ createDepth2D(gl, options = {})

#Draw:
* Clear and indexed draw calls, including instanced
* Methods
	+ clear(gl, options = {})
	+ drawIndexed(gl, options)
	+ drawIndexedInstanced(gl, options)

#Limits:
* Snapshot of useful GL limits
* Methods
	+ inspect(gl)

#Ext:
* Extension get/has/require with cache per context
* Methods
	+ get(gl, name, options = {})
	+ has(gl, name)
	+ require(gl, names)

#State:
* Pack/apply/capture render states without hidden toggles
* Methods
	+ create(options = {})
	+ apply(gl, state)
	+ capture(gl)

#Framebuffer:
* Create/attach/bind/check framebuffer stuff for multipass
* Methods
	+ create(gl, options = {})
	+ createRenderbuffer(gl, options = {})
	+ bind(gl, framebuffer, target = gl.FRAMEBUFFER)
	+ check(gl, target = gl.FRAMEBUFFER)
	+ with(gl, framebuffer, callback, options = {})

#Pipeline:
* Program + vao + state bundle if you want one object
* Methods
	+ create(gl, options = {})
	+ createChecked(gl, options = {}, check = {})
	+ use(gl, pipeline, options = {})

#Readback:
* Read pixels and optionally scope to a framebuffer
* Methods
	+ pixels(gl, options = {})
	+ sync(gl)

#ResourcePool:
* Simple transient pool for GL resources
* Methods
	+ acquire(gl, kind, key, factory)
	+ release(gl, kind, key, resource)
	+ with(gl, kind, key, factory, callback)
	+ stats(gl)
	+ clear(gl, options = {})

#LayoutCache:
* Cache repeated VAO layout creation from attribute signatures
* Methods
	+ keyFromAttributes(attributes, options = {})
	+ get(gl, key)
	+ set(gl, key, value)
	+ getOrCreate(gl, options = {})
	+ createVAO(gl, options = {})
	+ clear(gl)

#Timer:
* Query timing helper when extension exists, CPU fallback otherwise
* Methods
	+ supportInfo(gl)
	+ supported(gl)
	+ create(gl, options = {})
	+ measure(gl, encode, options = {})
*/


// ------ Context ------

export class Context {
	/**
	 * Create one WebGL2 context from canvas and options
	 * @param {HTMLCanvasElement} canvas target canvas
	 * @param {object} [options = {}] context options
	 * @returns {WebGL2RenderingContext}
	 */
	static create(canvas, options = {}) {
		if (!(canvas instanceof HTMLCanvasElement)) {
			throw new TypeError("Context.create needs a canvas element");
		}

		const gl = canvas.getContext("webgl2", {
			alpha: options.alpha ?? false,
			antialias: options.antialias ?? true,
			depth: options.depth ?? true,
			stencil: options.stencil ?? false,
			preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
			powerPreference: options.powerPreference,
		});
		if (!gl) {
			throw new Error("WebGL2 is not available on this browser/device");
		}
		return gl;
	}

	/**
	 * Resize canvas and viewport if size changed
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {HTMLCanvasElement} canvas target canvas
	 * @param {object} [options = {}] dpr and viewport options
	 * @returns {boolean}
	 */
	static resize(gl, canvas, options = {}) {
		if (!gl || !(canvas instanceof HTMLCanvasElement)) {
			throw new TypeError("Context.resize needs gl and canvas");
		}

		const dprCap = options.dprCap ?? 2;
		const dpr = Math.max(1, Math.min(globalThis.devicePixelRatio || 1, dprCap));
		const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
		const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
		if (canvas.width === width && canvas.height === height) {
			return false;
		}

		canvas.width = width;
		canvas.height = height;
		gl.viewport(0, 0, width, height);
		return true;
	}

	/**
	 * Read small renderer info snapshot
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {object}
	 */
	static info(gl) {
		if (!gl) {
			throw new TypeError("Context.info needs gl");
		}

		const ext = gl.getExtension("WEBGL_debug_renderer_info");
		return {
			version: gl.getParameter(gl.VERSION),
			shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
			vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : "hidden",
			renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "hidden",
		};
	}
}


// ------ Shader ------

export class Shader {
	/**
	 * Compile + link one program from vertex/fragment sources
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} descriptor shader descriptor
	 * @returns {WebGLProgram}
	 */
	static create(gl, descriptor) {
		if (!gl || !descriptor) {
			throw new TypeError("Shader.create needs gl and descriptor");
		}
		const vsSource = descriptor.vertex;
		const fsSource = descriptor.fragment;
		if (typeof vsSource !== "string" || typeof fsSource !== "string") {
			throw new TypeError("Shader.create expects vertex and fragment source strings");
		}

		const vs = Shader._compile(gl, gl.VERTEX_SHADER, vsSource, descriptor.vertexLabel ?? "AzGL VS");
		const fs = Shader._compile(gl, gl.FRAGMENT_SHADER, fsSource, descriptor.fragmentLabel ?? "AzGL FS");

		const program = gl.createProgram();
		if (!program) {
			throw new Error("Shader.create failed to create program");
		}

		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		if (descriptor.attribLocations && typeof descriptor.attribLocations === "object") {
			for (const [name, rawIndex] of Object.entries(descriptor.attribLocations)) {
				const index = Number(rawIndex);
				if (!Number.isInteger(index) || index < 0) continue;
				if (typeof name !== "string" || name.length <= 0) continue;
				gl.bindAttribLocation(program, index, name);
			}
		}
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const message = gl.getProgramInfoLog(program) || "unknown link error";
			gl.deleteProgram(program);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			throw new Error("Shader.create link failed: " + message);
		}

		gl.detachShader(program, vs);
		gl.detachShader(program, fs);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		return program;
	}

	/**
	 * Bind program for draw calls
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLProgram} program linked program
	 * @returns {void}
	 */
	static use(gl, program) {
		if (!gl || !program) {
			throw new TypeError("Shader.use needs gl and program");
		}
		gl.useProgram(program);
	}

	/**
	 * Checked shader program create, returns status instead of hard throw
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} descriptor shader descriptor
	 * @param {object} [options = {}] checked create options
	 * @returns {object}
	 */
	static createChecked(gl, descriptor, options = {}) {
		try {
			const program = Shader.create(gl, descriptor);
			return {
				ok: true,
				program,
				error: null,
				errorMessage: null,
			};
		} catch (error) {
			if (options.throwOnError ?? false) {
				throw error;
			}
			const message = String(error?.message ?? error);
			return {
				ok: false,
				program: null,
				error: error ?? null,
				errorMessage: message,
			};
		}
	}

	/**
	 * Trim and summarize GLSL info-log text for readable output
	 * @param {string} log compiler or linker log text
	 * @param {object} [options = {}] summary options
	 * @returns {string}
	 */
	static summarizeInfoLog(log, options = {}) {
		const text = String(log ?? "").replace(/\r/g, "");
		const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
		if (lines.length === 0) {
			return "no log lines";
		}
		const maxLines = Math.max(1, Number(options.maxLines ?? 8) || 8);
		const shown = lines.slice(0, maxLines);
		if (lines.length > shown.length) {
			shown.push("... +" + (lines.length - shown.length) + " more lines");
		}
		return shown.join("\n");
	}

	/**
	 * Compile one shader stage and throw readable error if needed
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} type shader stage enum
	 * @param {string} source GLSL source
	 * @param {string} label stage label
	 * @returns {WebGLShader}
	 */
	static _compile(gl, type, source, label) {
		const shader = gl.createShader(type);
		if (!shader) {
			throw new Error("Shader compile failed for " + label);
		}
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const message = gl.getShaderInfoLog(shader) || "unknown compile error";
			gl.deleteShader(shader);
			throw new Error(label + " compile failed: " + message);
		}
		return shader;
	}
}


// ------ Buffer ------

export class Buffer {
	/**
	 * Create one buffer and optionally upload initial data
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} target gl.ARRAY_BUFFER or gl.ELEMENT_ARRAY_BUFFER
	 * @param {ArrayBufferView|number} dataOrSize typed array or byte size
	 * @param {number} [usage] gl usage enum
	 * @returns {WebGLBuffer}
	 */
	static create(gl, target, dataOrSize, usage = null) {
		if (!gl) {
			throw new TypeError("Buffer.create needs gl");
		}

		const buffer = gl.createBuffer();
		if (!buffer) {
			throw new Error("Buffer.create failed to create buffer");
		}

		gl.bindBuffer(target, buffer);
		const realUsage = usage ?? gl.STATIC_DRAW;
		if (typeof dataOrSize === "number") {
			gl.bufferData(target, dataOrSize, realUsage);
		} else {
			gl.bufferData(target, dataOrSize, realUsage);
		}
		gl.bindBuffer(target, null);
		return buffer;
	}

	/**
	 * Write data into existing buffer
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} target buffer target
	 * @param {WebGLBuffer} buffer target buffer
	 * @param {ArrayBufferView} data source data
	 * @param {number} [offset = 0] byte offset
	 * @returns {void}
	 */
	static write(gl, target, buffer, data, offset = 0) {
		if (!gl || !buffer || !data) {
			throw new TypeError("Buffer.write needs gl, buffer, and data");
		}
		gl.bindBuffer(target, buffer);
		gl.bufferSubData(target, offset, data);
		gl.bindBuffer(target, null);
	}
}


// ------ VertexArray ------

export class VertexArray {
	/**
	 * Create one VAO and configure attributes via callback
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {(gl: WebGL2RenderingContext) => void} callback setup callback
	 * @returns {WebGLVertexArrayObject}
	 */
	static create(gl, callback) {
		if (!gl || typeof callback !== "function") {
			throw new TypeError("VertexArray.create needs gl and callback");
		}

		const vao = gl.createVertexArray();
		if (!vao) {
			throw new Error("VertexArray.create failed to create vao");
		}

		gl.bindVertexArray(vao);
		callback(gl);
		gl.bindVertexArray(null);
		return vao;
	}

	/**
	 * Bind one VAO
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLVertexArrayObject|null} vao target vao or null
	 * @returns {void}
	 */
	static bind(gl, vao) {
		if (!gl) {
			throw new TypeError("VertexArray.bind needs gl");
		}
		gl.bindVertexArray(vao);
	}
}


// ------ Uniform ------

export class Uniform {
	/**
	 * Upload mat4 uniform
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLProgram} program linked program
	 * @param {string} name uniform name
	 * @param {Float32Array|number[]} value mat4 value
	 * @returns {void}
	 */
	static mat4(gl, program, name, value) {
		const loc = Uniform._loc(gl, program, name);
		if (loc !== null) gl.uniformMatrix4fv(loc, false, value);
	}

	/**
	 * Upload vec4 uniform
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLProgram} program linked program
	 * @param {string} name uniform name
	 * @param {Float32Array|number[]} value vec4 value
	 * @returns {void}
	 */
	static vec4(gl, program, name, value) {
		const loc = Uniform._loc(gl, program, name);
		if (loc !== null) gl.uniform4fv(loc, value);
	}

	/**
	 * Upload float uniform
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLProgram} program linked program
	 * @param {string} name uniform name
	 * @param {number} value float value
	 * @returns {void}
	 */
	static float(gl, program, name, value) {
		const loc = Uniform._loc(gl, program, name);
		if (loc !== null) gl.uniform1f(loc, value);
	}

	/**
	 * Upload int uniform
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLProgram} program linked program
	 * @param {string} name uniform name
	 * @param {number} value int value
	 * @returns {void}
	 */
	static int(gl, program, name, value) {
		const loc = Uniform._loc(gl, program, name);
		if (loc !== null) gl.uniform1i(loc, value);
	}

	/**
	 * Internal uniform location fetch
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLProgram} program linked program
	 * @param {string} name uniform name
	 * @returns {WebGLUniformLocation|null}
	 */
	static _loc(gl, program, name) {
		if (!gl || !program || typeof name !== "string") {
			throw new TypeError("Uniform location lookup needs gl, program, and name");
		}
		return gl.getUniformLocation(program, name);
	}
}


// ------ UniformBlock ------

export class UniformBlock {
	/**
	 * Create one uniform block binding and backing UBO
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLProgram} program linked program
	 * @param {string} blockName uniform block name from GLSL
	 * @param {object} [options = {}] create options
	 * @returns {object}
	 */
	static create(gl, program, blockName, options = {}) {
		if (!gl || !program || typeof blockName !== "string") {
			throw new TypeError("UniformBlock.create needs gl, program, and blockName");
		}

		const blockIndex = gl.getUniformBlockIndex(program, blockName);
		if (blockIndex === gl.INVALID_INDEX) {
			throw new Error("Uniform block not found in program: " + blockName);
		}

		const binding = options.binding ?? 0;
		const size = options.size ?? gl.getActiveUniformBlockParameter(program, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
		const usage = options.usage ?? gl.DYNAMIC_DRAW;
		const buffer = Buffer.create(gl, gl.UNIFORM_BUFFER, size, usage);

		gl.uniformBlockBinding(program, blockIndex, binding);
		gl.bindBufferBase(gl.UNIFORM_BUFFER, binding, buffer);

		return {
			buffer,
			size,
			binding,
			blockName,
			blockIndex,
			label: options.label ?? blockName,
		};
	}

	/**
	 * Write data to an existing UBO
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object|WebGLBuffer} block uniform block bundle or raw buffer
	 * @param {ArrayBufferView} data source bytes
	 * @param {number} [offset = 0] byte offset in UBO
	 * @returns {void}
	 */
	static write(gl, block, data, offset = 0) {
		if (!gl || !block || !ArrayBuffer.isView(data)) {
			throw new TypeError("UniformBlock.write needs gl, block, and typed array data");
		}
		const buffer = block.buffer ?? block;
		if (!buffer) {
			throw new TypeError("UniformBlock.write could not resolve target buffer");
		}
		gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
		gl.bufferSubData(gl.UNIFORM_BUFFER, offset, data);
		gl.bindBuffer(gl.UNIFORM_BUFFER, null);
	}

	/**
	 * Bind block buffer to binding index
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object|WebGLBuffer} block uniform block bundle or raw buffer
	 * @param {number|null} [binding = null] override binding index
	 * @returns {number}
	 */
	static bind(gl, block, binding = null) {
		if (!gl || !block) {
			throw new TypeError("UniformBlock.bind needs gl and block");
		}
		const buffer = block.buffer ?? block;
		const targetBinding = binding ?? block.binding ?? 0;
		gl.bindBufferBase(gl.UNIFORM_BUFFER, targetBinding, buffer);
		return targetBinding;
	}

	/**
	 * Query block size and std140-relevant offsets for selected uniforms
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLProgram} program linked program
	 * @param {string} blockName uniform block name from GLSL
	 * @param {string[]} uniformNames member names in block order
	 * @returns {object}
	 */
	static layout(gl, program, blockName, uniformNames) {
		if (!gl || !program || typeof blockName !== "string" || !Array.isArray(uniformNames)) {
			throw new TypeError("UniformBlock.layout needs gl, program, blockName, and uniformNames");
		}

		const blockIndex = gl.getUniformBlockIndex(program, blockName);
		if (blockIndex === gl.INVALID_INDEX) {
			throw new Error("Uniform block not found in program: " + blockName);
		}

		const names = uniformNames.map((name) => `${blockName}.${name}`);
		const indices = gl.getUniformIndices(program, names);
		const validPairs = [];
		for (let i = 0; i < indices.length; i++) {
			if (indices[i] !== gl.INVALID_INDEX) {
				validPairs.push([uniformNames[i], indices[i]]);
			}
		}
		const validIndices = validPairs.map((pair) => pair[1]);

		const offsets = validIndices.length > 0 ? gl.getActiveUniforms(program, validIndices, gl.UNIFORM_OFFSET) : [];
		const arrayStrides = validIndices.length > 0 ? gl.getActiveUniforms(program, validIndices, gl.UNIFORM_ARRAY_STRIDE) : [];
		const matrixStrides = validIndices.length > 0 ? gl.getActiveUniforms(program, validIndices, gl.UNIFORM_MATRIX_STRIDE) : [];
		const isRowMajor = validIndices.length > 0 ? gl.getActiveUniforms(program, validIndices, gl.UNIFORM_IS_ROW_MAJOR) : [];

		const members = {};
		for (let i = 0; i < validPairs.length; i++) {
			const name = validPairs[i][0];
			members[name] = {
				offset: offsets[i],
				arrayStride: arrayStrides[i],
				matrixStride: matrixStrides[i],
				isRowMajor: !!isRowMajor[i],
			};
		}

		return {
			blockName,
			blockIndex,
			size: gl.getActiveUniformBlockParameter(program, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE),
			members,
		};
	}
}


// ------ Texture ------

export class Texture {
	/**
	 * Create basic 2D texture with common defaults
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] texture options
	 * @returns {WebGLTexture}
	 */
	static create2D(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Texture.create2D needs gl");
		}

		const texture = gl.createTexture();
		if (!texture) {
			throw new Error("Texture.create2D failed to create texture");
		}

		const target = gl.TEXTURE_2D;
		gl.bindTexture(target, texture);

		const level = 0;
		const internalFormat = options.internalFormat ?? gl.RGBA8;
		const width = options.width ?? 1;
		const height = options.height ?? 1;
		const border = 0;
		const format = options.format ?? gl.RGBA;
		const type = options.type ?? gl.UNSIGNED_BYTE;
		const pixels = options.pixels ?? null;
		gl.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);

		gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, options.minFilter ?? gl.LINEAR);
		gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, options.magFilter ?? gl.LINEAR);
		gl.texParameteri(target, gl.TEXTURE_WRAP_S, options.wrapS ?? gl.CLAMP_TO_EDGE);
		gl.texParameteri(target, gl.TEXTURE_WRAP_T, options.wrapT ?? gl.CLAMP_TO_EDGE);
		gl.bindTexture(target, null);
		return texture;
	}

	/**
	 * Upload image-like source into 2D texture
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLTexture} texture texture to write
	 * @param {TexImageSource|ArrayBufferView} source source data
	 * @param {object} [options = {}] upload options
	 * @returns {void}
	 */
	static write2D(gl, texture, source, options = {}) {
		if (!gl || !texture || !source) {
			throw new TypeError("Texture.write2D needs gl, texture, and source");
		}
		const target = gl.TEXTURE_2D;
		gl.bindTexture(target, texture);
		const level = options.level ?? 0;
		const format = options.format ?? gl.RGBA;
		const type = options.type ?? gl.UNSIGNED_BYTE;
		if (ArrayBuffer.isView(source)) {
			const width = options.width;
			const height = options.height;
			if (!width || !height) {
				throw new TypeError("Texture.write2D typed array upload needs width and height");
			}
			gl.texSubImage2D(target, level, options.x ?? 0, options.y ?? 0, width, height, format, type, source);
		} else {
			gl.texSubImage2D(target, level, options.x ?? 0, options.y ?? 0, format, type, source);
		}
		gl.bindTexture(target, null);
	}

	/**
	 * Create cubemap texture and allocate all 6 faces
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] cubemap options
	 * @returns {WebGLTexture}
	 */
	static createCube(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Texture.createCube needs gl");
		}
		const texture = gl.createTexture();
		if (!texture) {
			throw new Error("Texture.createCube failed to create texture");
		}
		const target = gl.TEXTURE_CUBE_MAP;
		gl.bindTexture(target, texture);

		const level = 0;
		const internalFormat = options.internalFormat ?? gl.RGBA8;
		const size = options.size ?? 1;
		const border = 0;
		const format = options.format ?? gl.RGBA;
		const type = options.type ?? gl.UNSIGNED_BYTE;
		const faces = options.faces ?? [];

		for (let i = 0; i < 6; i++) {
			const faceTarget = gl.TEXTURE_CUBE_MAP_POSITIVE_X + i;
			const pixels = faces[i] ?? null;
			gl.texImage2D(faceTarget, level, internalFormat, size, size, border, format, type, pixels);
		}

		Texture._setParams(gl, target, options, {
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
			wrapR: gl.CLAMP_TO_EDGE,
		});
		if (options.mipmap ?? false) {
			gl.generateMipmap(target);
		}

		gl.bindTexture(target, null);
		return texture;
	}

	/**
	 * Upload one cubemap face with typed data or image source
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLTexture} texture target cubemap texture
	 * @param {number} face cubemap face enum or index 0..5
	 * @param {TexImageSource|ArrayBufferView} source source data
	 * @param {object} [options = {}] upload options
	 * @returns {void}
	 */
	static writeCubeFace(gl, texture, face, source, options = {}) {
		if (!gl || !texture || source === undefined || source === null) {
			throw new TypeError("Texture.writeCubeFace needs gl, texture, face, and source");
		}
		const target = gl.TEXTURE_CUBE_MAP;
		gl.bindTexture(target, texture);
		const faceTarget = Texture._cubeFaceTarget(gl, face);
		Texture._write2DLike(gl, faceTarget, source, options);
		gl.bindTexture(target, null);
	}

	/**
	 * Create one 3D texture
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] texture options
	 * @returns {WebGLTexture}
	 */
	static create3D(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Texture.create3D needs gl");
		}
		const texture = gl.createTexture();
		if (!texture) {
			throw new Error("Texture.create3D failed to create texture");
		}
		const target = gl.TEXTURE_3D;
		gl.bindTexture(target, texture);

		gl.texImage3D(
			target,
			options.level ?? 0,
			options.internalFormat ?? gl.RGBA8,
			options.width ?? 1,
			options.height ?? 1,
			options.depth ?? 1,
			0,
			options.format ?? gl.RGBA,
			options.type ?? gl.UNSIGNED_BYTE,
			options.pixels ?? null,
		);
		Texture._setParams(gl, target, options, {
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
			wrapR: gl.CLAMP_TO_EDGE,
		});
		if (options.mipmap ?? false) {
			gl.generateMipmap(target);
		}

		gl.bindTexture(target, null);
		return texture;
	}

	/**
	 * Upload typed data into one 3D texture region
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLTexture} texture target 3D texture
	 * @param {ArrayBufferView} source source typed data
	 * @param {object} [options = {}] upload options
	 * @returns {void}
	 */
	static write3D(gl, texture, source, options = {}) {
		if (!gl || !texture || !ArrayBuffer.isView(source)) {
			throw new TypeError("Texture.write3D needs gl, texture, and typed array source");
		}
		const width = options.width;
		const height = options.height;
		const depth = options.depth;
		if (!width || !height || !depth) {
			throw new TypeError("Texture.write3D needs width, height, and depth");
		}
		const target = gl.TEXTURE_3D;
		gl.bindTexture(target, texture);
		Texture._withUnpackState(gl, options, () => {
			gl.texSubImage3D(
				target,
				options.level ?? 0,
				options.x ?? 0,
				options.y ?? 0,
				options.z ?? 0,
				width,
				height,
				depth,
				options.format ?? gl.RGBA,
				options.type ?? gl.UNSIGNED_BYTE,
				source,
			);
		});
		gl.bindTexture(target, null);
	}

	/**
	 * Create one 2D texture array
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] texture options
	 * @returns {WebGLTexture}
	 */
	static create2DArray(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Texture.create2DArray needs gl");
		}
		const texture = gl.createTexture();
		if (!texture) {
			throw new Error("Texture.create2DArray failed to create texture");
		}
		const target = gl.TEXTURE_2D_ARRAY;
		gl.bindTexture(target, texture);

		gl.texImage3D(
			target,
			options.level ?? 0,
			options.internalFormat ?? gl.RGBA8,
			options.width ?? 1,
			options.height ?? 1,
			options.layers ?? 1,
			0,
			options.format ?? gl.RGBA,
			options.type ?? gl.UNSIGNED_BYTE,
			options.pixels ?? null,
		);
		Texture._setParams(gl, target, options, {
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
			wrapR: gl.CLAMP_TO_EDGE,
		});
		if (options.mipmap ?? false) {
			gl.generateMipmap(target);
		}

		gl.bindTexture(target, null);
		return texture;
	}

	/**
	 * Upload one layer of a 2D texture array
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLTexture} texture target 2D array texture
	 * @param {number} layer target layer index
	 * @param {ArrayBufferView} source source typed data
	 * @param {object} [options = {}] upload options
	 * @returns {void}
	 */
	static write2DArrayLayer(gl, texture, layer, source, options = {}) {
		if (!gl || !texture || !ArrayBuffer.isView(source) || typeof layer !== "number") {
			throw new TypeError("Texture.write2DArrayLayer needs gl, texture, layer, and typed array source");
		}
		const width = options.width;
		const height = options.height;
		if (!width || !height) {
			throw new TypeError("Texture.write2DArrayLayer needs width and height");
		}
		const target = gl.TEXTURE_2D_ARRAY;
		gl.bindTexture(target, texture);
		Texture._withUnpackState(gl, options, () => {
			gl.texSubImage3D(
				target,
				options.level ?? 0,
				options.x ?? 0,
				options.y ?? 0,
				layer,
				width,
				height,
				options.depth ?? 1,
				options.format ?? gl.RGBA,
				options.type ?? gl.UNSIGNED_BYTE,
				source,
			);
		});
		gl.bindTexture(target, null);
	}

	/**
	 * Create depth texture with sane defaults for shadow/depth passes
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] depth texture options
	 * @returns {WebGLTexture}
	 */
	static createDepth2D(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Texture.createDepth2D needs gl");
		}
		const texture = gl.createTexture();
		if (!texture) {
			throw new Error("Texture.createDepth2D failed to create texture");
		}
		const target = gl.TEXTURE_2D;
		gl.bindTexture(target, texture);

		const internalFormat = options.internalFormat ?? gl.DEPTH_COMPONENT24;
		const format = options.format ?? gl.DEPTH_COMPONENT;
		const type = options.type ?? gl.UNSIGNED_INT;
		gl.texImage2D(target, 0, internalFormat, options.width ?? 1, options.height ?? 1, 0, format, type, options.pixels ?? null);

		Texture._setParams(gl, target, options, {
			minFilter: gl.NEAREST,
			magFilter: gl.NEAREST,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
		});
		if (options.compareMode !== undefined) {
			gl.texParameteri(target, gl.TEXTURE_COMPARE_MODE, options.compareMode);
		}
		if (options.compareFunc !== undefined) {
			gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, options.compareFunc);
		}

		gl.bindTexture(target, null);
		return texture;
	}

	/**
	 * Normalize cubemap face input to GL enum
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} face face enum or index
	 * @returns {number}
	 */
	static _cubeFaceTarget(gl, face) {
		if (face >= 0 && face <= 5) {
			return gl.TEXTURE_CUBE_MAP_POSITIVE_X + face;
		}
		return face;
	}

	/**
	 * Apply common texture params with optional overrides
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} texture to write target enum
	 * @param {object} options source options
	 * @param {object} defaults default param values
	 * @returns {void}
	 */
	static _setParams(gl, target, options, defaults) {
		gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, options.minFilter ?? defaults.minFilter);
		gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, options.magFilter ?? defaults.magFilter);
		gl.texParameteri(target, gl.TEXTURE_WRAP_S, options.wrapS ?? defaults.wrapS);
		gl.texParameteri(target, gl.TEXTURE_WRAP_T, options.wrapT ?? defaults.wrapT);
		if (defaults.wrapR !== undefined || options.wrapR !== undefined) {
			gl.texParameteri(target, gl.TEXTURE_WRAP_R, options.wrapR ?? defaults.wrapR);
		}
	}

	/**
	 * Shared 2D upload helper used by normal 2D and cube faces
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} texture to write target enum
	 * @param {TexImageSource|ArrayBufferView} source upload source
	 * @param {object} [options = {}] upload options
	 * @returns {void}
	 */
	static _write2DLike(gl, target, source, options = {}) {
		const level = options.level ?? 0;
		const format = options.format ?? gl.RGBA;
		const type = options.type ?? gl.UNSIGNED_BYTE;
		if (ArrayBuffer.isView(source)) {
			const width = options.width;
			const height = options.height;
			if (!width || !height) {
				throw new TypeError("Typed array upload needs width and height");
			}
			Texture._withUnpackState(gl, options, () => {
				gl.texSubImage2D(target, level, options.x ?? 0, options.y ?? 0, width, height, format, type, source);
			});
			return;
		}
		gl.texSubImage2D(target, level, options.x ?? 0, options.y ?? 0, format, type, source);
	}

	/**
	 * Apply temporary unpack pixel-store state around upload
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} options upload options
	 * @param {() => void} callback upload callback
	 * @returns {void}
	 */
	static _withUnpackState(gl, options, callback) {
		const prevAlign = gl.getParameter(gl.UNPACK_ALIGNMENT);
		const prevRowLen = gl.getParameter(gl.UNPACK_ROW_LENGTH);
		const prevImageHeight = gl.getParameter(gl.UNPACK_IMAGE_HEIGHT);
		const prevSkipPixels = gl.getParameter(gl.UNPACK_SKIP_PIXELS);
		const prevSkipRows = gl.getParameter(gl.UNPACK_SKIP_ROWS);
		const prevSkipImages = gl.getParameter(gl.UNPACK_SKIP_IMAGES);

		gl.pixelStorei(gl.UNPACK_ALIGNMENT, options.unpackAlignment ?? 1);
		if (options.unpackRowLength !== undefined) gl.pixelStorei(gl.UNPACK_ROW_LENGTH, options.unpackRowLength);
		if (options.unpackImageHeight !== undefined) gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, options.unpackImageHeight);
		if (options.unpackSkipPixels !== undefined) gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, options.unpackSkipPixels);
		if (options.unpackSkipRows !== undefined) gl.pixelStorei(gl.UNPACK_SKIP_ROWS, options.unpackSkipRows);
		if (options.unpackSkipImages !== undefined) gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, options.unpackSkipImages);

		try {
			callback();
		} finally {
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, prevAlign);
			gl.pixelStorei(gl.UNPACK_ROW_LENGTH, prevRowLen);
			gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, prevImageHeight);
			gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, prevSkipPixels);
			gl.pixelStorei(gl.UNPACK_SKIP_ROWS, prevSkipRows);
			gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, prevSkipImages);
		}
	}
}


// ------ Draw ------

export class Draw {
	/**
	 * Clear color/depth buffers with explicit values
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] clear options
	 * @returns {void}
	 */
	static clear(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Draw.clear needs gl");
		}
		const c = options.color ?? [0, 0, 0, 1];
		gl.clearColor(c[0], c[1], c[2], c[3]);
		if (options.depthEnabled ?? true) {
			gl.clearDepth(options.depth ?? 1);
		}
		let mask = gl.COLOR_BUFFER_BIT;
		if (options.depthEnabled ?? true) {
			mask |= gl.DEPTH_BUFFER_BIT;
		}
		gl.clear(mask);
	}

	/**
	 * Issue indexed draw
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} options draw options
	 * @returns {void}
	 */
	static drawIndexed(gl, options) {
		if (!gl || !options) {
			throw new TypeError("Draw.drawIndexed needs gl and options");
		}
		gl.drawElements(
			options.mode ?? gl.TRIANGLES,
			options.count,
			options.type ?? gl.UNSIGNED_SHORT,
			options.offset ?? 0,
		);
	}

	/**
	 * Issue indexed instanced draw
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} options draw options
	 * @returns {void}
	 */
	static drawIndexedInstanced(gl, options) {
		if (!gl || !options) {
			throw new TypeError("Draw.drawIndexedInstanced needs gl and options");
		}
		gl.drawElementsInstanced(
			options.mode ?? gl.TRIANGLES,
			options.count,
			options.type ?? gl.UNSIGNED_SHORT,
			options.offset ?? 0,
			options.instanceCount ?? 1,
		);
	}
}


// ------ Limits ------

export class Limits {
	/**
	 * Grab relevant WebGL2 limits for quick compatibility checks
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {object}
	 */
	static inspect(gl) {
		if (!gl) {
			throw new TypeError("Limits.inspect needs gl");
		}
		return {
			maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
			maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
			maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
			maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
			maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
			maxDrawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
			maxElementsVertices: gl.getParameter(gl.MAX_ELEMENTS_VERTICES),
			maxElementsIndices: gl.getParameter(gl.MAX_ELEMENTS_INDICES),
		};
	}
}


// ------ Ext ------

const _extCache = new WeakMap();

export class Ext {
	/**
	 * Get extension object once and cache it per context
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string} name extension name
	 * @param {object} [options = {}] lookup options
	 * @returns {any}
	 */
	static get(gl, name, options = {}) {
		if (!gl || typeof name !== "string") {
			throw new TypeError("Ext.get needs gl and extension name");
		}

		let byGl = _extCache.get(gl);
		if (!byGl) {
			byGl = new Map();
			_extCache.set(gl, byGl);
		}

		if (byGl.has(name)) {
			return byGl.get(name);
		}

		const ext = gl.getExtension(name);
		byGl.set(name, ext);
		if (!ext && (options.required ?? false)) {
			throw new Error("Required WebGL extension is missing: " + name);
		}
		return ext;
	}

	/**
	 * Check if an extension exists
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string} name extension name
	 * @returns {boolean}
	 */
	static has(gl, name) {
		return !!Ext.get(gl, name);
	}

	/**
	 * Require a list of extensions and throw if any are missing
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string[]} names extension name list
	 * @returns {object}
	 */
	static require(gl, names) {
		if (!Array.isArray(names)) {
			throw new TypeError("Ext.require needs an extension name array");
		}
		const out = {};
		const missing = [];
		for (const name of names) {
			const ext = Ext.get(gl, name);
			if (!ext) {
				missing.push(name);
			} else {
				out[name] = ext;
			}
		}
		if (missing.length > 0) {
			throw new Error("Missing required WebGL extensions: " + missing.join(", "));
		}
		return out;
	}
}


// ------ State ------

export class State {
	/**
	 * Create a plain state object so callers can reuse one shape
	 * @param {object} [options = {}] state options
	 * @returns {object}
	 */
	static create(options = {}) {
		return { ...options };
	}

	/**
	 * Apply explicit state fields to current context
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} state state object
	 * @returns {void}
	 */
	static apply(gl, state) {
		if (!gl || !state) {
			throw new TypeError("State.apply needs gl and state");
		}

		if (state.viewport) {
			gl.viewport(state.viewport[0], state.viewport[1], state.viewport[2], state.viewport[3]);
		}
		if (state.scissor) {
			gl.scissor(state.scissor[0], state.scissor[1], state.scissor[2], state.scissor[3]);
		}

		if (state.clearColor) {
			gl.clearColor(state.clearColor[0], state.clearColor[1], state.clearColor[2], state.clearColor[3]);
		}
		if (state.clearDepth !== undefined) {
			gl.clearDepth(state.clearDepth);
		}
		if (state.clearStencil !== undefined) {
			gl.clearStencil(state.clearStencil);
		}

		if (state.colorMask) {
			gl.colorMask(!!state.colorMask[0], !!state.colorMask[1], !!state.colorMask[2], !!state.colorMask[3]);
		}
		if (state.depthMask !== undefined) {
			gl.depthMask(!!state.depthMask);
		}

		State._toggle(gl, gl.DEPTH_TEST, state.depthTest);
		State._toggle(gl, gl.BLEND, state.blend);
		State._toggle(gl, gl.CULL_FACE, state.cull);
		State._toggle(gl, gl.SCISSOR_TEST, state.scissorTest);
		State._toggle(gl, gl.STENCIL_TEST, state.stencilTest);
		State._toggle(gl, gl.POLYGON_OFFSET_FILL, state.polygonOffsetEnabled);

		if (state.depthFunc !== undefined) {
			gl.depthFunc(state.depthFunc);
		}
		if (state.cullFace !== undefined) {
			gl.cullFace(state.cullFace);
		}
		if (state.frontFace !== undefined) {
			gl.frontFace(state.frontFace);
		}
		if (state.lineWidth !== undefined) {
			gl.lineWidth(state.lineWidth);
		}

		if (state.blendFuncSeparate) {
			gl.blendFuncSeparate(
				state.blendFuncSeparate[0],
				state.blendFuncSeparate[1],
				state.blendFuncSeparate[2],
				state.blendFuncSeparate[3],
			);
		} else if (state.blendFunc) {
			gl.blendFunc(state.blendFunc[0], state.blendFunc[1]);
		}

		if (state.blendEquationSeparate) {
			gl.blendEquationSeparate(state.blendEquationSeparate[0], state.blendEquationSeparate[1]);
		} else if (state.blendEquation !== undefined) {
			gl.blendEquation(state.blendEquation);
		}

		if (state.stencilFunc) {
			gl.stencilFunc(state.stencilFunc[0], state.stencilFunc[1], state.stencilFunc[2]);
		}
		if (state.stencilOp) {
			gl.stencilOp(state.stencilOp[0], state.stencilOp[1], state.stencilOp[2]);
		}

		if (state.polygonOffset) {
			gl.polygonOffset(state.polygonOffset[0], state.polygonOffset[1]);
		}
	}

	/**
	 * Capture a practical subset of current GL render state
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {object}
	 */
	static capture(gl) {
		if (!gl) {
			throw new TypeError("State.capture needs gl");
		}
		return {
			viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
			scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
			clearColor: Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE)),
			clearDepth: gl.getParameter(gl.DEPTH_CLEAR_VALUE),
			clearStencil: gl.getParameter(gl.STENCIL_CLEAR_VALUE),
			colorMask: Array.from(gl.getParameter(gl.COLOR_WRITEMASK)),
			depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
			depthTest: gl.isEnabled(gl.DEPTH_TEST),
			blend: gl.isEnabled(gl.BLEND),
			cull: gl.isEnabled(gl.CULL_FACE),
			scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
			stencilTest: gl.isEnabled(gl.STENCIL_TEST),
			polygonOffsetEnabled: gl.isEnabled(gl.POLYGON_OFFSET_FILL),
			depthFunc: gl.getParameter(gl.DEPTH_FUNC),
			cullFace: gl.getParameter(gl.CULL_FACE_MODE),
			frontFace: gl.getParameter(gl.FRONT_FACE),
			lineWidth: gl.getParameter(gl.LINE_WIDTH),
			blendEquationSeparate: [
				gl.getParameter(gl.BLEND_EQUATION_RGB),
				gl.getParameter(gl.BLEND_EQUATION_ALPHA),
			],
			blendFuncSeparate: [
				gl.getParameter(gl.BLEND_SRC_RGB),
				gl.getParameter(gl.BLEND_DST_RGB),
				gl.getParameter(gl.BLEND_SRC_ALPHA),
				gl.getParameter(gl.BLEND_DST_ALPHA),
			],
			stencilFunc: [
				gl.getParameter(gl.STENCIL_FUNC),
				gl.getParameter(gl.STENCIL_REF),
				gl.getParameter(gl.STENCIL_VALUE_MASK),
			],
			stencilOp: [
				gl.getParameter(gl.STENCIL_FAIL),
				gl.getParameter(gl.STENCIL_PASS_DEPTH_FAIL),
				gl.getParameter(gl.STENCIL_PASS_DEPTH_PASS),
			],
			polygonOffset: [
				gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
				gl.getParameter(gl.POLYGON_OFFSET_UNITS),
			],
		};
	}

	/**
	 * Enable or disable one GL capability when value is explicit
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} cap GL capability enum
	 * @param {boolean|undefined} enabled desired state
	 * @returns {void}
	 */
	static _toggle(gl, cap, enabled) {
		if (enabled === undefined) {
			return;
		}
		if (enabled) {
			gl.enable(cap);
		} else {
			gl.disable(cap);
		}
	}
}


// ------ Framebuffer ------

export class Framebuffer {
	/**
	 * Create framebuffer with optional color/depth attachments
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] framebuffer options
	 * @returns {object}
	 */
	static create(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Framebuffer.create needs gl");
		}

		const target = options.target ?? gl.FRAMEBUFFER;
		const framebuffer = gl.createFramebuffer();
		if (!framebuffer) {
			throw new Error("Framebuffer.create failed to create framebuffer");
		}

		gl.bindFramebuffer(target, framebuffer);

		const colorAttachments = Array.isArray(options.colorAttachments) ? options.colorAttachments : [];
		for (let i = 0; i < colorAttachments.length; i++) {
			const a = colorAttachments[i];
			const attachment = a.attachment ?? (gl.COLOR_ATTACHMENT0 + i);
			Framebuffer._attach(gl, target, attachment, a);
		}

		if (options.depthAttachment) {
			Framebuffer._attach(gl, target, gl.DEPTH_ATTACHMENT, options.depthAttachment);
		}
		if (options.stencilAttachment) {
			Framebuffer._attach(gl, target, gl.STENCIL_ATTACHMENT, options.stencilAttachment);
		}
		if (options.depthStencilAttachment) {
			Framebuffer._attach(gl, target, gl.DEPTH_STENCIL_ATTACHMENT, options.depthStencilAttachment);
		}

		if (colorAttachments.length > 0 && gl.drawBuffers) {
			const drawBuffers = colorAttachments.map((a, i) => a.drawBuffer ?? (gl.COLOR_ATTACHMENT0 + i));
			gl.drawBuffers(drawBuffers);
		}

		const status = gl.checkFramebufferStatus(target);
		if (!(options.skipCheck ?? false) && status !== gl.FRAMEBUFFER_COMPLETE) {
			gl.bindFramebuffer(target, null);
			gl.deleteFramebuffer(framebuffer);
			throw new Error("Framebuffer.create got incomplete framebuffer status: 0x" + status.toString(16));
		}

		gl.bindFramebuffer(target, null);
		return {
			framebuffer,
			target,
			status,
			colorAttachments,
			depthAttachment: options.depthAttachment ?? null,
			stencilAttachment: options.stencilAttachment ?? null,
			depthStencilAttachment: options.depthStencilAttachment ?? null,
		};
	}

	/**
	 * Create renderbuffer helper for depth/stencil attachment paths
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] renderbuffer options
	 * @returns {WebGLRenderbuffer}
	 */
	static createRenderbuffer(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Framebuffer.createRenderbuffer needs gl");
		}
		const renderbuffer = gl.createRenderbuffer();
		if (!renderbuffer) {
			throw new Error("Framebuffer.createRenderbuffer failed to create renderbuffer");
		}
		const target = options.target ?? gl.RENDERBUFFER;
		gl.bindRenderbuffer(target, renderbuffer);
		gl.renderbufferStorage(
			target,
			options.internalFormat ?? gl.DEPTH24_STENCIL8,
			options.width ?? 1,
			options.height ?? 1,
		);
		gl.bindRenderbuffer(target, null);
		return renderbuffer;
	}

	/**
	 * Bind framebuffer or bundle from Framebuffer.create
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLFramebuffer|object|null} framebuffer framebuffer handle or bundle
	 * @param {number} [target = gl.FRAMEBUFFER] target enum
	 * @returns {void}
	 */
	static bind(gl, framebuffer, target = gl.FRAMEBUFFER) {
		if (!gl) {
			throw new TypeError("Framebuffer.bind needs gl");
		}
		const fb = framebuffer && framebuffer.framebuffer ? framebuffer.framebuffer : framebuffer;
		gl.bindFramebuffer(target, fb ?? null);
	}

	/**
	 * Check framebuffer status on target
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} [target = gl.FRAMEBUFFER] target enum
	 * @returns {number}
	 */
	static check(gl, target = gl.FRAMEBUFFER) {
		if (!gl) {
			throw new TypeError("Framebuffer.check needs gl");
		}
		return gl.checkFramebufferStatus(target);
	}

	/**
	 * Scoped framebuffer bind helper with automatic restore
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLFramebuffer|object|null} framebuffer framebuffer handle or bundle
	 * @param {(gl: WebGL2RenderingContext) => any} callback callback body
	 * @param {object} [options = {}] scope options
	 * @returns {any}
	 */
	static with(gl, framebuffer, callback, options = {}) {
		if (!gl || typeof callback !== "function") {
			throw new TypeError("Framebuffer.with needs gl and callback");
		}
		const target = options.target ?? gl.FRAMEBUFFER;
		const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
		Framebuffer.bind(gl, framebuffer, target);
		try {
			return callback(gl);
		} finally {
			gl.bindFramebuffer(target, prev);
		}
	}

	/**
	 * Attach texture/renderbuffer to bound framebuffer
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} target framebuffer target
	 * @param {number} attachment attachment enum
	 * @param {object} source attachment source descriptor
	 * @returns {void}
	 */
	static _attach(gl, target, attachment, source) {
		if (source.texture) {
			gl.framebufferTexture2D(
				target,
				attachment,
				source.textureTarget ?? gl.TEXTURE_2D,
				source.texture,
				source.level ?? 0,
			);
			return;
		}
		if (source.renderbuffer) {
			gl.framebufferRenderbuffer(
				target,
				attachment,
				source.renderbufferTarget ?? gl.RENDERBUFFER,
				source.renderbuffer,
			);
			return;
		}
		throw new TypeError("Framebuffer attachment needs texture or renderbuffer");
	}
}


// ------ Pipeline ------

export class Pipeline {
	/**
	 * Create a lightweight pipeline bundle: program + vao + state
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] pipeline options
	 * @returns {object}
	 */
	static create(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Pipeline.create needs gl");
		}

		let program = options.program ?? null;
		if (!program && options.shader) {
			program = Shader.create(gl, options.shader);
		}
		if (!program) {
			throw new TypeError("Pipeline.create needs program or shader descriptor");
		}

		return {
			program,
			vao: options.vao ?? null,
			state: options.state ?? null,
			label: options.label ?? "Pipeline",
		};
	}

	/**
	 * Checked pipeline create, captures errors + optional GL error snapshot
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] pipeline options
	 * @param {object} [check = {}] checked create options
	 * @returns {object}
	 */
	static createChecked(gl, options = {}, check = {}) {
		if (!gl) {
			throw new TypeError("Pipeline.createChecked needs gl");
		}

		if (check.clearErrorsBefore ?? true) {
			Pipeline._drainErrors(gl, check.maxErrors ?? 16);
		}

		try {
			const pipeline = Pipeline.create(gl, options);
			const errors = Pipeline._drainErrors(gl, check.maxErrors ?? 16);
			const ok = errors.length === 0;
			if (!ok && (check.throwOnError ?? false)) {
				throw new Error("Pipeline.createChecked found GL errors: " + errors.join(", "));
			}
			return {
				ok,
				pipeline,
				error: null,
				errorMessage: ok ? null : "GL errors after create: " + errors.join(", "),
				glErrors: errors,
			};
		} catch (error) {
			if (check.throwOnError ?? false) {
				throw error;
			}
			const errors = Pipeline._drainErrors(gl, check.maxErrors ?? 16);
			return {
				ok: false,
				pipeline: null,
				error: error ?? null,
				errorMessage: String(error?.message ?? error),
				glErrors: errors,
			};
		}
	}

	/**
	 * Bind pipeline program and optional vao/state
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} pipeline pipeline object from Pipeline.create
	 * @param {object} [options = {}] runtime override options
	 * @returns {object}
	 */
	static use(gl, pipeline, options = {}) {
		if (!gl || !pipeline || !pipeline.program) {
			throw new TypeError("Pipeline.use needs gl and pipeline");
		}

		Shader.use(gl, pipeline.program);

		const vao = options.vao ?? pipeline.vao;
		if (vao) {
			VertexArray.bind(gl, vao);
		}

		const state = options.state ?? pipeline.state;
		if (state) {
			State.apply(gl, state);
		}

		return pipeline;
	}

	/**
	 * Drain GL error queue and return symbolic names
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} max max errors to drain
	 * @returns {string[]}
	 */
	static _drainErrors(gl, max = 16) {
		const out = [];
		for (let i = 0; i < max; i++) {
			const code = gl.getError();
			if (code === gl.NO_ERROR) break;
			out.push(Pipeline._errorName(gl, code));
		}
		return out;
	}

	/**
	 * Convert GL error enum into readable name
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} code error code
	 * @returns {string}
	 */
	static _errorName(gl, code) {
		if (code === gl.INVALID_ENUM) return "INVALID_ENUM";
		if (code === gl.INVALID_VALUE) return "INVALID_VALUE";
		if (code === gl.INVALID_OPERATION) return "INVALID_OPERATION";
		if (code === gl.INVALID_FRAMEBUFFER_OPERATION) return "INVALID_FRAMEBUFFER_OPERATION";
		if (code === gl.OUT_OF_MEMORY) return "OUT_OF_MEMORY";
		if (code === gl.CONTEXT_LOST_WEBGL) return "CONTEXT_LOST_WEBGL";
		return "0x" + Number(code).toString(16);
	}
}


// ------ Readback ------

export class Readback {
	/**
	 * Read pixels from active or provided framebuffer
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] readback options
	 * @returns {ArrayBufferView}
	 */
	static pixels(gl, options = {}) {
		if (!gl) {
			throw new TypeError("Readback.pixels needs gl");
		}

		const x = options.x ?? 0;
		const y = options.y ?? 0;
		const width = options.width ?? gl.drawingBufferWidth;
		const height = options.height ?? gl.drawingBufferHeight;
		const format = options.format ?? gl.RGBA;
		const type = options.type ?? gl.UNSIGNED_BYTE;

		let out = options.out ?? null;
		if (!out) {
			const channels = Readback._channelCount(gl, format);
			const count = Math.max(1, width * height * channels);
			if (type === gl.FLOAT) {
				out = new Float32Array(count);
			} else if (type === gl.UNSIGNED_INT || type === gl.UNSIGNED_INT_24_8) {
				out = new Uint32Array(count);
			} else if (type === gl.UNSIGNED_SHORT || type === gl.UNSIGNED_SHORT_5_6_5 || type === gl.UNSIGNED_SHORT_4_4_4_4 || type === gl.UNSIGNED_SHORT_5_5_5_1) {
				out = new Uint16Array(count);
			} else {
				out = new Uint8Array(count);
			}
		}

		const hasScopeFb = options.framebuffer !== undefined;
		let prev = null;
		const target = options.target ?? gl.FRAMEBUFFER;
		if (hasScopeFb) {
			prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
			Framebuffer.bind(gl, options.framebuffer, target);
		}

		try {
			gl.readPixels(x, y, width, height, format, type, out);
		} finally {
			if (hasScopeFb) {
				gl.bindFramebuffer(target, prev);
			}
		}

		return out;
	}

	/**
	 * Wait for GPU queue completion on current context
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {void}
	 */
	static sync(gl) {
		if (!gl) {
			throw new TypeError("Readback.sync needs gl");
		}
		gl.finish();
	}

	/**
	 * Map common pixel format enum to channel count
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {number} format pixel format enum
	 * @returns {number}
	 */
	static _channelCount(gl, format) {
		if (format === gl.RED || format === gl.RED_INTEGER || format === gl.DEPTH_COMPONENT) return 1;
		if (format === gl.RG || format === gl.RG_INTEGER || format === gl.DEPTH_STENCIL) return 2;
		if (format === gl.RGB || format === gl.RGB_INTEGER) return 3;
		return 4;
	}
}


// ------ ResourcePool ------

const _poolByGl = new WeakMap();

export class ResourcePool {
	/**
	 * Acquire one pooled resource or create a new one
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string} kind resource kind label like "buffer" or "texture"
	 * @param {string} key reuse bucket key
	 * @param {(gl: WebGL2RenderingContext) => any} factory create callback when miss
	 * @returns {any}
	 */
	static acquire(gl, kind, key, factory) {
		if (!gl || typeof kind !== "string" || typeof factory !== "function") {
			throw new TypeError("ResourcePool.acquire needs gl, kind, and factory");
		}
		const bucketKey = key ?? "__default";
		const state = ResourcePool._state(gl);
		const stack = ResourcePool._stack(state, kind, bucketKey);
		if (stack.length > 0) {
			state.stats.hits++;
			return stack.pop();
		}
		state.stats.misses++;
		return factory(gl);
	}

	/**
	 * Release one resource back into pool for later reuse
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string} kind resource kind label
	 * @param {string} key reuse bucket key
	 * @param {any} resource resource object
	 * @returns {void}
	 */
	static release(gl, kind, key, resource) {
		if (!gl || typeof kind !== "string" || !resource) {
			throw new TypeError("ResourcePool.release needs gl, kind, and resource");
		}
		const bucketKey = key ?? "__default";
		const state = ResourcePool._state(gl);
		const stack = ResourcePool._stack(state, kind, bucketKey);
		stack.push(resource);
		state.stats.released++;
	}

	/**
	 * Scoped helper that always returns resource to pool
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string} kind resource kind label
	 * @param {string} key reuse bucket key
	 * @param {(gl: WebGL2RenderingContext) => any} factory create callback
	 * @param {(resource: any, gl: WebGL2RenderingContext) => any} callback body callback
	 * @returns {any}
	 */
	static with(gl, kind, key, factory, callback) {
		if (typeof callback !== "function") {
			throw new TypeError("ResourcePool.with needs callback");
		}
		const resource = ResourcePool.acquire(gl, kind, key, factory);
		try {
			return callback(resource, gl);
		} finally {
			ResourcePool.release(gl, kind, key, resource);
		}
	}

	/**
	 * Read current pool counters
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {object}
	 */
	static stats(gl) {
		if (!gl) {
			throw new TypeError("ResourcePool.stats needs gl");
		}
		const state = ResourcePool._state(gl);
		return {
			hits: state.stats.hits,
			misses: state.stats.misses,
			released: state.stats.released,
		};
	}

	/**
	 * Clear all pooled resources, optional destroy pass
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] clear options
	 * @returns {number}
	 */
	static clear(gl, options = {}) {
		if (!gl) {
			throw new TypeError("ResourcePool.clear needs gl");
		}
		const state = _poolByGl.get(gl);
		if (!state) {
			return 0;
		}
		let removed = 0;
		for (const [kind, byKey] of state.kinds) {
			for (const stack of byKey.values()) {
				removed += stack.length;
				if (options.destroy ?? false) {
					for (const resource of stack) {
						ResourcePool._destroy(gl, kind, resource);
					}
				}
			}
		}
		state.kinds.clear();
		state.stats.hits = 0;
		state.stats.misses = 0;
		state.stats.released = 0;
		return removed;
	}

	/**
	 * Resolve or create pool state bucket for one GL context
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {object}
	 */
	static _state(gl) {
		let state = _poolByGl.get(gl);
		if (!state) {
			state = {
				kinds: new Map(),
				stats: { hits: 0, misses: 0, released: 0 },
			};
			_poolByGl.set(gl, state);
		}
		return state;
	}

	/**
	 * Resolve one stack bucket for kind + key
	 * @param {object} state internal pool state
	 * @param {string} kind resource kind
	 * @param {string} key bucket key
	 * @returns {any[]}
	 */
	static _stack(state, kind, key) {
		let byKey = state.kinds.get(kind);
		if (!byKey) {
			byKey = new Map();
			state.kinds.set(kind, byKey);
		}
		let stack = byKey.get(key);
		if (!stack) {
			stack = [];
			byKey.set(key, stack);
		}
		return stack;
	}

	/**
	 * Best effort resource deletion by kind
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string} kind resource kind
	 * @param {any} resource pooled resource
	 * @returns {void}
	 */
	static _destroy(gl, kind, resource) {
		if (!resource) {
			return;
		}
		if (kind === "buffer") {
			gl.deleteBuffer(resource.buffer ?? resource);
			return;
		}
		if (kind === "texture") {
			gl.deleteTexture(resource.texture ?? resource);
			return;
		}
		if (kind === "renderbuffer") {
			gl.deleteRenderbuffer(resource.renderbuffer ?? resource);
			return;
		}
		if (kind === "framebuffer") {
			gl.deleteFramebuffer(resource.framebuffer ?? resource);
			return;
		}
		if (kind === "vertexArray" || kind === "vao") {
			gl.deleteVertexArray(resource.vao ?? resource);
			return;
		}
		if (kind === "program") {
			gl.deleteProgram(resource.program ?? resource);
			return;
		}
		if (kind === "shader") {
			gl.deleteShader(resource.shader ?? resource);
		}
	}
}


// ------ LayoutCache ------

const _layoutCacheByGl = new WeakMap();
const _layoutRefId = new WeakMap();
let _layoutRefCounter = 1;

export class LayoutCache {
	/**
	 * Build a stable key from attribute descriptors and index buffer
	 * @param {object[]} attributes attribute descriptors
	 * @param {object} [options = {}] key build options
	 * @returns {string}
	 */
	static keyFromAttributes(attributes, options = {}) {
		if (!Array.isArray(attributes)) {
			throw new TypeError("LayoutCache.keyFromAttributes needs attributes array");
		}
		const attrs = attributes.map((a) => ({
			index: a.index,
			size: a.size,
			type: a.type,
			normalized: !!a.normalized,
			stride: a.stride ?? 0,
			offset: a.offset ?? 0,
			divisor: a.divisor ?? 0,
			integer: !!a.integer,
			target: a.target ?? 0,
			bufferRef: LayoutCache._refId(a.buffer ?? null),
		}));
		const indexRef = LayoutCache._refId(options.indexBuffer ?? null);
		return JSON.stringify({
			attrs,
			indexType: options.indexType ?? 0,
			indexRef,
			label: options.label ?? "",
		});
	}

	/**
	 * Read cached value by key
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string} key cache key
	 * @returns {any|null}
	 */
	static get(gl, key) {
		if (!gl || typeof key !== "string") {
			throw new TypeError("LayoutCache.get needs gl and key");
		}
		const map = _layoutCacheByGl.get(gl);
		if (!map) {
			return null;
		}
		return map.get(key) ?? null;
	}

	/**
	 * Store cached value by key
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {string} key cache key
	 * @param {any} value value to cache
	 * @returns {any}
	 */
	static set(gl, key, value) {
		if (!gl || typeof key !== "string") {
			throw new TypeError("LayoutCache.set needs gl and key");
		}
		let map = _layoutCacheByGl.get(gl);
		if (!map) {
			map = new Map();
			_layoutCacheByGl.set(gl, map);
		}
		map.set(key, value);
		return value;
	}

	/**
	 * Get cached value or create and store on miss
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] get-or-create options
	 * @returns {object}
	 */
	static getOrCreate(gl, options = {}) {
		if (!gl) {
			throw new TypeError("LayoutCache.getOrCreate needs gl");
		}
		const create = options.create;
		if (typeof create !== "function") {
			throw new TypeError("LayoutCache.getOrCreate needs create callback");
		}
		const key = options.key ?? LayoutCache.keyFromAttributes(options.attributes ?? [], options);
		const cached = LayoutCache.get(gl, key);
		if (cached !== null) {
			return { key, value: cached, hit: true };
		}
		const created = create(gl, key);
		LayoutCache.set(gl, key, created);
		return { key, value: created, hit: false };
	}

	/**
	 * Create one VAO from attributes and cache it by layout key
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] vao creation options
	 * @returns {object}
	 */
	static createVAO(gl, options = {}) {
		const attributes = options.attributes ?? [];
		const result = LayoutCache.getOrCreate(gl, {
			...options,
			attributes,
			create: () => {
				const vao = gl.createVertexArray();
				if (!vao) {
					throw new Error("LayoutCache.createVAO failed to create vao");
				}
				gl.bindVertexArray(vao);
				for (const a of attributes) {
					if (!a || a.index === undefined || a.size === undefined) {
						throw new TypeError("LayoutCache.createVAO got invalid attribute descriptor");
					}
					const target = a.target ?? gl.ARRAY_BUFFER;
					if (a.buffer) {
						gl.bindBuffer(target, a.buffer);
					}
					gl.enableVertexAttribArray(a.index);
					if (a.integer ?? false) {
						gl.vertexAttribIPointer(
							a.index,
							a.size,
							a.type ?? gl.INT,
							a.stride ?? 0,
							a.offset ?? 0,
						);
					} else {
						gl.vertexAttribPointer(
							a.index,
							a.size,
							a.type ?? gl.FLOAT,
							a.normalized ?? false,
							a.stride ?? 0,
							a.offset ?? 0,
						);
					}
					if (a.divisor !== undefined) {
						gl.vertexAttribDivisor(a.index, a.divisor);
					}
				}
				if (options.indexBuffer) {
					gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, options.indexBuffer);
				}
				if (typeof options.configure === "function") {
					options.configure(gl, vao);
				}
				gl.bindVertexArray(null);
				gl.bindBuffer(gl.ARRAY_BUFFER, null);
				return vao;
			},
		});
		return {
			key: result.key,
			vao: result.value,
			hit: result.hit,
		};
	}

	/**
	 * Clear all cached layout entries for one context
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {number}
	 */
	static clear(gl) {
		if (!gl) {
			throw new TypeError("LayoutCache.clear needs gl");
		}
		const map = _layoutCacheByGl.get(gl);
		if (!map) {
			return 0;
		}
		const size = map.size;
		map.clear();
		return size;
	}

	/**
	 * Build small numeric id for object refs used in cache key
	 * @param {object|null} value object reference
	 * @returns {number}
	 */
	static _refId(value) {
		if (!value || (typeof value !== "object" && typeof value !== "function")) {
			return 0;
		}
		let id = _layoutRefId.get(value);
		if (!id) {
			id = _layoutRefCounter++;
			_layoutRefId.set(value, id);
		}
		return id;
	}
}


// ------ Timer ------

export class Timer {
	/**
	 * Return query support status and fallback reason
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {object}
	 */
	static supportInfo(gl) {
		if (!gl) {
			return {
				supported: false,
				reason: "gl context is missing",
				checks: { hasGl: false },
			};
		}

		const ext = Ext.get(gl, "EXT_disjoint_timer_query_webgl2");
		const hasCreateQuery = typeof gl.createQuery === "function";
		const hasBeginQuery = typeof gl.beginQuery === "function";
		const hasEndQuery = typeof gl.endQuery === "function";
		const hasGetQueryParameter = typeof gl.getQueryParameter === "function";
		const hasExt = !!ext;

		if (!hasExt) {
			return {
				supported: false,
				reason: "EXT_disjoint_timer_query_webgl2 is unavailable",
				checks: { hasGl: true, hasExt, hasCreateQuery, hasBeginQuery, hasEndQuery, hasGetQueryParameter },
			};
		}
		if (!hasCreateQuery || !hasBeginQuery || !hasEndQuery || !hasGetQueryParameter) {
			return {
				supported: false,
				reason: "query APIs are missing in this runtime",
				checks: { hasGl: true, hasExt, hasCreateQuery, hasBeginQuery, hasEndQuery, hasGetQueryParameter },
			};
		}

		return {
			supported: true,
			reason: "timer query path looks available",
			checks: { hasGl: true, hasExt, hasCreateQuery, hasBeginQuery, hasEndQuery, hasGetQueryParameter },
		};
	}

	/**
	 * Convenience bool for query timing support
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @returns {boolean}
	 */
	static supported(gl) {
		return Timer.supportInfo(gl).supported;
	}

	/**
	 * Create timer state with gpu path when possible, cpu fallback otherwise
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {object} [options = {}] timer options
	 * @returns {object}
	 */
	static create(gl, options = {}) {
		const support = Timer.supportInfo(gl);
		const preferGpu = options.preferGpu ?? true;
		const canUseGpu = support.supported && preferGpu;
		if (!canUseGpu) {
			return {
				mode: "cpu",
				fallbackReason: preferGpu ? support.reason : "gpu timer was not requested",
			};
		}
		return {
			mode: "gpu",
			ext: Ext.get(gl, "EXT_disjoint_timer_query_webgl2"),
		};
	}

	/**
	 * Measure one workload with query timer when possible, cpu fallback otherwise
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {(gl: WebGL2RenderingContext) => any | Promise<any>} encode workload callback
	 * @param {object} [options = {}] measure options
	 * @returns {Promise<object>}
	 */
	static async measure(gl, encode, options = {}) {
		if (!gl) {
			throw new TypeError("Timer.measure needs gl");
		}
		if (typeof encode !== "function") {
			throw new TypeError("Timer.measure needs encode callback");
		}

		const timer = options.timer ?? Timer.create(gl, options);
		if (timer.mode === "gpu" && timer.ext) {
			const query = gl.createQuery();
			if (!query) {
				return Timer._measureCpu(gl, encode, "query creation failed");
			}

			const ext = timer.ext;
			try {
				gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
				const value = await encode(gl);
				gl.endQuery(ext.TIME_ELAPSED_EXT);
				gl.flush();

				const timeoutMs = Math.max(16, Number(options.timeoutMs ?? 2000) || 2000);
				const pollMs = Math.max(1, Number(options.pollMs ?? 4) || 4);
				const ok = await Timer._waitQuery(gl, query, timeoutMs, pollMs);
				if (!ok) {
					gl.deleteQuery(query);
					return Timer._measureCpu(gl, async () => value, "query result timed out");
				}

				const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
				if (disjoint) {
					gl.deleteQuery(query);
					return Timer._measureCpu(gl, async () => value, "gpu disjoint state active");
				}

				const ns = Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
				gl.deleteQuery(query);
				return {
					mode: "gpu",
					gpuMs: ns / 1000000,
					ns,
					value,
				};
			} catch (_error) {
				try {
					gl.endQuery(ext.TIME_ELAPSED_EXT);
				} catch (_endError) {
					// ignore
				}
				gl.deleteQuery(query);
				return Timer._measureCpu(gl, encode, "gpu timer path failed");
			}
		}

		return Timer._measureCpu(gl, encode, timer.fallbackReason);
	}

	/**
	 * CPU fallback measure path
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {(gl: WebGL2RenderingContext) => any | Promise<any>} encode workload callback
	 * @param {string} fallbackReason fallback reason
	 * @returns {Promise<object>}
	 */
	static async _measureCpu(gl, encode, fallbackReason) {
		const t0 = performance.now();
		const value = await encode(gl);
		gl.finish();
		const t1 = performance.now();
		return {
			mode: "cpu",
			cpuMs: t1 - t0,
			fallbackReason,
			value,
		};
	}

	/**
	 * Poll query availability until ready or timeout
	 * @param {WebGL2RenderingContext} gl WebGL2 context
	 * @param {WebGLQuery} query query object
	 * @param {number} timeoutMs timeout
	 * @param {number} pollMs poll interval
	 * @returns {Promise<boolean>}
	 */
	static async _waitQuery(gl, query, timeoutMs, pollMs) {
		const start = performance.now();
		while ((performance.now() - start) < timeoutMs) {
			const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
			if (available) return true;
			await new Promise((resolve) => setTimeout(resolve, pollMs));
		}
		return false;
	}
}


export const AzWGL = {
	Context,
	Shader,
	Buffer,
	VertexArray,
	Uniform,
	UniformBlock,
	Texture,
	Draw,
	Limits,
	Ext,
	State,
	Framebuffer,
	Pipeline,
	Readback,
	ResourcePool,
	LayoutCache,
	Timer,
};

if (typeof window !== "undefined") {
	window.AzWGL = AzWGL;
}

export default AzWGL;





