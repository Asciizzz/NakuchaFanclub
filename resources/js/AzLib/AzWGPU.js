/* AsczWGPU
By Asciiz

Ok guys, I'm moving on from WebGL to WebGPU now, isn't that exciting? (No, ts is literally Vulkan reincarnated)

Note:
* Many methods here are just calling what WebGPU already provides, but it's nice to have an API/naming layer
that is categorized by resource type

#Adapter:
* Picks adapter candidates and gives quick capability read
* Methods
	+ request(options = {})
	+ pickBest(options = {})
	+ getCapabilities(adapter)

#Device:
* Creates device, queue access, plus lost/error-scope hooks
* Methods
	+ create(adapter, options = {})
	+ getQueue(device)
	+ onLost(device, handler)
	+ withErrorScope(device, filter, callback)

#Context:
* Canvas configure helper, nothing fancy
* Methods
	+ create(device, canvas, config = {})
	+ reconfigure(context, descriptor)
	+ unconfigure(context)

#Buffer:
* Make buffers, upload/read bytes, and cleanup in bulk
* Methods
	+ create(device, descriptor)
	+ createMapped(device, descriptor, source = null, sourceOffset = 0)
	+ write(device, buffer, data, offset = 0)
	+ read(device, buffer, size, offset = 0)
	+ readTyped(device, buffer, TypedArrayCtor, count, options = {})
	+ copy(device, sourceBuffer, destinationBuffer, size, options = {})
	+ destroyAll(buffers)

#Texture:
* Create textures and push pixels/layers from bytes or external image
* Methods
	+ create(device, descriptor)
	+ create2D(device, options = {})
	+ createCube(device, options = {})
	+ create3D(device, options = {})
	+ create2DArray(device, options = {})
	+ createDepth2D(device, options = {})
	+ write(device, texture, source, layout, size)
	+ writeLayer(device, texture, source, options = {})
	+ writeExternal(device, texture, source, options = {})
	+ createView(texture, descriptor)
	+ destroyAll(textures)

#Sampler:
* Small sampler wrapper so you dont retype descriptor noise
* Methods
	+ create(device, descriptor = {})

#BindGroup:
* Build bind group layouts and bind groups
* Methods
	+ createLayout(device, descriptor)
	+ create(device, descriptor)

#Pipeline:
* Create render/compute pipelines from your own descriptors
* Methods
	+ createRender(device, descriptor)
	+ createCompute(device, descriptor)
	+ createRenderChecked(device, descriptor, options = {})
	+ createComputeChecked(device, descriptor, options = {})

#Pass:
* Begin/end pass or run scoped pass callback
* Methods
	+ beginRender(encoder, descriptor)
	+ beginCompute(encoder, descriptor = {})
	+ withRender(encoder, descriptor, callback)
	+ withCompute(encoder, descriptor, callback)
	+ end(passEncoder)

#Command:
* Encoder + submit helpers, plus copy commands
* Methods
	+ createEncoder(device, label)
	+ finish(encoder)
	+ withEncoder(device, callback, options = {})
	+ submit(device, commandBuffers)
	+ submitAndWait(device, commandBuffers)
	+ copyBufferToBuffer(device, source, destination, size, options = {})
	+ copyBufferToTexture(device, source, destination, copySize, options = {})
	+ copyTextureToBuffer(device, source, destination, copySize, options = {})
	+ copyTextureToTexture(device, source, destination, copySize, options = {})

#Shader:
* Create WGSL module and optional compilation check
* Methods
	+ create(device, descriptor)
	+ createChecked(device, descriptor, options = {})
	+ summarizeMessages(messages, options = {})

#Format:
* Quick defaults for canvas and depth formats
* Methods
	+ preferredCanvas()
	+ depthDefaults()

#Limits:
* Read features/limits and fail fast when requirements miss
* Methods
	+ inspect(adapterOrDevice)
	+ hasFeatures(adapterOrDevice, featureList)
	+ require(adapterOrDevice, constraints = {})

#Frame:
* One-frame encode/submit flow helper
* Methods
	+ begin(device, options = {})
	+ finish(frame)
	+ submit(device, frameOrCommandBuffer, options = {})
	+ with(device, callback, options = {})

#ResourcePool:
* Reuse temp buffers/textures so alloc churn goes down
* Methods
	+ create(options = {})
	+ acquireBuffer(pool, device, descriptor, key)
	+ releaseBuffer(pool, buffer, key)
	+ acquireTexture(pool, device, descriptor, key)
	+ releaseTexture(pool, texture, key)
	+ stats(pool)
	+ destroy(pool)

#LayoutCache:
* Cache bind/pipeline layouts from stable keys
* Methods
	+ create(options = {})
	+ getBindGroupLayout(cache, device, descriptor, key)
	+ getPipelineLayout(cache, device, descriptor, key)
	+ stats(cache)
	+ clear(cache)

#Timer:
* Measure workloads with timestamp path or CPU fallback
* Methods
	+ supportInfo(device)
	+ supported(device)
	+ create(device, options = {})
	+ measure(device, encode, options = {})
	+ destroy(timer)
*/


// ------ Adapter ------

export class Adapter {
	/**
	 * Ask browser for one adapter using raw WebGPU options
	 * @param {object} [options = {}] options for this call
	 * @returns {Promise<GPUAdapter>}
	 */
	static async request(options = {}) {
		if (typeof navigator === "undefined" || !navigator.gpu) {
			throw new Error("WebGPU is not available in this environment");
		}

		const adapter = await navigator.gpu.requestAdapter(options);
		if (!adapter) {
			throw new Error("No compatible GPU adapter was found");
		}

		return adapter;
	}

	/**
	 * Try multiple adapter candidates and pick best by small policy
	 * @param {object} [options = {}] options for this call
	 * @returns {Promise<object>}
	 */
	static async pickBest(options = {}) {
		if (typeof navigator === "undefined" || !navigator.gpu) {
			throw new Error("WebGPU is not available in this environment");
		}

		const includeFallbackCandidate = options.includeFallbackCandidate ?? false;
		const defaultCandidates = includeFallbackCandidate
			? [{}, { forceFallbackAdapter: false }, { forceFallbackAdapter: true }]
			: [{}, { forceFallbackAdapter: false }];

		const candidates = Array.isArray(options.candidates) && options.candidates.length > 0
			? options.candidates
			: defaultCandidates;

		const avoidPowerPreferenceWarning = options.avoidPowerPreferenceWarning ?? true;
		const sanitizedCandidates = candidates.map((candidate) => {
			const next = { ...candidate };
			const hasPowerPreference = Object.prototype.hasOwnProperty.call(next, "powerPreference");
			const onWindows = typeof navigator !== "undefined" && /Win/i.test(navigator.platform ?? "");
			if (avoidPowerPreferenceWarning && onWindows && hasPowerPreference) {
				delete next.powerPreference;
			}
			return next;
		});

		const policy = options.policy ?? {};
		const preferFallback = policy.preferFallback ?? false;
		const requiredFeatures = Array.isArray(policy.requiredFeatures) ? policy.requiredFeatures : [];
		const requiredLimits = policy.requiredLimits ?? {};

		const seen = new Set();
		const successful = [];

		for (const candidate of sanitizedCandidates) {
			const key = JSON.stringify(candidate);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);

			const adapter = await navigator.gpu.requestAdapter(candidate);
			if (!adapter) {
				continue;
			}

			const score = Adapter._scoreAdapter(adapter, {
				preferFallback,
				requiredFeatures,
				requiredLimits,
			});

			successful.push({
				adapter,
				request: candidate,
				score,
			});
		}

		if (successful.length === 0) {
			throw new Error("No compatible GPU adapter was found from pickBest candidates");
		}

		successful.sort((a, b) => b.score - a.score);
		const best = successful[0];

		if (best.score < 0) {
			throw new Error("No adapter satisfied pickBest policy requirements");
		}

		return {
			adapter: best.adapter,
			request: best.request,
			score: best.score,
			candidatesTried: successful.length,
		};
	}

	/**
	 * Get quick capability snapshot from adapter
	 * @param {GPUAdapter} adapter source adapter
	 * @returns {object}
	 */
	static getCapabilities(adapter) {
		if (!adapter) {
			throw new TypeError("Adapter.getCapabilities requires a GPUAdapter");
		}

		return {
			limits: adapter.limits,
			features: Array.from(adapter.features),
			isFallbackAdapter: adapter.isFallbackAdapter ?? false,
		};
	}

	/**
	 * Internal score pass for adapter ranking
	 * @param {GPUAdapter} adapter source adapter
	 * @param {object} policy selection policy
	 * @returns {number}
	 */
	static _scoreAdapter(adapter, policy) {
		let score = 0;

		if (policy.preferFallback) {
			score += adapter.isFallbackAdapter ? 20 : 0;
		} else {
			score += adapter.isFallbackAdapter ? 0 : 20;
		}

		for (const feature of policy.requiredFeatures) {
			if (!adapter.features.has(feature)) {
				return -100000;
			}
			score += 3;
		}

		for (const [limitName, minValue] of Object.entries(policy.requiredLimits)) {
			const actual = adapter.limits[limitName];
			if (typeof actual === "undefined") {
				return -100000;
			}
			const actualNumber = Number(actual);
			const requiredNumber = Number(minValue);
			if (Number.isNaN(actualNumber) || Number.isNaN(requiredNumber) || actualNumber < requiredNumber) {
				return -100000;
			}
			score += 1;
		}

		score += adapter.features.size;
		return score;
	}
}



// ------ Device ------

export class Device {
	/**
	 * Create GPUDevice from adapter
	 * @param {GPUAdapter} adapter source adapter
	 * @param {object} [options = {}] options for this call
	 * @returns {Promise<GPUDevice>}
	 */
	static async create(adapter, options = {}) {
		if (!adapter) {
			throw new TypeError("Device.create requires a GPUAdapter");
		}

		const descriptor = options.descriptor ?? options;
		return adapter.requestDevice(descriptor);
	}

	/**
	 * Get device queue
	 * @param {GPUDevice} device GPU device
	 * @returns {GPUQueue}
	 */
	static getQueue(device) {
		if (!device) {
			throw new TypeError("Device.getQueue requires a GPUDevice");
		}

		return device.queue;
	}

	/**
	 * Attach device lost callback
	 * @param {GPUDevice} device GPU device
	 * @param {Function} handler callback when device is lost
	 * @returns {void}
	 */
	static onLost(device, handler) {
		if (!device) {
			throw new TypeError("Device.onLost requires a GPUDevice");
		}
		if (typeof handler !== "function") {
			throw new TypeError("Device.onLost requires a function handler");
		}

		device.lost.then(handler);
	}

	/**
	 * Run callback inside one error scope and return captured error if any
	 * @param {GPUDevice} device GPU device
	 * @param {GPUErrorFilter} filter error scope filter
	 * @param {() => any | Promise<any>} callback scoped callback
	 * @returns {Promise<object>}
	 */
	static async withErrorScope(device, filter, callback) {
		if (!device) {
			throw new TypeError("Device.withErrorScope requires a GPUDevice");
		}
		if (typeof callback !== "function") {
			throw new TypeError("Device.withErrorScope requires a callback function");
		}

		device.pushErrorScope(filter ?? "validation");
		let value;
		try {
			value = await callback();
		} finally {
			const error = await device.popErrorScope();
			if (error) {
				return { value, error, ok: false };
			}
		}
		return { value, error: null, ok: true };
	}
}



// ------ Context ------

export class Context {
	/**
	 * Create and configure WebGPU canvas context
	 * @param {GPUDevice} device GPU device
	 * @param {HTMLCanvasElement} canvas target canvas
	 * @param {GPUCanvasConfiguration} [config = {}] context config
	 * @returns {GPUCanvasContext}
	 */
	static create(device, canvas, config = {}) {
		if (!device) {
			throw new TypeError("Context.create requires a GPUDevice");
		}
		if (!canvas) {
			throw new TypeError("Context.create requires a canvas");
		}

		const context = canvas.getContext("webgpu");
		if (!context) {
			throw new Error("Failed to acquire a WebGPU canvas context");
		}

		const format = config.format ?? navigator.gpu.getPreferredCanvasFormat();
		context.configure({
			device,
			format,
			alphaMode: config.alphaMode ?? "premultiplied",
			usage: config.usage,
			viewFormats: config.viewFormats,
			colorSpace: config.colorSpace,
			toneMapping: config.toneMapping,
		});

		return context;
	}

	/**
	 * Reconfigure existing canvas context
	 * @param {GPUCanvasContext} context canvas context
	 * @param {object} descriptor setup data
	 * @returns {GPUCanvasContext}
	 */
	static reconfigure(context, descriptor) {
		if (!context) {
			throw new TypeError("Context.reconfigure requires a GPUCanvasContext");
		}

		context.configure(descriptor);
		return context;
	}

	/**
	 * Unconfigure canvas context
	 * @param {GPUCanvasContext} context canvas context
	 * @returns {void}
	 */
	static unconfigure(context) {
		if (!context) {
			throw new TypeError("Context.unconfigure requires a GPUCanvasContext");
		}

		context.unconfigure();
	}
}



// ------ Buffer ------

export class Buffer {
	/**
	 * Create GPUBuffer from descriptor
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @returns {GPUBuffer}
	 */
	static create(device, descriptor) {
		if (!device) {
			throw new TypeError("Buffer.create requires a GPUDevice");
		}
		if (!descriptor) {
			throw new TypeError("Buffer.create requires a descriptor");
		}

		return device.createBuffer(descriptor);
	}

	/**
	 * Create mapped buffer, optionally seed it, then unmap
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor buffer descriptor
	 * @param {ArrayBuffer | ArrayBufferView | null} [source = null] optional seed data
	 * @param {number} [sourceOffset = 0] source byte offset
	 * @returns {GPUBuffer}
	 */
	static createMapped(device, descriptor, source = null, sourceOffset = 0) {
		if (!device || !descriptor) {
			throw new TypeError("Buffer.createMapped requires device and descriptor");
		}

		const mappedDescriptor = {
			...descriptor,
			mappedAtCreation: true,
		};
		const buffer = device.createBuffer(mappedDescriptor);

		try {
			if (source) {
				const range = buffer.getMappedRange();
				const bytes = new Uint8Array(range);
				const sourceBytes = source instanceof ArrayBuffer
					? new Uint8Array(source)
					: new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
				const start = Math.max(0, sourceOffset | 0);
				const count = Math.min(bytes.byteLength, sourceBytes.byteLength - start);
				if (count > 0) {
					bytes.set(sourceBytes.subarray(start, start + count), 0);
				}
			}
		} finally {
			buffer.unmap();
		}

		return buffer;
	}

	/**
	 * Write data into buffer using queue.writeBuffer
	 * @param {GPUDevice} device GPU device
	 * @param {GPUBuffer} buffer buffer to read or write
	 * @param {ArrayBuffer | ArrayBufferView} data data to upload
	 * @param {number} [offset = 0] byte offset
	 * @returns {void}
	 */
	static write(device, buffer, data, offset = 0) {
		if (!device || !buffer) {
			throw new TypeError("Buffer.write requires a GPUDevice and GPUBuffer");
		}
		if (!data) {
			throw new TypeError("Buffer.write requires data");
		}

		if (ArrayBuffer.isView(data)) {
			device.queue.writeBuffer(
				buffer,
				offset,
				data.buffer,
				data.byteOffset,
				data.byteLength,
			);
			return;
		}

		if (data instanceof ArrayBuffer) {
			device.queue.writeBuffer(buffer, offset, data, 0, data.byteLength);
			return;
		}

		throw new TypeError("Buffer.write data must be ArrayBuffer or ArrayBufferView");
	}

	/**
	 * Read bytes from GPUBuffer using staging copy
	 * @param {GPUDevice} device GPU device
	 * @param {GPUBuffer} buffer buffer to read or write
	 * @param {number} size size in bytes
	 * @param {number} [offset = 0] byte offset
	 * @returns {Promise<ArrayBuffer>}
	 */
	static async read(device, buffer, size, offset = 0) {
		if (!device || !buffer) {
			throw new TypeError("Buffer.read requires a GPUDevice and GPUBuffer");
		}

		const staging = device.createBuffer({
			size,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});

		const encoder = device.createCommandEncoder({ label: "Buffer.read" });
		encoder.copyBufferToBuffer(buffer, offset, staging, 0, size);
		device.queue.submit([encoder.finish()]);

		await staging.mapAsync(GPUMapMode.READ);
		const copy = staging.getMappedRange().slice(0);
		staging.unmap();
		staging.destroy();

		return copy;
	}

	/**
	 * Read one buffer and reinterpret it as typed array
	 * @param {GPUDevice} device GPU device
	 * @param {GPUBuffer} buffer source buffer
	 * @param {TypedArrayConstructor} TypedArrayCtor typed array constructor
	 * @param {number} count element count to read
	 * @param {object} [options = {}] read options
	 * @returns {Promise<TypedArray>}
	 */
	static async readTyped(device, buffer, TypedArrayCtor, count, options = {}) {
		if (typeof TypedArrayCtor !== "function") {
			throw new TypeError("Buffer.readTyped requires a typed array constructor");
		}
		if (typeof count !== "number" || count <= 0) {
			throw new TypeError("Buffer.readTyped requires a positive count");
		}

		const byteOffset = options.offset ?? 0;
		const bytesPerElement = TypedArrayCtor.BYTES_PER_ELEMENT;
		if (!bytesPerElement) {
			throw new TypeError("Buffer.readTyped expected a typed array constructor with BYTES_PER_ELEMENT");
		}

		const byteLength = count * bytesPerElement;
		const raw = await Buffer.read(device, buffer, byteLength, byteOffset);
		return new TypedArrayCtor(raw);
	}

	/**
	 * Copy bytes from one GPUBuffer into another
	 * @param {GPUDevice} device GPU device
	 * @param {GPUBuffer} sourceBuffer source buffer
	 * @param {GPUBuffer} destinationBuffer destination buffer
	 * @param {number} size copy size in bytes
	 * @param {object} [options = {}] copy options
	 * @returns {Promise<GPUCommandBuffer>|GPUCommandBuffer}
	 */
	static copy(device, sourceBuffer, destinationBuffer, size, options = {}) {
		if (!device || !sourceBuffer || !destinationBuffer) {
			throw new TypeError("Buffer.copy requires device, sourceBuffer, and destinationBuffer");
		}
		if (typeof size !== "number" || size <= 0) {
			throw new TypeError("Buffer.copy requires a positive size");
		}

		return Command.copyBufferToBuffer(device, sourceBuffer, destinationBuffer, size, options);
	}

	/**
	 * Destroy many buffers without drama
	 * @param {GPUBuffer[]} buffers buffers to destroy
	 * @returns {number}
	 */
	static destroyAll(buffers) {
		if (!Array.isArray(buffers)) {
			throw new TypeError("Buffer.destroyAll requires a buffer array");
		}

		let destroyed = 0;
		for (const buffer of buffers) {
			if (!buffer || typeof buffer.destroy !== "function") {
				continue;
			}
			buffer.destroy();
			destroyed += 1;
		}

		return destroyed;
	}
}



// ------ Texture ------

export class Texture {
	/**
	 * Create GPUTexture from descriptor
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @returns {GPUTexture}
	 */
	static create(device, descriptor) {
		if (!device) {
			throw new TypeError("Texture.create requires a GPUDevice");
		}
		if (!descriptor) {
			throw new TypeError("Texture.create requires a descriptor");
		}

		return device.createTexture(descriptor);
	}

	/**
	 * Create a 2D texture with practical defaults
	 * @param {GPUDevice} device GPU device
	 * @param {object} [options = {}] texture options
	 * @returns {GPUTexture}
	 */
	static create2D(device, options = {}) {
		if (!device) {
			throw new TypeError("Texture.create2D requires a GPUDevice");
		}

		const usage = options.usage ?? (
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.COPY_DST |
			GPUTextureUsage.RENDER_ATTACHMENT
		);
		return Texture.create(device, {
			label: options.label,
			size: [options.width ?? 1, options.height ?? 1, options.depthOrArrayLayers ?? 1],
			mipLevelCount: options.mipLevelCount ?? 1,
			sampleCount: options.sampleCount ?? 1,
			dimension: "2d",
			format: options.format ?? "rgba8unorm",
			usage,
			viewFormats: options.viewFormats,
		});
	}

	/**
	 * Create a cubemap texture
	 * @param {GPUDevice} device GPU device
	 * @param {object} [options = {}] cubemap options
	 * @returns {GPUTexture}
	 */
	static createCube(device, options = {}) {
		if (!device) {
			throw new TypeError("Texture.createCube requires a GPUDevice");
		}

		const size = options.size ?? 1;
		const usage = options.usage ?? (
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.COPY_DST |
			GPUTextureUsage.RENDER_ATTACHMENT
		);
		return Texture.create(device, {
			label: options.label,
			size: [size, size, 6],
			mipLevelCount: options.mipLevelCount ?? 1,
			sampleCount: options.sampleCount ?? 1,
			dimension: "2d",
			format: options.format ?? "rgba8unorm",
			usage,
			viewFormats: options.viewFormats,
		});
	}

	/**
	 * Create a 3D texture
	 * @param {GPUDevice} device GPU device
	 * @param {object} [options = {}] texture options
	 * @returns {GPUTexture}
	 */
	static create3D(device, options = {}) {
		if (!device) {
			throw new TypeError("Texture.create3D requires a GPUDevice");
		}

		const usage = options.usage ?? (
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.COPY_DST |
			GPUTextureUsage.COPY_SRC
		);
		return Texture.create(device, {
			label: options.label,
			size: [options.width ?? 1, options.height ?? 1, options.depthOrArrayLayers ?? options.depth ?? 1],
			mipLevelCount: options.mipLevelCount ?? 1,
			dimension: "3d",
			format: options.format ?? "rgba8unorm",
			usage,
			viewFormats: options.viewFormats,
		});
	}

	/**
	 * Create a 2D texture array
	 * @param {GPUDevice} device GPU device
	 * @param {object} [options = {}] texture options
	 * @returns {GPUTexture}
	 */
	static create2DArray(device, options = {}) {
		if (!device) {
			throw new TypeError("Texture.create2DArray requires a GPUDevice");
		}

		const usage = options.usage ?? (
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.COPY_DST |
			GPUTextureUsage.COPY_SRC
		);
		return Texture.create(device, {
			label: options.label,
			size: [options.width ?? 1, options.height ?? 1, options.layers ?? options.depthOrArrayLayers ?? 1],
			mipLevelCount: options.mipLevelCount ?? 1,
			sampleCount: options.sampleCount ?? 1,
			dimension: "2d",
			format: options.format ?? "rgba8unorm",
			usage,
			viewFormats: options.viewFormats,
		});
	}

	/**
	 * Create depth texture with practical defaults
	 * @param {GPUDevice} device GPU device
	 * @param {object} [options = {}] depth options
	 * @returns {GPUTexture}
	 */
	static createDepth2D(device, options = {}) {
		if (!device) {
			throw new TypeError("Texture.createDepth2D requires a GPUDevice");
		}

		const usage = options.usage ?? (
			GPUTextureUsage.RENDER_ATTACHMENT |
			GPUTextureUsage.TEXTURE_BINDING
		);
		return Texture.create(device, {
			label: options.label,
			size: [options.width ?? 1, options.height ?? 1, 1],
			mipLevelCount: options.mipLevelCount ?? 1,
			sampleCount: options.sampleCount ?? 1,
			dimension: "2d",
			format: options.format ?? "depth24plus",
			usage,
			viewFormats: options.viewFormats,
		});
	}

	/**
	 * Upload texture data with queue.writeTexture
	 * @param {GPUDevice} device GPU device
	 * @param {GPUTexture} texture texture to write
	 * @param {AllowSharedBufferSource} source source bytes
	 * @param {GPUTexelCopyBufferLayout} layout source layout
	 * @param {number} size size in bytes
	 * @returns {void}
	 */
	static write(device, texture, source, layout, size) {
		if (!device || !texture) {
			throw new TypeError("Texture.write requires a GPUDevice and GPUTexture");
		}
		if (!source || !layout || !size) {
			throw new TypeError("Texture.write requires source, layout, and size");
		}

		device.queue.writeTexture({ texture }, source, layout, size);
	}

	/**
	 * Upload one texture layer/mip/aspect using queue.writeTexture
	 * @param {GPUDevice} device GPU device
	 * @param {GPUTexture} texture texture to write
	 * @param {AllowSharedBufferSource} source source bytes
	 * @param {object} [options = {}] write options
	 * @returns {void}
	 */
	static writeLayer(device, texture, source, options = {}) {
		if (!device || !texture || !source) {
			throw new TypeError("Texture.writeLayer requires device, texture, and source");
		}

		const size = options.size ?? [
			options.width ?? 1,
			options.height ?? 1,
			options.depthOrArrayLayers ?? 1,
		];
		device.queue.writeTexture(
			{
				texture,
				mipLevel: options.mipLevel ?? 0,
				origin: options.origin ?? [options.x ?? 0, options.y ?? 0, options.z ?? 0],
				aspect: options.aspect ?? "all",
			},
			source,
			{
				offset: options.offset ?? 0,
				bytesPerRow: options.bytesPerRow,
				rowsPerImage: options.rowsPerImage,
			},
			size,
		);
	}

	/**
	 * Upload image/canvas/video source with copyExternalImageToTexture
	 * @param {GPUDevice} device GPU device
	 * @param {GPUTexture} texture texture to write
	 * @param {ImageBitmapSource} source external image source
	 * @param {object} [options = {}] copy options
	 * @returns {void}
	 */
	static writeExternal(device, texture, source, options = {}) {
		if (!device || !texture || !source) {
			throw new TypeError("Texture.writeExternal requires device, texture, and source");
		}

		const copySize = options.copySize ?? [
			options.width ?? source.width ?? 1,
			options.height ?? source.height ?? 1,
		];

		device.queue.copyExternalImageToTexture(
			{
				source,
				origin: options.sourceOrigin ?? [0, 0],
				flipY: options.flipY ?? false,
			},
			{
				texture,
				mipLevel: options.mipLevel ?? 0,
				origin: options.origin ?? [0, 0, 0],
				aspect: options.aspect ?? "all",
				colorSpace: options.colorSpace,
				premultipliedAlpha: options.premultipliedAlpha,
			},
			copySize,
		);
	}

	/**
	 * Create texture view
	 * @param {GPUTexture} texture texture to write
	 * @param {object} descriptor setup data
	 * @returns {GPUTextureView}
	 */
	static createView(texture, descriptor) {
		if (!texture) {
			throw new TypeError("Texture.createView requires a GPUTexture");
		}

		return texture.createView(descriptor);
	}

	/**
	 * Destroy many textures in one call
	 * @param {GPUTexture[]} textures textures to destroy
	 * @returns {number}
	 */
	static destroyAll(textures) {
		if (!Array.isArray(textures)) {
			throw new TypeError("Texture.destroyAll requires a texture array");
		}

		let destroyed = 0;
		for (const texture of textures) {
			if (!texture || typeof texture.destroy !== "function") {
				continue;
			}
			texture.destroy();
			destroyed += 1;
		}

		return destroyed;
	}
}



// ------ Sampler ------

export class Sampler {
	/**
	 * Create GPUSampler from descriptor
	 * @param {GPUDevice} device GPU device
	 * @param {object} [descriptor = {}] descriptor
	 * @returns {GPUSampler}
	 */
	static create(device, descriptor = {}) {
		if (!device) {
			throw new TypeError("Sampler.create requires a GPUDevice");
		}

		return device.createSampler(descriptor);
	}
}



// ------ BindGroup ------

export class BindGroup {
	/**
	 * Create bind group layout
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @returns {GPUBindGroupLayout}
	 */
	static createLayout(device, descriptor) {
		if (!device || !descriptor) {
			throw new TypeError("BindGroup.createLayout requires a device and descriptor");
		}

		return device.createBindGroupLayout(descriptor);
	}

	/**
	 * Create bind group
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @returns {GPUBindGroup}
	 */
	static create(device, descriptor) {
		if (!device || !descriptor) {
			throw new TypeError("BindGroup.create requires a device and descriptor");
		}

		return device.createBindGroup(descriptor);
	}
}



// ------ Pipeline ------

export class Pipeline {
	/**
	 * Create render pipeline
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @returns {GPURenderPipeline}
	 */
	static createRender(device, descriptor) {
		if (!device || !descriptor) {
			throw new TypeError("Pipeline.createRender requires a device and descriptor");
		}

		return device.createRenderPipeline(descriptor);
	}

	/**
	 * Create compute pipeline
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @returns {GPUComputePipeline}
	 */
	static createCompute(device, descriptor) {
		if (!device || !descriptor) {
			throw new TypeError("Pipeline.createCompute requires a device and descriptor");
		}

		return device.createComputePipeline(descriptor);
	}

	/**
	 * Create render pipeline inside validation scope and return captured error info
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @param {object} [options = {}] scope options
	 * @returns {Promise<object>}
	 */
	static async createRenderChecked(device, descriptor, options = {}) {
		if (!device || !descriptor) {
			throw new TypeError("Pipeline.createRenderChecked requires a device and descriptor");
		}

		const scoped = await Device.withErrorScope(
			device,
			options.errorFilter ?? "validation",
			() => Pipeline.createRender(device, descriptor),
		);

		const pipeline = scoped.value ?? null;
		const ok = scoped.ok && !!pipeline;
		const errorMessage = scoped.error ? String(scoped.error.message ?? scoped.error) : null;
		if (!ok && (options.throwOnError ?? false)) {
			throw new Error("Pipeline.createRenderChecked failed\n" + (errorMessage ?? "unknown pipeline error"));
		}

		return {
			pipeline,
			ok,
			error: scoped.error ?? null,
			errorMessage,
		};
	}

	/**
	 * Create compute pipeline inside validation scope and return captured error info
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @param {object} [options = {}] scope options
	 * @returns {Promise<object>}
	 */
	static async createComputeChecked(device, descriptor, options = {}) {
		if (!device || !descriptor) {
			throw new TypeError("Pipeline.createComputeChecked requires a device and descriptor");
		}

		const scoped = await Device.withErrorScope(
			device,
			options.errorFilter ?? "validation",
			() => Pipeline.createCompute(device, descriptor),
		);

		const pipeline = scoped.value ?? null;
		const ok = scoped.ok && !!pipeline;
		const errorMessage = scoped.error ? String(scoped.error.message ?? scoped.error) : null;
		if (!ok && (options.throwOnError ?? false)) {
			throw new Error("Pipeline.createComputeChecked failed\n" + (errorMessage ?? "unknown pipeline error"));
		}

		return {
			pipeline,
			ok,
			error: scoped.error ?? null,
			errorMessage,
		};
	}
}



// ------ Pass ------

export class Pass {
	/**
	 * Begin render pass from command encoder
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @param {object} descriptor setup data
	 * @returns {GPURenderPassEncoder}
	 */
	static beginRender(encoder, descriptor) {
		if (!encoder || !descriptor) {
			throw new TypeError("Pass.beginRender requires an encoder and descriptor");
		}

		return encoder.beginRenderPass(descriptor);
	}

	/**
	 * Begin compute pass from command encoder
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @param {object} [descriptor = {}] descriptor
	 * @returns {GPUComputePassEncoder}
	 */
	static beginCompute(encoder, descriptor = {}) {
		if (!encoder) {
			throw new TypeError("Pass.beginCompute requires an encoder");
		}

		return encoder.beginComputePass(descriptor);
	}

	/**
	 * Scoped render pass helper, opens pass and auto-ends it
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @param {object} descriptor setup data
	 * @param {(pass: GPURenderPassEncoder) => any} callback pass logic callback
	 * @returns {any}
	 */
	static withRender(encoder, descriptor, callback) {
		if (typeof descriptor === "function" && typeof callback === "undefined") {
			callback = descriptor;
			descriptor = {};
		}

		if (typeof callback !== "function") {
			throw new TypeError("Pass.withRender requires a callback function");
		}

		const pass = Pass.beginRender(encoder, descriptor);
		try {
			return callback(pass);
		} finally {
			Pass.end(pass);
		}
	}

	/**
	 * Scoped compute pass helper, opens pass and auto-ends it
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @param {object} [descriptor = {}] descriptor
	 * @param {(pass: GPUComputePassEncoder) => any} callback pass logic callback
	 * @returns {any}
	 */
	static withCompute(encoder, descriptor = {}, callback) {
		if (typeof descriptor === "function" && typeof callback === "undefined") {
			callback = descriptor;
			descriptor = {};
		}

		if (typeof callback !== "function") {
			throw new TypeError("Pass.withCompute requires a callback function");
		}

		const pass = Pass.beginCompute(encoder, descriptor);
		try {
			return callback(pass);
		} finally {
			Pass.end(pass);
		}
	}

	/**
	 * End render or compute pass
	 * @param {GPURenderPassEncoder | GPUComputePassEncoder} passEncoder active pass encoder
	 * @returns {void}
	 */
	static end(passEncoder) {
		if (!passEncoder) {
			throw new TypeError("Pass.end requires a pass encoder");
		}

		passEncoder.end();
	}
}



// ------ Command ------

export class Command {
	/**
	 * Create command encoder
	 * @param {GPUDevice} device GPU device
	 * @param {string} label debug label maybe
	 * @returns {GPUCommandEncoder}
	 */
	static createEncoder(device, label) {
		if (!device) {
			throw new TypeError("Command.createEncoder requires a GPUDevice");
		}
		const finalLabel = (typeof label === "string" && label.length > 0) ? label : "AzCommandEncoder";
		return device.createCommandEncoder({ label: finalLabel });
	}

	/**
	 * Finish command encoder into command buffer
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @returns {GPUCommandBuffer}
	 */
	static finish(encoder) {
		if (!encoder) {
			throw new TypeError("Command.finish requires a GPUCommandEncoder");
		}

		return encoder.finish();
	}

	/**
	 * Create encoder, run callback, finish, and optionally submit
	 * @param {GPUDevice} device GPU device
	 * @param {(encoder: GPUCommandEncoder) => any | Promise<any>} callback encode callback
	 * @param {object} [options = {}] encode/submit options
	 * @returns {Promise<object>}
	 */
	static async withEncoder(device, callback, options = {}) {
		if (!device) {
			throw new TypeError("Command.withEncoder requires a GPUDevice");
		}
		if (typeof callback !== "function") {
			throw new TypeError("Command.withEncoder requires a callback function");
		}

		const encoder = Command.createEncoder(device, options.label ?? "Command.withEncoder");
		const value = await callback(encoder);
		const commandBuffer = Command.finish(encoder);

		const shouldSubmit = options.submit ?? true;
		const shouldWait = options.wait ?? false;
		if (shouldSubmit) {
			if (shouldWait) {
				await Command.submitAndWait(device, [commandBuffer]);
			} else {
				Command.submit(device, [commandBuffer]);
			}
		}

		return { value, commandBuffer };
	}

	/**
	 * Submit command buffers to queue
	 * @param {GPUDevice} device GPU device
	 * @param {GPUCommandBuffer[]} commandBuffers buffers to submit
	 * @returns {void}
	 */
	static submit(device, commandBuffers) {
		if (!device || !Array.isArray(commandBuffers)) {
			throw new TypeError("Command.submit requires a device and command buffer array");
		}

		device.queue.submit(commandBuffers);
	}

	/**
	 * Submit commands then wait until queue is done
	 * @param {GPUDevice} device GPU device
	 * @param {GPUCommandBuffer[]} commandBuffers buffers to submit
	 * @returns {Promise<void>}
	 */
	static async submitAndWait(device, commandBuffers) {
		Command.submit(device, commandBuffers);
		await device.queue.onSubmittedWorkDone();
	}

	/**
	 * Encode copyBufferToBuffer and optionally submit
	 * @param {GPUDevice} device GPU device
	 * @param {GPUBuffer} source source buffer
	 * @param {GPUBuffer} destination destination buffer
	 * @param {number} size copy size in bytes
	 * @param {object} [options = {}] copy options
	 * @returns {Promise<GPUCommandBuffer>|GPUCommandBuffer}
	 */
	static copyBufferToBuffer(device, source, destination, size, options = {}) {
		if (!device || !source || !destination) {
			throw new TypeError("Command.copyBufferToBuffer requires device, source, and destination");
		}
		if (typeof size !== "number" || size <= 0) {
			throw new TypeError("Command.copyBufferToBuffer requires positive size");
		}

		const encoder = Command.createEncoder(device, options.label ?? "Command.copyBufferToBuffer");
		encoder.copyBufferToBuffer(
			source,
			options.sourceOffset ?? 0,
			destination,
			options.destinationOffset ?? 0,
			size,
		);
		const commandBuffer = Command.finish(encoder);
		const submit = options.submit ?? true;
		const wait = options.wait ?? false;
		if (!submit) {
			return commandBuffer;
		}
		if (wait) {
			return Command.submitAndWait(device, [commandBuffer]).then(() => commandBuffer);
		}
		Command.submit(device, [commandBuffer]);
		return commandBuffer;
	}

	/**
	 * Encode copyBufferToTexture and optionally submit
	 * @param {GPUDevice} device GPU device
	 * @param {GPUTexelCopyBufferInfo} source source copy view
	 * @param {GPUTexelCopyTextureInfo} destination destination copy view
	 * @param {GPUExtent3D} copySize copy extent
	 * @param {object} [options = {}] copy options
	 * @returns {Promise<GPUCommandBuffer>|GPUCommandBuffer}
	 */
	static copyBufferToTexture(device, source, destination, copySize, options = {}) {
		if (!device || !source || !destination || !copySize) {
			throw new TypeError("Command.copyBufferToTexture requires device, source, destination, and copySize");
		}

		const encoder = Command.createEncoder(device, options.label ?? "Command.copyBufferToTexture");
		encoder.copyBufferToTexture(source, destination, copySize);
		const commandBuffer = Command.finish(encoder);
		const submit = options.submit ?? true;
		const wait = options.wait ?? false;
		if (!submit) {
			return commandBuffer;
		}
		if (wait) {
			return Command.submitAndWait(device, [commandBuffer]).then(() => commandBuffer);
		}
		Command.submit(device, [commandBuffer]);
		return commandBuffer;
	}

	/**
	 * Encode copyTextureToBuffer and optionally submit
	 * @param {GPUDevice} device GPU device
	 * @param {GPUTexelCopyTextureInfo} source source copy view
	 * @param {GPUTexelCopyBufferInfo} destination destination copy view
	 * @param {GPUExtent3D} copySize copy extent
	 * @param {object} [options = {}] copy options
	 * @returns {Promise<GPUCommandBuffer>|GPUCommandBuffer}
	 */
	static copyTextureToBuffer(device, source, destination, copySize, options = {}) {
		if (!device || !source || !destination || !copySize) {
			throw new TypeError("Command.copyTextureToBuffer requires device, source, destination, and copySize");
		}

		const encoder = Command.createEncoder(device, options.label ?? "Command.copyTextureToBuffer");
		encoder.copyTextureToBuffer(source, destination, copySize);
		const commandBuffer = Command.finish(encoder);
		const submit = options.submit ?? true;
		const wait = options.wait ?? false;
		if (!submit) {
			return commandBuffer;
		}
		if (wait) {
			return Command.submitAndWait(device, [commandBuffer]).then(() => commandBuffer);
		}
		Command.submit(device, [commandBuffer]);
		return commandBuffer;
	}

	/**
	 * Encode copyTextureToTexture and optionally submit
	 * @param {GPUDevice} device GPU device
	 * @param {GPUTexelCopyTextureInfo} source source copy view
	 * @param {GPUTexelCopyTextureInfo} destination destination copy view
	 * @param {GPUExtent3D} copySize copy extent
	 * @param {object} [options = {}] copy options
	 * @returns {Promise<GPUCommandBuffer>|GPUCommandBuffer}
	 */
	static copyTextureToTexture(device, source, destination, copySize, options = {}) {
		if (!device || !source || !destination || !copySize) {
			throw new TypeError("Command.copyTextureToTexture requires device, source, destination, and copySize");
		}

		const encoder = Command.createEncoder(device, options.label ?? "Command.copyTextureToTexture");
		encoder.copyTextureToTexture(source, destination, copySize);
		const commandBuffer = Command.finish(encoder);
		const submit = options.submit ?? true;
		const wait = options.wait ?? false;
		if (!submit) {
			return commandBuffer;
		}
		if (wait) {
			return Command.submitAndWait(device, [commandBuffer]).then(() => commandBuffer);
		}
		Command.submit(device, [commandBuffer]);
		return commandBuffer;
	}
}



// ------ Shader ------

export class Shader {
	/**
	 * Create shader module from code, yes another descriptor one
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor setup data
	 * @returns {GPUShaderModule}
	 */
	static create(device, descriptor) {
		if (!device || !descriptor || typeof descriptor.code !== "string") {
			throw new TypeError("Shader.create requires { code: string, ... }");
		}

		return device.createShaderModule(descriptor);
	}

	/**
	 * Create shader module and return compilation info when available
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor shader descriptor
	 * @param {object} [options = {}] check options
	 * @returns {Promise<object>}
	 */
	static async createChecked(device, descriptor, options = {}) {
		const module = Shader.create(device, descriptor);
		if (typeof module.getCompilationInfo !== "function") {
			return {
				module,
				ok: true,
				messages: [],
			note: "Compilation info is not exposed in this runtime",
			};
		}

		const info = await module.getCompilationInfo();
		const messages = Array.isArray(info.messages) ? info.messages : [];
		const errors = messages.filter((item) => item.type === "error");
		const ok = errors.length === 0;
		const result = { module, ok, messages };
		if (!ok && (options.throwOnError ?? false)) {
			const summary = errors.map((item) => `${item.lineNum}:${item.linePos} ${item.message}`).join("\n");
			throw new Error("Shader.createChecked found WGSL errors\n" + summary);
		}
		return result;
	}

	/**
	 * Format compilation messages into one short readable summary
	 * @param {Array<object>} messages compiler messages
	 * @param {object} [options = {}] summary options
	 * @returns {string}
	 */
	static summarizeMessages(messages, options = {}) {
		const list = Array.isArray(messages) ? messages : [];
		const maxLines = Math.max(1, Number(options.maxLines ?? 12) || 12);
		const out = [];

		let errorCount = 0;
		let warningCount = 0;
		let infoCount = 0;
		for (const item of list) {
			const type = String(item?.type ?? "info");
			if (type === "error") errorCount += 1;
			else if (type === "warning") warningCount += 1;
			else infoCount += 1;
		}

		out.push(
			"errors " + errorCount +
			" | warnings " + warningCount +
			" | info " + infoCount,
		);

		const shown = list.slice(0, maxLines);
		for (const item of shown) {
			const line = Number(item?.lineNum ?? 0);
			const col = Number(item?.linePos ?? 0);
			const type = String(item?.type ?? "info");
			const msg = String(item?.message ?? "").trim();
			out.push(type + " @" + line + ":" + col + " " + msg);
		}
		if (list.length > shown.length) {
			out.push("... +" + (list.length - shown.length) + " more messages");
		}

		return out.join("\n");
	}
}



// ------ Format ------

export class Format {
	/**
	 * Get preferred canvas format from browser
	 * @returns {GPUTextureFormat}
	 */
	static preferredCanvas() {
		if (typeof navigator === "undefined" || !navigator.gpu) {
			throw new Error("WebGPU is not available in this environment");
		}

		return navigator.gpu.getPreferredCanvasFormat();
	}

	/**
	 * Get common depth defaults for quick setup
	 * @returns {object}
	 */
	static depthDefaults() {
		return {
			format: "depth24plus",
			depthWriteEnabled: true,
			depthCompare: "less",
		};
	}
}



// ------ Limits ------

export class Limits {
	/**
	 * Inspect supported limits from adapter or device
	 * @param {object} adapterOrDevice adapter or device to inspect
	 * @returns {GPUSupportedLimits}
	 */
	static inspect(adapterOrDevice) {
		if (!adapterOrDevice || !adapterOrDevice.limits) {
			throw new TypeError("Limits.inspect requires an adapter or device with limits");
		}

		return adapterOrDevice.limits;
	}

	/**
	 * Check if all requested features are available
	 * @param {object} adapterOrDevice adapter or device to inspect
	 * @param {string[]} featureList feature names to check
	 * @returns {boolean}
	 */
	static hasFeatures(adapterOrDevice, featureList) {
		if (!adapterOrDevice || !adapterOrDevice.features) {
			throw new TypeError("Limits.hasFeatures requires an adapter or device with features");
		}
		if (!Array.isArray(featureList)) {
			throw new TypeError("Limits.hasFeatures requires featureList as an array");
		}

		return featureList.every((feature) => adapterOrDevice.features.has(feature));
	}

	/**
	 * Fail fast when required features or limits are not met
	 * @param {object} adapterOrDevice adapter or device to inspect
	 * @param {object} [constraints = {}] required features and limits
	 * @returns {object}
	 */
	static require(adapterOrDevice, constraints = {}) {
		if (!adapterOrDevice) {
			throw new TypeError("Limits.require requires an adapter or device");
		}
		if (!adapterOrDevice.features || !adapterOrDevice.limits) {
			throw new TypeError("Limits.require expects an adapter or device with features and limits");
		}

		const requiredFeatures = Array.isArray(constraints.features) ? constraints.features : [];
		const requiredLimits = constraints.limits ?? {};
		const label = constraints.label ?? "Limits.require";

		const missingFeatures = requiredFeatures.filter((feature) => !adapterOrDevice.features.has(feature));
		const failedLimits = [];

		for (const [limitName, minValue] of Object.entries(requiredLimits)) {
			const actual = adapterOrDevice.limits[limitName];
			if (typeof actual === "undefined") {
				failedLimits.push({
					limit: limitName,
					required: minValue,
					actual: "undefined",
				});
				continue;
			}

			const actualNumber = Number(actual);
			const requiredNumber = Number(minValue);
			if (Number.isNaN(actualNumber) || Number.isNaN(requiredNumber) || actualNumber < requiredNumber) {
				failedLimits.push({
					limit: limitName,
					required: requiredNumber,
					actual: actualNumber,
				});
			}
		}

		if (missingFeatures.length > 0 || failedLimits.length > 0) {
			const lines = [];
			lines.push(label + " failed");

			if (missingFeatures.length > 0) {
				lines.push("Missing features: " + missingFeatures.join(", "));
			}

			if (failedLimits.length > 0) {
				lines.push("Failed limits:");
				for (const failure of failedLimits) {
					lines.push(
						" - " + failure.limit + " required >= " + failure.required + ", actual " + failure.actual,
					);
				}
			}

			throw new Error(lines.join("\n"));
		}

		return {
			ok: true,
			checkedFeatures: requiredFeatures,
			checkedLimits: requiredLimits,
		};
	}
}



// ------ internal helpers ------

function azStableKey(value) {
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



// ------ Frame ------

export class Frame {
	/**
	 * Start one scoped frame with a new command encoder
	 * @param {GPUDevice} device GPU device
	 * @param {object} [options = {}] optional config like label
	 * @returns {object}
	 */
	static begin(device, options = {}) {
		if (!device) {
			throw new TypeError("Frame.begin requires a GPUDevice");
		}

		const label = options.label ?? "Frame";
		return {
			device,
			label,
			encoder: Command.createEncoder(device, label),
			commandBuffer: null,
			finished: false,
		};
	}

	/**
	 * Finish a frame and return command buffer
	 * @param {object} frame frame object from Frame.begin
	 * @returns {GPUCommandBuffer}
	 */
	static finish(frame) {
		if (!frame || !frame.encoder) {
			throw new TypeError("Frame.finish requires a frame from Frame.begin");
		}
		if (frame.finished) {
			return frame.commandBuffer;
		}

		frame.commandBuffer = Command.finish(frame.encoder);
		frame.finished = true;
		return frame.commandBuffer;
	}

	/**
	 * Submit frame or command buffer with optional wait
	 * @param {GPUDevice} device GPU device
	 * @param {object | GPUCommandBuffer} frameOrCommandBuffer frame object or raw command buffer
	 * @param {object} [options = {}] submit options
	 * @returns {Promise<GPUCommandBuffer[]>}
	 */
	static async submit(device, frameOrCommandBuffer, options = {}) {
		if (!device) {
			throw new TypeError("Frame.submit requires a GPUDevice");
		}
		if (!frameOrCommandBuffer) {
			throw new TypeError("Frame.submit requires frame or command buffer");
		}

		let buffers;
		if (Array.isArray(frameOrCommandBuffer)) {
			buffers = frameOrCommandBuffer;
		} else if (frameOrCommandBuffer.encoder) {
			buffers = [Frame.finish(frameOrCommandBuffer)];
		} else {
			buffers = [frameOrCommandBuffer];
		}

		const wait = options.wait ?? true;
		if (wait) {
			await Command.submitAndWait(device, buffers);
		} else {
			Command.submit(device, buffers);
		}
		return buffers;
	}

	/**
	 * Run one frame callback then submit it
	 * @param {GPUDevice} device GPU device
	 * @param {(encoder: GPUCommandEncoder, frame: object) => any | Promise<any>} callback frame callback
	 * @param {object} [options = {}] begin and submit options
	 * @returns {Promise<object>}
	 */
	static async with(device, callback, options = {}) {
		if (typeof callback !== "function") {
			throw new TypeError("Frame.with requires a callback function");
		}

		const frame = Frame.begin(device, options);
		const value = await callback(frame.encoder, frame);
		const submitted = await Frame.submit(device, frame, options);
		return {
			value,
			frame,
			commandBuffer: submitted[0],
		};
	}
}



// ------ ResourcePool ------

export class ResourcePool {
	/**
	 * Create one pool object for transient resources
	 * @param {object} [options = {}] optional pool config
	 * @returns {object}
	 */
	static create(options = {}) {
		return {
			label: options.label ?? "ResourcePool",
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
	 * Acquire a buffer from pool or create one on miss
	 * @param {object} pool pool object from ResourcePool.create
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor buffer descriptor
	 * @param {string} key optional manual key
	 * @returns {GPUBuffer}
	 */
	static acquireBuffer(pool, device, descriptor, key) {
		ResourcePool._assertPool(pool);
		if (!device || !descriptor) {
			throw new TypeError("ResourcePool.acquireBuffer requires device and descriptor");
		}

		const resolvedKey = ResourcePool._resolveKey("buffer", descriptor, key);
		const freeBucket = ResourcePool._bucket(pool.bufferFree, resolvedKey);
		const busyBucket = ResourcePool._bucket(pool.bufferBusy, resolvedKey);

		let buffer = freeBucket.pop();
		if (buffer) {
			pool.hits += 1;
		} else {
			buffer = Buffer.create(device, descriptor);
			pool.misses += 1;
		}

		busyBucket.push(buffer);
		return buffer;
	}

	/**
	 * Release one buffer back into free list by key
	 * @param {object} pool pool object from ResourcePool.create
	 * @param {GPUBuffer} buffer pooled buffer
	 * @param {string} key optional key used when acquiring
	 * @returns {boolean}
	 */
	static releaseBuffer(pool, buffer, key) {
		ResourcePool._assertPool(pool);
		if (!buffer) {
			throw new TypeError("ResourcePool.releaseBuffer requires a buffer");
		}
		if (typeof key === "string" && key.length > 0) {
			return ResourcePool._releaseByKey(pool.bufferBusy, pool.bufferFree, key, buffer, pool);
		}
		return ResourcePool._releaseAny(pool.bufferBusy, pool.bufferFree, buffer, pool);
	}

	/**
	 * Acquire a texture from pool or create one on miss
	 * @param {object} pool pool object from ResourcePool.create
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor texture descriptor
	 * @param {string} key optional manual key
	 * @returns {GPUTexture}
	 */
	static acquireTexture(pool, device, descriptor, key) {
		ResourcePool._assertPool(pool);
		if (!device || !descriptor) {
			throw new TypeError("ResourcePool.acquireTexture requires device and descriptor");
		}

		const resolvedKey = ResourcePool._resolveKey("texture", descriptor, key);
		const freeBucket = ResourcePool._bucket(pool.textureFree, resolvedKey);
		const busyBucket = ResourcePool._bucket(pool.textureBusy, resolvedKey);

		let texture = freeBucket.pop();
		if (texture) {
			pool.hits += 1;
		} else {
			texture = Texture.create(device, descriptor);
			pool.misses += 1;
		}

		busyBucket.push(texture);
		return texture;
	}

	/**
	 * Release one texture back into free list by key
	 * @param {object} pool pool object from ResourcePool.create
	 * @param {GPUTexture} texture pooled texture
	 * @param {string} key optional key used when acquiring
	 * @returns {boolean}
	 */
	static releaseTexture(pool, texture, key) {
		ResourcePool._assertPool(pool);
		if (!texture) {
			throw new TypeError("ResourcePool.releaseTexture requires a texture");
		}
		if (typeof key === "string" && key.length > 0) {
			return ResourcePool._releaseByKey(pool.textureBusy, pool.textureFree, key, texture, pool);
		}
		return ResourcePool._releaseAny(pool.textureBusy, pool.textureFree, texture, pool);
	}

	/**
	 * Return pool counters and bucket stats
	 * @param {object} pool pool object from ResourcePool.create
	 * @returns {object}
	 */
	static stats(pool) {
		ResourcePool._assertPool(pool);
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
	 * Destroy all pooled resources and clear buckets
	 * @param {object} pool pool object from ResourcePool.create
	 * @returns {object}
	 */
	static destroy(pool) {
		ResourcePool._assertPool(pool);

		let buffers = 0;
		let textures = 0;

		for (const bucket of pool.bufferFree.values()) {
			buffers += Buffer.destroyAll(bucket);
		}
		for (const bucket of pool.bufferBusy.values()) {
			buffers += Buffer.destroyAll(bucket);
		}
		for (const bucket of pool.textureFree.values()) {
			textures += Texture.destroyAll(bucket);
		}
		for (const bucket of pool.textureBusy.values()) {
			textures += Texture.destroyAll(bucket);
		}

		pool.bufferFree.clear();
		pool.bufferBusy.clear();
		pool.textureFree.clear();
		pool.textureBusy.clear();

		return { buffers, textures };
	}

	/**
	 * Internal guard for pool shape
	 * @param {object} pool pool object from ResourcePool.create
	 * @returns {void}
	 */
	static _assertPool(pool) {
		if (!pool || !(pool.bufferFree instanceof Map) || !(pool.textureFree instanceof Map)) {
			throw new TypeError("ResourcePool requires a pool from ResourcePool.create");
		}
	}

	/**
	 * Get bucket array from map and create it if missing
	 * @param {Map<string, any[]>} map bucket map
	 * @param {string} key bucket key
	 * @returns {any[]}
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
	 * Build pool key from descriptor unless manual key is provided
	 * @param {string} kind resource kind
	 * @param {object} descriptor setup data
	 * @param {string} key optional manual key
	 * @returns {string}
	 */
	static _resolveKey(kind, descriptor, key) {
		if (typeof key === "string" && key.length > 0) {
			return key;
		}
		return kind + ":" + azStableKey(descriptor);
	}

	/**
	 * Move one resource from busy bucket to free bucket by key
	 * @param {Map<string, any[]>} busyMap busy map
	 * @param {Map<string, any[]>} freeMap free map
	 * @param {string} key bucket key
	 * @param {any} target resource instance
	 * @param {object} pool pool state
	 * @returns {boolean}
	 */
	static _releaseByKey(busyMap, freeMap, key, target, pool) {
		const busyBucket = busyMap.get(key);
		if (!busyBucket || busyBucket.length === 0) {
			return false;
		}

		const index = busyBucket.indexOf(target);
		if (index === -1) {
			return false;
		}

		const [resource] = busyBucket.splice(index, 1);
		if (busyBucket.length === 0) {
			busyMap.delete(key);
		}

		ResourcePool._bucket(freeMap, key).push(resource);
		pool.released += 1;
		return true;
	}

	/**
	 * Move one resource from any busy bucket to matching free bucket
	 * @param {Map<string, any[]>} busyMap busy map
	 * @param {Map<string, any[]>} freeMap free map
	 * @param {any} target resource instance
	 * @param {object} pool pool state
	 * @returns {boolean}
	 */
	static _releaseAny(busyMap, freeMap, target, pool) {
		for (const [key, busyBucket] of busyMap.entries()) {
			const index = busyBucket.indexOf(target);
			if (index === -1) {
				continue;
			}
			const [resource] = busyBucket.splice(index, 1);
			if (busyBucket.length === 0) {
				busyMap.delete(key);
			}
			ResourcePool._bucket(freeMap, key).push(resource);
			pool.released += 1;
			return true;
		}
		return false;
	}
}



// ------ LayoutCache ------

export class LayoutCache {
	/**
	 * Create one cache object for layout reuse
	 * @param {object} [options = {}] optional cache config
	 * @returns {object}
	 */
	static create(options = {}) {
		return {
			label: options.label ?? "LayoutCache",
			bindGroupLayouts: new Map(),
			pipelineLayouts: new Map(),
			hits: 0,
			misses: 0,
		};
	}

	/**
	 * Get or create bind group layout by descriptor or key
	 * @param {object} cache cache object from LayoutCache.create
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor bind group layout descriptor
	 * @param {string} key optional manual key
	 * @returns {GPUBindGroupLayout}
	 */
	static getBindGroupLayout(cache, device, descriptor, key) {
		LayoutCache._assertCache(cache);
		if (!device || !descriptor) {
			throw new TypeError("LayoutCache.getBindGroupLayout requires device and descriptor");
		}

		const resolvedKey = LayoutCache._resolveKey("bgl", descriptor, key);
		const existing = cache.bindGroupLayouts.get(resolvedKey);
		if (existing) {
			cache.hits += 1;
			return existing;
		}

		const layout = BindGroup.createLayout(device, descriptor);
		cache.bindGroupLayouts.set(resolvedKey, layout);
		cache.misses += 1;
		return layout;
	}

	/**
	 * Get or create pipeline layout by descriptor or key
	 * @param {object} cache cache object from LayoutCache.create
	 * @param {GPUDevice} device GPU device
	 * @param {object} descriptor pipeline layout descriptor
	 * @param {string} key optional manual key
	 * @returns {GPUPipelineLayout}
	 */
	static getPipelineLayout(cache, device, descriptor, key) {
		LayoutCache._assertCache(cache);
		if (!device || !descriptor) {
			throw new TypeError("LayoutCache.getPipelineLayout requires device and descriptor");
		}

		const resolvedKey = LayoutCache._resolveKey("pl", descriptor, key);
		const existing = cache.pipelineLayouts.get(resolvedKey);
		if (existing) {
			cache.hits += 1;
			return existing;
		}

		const layout = device.createPipelineLayout(descriptor);
		cache.pipelineLayouts.set(resolvedKey, layout);
		cache.misses += 1;
		return layout;
	}

	/**
	 * Return cache counters and map sizes
	 * @param {object} cache cache object from LayoutCache.create
	 * @returns {object}
	 */
	static stats(cache) {
		LayoutCache._assertCache(cache);
		return {
			hits: cache.hits,
			misses: cache.misses,
			bindGroupLayoutCount: cache.bindGroupLayouts.size,
			pipelineLayoutCount: cache.pipelineLayouts.size,
		};
	}

	/**
	 * Clear all cached layout entries
	 * @param {object} cache cache object from LayoutCache.create
	 * @returns {void}
	 */
	static clear(cache) {
		LayoutCache._assertCache(cache);
		cache.bindGroupLayouts.clear();
		cache.pipelineLayouts.clear();
	}

	/**
	 * Internal guard for cache shape
	 * @param {object} cache cache object from LayoutCache.create
	 * @returns {void}
	 */
	static _assertCache(cache) {
		if (!cache || !(cache.bindGroupLayouts instanceof Map) || !(cache.pipelineLayouts instanceof Map)) {
			throw new TypeError("LayoutCache requires a cache from LayoutCache.create");
		}
	}

	/**
	 * Build cache key from descriptor unless manual key is provided
	 * @param {string} kind cache kind
	 * @param {object} descriptor setup data
	 * @param {string} key optional manual key
	 * @returns {string}
	 */
	static _resolveKey(kind, descriptor, key) {
		if (typeof key === "string" && key.length > 0) {
			return key;
		}
		return kind + ":" + azStableKey(descriptor);
	}
}



// ------ Timer ------

export class Timer {
	/**
	 * Return timestamp support status with a concrete fallback reason
	 * @param {GPUDevice} device GPU device
	 * @returns {object}
	 */
	static supportInfo(device) {
		if (!device) {
			return {
				supported: false,
				reason: "device is missing",
				checks: { hasDevice: false },
			};
		}

		const hasFeatures = !!device.features;
		const hasTimestampFeature = hasFeatures && device.features.has("timestamp-query");
		const hasCreateQuerySet = typeof device.createQuerySet === "function";
		const hasTimestampFlow = Timer._hasTimestampQueryFlow(device);

		if (!hasFeatures) {
			return {
				supported: false,
				reason: "device.features is missing",
				checks: { hasDevice: true, hasFeatures, hasTimestampFeature, hasCreateQuerySet, hasTimestampFlow },
			};
		}
		if (!hasTimestampFeature) {
			return {
				supported: false,
				reason: "timestamp-query feature is not enabled on this device",
				checks: { hasDevice: true, hasFeatures, hasTimestampFeature, hasCreateQuerySet, hasTimestampFlow },
			};
		}
		if (!hasCreateQuerySet) {
			return {
				supported: false,
				reason: "createQuerySet API is missing in this runtime",
				checks: { hasDevice: true, hasFeatures, hasTimestampFeature, hasCreateQuerySet, hasTimestampFlow },
			};
		}
		if (!hasTimestampFlow) {
			return {
				supported: false,
				reason: "runtime cannot encode resolveQuerySet timestamp flow",
				checks: { hasDevice: true, hasFeatures, hasTimestampFeature, hasCreateQuerySet, hasTimestampFlow },
			};
		}

		return {
			supported: true,
			reason: "timestamp path looks good",
			checks: { hasDevice: true, hasFeatures, hasTimestampFeature, hasCreateQuerySet, hasTimestampFlow },
		};
	}

	/**
	 * Check if timestamp-query feature looks available on this device
	 * @param {GPUDevice} device GPU device
	 * @returns {boolean}
	 */
	static supported(device) {
		return Timer.supportInfo(device).supported;
	}

	/**
	 * Create timer state, GPU path when possible otherwise CPU fallback
	 * @param {GPUDevice} device GPU device
	 * @param {object} [options = {}] timer options
	 * @returns {object}
	 */
	static create(device, options = {}) {
		if (!device) {
			throw new TypeError("Timer.create requires a GPUDevice");
		}

		const preferGpu = options.preferGpu ?? true;
		const support = Timer.supportInfo(device);
		const canUseGpu = preferGpu && support.supported;
		if (!canUseGpu) {
			return {
				mode: "cpu",
				label: options.label ?? "AzTimerCPU",
				fallbackReason: preferGpu ? support.reason : "GPU timer was not requested",
			};
		}

		try {
			const querySet = device.createQuerySet({
				type: "timestamp",
				count: 2,
				label: options.label ? options.label + ":QuerySet" : "AzTimerQuerySet",
			});

			const resolveBuffer = Buffer.create(device, {
				size: 16,
				usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
			});
			const readBuffer = Buffer.create(device, {
				size: 16,
				usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			});

			return {
				mode: "gpu",
				label: options.label ?? "AzTimerGPU",
				querySet,
				resolveBuffer,
				readBuffer,
			};
		} catch (_error) {
			return {
				mode: "cpu",
				label: options.label ?? "AzTimerCPU",
				fallbackReason: "GPU timestamp setup failed, using CPU timing path",
			};
		}
	}

	/**
	 * Measure one encoded workload using GPU timestamps or CPU fallback
	 * @param {GPUDevice} device GPU device
	 * @param {(encoder: GPUCommandEncoder, timingHints: object) => any | Promise<any>} encode callback that records commands
	 * @param {object} [options = {}] timing options
	 * @returns {Promise<object>}
	 */
	static async measure(device, encode, options = {}) {
		if (!device) {
			throw new TypeError("Timer.measure requires a GPUDevice");
		}
		if (typeof encode !== "function") {
			throw new TypeError("Timer.measure requires an encode callback");
		}

		const timer = options.timer ?? Timer.create(device, options);
		const ownTimer = !options.timer;
		const label = options.label ?? "AzTimerMeasure";

		try {
			if (timer.mode === "gpu" && Timer._hasTimestampQueryFlow(device)) {
				const timestampWrites = {
					querySet: timer.querySet,
					beginningOfPassWriteIndex: 0,
					endOfPassWriteIndex: 1,
				};
				const timingHints = {
					timestampWrites,
					computePassDescriptor: { timestampWrites },
					renderPassTimestampWrites: timestampWrites,
				};

				const encoder = Command.createEncoder(device, label);
				const value = await encode(encoder, timingHints);
				encoder.resolveQuerySet(timer.querySet, 0, 2, timer.resolveBuffer, 0);
				encoder.copyBufferToBuffer(timer.resolveBuffer, 0, timer.readBuffer, 0, 16);
				await Command.submitAndWait(device, [Command.finish(encoder)]);

				await timer.readBuffer.mapAsync(GPUMapMode.READ);
				const raw = timer.readBuffer.getMappedRange().slice(0);
				timer.readBuffer.unmap();

				const ticks = new BigUint64Array(raw);
				const deltaTicks = ticks[1] - ticks[0];
				const timestampPeriod = typeof device.queue.getTimestampPeriod === "function"
					? Number(device.queue.getTimestampPeriod())
					: 1;
				const gpuMs = Number(deltaTicks) * timestampPeriod / 1000000;

				return {
					mode: "gpu",
					gpuMs,
					deltaTicks: deltaTicks.toString(),
					timestampPeriod,
					value,
				};
			}

			const cpuStart = performance.now();
			const encoder = Command.createEncoder(device, label);
			const value = await encode(encoder, {
				timestampWrites: null,
				computePassDescriptor: {},
				renderPassTimestampWrites: null,
			});
			await Command.submitAndWait(device, [Command.finish(encoder)]);
			const cpuMs = performance.now() - cpuStart;

			return {
				mode: "cpu",
				cpuMs,
				fallbackReason: timer.mode === "gpu"
					? Timer.supportInfo(device).reason
					: timer.fallbackReason,
				value,
			};
		} finally {
			if (ownTimer) {
				Timer.destroy(timer);
			}
		}
	}

	/**
	 * Destroy timer resources when timer owns GPU buffers
	 * @param {object} timer timer object from Timer.create
	 * @returns {void}
	 */
	static destroy(timer) {
		if (!timer || timer.mode !== "gpu") {
			return;
		}

		Buffer.destroyAll([timer.resolveBuffer, timer.readBuffer]);
		if (timer.querySet && typeof timer.querySet.destroy === "function") {
			timer.querySet.destroy();
		}
	}

	/**
	 * Check if timestamp-query flow looks available in this runtime
	 * @param {GPUDevice} device GPU device
	 * @returns {boolean}
	 */
	static _hasTimestampQueryFlow(device) {
		if (!device) {
			return false;
		}

		try {
			const probe = Command.createEncoder(device, "AzTimerProbe");
			const hasResolve = typeof probe.resolveQuerySet === "function";
			const hasPass = typeof probe.beginComputePass === "function";
			Command.finish(probe);
			return hasResolve && hasPass && typeof device.createQuerySet === "function";
		} catch (_error) {
			return false;
		}
	}
}


export const AzWGPU = {
	Adapter,
	Device,
	Context,
	Buffer,
	Texture,
	Sampler,
	BindGroup,
	Pipeline,
	Pass,
	Command,
	Shader,
	Format,
	Limits,
	Frame,
	ResourcePool,
	LayoutCache,
	Timer,
};

if (typeof window !== "undefined") {
	window.AzWGPU = AzWGPU;
}

export default AzWGPU;
