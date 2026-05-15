/* ZCamera
By Asciiz

WebGPU-era camera backed by Azm.
*/

(function () {
    if (!window.Azm?.M4) throw new Error("[ZCamera] Azm.M4 is required");
    if (!window.Azm?.Q) throw new Error("[ZCamera] Azm.Q is required");

    class ZCamera {
        position = Azm.V3();
        orientation = Azm.Q.identity();

        near = 0.1;
        far = 1000;
        fov = 45;
        aspect = 1;

        orthographic = false;
        orthoSize = 5;

        get forward() { return Azm.Q.transformV3(this.orientation, Azm.V3.FORWARD); }
        get right() { return Azm.Q.transformV3(this.orientation, Azm.V3.RIGHT); }
        get up() { return Azm.Q.transformV3(this.orientation, Azm.V3.UP); }

        get view() {
            const target = Azm.V3.add(this.position, this.forward);
            return Azm.M4.lookAt(this.position, target, this.up);
        }

        get projection() {
            if (this.orthographic) {
                const h = this.orthoSize;
                const w = h * this.aspect;
                return Azm.M4.ortho(-w, w, -h, h, this.near, this.far);
            }
            return Azm.M4.perspective(this.fov * Azm.DEG2RAD, this.aspect, this.near, this.far);
        }

        rotate(axis, angle) {
            const q = Azm.Q.fromAxisAngle(axis, angle);
            Azm.Q.mul(this.orientation, q, this.orientation);
            Azm.Q.norm(this.orientation, this.orientation);
            return this;
        }

        translate(offset) {
            const worldOffset = Azm.Q.transformV3(this.orientation, offset);
            Azm.V3.add(this.position, worldOffset, this.position);
            return this;
        }

        lookAt(target, up = null) {
            up ??= Azm.V3.UP;
            const forward = Azm.V3.norm(Azm.V3.sub(target, this.position));
            const right = Azm.V3.norm(Azm.V3.cross(up, forward));
            const camUp = Azm.V3.cross(forward, right);

            const m = Azm.M4.identity();
            m[0] = right[0]; m[4] = camUp[0]; m[8] = -forward[0];
            m[1] = right[1]; m[5] = camUp[1]; m[9] = -forward[1];
            m[2] = right[2]; m[6] = camUp[2]; m[10] = -forward[2];

            Azm.Q.fromM4(m, this.orientation);
            return this;
        }
    }

    window.ZCamera = ZCamera;
})();

