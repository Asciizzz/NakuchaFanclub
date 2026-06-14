/* Acamera
By Asciiz

Simple camera core based on ZCanvas (ancient history) camera behavior, using Alm

I uuh, genuinely don't think it should belong in Alib
It's like REALLY REALLY REALLY REALLY REALLY specific
Idk, it is nice to have around so it could stay
*/

import * as Alm from "./Alm.js";

const AXIS_X = Alm.Vec3(1, 0, 0);
const AXIS_Y = Alm.Vec3(0, 1, 0);
const AXIS_Z = Alm.Vec3(0, 0, 1);

export class Acamera {
	constructor(options = {}) {
		this.position = Alm.Vec3(options.position ?? [0, 0, 0]);
		this.orientation = Alm.Quat(options.orientation ?? [0, 0, 0, 1]);

		this.near = options.near ?? 0.1;
		this.far = options.far ?? 1000;
		this.fov = options.fov ?? 45; // degrees
		this.aspect = options.aspect ?? 1;

		this.orthographic = options.orthographic ?? false;
		this.orthoSize = options.orthoSize ?? 5; // half-height
	}

	get forward() { return Alm.Quat.transformV3(this.orientation, Alm.Vec3.FORWARD); }
	get right() { return Alm.Quat.transformV3(this.orientation, Alm.Vec3.RIGHT); }
	get up() { return Alm.Quat.transformV3(this.orientation, Alm.Vec3.UP); }

	get view() {
		const target = Alm.Vec3.add(this.position, this.forward);
		return Alm.Mat4.lookAt(this.position, target, this.up);
	}

	get projection() {
		if (this.orthographic) {
			const h = this.orthoSize;
			const w = h * this.aspect;
			return Alm.Mat4.ortho(-w, w, -h, h, this.near, this.far);
		}

		return Alm.Mat4.perspective(this.fov * Alm.DEG2RAD, this.aspect, this.near, this.far);
	}

	rotateQ(q) {
		Alm.Quat.mul(this.orientation, q, this.orientation);
		Alm.Quat.norm(this.orientation, this.orientation);
		return this;
	}

	rotateAxis(axis, angle) {
		const q = Alm.Quat.fromAxisAngle(axis, angle);
		return this.rotateQ(q);
	}

	rotateEuler(eulerRad) {
		const q = Acamera.eulerToQuat(eulerRad);
		return this.rotateQ(q);
	}

	setEuler(eulerRad) {
		Acamera.eulerToQuat(eulerRad, this.orientation);
		Alm.Quat.norm(this.orientation, this.orientation);
		return this;
	}

	setYawPitch(yawRad, pitchRad, rollRad = 0) {
		return this.setEuler([pitchRad, yawRad, rollRad]);
	}

	translate(offset) {
		const worldOffset = Alm.Quat.transformV3(this.orientation, offset);
		Alm.Vec3.add(this.position, worldOffset, this.position);
		return this;
	}

	lookAt(target, up = null) {
		up ??= Alm.Vec3.UP;

		const forward = Alm.Vec3.norm(Alm.Vec3.sub(target, this.position));
		const right = Alm.Vec3.norm(Alm.Vec3.cross(up, forward));
		const camUp = Alm.Vec3.cross(forward, right);

		const m = Alm.Mat4.makeIdentity();

		m[0] = right[0]; m[4] = camUp[0]; m[8] = -forward[0];
		m[1] = right[1]; m[5] = camUp[1]; m[9] = -forward[1];
		m[2] = right[2]; m[6] = camUp[2]; m[10] = -forward[2];

		Alm.Quat.fromM4(m, this.orientation);
		Alm.Quat.norm(this.orientation, this.orientation);
		return this;
	}

	raytrace(ndc) {
		if (this.orthographic) {
			const h = this.orthoSize;
			const w = h * this.aspect;
			const local = Alm.Vec3(ndc[0] * w, ndc[1] * h, 0);
			const worldOffset = Alm.Quat.transformV3(this.orientation, local);
			const origin = Alm.Vec3.add(this.position, worldOffset);
			const direction = Alm.Vec3.norm(this.forward);
			return { origin, direction };
		}

		const tan = Math.tan(this.fov * Alm.DEG2RAD * 0.5);
		const x = ndc[0] * tan * this.aspect;
		const y = ndc[1] * tan;

		const dir = Alm.Vec3.norm(Alm.Vec3.set(x, y, -1));
		Alm.Quat.transformV3(this.orientation, dir, dir);
		Alm.Vec3.norm(dir, dir);

		return {
			origin: Alm.Vec3.copy(this.position),
			direction: dir,
		};
	}

	findNDC(pos) {
		if (!pos || (typeof pos !== "object")) return null;
		const x = Number(pos[0]);
		const y = Number(pos[1]);
		const z = Number(pos[2]);
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

		const vp = Alm.Mat4.mul(this.projection, this.view);
		const clip = Alm.Mat4.transformV4(vp, [x, y, z, 1]);
		const w = Number(clip[3] ?? 0);
		if (!Number.isFinite(w) || w <= Alm.EPSILON) return null;

		const invW = 1 / w;
		const ndcX = clip[0] * invW;
		const ndcY = clip[1] * invW;
		const ndcZ = clip[2] * invW;
		if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || !Number.isFinite(ndcZ)) return null;

		return Alm.Vec3.set(ndcX, ndcY, ndcZ);
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
			const invModel = Alm.Mat4.invert(modelMatrix);
			if (!invModel) return { hit: false, distance: Infinity, near: Infinity, far: -Infinity, point: null };

			const localOrigin4 = Alm.Mat4.transformV4(invModel, [origin[0], origin[1], origin[2], 1]);
			const localDir4 = Alm.Mat4.transformV4(invModel, [direction[0], direction[1], direction[2], 0]);
			localOrigin = Alm.Vec3.set(localOrigin4[0], localOrigin4[1], localOrigin4[2]);
			localDirection = Alm.Vec3.set(localDir4[0], localDir4[1], localDir4[2]);
		}

		let tMin = -Infinity;
		let tMax = Infinity;
		for (let axis = 0; axis < 3; axis += 1) {
			const o = Number(localOrigin[axis] ?? 0) || 0;
			const d = Number(localDirection[axis] ?? 0) || 0;
			const aMin = Number(min[axis] ?? 0) || 0;
			const aMax = Number(max[axis] ?? 0) || 0;

			if (Math.abs(d) <= Alm.EPSILON) {
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
			point: Alm.Vec3.set(
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

		const qy = Alm.Quat.fromAxisAngle(AXIS_Y, y);
		const qx = Alm.Quat.fromAxisAngle(AXIS_X, x);
		const qz = Alm.Quat.fromAxisAngle(AXIS_Z, z);

		const q = out ?? Alm.Quat();
		Alm.Quat.mul(qy, qx, q);
		Alm.Quat.mul(q, qz, q);
		return Alm.Quat.norm(q, q);
	}
}

if (typeof window !== "undefined") {
	window.Acamera = Acamera;
}

export default Acamera;
