/* AzCamera
By Asciiz

Simple camera core based on ZCanvas.js camera behavior, using Azm.
*/

import * as Azm from "./Azm.js";

const AXIS_X = Azm.Vec3(1, 0, 0);
const AXIS_Y = Azm.Vec3(0, 1, 0);
const AXIS_Z = Azm.Vec3(0, 0, 1);

export class AzCamera {
	constructor(options = {}) {
		this.position = Azm.Vec3(options.position ?? [0, 0, 0]);
		this.orientation = Azm.Quat(options.orientation ?? [0, 0, 0, 1]);

		this.near = options.near ?? 0.1;
		this.far = options.far ?? 1000;
		this.fov = options.fov ?? 45; // degrees
		this.aspect = options.aspect ?? 1;

		this.orthographic = options.orthographic ?? false;
		this.orthoSize = options.orthoSize ?? 5; // half-height
	}

	get forward() {
		return Azm.Quat.transformV3(this.orientation, Azm.Vec3.FORWARD);
	}

	get right() {
		return Azm.Quat.transformV3(this.orientation, Azm.Vec3.RIGHT);
	}

	get up() {
		return Azm.Quat.transformV3(this.orientation, Azm.Vec3.UP);
	}

	get view() {
		const target = Azm.Vec3.add(this.position, this.forward);
		return Azm.Mat4.lookAt(this.position, target, this.up);
	}

	get projection() {
		if (this.orthographic) {
			const h = this.orthoSize;
			const w = h * this.aspect;
			return Azm.Mat4.ortho(-w, w, -h, h, this.near, this.far);
		}

		return Azm.Mat4.perspective(this.fov * Azm.DEG2RAD, this.aspect, this.near, this.far);
	}

	rotateQ(q) {
		Azm.Quat.mul(this.orientation, q, this.orientation);
		Azm.Quat.norm(this.orientation, this.orientation);
		return this;
	}

	rotateAxis(axis, angle) {
		const q = Azm.Quat.fromAxisAngle(axis, angle);
		return this.rotateQ(q);
	}

	rotateEuler(eulerRad) {
		const q = AzCamera.eulerToQuat(eulerRad);
		return this.rotateQ(q);
	}

	setEuler(eulerRad) {
		AzCamera.eulerToQuat(eulerRad, this.orientation);
		Azm.Quat.norm(this.orientation, this.orientation);
		return this;
	}

	setYawPitch(yawRad, pitchRad, rollRad = 0) {
		return this.setEuler([pitchRad, yawRad, rollRad]);
	}

	translate(offset) {
		const worldOffset = Azm.Quat.transformV3(this.orientation, offset);
		Azm.Vec3.add(this.position, worldOffset, this.position);
		return this;
	}

	lookAt(target, up = null) {
		up ??= Azm.Vec3.UP;

		const forward = Azm.Vec3.norm(Azm.Vec3.sub(target, this.position));
		const right = Azm.Vec3.norm(Azm.Vec3.cross(up, forward));
		const camUp = Azm.Vec3.cross(forward, right);

		const m = Azm.Mat4.makeIdentity();

		m[0] = right[0]; m[4] = camUp[0]; m[8] = -forward[0];
		m[1] = right[1]; m[5] = camUp[1]; m[9] = -forward[1];
		m[2] = right[2]; m[6] = camUp[2]; m[10] = -forward[2];

		Azm.Quat.fromM4(m, this.orientation);
		Azm.Quat.norm(this.orientation, this.orientation);
		return this;
	}

	raytrace(ndc) {
		if (this.orthographic) {
			const h = this.orthoSize;
			const w = h * this.aspect;
			const local = Azm.Vec3(ndc[0] * w, ndc[1] * h, 0);
			const worldOffset = Azm.Quat.transformV3(this.orientation, local);
			const origin = Azm.Vec3.add(this.position, worldOffset);
			const direction = Azm.Vec3.norm(this.forward);
			return { origin, direction };
		}

		const tan = Math.tan(this.fov * Azm.DEG2RAD * 0.5);
		const x = ndc[0] * tan * this.aspect;
		const y = ndc[1] * tan;

		const dir = Azm.Vec3.norm(Azm.Vec3.set(x, y, -1));
		Azm.Quat.transformV3(this.orientation, dir, dir);
		Azm.Vec3.norm(dir, dir);

		return {
			origin: Azm.Vec3.copy(this.position),
			direction: dir,
		};
	}

	findNDC(pos) {
		if (!pos || (typeof pos !== "object")) return null;
		const x = Number(pos[0]);
		const y = Number(pos[1]);
		const z = Number(pos[2]);
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

		const vp = Azm.Mat4.mul(this.projection, this.view);
		const clip = Azm.Mat4.transformV4(vp, [x, y, z, 1]);
		const w = Number(clip[3] ?? 0);
		if (!Number.isFinite(w) || w <= Azm.EPSILON) return null;

		const invW = 1 / w;
		const ndcX = clip[0] * invW;
		const ndcY = clip[1] * invW;
		const ndcZ = clip[2] * invW;
		if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || !Number.isFinite(ndcZ)) return null;

		return Azm.Vec3.set(ndcX, ndcY, ndcZ);
	}

	static hitAABB(ray, min, max, modelMatrix = null) {
		const origin = ray?.origin;
		const direction = ray?.direction;
		if (!origin || !direction || !min || !max) {
			return { hit: false, distance: Infinity, near: Infinity, far: -Infinity, point: null };
		}

		let localOrigin = origin;
		let localDirection = direction;
		if (modelMatrix && (ArrayBuffer.isView(modelMatrix) || Array.isArray(modelMatrix)) && modelMatrix.length >= 16) {
			const invModel = Azm.Mat4.invert(modelMatrix);
			if (!invModel) return { hit: false, distance: Infinity, near: Infinity, far: -Infinity, point: null };

			const localOrigin4 = Azm.Mat4.transformV4(invModel, [origin[0], origin[1], origin[2], 1]);
			const localDir4 = Azm.Mat4.transformV4(invModel, [direction[0], direction[1], direction[2], 0]);
			localOrigin = Azm.Vec3.set(localOrigin4[0], localOrigin4[1], localOrigin4[2]);
			localDirection = Azm.Vec3.set(localDir4[0], localDir4[1], localDir4[2]);
		}

		let tMin = -Infinity;
		let tMax = Infinity;
		for (let axis = 0; axis < 3; axis += 1) {
			const o = Number(localOrigin[axis] ?? 0) || 0;
			const d = Number(localDirection[axis] ?? 0) || 0;
			const aMin = Number(min[axis] ?? 0) || 0;
			const aMax = Number(max[axis] ?? 0) || 0;

			if (Math.abs(d) <= Azm.EPSILON) {
				if (o < aMin || o > aMax) {
					return { hit: false, distance: Infinity, near: Infinity, far: -Infinity, point: null };
				}
				continue;
			}

			let t1 = (aMin - o) / d;
			let t2 = (aMax - o) / d;
			if (t1 > t2) {
				const swap = t1;
				t1 = t2;
				t2 = swap;
			}
			if (t1 > tMin) tMin = t1;
			if (t2 < tMax) tMax = t2;
			if (tMax < tMin) {
				return { hit: false, distance: Infinity, near: Infinity, far: -Infinity, point: null };
			}
		}

		if (tMax < 0) return { hit: false, distance: Infinity, near: tMin, far: tMax, point: null };
		const distance = tMin >= 0 ? tMin : tMax;
		return {
			hit: true,
			distance,
			near: tMin,
			far: tMax,
			point: Azm.Vec3.set(
				origin[0] + direction[0] * distance,
				origin[1] + direction[1] * distance,
				origin[2] + direction[2] * distance,
			),
		};
	}

	static eulerToQuat(eulerRad, out = null) {
		// Fixed, explicit Y-X-Z composition:
		// yaw around Y, then pitch around X, then roll around Z.
		const x = eulerRad[0] ?? 0;
		const y = eulerRad[1] ?? 0;
		const z = eulerRad[2] ?? 0;

		const qy = Azm.Quat.fromAxisAngle(AXIS_Y, y);
		const qx = Azm.Quat.fromAxisAngle(AXIS_X, x);
		const qz = Azm.Quat.fromAxisAngle(AXIS_Z, z);

		const q = out ?? Azm.Quat();
		Azm.Quat.mul(qy, qx, q);
		Azm.Quat.mul(q, qz, q);
		return Azm.Quat.norm(q, q);
	}
}

if (typeof window !== "undefined") {
	window.AzCamera = AzCamera;
}

export default AzCamera;
