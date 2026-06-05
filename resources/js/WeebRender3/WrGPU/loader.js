import { Mat4 } from "../../Alib/Alm.js";
import { Material, Mesh, Skeleton, Texture } from "./mesh.js";
import { MeshRenderer, Model, ModelNode, Transform } from "./world.js";

const COMPONENT = {
	INT8: 5120,
	UINT8: 5121,
	INT16: 5122,
	UINT16: 5123,
	UINT32: 5125,
	FLOAT32: 5126,
};

const TYPE_SIZE = Object.freeze({
	SCALAR: 1,
	VEC2: 2,
	VEC3: 3,
	VEC4: 4,
	MAT2: 4,
	MAT3: 9,
	MAT4: 16,
});

function asList(value) {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

function baseURL(url) {
	return new URL(".", url).href;
}

function isDataURL(uri) {
	return String(uri ?? "").startsWith("data:");
}

async function fetchArrayBuffer(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`[WrGPU.Loader] fetch failed ${url}`);
	return res.arrayBuffer();
}

async function fetchJSON(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`[WrGPU.Loader] fetch failed ${url}`);
	return res.json();
}

function decodeDataURL(uri) {
	const text = String(uri ?? "");
	const comma = text.indexOf(",");
	if (comma < 0) return new ArrayBuffer(0);
	const meta = text.slice(0, comma);
	const payload = text.slice(comma + 1);
	if (meta.includes(";base64")) {
		const bin = atob(payload);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out.buffer;
	}
	return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
}

function readGLB(buffer) {
	const view = new DataView(buffer);
	if (view.getUint32(0, true) !== 0x46546c67) return null;
	const chunks = [];
	let offset = 12;
	while (offset + 8 <= buffer.byteLength) {
		const length = view.getUint32(offset, true);
		const type = view.getUint32(offset + 4, true);
		chunks.push({ type, data: buffer.slice(offset + 8, offset + 8 + length) });
		offset += 8 + length;
	}
	const jsonChunk = chunks.find((chunk) => chunk.type === 0x4e4f534a);
	const binChunk = chunks.find((chunk) => chunk.type === 0x004e4942);
	if (!jsonChunk) return null;
	return {
		json: JSON.parse(new TextDecoder().decode(jsonChunk.data)),
		bin: binChunk?.data ?? null,
	};
}

function componentByteSize(type) {
	if (type === COMPONENT.INT8 || type === COMPONENT.UINT8) return 1;
	if (type === COMPONENT.INT16 || type === COMPONENT.UINT16) return 2;
	return 4;
}

function readComponent(view, offset, type, normalized) {
	if (type === COMPONENT.INT8) {
		const v = view.getInt8(offset);
		return normalized ? Math.max(-1, v / 127) : v;
	}
	if (type === COMPONENT.UINT8) {
		const v = view.getUint8(offset);
		return normalized ? v / 255 : v;
	}
	if (type === COMPONENT.INT16) {
		const v = view.getInt16(offset, true);
		return normalized ? Math.max(-1, v / 32767) : v;
	}
	if (type === COMPONENT.UINT16) {
		const v = view.getUint16(offset, true);
		return normalized ? v / 65535 : v;
	}
	if (type === COMPONENT.UINT32) return view.getUint32(offset, true);
	return view.getFloat32(offset, true);
}

function readAccessor(gltf, buffers, index) {
	const accessor = gltf.accessors?.[index];
	if (!accessor) return null;
	const viewInfo = gltf.bufferViews?.[accessor.bufferView];
	if (!viewInfo) return null;
	const buffer = buffers[viewInfo.buffer];
	if (!buffer) return null;

	const count = Math.max(0, Number(accessor.count ?? 0) | 0);
	const itemSize = TYPE_SIZE[accessor.type] ?? 1;
	const componentSize = componentByteSize(accessor.componentType);
	const stride = Math.max(componentSize * itemSize, Number(viewInfo.byteStride ?? 0) || componentSize * itemSize);
	const base = Number(viewInfo.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
	const dataView = new DataView(buffer, base, Math.max(0, buffer.byteLength - base));
	const out = new Float32Array(count * itemSize);

	for (let i = 0; i < count; i++) {
		const itemOffset = i * stride;
		for (let k = 0; k < itemSize; k++) {
			out[i * itemSize + k] = readComponent(dataView, itemOffset + k * componentSize, accessor.componentType, accessor.normalized === true);
		}
	}
	return out;
}

function readIndices(gltf, buffers, index, vertexBase = 0) {
	const src = readAccessor(gltf, buffers, index);
	if (!src) return null;
	let max = 0;
	for (let i = 0; i < src.length; i++) max = Math.max(max, src[i] + vertexBase);
	const out = max > 65535 ? new Uint32Array(src.length) : new Uint16Array(src.length);
	for (let i = 0; i < src.length; i++) out[i] = src[i] + vertexBase;
	return out;
}

function nodeMatrix(node) {
	if (node?.matrix) return Mat4(node.matrix);
	return Mat4.fromTRS(
		node?.translation ?? [0, 0, 0],
		node?.rotation ?? [0, 0, 0, 1],
		node?.scale ?? [1, 1, 1],
	);
}

function indexName(gltf, index, fallback) {
	return String(gltf.nodes?.[index]?.name ?? fallback);
}

function makeTexture(backend, image, samplerInfo = {}, label = "") {
	if (!image || !backend?.device || !globalThis.GPUTextureUsage) {
		return new Texture({
			label,
			width: image?.width ?? 1,
			height: image?.height ?? 1,
		});
	}
	const device = backend.device;
	const texture = device.createTexture({
		label,
		size: [Math.max(1, image.width | 0), Math.max(1, image.height | 0), 1],
		format: "rgba8unorm",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
	});
	device.queue.copyExternalImageToTexture(
		{ source: image, flipY: false },
		{ texture },
		{ width: image.width, height: image.height },
	);
	const sampler = device.createSampler({
		magFilter: samplerInfo.magFilter === 9728 ? "nearest" : "linear",
		minFilter: samplerInfo.minFilter === 9728 || samplerInfo.minFilter === 9984 ? "nearest" : "linear",
		mipmapFilter: "linear",
		addressModeU: samplerInfo.wrapS === 33071 ? "clamp-to-edge" : "repeat",
		addressModeV: samplerInfo.wrapT === 33071 ? "clamp-to-edge" : "repeat",
	});
	return new Texture({
		label,
		texture,
		view: texture.createView(),
		sampler,
		width: image.width,
		height: image.height,
	});
}

async function loadBuffers(gltf, url, bin) {
	const root = baseURL(url);
	const out = [];
	for (let i = 0; i < asList(gltf.buffers).length; i++) {
		const buffer = gltf.buffers[i];
		if (!buffer.uri && i === 0 && bin) {
			out.push(bin);
			continue;
		}
		if (isDataURL(buffer.uri)) out.push(decodeDataURL(buffer.uri));
		else out.push(await fetchArrayBuffer(new URL(buffer.uri, root).href));
	}
	return out;
}

async function loadImages(gltf, buffers, url) {
	const root = baseURL(url);
	const out = [];
	for (const image of asList(gltf.images)) {
		let blob = null;
		if (image.uri) {
			if (isDataURL(image.uri)) blob = new Blob([decodeDataURL(image.uri)], { type: image.mimeType ?? "image/png" });
			else {
				const res = await fetch(new URL(image.uri, root).href);
				blob = await res.blob();
			}
		} else {
			const viewInfo = gltf.bufferViews?.[image.bufferView];
			const buffer = buffers[viewInfo?.buffer];
			if (viewInfo && buffer) {
				blob = new Blob([
					buffer.slice(Number(viewInfo.byteOffset ?? 0), Number(viewInfo.byteOffset ?? 0) + Number(viewInfo.byteLength ?? 0)),
				], { type: image.mimeType ?? "image/png" });
			}
		}
		out.push(blob && globalThis.createImageBitmap ? await createImageBitmap(blob) : null);
	}
	return out;
}

function buildSkeleton(gltf, buffers, skinIndex) {
	const skin = gltf.skins?.[skinIndex];
	if (!skin) return null;
	const joints = asList(skin.joints);
	const inverse = skin.inverseBindMatrices != null ? readAccessor(gltf, buffers, skin.inverseBindMatrices) : null;
	const jointSet = new Map();
	for (let i = 0; i < joints.length; i++) jointSet.set(joints[i], i);
	return new Skeleton({
		name: String(skin.name ?? `skin_${skinIndex}`),
		joints: joints.map((nodeIndex, index) => {
			let parentIndex = -1;
			for (const [candidate, source] of asList(gltf.nodes).entries()) {
				if (!asList(source.children).includes(nodeIndex)) continue;
				parentIndex = jointSet.get(candidate) ?? -1;
				break;
			}
			return {
				name: indexName(gltf, nodeIndex, `joint_${index}`),
				parentIndex,
				inverseBindMatrix: inverse?.subarray(index * 16, index * 16 + 16) ?? Mat4.IDENTITY,
				bindMatrix: nodeMatrix(gltf.nodes?.[nodeIndex]),
			};
		}),
	});
}

function buildMaterials(gltf, textures) {
	return asList(gltf.materials).map((src, index) => {
		const pbr = src?.pbrMetallicRoughness ?? {};
		const texInfo = pbr.baseColorTexture;
		const textureIndex = texInfo?.index ?? -1;
		return new Material({
			name: String(src?.name ?? `material_${index}`),
			albedoColor: pbr.baseColorFactor ?? [1, 1, 1, 1],
			albedoTexture: textures[textureIndex] ?? null,
			extras: src?.extras ?? null,
		});
	});
}

function buildTextures(gltf, images, backend) {
	return asList(gltf.textures).map((src, index) => {
		const image = images[src?.source];
		const sampler = gltf.samplers?.[src?.sampler] ?? {};
		return makeTexture(backend, image, sampler, String(src?.name ?? `texture_${index}`));
	});
}

function buildMeshes(gltf, buffers, materials, skeletons, backend) {
	const meshes = [];
	for (let meshIndex = 0; meshIndex < asList(gltf.meshes).length; meshIndex++) {
		const srcMesh = gltf.meshes[meshIndex];
		const packed = [];
		const indexChunks = [];
		const submeshes = [];
		let vertexBase = 0;
		let indexStart = 0;

		for (let primIndex = 0; primIndex < asList(srcMesh.primitives).length; primIndex++) {
			const prim = srcMesh.primitives[primIndex];
			const attrs = prim.attributes ?? {};
			const positions = readAccessor(gltf, buffers, attrs.POSITION);
			if (!positions) continue;
			const count = positions.length / 3;
			const vertices = Mesh.packVertices({
				count,
				positions,
				normals: readAccessor(gltf, buffers, attrs.NORMAL),
				uvs: readAccessor(gltf, buffers, attrs.TEXCOORD_0),
				tangents: readAccessor(gltf, buffers, attrs.TANGENT),
				colors: readAccessor(gltf, buffers, attrs.COLOR_0),
				boneIDs: readAccessor(gltf, buffers, attrs.JOINTS_0),
				boneWeights: readAccessor(gltf, buffers, attrs.WEIGHTS_0),
			});
			packed.push(vertices);

			const indices = prim.indices != null
				? readIndices(gltf, buffers, prim.indices, vertexBase)
				: Uint32Array.from({ length: count }, (_v, i) => i + vertexBase);
			indexChunks.push(indices);
			submeshes.push({
				name: String(srcMesh.name ?? `mesh_${meshIndex}`) + (primIndex > 0 ? `.${primIndex}` : ""),
				indexStart,
				indexCount: indices.length,
				vertexStart: 0,
				vertexCount: count,
				material: materials[prim.material] ?? null,
			});
			vertexBase += count;
			indexStart += indices.length;
		}

		const vertexData = new Float32Array(packed.reduce((sum, chunk) => sum + chunk.length, 0));
		let vertexOffset = 0;
		for (const chunk of packed) {
			vertexData.set(chunk, vertexOffset);
			vertexOffset += chunk.length;
		}

		let indexMax = 0;
		for (const chunk of indexChunks) {
			for (let i = 0; i < chunk.length; i++) indexMax = Math.max(indexMax, chunk[i]);
		}
		const indexData = indexMax > 65535
			? new Uint32Array(indexChunks.reduce((sum, chunk) => sum + chunk.length, 0))
			: new Uint16Array(indexChunks.reduce((sum, chunk) => sum + chunk.length, 0));
		let write = 0;
		for (const chunk of indexChunks) {
			indexData.set(chunk, write);
			write += chunk.length;
		}

		meshes.push(new Mesh({
			backend,
			label: String(srcMesh.name ?? `mesh_${meshIndex}`),
			vertices: vertexData,
			indices: indexData,
			indexFormat: indexData instanceof Uint16Array ? "uint16" : "uint32",
			submeshes,
			materials,
			skeleton: null,
		}));
	}

	for (const node of asList(gltf.nodes)) {
		if (node?.mesh == null || node?.skin == null) continue;
		if (meshes[node.mesh]) meshes[node.mesh].skeleton = skeletons[node.skin] ?? null;
	}
	return meshes;
}

function buildModelTree(gltf, meshes) {
	const makeNode = (nodeIndex) => {
		const src = gltf.nodes?.[nodeIndex] ?? {};
		const node = new ModelNode({ name: String(src.name ?? `node_${nodeIndex}`) });
		node.addComp(new Transform({ local: nodeMatrix(src) }));
		if (src.mesh != null && meshes[src.mesh]) {
			node.addComp(new MeshRenderer({ mesh: meshes[src.mesh] }));
		}
		for (const childIndex of asList(src.children)) node.addChild(makeNode(childIndex));
		return node;
	};

	const scene = gltf.scenes?.[gltf.scene ?? 0] ?? gltf.scenes?.[0] ?? {};
	const roots = asList(scene.nodes);
	if (roots.length === 1) return makeNode(roots[0]);
	const root = new ModelNode({ name: String(scene.name ?? "model") });
	root.addComp(new Transform());
	for (const nodeIndex of roots) root.addChild(makeNode(nodeIndex));
	return root;
}

export class Loader {
	constructor(options = {}) {
		this.backend = options.backend ?? null;
	}

	setBackend(backend) {
		this.backend = backend ?? null;
		return this;
	}

	async loadModelFromURL(url, options = {}) {
		const backend = options.backend ?? this.backend ?? null;
		const target = String(url ?? "");
		const raw = await fetchArrayBuffer(target);
		const glb = readGLB(raw);
		const gltf = glb ? glb.json : await fetchJSON(target);
		const buffers = await loadBuffers(gltf, target, glb?.bin ?? null);
		const images = await loadImages(gltf, buffers, target);
		const textures = buildTextures(gltf, images, backend);
		const materials = buildMaterials(gltf, textures);
		const skeletons = asList(gltf.skins).map((_skin, index) => buildSkeleton(gltf, buffers, index));
		const meshes = buildMeshes(gltf, buffers, materials, skeletons, backend);
		return new Model({
			name: String(gltf.asset?.generator ?? gltf.scenes?.[gltf.scene ?? 0]?.name ?? "model"),
			root: buildModelTree(gltf, meshes),
			meshes,
			materials,
			textures,
		});
	}

	async loadMeshFromURL(url, options = {}) {
		const model = await this.loadModelFromURL(url, options);
		return model.meshes[0] ?? null;
	}

	static async loadModelFromURL(url, options = {}) {
		return new Loader(options).loadModelFromURL(url, options);
	}

	static async loadMeshFromURL(url, options = {}) {
		return new Loader(options).loadMeshFromURL(url, options);
	}
}

export default Loader;
