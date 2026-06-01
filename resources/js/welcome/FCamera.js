import { AzCamera } from "../AzLib/AzCamera.js";

function toNumber(value, fallback) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function defaultCfg(camera) {
	return {
		enabled: true,
		camera: {
			ref: camera ?? null,
		},
		pointer: {
			autoLock: true,
			lockButton: 0,
		},
		look: {
			sensitivity: 0.0022,
			pitchLimit: (Math.PI * 0.5) - 0.01,
		},
		move: {
			walkSpeed: 2.8,
			sprintScale: 2.2,
			keybind: {
				forward: "KeyW",
				backward: "KeyS",
				left: "KeyA",
				right: "KeyD",
				sprintA: "ShiftLeft",
				sprintB: "ShiftRight",
			},
		},
		zoom: {
			wheelScale: 0.04,
			minFov: 20,
			maxFov: 90,
		},
	};
}

function mergeCfg(base, next) {
	const src = next && typeof next === "object" ? next : {};
	const out = {
		...base,
		...src,
		camera: { ...base.camera, ...(src.camera ?? {}) },
		pointer: { ...base.pointer, ...(src.pointer ?? {}) },
		look: { ...base.look, ...(src.look ?? {}) },
		move: { ...base.move, ...(src.move ?? {}) },
		zoom: { ...base.zoom, ...(src.zoom ?? {}) },
	};
	out.move.keybind = { ...base.move.keybind, ...(src.move?.keybind ?? {}) };
	return out;
}

export class FCamera {
	constructor(options = {}) {
		this.canvas = options.canvas ?? null;
		this.camera = options.camera ?? new AzCamera(options.cameraOptions ?? {});
		this.cfg = mergeCfg(defaultCfg(this.camera), options.cfg ?? {});
		this.enabled = !!this.cfg.enabled;
		this.cfg.camera.ref = this.camera;

		this.pressed = new Set();
		this._attached = false;
		this._syncYawPitchFromCamera();
		this._bindEvents();
	}

	_bindEvents() {
		this._onPointerDown = (event) => {
			if (!this.enabled || !this.cfg.pointer.autoLock) return;
			if (event.button !== this.cfg.pointer.lockButton) return;
			if (document.pointerLockElement !== this.canvas) this.canvas?.requestPointerLock?.();
		};

		this._onKeyDown = (event) => {
			if (!this.enabled) return;
			this.pressed.add(event.code);
		};

		this._onKeyUp = (event) => {
			this.pressed.delete(event.code);
		};

		this._onMouseMove = (event) => {
			if (!this.enabled) return;
			if (document.pointerLockElement !== this.canvas) return;
			this.yaw -= event.movementX * this.cfg.look.sensitivity;
			this.pitch -= event.movementY * this.cfg.look.sensitivity;
			if (this.pitch > this.cfg.look.pitchLimit) this.pitch = this.cfg.look.pitchLimit;
			if (this.pitch < -this.cfg.look.pitchLimit) this.pitch = -this.cfg.look.pitchLimit;
			this.camera.setYawPitch(this.yaw, this.pitch);
		};

		this._onWheel = (event) => {
			if (!this.enabled) return;
			event.preventDefault();
			this.camera.fov += event.deltaY * this.cfg.zoom.wheelScale;
			if (this.camera.fov < this.cfg.zoom.minFov) this.camera.fov = this.cfg.zoom.minFov;
			if (this.camera.fov > this.cfg.zoom.maxFov) this.camera.fov = this.cfg.zoom.maxFov;
		};
	}

	_syncYawPitchFromCamera() {
		const forward = this.camera.forward;
		this.yaw = Math.atan2(forward[0], -forward[2]);
		this.pitch = Math.asin(Math.max(-1, Math.min(1, forward[1])));
	}

	setCanvas(canvas) {
		const wasAttached = this._attached;
		if (wasAttached) this.detach();
		this.canvas = canvas ?? null;
		if (wasAttached) this.attach();
		return this.canvas;
	}

	setCamera(camera) {
		this.camera = camera ?? this.camera;
		this.cfg.camera.ref = this.camera;
		this._syncYawPitchFromCamera();
		return this.camera;
	}

	setEnabled(value) {
		this.enabled = !!value;
		return this.enabled;
	}

	attach() {
		if (this._attached) return;
		this._attached = true;
		this.canvas?.addEventListener("pointerdown", this._onPointerDown);
		window.addEventListener("keydown", this._onKeyDown);
		window.addEventListener("keyup", this._onKeyUp);
		window.addEventListener("mousemove", this._onMouseMove);
		this.canvas?.addEventListener("wheel", this._onWheel, { passive: false });
	}

	detach() {
		if (!this._attached) return;
		this._attached = false;
		this.canvas?.removeEventListener("pointerdown", this._onPointerDown);
		window.removeEventListener("keydown", this._onKeyDown);
		window.removeEventListener("keyup", this._onKeyUp);
		window.removeEventListener("mousemove", this._onMouseMove);
		this.canvas?.removeEventListener("wheel", this._onWheel);
	}

	update(dt) {
		if (!this.enabled) return;
		const delta = Math.max(0, toNumber(dt, 0));
		const key = this.cfg.move.keybind;
		const speed = this.cfg.move.walkSpeed * (
			this.pressed.has(key.sprintA) || this.pressed.has(key.sprintB)
				? this.cfg.move.sprintScale
				: 1
		) * delta;
		if (speed <= 0) return;

		const f = this.camera.forward;
		const r = this.camera.right;
		let dx = 0;
		let dy = 0;
		let dz = 0;
		if (this.pressed.has(key.forward)) { dx += f[0]; dy += f[1]; dz += f[2]; }
		if (this.pressed.has(key.backward)) { dx -= f[0]; dy -= f[1]; dz -= f[2]; }
		if (this.pressed.has(key.right)) { dx += r[0]; dy += r[1]; dz += r[2]; }
		if (this.pressed.has(key.left)) { dx -= r[0]; dy -= r[1]; dz -= r[2]; }
		const len = Math.hypot(dx, dy, dz);
		if (len <= 0.00001) return;

		const inv = speed / len;
		this.camera.position[0] += dx * inv;
		this.camera.position[1] += dy * inv;
		this.camera.position[2] += dz * inv;
	}

	dispose() {
		this.detach();
		this.pressed.clear();
	}
}

if (typeof window !== "undefined") {
	window.FCamera = FCamera;
}

export default FCamera;
