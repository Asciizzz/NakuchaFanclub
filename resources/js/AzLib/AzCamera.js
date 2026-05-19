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

		const m = Azm.Mat4.identity();

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
