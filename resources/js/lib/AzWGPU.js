/* AsczWGPU
By Asciiz

Ok guys, I'm moving on from WebGL to WebGPU now, isn't that exciting? (No, ts is literally Vulkan reincarnated)

#AzAdapter:
    - Finds and ranks GPU adapters so setup has less guessing
    - Methods
        + request(options = {})
        + pickBest(options = {})
        + getCapabilities(adapter)

#AzDevice:
    - Creates device and exposes queue/lost-device helpers
    - Methods
        + create(adapter, options = {})
        + getQueue(device)
        + onLost(device, handler)

#AzContext:
    - Handles canvas context setup and reconfigure flow
    - Methods
        + create(device, canvas, config = {})
        + reconfigure(context, descriptor)
        + unconfigure(context)

#AzBuffer:
    - Thin buffer utility for create/write/read/cleanup
    - Methods
        + create(device, descriptor)
        + write(device, buffer, data, offset = 0)
        + read(device, buffer, size, offset = 0)
        + destroyAll(buffers)

#AzTexture:
    - Texture create/upload/view helpers with bulk destroy
    - Methods
        + create(device, descriptor)
        + write(device, texture, source, layout, size)
        + createView(texture, descriptor)
        + destroyAll(textures)

#AzSampler:
    - Sampler creation helper with raw descriptor passthrough
    - Methods
        + create(device, descriptor = {})

#AzBindGroup:
    - Bind group layout and bind group construction helpers
    - Methods
        + createLayout(device, descriptor)
        + create(device, descriptor)

#AzPipeline:
    - Render/compute pipeline builders without hidden opinions
    - Methods
        + createRender(device, descriptor)
        + createCompute(device, descriptor)

#AzPass:
    - Pass begin/end and scoped callback pass helpers
    - Methods
        + beginRender(encoder, descriptor)
        + beginCompute(encoder, descriptor = {})
        + withRender(encoder, descriptor, callback)
        + withCompute(encoder, descriptor, callback)
        + end(passEncoder)

#AzCommand:
    - Command encoder lifecycle and queue submission helpers
    - Methods
        + createEncoder(device, label)
        + finish(encoder)
        + submit(device, commandBuffers)
        + submitAndWait(device, commandBuffers)

#AzShader:
    - Shader module creation helper from WGSL descriptor
    - Methods
        + create(device, descriptor)

#AzFormat:
	- Handy format defaults for canvas and depth setup
    - Methods
        + preferredCanvas()
        + depthDefaults()

#AzLimits:
    - Capability inspect/check helper with fail-fast require
    - Methods
        + inspect(adapterOrDevice)
        + hasFeatures(adapterOrDevice, featureList)
        + require(adapterOrDevice, constraints = {})

#AzFrame:
    - Frame-scope encode/submit helper so flows stay tidy
    - Methods
        + begin(device, options = {})
        + finish(frame)
        + submit(device, frameOrCommandBuffer, options = {})
        + with(device, callback, options = {})

#AzResourcePool:
    - Reuses transient buffers/textures to cut alloc churn
    - Methods
        + create(options = {})
        + acquireBuffer(pool, device, descriptor, key)
        + releaseBuffer(pool, buffer, key)
        + acquireTexture(pool, device, descriptor, key)
        + releaseTexture(pool, texture, key)
        + stats(pool)
        + destroy(pool)

#AzLayoutCache:
    - Caches layout objects so repeated setup is cheaper
    - Methods
        + create(options = {})
        + getBindGroupLayout(cache, device, descriptor, key)
        + getPipelineLayout(cache, device, descriptor, key)
        + stats(cache)
        + clear(cache)

#AzTimer:
    - Measures workloads with GPU timestamp path or CPU fallback
    - Methods
        + supported(device)
        + create(device, options = {})
        + measure(device, encode, options = {})
        + destroy(timer)
*/


// ------ AzAdapter ------

class AzAdapter {
	/**
	 * Ask browser for one adapter using raw WebGPU options
	 * @param {object} [options = {}] options bag for this call
	 * @returns {Promise<GPUAdapter>} return value
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
	 * @param {object} [options = {}] options bag for this call
	 * @returns {Promise<object>} return value
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

			const score = AzAdapter._scoreAdapter(adapter, {
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
	 * @returns {object} return value
	 */
	static getCapabilities(adapter) {
		if (!adapter) {
			throw new TypeError("AzAdapter.getCapabilities requires a GPUAdapter");
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
	 * @returns {number} return value
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



// ------ AzDevice ------

class AzDevice {
	/**
	 * Create GPUDevice from adapter
	 * @param {GPUAdapter} adapter source adapter
	 * @param {object} [options = {}] options bag for this call
	 * @returns {Promise<GPUDevice>} return value
	 */
	static async create(adapter, options = {}) {
		if (!adapter) {
			throw new TypeError("AzDevice.create requires a GPUAdapter");
		}

		const descriptor = options.descriptor ?? options;
		return adapter.requestDevice(descriptor);
	}

	/**
	 * Get device queue
	 * @param {GPUDevice} device active device
	 * @returns {GPUQueue} return value
	 */
	static getQueue(device) {
		if (!device) {
			throw new TypeError("AzDevice.getQueue requires a GPUDevice");
		}

		return device.queue;
	}

	/**
	 * Attach device lost callback
	 * @param {GPUDevice} device active device
	 * @param {Function} handler callback when device is lost
	 * @returns {void} return value
	 */
	static onLost(device, handler) {
		if (!device) {
			throw new TypeError("AzDevice.onLost requires a GPUDevice");
		}
		if (typeof handler !== "function") {
			throw new TypeError("AzDevice.onLost requires a function handler");
		}

		device.lost.then(handler);
	}
}



// ------ AzContext ------

class AzContext {
	/**
	 * Create and configure WebGPU canvas context
	 * @param {GPUDevice} device active device
	 * @param {HTMLCanvasElement} canvas target canvas
	 * @param {GPUCanvasConfiguration} [config = {}] context config
	 * @returns {GPUCanvasContext} return value
	 */
	static create(device, canvas, config = {}) {
		if (!device) {
			throw new TypeError("AzContext.create requires a GPUDevice");
		}
		if (!canvas) {
			throw new TypeError("AzContext.create requires a canvas");
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
	 * @param {object} descriptor descriptor object
	 * @returns {GPUCanvasContext} return value
	 */
	static reconfigure(context, descriptor) {
		if (!context) {
			throw new TypeError("AzContext.reconfigure requires a GPUCanvasContext");
		}

		context.configure(descriptor);
		return context;
	}

	/**
	 * Unconfigure canvas context
	 * @param {GPUCanvasContext} context canvas context
	 * @returns {void} return value
	 */
	static unconfigure(context) {
		if (!context) {
			throw new TypeError("AzContext.unconfigure requires a GPUCanvasContext");
		}

		context.unconfigure();
	}
}



// ------ AzBuffer ------

class AzBuffer {
	/**
	 * Create GPUBuffer from descriptor
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor descriptor object
	 * @returns {GPUBuffer} return value
	 */
	static create(device, descriptor) {
		if (!device) {
			throw new TypeError("AzBuffer.create requires a GPUDevice");
		}
		if (!descriptor) {
			throw new TypeError("AzBuffer.create requires a descriptor");
		}

		return device.createBuffer(descriptor);
	}

	/**
	 * Write data into buffer using queue.writeBuffer
	 * @param {GPUDevice} device active device
	 * @param {GPUBuffer} buffer target or source buffer
	 * @param {ArrayBuffer | ArrayBufferView} data data to upload
	 * @param {number} [offset = 0] byte offset
	 * @returns {void} return value
	 */
	static write(device, buffer, data, offset = 0) {
		if (!device || !buffer) {
			throw new TypeError("AzBuffer.write requires a GPUDevice and GPUBuffer");
		}
		if (!data) {
			throw new TypeError("AzBuffer.write requires data");
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

		throw new TypeError("AzBuffer.write data must be ArrayBuffer or ArrayBufferView");
	}

	/**
	 * Read bytes from GPUBuffer using staging copy
	 * @param {GPUDevice} device active device
	 * @param {GPUBuffer} buffer target or source buffer
	 * @param {number} size size in bytes
	 * @param {number} [offset = 0] byte offset
	 * @returns {Promise<ArrayBuffer>} return value
	 */
	static async read(device, buffer, size, offset = 0) {
		if (!device || !buffer) {
			throw new TypeError("AzBuffer.read requires a GPUDevice and GPUBuffer");
		}

		const staging = device.createBuffer({
			size,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});

		const encoder = device.createCommandEncoder({ label: "AzBuffer.read" });
		encoder.copyBufferToBuffer(buffer, offset, staging, 0, size);
		device.queue.submit([encoder.finish()]);

		await staging.mapAsync(GPUMapMode.READ);
		const copy = staging.getMappedRange().slice(0);
		staging.unmap();
		staging.destroy();

		return copy;
	}

	/**
	 * Destroy many buffers without drama
	 * @param {GPUBuffer[]} buffers buffers to destroy
	 * @returns {number} number of destroyed buffers
	 */
	static destroyAll(buffers) {
		if (!Array.isArray(buffers)) {
			throw new TypeError("AzBuffer.destroyAll requires a buffer array");
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



// ------ AzTexture ------

class AzTexture {
	/**
	 * Create GPUTexture from descriptor
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor descriptor object
	 * @returns {GPUTexture} return value
	 */
	static create(device, descriptor) {
		if (!device) {
			throw new TypeError("AzTexture.create requires a GPUDevice");
		}
		if (!descriptor) {
			throw new TypeError("AzTexture.create requires a descriptor");
		}

		return device.createTexture(descriptor);
	}

	/**
	 * Upload texture data with queue.writeTexture
	 * @param {GPUDevice} device active device
	 * @param {GPUTexture} texture target texture
	 * @param {AllowSharedBufferSource} source source bytes
	 * @param {GPUTexelCopyBufferLayout} layout source layout
	 * @param {number} size size in bytes
	 * @returns {void} return value
	 */
	static write(device, texture, source, layout, size) {
		if (!device || !texture) {
			throw new TypeError("AzTexture.write requires a GPUDevice and GPUTexture");
		}
		if (!source || !layout || !size) {
			throw new TypeError("AzTexture.write requires source, layout, and size");
		}

		device.queue.writeTexture({ texture }, source, layout, size);
	}

	/**
	 * Create texture view
	 * @param {GPUTexture} texture target texture
	 * @param {object} descriptor descriptor object
	 * @returns {GPUTextureView} return value
	 */
	static createView(texture, descriptor) {
		if (!texture) {
			throw new TypeError("AzTexture.createView requires a GPUTexture");
		}

		return texture.createView(descriptor);
	}

	/**
	 * Destroy many textures in one call
	 * @param {GPUTexture[]} textures textures to destroy
	 * @returns {number} number of destroyed textures
	 */
	static destroyAll(textures) {
		if (!Array.isArray(textures)) {
			throw new TypeError("AzTexture.destroyAll requires a texture array");
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



// ------ AzSampler ------

class AzSampler {
	/**
	 * Create GPUSampler from descriptor
	 * @param {GPUDevice} device active device
	 * @param {object} [descriptor = {}] descriptor object
	 * @returns {GPUSampler} return value
	 */
	static create(device, descriptor = {}) {
		if (!device) {
			throw new TypeError("AzSampler.create requires a GPUDevice");
		}

		return device.createSampler(descriptor);
	}
}



// ------ AzBindGroup ------

class AzBindGroup {
	/**
	 * Create bind group layout
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor descriptor object
	 * @returns {GPUBindGroupLayout} return value
	 */
	static createLayout(device, descriptor) {
		if (!device || !descriptor) {
			throw new TypeError("AzBindGroup.createLayout requires a device and descriptor");
		}

		return device.createBindGroupLayout(descriptor);
	}

	/**
	 * Create bind group
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor descriptor object
	 * @returns {GPUBindGroup} return value
	 */
	static create(device, descriptor) {
		if (!device || !descriptor) {
			throw new TypeError("AzBindGroup.create requires a device and descriptor");
		}

		return device.createBindGroup(descriptor);
	}
}



// ------ AzPipeline ------

class AzPipeline {
	/**
	 * Create render pipeline
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor descriptor object
	 * @returns {GPURenderPipeline} return value
	 */
	static createRender(device, descriptor) {
		if (!device || !descriptor) {
			throw new TypeError("AzPipeline.createRender requires a device and descriptor");
		}

		return device.createRenderPipeline(descriptor);
	}

	/**
	 * Create compute pipeline
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor descriptor object
	 * @returns {GPUComputePipeline} return value
	 */
	static createCompute(device, descriptor) {
		if (!device || !descriptor) {
			throw new TypeError("AzPipeline.createCompute requires a device and descriptor");
		}

		return device.createComputePipeline(descriptor);
	}
}



// ------ AzPass ------

class AzPass {
	/**
	 * Begin render pass from command encoder
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @param {object} descriptor descriptor object
	 * @returns {GPURenderPassEncoder} return value
	 */
	static beginRender(encoder, descriptor) {
		if (!encoder || !descriptor) {
			throw new TypeError("AzPass.beginRender requires an encoder and descriptor");
		}

		return encoder.beginRenderPass(descriptor);
	}

	/**
	 * Begin compute pass from command encoder
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @param {object} [descriptor = {}] descriptor object
	 * @returns {GPUComputePassEncoder} return value
	 */
	static beginCompute(encoder, descriptor = {}) {
		if (!encoder) {
			throw new TypeError("AzPass.beginCompute requires an encoder");
		}

		return encoder.beginComputePass(descriptor);
	}

	/**
	 * Scoped render pass helper, opens pass and auto-ends it
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @param {object} descriptor descriptor object
	 * @param {(pass: GPURenderPassEncoder) => any} callback pass logic callback
	 * @returns {any} callback return value
	 */
	static withRender(encoder, descriptor, callback) {
		if (typeof descriptor === "function" && typeof callback === "undefined") {
			callback = descriptor;
			descriptor = {};
		}

		if (typeof callback !== "function") {
			throw new TypeError("AzPass.withRender requires a callback function");
		}

		const pass = AzPass.beginRender(encoder, descriptor);
		try {
			return callback(pass);
		} finally {
			AzPass.end(pass);
		}
	}

	/**
	 * Scoped compute pass helper, opens pass and auto-ends it
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @param {object} [descriptor = {}] descriptor object
	 * @param {(pass: GPUComputePassEncoder) => any} callback pass logic callback
	 * @returns {any} callback return value
	 */
	static withCompute(encoder, descriptor = {}, callback) {
		if (typeof descriptor === "function" && typeof callback === "undefined") {
			callback = descriptor;
			descriptor = {};
		}

		if (typeof callback !== "function") {
			throw new TypeError("AzPass.withCompute requires a callback function");
		}

		const pass = AzPass.beginCompute(encoder, descriptor);
		try {
			return callback(pass);
		} finally {
			AzPass.end(pass);
		}
	}

	/**
	 * End render or compute pass
	 * @param {GPURenderPassEncoder | GPUComputePassEncoder} passEncoder active pass encoder
	 * @returns {void} return value
	 */
	static end(passEncoder) {
		if (!passEncoder) {
			throw new TypeError("AzPass.end requires a pass encoder");
		}

		passEncoder.end();
	}
}



// ------ AzCommand ------

class AzCommand {
	/**
	 * Create command encoder
	 * @param {GPUDevice} device active device
	 * @param {string} label optional debug label
	 * @returns {GPUCommandEncoder} return value
	 */
	static createEncoder(device, label) {
		if (!device) {
			throw new TypeError("AzCommand.createEncoder requires a GPUDevice");
		}

		return device.createCommandEncoder(label ? { label } : undefined);
	}

	/**
	 * Finish command encoder into command buffer
	 * @param {GPUCommandEncoder} encoder command encoder
	 * @returns {GPUCommandBuffer} return value
	 */
	static finish(encoder) {
		if (!encoder) {
			throw new TypeError("AzCommand.finish requires a GPUCommandEncoder");
		}

		return encoder.finish();
	}

	/**
	 * Submit command buffers to queue
	 * @param {GPUDevice} device active device
	 * @param {GPUCommandBuffer[]} commandBuffers buffers to submit
	 * @returns {void} return value
	 */
	static submit(device, commandBuffers) {
		if (!device || !Array.isArray(commandBuffers)) {
			throw new TypeError("AzCommand.submit requires a device and command buffer array");
		}

		device.queue.submit(commandBuffers);
	}

	/**
	 * Submit commands then wait until queue is done
	 * @param {GPUDevice} device active device
	 * @param {GPUCommandBuffer[]} commandBuffers buffers to submit
	 * @returns {Promise<void>} resolves when queue work is done
	 */
	static async submitAndWait(device, commandBuffers) {
		AzCommand.submit(device, commandBuffers);
		await device.queue.onSubmittedWorkDone();
	}
}



// ------ AzShader ------

class AzShader {
	/**
	 * Create shader module from code, yes another descriptor one
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor descriptor object
	 * @returns {GPUShaderModule} return value
	 */
	static create(device, descriptor) {
		if (!device || !descriptor || typeof descriptor.code !== "string") {
			throw new TypeError("AzShader.create requires { code: string, ... }");
		}

		return device.createShaderModule(descriptor);
	}
}



// ------ AzFormat ------

class AzFormat {
	/**
	 * Get preferred canvas format from browser
	 * @returns {GPUTextureFormat} return value
	 */
	static preferredCanvas() {
		if (typeof navigator === "undefined" || !navigator.gpu) {
			throw new Error("WebGPU is not available in this environment");
		}

		return navigator.gpu.getPreferredCanvasFormat();
	}

	/**
	 * Get common depth defaults for quick setup
	 * @returns {object} return value
	 */
	static depthDefaults() {
		return {
			format: "depth24plus",
			depthWriteEnabled: true,
			depthCompare: "less",
		};
	}
}



// ------ AzLimits ------

class AzLimits {
	/**
	 * Inspect supported limits from adapter or device
	 * @param {object} adapterOrDevice adapter or device to inspect
	 * @returns {GPUSupportedLimits} return value
	 */
	static inspect(adapterOrDevice) {
		if (!adapterOrDevice || !adapterOrDevice.limits) {
			throw new TypeError("AzLimits.inspect requires an adapter or device with limits");
		}

		return adapterOrDevice.limits;
	}

	/**
	 * Check if all requested features are available
	 * @param {object} adapterOrDevice adapter or device to inspect
	 * @param {string[]} featureList feature names to check
	 * @returns {boolean} return value
	 */
	static hasFeatures(adapterOrDevice, featureList) {
		if (!adapterOrDevice || !adapterOrDevice.features) {
			throw new TypeError("AzLimits.hasFeatures requires an adapter or device with features");
		}
		if (!Array.isArray(featureList)) {
			throw new TypeError("AzLimits.hasFeatures requires featureList as an array");
		}

		return featureList.every((feature) => adapterOrDevice.features.has(feature));
	}

	/**
	 * Fail fast when required features or limits are not met
	 * @param {object} adapterOrDevice adapter or device to inspect
	 * @param {object} [constraints = {}] required features and limits
	 * @returns {object} return value
	 */
	static require(adapterOrDevice, constraints = {}) {
		if (!adapterOrDevice) {
			throw new TypeError("AzLimits.require requires an adapter or device");
		}
		if (!adapterOrDevice.features || !adapterOrDevice.limits) {
			throw new TypeError("AzLimits.require expects an adapter or device with features and limits");
		}

		const requiredFeatures = Array.isArray(constraints.features) ? constraints.features : [];
		const requiredLimits = constraints.limits ?? {};
		const label = constraints.label ?? "AzLimits.require";

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



// ------ AzFrame ------

class AzFrame {
	/**
	 * Start one scoped frame with a new command encoder
	 * @param {GPUDevice} device active device
	 * @param {object} [options = {}] optional config like label
	 * @returns {object} frame object
	 */
	static begin(device, options = {}) {
		if (!device) {
			throw new TypeError("AzFrame.begin requires a GPUDevice");
		}

		const label = options.label ?? "AzFrame";
		return {
			device,
			label,
			encoder: AzCommand.createEncoder(device, label),
			commandBuffer: null,
			finished: false,
		};
	}

	/**
	 * Finish a frame and return command buffer
	 * @param {object} frame frame object from AzFrame.begin
	 * @returns {GPUCommandBuffer} command buffer
	 */
	static finish(frame) {
		if (!frame || !frame.encoder) {
			throw new TypeError("AzFrame.finish requires a frame from AzFrame.begin");
		}
		if (frame.finished) {
			return frame.commandBuffer;
		}

		frame.commandBuffer = AzCommand.finish(frame.encoder);
		frame.finished = true;
		return frame.commandBuffer;
	}

	/**
	 * Submit frame or command buffer with optional wait
	 * @param {GPUDevice} device active device
	 * @param {object | GPUCommandBuffer} frameOrCommandBuffer frame object or raw command buffer
	 * @param {object} [options = {}] submit options
	 * @returns {Promise<GPUCommandBuffer[]>} submitted command buffers
	 */
	static async submit(device, frameOrCommandBuffer, options = {}) {
		if (!device) {
			throw new TypeError("AzFrame.submit requires a GPUDevice");
		}
		if (!frameOrCommandBuffer) {
			throw new TypeError("AzFrame.submit requires frame or command buffer");
		}

		let buffers;
		if (Array.isArray(frameOrCommandBuffer)) {
			buffers = frameOrCommandBuffer;
		} else if (frameOrCommandBuffer.encoder) {
			buffers = [AzFrame.finish(frameOrCommandBuffer)];
		} else {
			buffers = [frameOrCommandBuffer];
		}

		const wait = options.wait ?? true;
		if (wait) {
			await AzCommand.submitAndWait(device, buffers);
		} else {
			AzCommand.submit(device, buffers);
		}
		return buffers;
	}

	/**
	 * Run one frame callback then submit it
	 * @param {GPUDevice} device active device
	 * @param {(encoder: GPUCommandEncoder, frame: object) => any | Promise<any>} callback frame callback
	 * @param {object} [options = {}] begin and submit options
	 * @returns {Promise<object>} callback output and submitted command buffer
	 */
	static async with(device, callback, options = {}) {
		if (typeof callback !== "function") {
			throw new TypeError("AzFrame.with requires a callback function");
		}

		const frame = AzFrame.begin(device, options);
		const value = await callback(frame.encoder, frame);
		const submitted = await AzFrame.submit(device, frame, options);
		return {
			value,
			frame,
			commandBuffer: submitted[0],
		};
	}
}



// ------ AzResourcePool ------

class AzResourcePool {
	/**
	 * Create one pool object for transient resources
	 * @param {object} [options = {}] optional pool config
	 * @returns {object} pool object
	 */
	static create(options = {}) {
		return {
			label: options.label ?? "AzResourcePool",
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
	 * @param {object} pool pool object from AzResourcePool.create
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor buffer descriptor
	 * @param {string} key optional manual key
	 * @returns {GPUBuffer} pooled buffer
	 */
	static acquireBuffer(pool, device, descriptor, key) {
		AzResourcePool._assertPool(pool);
		if (!device || !descriptor) {
			throw new TypeError("AzResourcePool.acquireBuffer requires device and descriptor");
		}

		const resolvedKey = AzResourcePool._resolveKey("buffer", descriptor, key);
		const freeBucket = AzResourcePool._bucket(pool.bufferFree, resolvedKey);
		const busyBucket = AzResourcePool._bucket(pool.bufferBusy, resolvedKey);

		let buffer = freeBucket.pop();
		if (buffer) {
			pool.hits += 1;
		} else {
			buffer = AzBuffer.create(device, descriptor);
			pool.misses += 1;
		}

		busyBucket.push(buffer);
		return buffer;
	}

	/**
	 * Release one buffer back into free list by key
	 * @param {object} pool pool object from AzResourcePool.create
	 * @param {GPUBuffer} buffer pooled buffer
	 * @param {string} key optional key used when acquiring
	 * @returns {boolean} true when buffer moved back to free list
	 */
	static releaseBuffer(pool, buffer, key) {
		AzResourcePool._assertPool(pool);
		if (!buffer) {
			throw new TypeError("AzResourcePool.releaseBuffer requires a buffer");
		}
		if (typeof key === "string" && key.length > 0) {
			return AzResourcePool._releaseByKey(pool.bufferBusy, pool.bufferFree, key, buffer, pool);
		}
		return AzResourcePool._releaseAny(pool.bufferBusy, pool.bufferFree, buffer, pool);
	}

	/**
	 * Acquire a texture from pool or create one on miss
	 * @param {object} pool pool object from AzResourcePool.create
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor texture descriptor
	 * @param {string} key optional manual key
	 * @returns {GPUTexture} pooled texture
	 */
	static acquireTexture(pool, device, descriptor, key) {
		AzResourcePool._assertPool(pool);
		if (!device || !descriptor) {
			throw new TypeError("AzResourcePool.acquireTexture requires device and descriptor");
		}

		const resolvedKey = AzResourcePool._resolveKey("texture", descriptor, key);
		const freeBucket = AzResourcePool._bucket(pool.textureFree, resolvedKey);
		const busyBucket = AzResourcePool._bucket(pool.textureBusy, resolvedKey);

		let texture = freeBucket.pop();
		if (texture) {
			pool.hits += 1;
		} else {
			texture = AzTexture.create(device, descriptor);
			pool.misses += 1;
		}

		busyBucket.push(texture);
		return texture;
	}

	/**
	 * Release one texture back into free list by key
	 * @param {object} pool pool object from AzResourcePool.create
	 * @param {GPUTexture} texture pooled texture
	 * @param {string} key optional key used when acquiring
	 * @returns {boolean} true when texture moved back to free list
	 */
	static releaseTexture(pool, texture, key) {
		AzResourcePool._assertPool(pool);
		if (!texture) {
			throw new TypeError("AzResourcePool.releaseTexture requires a texture");
		}
		if (typeof key === "string" && key.length > 0) {
			return AzResourcePool._releaseByKey(pool.textureBusy, pool.textureFree, key, texture, pool);
		}
		return AzResourcePool._releaseAny(pool.textureBusy, pool.textureFree, texture, pool);
	}

	/**
	 * Return pool counters and bucket stats
	 * @param {object} pool pool object from AzResourcePool.create
	 * @returns {object} stats object
	 */
	static stats(pool) {
		AzResourcePool._assertPool(pool);
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
	 * @param {object} pool pool object from AzResourcePool.create
	 * @returns {object} destroy counters
	 */
	static destroy(pool) {
		AzResourcePool._assertPool(pool);

		let buffers = 0;
		let textures = 0;

		for (const bucket of pool.bufferFree.values()) {
			buffers += AzBuffer.destroyAll(bucket);
		}
		for (const bucket of pool.bufferBusy.values()) {
			buffers += AzBuffer.destroyAll(bucket);
		}
		for (const bucket of pool.textureFree.values()) {
			textures += AzTexture.destroyAll(bucket);
		}
		for (const bucket of pool.textureBusy.values()) {
			textures += AzTexture.destroyAll(bucket);
		}

		pool.bufferFree.clear();
		pool.bufferBusy.clear();
		pool.textureFree.clear();
		pool.textureBusy.clear();

		return { buffers, textures };
	}

	/**
	 * Internal guard for pool shape
	 * @param {object} pool pool object from AzResourcePool.create
	 * @returns {void} return value
	 */
	static _assertPool(pool) {
		if (!pool || !(pool.bufferFree instanceof Map) || !(pool.textureFree instanceof Map)) {
			throw new TypeError("AzResourcePool requires a pool from AzResourcePool.create");
		}
	}

	/**
	 * Get bucket array from map and create it if missing
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
	 * Build pool key from descriptor unless manual key is provided
	 * @param {string} kind resource kind
	 * @param {object} descriptor descriptor object
	 * @param {string} key optional manual key
	 * @returns {string} resolved key
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
	 * @returns {boolean} true when moved
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

		AzResourcePool._bucket(freeMap, key).push(resource);
		pool.released += 1;
		return true;
	}

	/**
	 * Move one resource from any busy bucket to matching free bucket
	 * @param {Map<string, any[]>} busyMap busy map
	 * @param {Map<string, any[]>} freeMap free map
	 * @param {any} target resource instance
	 * @param {object} pool pool state
	 * @returns {boolean} true when moved
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
			AzResourcePool._bucket(freeMap, key).push(resource);
			pool.released += 1;
			return true;
		}
		return false;
	}
}



// ------ AzLayoutCache ------

class AzLayoutCache {
	/**
	 * Create one cache object for layout reuse
	 * @param {object} [options = {}] optional cache config
	 * @returns {object} cache object
	 */
	static create(options = {}) {
		return {
			label: options.label ?? "AzLayoutCache",
			bindGroupLayouts: new Map(),
			pipelineLayouts: new Map(),
			hits: 0,
			misses: 0,
		};
	}

	/**
	 * Get or create bind group layout by descriptor or key
	 * @param {object} cache cache object from AzLayoutCache.create
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor bind group layout descriptor
	 * @param {string} key optional manual key
	 * @returns {GPUBindGroupLayout} cached or new layout
	 */
	static getBindGroupLayout(cache, device, descriptor, key) {
		AzLayoutCache._assertCache(cache);
		if (!device || !descriptor) {
			throw new TypeError("AzLayoutCache.getBindGroupLayout requires device and descriptor");
		}

		const resolvedKey = AzLayoutCache._resolveKey("bgl", descriptor, key);
		const existing = cache.bindGroupLayouts.get(resolvedKey);
		if (existing) {
			cache.hits += 1;
			return existing;
		}

		const layout = AzBindGroup.createLayout(device, descriptor);
		cache.bindGroupLayouts.set(resolvedKey, layout);
		cache.misses += 1;
		return layout;
	}

	/**
	 * Get or create pipeline layout by descriptor or key
	 * @param {object} cache cache object from AzLayoutCache.create
	 * @param {GPUDevice} device active device
	 * @param {object} descriptor pipeline layout descriptor
	 * @param {string} key optional manual key
	 * @returns {GPUPipelineLayout} cached or new layout
	 */
	static getPipelineLayout(cache, device, descriptor, key) {
		AzLayoutCache._assertCache(cache);
		if (!device || !descriptor) {
			throw new TypeError("AzLayoutCache.getPipelineLayout requires device and descriptor");
		}

		const resolvedKey = AzLayoutCache._resolveKey("pl", descriptor, key);
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
	 * @param {object} cache cache object from AzLayoutCache.create
	 * @returns {object} stats object
	 */
	static stats(cache) {
		AzLayoutCache._assertCache(cache);
		return {
			hits: cache.hits,
			misses: cache.misses,
			bindGroupLayoutCount: cache.bindGroupLayouts.size,
			pipelineLayoutCount: cache.pipelineLayouts.size,
		};
	}

	/**
	 * Clear all cached layout entries
	 * @param {object} cache cache object from AzLayoutCache.create
	 * @returns {void} return value
	 */
	static clear(cache) {
		AzLayoutCache._assertCache(cache);
		cache.bindGroupLayouts.clear();
		cache.pipelineLayouts.clear();
	}

	/**
	 * Internal guard for cache shape
	 * @param {object} cache cache object from AzLayoutCache.create
	 * @returns {void} return value
	 */
	static _assertCache(cache) {
		if (!cache || !(cache.bindGroupLayouts instanceof Map) || !(cache.pipelineLayouts instanceof Map)) {
			throw new TypeError("AzLayoutCache requires a cache from AzLayoutCache.create");
		}
	}

	/**
	 * Build cache key from descriptor unless manual key is provided
	 * @param {string} kind cache kind
	 * @param {object} descriptor descriptor object
	 * @param {string} key optional manual key
	 * @returns {string} resolved key
	 */
	static _resolveKey(kind, descriptor, key) {
		if (typeof key === "string" && key.length > 0) {
			return key;
		}
		return kind + ":" + azStableKey(descriptor);
	}
}



// ------ AzTimer ------

class AzTimer {
	/**
	 * Check if timestamp-query feature looks available on this device
	 * @param {GPUDevice} device active device
	 * @returns {boolean} true when GPU timer path is likely usable
	 */
	static supported(device) {
		if (!device || !device.features) {
			return false;
		}
		if (!device.features.has("timestamp-query")) {
			return false;
		}
		if (typeof device.createQuerySet !== "function") {
			return false;
		}

		return AzTimer._hasTimestampQueryFlow(device);
	}

	/**
	 * Create timer state, GPU path when possible otherwise CPU fallback
	 * @param {GPUDevice} device active device
	 * @param {object} [options = {}] timer options
	 * @returns {object} timer state
	 */
	static create(device, options = {}) {
		if (!device) {
			throw new TypeError("AzTimer.create requires a GPUDevice");
		}

		const preferGpu = options.preferGpu ?? true;
		const canUseGpu = preferGpu && AzTimer.supported(device);
		if (!canUseGpu) {
			return {
				mode: "cpu",
				label: options.label ?? "AzTimerCPU",
				fallbackReason: preferGpu ? "GPU timestamp methods are not available here" : "GPU timer was not requested",
			};
		}

		try {
			const querySet = device.createQuerySet({
				type: "timestamp",
				count: 2,
				label: options.label ? options.label + ":QuerySet" : "AzTimerQuerySet",
			});

			const resolveBuffer = AzBuffer.create(device, {
				size: 16,
				usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
			});
			const readBuffer = AzBuffer.create(device, {
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
	 * @param {GPUDevice} device active device
	 * @param {(encoder: GPUCommandEncoder, timingHints: object) => any | Promise<any>} encode callback that records commands
	 * @param {object} [options = {}] timing options
	 * @returns {Promise<object>} timing result object
	 */
	static async measure(device, encode, options = {}) {
		if (!device) {
			throw new TypeError("AzTimer.measure requires a GPUDevice");
		}
		if (typeof encode !== "function") {
			throw new TypeError("AzTimer.measure requires an encode callback");
		}

		const timer = options.timer ?? AzTimer.create(device, options);
		const ownTimer = !options.timer;
		const label = options.label ?? "AzTimerMeasure";

		try {
			if (timer.mode === "gpu" && AzTimer._hasTimestampQueryFlow(device)) {
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

				const encoder = AzCommand.createEncoder(device, label);
				const value = await encode(encoder, timingHints);
				encoder.resolveQuerySet(timer.querySet, 0, 2, timer.resolveBuffer, 0);
				encoder.copyBufferToBuffer(timer.resolveBuffer, 0, timer.readBuffer, 0, 16);
				await AzCommand.submitAndWait(device, [AzCommand.finish(encoder)]);

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
			const encoder = AzCommand.createEncoder(device, label);
			const value = await encode(encoder, {
				timestampWrites: null,
				computePassDescriptor: {},
				renderPassTimestampWrites: null,
			});
			await AzCommand.submitAndWait(device, [AzCommand.finish(encoder)]);
			const cpuMs = performance.now() - cpuStart;

			return {
				mode: "cpu",
				cpuMs,
				fallbackReason: timer.mode === "gpu"
					? "GPU timestamp method missing at runtime, used CPU timing"
					: timer.fallbackReason,
				value,
			};
		} finally {
			if (ownTimer) {
				AzTimer.destroy(timer);
			}
		}
	}

	/**
	 * Destroy timer resources when timer owns GPU buffers
	 * @param {object} timer timer object from AzTimer.create
	 * @returns {void} return value
	 */
	static destroy(timer) {
		if (!timer || timer.mode !== "gpu") {
			return;
		}

		AzBuffer.destroyAll([timer.resolveBuffer, timer.readBuffer]);
		if (timer.querySet && typeof timer.querySet.destroy === "function") {
			timer.querySet.destroy();
		}
	}

	/**
	 * Check if timestamp-query flow looks available in this runtime
	 * @param {GPUDevice} device active device
	 * @returns {boolean} true when query set and resolve path exist
	 */
	static _hasTimestampQueryFlow(device) {
		if (!device) {
			return false;
		}

		try {
			const probe = AzCommand.createEncoder(device, "AzTimerProbe");
			const hasResolve = typeof probe.resolveQuerySet === "function";
			const hasPass = typeof probe.beginComputePass === "function";
			AzCommand.finish(probe);
			return hasResolve && hasPass && typeof device.createQuerySet === "function";
		} catch (_error) {
			return false;
		}
	}
}


window.AzWGPU = {
	AzAdapter,
	AzDevice,
	AzContext,
	AzBuffer,
	AzTexture,
	AzSampler,
	AzBindGroup,
	AzPipeline,
	AzPass,
	AzCommand,
	AzShader,
	AzFormat,
	AzLimits,
	AzFrame,
	AzResourcePool,
	AzLayoutCache,
	AzTimer,
};

