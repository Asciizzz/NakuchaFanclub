/* BzWGL
By Asciiz

WebGL refuses to die so we might as well organize it

#BzContext:
	- Creates runtime with WebGL2 first then WebGL1 fallback
	- Methods
		+ request(canvas, options = {})
		+ configure(runtimeOrGl, config = {})
		+ resize(runtimeOrGl, options = {})
		+ onLost(runtimeOrGl, onLost, onRestored, options = {})
		+ getInfo(runtimeOrGl)
		+ gl(runtimeOrGl)

#BzExtensions:
	- Extension discovery/cache and required extension checks
	- Methods
		+ get(runtimeOrGl, name, options = {})
		+ require(runtimeOrGl, extensionNames)
		+ list(runtimeOrGl)

#BzLimits:
	- Capability inspect/check helper with fail-fast require
	- Methods
		+ inspect(runtimeOrGl)
		+ hasExtensions(runtimeOrGl, extensionNames)
		+ require(runtimeOrGl, constraints = {})

#BzShader:
	- Shader compile helpers with error logs that are actually useful
	- Methods
		+ create(runtimeOrGl, descriptor)
		+ fromDescriptor(runtimeOrGl, descriptor)
		+ destroyAll(runtimeOrGl, shaders)

#BzProgram:
	- Program link helpers plus uniform/attribute reflection
	- Methods
		+ create(runtimeOrGl, descriptor)
		+ use(runtimeOrGl, program)
		+ getUniforms(runtimeOrGl, program)
		+ getAttributes(runtimeOrGl, program)
		+ destroy(runtimeOrGl, program)
		+ destroyAll(runtimeOrGl, programs)

#BzBuffer:
	- Thin buffer utility for create/write/read/orphan/cleanup
	- Methods
		+ create(runtimeOrGl, descriptor)
		+ write(runtimeOrGl, target, buffer, data, options = {})
		+ orphan(runtimeOrGl, target, buffer, size, usage)
		+ read(runtimeOrGl, target, buffer, options = {})
		+ destroyAll(runtimeOrGl, buffers)

#BzVertexArray:
	- VAO helpers for WebGL2 and OES fallback path on WebGL1
	- Methods
		+ create(runtimeOrGl, descriptor = {})
		+ bind(runtimeOrGl, vao)
		+ apply(runtimeOrGl, layout = [], options = {})
		+ destroy(runtimeOrGl, vao)

#BzTexture:
	- Texture creation and upload helpers for 2D and cubemap
	- Methods
		+ create2D(runtimeOrGl, descriptor = {})
		+ upload2D(runtimeOrGl, texture, source, descriptor = {})
		+ createCube(runtimeOrGl, descriptor = {})
		+ setParams(runtimeOrGl, target, params = {})
		+ destroyAll(runtimeOrGl, textures)

#BzFramebuffer:
	- Framebuffer create/attach/check helpers with drawBuffers support
	- Methods
		+ create(runtimeOrGl, descriptor = {})
		+ bind(runtimeOrGl, framebufferOrRecord, target)
		+ attachTexture2D(runtimeOrGl, framebufferOrRecord, attachment, texture, level = 0, options = {})
		+ check(runtimeOrGl, target)
		+ destroyAll(runtimeOrGl, framebuffers)

#BzState:
	- Common render state setup for viewport, clear, depth, blend, cull, flags
	- Methods
		+ setViewport(runtimeOrGl, viewport = {})
		+ setClear(runtimeOrGl, descriptor = {})
		+ setDepth(runtimeOrGl, descriptor = {})
		+ setBlend(runtimeOrGl, descriptor = {})
		+ setCull(runtimeOrGl, descriptor = {})
		+ setFlags(runtimeOrGl, descriptor = {})

#BzUniform:
	- Uniform location cache + typed upload helper with light inference
	- Methods
		+ location(runtimeOrGl, program, name, options = {})
		+ set(runtimeOrGl, location, value, hint)
		+ applyMap(runtimeOrGl, program, uniformMap, options = {})

#BzDraw:
	- Draw wrappers for arrays/elements and instanced variants
	- Methods
		+ clear(runtimeOrGl, descriptor = {})
		+ arrays(runtimeOrGl, descriptor)
		+ elements(runtimeOrGl, descriptor)
		+ arraysInstanced(runtimeOrGl, descriptor)
		+ elementsInstanced(runtimeOrGl, descriptor)

#BzFrame:
	- Frame scope helper for begin/end style render flow
	- Methods
		+ begin(runtimeOrGl, options = {})
		+ end(runtimeOrGl, frame, options = {})
		+ with(runtimeOrGl, callback, options = {})

#BzResourcePool:
	- Reuses transient buffers/textures to reduce alloc churn
	- Methods
		+ create(options = {})
		+ acquireBuffer(pool, runtimeOrGl, descriptor, key)
		+ releaseBuffer(pool, buffer, key)
		+ acquireTexture2D(pool, runtimeOrGl, descriptor, key)
		+ releaseTexture(pool, texture, key)
		+ stats(pool)
		+ destroy(pool, runtimeOrGl)

#BzBatch:
	- Draw packet list runner so ECS render code can stay data-driven
	- Methods
		+ create(options = {})
		+ push(batch, drawCall)
		+ clear(batch)
		+ run(runtimeOrGl, batch, options = {})

#BzTimer:
	- Measures workloads with EXT timer query path or CPU fallback
	- Methods
		+ supported(runtimeOrGl)
		+ create(runtimeOrGl, options = {})
		+ measure(runtimeOrGl, encode, options = {})
		+ destroy(runtimeOrGl, timer)

#BzFormat:
	- Handy format defaults for textures and framebuffer setup
	- Methods
		+ texture2D(runtimeOrGl, overrides = {})
		+ cube(runtimeOrGl, overrides = {})
		+ framebuffer(runtimeOrGl, width, height, overrides = {})
*/


// ------ internal helpers ------

function bzIsWebGL2(gl) {
	return typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
}

function bzBuildRuntimeFromGl(gl, canvas, version) {
	if (!gl || typeof gl.getParameter !== "function") {
		throw new TypeError("BzWGL requires a WebGL context");
	}

	return {
		gl,
		canvas: canvas ?? gl.canvas ?? null,
		version: version ?? (bzIsWebGL2(gl) ? "webgl2" : "webgl"),
		isWebGL2: bzIsWebGL2(gl),
		extensions: new Map(),
		stateCache: {
			viewport: null,
			depth: null,
			blend: null,
			cull: null,
			flags: Object.create(null),
		},
	};
}

function bzResolveRuntime(runtimeOrGl) {
	if (!runtimeOrGl) {
		throw new TypeError("BzWGL method requires runtime or WebGL context");
	}

	if (runtimeOrGl.gl && typeof runtimeOrGl.gl.getParameter === "function") {
		if (!(runtimeOrGl.extensions instanceof Map)) {
			runtimeOrGl.extensions = new Map();
		}
		if (!runtimeOrGl.stateCache || typeof runtimeOrGl.stateCache !== "object") {
			runtimeOrGl.stateCache = {
				viewport: null,
				depth: null,
				blend: null,
				cull: null,
				flags: Object.create(null),
			};
		}
		if (typeof runtimeOrGl.isWebGL2 !== "boolean") {
			runtimeOrGl.isWebGL2 = bzIsWebGL2(runtimeOrGl.gl);
		}
		if (!runtimeOrGl.version) {
			runtimeOrGl.version = runtimeOrGl.isWebGL2 ? "webgl2" : "webgl";
		}
		if (!runtimeOrGl.canvas) {
			runtimeOrGl.canvas = runtimeOrGl.gl.canvas ?? null;
		}
		return runtimeOrGl;
	}

	if (typeof runtimeOrGl.getParameter === "function") {
		return bzBuildRuntimeFromGl(runtimeOrGl, runtimeOrGl.canvas ?? null);
	}

	throw new TypeError("Expected runtime object or WebGL context");
}

function bzIsTypedArray(value) {
	return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function bzNow() {
	if (typeof performance !== "undefined" && typeof performance.now === "function") {
		return performance.now();
	}
	return Date.now();
}

function bzStableKey(value) {
	const seen = new WeakSet();
	return JSON.stringify(value, function stableReplacer(_key, current) {
		if (typeof current === "bigint") {
			return current.toString();
		}
		if (typeof current === "function") {
			return "[Function]";
		}
		if (!current || typeof current !== "object") {
			return current;
		}
		if (seen.has(current)) {
			return "[Circular]";
		}
		seen.add(current);
		if (Array.isArray(current)) {
			return current;
		}
		const out = {};
		for (const key of Object.keys(current).sort()) {
			out[key] = current[key];
		}
		return out;
	});
}

function bzClamp01(value) {
	return Math.max(0, Math.min(1, Number(value)));
}

function bzPlainObject(value) {
	return !!value && typeof value === "object" && !Array.isArray(value);
}


// ------ BzContext ------

class BzContext {
	/**
	 * Create runtime context with WebGL2 first then WebGL1 fallback
	 * @param {HTMLCanvasElement} canvas target canvas
	 * @param {object} [options = {}] context request options
	 * @returns {object} runtime object
	 */
	static request(canvas, options = {}) {
		if (!canvas || typeof canvas.getContext !== "function") {
			throw new TypeError("BzContext.request requires a canvas element");
		}

		const order = Array.isArray(options.order) && options.order.length > 0
			? options.order
			: ["webgl2", "webgl", "experimental-webgl"];

		const attributes = options.attributes ?? {};
		let gl = null;
		let version = null;

		for (const kind of order) {
			try {
				gl = canvas.getContext(kind, attributes);
			} catch (_error) {
				gl = null;
			}
			if (gl) {
				version = kind;
				break;
			}
		}

		if (!gl) {
			throw new Error("Failed to create a WebGL context from the requested order");
		}

		const runtime = bzBuildRuntimeFromGl(gl, canvas, version);

		if (options.configure !== false) {
			BzContext.configure(runtime, options.config ?? {});
		}

		return runtime;
	}

	/**
	 * Configure drawing buffer size, viewport, and clear defaults
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [config = {}] configure options
	 * @returns {object} runtime object
	 */
	static configure(runtimeOrGl, config = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		if (config.autoResize ?? true) {
			BzContext.resize(runtime, {
				width: config.width,
				height: config.height,
				pixelRatio: config.pixelRatio,
				ceil: config.ceil,
				viewport: config.viewport !== false,
			});
		} else if (config.viewport !== false) {
			const width = Number(config.width ?? gl.drawingBufferWidth);
			const height = Number(config.height ?? gl.drawingBufferHeight);
			gl.viewport(0, 0, width, height);
			runtime.stateCache.viewport = { x: 0, y: 0, width, height };
		}

		if (Array.isArray(config.clearColor) && config.clearColor.length >= 4) {
			gl.clearColor(
				Number(config.clearColor[0]),
				Number(config.clearColor[1]),
				Number(config.clearColor[2]),
				Number(config.clearColor[3]),
			);
		}
		if (typeof config.clearDepth === "number") {
			gl.clearDepth(config.clearDepth);
		}
		if (typeof config.clearStencil === "number") {
			gl.clearStencil(config.clearStencil);
		}

		return runtime;
	}

	/**
	 * Resize drawing buffer from canvas client size and optional DPR
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [options = {}] resize options
	 * @returns {object} new width/height result
	 */
	static resize(runtimeOrGl, options = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;
		const canvas = runtime.canvas ?? gl.canvas;

		if (!canvas) {
			return {
				width: gl.drawingBufferWidth,
				height: gl.drawingBufferHeight,
				resized: false,
			};
		}

		const dprSource = options.pixelRatio
			?? (typeof window !== "undefined" ? window.devicePixelRatio : 1)
			?? 1;
		const dpr = Number.isFinite(dprSource) && dprSource > 0 ? dprSource : 1;
		const ceil = options.ceil ?? true;

		const srcWidth = Number(options.width ?? canvas.clientWidth ?? canvas.width ?? 1);
		const srcHeight = Number(options.height ?? canvas.clientHeight ?? canvas.height ?? 1);

		const width = Math.max(1, ceil ? Math.ceil(srcWidth * dpr) : Math.floor(srcWidth * dpr));
		const height = Math.max(1, ceil ? Math.ceil(srcHeight * dpr) : Math.floor(srcHeight * dpr));

		const resized = canvas.width !== width || canvas.height !== height;
		if (resized) {
			canvas.width = width;
			canvas.height = height;
		}

		if (options.viewport ?? true) {
			gl.viewport(0, 0, width, height);
			runtime.stateCache.viewport = { x: 0, y: 0, width, height };
		}

		return { width, height, resized };
	}

	/**
	 * Attach context lost and restored handlers
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {(event: Event, runtime: object) => any} onLost lost callback
	 * @param {(event: Event, runtime: object) => any} onRestored restored callback
	 * @param {object} [options = {}] listener options
	 * @returns {Function} cleanup function that removes listeners
	 */
	static onLost(runtimeOrGl, onLost, onRestored, options = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const canvas = runtime.canvas ?? runtime.gl.canvas;
		if (!canvas || typeof canvas.addEventListener !== "function") {
			throw new TypeError("BzContext.onLost requires a runtime with an event-capable canvas");
		}

		const preventDefault = options.preventDefault ?? true;

		const lostHandler = (event) => {
			if (preventDefault && event && typeof event.preventDefault === "function") {
				event.preventDefault();
			}
			if (typeof onLost === "function") {
				onLost(event, runtime);
			}
		};

		const restoredHandler = (event) => {
			if (typeof onRestored === "function") {
				onRestored(event, runtime);
			}
		};

		canvas.addEventListener("webglcontextlost", lostHandler, false);
		canvas.addEventListener("webglcontextrestored", restoredHandler, false);

		return () => {
			canvas.removeEventListener("webglcontextlost", lostHandler, false);
			canvas.removeEventListener("webglcontextrestored", restoredHandler, false);
		};
	}

	/**
	 * Return quick runtime info and common capability values
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @returns {object} context info object
	 */
	static getInfo(runtimeOrGl) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;
		const debugInfo = BzExtensions.get(runtime, "WEBGL_debug_renderer_info", { optional: true });

		const renderer = debugInfo
			? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
			: gl.getParameter(gl.RENDERER);

		const vendor = debugInfo
			? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
			: gl.getParameter(gl.VENDOR);

		return {
			version: runtime.version,
			isWebGL2: runtime.isWebGL2,
			renderer,
			vendor,
			shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
			maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
			maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
			maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
			maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
			maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
		};
	}

	/**
	 * Return raw WebGL context from runtime or context input
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @returns {WebGLRenderingContext | WebGL2RenderingContext} raw context
	 */
	static gl(runtimeOrGl) {
		return bzResolveRuntime(runtimeOrGl).gl;
	}
}


// ------ BzExtensions ------

class BzExtensions {
	/**
	 * Get one extension with runtime-level caching
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {string} name extension name
	 * @param {object} [options = {}] optional behavior flags
	 * @returns {any} extension object or null
	 */
	static get(runtimeOrGl, name, options = {}) {
		if (typeof name !== "string" || name.length === 0) {
			throw new TypeError("BzExtensions.get requires a non-empty extension name");
		}

		const runtime = bzResolveRuntime(runtimeOrGl);
		if (runtime.extensions.has(name)) {
			return runtime.extensions.get(name);
		}

		const ext = runtime.gl.getExtension(name);
		if (ext) {
			runtime.extensions.set(name, ext);
			return ext;
		}

		const optional = options.optional ?? true;
		if (!optional) {
			throw new Error("Missing required WebGL extension: " + name);
		}

		return null;
	}

	/**
	 * Require an extension set and throw when one is missing
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {string[]} extensionNames extension names to require
	 * @returns {object} map object by extension name
	 */
	static require(runtimeOrGl, extensionNames) {
		if (!Array.isArray(extensionNames)) {
			throw new TypeError("BzExtensions.require expects extensionNames as an array");
		}

		const out = {};
		const missing = [];

		for (const name of extensionNames) {
			const ext = BzExtensions.get(runtimeOrGl, name, { optional: true });
			if (ext) {
				out[name] = ext;
			} else {
				missing.push(name);
			}
		}

		if (missing.length > 0) {
			throw new Error("Missing required WebGL extensions: " + missing.join(", "));
		}

		return out;
	}

	/**
	 * List supported extension names sorted alphabetically
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @returns {string[]} extension name array
	 */
	static list(runtimeOrGl) {
		const gl = BzContext.gl(runtimeOrGl);
		const list = gl.getSupportedExtensions() ?? [];
		return [...list].sort();
	}
}


// ------ BzLimits ------

class BzLimits {
	/**
	 * Inspect common limits and extension support from runtime
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @returns {object} capability object
	 */
	static inspect(runtimeOrGl) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		const baseParams = {
			MAX_TEXTURE_SIZE: BzLimits._safeParam(gl, gl.MAX_TEXTURE_SIZE),
			MAX_CUBE_MAP_TEXTURE_SIZE: BzLimits._safeParam(gl, gl.MAX_CUBE_MAP_TEXTURE_SIZE),
			MAX_RENDERBUFFER_SIZE: BzLimits._safeParam(gl, gl.MAX_RENDERBUFFER_SIZE),
			MAX_VIEWPORT_DIMS: BzLimits._safeParam(gl, gl.MAX_VIEWPORT_DIMS),
			MAX_VERTEX_ATTRIBS: BzLimits._safeParam(gl, gl.MAX_VERTEX_ATTRIBS),
			MAX_VERTEX_UNIFORM_VECTORS: BzLimits._safeParam(gl, gl.MAX_VERTEX_UNIFORM_VECTORS),
			MAX_VARYING_VECTORS: BzLimits._safeParam(gl, gl.MAX_VARYING_VECTORS),
			MAX_FRAGMENT_UNIFORM_VECTORS: BzLimits._safeParam(gl, gl.MAX_FRAGMENT_UNIFORM_VECTORS),
			ALIASED_LINE_WIDTH_RANGE: BzLimits._safeParam(gl, gl.ALIASED_LINE_WIDTH_RANGE),
			ALIASED_POINT_SIZE_RANGE: BzLimits._safeParam(gl, gl.ALIASED_POINT_SIZE_RANGE),
			SAMPLES: BzLimits._safeParam(gl, gl.SAMPLES),
		};

		if (runtime.isWebGL2) {
			baseParams.MAX_3D_TEXTURE_SIZE = BzLimits._safeParam(gl, gl.MAX_3D_TEXTURE_SIZE);
			baseParams.MAX_ARRAY_TEXTURE_LAYERS = BzLimits._safeParam(gl, gl.MAX_ARRAY_TEXTURE_LAYERS);
			baseParams.MAX_DRAW_BUFFERS = BzLimits._safeParam(gl, gl.MAX_DRAW_BUFFERS);
			baseParams.MAX_COLOR_ATTACHMENTS = BzLimits._safeParam(gl, gl.MAX_COLOR_ATTACHMENTS);
			baseParams.MAX_UNIFORM_BUFFER_BINDINGS = BzLimits._safeParam(gl, gl.MAX_UNIFORM_BUFFER_BINDINGS);
			baseParams.MAX_UNIFORM_BLOCK_SIZE = BzLimits._safeParam(gl, gl.MAX_UNIFORM_BLOCK_SIZE);
			baseParams.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS = BzLimits._safeParam(
				gl,
				gl.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS,
			);
		}

		return {
			version: runtime.version,
			isWebGL2: runtime.isWebGL2,
			parameters: baseParams,
			extensions: BzExtensions.list(runtime),
		};
	}

	/**
	 * Check if all extension names are supported
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {string[]} extensionNames extension names to check
	 * @returns {boolean} true when all are supported
	 */
	static hasExtensions(runtimeOrGl, extensionNames) {
		if (!Array.isArray(extensionNames)) {
			throw new TypeError("BzLimits.hasExtensions requires extensionNames as an array");
		}
		const supported = new Set(BzExtensions.list(runtimeOrGl));
		return extensionNames.every((name) => supported.has(name));
	}

	/**
	 * Fail fast when required extensions or parameters are not met
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [constraints = {}] extension and parameter constraints
	 * @returns {object} summary of successful checks
	 */
	static require(runtimeOrGl, constraints = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		const requiredExtensions = Array.isArray(constraints.extensions) ? constraints.extensions : [];
		const requiredParams = constraints.parameters ?? constraints.limits ?? {};
		const label = constraints.label ?? "BzLimits.require";

		const missingExtensions = requiredExtensions.filter(
			(name) => !BzExtensions.get(runtime, name, { optional: true }),
		);

		const failedParams = [];
		for (const [name, requirement] of Object.entries(requiredParams)) {
			const enumValue = BzLimits._resolveEnum(gl, name);
			if (typeof enumValue === "undefined") {
				failedParams.push({
					name,
					requirement,
					actual: "unknown-parameter",
				});
				continue;
			}

			const actual = BzLimits._safeParam(gl, enumValue);
			if (!BzLimits._checkRequirement(actual, requirement)) {
				failedParams.push({ name, requirement, actual });
			}
		}

		if (missingExtensions.length > 0 || failedParams.length > 0) {
			const lines = [label + " failed"];
			if (missingExtensions.length > 0) {
				lines.push("Missing extensions: " + missingExtensions.join(", "));
			}
			if (failedParams.length > 0) {
				lines.push("Failed limits:");
				for (const fail of failedParams) {
					lines.push(
						" - " + fail.name
						+ " required " + BzLimits._requirementToText(fail.requirement)
						+ ", actual " + BzLimits._valueToText(fail.actual),
					);
				}
			}
			throw new Error(lines.join("\n"));
		}

		return {
			ok: true,
			checkedExtensions: requiredExtensions,
			checkedParameters: requiredParams,
		};
	}

	/**
	 * Safely query one GL parameter without hard-crashing on context issues
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {number} enumValue GL enum value
	 * @returns {any} parameter value or undefined
	 */
	static _safeParam(gl, enumValue) {
		try {
			return gl.getParameter(enumValue);
		} catch (_error) {
			return undefined;
		}
	}

	/**
	 * Resolve parameter name or enum-like value to numeric enum
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {string | number} key parameter name or enum
	 * @returns {number | undefined} resolved enum value
	 */
	static _resolveEnum(gl, key) {
		if (typeof key === "number") {
			return key;
		}
		if (typeof key === "string" && typeof gl[key] === "number") {
			return gl[key];
		}
		return undefined;
	}

	/**
	 * Evaluate one requirement against an actual parameter value
	 * @param {any} actual actual parameter value
	 * @param {any} requirement expected value rule
	 * @returns {boolean} true when requirement is satisfied
	 */
	static _checkRequirement(actual, requirement) {
		if (typeof requirement === "number") {
			return typeof actual === "number" && actual >= requirement;
		}

		if (Array.isArray(requirement)) {
			if (!actual || typeof actual.length !== "number") {
				return false;
			}
			for (let i = 0; i < requirement.length; i += 1) {
				const expected = requirement[i];
				if (typeof expected === "undefined" || expected === null) {
					continue;
				}
				if (i >= actual.length) {
					return false;
				}
				if (Number(actual[i]) < Number(expected)) {
					return false;
				}
			}
			return true;
		}

		if (bzPlainObject(requirement)) {
			if (Object.prototype.hasOwnProperty.call(requirement, "min")) {
				if (!(typeof actual === "number" && actual >= Number(requirement.min))) {
					return false;
				}
			}
			if (Object.prototype.hasOwnProperty.call(requirement, "max")) {
				if (!(typeof actual === "number" && actual <= Number(requirement.max))) {
					return false;
				}
			}
			if (Object.prototype.hasOwnProperty.call(requirement, "equals")) {
				if (actual !== requirement.equals) {
					return false;
				}
			}
			if (Array.isArray(requirement.oneOf)) {
				if (!requirement.oneOf.includes(actual)) {
					return false;
				}
			}
			return true;
		}

		return actual === requirement;
	}

	/**
	 * Convert requirement input into readable text for error messages
	 * @param {any} requirement expected value rule
	 * @returns {string} readable requirement string
	 */
	static _requirementToText(requirement) {
		if (typeof requirement === "number") {
			return ">= " + requirement;
		}
		if (Array.isArray(requirement)) {
			return "array >= [" + requirement.join(", ") + "]";
		}
		if (bzPlainObject(requirement)) {
			return bzStableKey(requirement);
		}
		return String(requirement);
	}

	/**
	 * Convert actual parameter value into readable text
	 * @param {any} value actual parameter value
	 * @returns {string} readable value string
	 */
	static _valueToText(value) {
		if (value && typeof value.length === "number" && typeof value !== "string") {
			return "[" + Array.from(value).join(", ") + "]";
		}
		return String(value);
	}
}


// ------ BzShader ------

class BzShader {
	/**
	 * Compile one shader from descriptor
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor shader descriptor
	 * @returns {WebGLShader} compiled shader
	 */
	static create(runtimeOrGl, descriptor) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzShader.create requires a descriptor object");
		}

		const type = BzShader._resolveType(gl, descriptor.type ?? descriptor.stage);
		const source = descriptor.source ?? descriptor.code;
		if (typeof source !== "string") {
			throw new TypeError("BzShader.create requires source as a string");
		}

		const shader = gl.createShader(type);
		if (!shader) {
			throw new Error("Failed to allocate shader object");
		}

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const log = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error";
			gl.deleteShader(shader);
			throw new Error("BzShader compile failed (" + BzShader._typeLabel(gl, type) + ")\n" + log);
		}

		return shader;
	}

	/**
	 * Compile both vertex and fragment shader from one descriptor
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor source descriptor
	 * @returns {object} object with vertex and fragment shader
	 */
	static fromDescriptor(runtimeOrGl, descriptor) {
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzShader.fromDescriptor requires a descriptor object");
		}

		const vertexSource = descriptor.vertexSource ?? descriptor.vertex ?? descriptor.vs;
		const fragmentSource = descriptor.fragmentSource ?? descriptor.fragment ?? descriptor.fs;

		if (typeof vertexSource !== "string" || typeof fragmentSource !== "string") {
			throw new TypeError("BzShader.fromDescriptor needs vertexSource and fragmentSource");
		}

		return {
			vertex: BzShader.create(runtimeOrGl, { type: "vertex", source: vertexSource }),
			fragment: BzShader.create(runtimeOrGl, { type: "fragment", source: fragmentSource }),
		};
	}

	/**
	 * Destroy many shaders in one call
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLShader[]} shaders shader list to destroy
	 * @returns {number} number of destroyed shaders
	 */
	static destroyAll(runtimeOrGl, shaders) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!Array.isArray(shaders)) {
			throw new TypeError("BzShader.destroyAll requires a shader array");
		}

		let destroyed = 0;
		for (const shader of shaders) {
			if (!shader) {
				continue;
			}
			gl.deleteShader(shader);
			destroyed += 1;
		}
		return destroyed;
	}

	/**
	 * Resolve shader stage token into GL shader type enum
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {string | number} value stage or type value
	 * @returns {number} shader type enum
	 */
	static _resolveType(gl, value) {
		if (value === gl.VERTEX_SHADER || value === "vertex" || value === "vert" || value === "vs") {
			return gl.VERTEX_SHADER;
		}
		if (value === gl.FRAGMENT_SHADER || value === "fragment" || value === "frag" || value === "fs") {
			return gl.FRAGMENT_SHADER;
		}
		throw new TypeError("Unknown shader type, expected vertex or fragment");
	}

	/**
	 * Return short text label for shader type enum
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {number} type shader type enum
	 * @returns {string} readable stage label
	 */
	static _typeLabel(gl, type) {
		if (type === gl.VERTEX_SHADER) {
			return "vertex";
		}
		if (type === gl.FRAGMENT_SHADER) {
			return "fragment";
		}
		return "unknown";
	}
}


// ------ BzProgram ------

class BzProgram {
	/**
	 * Create and link one GL program from descriptor
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor program descriptor
	 * @returns {WebGLProgram} linked program
	 */
	static create(runtimeOrGl, descriptor) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzProgram.create requires a descriptor object");
		}

		let vertexShader = descriptor.vertexShader ?? null;
		let fragmentShader = descriptor.fragmentShader ?? null;

		let ownVertexShader = false;
		let ownFragmentShader = false;

		if (!vertexShader || !fragmentShader) {
			const vertexSource = descriptor.vertexSource ?? descriptor.vs ?? descriptor.sources?.vertex;
			const fragmentSource = descriptor.fragmentSource ?? descriptor.fs ?? descriptor.sources?.fragment;
			if (typeof vertexSource !== "string" || typeof fragmentSource !== "string") {
				throw new TypeError("BzProgram.create requires shaders or both vertexSource and fragmentSource");
			}
			if (!vertexShader) {
				vertexShader = BzShader.create(gl, { type: "vertex", source: vertexSource });
				ownVertexShader = true;
			}
			if (!fragmentShader) {
				fragmentShader = BzShader.create(gl, { type: "fragment", source: fragmentSource });
				ownFragmentShader = true;
			}
		}

		const program = gl.createProgram();
		if (!program) {
			if (ownVertexShader) {
				gl.deleteShader(vertexShader);
			}
			if (ownFragmentShader) {
				gl.deleteShader(fragmentShader);
			}
			throw new Error("Failed to allocate program object");
		}

		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);

		const attribLocations = descriptor.attribLocations;
		if (attribLocations && typeof attribLocations === "object") {
			for (const [name, index] of Object.entries(attribLocations)) {
				gl.bindAttribLocation(program, Number(index), name);
			}
		}

		if (Array.isArray(descriptor.transformFeedbackVaryings) && typeof gl.transformFeedbackVaryings === "function") {
			const mode = descriptor.transformFeedbackBufferMode ?? gl.INTERLEAVED_ATTRIBS;
			gl.transformFeedbackVaryings(program, descriptor.transformFeedbackVaryings, mode);
		}

		gl.linkProgram(program);

		const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
		if (!linked) {
			const log = gl.getProgramInfoLog(program) ?? "Unknown program link error";
			gl.deleteProgram(program);
			if (ownVertexShader) {
				gl.deleteShader(vertexShader);
			}
			if (ownFragmentShader) {
				gl.deleteShader(fragmentShader);
			}
			throw new Error("BzProgram link failed\n" + log);
		}

		if (descriptor.validate === true) {
			gl.validateProgram(program);
			const valid = gl.getProgramParameter(program, gl.VALIDATE_STATUS);
			if (!valid) {
				const log = gl.getProgramInfoLog(program) ?? "Unknown program validate error";
				gl.deleteProgram(program);
				if (ownVertexShader) {
					gl.deleteShader(vertexShader);
				}
				if (ownFragmentShader) {
					gl.deleteShader(fragmentShader);
				}
				throw new Error("BzProgram validate failed\n" + log);
			}
		}

		if (descriptor.detachShaders ?? true) {
			gl.detachShader(program, vertexShader);
			gl.detachShader(program, fragmentShader);
		}

		const keepShaders = descriptor.keepShaders ?? false;
		if (!keepShaders) {
			if (ownVertexShader) {
				gl.deleteShader(vertexShader);
			}
			if (ownFragmentShader) {
				gl.deleteShader(fragmentShader);
			}
		}

		if (runtime.isWebGL2 && bzPlainObject(descriptor.uniformBlocks)) {
			for (const [blockName, binding] of Object.entries(descriptor.uniformBlocks)) {
				const blockIndex = gl.getUniformBlockIndex(program, blockName);
				if (blockIndex !== gl.INVALID_INDEX) {
					gl.uniformBlockBinding(program, blockIndex, Number(binding));
				}
			}
		}

		return program;
	}

	/**
	 * Set one program as current
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLProgram} program program to bind
	 * @returns {WebGLProgram} the same program
	 */
	static use(runtimeOrGl, program) {
		if (!program) {
			throw new TypeError("BzProgram.use requires a program");
		}
		const gl = BzContext.gl(runtimeOrGl);
		gl.useProgram(program);
		return program;
	}

	/**
	 * Reflect active uniforms from a linked program
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLProgram} program linked program
	 * @returns {object} uniform metadata object keyed by name
	 */
	static getUniforms(runtimeOrGl, program) {
		if (!program) {
			throw new TypeError("BzProgram.getUniforms requires a program");
		}
		const gl = BzContext.gl(runtimeOrGl);
		const count = Number(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) ?? 0);
		const out = {};

		for (let i = 0; i < count; i += 1) {
			const info = gl.getActiveUniform(program, i);
			if (!info) {
				continue;
			}

			const normalizedName = info.name.replace(/\[0\]$/, "");
			out[normalizedName] = {
				name: normalizedName,
				rawName: info.name,
				size: info.size,
				type: info.type,
				index: i,
				location: gl.getUniformLocation(program, normalizedName),
			};
		}

		return out;
	}

	/**
	 * Reflect active attributes from a linked program
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLProgram} program linked program
	 * @returns {object} attribute metadata object keyed by name
	 */
	static getAttributes(runtimeOrGl, program) {
		if (!program) {
			throw new TypeError("BzProgram.getAttributes requires a program");
		}
		const gl = BzContext.gl(runtimeOrGl);
		const count = Number(gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) ?? 0);
		const out = {};

		for (let i = 0; i < count; i += 1) {
			const info = gl.getActiveAttrib(program, i);
			if (!info) {
				continue;
			}

			out[info.name] = {
				name: info.name,
				size: info.size,
				type: info.type,
				index: gl.getAttribLocation(program, info.name),
			};
		}

		return out;
	}

	/**
	 * Delete one program
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLProgram} program program to delete
	 * @returns {void} return value
	 */
	static destroy(runtimeOrGl, program) {
		if (!program) {
			return;
		}
		const gl = BzContext.gl(runtimeOrGl);
		gl.deleteProgram(program);
	}

	/**
	 * Delete many programs in one call
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLProgram[]} programs program array
	 * @returns {number} number of deleted programs
	 */
	static destroyAll(runtimeOrGl, programs) {
		if (!Array.isArray(programs)) {
			throw new TypeError("BzProgram.destroyAll requires a program array");
		}

		const gl = BzContext.gl(runtimeOrGl);
		let destroyed = 0;
		for (const program of programs) {
			if (!program) {
				continue;
			}
			gl.deleteProgram(program);
			destroyed += 1;
		}
		return destroyed;
	}
}


// ------ BzBuffer ------

class BzBuffer {
	/**
	 * Create one GL buffer and optionally upload data
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor buffer descriptor
	 * @returns {WebGLBuffer} created buffer
	 */
	static create(runtimeOrGl, descriptor) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzBuffer.create requires a descriptor object");
		}

		const target = descriptor.target ?? gl.ARRAY_BUFFER;
		const usage = descriptor.usage ?? gl.STATIC_DRAW;

		const buffer = gl.createBuffer();
		if (!buffer) {
			throw new Error("Failed to allocate buffer object");
		}

		gl.bindBuffer(target, buffer);

		if (typeof descriptor.size === "number") {
			gl.bufferData(target, descriptor.size, usage);
		} else if (descriptor.data !== undefined) {
			const data = BzBuffer._normalizeData(descriptor.data);
			gl.bufferData(target, data, usage);
		}

		if (descriptor.unbind ?? false) {
			gl.bindBuffer(target, null);
		}

		return buffer;
	}

	/**
	 * Upload or sub-upload data into an existing buffer
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {number} target buffer target enum
	 * @param {WebGLBuffer} buffer buffer object
	 * @param {ArrayBuffer | ArrayBufferView | number[]} data source data
	 * @param {object} [options = {}] upload options
	 * @returns {WebGLBuffer} same buffer
	 */
	static write(runtimeOrGl, target, buffer, data, options = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!buffer) {
			throw new TypeError("BzBuffer.write requires a buffer");
		}
		if (typeof target !== "number") {
			throw new TypeError("BzBuffer.write requires a numeric target enum");
		}
		if (data === undefined || data === null) {
			throw new TypeError("BzBuffer.write requires data");
		}

		const source = BzBuffer._normalizeData(data);
		gl.bindBuffer(target, buffer);

		const usage = options.usage ?? gl.STATIC_DRAW;
		const offset = Number(options.offset ?? 0);
		const subData = options.subData ?? offset > 0;

		if (subData) {
			gl.bufferSubData(target, offset, source);
		} else {
			gl.bufferData(target, source, usage);
		}

		if (options.unbind ?? false) {
			gl.bindBuffer(target, null);
		}

		return buffer;
	}

	/**
	 * Reallocate buffer storage without upload, useful for orphaning
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {number} target buffer target enum
	 * @param {WebGLBuffer} buffer buffer object
	 * @param {number} size byte size
	 * @param {number} usage GL usage enum
	 * @returns {WebGLBuffer} same buffer
	 */
	static orphan(runtimeOrGl, target, buffer, size, usage) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!buffer) {
			throw new TypeError("BzBuffer.orphan requires a buffer");
		}
		if (!Number.isFinite(size) || size < 0) {
			throw new TypeError("BzBuffer.orphan requires a non-negative size");
		}

		gl.bindBuffer(target, buffer);
		gl.bufferData(target, size, usage ?? gl.DYNAMIC_DRAW);
		return buffer;
	}

	/**
	 * Read bytes from a bound buffer (WebGL2 only)
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {number} target buffer target enum
	 * @param {WebGLBuffer} buffer source buffer
	 * @param {object} [options = {}] read options
	 * @returns {ArrayBufferView} destination array with copied bytes
	 */
	static read(runtimeOrGl, target, buffer, options = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;
		if (!runtime.isWebGL2 || typeof gl.getBufferSubData !== "function") {
			throw new Error("BzBuffer.read requires WebGL2 getBufferSubData support");
		}
		if (!buffer) {
			throw new TypeError("BzBuffer.read requires a buffer");
		}

		const byteLength = Number(options.byteLength ?? 0);
		const srcByteOffset = Number(options.srcByteOffset ?? 0);
		const out = options.out ?? new Uint8Array(byteLength > 0 ? byteLength : 0);

		if (!ArrayBuffer.isView(out)) {
			throw new TypeError("BzBuffer.read options.out must be an ArrayBufferView");
		}

		const dstOffsetElements = Number(options.dstOffsetElements ?? 0);
		const lengthElements = Number(options.lengthElements ?? (out.length - dstOffsetElements));

		gl.bindBuffer(target, buffer);
		gl.getBufferSubData(target, srcByteOffset, out, dstOffsetElements, lengthElements);
		return out;
	}

	/**
	 * Destroy many buffers in one call
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLBuffer[]} buffers buffer list to destroy
	 * @returns {number} number of destroyed buffers
	 */
	static destroyAll(runtimeOrGl, buffers) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!Array.isArray(buffers)) {
			throw new TypeError("BzBuffer.destroyAll requires a buffer array");
		}

		let destroyed = 0;
		for (const buffer of buffers) {
			if (!buffer) {
				continue;
			}
			gl.deleteBuffer(buffer);
			destroyed += 1;
		}
		return destroyed;
	}

	/**
	 * Normalize source data into supported bufferData input
	 * @param {ArrayBuffer | ArrayBufferView | number[]} data source data
	 * @returns {ArrayBuffer | ArrayBufferView} normalized data
	 */
	static _normalizeData(data) {
		if (Array.isArray(data)) {
			return new Float32Array(data);
		}
		if (data instanceof ArrayBuffer || bzIsTypedArray(data)) {
			return data;
		}
		throw new TypeError("Unsupported buffer data type");
	}
}


// ------ BzVertexArray ------

class BzVertexArray {
	/**
	 * Create one VAO (WebGL2 or OES extension path)
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] create options
	 * @returns {WebGLVertexArrayObject | any | null} VAO object or null
	 */
	static create(runtimeOrGl, descriptor = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		let vao = null;
		if (runtime.isWebGL2 && typeof gl.createVertexArray === "function") {
			vao = gl.createVertexArray();
		} else {
			const ext = BzExtensions.get(runtime, "OES_vertex_array_object", { optional: true });
			if (ext && typeof ext.createVertexArrayOES === "function") {
				vao = ext.createVertexArrayOES();
			}
		}

		if (!vao && (descriptor.require ?? false)) {
			throw new Error("VAO is not available in this runtime");
		}

		if (vao && Array.isArray(descriptor.layout)) {
			BzVertexArray.apply(runtime, descriptor.layout, {
				vao,
				elementBuffer: descriptor.elementBuffer,
			});
		}

		return vao;
	}

	/**
	 * Bind VAO object, or bind null to unbind
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLVertexArrayObject | any | null} vao VAO object or null
	 * @returns {WebGLVertexArrayObject | any | null} the same VAO
	 */
	static bind(runtimeOrGl, vao) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		if (runtime.isWebGL2 && typeof gl.bindVertexArray === "function") {
			gl.bindVertexArray(vao);
			return vao;
		}

		const ext = BzExtensions.get(runtime, "OES_vertex_array_object", { optional: true });
		if (ext && typeof ext.bindVertexArrayOES === "function") {
			ext.bindVertexArrayOES(vao);
			return vao;
		}

		if (vao !== null && vao !== undefined) {
			throw new Error("VAO binding is not supported in this runtime");
		}
		return vao;
	}

	/**
	 * Apply vertex attribute layout to currently bound VAO or global state
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object[]} [layout = []] attribute layout entries
	 * @param {object} [options = {}] apply options
	 * @returns {void} return value
	 */
	static apply(runtimeOrGl, layout = [], options = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		if (!Array.isArray(layout)) {
			throw new TypeError("BzVertexArray.apply requires layout as an array");
		}

		if (Object.prototype.hasOwnProperty.call(options, "vao")) {
			BzVertexArray.bind(runtime, options.vao);
		}

		if (options.elementBuffer) {
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, options.elementBuffer);
		}

		for (const entry of layout) {
			if (!entry) {
				continue;
			}

			const index = Number(entry.index);
			if (!Number.isInteger(index) || index < 0) {
				throw new TypeError("BzVertexArray.apply entry.index must be a non-negative integer");
			}

			if (entry.buffer) {
				gl.bindBuffer(entry.target ?? gl.ARRAY_BUFFER, entry.buffer);
			}

			if (entry.enabled === false) {
				gl.disableVertexAttribArray(index);
				continue;
			}

			const constant = entry.constantValue;
			if (constant !== undefined) {
				gl.disableVertexAttribArray(index);
				const value = Array.isArray(constant) ? constant : [constant];
				if (value.length === 1) {
					gl.vertexAttrib1f(index, Number(value[0]));
				} else if (value.length === 2) {
					gl.vertexAttrib2f(index, Number(value[0]), Number(value[1]));
				} else if (value.length === 3) {
					gl.vertexAttrib3f(index, Number(value[0]), Number(value[1]), Number(value[2]));
				} else {
					gl.vertexAttrib4f(
						index,
						Number(value[0]),
						Number(value[1]),
						Number(value[2]),
						Number(value[3] ?? 1),
					);
				}
				continue;
			}

			gl.enableVertexAttribArray(index);

			const size = Number(entry.size ?? 3);
			const type = entry.type ?? gl.FLOAT;
			const normalized = Boolean(entry.normalized ?? false);
			const stride = Number(entry.stride ?? 0);
			const offset = Number(entry.offset ?? 0);
			const integer = Boolean(entry.integer ?? false);

			if (integer && typeof gl.vertexAttribIPointer === "function") {
				gl.vertexAttribIPointer(index, size, type, stride, offset);
			} else {
				gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
			}

			const divisor = Number(entry.divisor ?? 0);
			if (divisor !== 0) {
				BzVertexArray._setDivisor(runtime, index, divisor);
			}
		}
	}

	/**
	 * Delete one VAO
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLVertexArrayObject | any | null} vao vao to delete
	 * @returns {void} return value
	 */
	static destroy(runtimeOrGl, vao) {
		if (!vao) {
			return;
		}
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		if (runtime.isWebGL2 && typeof gl.deleteVertexArray === "function") {
			gl.deleteVertexArray(vao);
			return;
		}

		const ext = BzExtensions.get(runtime, "OES_vertex_array_object", { optional: true });
		if (ext && typeof ext.deleteVertexArrayOES === "function") {
			ext.deleteVertexArrayOES(vao);
		}
	}

	/**
	 * Set attribute divisor for instancing with WebGL2 or ANGLE fallback
	 * @param {object} runtime runtime object
	 * @param {number} index attribute index
	 * @param {number} divisor divisor value
	 * @returns {void} return value
	 */
	static _setDivisor(runtime, index, divisor) {
		const gl = runtime.gl;
		if (runtime.isWebGL2 && typeof gl.vertexAttribDivisor === "function") {
			gl.vertexAttribDivisor(index, divisor);
			return;
		}

		const ext = BzExtensions.get(runtime, "ANGLE_instanced_arrays", { optional: true });
		if (!ext || typeof ext.vertexAttribDivisorANGLE !== "function") {
			throw new Error("Instanced attributes require ANGLE_instanced_arrays in this runtime");
		}
		ext.vertexAttribDivisorANGLE(index, divisor);
	}
}


// ------ BzTexture ------

class BzTexture {
	/**
	 * Create 2D texture and optionally allocate or upload initial data
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] texture descriptor
	 * @returns {WebGLTexture} created texture
	 */
	static create2D(runtimeOrGl, descriptor = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		const target = descriptor.target ?? gl.TEXTURE_2D;

		const texture = gl.createTexture();
		if (!texture) {
			throw new Error("Failed to allocate texture object");
		}

		gl.bindTexture(target, texture);

		const level = Number(descriptor.level ?? 0);
		const internalFormat = descriptor.internalFormat ?? gl.RGBA;
		const format = descriptor.format ?? gl.RGBA;
		const type = descriptor.type ?? gl.UNSIGNED_BYTE;
		const border = Number(descriptor.border ?? 0);

		if (descriptor.data !== undefined) {
			if (bzIsTypedArray(descriptor.data)) {
				const width = Number(descriptor.width ?? 1);
				const height = Number(descriptor.height ?? 1);
				gl.texImage2D(target, level, internalFormat, width, height, border, format, type, descriptor.data);
			} else {
				gl.texImage2D(target, level, internalFormat, format, type, descriptor.data);
			}
		} else if (descriptor.allocate ?? true) {
			const width = Number(descriptor.width ?? 1);
			const height = Number(descriptor.height ?? 1);
			gl.texImage2D(target, level, internalFormat, width, height, border, format, type, null);
		}

		BzTexture.setParams(gl, target, descriptor.params ?? BzFormat.texture2D(gl).params);

		if (descriptor.generateMipmap ?? false) {
			gl.generateMipmap(target);
		}

		if (descriptor.unbind ?? true) {
			gl.bindTexture(target, null);
		}

		return texture;
	}

	/**
	 * Upload image or typed array into an existing 2D texture
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLTexture} texture texture object
	 * @param {TexImageSource | ArrayBufferView} source upload source
	 * @param {object} [descriptor = {}] upload descriptor
	 * @returns {WebGLTexture} same texture
	 */
	static upload2D(runtimeOrGl, texture, source, descriptor = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!texture) {
			throw new TypeError("BzTexture.upload2D requires a texture");
		}
		if (!source) {
			throw new TypeError("BzTexture.upload2D requires a source");
		}

		const target = descriptor.target ?? gl.TEXTURE_2D;
		const level = Number(descriptor.level ?? 0);
		const x = Number(descriptor.x ?? descriptor.offsetX ?? 0);
		const y = Number(descriptor.y ?? descriptor.offsetY ?? 0);
		const internalFormat = descriptor.internalFormat ?? gl.RGBA;
		const format = descriptor.format ?? gl.RGBA;
		const type = descriptor.type ?? gl.UNSIGNED_BYTE;
		const border = Number(descriptor.border ?? 0);

		gl.bindTexture(target, texture);

		if (descriptor.flipY !== undefined) {
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, descriptor.flipY ? 1 : 0);
		}
		if (descriptor.premultiplyAlpha !== undefined) {
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, descriptor.premultiplyAlpha ? 1 : 0);
		}
		if (descriptor.alignment !== undefined) {
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, Number(descriptor.alignment));
		}

		const subImage = descriptor.subImage ?? false;

		if (bzIsTypedArray(source)) {
			const width = Number(descriptor.width);
			const height = Number(descriptor.height);
			if (!Number.isFinite(width) || !Number.isFinite(height)) {
				throw new TypeError("Typed array texture upload requires numeric width and height");
			}

			if (subImage) {
				gl.texSubImage2D(target, level, x, y, width, height, format, type, source);
			} else {
				gl.texImage2D(target, level, internalFormat, width, height, border, format, type, source);
			}
		} else if (source instanceof ArrayBuffer) {
			const view = new Uint8Array(source);
			const width = Number(descriptor.width);
			const height = Number(descriptor.height);
			if (!Number.isFinite(width) || !Number.isFinite(height)) {
				throw new TypeError("ArrayBuffer texture upload requires numeric width and height");
			}

			if (subImage) {
				gl.texSubImage2D(target, level, x, y, width, height, format, type, view);
			} else {
				gl.texImage2D(target, level, internalFormat, width, height, border, format, type, view);
			}
		} else {
			if (subImage) {
				gl.texSubImage2D(target, level, x, y, format, type, source);
			} else {
				gl.texImage2D(target, level, internalFormat, format, type, source);
			}
		}

		if (descriptor.generateMipmap ?? false) {
			gl.generateMipmap(target);
		}

		if (descriptor.unbind ?? true) {
			gl.bindTexture(target, null);
		}

		return texture;
	}

	/**
	 * Create cubemap texture from optional face data
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] cube texture descriptor
	 * @returns {WebGLTexture} created cube texture
	 */
	static createCube(runtimeOrGl, descriptor = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		const target = gl.TEXTURE_CUBE_MAP;
		const texture = gl.createTexture();
		if (!texture) {
			throw new Error("Failed to allocate cube texture object");
		}

		gl.bindTexture(target, texture);

		const level = Number(descriptor.level ?? 0);
		const internalFormat = descriptor.internalFormat ?? gl.RGBA;
		const format = descriptor.format ?? gl.RGBA;
		const type = descriptor.type ?? gl.UNSIGNED_BYTE;
		const border = Number(descriptor.border ?? 0);

		const size = Number(descriptor.size ?? Math.max(descriptor.width ?? 1, descriptor.height ?? 1));
		const width = Number(descriptor.width ?? size);
		const height = Number(descriptor.height ?? size);

		const faces = Array.isArray(descriptor.faces) ? descriptor.faces : [];
		for (let i = 0; i < 6; i += 1) {
			const faceTarget = gl.TEXTURE_CUBE_MAP_POSITIVE_X + i;
			const faceSource = faces[i];

			if (faceSource === undefined || faceSource === null) {
				gl.texImage2D(faceTarget, level, internalFormat, width, height, border, format, type, null);
				continue;
			}

			if (bzIsTypedArray(faceSource)) {
				gl.texImage2D(faceTarget, level, internalFormat, width, height, border, format, type, faceSource);
			} else {
				gl.texImage2D(faceTarget, level, internalFormat, format, type, faceSource);
			}
		}

		BzTexture.setParams(gl, target, descriptor.params ?? BzFormat.cube(gl).params);

		if (descriptor.generateMipmap ?? false) {
			gl.generateMipmap(target);
		}

		if (descriptor.unbind ?? true) {
			gl.bindTexture(target, null);
		}

		return texture;
	}

	/**
	 * Apply texture parameter object onto the currently bound texture target
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {number} target texture target enum
	 * @param {object} [params = {}] parameter map
	 * @returns {void} return value
	 */
	static setParams(runtimeOrGl, target, params = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!params || typeof params !== "object") {
			return;
		}

		for (const [rawName, rawValue] of Object.entries(params)) {
			const pname = BzTexture._resolveParamName(gl, rawName);
			if (typeof pname === "undefined") {
				continue;
			}

			if (rawName === "minLod" || rawName === "maxLod") {
				gl.texParameterf(target, pname, Number(rawValue));
			} else {
				gl.texParameteri(target, pname, Number(rawValue));
			}
		}
	}

	/**
	 * Destroy many textures in one call
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLTexture[]} textures texture list to destroy
	 * @returns {number} number of destroyed textures
	 */
	static destroyAll(runtimeOrGl, textures) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!Array.isArray(textures)) {
			throw new TypeError("BzTexture.destroyAll requires a texture array");
		}

		let destroyed = 0;
		for (const texture of textures) {
			if (!texture) {
				continue;
			}
			gl.deleteTexture(texture);
			destroyed += 1;
		}
		return destroyed;
	}

	/**
	 * Resolve symbolic texture param name to GL enum
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {string | number} name symbolic name or raw enum
	 * @returns {number | undefined} texture param enum
	 */
	static _resolveParamName(gl, name) {
		if (typeof name === "number") {
			return name;
		}

		const map = {
			minFilter: gl.TEXTURE_MIN_FILTER,
			magFilter: gl.TEXTURE_MAG_FILTER,
			wrapS: gl.TEXTURE_WRAP_S,
			wrapT: gl.TEXTURE_WRAP_T,
			wrapR: gl.TEXTURE_WRAP_R,
			baseLevel: gl.TEXTURE_BASE_LEVEL,
			maxLevel: gl.TEXTURE_MAX_LEVEL,
			compareMode: gl.TEXTURE_COMPARE_MODE,
			compareFunc: gl.TEXTURE_COMPARE_FUNC,
			minLod: gl.TEXTURE_MIN_LOD,
			maxLod: gl.TEXTURE_MAX_LOD,
		};

		if (Object.prototype.hasOwnProperty.call(map, name)) {
			return map[name];
		}

		if (typeof gl[name] === "number") {
			return gl[name];
		}

		return undefined;
	}
}


// ------ BzFramebuffer ------

class BzFramebuffer {
	/**
	 * Create framebuffer and apply optional attachments
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] framebuffer descriptor
	 * @returns {object} framebuffer record
	 */
	static create(runtimeOrGl, descriptor = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		const framebuffer = gl.createFramebuffer();
		if (!framebuffer) {
			throw new Error("Failed to allocate framebuffer object");
		}

		const record = {
			framebuffer,
			renderbuffers: [],
			drawBuffers: [],
		};

		BzFramebuffer.bind(runtime, record, descriptor.target ?? gl.FRAMEBUFFER);

		if (descriptor.colorTexture) {
			BzFramebuffer.attachTexture2D(
				runtime,
				record,
				descriptor.colorAttachment ?? gl.COLOR_ATTACHMENT0,
				descriptor.colorTexture,
				descriptor.level ?? 0,
				{ textureTarget: descriptor.colorTextureTarget ?? gl.TEXTURE_2D },
			);
			record.drawBuffers.push(descriptor.colorAttachment ?? gl.COLOR_ATTACHMENT0);
		}

		if (Array.isArray(descriptor.colorTextures) && descriptor.colorTextures.length > 0) {
			for (let i = 0; i < descriptor.colorTextures.length; i += 1) {
				const texture = descriptor.colorTextures[i];
				if (!texture) {
					continue;
				}
				const attachment = (descriptor.colorAttachmentBase ?? gl.COLOR_ATTACHMENT0) + i;
				BzFramebuffer.attachTexture2D(
					runtime,
					record,
					attachment,
					texture,
					descriptor.level ?? 0,
					{ textureTarget: descriptor.colorTextureTarget ?? gl.TEXTURE_2D },
				);
				record.drawBuffers.push(attachment);
			}
		}

		if (descriptor.depthTexture) {
			BzFramebuffer.attachTexture2D(
				runtime,
				record,
				gl.DEPTH_ATTACHMENT,
				descriptor.depthTexture,
				descriptor.level ?? 0,
				{ textureTarget: descriptor.depthTextureTarget ?? gl.TEXTURE_2D },
			);
		}

		if (descriptor.depthStencilTexture) {
			BzFramebuffer.attachTexture2D(
				runtime,
				record,
				gl.DEPTH_STENCIL_ATTACHMENT,
				descriptor.depthStencilTexture,
				descriptor.level ?? 0,
				{ textureTarget: descriptor.depthStencilTextureTarget ?? gl.TEXTURE_2D },
			);
		}

		if (descriptor.depthRenderbuffer) {
			const rbDesc = descriptor.depthRenderbuffer;
			const rb = gl.createRenderbuffer();
			if (!rb) {
				throw new Error("Failed to allocate depth renderbuffer");
			}
			record.renderbuffers.push(rb);
			gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
			gl.renderbufferStorage(
				gl.RENDERBUFFER,
				rbDesc.format ?? gl.DEPTH_COMPONENT16,
				Number(rbDesc.width ?? descriptor.width ?? gl.drawingBufferWidth),
				Number(rbDesc.height ?? descriptor.height ?? gl.drawingBufferHeight),
			);
			gl.framebufferRenderbuffer(
				descriptor.target ?? gl.FRAMEBUFFER,
				rbDesc.attachment ?? gl.DEPTH_ATTACHMENT,
				gl.RENDERBUFFER,
				rb,
			);
		}

		if (record.drawBuffers.length > 1) {
			BzFramebuffer._setDrawBuffers(runtime, record.drawBuffers);
		}

		if (descriptor.check ?? true) {
			record.status = BzFramebuffer.check(runtime, descriptor.target ?? gl.FRAMEBUFFER);
		}

		if (descriptor.unbind ?? true) {
			gl.bindFramebuffer(descriptor.target ?? gl.FRAMEBUFFER, null);
			gl.bindRenderbuffer(gl.RENDERBUFFER, null);
		}

		return record;
	}

	/**
	 * Bind framebuffer record or raw framebuffer
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object | WebGLFramebuffer | null} framebufferOrRecord record, raw framebuffer, or null
	 * @param {number} [target] framebuffer target enum
	 * @returns {WebGLFramebuffer | null} bound framebuffer object
	 */
	static bind(runtimeOrGl, framebufferOrRecord, target) {
		const gl = BzContext.gl(runtimeOrGl);
		const resolvedTarget = target ?? gl.FRAMEBUFFER;
		const framebuffer = BzFramebuffer._unwrap(framebufferOrRecord);
		gl.bindFramebuffer(resolvedTarget, framebuffer);
		return framebuffer;
	}

	/**
	 * Attach a texture to framebuffer attachment point
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object | WebGLFramebuffer} framebufferOrRecord record or raw framebuffer
	 * @param {number} attachment attachment enum
	 * @param {WebGLTexture} texture texture object
	 * @param {number} [level = 0] mip level
	 * @param {object} [options = {}] attach options
	 * @returns {void} return value
	 */
	static attachTexture2D(runtimeOrGl, framebufferOrRecord, attachment, texture, level = 0, options = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!texture) {
			throw new TypeError("BzFramebuffer.attachTexture2D requires a texture");
		}

		const target = options.target ?? gl.FRAMEBUFFER;
		const textureTarget = options.textureTarget ?? gl.TEXTURE_2D;
		const framebuffer = BzFramebuffer._unwrap(framebufferOrRecord);

		gl.bindFramebuffer(target, framebuffer);
		gl.framebufferTexture2D(target, attachment, textureTarget, texture, level);
	}

	/**
	 * Check framebuffer completeness status
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {number} [target] framebuffer target enum
	 * @returns {object} status object
	 */
	static check(runtimeOrGl, target) {
		const gl = BzContext.gl(runtimeOrGl);
		const resolvedTarget = target ?? gl.FRAMEBUFFER;
		const status = gl.checkFramebufferStatus(resolvedTarget);
		return {
			status,
			complete: status === gl.FRAMEBUFFER_COMPLETE,
			label: BzFramebuffer._statusLabel(gl, status),
		};
	}

	/**
	 * Destroy framebuffer records or raw framebuffer objects
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {Array<object | WebGLFramebuffer>} framebuffers list to destroy
	 * @returns {object} destroy counters
	 */
	static destroyAll(runtimeOrGl, framebuffers) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!Array.isArray(framebuffers)) {
			throw new TypeError("BzFramebuffer.destroyAll requires an array");
		}

		let destroyedFramebuffers = 0;
		let destroyedRenderbuffers = 0;

		for (const item of framebuffers) {
			if (!item) {
				continue;
			}

			if (item.renderbuffers && Array.isArray(item.renderbuffers)) {
				for (const rb of item.renderbuffers) {
					if (!rb) {
						continue;
					}
					gl.deleteRenderbuffer(rb);
					destroyedRenderbuffers += 1;
				}
			}

			const framebuffer = BzFramebuffer._unwrap(item);
			if (framebuffer) {
				gl.deleteFramebuffer(framebuffer);
				destroyedFramebuffers += 1;
			}
		}

		return {
			framebuffers: destroyedFramebuffers,
			renderbuffers: destroyedRenderbuffers,
		};
	}

	/**
	 * Unwrap framebuffer from record object when needed
	 * @param {object | WebGLFramebuffer | null} value record or raw framebuffer
	 * @returns {WebGLFramebuffer | null} raw framebuffer
	 */
	static _unwrap(value) {
		if (!value) {
			return null;
		}
		if (value.framebuffer) {
			return value.framebuffer;
		}
		return value;
	}

	/**
	 * Set draw buffers using WebGL2 or WEBGL_draw_buffers extension
	 * @param {object} runtime runtime object
	 * @param {number[]} buffers color attachment enums
	 * @returns {void} return value
	 */
	static _setDrawBuffers(runtime, buffers) {
		const gl = runtime.gl;
		if (runtime.isWebGL2 && typeof gl.drawBuffers === "function") {
			gl.drawBuffers(buffers);
			return;
		}

		const ext = BzExtensions.get(runtime, "WEBGL_draw_buffers", { optional: true });
		if (!ext || typeof ext.drawBuffersWEBGL !== "function") {
			throw new Error("Multiple color attachments require draw buffers support");
		}
		ext.drawBuffersWEBGL(buffers);
	}

	/**
	 * Convert framebuffer status enum into readable label
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {number} status framebuffer status enum
	 * @returns {string} readable label
	 */
	static _statusLabel(gl, status) {
		switch (status) {
			case gl.FRAMEBUFFER_COMPLETE:
				return "FRAMEBUFFER_COMPLETE";
			case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
				return "FRAMEBUFFER_INCOMPLETE_ATTACHMENT";
			case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
				return "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT";
			case gl.FRAMEBUFFER_UNSUPPORTED:
				return "FRAMEBUFFER_UNSUPPORTED";
			case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
				return "FRAMEBUFFER_INCOMPLETE_DIMENSIONS";
			default:
				return "FRAMEBUFFER_STATUS_" + status;
		}
	}
}


// ------ BzState ------

class BzState {
	/**
	 * Set viewport rectangle
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [viewport = {}] viewport values
	 * @returns {object} applied viewport
	 */
	static setViewport(runtimeOrGl, viewport = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		const x = Number(viewport.x ?? 0);
		const y = Number(viewport.y ?? 0);
		const width = Number(viewport.width ?? gl.drawingBufferWidth);
		const height = Number(viewport.height ?? gl.drawingBufferHeight);

		gl.viewport(x, y, width, height);
		runtime.stateCache.viewport = { x, y, width, height };
		return runtime.stateCache.viewport;
	}

	/**
	 * Configure clear values and optionally clear immediately
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] clear descriptor
	 * @returns {number} clear mask used
	 */
	static setClear(runtimeOrGl, descriptor = {}) {
		const gl = BzContext.gl(runtimeOrGl);

		if (Array.isArray(descriptor.color) && descriptor.color.length >= 4) {
			gl.clearColor(
				Number(descriptor.color[0]),
				Number(descriptor.color[1]),
				Number(descriptor.color[2]),
				Number(descriptor.color[3]),
			);
		}
		if (typeof descriptor.depth === "number") {
			gl.clearDepth(descriptor.depth);
		}
		if (typeof descriptor.stencil === "number") {
			gl.clearStencil(descriptor.stencil);
		}

		const mask = descriptor.mask ?? BzState._clearMask(gl, descriptor);
		if (descriptor.apply ?? true) {
			gl.clear(mask);
		}
		return mask;
	}

	/**
	 * Configure depth test state
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] depth state descriptor
	 * @returns {void} return value
	 */
	static setDepth(runtimeOrGl, descriptor = {}) {
		const gl = BzContext.gl(runtimeOrGl);

		if (descriptor.enable !== undefined) {
			descriptor.enable ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
		}
		if (descriptor.func !== undefined) {
			gl.depthFunc(descriptor.func);
		}
		if (descriptor.mask !== undefined) {
			gl.depthMask(Boolean(descriptor.mask));
		}
		if (Array.isArray(descriptor.range) && descriptor.range.length >= 2) {
			gl.depthRange(Number(descriptor.range[0]), Number(descriptor.range[1]));
		}
		if (descriptor.polygonOffset && typeof descriptor.polygonOffset === "object") {
			gl.enable(gl.POLYGON_OFFSET_FILL);
			gl.polygonOffset(
				Number(descriptor.polygonOffset.factor ?? 0),
				Number(descriptor.polygonOffset.units ?? 0),
			);
		}
	}

	/**
	 * Configure blending state
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] blend state descriptor
	 * @returns {void} return value
	 */
	static setBlend(runtimeOrGl, descriptor = {}) {
		const gl = BzContext.gl(runtimeOrGl);

		if (descriptor.enable !== undefined) {
			descriptor.enable ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);
		}
		if (Array.isArray(descriptor.color) && descriptor.color.length >= 4) {
			gl.blendColor(
				bzClamp01(descriptor.color[0]),
				bzClamp01(descriptor.color[1]),
				bzClamp01(descriptor.color[2]),
				bzClamp01(descriptor.color[3]),
			);
		}

		const eqRgb = descriptor.equationRgb ?? descriptor.equation;
		const eqAlpha = descriptor.equationAlpha ?? descriptor.equation;
		if (eqRgb !== undefined && eqAlpha !== undefined) {
			gl.blendEquationSeparate(eqRgb, eqAlpha);
		} else if (eqRgb !== undefined) {
			gl.blendEquation(eqRgb);
		}

		const srcRgb = descriptor.srcRgb ?? descriptor.src ?? descriptor.srcColor;
		const dstRgb = descriptor.dstRgb ?? descriptor.dst ?? descriptor.dstColor;
		const srcAlpha = descriptor.srcAlpha ?? descriptor.src ?? descriptor.srcAlphaFactor;
		const dstAlpha = descriptor.dstAlpha ?? descriptor.dst ?? descriptor.dstAlphaFactor;

		if (srcRgb !== undefined && dstRgb !== undefined && srcAlpha !== undefined && dstAlpha !== undefined) {
			gl.blendFuncSeparate(srcRgb, dstRgb, srcAlpha, dstAlpha);
		} else if (srcRgb !== undefined && dstRgb !== undefined) {
			gl.blendFunc(srcRgb, dstRgb);
		}
	}

	/**
	 * Configure cull-face state
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] cull state descriptor
	 * @returns {void} return value
	 */
	static setCull(runtimeOrGl, descriptor = {}) {
		const gl = BzContext.gl(runtimeOrGl);

		if (descriptor.enable !== undefined) {
			descriptor.enable ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);
		}
		if (descriptor.face !== undefined) {
			gl.cullFace(descriptor.face);
		}
		if (descriptor.frontFace !== undefined) {
			gl.frontFace(descriptor.frontFace);
		}
	}

	/**
	 * Set generic enable/disable flags and optional scissor/sample values
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] flag descriptor
	 * @returns {void} return value
	 */
	static setFlags(runtimeOrGl, descriptor = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		const switches = {
			scissorTest: gl.SCISSOR_TEST,
			dither: gl.DITHER,
			stencilTest: gl.STENCIL_TEST,
			polygonOffsetFill: gl.POLYGON_OFFSET_FILL,
			sampleAlphaToCoverage: gl.SAMPLE_ALPHA_TO_COVERAGE,
			sampleCoverage: gl.SAMPLE_COVERAGE,
			rasterizerDiscard: runtime.isWebGL2 ? gl.RASTERIZER_DISCARD : undefined,
		};

		for (const [key, cap] of Object.entries(switches)) {
			if (typeof cap !== "number") {
				continue;
			}
			if (descriptor[key] === undefined) {
				continue;
			}

			const enabled = Boolean(descriptor[key]);
			enabled ? gl.enable(cap) : gl.disable(cap);
			runtime.stateCache.flags[key] = enabled;
		}

		if (Array.isArray(descriptor.scissor) && descriptor.scissor.length >= 4) {
			gl.scissor(
				Number(descriptor.scissor[0]),
				Number(descriptor.scissor[1]),
				Number(descriptor.scissor[2]),
				Number(descriptor.scissor[3]),
			);
		}

		if (Array.isArray(descriptor.sampleCoverageValue) && descriptor.sampleCoverageValue.length >= 2) {
			gl.sampleCoverage(
				Number(descriptor.sampleCoverageValue[0]),
				Boolean(descriptor.sampleCoverageValue[1]),
			);
		}
	}

	/**
	 * Build clear mask from descriptor booleans
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} descriptor clear descriptor
	 * @returns {number} clear mask
	 */
	static _clearMask(gl, descriptor) {
		let mask = 0;
		if (descriptor.color !== undefined || (descriptor.colorBit ?? true)) {
			mask |= gl.COLOR_BUFFER_BIT;
		}
		if (descriptor.depth !== undefined || (descriptor.depthBit ?? false)) {
			mask |= gl.DEPTH_BUFFER_BIT;
		}
		if (descriptor.stencil !== undefined || (descriptor.stencilBit ?? false)) {
			mask |= gl.STENCIL_BUFFER_BIT;
		}
		return mask;
	}
}


// ------ BzUniform ------

class BzUniform {
	/**
	 * Resolve one uniform location with optional cache map
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLProgram} program linked program
	 * @param {string} name uniform name
	 * @param {object} [options = {}] options with optional cache map
	 * @returns {WebGLUniformLocation | null} uniform location
	 */
	static location(runtimeOrGl, program, name, options = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		if (!program) {
			throw new TypeError("BzUniform.location requires a program");
		}
		if (typeof name !== "string" || name.length === 0) {
			throw new TypeError("BzUniform.location requires a non-empty uniform name");
		}

		const cache = options.cache;
		const key = program + "::" + name;
		if (cache instanceof Map && cache.has(key)) {
			return cache.get(key);
		}

		const loc = gl.getUniformLocation(program, name);
		if (cache instanceof Map) {
			cache.set(key, loc);
		}
		return loc;
	}

	/**
	 * Set one uniform location using explicit hint or inferred type
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLUniformLocation} location uniform location
	 * @param {any} value uniform value
	 * @param {string} [hint] optional type hint
	 * @returns {boolean} true when location was set
	 */
	static set(runtimeOrGl, location, value, hint) {
		const gl = BzContext.gl(runtimeOrGl);
		if (location === null || location === undefined) {
			return false;
		}

		const resolvedHint = hint ?? BzUniform._inferHint(value);
		if (!resolvedHint) {
			throw new TypeError("BzUniform.set could not infer uniform type, provide hint");
		}

		BzUniform._applyHint(gl, location, value, resolvedHint);
		return true;
	}

	/**
	 * Apply uniform object map into active program
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {WebGLProgram} program linked program
	 * @param {object} uniformMap map of uniform values
	 * @param {object} [options = {}] options with optional cache map
	 * @returns {number} number of uniforms applied
	 */
	static applyMap(runtimeOrGl, program, uniformMap, options = {}) {
		if (!uniformMap || typeof uniformMap !== "object") {
			return 0;
		}

		let applied = 0;
		for (const [name, entry] of Object.entries(uniformMap)) {
			let value = entry;
			let hint;
			if (entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "value")) {
				value = entry.value;
				hint = entry.hint;
			}

			const location = BzUniform.location(runtimeOrGl, program, name, options);
			if (location === null) {
				continue;
			}
			BzUniform.set(runtimeOrGl, location, value, hint);
			applied += 1;
		}
		return applied;
	}

	/**
	 * Infer uniform hint from JS value shape
	 * @param {any} value uniform value
	 * @returns {string | null} inferred hint string
	 */
	static _inferHint(value) {
		if (typeof value === "number") {
			return "1f";
		}
		if (typeof value === "boolean") {
			return "1i";
		}
		if (value instanceof Int32Array) {
			if (value.length === 1) {
				return "1iv";
			}
			if (value.length === 2) {
				return "2iv";
			}
			if (value.length === 3) {
				return "3iv";
			}
			if (value.length === 4) {
				return "4iv";
			}
		}
		if (value instanceof Float32Array || Array.isArray(value)) {
			const len = value.length;
			if (len === 16) {
				return "mat4";
			}
			if (len === 9) {
				return "mat3";
			}
			if (len === 4) {
				return "4fv";
			}
			if (len === 3) {
				return "3fv";
			}
			if (len === 2) {
				return "2fv";
			}
			if (len === 1) {
				return "1f";
			}
		}
		return null;
	}

	/**
	 * Apply one typed uniform write by hint
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {WebGLUniformLocation} location uniform location
	 * @param {any} value uniform value
	 * @param {string} hint type hint
	 * @returns {void} return value
	 */
	static _applyHint(gl, location, value, hint) {
		switch (hint) {
			case "1f":
			case "float":
				gl.uniform1f(location, Number(value));
				return;
			case "2f":
			case "vec2": {
				const v = BzUniform._toArray(value, 2);
				gl.uniform2f(location, Number(v[0]), Number(v[1]));
				return;
			}
			case "3f":
			case "vec3": {
				const v = BzUniform._toArray(value, 3);
				gl.uniform3f(location, Number(v[0]), Number(v[1]), Number(v[2]));
				return;
			}
			case "4f":
			case "vec4": {
				const v = BzUniform._toArray(value, 4);
				gl.uniform4f(location, Number(v[0]), Number(v[1]), Number(v[2]), Number(v[3]));
				return;
			}
			case "1i":
			case "int":
			case "bool":
				gl.uniform1i(location, Number(value));
				return;
			case "2i":
			case "ivec2": {
				const v = BzUniform._toArray(value, 2);
				gl.uniform2i(location, Number(v[0]), Number(v[1]));
				return;
			}
			case "3i":
			case "ivec3": {
				const v = BzUniform._toArray(value, 3);
				gl.uniform3i(location, Number(v[0]), Number(v[1]), Number(v[2]));
				return;
			}
			case "4i":
			case "ivec4": {
				const v = BzUniform._toArray(value, 4);
				gl.uniform4i(location, Number(v[0]), Number(v[1]), Number(v[2]), Number(v[3]));
				return;
			}
			case "1fv":
				gl.uniform1fv(location, BzUniform._toTyped(value, Float32Array));
				return;
			case "2fv":
				gl.uniform2fv(location, BzUniform._toTyped(value, Float32Array));
				return;
			case "3fv":
				gl.uniform3fv(location, BzUniform._toTyped(value, Float32Array));
				return;
			case "4fv":
				gl.uniform4fv(location, BzUniform._toTyped(value, Float32Array));
				return;
			case "1iv":
				gl.uniform1iv(location, BzUniform._toTyped(value, Int32Array));
				return;
			case "2iv":
				gl.uniform2iv(location, BzUniform._toTyped(value, Int32Array));
				return;
			case "3iv":
				gl.uniform3iv(location, BzUniform._toTyped(value, Int32Array));
				return;
			case "4iv":
				gl.uniform4iv(location, BzUniform._toTyped(value, Int32Array));
				return;
			case "mat2":
			case "mat2fv":
				gl.uniformMatrix2fv(location, false, BzUniform._toTyped(value, Float32Array));
				return;
			case "mat3":
			case "mat3fv":
				gl.uniformMatrix3fv(location, false, BzUniform._toTyped(value, Float32Array));
				return;
			case "mat4":
			case "mat4fv":
				gl.uniformMatrix4fv(location, false, BzUniform._toTyped(value, Float32Array));
				return;
			default:
				throw new TypeError("Unknown uniform hint: " + hint);
		}
	}

	/**
	 * Coerce value into JS number array with minimum length
	 * @param {any} value source value
	 * @param {number} minLength required minimum length
	 * @returns {number[]} numeric array
	 */
	static _toArray(value, minLength) {
		const arr = Array.isArray(value) ? value : Array.from(value ?? []);
		if (arr.length < minLength) {
			throw new TypeError("Uniform array is shorter than required length " + minLength);
		}
		return arr;
	}

	/**
	 * Coerce value into typed array class
	 * @param {any} value source value
	 * @param {Function} TypedArrayCtor typed array constructor
	 * @returns {ArrayBufferView} typed array output
	 */
	static _toTyped(value, TypedArrayCtor) {
		if (value instanceof TypedArrayCtor) {
			return value;
		}
		if (Array.isArray(value) || bzIsTypedArray(value)) {
			return new TypedArrayCtor(value);
		}
		return new TypedArrayCtor([value]);
	}
}


// ------ BzDraw ------

class BzDraw {
	/**
	 * Clear current framebuffer with mask and clear values
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [descriptor = {}] clear descriptor
	 * @returns {number} clear mask used
	 */
	static clear(runtimeOrGl, descriptor = {}) {
		return BzState.setClear(runtimeOrGl, descriptor);
	}

	/**
	 * Draw non-indexed primitives with optional prep descriptor
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor draw descriptor
	 * @returns {number} vertex count submitted
	 */
	static arrays(runtimeOrGl, descriptor) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzDraw.arrays requires a descriptor object");
		}
		if (!Number.isFinite(descriptor.count)) {
			throw new TypeError("BzDraw.arrays requires descriptor.count");
		}

		BzDraw._prepare(runtime, descriptor);
		gl.drawArrays(
			descriptor.mode ?? gl.TRIANGLES,
			Number(descriptor.first ?? 0),
			Number(descriptor.count),
		);
		return Number(descriptor.count);
	}

	/**
	 * Draw indexed primitives with optional prep descriptor
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor draw descriptor
	 * @returns {number} index count submitted
	 */
	static elements(runtimeOrGl, descriptor) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzDraw.elements requires a descriptor object");
		}
		if (!Number.isFinite(descriptor.count)) {
			throw new TypeError("BzDraw.elements requires descriptor.count");
		}

		BzDraw._prepare(runtime, descriptor);
		gl.drawElements(
			descriptor.mode ?? gl.TRIANGLES,
			Number(descriptor.count),
			descriptor.type ?? gl.UNSIGNED_SHORT,
			Number(descriptor.offset ?? 0),
		);
		return Number(descriptor.count);
	}

	/**
	 * Draw non-indexed instanced primitives
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor draw descriptor
	 * @returns {number} instance count submitted
	 */
	static arraysInstanced(runtimeOrGl, descriptor) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzDraw.arraysInstanced requires a descriptor object");
		}
		if (!Number.isFinite(descriptor.count)) {
			throw new TypeError("BzDraw.arraysInstanced requires descriptor.count");
		}

		const instanceCount = Number(descriptor.instanceCount ?? 1);
		BzDraw._prepare(runtime, descriptor);

		if (runtime.isWebGL2 && typeof gl.drawArraysInstanced === "function") {
			gl.drawArraysInstanced(
				descriptor.mode ?? gl.TRIANGLES,
				Number(descriptor.first ?? 0),
				Number(descriptor.count),
				instanceCount,
			);
			return instanceCount;
		}

		const ext = BzExtensions.get(runtime, "ANGLE_instanced_arrays", { optional: true });
		if (ext && typeof ext.drawArraysInstancedANGLE === "function") {
			ext.drawArraysInstancedANGLE(
				descriptor.mode ?? gl.TRIANGLES,
				Number(descriptor.first ?? 0),
				Number(descriptor.count),
				instanceCount,
			);
			return instanceCount;
		}

		if (instanceCount !== 1) {
			throw new Error("Instanced draw requires WebGL2 or ANGLE_instanced_arrays");
		}

		gl.drawArrays(
			descriptor.mode ?? gl.TRIANGLES,
			Number(descriptor.first ?? 0),
			Number(descriptor.count),
		);
		return 1;
	}

	/**
	 * Draw indexed instanced primitives
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor draw descriptor
	 * @returns {number} instance count submitted
	 */
	static elementsInstanced(runtimeOrGl, descriptor) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzDraw.elementsInstanced requires a descriptor object");
		}
		if (!Number.isFinite(descriptor.count)) {
			throw new TypeError("BzDraw.elementsInstanced requires descriptor.count");
		}

		const instanceCount = Number(descriptor.instanceCount ?? 1);
		BzDraw._prepare(runtime, descriptor);

		if (runtime.isWebGL2 && typeof gl.drawElementsInstanced === "function") {
			gl.drawElementsInstanced(
				descriptor.mode ?? gl.TRIANGLES,
				Number(descriptor.count),
				descriptor.type ?? gl.UNSIGNED_SHORT,
				Number(descriptor.offset ?? 0),
				instanceCount,
			);
			return instanceCount;
		}

		const ext = BzExtensions.get(runtime, "ANGLE_instanced_arrays", { optional: true });
		if (ext && typeof ext.drawElementsInstancedANGLE === "function") {
			ext.drawElementsInstancedANGLE(
				descriptor.mode ?? gl.TRIANGLES,
				Number(descriptor.count),
				descriptor.type ?? gl.UNSIGNED_SHORT,
				Number(descriptor.offset ?? 0),
				instanceCount,
			);
			return instanceCount;
		}

		if (instanceCount !== 1) {
			throw new Error("Instanced draw requires WebGL2 or ANGLE_instanced_arrays");
		}

		gl.drawElements(
			descriptor.mode ?? gl.TRIANGLES,
			Number(descriptor.count),
			descriptor.type ?? gl.UNSIGNED_SHORT,
			Number(descriptor.offset ?? 0),
		);
		return 1;
	}

	/**
	 * Apply program/state/uniform/texture/framebuffer before drawing
	 * @param {object} runtime runtime object
	 * @param {object} descriptor draw descriptor
	 * @returns {void} return value
	 */
	static _prepare(runtime, descriptor) {
		const gl = runtime.gl;

		if (Object.prototype.hasOwnProperty.call(descriptor, "framebuffer")) {
			BzFramebuffer.bind(runtime, descriptor.framebuffer, descriptor.framebufferTarget ?? gl.FRAMEBUFFER);
		}

		if (descriptor.state && typeof descriptor.state === "object") {
			if (descriptor.state.viewport) {
				BzState.setViewport(runtime, descriptor.state.viewport);
			}
			if (descriptor.state.depth) {
				BzState.setDepth(runtime, descriptor.state.depth);
			}
			if (descriptor.state.blend) {
				BzState.setBlend(runtime, descriptor.state.blend);
			}
			if (descriptor.state.cull) {
				BzState.setCull(runtime, descriptor.state.cull);
			}
			if (descriptor.state.flags) {
				BzState.setFlags(runtime, descriptor.state.flags);
			}
		}

		if (descriptor.clear) {
			BzDraw.clear(runtime, descriptor.clear);
		}

		if (descriptor.program) {
			BzProgram.use(runtime, descriptor.program);
		}

		if (Object.prototype.hasOwnProperty.call(descriptor, "vao")) {
			BzVertexArray.bind(runtime, descriptor.vao);
		}

		if (descriptor.program && descriptor.uniforms) {
			BzUniform.applyMap(runtime, descriptor.program, descriptor.uniforms, {
				cache: descriptor.uniformCache,
			});
		}

		if (Array.isArray(descriptor.textures)) {
			for (let i = 0; i < descriptor.textures.length; i += 1) {
				const tex = descriptor.textures[i];
				if (!tex || !tex.texture) {
					continue;
				}

				const unit = Number(tex.unit ?? i);
				const target = tex.target ?? gl.TEXTURE_2D;

				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(target, tex.texture);

				if (descriptor.program && typeof tex.uniform === "string") {
					const loc = BzUniform.location(runtime, descriptor.program, tex.uniform, {
						cache: descriptor.uniformCache,
					});
					if (loc !== null) {
						gl.uniform1i(loc, unit);
					}
				}
			}
		}
	}
}


// ------ BzFrame ------

class BzFrame {
	/**
	 * Begin one frame scope and apply optional initial state
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [options = {}] frame begin options
	 * @returns {object} frame object
	 */
	static begin(runtimeOrGl, options = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const frame = {
			runtime,
			gl: runtime.gl,
			label: options.label ?? "BzFrame",
			startedAt: bzNow(),
			endedAt: 0,
			cpuMs: 0,
		};

		if (Object.prototype.hasOwnProperty.call(options, "framebuffer")) {
			BzFramebuffer.bind(runtime, options.framebuffer, options.framebufferTarget ?? frame.gl.FRAMEBUFFER);
		}
		if (options.viewport) {
			BzState.setViewport(runtime, options.viewport);
		}
		if (options.clear) {
			BzDraw.clear(runtime, options.clear);
		}

		return frame;
	}

	/**
	 * End one frame scope with optional flush/finish flags
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} frame frame from BzFrame.begin
	 * @param {object} [options = {}] frame end options
	 * @returns {object} ended frame object
	 */
	static end(runtimeOrGl, frame, options = {}) {
		if (!frame || !frame.gl) {
			throw new TypeError("BzFrame.end requires a frame from BzFrame.begin");
		}

		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		if (options.flush ?? true) {
			gl.flush();
		}
		if (options.finish ?? false) {
			gl.finish();
		}
		if (options.unbindFramebuffer ?? false) {
			gl.bindFramebuffer(options.framebufferTarget ?? gl.FRAMEBUFFER, null);
		}

		frame.endedAt = bzNow();
		frame.cpuMs = frame.endedAt - frame.startedAt;
		return frame;
	}

	/**
	 * Run callback inside one begin/end frame scope
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {(gl: WebGLRenderingContext | WebGL2RenderingContext, frame: object) => any | Promise<any>} callback frame callback
	 * @param {object} [options = {}] begin and end options
	 * @returns {Promise<object>} callback value and frame stats
	 */
	static async with(runtimeOrGl, callback, options = {}) {
		if (typeof callback !== "function") {
			throw new TypeError("BzFrame.with requires a callback function");
		}

		const frame = BzFrame.begin(runtimeOrGl, options);
		let value;
		try {
			value = await callback(frame.gl, frame);
		} finally {
			BzFrame.end(runtimeOrGl, frame, options);
		}

		return {
			value,
			frame,
			cpuMs: frame.cpuMs,
		};
	}
}


// ------ BzResourcePool ------

class BzResourcePool {
	/**
	 * Create one resource pool for transient GL resources
	 * @param {object} [options = {}] pool options
	 * @returns {object} pool object
	 */
	static create(options = {}) {
		return {
			label: options.label ?? "BzResourcePool",
			bufferFree: new Map(),
			bufferBusy: new Map(),
			textureFree: new Map(),
			textureBusy: new Map(),
			hits: 0,
			misses: 0,
			released: 0,
		};
	}

	/**
	 * Acquire pooled buffer or create one on miss
	 * @param {object} pool pool from BzResourcePool.create
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor buffer descriptor
	 * @param {string} key optional manual key
	 * @returns {WebGLBuffer} pooled buffer
	 */
	static acquireBuffer(pool, runtimeOrGl, descriptor, key) {
		BzResourcePool._assertPool(pool);
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzResourcePool.acquireBuffer requires a descriptor");
		}

		const resolvedKey = BzResourcePool._resolveKey("buffer", descriptor, key);
		const freeBucket = BzResourcePool._bucket(pool.bufferFree, resolvedKey);
		const busyBucket = BzResourcePool._bucket(pool.bufferBusy, resolvedKey);

		let buffer = freeBucket.pop();
		if (buffer) {
			pool.hits += 1;
		} else {
			buffer = BzBuffer.create(runtimeOrGl, descriptor);
			pool.misses += 1;
		}

		busyBucket.push(buffer);
		return buffer;
	}

	/**
	 * Release one buffer back to free list
	 * @param {object} pool pool from BzResourcePool.create
	 * @param {WebGLBuffer} buffer buffer to release
	 * @param {string} key optional known bucket key
	 * @returns {boolean} true when buffer was released
	 */
	static releaseBuffer(pool, buffer, key) {
		BzResourcePool._assertPool(pool);
		if (!buffer) {
			throw new TypeError("BzResourcePool.releaseBuffer requires a buffer");
		}

		if (typeof key === "string" && key.length > 0) {
			return BzResourcePool._releaseByKey(pool.bufferBusy, pool.bufferFree, key, buffer, pool);
		}
		return BzResourcePool._releaseAny(pool.bufferBusy, pool.bufferFree, buffer, pool);
	}

	/**
	 * Acquire pooled 2D texture or create one on miss
	 * @param {object} pool pool from BzResourcePool.create
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} descriptor texture descriptor
	 * @param {string} key optional manual key
	 * @returns {WebGLTexture} pooled texture
	 */
	static acquireTexture2D(pool, runtimeOrGl, descriptor, key) {
		BzResourcePool._assertPool(pool);
		if (!descriptor || typeof descriptor !== "object") {
			throw new TypeError("BzResourcePool.acquireTexture2D requires a descriptor");
		}

		const resolvedKey = BzResourcePool._resolveKey("texture2D", descriptor, key);
		const freeBucket = BzResourcePool._bucket(pool.textureFree, resolvedKey);
		const busyBucket = BzResourcePool._bucket(pool.textureBusy, resolvedKey);

		let texture = freeBucket.pop();
		if (texture) {
			pool.hits += 1;
		} else {
			texture = BzTexture.create2D(runtimeOrGl, descriptor);
			pool.misses += 1;
		}

		busyBucket.push(texture);
		return texture;
	}

	/**
	 * Release one texture back to free list
	 * @param {object} pool pool from BzResourcePool.create
	 * @param {WebGLTexture} texture texture to release
	 * @param {string} key optional known bucket key
	 * @returns {boolean} true when texture was released
	 */
	static releaseTexture(pool, texture, key) {
		BzResourcePool._assertPool(pool);
		if (!texture) {
			throw new TypeError("BzResourcePool.releaseTexture requires a texture");
		}

		if (typeof key === "string" && key.length > 0) {
			return BzResourcePool._releaseByKey(pool.textureBusy, pool.textureFree, key, texture, pool);
		}
		return BzResourcePool._releaseAny(pool.textureBusy, pool.textureFree, texture, pool);
	}

	/**
	 * Return pool counters and bucket stats
	 * @param {object} pool pool from BzResourcePool.create
	 * @returns {object} stats object
	 */
	static stats(pool) {
		BzResourcePool._assertPool(pool);
		return {
			hits: pool.hits,
			misses: pool.misses,
			released: pool.released,
			bufferFreeBuckets: pool.bufferFree.size,
			bufferBusyBuckets: pool.bufferBusy.size,
			textureFreeBuckets: pool.textureFree.size,
			textureBusyBuckets: pool.textureBusy.size,
		};
	}

	/**
	 * Destroy all pooled resources and clear all buckets
	 * @param {object} pool pool from BzResourcePool.create
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @returns {object} destroy counters
	 */
	static destroy(pool, runtimeOrGl) {
		BzResourcePool._assertPool(pool);

		let buffers = 0;
		let textures = 0;

		for (const bucket of pool.bufferFree.values()) {
			buffers += BzBuffer.destroyAll(runtimeOrGl, bucket);
		}
		for (const bucket of pool.bufferBusy.values()) {
			buffers += BzBuffer.destroyAll(runtimeOrGl, bucket);
		}
		for (const bucket of pool.textureFree.values()) {
			textures += BzTexture.destroyAll(runtimeOrGl, bucket);
		}
		for (const bucket of pool.textureBusy.values()) {
			textures += BzTexture.destroyAll(runtimeOrGl, bucket);
		}

		pool.bufferFree.clear();
		pool.bufferBusy.clear();
		pool.textureFree.clear();
		pool.textureBusy.clear();

		return { buffers, textures };
	}

	/**
	 * Validate pool shape before use
	 * @param {object} pool pool candidate
	 * @returns {void} return value
	 */
	static _assertPool(pool) {
		if (!pool || !(pool.bufferFree instanceof Map) || !(pool.textureFree instanceof Map)) {
			throw new TypeError("BzResourcePool requires a pool from BzResourcePool.create");
		}
	}

	/**
	 * Get bucket array from map and create when missing
	 * @param {Map<string, any[]>} map bucket map
	 * @param {string} key bucket key
	 * @returns {any[]} bucket array
	 */
	static _bucket(map, key) {
		let bucket = map.get(key);
		if (!bucket) {
			bucket = [];
			map.set(key, bucket);
		}
		return bucket;
	}

	/**
	 * Resolve pool key from descriptor unless manual key is provided
	 * @param {string} kind resource kind label
	 * @param {object} descriptor descriptor object
	 * @param {string} key optional manual key
	 * @returns {string} resolved pool key
	 */
	static _resolveKey(kind, descriptor, key) {
		if (typeof key === "string" && key.length > 0) {
			return key;
		}

		const filtered = { ...descriptor };
		delete filtered.data;
		delete filtered.source;
		delete filtered.sources;
		delete filtered.faces;
		delete filtered.image;

		return kind + ":" + bzStableKey(filtered);
	}

	/**
	 * Move one resource by explicit bucket key
	 * @param {Map<string, any[]>} busyMap busy resource map
	 * @param {Map<string, any[]>} freeMap free resource map
	 * @param {string} key known bucket key
	 * @param {any} resource resource instance
	 * @param {object} pool pool state
	 * @returns {boolean} true when resource moved
	 */
	static _releaseByKey(busyMap, freeMap, key, resource, pool) {
		const busyBucket = busyMap.get(key);
		if (!busyBucket || busyBucket.length === 0) {
			return false;
		}

		const index = busyBucket.indexOf(resource);
		if (index === -1) {
			return false;
		}

		const [out] = busyBucket.splice(index, 1);
		if (busyBucket.length === 0) {
			busyMap.delete(key);
		}

		BzResourcePool._bucket(freeMap, key).push(out);
		pool.released += 1;
		return true;
	}

	/**
	 * Move one resource by scanning all busy buckets
	 * @param {Map<string, any[]>} busyMap busy resource map
	 * @param {Map<string, any[]>} freeMap free resource map
	 * @param {any} resource resource instance
	 * @param {object} pool pool state
	 * @returns {boolean} true when resource moved
	 */
	static _releaseAny(busyMap, freeMap, resource, pool) {
		for (const [key, busyBucket] of busyMap.entries()) {
			const index = busyBucket.indexOf(resource);
			if (index === -1) {
				continue;
			}

			const [out] = busyBucket.splice(index, 1);
			if (busyBucket.length === 0) {
				busyMap.delete(key);
			}

			BzResourcePool._bucket(freeMap, key).push(out);
			pool.released += 1;
			return true;
		}

		return false;
	}
}


// ------ BzBatch ------

class BzBatch {
	/**
	 * Create one draw batch object
	 * @param {object} [options = {}] batch options
	 * @returns {object} batch object
	 */
	static create(options = {}) {
		return {
			label: options.label ?? "BzBatch",
			sort: options.sort ?? true,
			sorter: typeof options.sorter === "function" ? options.sorter : null,
			calls: [],
		};
	}

	/**
	 * Push one draw call packet into a batch
	 * @param {object} batch batch from BzBatch.create
	 * @param {object} drawCall draw call packet
	 * @returns {object} same draw call packet
	 */
	static push(batch, drawCall) {
		BzBatch._assertBatch(batch);
		if (!drawCall || typeof drawCall !== "object") {
			throw new TypeError("BzBatch.push requires a drawCall object");
		}
		batch.calls.push(drawCall);
		return drawCall;
	}

	/**
	 * Clear all batch entries
	 * @param {object} batch batch from BzBatch.create
	 * @returns {void} return value
	 */
	static clear(batch) {
		BzBatch._assertBatch(batch);
		batch.calls.length = 0;
	}

	/**
	 * Execute all draw calls in batch with optional sorting
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} batch batch from BzBatch.create
	 * @param {object} [options = {}] run options
	 * @returns {number} number of executed draw calls
	 */
	static run(runtimeOrGl, batch, options = {}) {
		BzBatch._assertBatch(batch);

		const calls = options.inPlace ?? false
			? batch.calls
			: batch.calls.slice();

		const sortEnabled = options.sort ?? batch.sort ?? true;
		if (sortEnabled && calls.length > 1) {
			const sorter = options.sorter ?? batch.sorter ?? BzBatch._defaultSorter;
			calls.sort(sorter);
		}

		let executed = 0;

		for (const call of calls) {
			if (!call || call.skip) {
				continue;
			}

			if (typeof call.execute === "function") {
				call.execute(runtimeOrGl, call);
				executed += 1;
				continue;
			}

			const kind = call.kind ?? "arrays";
			const descriptor = call.descriptor ?? call;

			switch (kind) {
				case "arrays":
					BzDraw.arrays(runtimeOrGl, descriptor);
					break;
				case "elements":
					BzDraw.elements(runtimeOrGl, descriptor);
					break;
				case "arraysInstanced":
					BzDraw.arraysInstanced(runtimeOrGl, descriptor);
					break;
				case "elementsInstanced":
					BzDraw.elementsInstanced(runtimeOrGl, descriptor);
					break;
				default:
					throw new Error("Unknown batch draw kind: " + kind);
			}

			executed += 1;
		}

		if (options.clearAfterRun ?? false) {
			BzBatch.clear(batch);
		}

		return executed;
	}

	/**
	 * Validate batch shape before use
	 * @param {object} batch batch candidate
	 * @returns {void} return value
	 */
	static _assertBatch(batch) {
		if (!batch || !Array.isArray(batch.calls)) {
			throw new TypeError("BzBatch requires a batch from BzBatch.create");
		}
	}

	/**
	 * Default draw-call sorter for lightweight pipeline stability
	 * @param {object} a first call
	 * @param {object} b second call
	 * @returns {number} sort order
	 */
	static _defaultSorter(a, b) {
		const keyA = a.sortKey ?? "";
		const keyB = b.sortKey ?? "";
		if (keyA < keyB) {
			return -1;
		}
		if (keyA > keyB) {
			return 1;
		}

		const pa = a.program ?? a.descriptor?.program ?? null;
		const pb = b.program ?? b.descriptor?.program ?? null;
		if (pa === pb) {
			return 0;
		}
		if (pa && !pb) {
			return -1;
		}
		if (!pa && pb) {
			return 1;
		}
		return 0;
	}
}


// ------ BzTimer ------

class BzTimer {
	/**
	 * Check if GPU timer query looks supported in this runtime
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @returns {boolean} true when GPU timer path is available
	 */
	static supported(runtimeOrGl) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;

		if (runtime.isWebGL2) {
			const ext2 = BzExtensions.get(runtime, "EXT_disjoint_timer_query_webgl2", { optional: true });
			return !!(ext2 && typeof gl.createQuery === "function" && typeof gl.beginQuery === "function");
		}

		const ext1 = BzExtensions.get(runtime, "EXT_disjoint_timer_query", { optional: true });
		return !!(ext1 && typeof ext1.createQueryEXT === "function");
	}

	/**
	 * Create timer state with GPU path when available otherwise CPU fallback
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [options = {}] timer options
	 * @returns {object} timer object
	 */
	static create(runtimeOrGl, options = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const preferGpu = options.preferGpu ?? true;
		if (!preferGpu) {
			return {
				mode: "cpu",
				label: options.label ?? "BzTimerCPU",
				fallbackReason: "GPU timer was not requested",
			};
		}

		if (!BzTimer.supported(runtime)) {
			return {
				mode: "cpu",
				label: options.label ?? "BzTimerCPU",
				fallbackReason: "GPU timer query extension is not available",
			};
		}

		if (runtime.isWebGL2) {
			return {
				mode: "gpu",
				backend: "webgl2",
				label: options.label ?? "BzTimerGPU",
				ext: BzExtensions.get(runtime, "EXT_disjoint_timer_query_webgl2", { optional: false }),
			};
		}

		return {
			mode: "gpu",
			backend: "webgl1",
			label: options.label ?? "BzTimerGPU",
			ext: BzExtensions.get(runtime, "EXT_disjoint_timer_query", { optional: false }),
		};
	}

	/**
	 * Measure one workload via GPU timer query or CPU fallback
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {(gl: WebGLRenderingContext | WebGL2RenderingContext, hints: object) => any | Promise<any>} encode encode callback
	 * @param {object} [options = {}] measure options
	 * @returns {Promise<object>} timing result object
	 */
	static async measure(runtimeOrGl, encode, options = {}) {
		const runtime = bzResolveRuntime(runtimeOrGl);
		const gl = runtime.gl;
		if (typeof encode !== "function") {
			throw new TypeError("BzTimer.measure requires an encode callback");
		}

		const timer = options.timer ?? BzTimer.create(runtime, options);
		const ownTimer = !options.timer;

		try {
			if (timer.mode === "gpu") {
				const gpuResult = await BzTimer._measureGpu(runtime, timer, encode, options);
				return gpuResult;
			}

			const cpuStart = bzNow();
			const value = await encode(gl, { timer: null });
			if (options.finish ?? true) {
				gl.finish();
			}
			const cpuMs = bzNow() - cpuStart;

			return {
				mode: "cpu",
				cpuMs,
				fallbackReason: timer.fallbackReason,
				value,
			};
		} finally {
			if (ownTimer) {
				BzTimer.destroy(runtime, timer);
			}
		}
	}

	/**
	 * Destroy timer resources when needed (queries are one-shot for now)
	 * @param {object | WebGLRenderingContext} _runtimeOrGl runtime object or raw context
	 * @param {object} _timer timer object
	 * @returns {void} return value
	 */
	static destroy(_runtimeOrGl, _timer) {
		// currently no persistent resources, one-shot queries are deleted after each measurement
	}

	/**
	 * GPU timing path using EXT disjoint timer query
	 * @param {object} runtime runtime object
	 * @param {object} timer timer object
	 * @param {(gl: WebGLRenderingContext | WebGL2RenderingContext, hints: object) => any | Promise<any>} encode encode callback
	 * @param {object} options measure options
	 * @returns {Promise<object>} GPU timing result
	 */
	static async _measureGpu(runtime, timer, encode, options) {
		const gl = runtime.gl;
		const query = BzTimer._createQuery(gl, timer);
		if (!query) {
			throw new Error("BzTimer could not create a timer query object");
		}

		BzTimer._beginQuery(gl, timer, query);
		let value;
		try {
			value = await encode(gl, { timerQuery: query, timer });
		} finally {
			BzTimer._endQuery(gl, timer);
		}

		gl.flush();

		let nanoseconds;
		try {
			nanoseconds = await BzTimer._waitForResult(gl, timer, query, options);
		} finally {
			BzTimer._deleteQuery(gl, timer, query);
		}

		const disjoint = BzTimer._isDisjoint(gl, timer);
		return {
			mode: "gpu",
			gpuMs: Number(nanoseconds) / 1000000,
			nanoseconds: Number(nanoseconds),
			disjoint,
			value,
		};
	}

	/**
	 * Create timer query object for active backend
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} timer timer object
	 * @returns {any} timer query object
	 */
	static _createQuery(gl, timer) {
		if (timer.backend === "webgl2") {
			return gl.createQuery();
		}
		return timer.ext.createQueryEXT();
	}

	/**
	 * Begin timer query for active backend
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} timer timer object
	 * @param {any} query query object
	 * @returns {void} return value
	 */
	static _beginQuery(gl, timer, query) {
		if (timer.backend === "webgl2") {
			gl.beginQuery(timer.ext.TIME_ELAPSED_EXT, query);
			return;
		}
		timer.ext.beginQueryEXT(timer.ext.TIME_ELAPSED_EXT, query);
	}

	/**
	 * End timer query for active backend
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} timer timer object
	 * @returns {void} return value
	 */
	static _endQuery(gl, timer) {
		if (timer.backend === "webgl2") {
			gl.endQuery(timer.ext.TIME_ELAPSED_EXT);
			return;
		}
		timer.ext.endQueryEXT(timer.ext.TIME_ELAPSED_EXT);
	}

	/**
	 * Delete timer query object for active backend
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} timer timer object
	 * @param {any} query query object
	 * @returns {void} return value
	 */
	static _deleteQuery(gl, timer, query) {
		if (!query) {
			return;
		}
		if (timer.backend === "webgl2") {
			gl.deleteQuery(query);
			return;
		}
		timer.ext.deleteQueryEXT(query);
	}

	/**
	 * Wait until timer query result is available or timeout is reached
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} timer timer object
	 * @param {any} query query object
	 * @param {object} options timing wait options
	 * @returns {Promise<number>} query result in nanoseconds
	 */
	static _waitForResult(gl, timer, query, options) {
		const timeoutMs = Number(options.timeoutMs ?? 2000);
		const pollMs = Number(options.pollMs ?? 8);
		const start = bzNow();

		return new Promise((resolve, reject) => {
			const tick = () => {
				try {
					if (BzTimer._isResultAvailable(gl, timer, query)) {
						const result = BzTimer._readResult(gl, timer, query);
						resolve(Number(result));
						return;
					}

					if (bzNow() - start >= timeoutMs) {
						reject(new Error("BzTimer query timeout after " + timeoutMs + "ms"));
						return;
					}
				} catch (error) {
					reject(error);
					return;
				}

				if (typeof requestAnimationFrame === "function") {
					requestAnimationFrame(tick);
				} else {
					setTimeout(tick, pollMs);
				}
			};

			tick();
		});
	}

	/**
	 * Check if timer query result is available
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} timer timer object
	 * @param {any} query query object
	 * @returns {boolean} true when result is ready
	 */
	static _isResultAvailable(gl, timer, query) {
		if (timer.backend === "webgl2") {
			return Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE));
		}
		return Boolean(timer.ext.getQueryObjectEXT(query, timer.ext.QUERY_RESULT_AVAILABLE_EXT));
	}

	/**
	 * Read timer query result value
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} timer timer object
	 * @param {any} query query object
	 * @returns {number} nanoseconds result
	 */
	static _readResult(gl, timer, query) {
		if (timer.backend === "webgl2") {
			return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
		}
		return Number(timer.ext.getQueryObjectEXT(query, timer.ext.QUERY_RESULT_EXT));
	}

	/**
	 * Check GPU disjoint flag state
	 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl raw context
	 * @param {object} timer timer object
	 * @returns {boolean} true when GPU disjoint was reported
	 */
	static _isDisjoint(gl, timer) {
		try {
			return Boolean(gl.getParameter(timer.ext.GPU_DISJOINT_EXT));
		} catch (_error) {
			return false;
		}
	}
}


// ------ BzFormat ------

class BzFormat {
	/**
	 * Return common defaults for 2D textures
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [overrides = {}] optional overrides
	 * @returns {object} default descriptor
	 */
	static texture2D(runtimeOrGl, overrides = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		const base = {
			target: gl.TEXTURE_2D,
			level: 0,
			internalFormat: gl.RGBA,
			format: gl.RGBA,
			type: gl.UNSIGNED_BYTE,
			width: 1,
			height: 1,
			allocate: true,
			generateMipmap: false,
			params: {
				minFilter: gl.LINEAR,
				magFilter: gl.LINEAR,
				wrapS: gl.CLAMP_TO_EDGE,
				wrapT: gl.CLAMP_TO_EDGE,
			},
		};
		return BzFormat._merge(base, overrides);
	}

	/**
	 * Return common defaults for cubemap textures
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {object} [overrides = {}] optional overrides
	 * @returns {object} default descriptor
	 */
	static cube(runtimeOrGl, overrides = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		const base = {
			level: 0,
			internalFormat: gl.RGBA,
			format: gl.RGBA,
			type: gl.UNSIGNED_BYTE,
			size: 1,
			generateMipmap: false,
			params: {
				minFilter: gl.LINEAR,
				magFilter: gl.LINEAR,
				wrapS: gl.CLAMP_TO_EDGE,
				wrapT: gl.CLAMP_TO_EDGE,
			},
		};
		return BzFormat._merge(base, overrides);
	}

	/**
	 * Return common framebuffer descriptor defaults
	 * @param {object | WebGLRenderingContext} runtimeOrGl runtime object or raw context
	 * @param {number} width framebuffer width
	 * @param {number} height framebuffer height
	 * @param {object} [overrides = {}] optional overrides
	 * @returns {object} default descriptor
	 */
	static framebuffer(runtimeOrGl, width, height, overrides = {}) {
		const gl = BzContext.gl(runtimeOrGl);
		const base = {
			width,
			height,
			check: true,
			unbind: true,
			depthRenderbuffer: {
				format: gl.DEPTH_COMPONENT16,
				width,
				height,
				attachment: gl.DEPTH_ATTACHMENT,
			},
		};
		return BzFormat._merge(base, overrides);
	}

	/**
	 * Merge default descriptor with overrides recursively for plain objects
	 * @param {object} base base descriptor
	 * @param {object} overrides override descriptor
	 * @returns {object} merged descriptor
	 */
	static _merge(base, overrides) {
		const out = { ...base };
		for (const [key, value] of Object.entries(overrides ?? {})) {
			if (bzPlainObject(value) && bzPlainObject(out[key])) {
				out[key] = BzFormat._merge(out[key], value);
			} else {
				out[key] = value;
			}
		}
		return out;
	}
}


window.BzWGL = {
	BzContext,
	BzExtensions,
	BzLimits,
	BzShader,
	BzProgram,
	BzBuffer,
	BzVertexArray,
	BzTexture,
	BzFramebuffer,
	BzState,
	BzUniform,
	BzDraw,
	BzFrame,
	BzResourcePool,
	BzBatch,
	BzTimer,
	BzFormat,
};
