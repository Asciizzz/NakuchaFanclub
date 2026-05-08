/*
EzCanvas3D
By Asciiz

Holy crap guys I actually made a proper 3D html webgl renderer instead of using canvas2d lmao

Contains
    EzMath       Mat4 / Quat / Vec3 / etc. utilities 
    EzRender     static, dimension-agnostic GL helpers
    EzShader     low-level shader compile + render-state base
    EzCanvas3D   thin wrapper around <canvas> + WebGL2 context

    -- Highly specialized --
    EzShader3D   shader descriptor/compiler (extends EzShader)
    EzCamera3D   view/projection helper
    EzMesh3D     VAO + VBO geometry container
    EzSkeleton3D bone rig + skinning palette builder
*/

(function () {
    class _c {
        static warn(TAG, ...a) { console.warn(TAG, ...a); return false; }
        static err(TAG, ...a) { console.error(TAG, ...a) }
    }

    class _is {
        static str = v => typeof v === "string" && v.trim() !== "";
        static obj = v => typeof v === "object" && v !== null;
        static POT = n => n > 0 && (n & (n - 1)) === 0; // Power of 2?
        static sampler = t => t === "sampler2D" || t === "highp sampler2D"
    }

    const KIND_SCALAR = 'scalar';
    const KIND_VEC2   = 'vec2';
    const KIND_VEC3   = 'vec3';
    const KIND_VEC4   = 'vec4';
    const KIND_QUAT   = 'quat';
    const KIND_MAT4   = 'mat4';

    class Vec2 {
        static KIND = KIND_VEC2;
        static SIZE = 2;
        constructor(x = 0, y = 0) {
            this.data = new Float32Array(2);
            this.kind = KIND_VEC2;
            this.data[0] = x; this.data[1] = y;
        }
        set(a, off = 0) { this.data[0]=a[off]; this.data[1]=a[off+1]; return this; }
        copy(o)         { this.data.set(o.data); return this; }
        get x() { return this.data[0]; }  set x(v) { this.data[0] = v; }
        get y() { return this.data[1]; }  set y(v) { this.data[1] = v; }
    }

    class Vec3 {
        static KIND = KIND_VEC3;
        static SIZE = 3;
        constructor(x = 0, y = 0, z = 0) {
            this.data = new Float32Array(3);
            this.kind = KIND_VEC3;
            this.data[0]=x; this.data[1]=y; this.data[2]=z;
        }
        set(a, off = 0) { this.data[0]=a[off]; this.data[1]=a[off+1]; this.data[2]=a[off+2]; return this; }
        copy(o)         { this.data.set(o.data); return this; }
        get x() { return this.data[0]; }  set x(v) { this.data[0] = v; }
        get y() { return this.data[1]; }  set y(v) { this.data[1] = v; }
        get z() { return this.data[2]; }  set z(v) { this.data[2] = v; }
    }

    class Vec4 {
        static KIND = KIND_VEC4;
        static SIZE = 4;
        constructor(x = 0, y = 0, z = 0, w = 0) {
            this.data = new Float32Array(4);
            this.kind = KIND_VEC4;
            this.data[0]=x; this.data[1]=y; this.data[2]=z; this.data[3]=w;
        }
        set(a, off = 0) { this.data[0]=a[off]; this.data[1]=a[off+1]; this.data[2]=a[off+2]; this.data[3]=a[off+3]; return this; }
        copy(o)         { this.data.set(o.data); return this; }
        get x() { return this.data[0]; }  set x(v) { this.data[0] = v; }
        get y() { return this.data[1]; }  set y(v) { this.data[1] = v; }
        get z() { return this.data[2]; }  set z(v) { this.data[2] = v; }
        get w() { return this.data[3]; }  set w(v) { this.data[3] = v; }
    }

    class Quat {
        static KIND = KIND_QUAT;
        static SIZE = 4;
        constructor(x = 0, y = 0, z = 0, w = 1) {
            this.data = new Float32Array(4);
            this.kind = KIND_QUAT;
            this.data[0]=x; this.data[1]=y; this.data[2]=z; this.data[3]=w;
        }
        set(a, off = 0) { this.data[0]=a[off]; this.data[1]=a[off+1]; this.data[2]=a[off+2]; this.data[3]=a[off+3]; return this; }
        copy(o)         { this.data.set(o.data); return this; }
        identity()      { this.data[0]=0; this.data[1]=0; this.data[2]=0; this.data[3]=1; return this; }
        get x() { return this.data[0]; }  set x(v) { this.data[0] = v; }
        get y() { return this.data[1]; }  set y(v) { this.data[1] = v; }
        get z() { return this.data[2]; }  set z(v) { this.data[2] = v; }
        get w() { return this.data[3]; }  set w(v) { this.data[3] = v; }
    }

    class Mat4 {
        static KIND = KIND_MAT4;
        static SIZE = 16;
        constructor() {
            this.data = new Float32Array(16);
            this.kind = KIND_MAT4;
            this.data[0] = 1; this.data[5] = 1; this.data[10] = 1; this.data[15] = 1;
        }
        set(a, off = 0) {
            const d = this.data;
            for (let i = 0; i < 16; i++) d[i] = a[off + i];
            return this;
        }
        copy(o) { this.data.set(o.data); return this; }
        identity() {
            const d = this.data;
            d[0] =1; d[1] =0; d[2] =0; d[3]= 0;
            d[4] =0; d[5] =1; d[6] =0; d[7] =0;
            d[8] =0; d[9] =0; d[10]=1; d[11]=0;
            d[12]=0; d[13]=0; d[14]=0; d[15]=1;
            return this;
        }
    }

    class EzMath {
        static clamp = (p, min, max) => Math.max(min, Math.min(max, p));

        static kindOf(v) {
            if (typeof v === 'number') return KIND_SCALAR;
            if (v && typeof v.kind === 'string') return v.kind;
            return null;
        }

        static #scratchM = new Float32Array(16);
        static #scratchQ = new Float32Array(4);
        static #scratchV = new Float32Array(4);
        static #_pos = new Vec3();
        static #_scl = new Vec3(1, 1, 1);
        static #_rot = new Quat();

        static copy(out, a) {
            if (!out || !a || out.kind !== a.kind) return null;
            out.data.set(a.data);
            return out;
        }

        static identity(out) {
            if (!out) return null;
            if (out.kind === KIND_MAT4 || out.kind === KIND_QUAT) { out.identity(); return out; }
            return null;
        }

        static add(out, a, b) {
            if (!out || !out.data) return null;
            const ko = out.kind, sz = out.data.length;
            const ka = EzMath.kindOf(a), kb = EzMath.kindOf(b);
            if (!ka || !kb) return null;
            const isScA = ka === KIND_SCALAR, isScB = kb === KIND_SCALAR;
            const od = out.data;
            if (!isScA && !isScB) {
                if (ka !== ko || kb !== ko) return null;
                const ad = a.data, bd = b.data;
                for (let i = 0; i < sz; i++) od[i] = ad[i] + bd[i];
                return out;
            }
            if (isScA && isScB) {
                const v = a + b;
                for (let i = 0; i < sz; i++) od[i] = v;
                return out;
            }
            const sized = isScA ? b : a;
            if (sized.kind !== ko) return null;
            const sd = sized.data;
            const sc = isScA ? a : b;
            for (let i = 0; i < sz; i++) od[i] = sd[i] + sc;
            return out;
        }

        static sub(out, a, b) {
            if (!out || !out.data) return null;
            const ko = out.kind, sz = out.data.length;
            const ka = EzMath.kindOf(a), kb = EzMath.kindOf(b);
            if (!ka || !kb) return null;
            const isScA = ka === KIND_SCALAR, isScB = kb === KIND_SCALAR;
            const od = out.data;
            if (!isScA && !isScB) {
                if (ka !== ko || kb !== ko) return null;
                const ad = a.data, bd = b.data;
                for (let i = 0; i < sz; i++) od[i] = ad[i] - bd[i];
                return out;
            }
            if (isScA && isScB) {
                const v = a - b;
                for (let i = 0; i < sz; i++) od[i] = v;
                return out;
            }
            if (isScA) {
                if (b.kind !== ko) return null;
                const bd = b.data;
                for (let i = 0; i < sz; i++) od[i] = a - bd[i];
                return out;
            }
            // isScB
            if (a.kind !== ko) return null;
            const ad = a.data;
            for (let i = 0; i < sz; i++) od[i] = ad[i] - b;
            return out;
        }

        static mul(out, a, b) {
            if (!out || !out.data) return null;
            const ko = out.kind;
            const ka = EzMath.kindOf(a), kb = EzMath.kindOf(b);
            if (!ka || !kb) return null;

            if (ka === KIND_SCALAR && kb === KIND_SCALAR) return null;
            if (ka === KIND_SCALAR) {
                if (ko !== kb) return null;
                return EzMath.#scaleInto(out, b, a);
            }
            if (kb === KIND_SCALAR) {
                if (ko !== ka) return null;
                return EzMath.#scaleInto(out, a, b);
            }

            if (ka === KIND_MAT4 && kb === KIND_MAT4 && ko === KIND_MAT4) return EzMath.#mulM4M4(out, a, b);
            if (ka === KIND_QUAT && kb === KIND_QUAT && ko === KIND_QUAT) return EzMath.#mulQQ(out, a, b);
            if (ka === KIND_MAT4 && kb === KIND_VEC4 && ko === KIND_VEC4) return EzMath.#mulM4V4(out, a, b);
            if (ka === KIND_MAT4 && kb === KIND_VEC3 && ko === KIND_VEC3) return EzMath.#mulM4Point(out, a, b);
            if (ka === KIND_QUAT && kb === KIND_VEC3 && ko === KIND_VEC3) return EzMath.#mulQV3(out, a, b);

            if (ka === kb && ko === ka && (ka === KIND_VEC2 || ka === KIND_VEC3 || ka === KIND_VEC4)) {
                const ad = a.data, bd = b.data, od = out.data;
                for (let i = 0; i < od.length; i++) od[i] = ad[i] * bd[i];
                return out;
            }
            return null;
        }

        static #scaleInto(out, sized, s) {
            if (out.kind !== sized.kind || out.data.length !== sized.data.length) return null;
            const od = out.data, sd = sized.data;
            for (let i = 0; i < od.length; i++) od[i] = sd[i] * s;
            return out;
        }

        static #mulM4M4(out, A, B) {
            const a = A.data, b = B.data, t = EzMath.#scratchM;
            for (let c = 0; c < 4; c++) {
                const b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
                t[c*4  ] = a[0]*b0 + a[4]*b1 + a[ 8]*b2 + a[12]*b3;
                t[c*4+1] = a[1]*b0 + a[5]*b1 + a[ 9]*b2 + a[13]*b3;
                t[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
                t[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
            }
            out.data.set(t);
            return out;
        }

        static #mulQQ(out, A, B) {
            const a = A.data, b = B.data, t = EzMath.#scratchQ;
            const ax=a[0], ay=a[1], az=a[2], aw=a[3];
            const bx=b[0], by=b[1], bz=b[2], bw=b[3];
            t[0] = aw*bx + ax*bw + ay*bz - az*by;
            t[1] = aw*by - ax*bz + ay*bw + az*bx;
            t[2] = aw*bz + ax*by - ay*bx + az*bw;
            t[3] = aw*bw - ax*bx - ay*by - az*bz;
            const od = out.data;
            od[0]=t[0]; od[1]=t[1]; od[2]=t[2]; od[3]=t[3];
            return out;
        }

        static #mulM4V4(out, M, V) {
            const m = M.data, v = V.data, t = EzMath.#scratchV;
            const x=v[0], y=v[1], z=v[2], w=v[3];
            t[0] = m[0]*x + m[4]*y + m[ 8]*z + m[12]*w;
            t[1] = m[1]*x + m[5]*y + m[ 9]*z + m[13]*w;
            t[2] = m[2]*x + m[6]*y + m[10]*z + m[14]*w;
            t[3] = m[3]*x + m[7]*y + m[11]*z + m[15]*w;
            const od = out.data;
            od[0]=t[0]; od[1]=t[1]; od[2]=t[2]; od[3]=t[3];
            return out;
        }

        // Mat4 * Vec3 (point) - assumes w=1; performs perspective divide.
        static #mulM4Point(out, M, V) {
            const m = M.data, v = V.data;
            const x=v[0], y=v[1], z=v[2];
            const tx = m[0]*x + m[4]*y + m[ 8]*z + m[12];
            const ty = m[1]*x + m[5]*y + m[ 9]*z + m[13];
            const tz = m[2]*x + m[6]*y + m[10]*z + m[14];
            const tw = m[3]*x + m[7]*y + m[11]*z + m[15] || 1;
            const inv = 1 / tw;
            const od = out.data;
            od[0] = tx * inv; od[1] = ty * inv; od[2] = tz * inv;
            return out;
        }

        // Quat * Vec3 - rotate vector by quaternion.
        static #mulQV3(out, Q, V) {
            const q = Q.data, v = V.data;
            const qx=q[0], qy=q[1], qz=q[2], qw=q[3];
            const vx=v[0], vy=v[1], vz=v[2];
            const tx = 2*(qy*vz - qz*vy);
            const ty = 2*(qz*vx - qx*vz);
            const tz = 2*(qx*vy - qy*vx);
            const od = out.data;
            od[0] = vx + qw*tx + qy*tz - qz*ty;
            od[1] = vy + qw*ty + qz*tx - qx*tz;
            od[2] = vz + qw*tz + qx*ty - qy*tx;
            return out;
        }

        static scale(out, a, s) {
            if (!out || !a) return null;
            if (out.kind !== a.kind || out.data.length !== a.data.length) return null;
            if (typeof s !== 'number') return null;
            const od = out.data, ad = a.data;
            for (let i = 0; i < od.length; i++) od[i] = ad[i] * s;
            return out;
        }

        static negate(out, a) {
            if (!out || !a) return null;
            if (out.kind !== a.kind || out.data.length !== a.data.length) return null;
            const od = out.data, ad = a.data;
            for (let i = 0; i < od.length; i++) od[i] = -ad[i];
            return out;
        }

        static normalize(out, a) {
            if (!out || !a) return null;
            if (out.kind !== a.kind) return null;
            const k = a.kind;
            if (k !== KIND_VEC2 && k !== KIND_VEC3 && k !== KIND_VEC4 && k !== KIND_QUAT) return null;
            const ad = a.data, od = out.data;
            let lsq = 0;
            for (let i = 0; i < ad.length; i++) lsq += ad[i]*ad[i];
            const inv = lsq > 0 ? 1/Math.sqrt(lsq) : 0;
            for (let i = 0; i < ad.length; i++) od[i] = ad[i] * inv;
            return out;
        }

        static invert(out, a) {
            if (!out || !a || out.kind !== a.kind) return null;
            if (a.kind === KIND_QUAT) {
                const ad = a.data, od = out.data;
                const lsq = ad[0]*ad[0] + ad[1]*ad[1] + ad[2]*ad[2] + ad[3]*ad[3];
                if (lsq === 0) return null;
                const inv = 1 / lsq;
                od[0] = -ad[0]*inv; od[1] = -ad[1]*inv; od[2] = -ad[2]*inv; od[3] = ad[3]*inv;
                return out;
            }
            if (a.kind === KIND_MAT4) {
                const m = a.data, t = EzMath.#scratchM;
                const a00=m[0],  a01=m[1],  a02=m[2],  a03=m[3];
                const a10=m[4],  a11=m[5],  a12=m[6],  a13=m[7];
                const a20=m[8],  a21=m[9],  a22=m[10], a23=m[11];
                const a30=m[12], a31=m[13], a32=m[14], a33=m[15];
                const b00 = a00*a11 - a01*a10, b01 = a00*a12 - a02*a10, b02 = a00*a13 - a03*a10;
                const b03 = a01*a12 - a02*a11, b04 = a01*a13 - a03*a11, b05 = a02*a13 - a03*a12;
                const b06 = a20*a31 - a21*a30, b07 = a20*a32 - a22*a30, b08 = a20*a33 - a23*a30;
                const b09 = a21*a32 - a22*a31, b10 = a21*a33 - a23*a31, b11 = a22*a33 - a23*a32;
                const det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
                if (!det) return null;
                const id = 1 / det;
                t[ 0] = (a11*b11 - a12*b10 + a13*b09) * id;
                t[ 1] = (a02*b10 - a01*b11 - a03*b09) * id;
                t[ 2] = (a31*b05 - a32*b04 + a33*b03) * id;
                t[ 3] = (a22*b04 - a21*b05 - a23*b03) * id;
                t[ 4] = (a12*b08 - a10*b11 - a13*b07) * id;
                t[ 5] = (a00*b11 - a02*b08 + a03*b07) * id;
                t[ 6] = (a32*b02 - a30*b05 - a33*b01) * id;
                t[ 7] = (a20*b05 - a22*b02 + a23*b01) * id;
                t[ 8] = (a10*b10 - a11*b08 + a13*b06) * id;
                t[ 9] = (a01*b08 - a00*b10 - a03*b06) * id;
                t[10] = (a30*b04 - a31*b02 + a33*b00) * id;
                t[11] = (a21*b02 - a20*b04 - a23*b00) * id;
                t[12] = (a11*b07 - a10*b09 - a12*b06) * id;
                t[13] = (a00*b09 - a01*b07 + a02*b06) * id;
                t[14] = (a31*b01 - a30*b03 - a32*b00) * id;
                t[15] = (a20*b03 - a21*b01 + a22*b00) * id;
                out.data.set(t);
                return out;
            }
            return null;
        }

        static transpose(out, a) {
            if (!out || !a) return null;
            if (out.kind !== KIND_MAT4 || a.kind !== KIND_MAT4) return null;
            const m = a.data, t = EzMath.#scratchM;
            t[ 0]=m[ 0]; t[ 1]=m[ 4]; t[ 2]=m[ 8]; t[ 3]=m[12];
            t[ 4]=m[ 1]; t[ 5]=m[ 5]; t[ 6]=m[ 9]; t[ 7]=m[13];
            t[ 8]=m[ 2]; t[ 9]=m[ 6]; t[10]=m[10]; t[11]=m[14];
            t[12]=m[ 3]; t[13]=m[ 7]; t[14]=m[11]; t[15]=m[15];
            out.data.set(t);
            return out;
        }

        static dot(a, b) {
            const ka = EzMath.kindOf(a), kb = EzMath.kindOf(b);
            if (!ka || !kb || ka !== kb) return NaN;
            if (ka === KIND_SCALAR) return a * b;
            if (ka !== KIND_VEC2 && ka !== KIND_VEC3 && ka !== KIND_VEC4 && ka !== KIND_QUAT) return NaN;
            const ad = a.data, bd = b.data;
            let s = 0;
            for (let i = 0; i < ad.length; i++) s += ad[i]*bd[i];
            return s;
        }

        static lengthSq(a) {
            const k = EzMath.kindOf(a);
            if (!k) return NaN;
            if (k === KIND_SCALAR) return a*a;
            const d = a.data;
            let s = 0;
            for (let i = 0; i < d.length; i++) s += d[i]*d[i];
            return s;
        }

        static length(a) {
            return Math.sqrt(EzMath.lengthSq(a));
        }

        static cross(out, a, b) {
            if (!out || !a || !b) return null;
            if (out.kind !== KIND_VEC3 || a.kind !== KIND_VEC3 || b.kind !== KIND_VEC3) return null;
            const ad = a.data, bd = b.data;
            const ax=ad[0], ay=ad[1], az=ad[2];
            const bx=bd[0], by=bd[1], bz=bd[2];
            const od = out.data;
            od[0] = ay*bz - az*by;
            od[1] = az*bx - ax*bz;
            od[2] = ax*by - ay*bx;
            return out;
        }

        static lerp(out, a, b, t) {
            if (!out || !a || !b) return null;
            if (out.kind !== a.kind || a.kind !== b.kind) return null;
            const ad = a.data, bd = b.data, od = out.data;
            if (od.length !== ad.length || ad.length !== bd.length) return null;
            for (let i = 0; i < od.length; i++) od[i] = ad[i] + (bd[i] - ad[i]) * t;
            return out;
        }

        static slerp(out, a, b, t) {
            if (!out || !a || !b) return null;
            if (out.kind !== KIND_QUAT || a.kind !== KIND_QUAT || b.kind !== KIND_QUAT) return null;
            const ad = a.data, bd = b.data, od = out.data;
            let ax=ad[0], ay=ad[1], az=ad[2], aw=ad[3];
            let bx=bd[0], by=bd[1], bz=bd[2], bw=bd[3];
            let dot = ax*bx + ay*by + az*bz + aw*bw;
            if (dot < 0) { bx=-bx; by=-by; bz=-bz; bw=-bw; dot=-dot; }
            if (dot > 0.9995) {
                const x = ax + t*(bx-ax), y = ay + t*(by-ay), z = az + t*(bz-az), w = aw + t*(bw-aw);
                const inv = 1 / (Math.hypot(x,y,z,w) || 1);
                od[0]=x*inv; od[1]=y*inv; od[2]=z*inv; od[3]=w*inv;
                return out;
            }
            const th0 = Math.acos(dot), th = th0 * t;
            const sinTh0 = Math.sin(th0);
            const s0 = Math.cos(th) - dot * Math.sin(th) / sinTh0;
            const s1 = Math.sin(th) / sinTh0;
            od[0] = s0*ax + s1*bx;
            od[1] = s0*ay + s1*by;
            od[2] = s0*az + s1*bz;
            od[3] = s0*aw + s1*bw;
            return out;
        }

        static fromAxisAngle(outQuat, axis, angle) {
            if (!outQuat || outQuat.kind !== KIND_QUAT) return null;
            if (!axis    || axis.kind    !== KIND_VEC3) return null;
            if (typeof angle !== 'number') return null;
            const ad = axis.data;
            const lx=ad[0], ly=ad[1], lz=ad[2];
            const len = Math.hypot(lx, ly, lz) || 1;
            const half = angle * 0.5;
            const s = Math.sin(half) / len;
            const od = outQuat.data;
            od[0] = lx*s; od[1] = ly*s; od[2] = lz*s; od[3] = Math.cos(half);
            return outQuat;
        }

        // outQuat from intrinsic ZYX Euler (radians). `euler` is a Vec3 (x, y, z).
        static fromEulerZYX(outQuat, euler) {
            if (!outQuat || outQuat.kind !== KIND_QUAT) return null;
            if (!euler   || euler.kind   !== KIND_VEC3) return null;
            const e = euler.data;
            const cx = Math.cos(e[0]*0.5), sx = Math.sin(e[0]*0.5);
            const cy = Math.cos(e[1]*0.5), sy = Math.sin(e[1]*0.5);
            const cz = Math.cos(e[2]*0.5), sz = Math.sin(e[2]*0.5);
            const od = outQuat.data;
            od[0] = sx*cy*cz - cx*sy*sz;
            od[1] = cx*sy*cz + sx*cy*sz;
            od[2] = cx*cy*sz - sx*sy*cz;
            od[3] = cx*cy*cz + sx*sy*sz;
            return outQuat;
        }

        // outVec3 = (yaw, pitch, roll) in degrees, decoded from a quaternion.
        static toEulerYPR(outVec3, q) {
            if (!outVec3 || outVec3.kind !== KIND_VEC3) return null;
            if (!q       || q.kind       !== KIND_QUAT) return null;
            const r2d = 180 / Math.PI;
            const x=q.data[0], y=q.data[1], z=q.data[2], w=q.data[3];
            const sp = 2 * (w*x - y*z);
            let pitch, yaw, roll;
            if (Math.abs(sp) >= 0.999999) {
                pitch = Math.sign(sp) * 90;
                yaw   = Math.atan2(-2*(x*y - w*z), 1 - 2*(y*y + z*z)) * r2d;
                roll  = 0;
            } else {
                pitch = Math.asin(sp) * r2d;
                yaw   = Math.atan2(2*(x*z + w*y), 1 - 2*(x*x + y*y)) * r2d;
                roll  = -Math.atan2(2*(x*y + w*z), 1 - 2*(x*x + z*z)) * r2d;
            }
            const od = outVec3.data;
            od[0] = yaw; od[1] = pitch; od[2] = roll;
            return outVec3;
        }

        // outMat4 = T(pos) * R(rot) * S(scl) - column-major.
        static compose(outMat4, pos, rot, scl) {
            if (!outMat4 || outMat4.kind !== KIND_MAT4) return null;
            if (!pos     || pos.kind     !== KIND_VEC3) return null;
            if (!rot     || rot.kind     !== KIND_QUAT) return null;
            if (!scl     || scl.kind     !== KIND_VEC3) return null;
            const p = pos.data, r = rot.data, s = scl.data, o = outMat4.data;
            const qx=r[0], qy=r[1], qz=r[2], qw=r[3];
            const sx=s[0], sy=s[1], sz=s[2];
            const x2=qx+qx, y2=qy+qy, z2=qz+qz;
            const xx=qx*x2, xy=qx*y2, xz=qx*z2;
            const yy=qy*y2, yz=qy*z2, zz=qz*z2;
            const wx=qw*x2, wy=qw*y2, wz=qw*z2;
            o[ 0] = (1-(yy+zz))*sx; o[ 1] = (xy+wz)*sx;     o[ 2] = (xz-wy)*sx;     o[ 3] = 0;
            o[ 4] = (xy-wz)*sy;     o[ 5] = (1-(xx+zz))*sy; o[ 6] = (yz+wx)*sy;     o[ 7] = 0;
            o[ 8] = (xz+wy)*sz;     o[ 9] = (yz-wx)*sz;     o[10] = (1-(xx+yy))*sz; o[11] = 0;
            o[12] = p[0];           o[13] = p[1];           o[14] = p[2];           o[15] = 1;
            return outMat4;
        }

        static lookAt(outMat4, eye, target, up) {
            if (!outMat4 || outMat4.kind !== KIND_MAT4) return null;
            if (!eye    || eye.kind    !== KIND_VEC3) return null;
            if (!target || target.kind !== KIND_VEC3) return null;
            if (!up     || up.kind     !== KIND_VEC3) return null;
            const ed=eye.data, td=target.data, ud=up.data;
            const px=ed[0], py=ed[1], pz=ed[2];
            let fx=td[0]-px, fy=td[1]-py, fz=td[2]-pz;
            const fl = Math.hypot(fx, fy, fz) || 1;
            fx/=fl; fy/=fl; fz/=fl;
            const ux=ud[0], uy=ud[1], uz=ud[2];
            let rx=fy*uz - fz*uy, ry=fz*ux - fx*uz, rz=fx*uy - fy*ux;
            const rl = Math.hypot(rx, ry, rz) || 1;
            rx/=rl; ry/=rl; rz/=rl;
            const Ux=ry*fz - rz*fy, Uy=rz*fx - rx*fz, Uz=rx*fy - ry*fx;
            const o = outMat4.data;
            o[ 0]=rx;                    o[ 1]=Ux;                    o[ 2]=-fx;                  o[ 3]=0;
            o[ 4]=ry;                    o[ 5]=Uy;                    o[ 6]=-fy;                  o[ 7]=0;
            o[ 8]=rz;                    o[ 9]=Uz;                    o[10]=-fz;                  o[11]=0;
            o[12]=-(rx*px+ry*py+rz*pz);  o[13]=-(Ux*px+Uy*py+Uz*pz);  o[14]=fx*px+fy*py+fz*pz;    o[15]=1;
            return outMat4;
        }

        static perspective(outMat4, fovY, aspect, near, far) {
            if (!outMat4 || outMat4.kind !== KIND_MAT4) return null;
            const f = 1.0 / Math.tan(fovY/2), nf = 1/(near-far), o = outMat4.data;
            o[ 0]=f/aspect; o[ 1]=0; o[ 2]=0;             o[ 3]=0;
            o[ 4]=0;        o[ 5]=f; o[ 6]=0;             o[ 7]=0;
            o[ 8]=0;        o[ 9]=0; o[10]=(far+near)*nf; o[11]=-1;
            o[12]=0;        o[13]=0; o[14]=2*far*near*nf; o[15]=0;
            return outMat4;
        }

        static ortho(outMat4, left, right, bottom, top, near, far) {
            if (!outMat4 || outMat4.kind !== KIND_MAT4) return null;
            const lr = 1/(left-right), bt = 1/(bottom-top), nf = 1/(near-far), o = outMat4.data;
            o[ 0]=-2*lr;             o[ 1]=0;                 o[ 2]=0;             o[ 3]=0;
            o[ 4]=0;                 o[ 5]=-2*bt;             o[ 6]=0;             o[ 7]=0;
            o[ 8]=0;                 o[ 9]=0;                 o[10]=2*nf;          o[11]=0;
            o[12]=(left+right)*lr;   o[13]=(top+bottom)*bt;   o[14]=(far+near)*nf; o[15]=1;
            return outMat4;
        }

        // outQuat from yaw/pitch/roll in degrees (extrinsic Y-up * X-right * (-Z) order).
        static fromEulerYPR(outQuat, yawDeg, pitchDeg, rollDeg) {
            if (!outQuat || outQuat.kind !== KIND_QUAT) return null;
            const d2r = Math.PI / 180;
            const hy = yawDeg   * d2r * 0.5;
            const hp = pitchDeg * d2r * 0.5;
            const hr = (rollDeg || 0) * d2r * 0.5;
            // qY = (0, sin(hy), 0, cos(hy));  qP = (sin(hp), 0, 0, cos(hp));  qR = (0, 0, -sin(hr), cos(hr))
            const sy = Math.sin(hy), cy = Math.cos(hy);
            const sp = Math.sin(hp), cp = Math.cos(hp);
            // qYP = qY * qP
            let qx = cy*sp, qy = sy*cp, qz = -sy*sp, qw = cy*cp;
            if (rollDeg) {
                const sr = Math.sin(hr), cr = Math.cos(hr);
                // qR = (0, 0, -sr, cr); apply on the right: q = qYP * qR
                const rx =  qx*cr + qy*(-sr);
                const ry =  qy*cr - qx*(-sr);
                const rz =  qz*cr + qw*(-sr);
                const rw =  qw*cr - qz*(-sr);
                qx = rx; qy = ry; qz = rz; qw = rw;
            }
            // normalize (cheap; mul of unit quats is unit, but be safe)
            const inv = 1 / (Math.hypot(qx, qy, qz, qw) || 1);
            const od = outQuat.data;
            od[0] = qx*inv; od[1] = qy*inv; od[2] = qz*inv; od[3] = qw*inv;
            return outQuat;
        }

        // outVec3 = upper-3x3(M) * V  (direction transform: no translation, no /w).
        static mulDir(outVec3, M, V) {
            if (!outVec3 || outVec3.kind !== KIND_VEC3) return null;
            if (!M || M.kind !== KIND_MAT4) return null;
            if (!V || V.kind !== KIND_VEC3) return null;
            const m = M.data, v = V.data;
            const x=v[0], y=v[1], z=v[2];
            const tx = m[0]*x + m[4]*y + m[ 8]*z;
            const ty = m[1]*x + m[5]*y + m[ 9]*z;
            const tz = m[2]*x + m[6]*y + m[10]*z;
            const od = outVec3.data;
            od[0] = tx; od[1] = ty; od[2] = tz;
            return outVec3;
        }

        // Resolves a transform spec into outMat4. spec accepts:
        //   * a Mat4 (copied)
        //   * { position?: Vec3, rotation?: Quat, euler?: Vec3, scale?: Vec3 } (composed)
        //   * null/undefined → fallback (Mat4) is copied if provided, else identity.
        // The optional `fallback` Mat4 also seeds the position component when
        // spec is an object without `position` (so existing translation is kept).
        static resolveTransform(outMat4, spec, fallback = null) {
            if (!outMat4 || outMat4.kind !== KIND_MAT4) return null;
            if (spec && spec.kind === KIND_MAT4) {
                outMat4.data.set(spec.data);
                return outMat4;
            }
            if (spec && typeof spec === 'object') {
                const pos = EzMath.#_pos, scl = EzMath.#_scl, rot = EzMath.#_rot;
                if (spec.position && spec.position.kind === KIND_VEC3) pos.copy(spec.position);
                else if (fallback && fallback.kind === KIND_MAT4) {
                    const f = fallback.data; pos.data[0]=f[12]; pos.data[1]=f[13]; pos.data[2]=f[14];
                } else { pos.data[0]=0; pos.data[1]=0; pos.data[2]=0; }

                if (spec.scale && spec.scale.kind === KIND_VEC3) scl.copy(spec.scale);
                else { scl.data[0]=1; scl.data[1]=1; scl.data[2]=1; }

                if (spec.rotation && spec.rotation.kind === KIND_QUAT) rot.copy(spec.rotation);
                else if (spec.euler && spec.euler.kind === KIND_VEC3) EzMath.fromEulerZYX(rot, spec.euler);
                else rot.identity();

                return EzMath.compose(outMat4, pos, rot, scl);
            }
            if (fallback && fallback.kind === KIND_MAT4) {
                outMat4.data.set(fallback.data);
                return outMat4;
            }
            outMat4.identity();
            return outMat4;
        }

    }

    const TAGRENDER = "[EzRender]";
    class EzRender {
        static bind(gl, program, onbind=null) {
            gl.useProgram(program);
            if (onbind) onbind(gl, program);
        }

        static applyState(gl, cfg) {
            if (!cfg) return;
            const hasProp = (prop) => Object.prototype.hasOwnProperty.call(cfg, prop);

            // if (Object.prototype.hasOwnProperty.call(cfg, 'depthWrite')) {
            if (hasProp('depthWrite')) gl.depthMask(!!cfg.depthWrite);
            if (hasProp('depthTest')) {
                cfg.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
            }
            if (hasProp('blend')) {
                cfg.blend ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);

                if (cfg.blend && (hasProp('blendSrc') || hasProp('blendDst'))) {
                    gl.blendFunc(cfg.blendSrc ?? gl.SRC_ALPHA, cfg.blendDst ?? gl.ONE_MINUS_SRC_ALPHA);
                }
            }
            if (hasProp('cull')) {
                switch (cfg.cull) {
                    case 'none':  gl.disable(gl.CULL_FACE); break;
                    case 'front': gl.enable(gl.CULL_FACE);  gl.cullFace(gl.FRONT); break;
                    default:      gl.enable(gl.CULL_FACE);  gl.cullFace(gl.BACK);  break;
                }
            }
            if (hasProp('clear') && cfg.clear) {
                const list = Array.isArray(cfg.clear) ? cfg.clear : [cfg.clear];
                let mask = 0;
                for (const k of list) {
                    switch (k) {
                        case 'color':   mask |= gl.COLOR_BUFFER_BIT; break;
                        case 'depth':   mask |= gl.DEPTH_BUFFER_BIT; break;
                        case 'stencil': mask |= gl.STENCIL_BUFFER_BIT; break;
                    }
                }
                if (mask) gl.clear(mask);
            }
        }

        static restoreDefaultState(gl) {
            gl.depthMask(true);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        static withVAO(gl, vao, fn) {
            gl.bindVertexArray(vao);
            try { fn(); }
            finally { gl.bindVertexArray(null); }
        }


        static uploadVBO(gl, vbo, data, usage) {
            const need = data.byteLength;
            const cap  = vbo._ezCapacity | 0;
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            if (need > 0 && need <= cap) {
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
            } else {
                const grow   = Math.ceil(cap * 1.5);
                const newCap = Math.max(need, grow);
                gl.bufferData(gl.ARRAY_BUFFER, newCap, usage ?? gl.DYNAMIC_DRAW);
                if (need > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
                vbo._ezCapacity = newCap;
            }
        }

        static setConstAttrs(gl, list) {
            for (const a of list) {
                const v = a.value ?? a.default ?? [0,0,0,0];
                gl.vertexAttrib4f(a.loc, v[0]??0, v[1]??0, v[2]??0, v[3]??0);
            }
        }

        static wireAttr(gl, { buffer, loc, size, type, normalized, stride, offset, divisor, enabled }) {
            if (loc == null || loc === -1) return;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            if (enabled !== false) gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, type ?? gl.FLOAT, !!normalized, stride ?? 0, offset ?? 0);
            if (divisor) gl.vertexAttribDivisor(loc, divisor);
        }

        static #UNI = {
            mat4:  (gl, loc, v) => gl.uniformMatrix4fv(loc, false, v),
            mat3:  (gl, loc, v) => gl.uniformMatrix3fv(loc, false, v),
            vec4:  (gl, loc, v) => gl.uniform4fv(loc, v),
            vec3:  (gl, loc, v) => gl.uniform3fv(loc, v),
            vec2:  (gl, loc, v) => gl.uniform2fv(loc, v),
            float: (gl, loc, v) => gl.uniform1f(loc, v),
            int:   (gl, loc, v) => gl.uniform1i(loc, v),
            bool:  (gl, loc, v) => gl.uniform1i(loc, v ? 1 : 0),
        };

        static getUniformLocation(gl, program, name) {
            if (!program || !name) return null;
            if (!program._ezUniformLocCache) program._ezUniformLocCache = new Map();
            const cache = program._ezUniformLocCache;
            if (cache.has(name)) return cache.get(name);
            const loc = gl.getUniformLocation(program, name);
            cache.set(name, loc);
            return loc;
        }

        static setUniform(gl, program, type, nameOrLoc, value) {
            const setter = EzRender.#UNI[type];
            if (!setter) return null;
            const isName = typeof nameOrLoc === 'string' 
            const loc = isName ? EzRender.getUniformLocation(gl, program, nameOrLoc) : nameOrLoc;
            if (loc == null) return null;
            setter(gl, loc, value);
            return loc;
        }

        static setUniforms(gl, program, list) {
            for (const u of list) {
                const key = (u.loc !== undefined) ? u.loc : u.name;
                EzRender.setUniform(gl, program, u.type, key, u.value);
            }
        }

        static bindSampler(gl, loc, unit, tex, target) {
            if (loc == null) return;
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(target ?? gl.TEXTURE_2D, tex);
            gl.uniform1i(loc, unit);
        }

        static createTexture(gl, {
            data, width = 1, height = 1,
            format = gl.RGBA, internalFormat = format, type = gl.UNSIGNED_BYTE,
            wrapS = gl.CLAMP_TO_EDGE, wrapT = gl.CLAMP_TO_EDGE,
            minFilter = gl.LINEAR, magFilter = gl.LINEAR,
            mipmap = false, flipY = false, premultiplyAlpha = false,
        }) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha);

            const isImageSrc = data instanceof ImageBitmap || data instanceof HTMLImageElement || data instanceof HTMLCanvasElement;
            if (isImageSrc) gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, format, type, data);
            else            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

            if (mipmap && _is.POT(width) && _is.POT(height)) {
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
            }

            gl.bindTexture(gl.TEXTURE_2D, null);
            return tex;
        }

        static uploadTexture2D(gl, existing, internalFmt, fmt, type, w, h, data, unit = null) {
            const tex = existing ?? gl.createTexture();
            const explicit = unit != null;
            const prevActive = explicit ? 0 : gl.getParameter(gl.ACTIVE_TEXTURE);
            gl.activeTexture(gl.TEXTURE0 + (explicit ? unit : EzRender.SCRATCH_TEX_UNIT));
            gl.bindTexture(gl.TEXTURE_2D, tex);
            if (!existing) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, data);
            if (!explicit) gl.activeTexture(prevActive);
            return tex;
        }
        static SCRATCH_TEX_UNIT = 15;


        static drawInstanced(gl, drawCfg, instanceCount) {
            const mode = drawCfg.mode ?? gl.TRIANGLES;
            if (drawCfg.indexed) {
                gl.drawElementsInstanced(mode, drawCfg.indexCount, drawCfg.indexType, drawCfg.indexOffset, instanceCount);
            } else {
                gl.drawArraysInstanced(mode, drawCfg.vertexOffset, drawCfg.vertexCount, instanceCount);
            }
        }


        static packInstanceRow(arr, offFloats, data, layout) {
            for (const e of layout.entries) {
                const src = data[e.name];
                if (src) arr.set(src, offFloats + (e.byteOffset >> 2));
            }
        }

        static packInstances(dataArray, layout) {
            const stride = layout.strideFloats;
            if (stride === 0) return null;
            const flat = new Float32Array(dataArray.length * stride);
            for (let i = 0; i < dataArray.length; i++)
                EzRender.packInstanceRow(flat, i * stride, dataArray[i], layout);
            return flat;
        }
    }

    class EzShader {
        program   = null;
        renderCfg = null;
        onbind    = null; // (gl, program) => void
        other     = {};   // free bag for metadata / subclass use

        compiled = false;

        static BLEND = {
            ZERO:                     0,
            ONE:                      1,
            SRC_ALPHA:                0x0302,
            ONE_MINUS_SRC_ALPHA:      0x0303,
            DST_ALPHA:                0x0304,
            ONE_MINUS_DST_ALPHA:      0x0305,
            SRC_COLOR:                0x0300,
            ONE_MINUS_SRC_COLOR:      0x0301,
            DST_COLOR:                0x0306,
            ONE_MINUS_DST_COLOR:      0x0307,
            CONSTANT_COLOR:           0x8001,
            ONE_MINUS_CONSTANT_COLOR: 0x8002,
            CONSTANT_ALPHA:           0x8003,
            ONE_MINUS_CONSTANT_ALPHA: 0x8004,
            SRC_ALPHA_SATURATE:       0x0308,
        };

        compile(vertSrc, fragSrc, gl) {
            this.program = EzShader.createProgram(gl, vertSrc, fragSrc);
            if (!this.program) throw new Error("[EzShader] GL program compilation failed");
            this.compiled = true;
            return this;
        }

        bind(gl) {
            EzRender.bind(gl, this.program, this.onbind);
            return this;
        }

        applyRenderState(gl) { EzRender.applyState(gl, this.renderCfg); return this; }
        static restoreRenderState(gl) { EzRender.restoreDefaultState(gl); }

        static compileShader(gl, type, src) {
            const shader = gl.createShader(type);

            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                _c.err("[EzShader]", "shader compile error:", gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        static createProgram(gl, vertSrc, fragSrc) {
            const vshader = this.compileShader(gl, gl.VERTEX_SHADER,   vertSrc);
            const fshader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

            if (!vshader || !fshader) return null;

            const program = gl.createProgram();
            gl.attachShader(program, vshader);
            gl.attachShader(program, fshader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                _c.err("[EzShader]", "program link error:", gl.getProgramInfoLog(program));
                return null;
            }

            gl.deleteShader(vshader);
            gl.deleteShader(fshader);
            return program;
        }
    }

    const TAGC3D = "[EzCanvas3D]";
    class EzCanvas3D {
        name    = null;
        #canvas = null;
        #gl     = null;

        get canvas() { return this.#canvas; }
        get gl()     { return this.#gl; }

        #logicalWidth  = 800;
        #logicalHeight = 600;
        #pixelRatio    = 1;
        #maxPixelRatio = 2;
        #msaaEnabled   = false;

        get info() {
            return {
                width:         this.#canvas.width,
                height:        this.#canvas.height,
                logicalWidth:  this.#logicalWidth,
                logicalHeight: this.#logicalHeight,
                aspectRatio:   this.#logicalWidth / Math.max(1e-6, this.#logicalHeight),
                pixelRatio:    this.#pixelRatio,
            };
        }

        setPixelRatio(ratio) {
            this.#pixelRatio = this.#clampPixelRatio(ratio);
            this.#applyViewportSize();
            return this.#pixelRatio;
        }

        aaInfo() {
            return {
                mode:          "msaa+ssaa",
                msaa:          this.#msaaEnabled,
                pixelRatio:    this.#pixelRatio,
                maxPixelRatio: this.#maxPixelRatio,
            };
        }

        fitContainer() {
            const parent = this.#canvas.parentElement;
            if (!parent) return this;
            const rect = parent.getBoundingClientRect();
            return this.resize(rect.width, rect.height);
        }

        constructor(name, opts = {}) {
            this.name = name || "canvas";
            const c = document.createElement("canvas");
            c.width  = 800;
            c.height = 600;
            c.style.background = "transparent";
            this.#canvas = c;

            const antialias = typeof opts.antialias === "boolean" ? opts.antialias : true;
            const gl = c.getContext("webgl2", { alpha: true, antialias });
            if (!gl) throw new Error(`${TAGC3D} WebGL2 not supported`);
            this.#gl = gl;

            this.#maxPixelRatio = (typeof opts.maxPixelRatio === "number" && Number.isFinite(opts.maxPixelRatio))
                ? Math.max(1, opts.maxPixelRatio)
                : 2;
            const initialPR = opts.pixelRatio ?? (typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1);
            this.#pixelRatio = this.#clampPixelRatio(initialPR);
            this.#msaaEnabled = !!gl.getContextAttributes()?.antialias;

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clearColor(0, 0, 0, 0);

            this.#applyViewportSize();
        }

        #clampPixelRatio(v) {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return 1;
            return EzMath.clamp(n, 0.5, this.#maxPixelRatio);
        }

        #applyViewportSize() {
            const drawW = Math.max(1, Math.round(this.#logicalWidth  * this.#pixelRatio));
            const drawH = Math.max(1, Math.round(this.#logicalHeight * this.#pixelRatio));

            this.#canvas.style.width  = `${this.#logicalWidth}px`;
            this.#canvas.style.height = `${this.#logicalHeight}px`;

            if (this.#canvas.width  !== drawW) this.#canvas.width  = drawW;
            if (this.#canvas.height !== drawH) this.#canvas.height = drawH;

            this.#gl.viewport(0, 0, drawW, drawH);
        }

        mount(el) {
            if (el instanceof Element) el.appendChild(this.#canvas);
            return this;
        }
        unmount() {
            this.#canvas.parentElement?.removeChild(this.#canvas);
            return this;
        }
        resize(w, h) {
            this.#logicalWidth  = Math.max(1, Math.round(w));
            this.#logicalHeight = Math.max(1, Math.round(h));
            this.#applyViewportSize();
            return this;
        }

        resetViewport() {
            this.#gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
            return this;
        }
    }

    window.Vec2            = Vec2;
    window.Vec3            = Vec3;
    window.Vec4            = Vec4;
    window.Quat            = Quat;
    window.Mat4            = Mat4;
    window.EzMath          = EzMath;

    window.EzShader        = EzShader;
    window.EzRender        = EzRender;
    window.EzCanvas3D      = EzCanvas3D;

// Every thing below this line is highly specialized for 3D-object-driven rendering
// --------------------------------------------------------------------------------

    const _EZ_TEX_UNIT_MORPH_DELTA  = 3; // N channels occupy 3, 4, 5, ...
    class EzShader3D extends EzShader {
        attributes     = [];   // [{ name, size, loc, default }]
        uloc           = {};   // { view, projection, fill, albedo, bonesTex, morph:{...} }
        instanceLayout = null; // { strideFloats, entries:[{ name, type, floats, slots, loc, default }] }
        uniKeyTexUnits = [];   // [[name, unit], ...] for sampler uniKeys
        texUnits       = {};   // { [name]: unit }
        _morphChannels = [];   // morph channel names

        #descript = null;
        get described() { return this.#descript !== null; }

        static EZ = {
            BONES_TEX: "ez_bonesTex",
            MORPH: {
                WTEX:    "ez_morphWeightTex",
                COUNT:   "ez_morphCount",
                WOFFSET: "ez_morphWeightOffset",
                VBASE:   "ez_morphVertexBase",
                DELTA:   (i) => `ez_morphDelta_${i}`,
            }
        };

        static #GLSL_VEC = { 1: "float", 2: "vec2", 3: "vec3", 4: "vec4" };

        static #DEFAULT_KEY_VERT = {
            view:       n => `uniform mat4 ${n};`,
            projection: n => `uniform mat4 ${n};`,
        };
        static #DEFAULT_KEY_FRAG = {
            fill:   n => `uniform vec4 ${n};`,
            albedo: n => `uniform sampler2D ${n};`,
        };

        static #INSTANCE_TYPE_SPEC = {
            float: { glsl: "float", floats: 1,  slots: 1 },
            vec2:  { glsl: "vec2",  floats: 2,  slots: 1 },
            vec3:  { glsl: "vec3",  floats: 3,  slots: 1 },
            vec4:  { glsl: "vec4",  floats: 4,  slots: 1 },
            mat4:  { glsl: "mat4",  floats: 16, slots: 4 },
        };

        static #buildInstanceLayout(decls) {
            const entries = [], seenNames = new Set();
            let nextSlot = 0, off = 0;
            for (const d of decls) {
                if (!_is.str(d.name))
                    throw new Error(`${TAGC3D} instanceData entry needs name`);
                if (seenNames.has(d.name))
                    throw new Error(`${TAGC3D} instanceData duplicate name "${d.name}"`);
                const type = d.type ?? "vec4";
                const spec = EzShader3D.#INSTANCE_TYPE_SPEC[type];
                if (!spec) throw new Error(`${TAGC3D} instanceData "${d.name}": unknown type "${type}"`);
                seenNames.add(d.name);

                let def;
                if (d.default != null) {
                    if (!d.default.length || d.default.length !== spec.floats)
                        throw new Error(`${TAGC3D} instanceData "${d.name}": default length must be ${spec.floats}`);
                    def = Float32Array.from(d.default);
                } else def = type === "mat4"
                    ? new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
                    : new Float32Array(spec.floats);

                entries.push({
                    name: d.name, type, glsl: spec.glsl,
                    floats: spec.floats, slots: spec.slots,
                    locOffset: nextSlot, byteOffset: off, default: def,
                });
                nextSlot += spec.slots;
                off      += spec.floats * 4;
            }
            return { entries, strideBytes: off, strideFloats: off / 4, slotCount: nextSlot };
        }

        static #buildVertexHelpers(hasSkeleton, morphChannels) {
            const EZ  = EzShader3D.EZ;
            const out = [];
            if (hasSkeleton) {
                out.push(
                `mat4 fetchBone(int i) {
                    return mat4(
                        texelFetch(${EZ.BONES_TEX}, ivec2(0, i), 0),
                        texelFetch(${EZ.BONES_TEX}, ivec2(1, i), 0),
                        texelFetch(${EZ.BONES_TEX}, ivec2(2, i), 0),
                        texelFetch(${EZ.BONES_TEX}, ivec2(3, i), 0)
                    );
                }
                mat4 computeSkin(vec4 boneID, vec4 boneWeight) {
                    float wsum = boneWeight.x + boneWeight.y + boneWeight.z + boneWeight.w;
                    if (wsum < 0.0001) return mat4(1.0);
                    return boneWeight.x * fetchBone(int(boneID.x))
                        + boneWeight.y * fetchBone(int(boneID.y))
                        + boneWeight.z * fetchBone(int(boneID.z))
                        + boneWeight.w * fetchBone(int(boneID.w));
                }`);
            }
            if (morphChannels.length > 0) {
                const fetchLines = morphChannels.map((_, i) => {
                    const pre = i === 0 ? "        if" : "        else if";
                    return `${pre} (channelIdx == ${i}) d += w * texelFetch(${EZ.MORPH.DELTA(i)}, ivec2(t, vertexLocal), 0).xyz;`;
                });
                out.push(
                `int morphVertexLocal() { return gl_VertexID - ${EZ.MORPH.VBASE}; }
                float morphWeight(int targetIdx) {
                    return texelFetch(${EZ.MORPH.WTEX},
                                    ivec2(${EZ.MORPH.WOFFSET} + targetIdx, gl_InstanceID), 0).r;
                }
                vec3 applyMorph(int channelIdx, int vertexLocal) {
                    vec3 d = vec3(0.0);
                    for (int t = 0; t < ${EZ.MORPH.COUNT}; t++) {
                        float w = morphWeight(t);
                        if (w == 0.0) continue;
                ${fetchLines.join("\n")}
                    }
                    return d;
                }`);
            }
            return out.join("\n");
        }

        describe({ vertex = {}, fragment = {}, uniKeys = [], onbind = null, renderCfg = {} } = {}) {
            const arrOf     = v => Array.isArray(v) ? v : [];
            const vAttrs    = arrOf(vertex.attributes);
            const vInst     = arrOf(vertex.instanceData);
            const vOuts     = arrOf(vertex.outputs);
            const morphChs  = Array.isArray(vertex.morphChannels) ? vertex.morphChannels.slice() : [];
            const vMain     = String(vertex.main ?? "");
            const fMain     = String(fragment.main ?? "");
            const vDK       = _is.obj(vertex.defaultKeys)   ? vertex.defaultKeys   : {};
            const fDK       = _is.obj(fragment.defaultKeys) ? fragment.defaultKeys : {};
            const hasSkel   = !!vertex.hasSkeleton;
            const fOutColor = String(fragment.outputColor ?? "fragColor");

            for (const k of Object.keys(vDK))
                if (!EzShader3D.#DEFAULT_KEY_VERT[k])
                    throw new Error(`${TAGC3D} addShader: unknown vertex.defaultKeys key "${k}"`);
            for (const k of Object.keys(fDK))
                if (!EzShader3D.#DEFAULT_KEY_FRAG[k])
                    throw new Error(`${TAGC3D} addShader: unknown fragment.defaultKeys key "${k}"`);

            if (!Array.isArray(uniKeys))
                throw new Error(`${TAGC3D} addShader: uniKeys must be an array`);
            for (const u of uniKeys) {
                if (!_is.str(u.name)) throw new Error(`${TAGC3D} addShader: uniKey entry missing name`);
                if (!_is.str(u.type)) throw new Error(`${TAGC3D} addShader: uniKey "${u.name}" missing type`);
            }

            let nextSamplerUnit = _EZ_TEX_UNIT_MORPH_DELTA + morphChs.length;
            const uniKeyTexUnits = new Map();
            for (const u of uniKeys)
                if (_is.sampler(u.type)) uniKeyTexUnits.set(u.name, nextSamplerUnit++);

            const instLayout = EzShader3D.#buildInstanceLayout(vInst);

            const seen = new Set();
            const claim = (n, where) => {
                if (!_is.str(n)) throw new Error(`${TAGC3D} addShader: empty/non-string name in ${where}`);
                if (seen.has(n)) throw new Error(`${TAGC3D} addShader: name collision "${n}" in ${where}`);
                seen.add(n);
            };
            for (const a of vAttrs) {
                if (!EzShader3D.#GLSL_VEC[a.size])
                    throw new Error(`${TAGC3D} addShader: vertex attribute "${a.name}" size must be 1..4`);
                claim(a.name, "vertex.attributes");
            }
            for (const e of instLayout.entries) claim(e.name, `vertex.instanceData[${e.name}]`);
            for (const [k, v] of Object.entries(vDK)) claim(v, `vertex.defaultKeys.${k}`);
            for (const o of vOuts) claim(o.name, "vertex.outputs");
            for (const [k, v] of Object.entries(fDK)) claim(v, `fragment.defaultKeys.${k}`);
            for (const u of uniKeys) claim(u.name, `uniKeys["${u.name}"]`);
            claim(fOutColor, "fragment.outputColor");

            let next = 0;
            const instStartLoc = next + vAttrs.length;
            const v = ["#version 300 es", "precision highp float;"];
            for (const a of vAttrs)
                v.push(`layout(location=${next++}) in ${EzShader3D.#GLSL_VEC[a.size]} ${a.name};`);
            for (const e of instLayout.entries)
                v.push(`layout(location=${instStartLoc + e.locOffset}) in ${e.glsl} ${e.name};`);
            for (const [k, n] of Object.entries(vDK)) v.push(EzShader3D.#DEFAULT_KEY_VERT[k](n));
            if (hasSkel) v.push(`uniform highp sampler2D ${EzShader3D.EZ.BONES_TEX};`);
            if (morphChs.length > 0) {
                v.push(`uniform highp sampler2D ${EzShader3D.EZ.MORPH.WTEX};`,
                       `uniform int ${EzShader3D.EZ.MORPH.COUNT};`,
                       `uniform int ${EzShader3D.EZ.MORPH.WOFFSET};`,
                       `uniform int ${EzShader3D.EZ.MORPH.VBASE};`);
                for (let i = 0; i < morphChs.length; i++)
                    v.push(`uniform highp sampler2D ${EzShader3D.EZ.MORPH.DELTA(i)};`);
            }
            for (const u of uniKeys) v.push(`uniform ${u.type} ${u.name};`);
            for (const o of vOuts)   v.push(`out ${o.type ?? "vec4"} ${o.name};`);
            const helpers = EzShader3D.#buildVertexHelpers(hasSkel, morphChs);
            if (helpers) v.push(helpers);
            v.push("void main() {", "#line 1", vMain, "}");

            const f = ["#version 300 es", "precision highp float;"];
            for (const o of vOuts) f.push(`in ${o.type ?? "vec4"} ${o.name};`);
            f.push(`out vec4 ${fOutColor};`);
            for (const [k, n] of Object.entries(fDK)) f.push(EzShader3D.#DEFAULT_KEY_FRAG[k](n));
            for (const u of uniKeys) f.push(`uniform ${u.type} ${u.name};`);
            f.push("void main() {", "#line 1", fMain, "}");

            const rCfg = renderCfg ?? {};
            this.#descript = {
                vertSrc:        v.join("\n"),
                fragSrc:        f.join("\n"),
                attributes:     vAttrs.map(a => ({ name: a.name, size: a.size, default: Array.isArray(a.default) ? a.default : [0,0,0,0] })),
                morphChannels:  morphChs,
                hasSkeleton:    hasSkel,
                instanceLayout: instLayout,
                uniKeyTexUnits,
                names: { view: vDK.view ?? null, projection: vDK.projection ?? null, albedo: fDK.albedo ?? null, fill: fDK.fill ?? null },
                onbind: typeof onbind === "function" ? onbind : null,
                renderCfg: {
                    rQueue:     typeof rCfg.rQueue      === "number"  ? rCfg.rQueue      : 1000,
                    depthWrite: typeof rCfg.depthWrite  === "boolean" ? rCfg.depthWrite  : true,
                    depthTest:  typeof rCfg.depthTest   === "boolean" ? rCfg.depthTest   : true,
                    cull:       ['back','front','none'].includes(rCfg.cull) ? rCfg.cull : 'back',
                    blend:      typeof rCfg.blend       === "boolean" ? rCfg.blend       : false,
                    blendSrc:   rCfg.blendSrc ?? EzShader.BLEND.SRC_ALPHA,
                    blendDst:   rCfg.blendDst ?? EzShader.BLEND.ONE_MINUS_SRC_ALPHA,
                },
            };

            super.compiled = false;
            return this;
        }

        compile(gl) {
            if (!this.#descript) throw new Error("[EzShader3D] compile() called before describe()");
            const d  = this.#descript;
            const EZ = EzShader3D.EZ;

            super.compile(d.vertSrc, d.fragSrc, gl);

            const loc = n => n ? gl.getUniformLocation(this.program, n) : null;

            this.attributes = d.attributes.map(a => ({
                ...a,
                default: [a.default[0]??0, a.default[1]??0, a.default[2]??0, a.default[3]??0],
                loc: gl.getAttribLocation(this.program, a.name),
            }));

            this.instanceLayout = {
                ...d.instanceLayout,
                entries: d.instanceLayout.entries.map(e => ({ ...e, loc: gl.getAttribLocation(this.program, e.name) })),
            };

            const N = d.names;
            this.uloc = {
                view:       loc(N.view),
                projection: loc(N.projection),
                albedo:     loc(N.albedo),
                fill:       loc(N.fill),
                bonesTex:   d.hasSkeleton ? gl.getUniformLocation(this.program, EZ.BONES_TEX) : null,
                morph: (() => {
                    if (!d.morphChannels.length) return { weightTex: null, count: null, weightOffset: null, vertexBase: null, channels: [] };
                    const mu = n => gl.getUniformLocation(this.program, n);
                    return {
                        weightTex:    mu(EZ.MORPH.WTEX),
                        count:        mu(EZ.MORPH.COUNT),
                        weightOffset: mu(EZ.MORPH.WOFFSET),
                        vertexBase:   mu(EZ.MORPH.VBASE),
                        channels: d.morphChannels.map((_, i) => ({
                            unit: _EZ_TEX_UNIT_MORPH_DELTA + i,
                            loc:  mu(EZ.MORPH.DELTA(i)),
                        })),
                    };
                })(),
            };

            this.uniKeyTexUnits = d.uniKeyTexUnits;
            this.texUnits       = Object.fromEntries(d.uniKeyTexUnits);
            this._morphChannels = d.morphChannels;
            this.renderCfg      = d.renderCfg;
            this.onbind         = d.onbind;

            super.compiled = true
            return this;
        }
    }


    // Camera3D — components-based. .position/.orientation are live Vec3/Quat
    // instances (mutate them directly or call camera.set({...})). Read-only
    // getters (.forward, .right, .up, .view, .projection, .yaw/.pitch/.roll)
    // return cached component instances refreshed on each access.
    class EzCamera3D {
        position    = new Vec3(0, 0, 3);
        orientation = new Quat();

        near = 0.1; far = 1000;
        fov  = 45;
        aspect = 1;

        orthographic = false;
        orthoSize    = 5;   // half-height of the view in world units

        // Cached outputs.
        #forward = new Vec3();
        #right   = new Vec3();
        #up      = new Vec3();
        #view    = new Mat4();
        #proj    = new Mat4();
        #ypr     = new Vec3(); // (yaw, pitch, roll) in degrees

        // Constant axis vectors (in object's local space, transformed by orientation).
        static #LOCAL_FWD   = new Vec3( 0,  0, -1);
        static #LOCAL_RIGHT = new Vec3( 1,  0,  0);
        static #LOCAL_UP    = new Vec3( 0,  1,  0);

        // Per-instance scratch (avoid per-frame alloc in rotate/lookAt/etc.).
        #scratchQ    = new Quat();
        #scratchAxis = new Vec3();
        #scratchTgt  = new Vec3();
        #scratchDir  = new Vec3();
        #scratchOff  = new Vec3();

        constructor() {}

        get forward() { return EzMath.mul(this.#forward, this.orientation, EzCamera3D.#LOCAL_FWD); }
        get right()   { return EzMath.mul(this.#right,   this.orientation, EzCamera3D.#LOCAL_RIGHT); }
        get up()      { return EzMath.mul(this.#up,      this.orientation, EzCamera3D.#LOCAL_UP); }
        get vectors() { return { forward: this.forward, right: this.right, up: this.up }; }

        get yaw()   { EzMath.toEulerYPR(this.#ypr, this.orientation); return this.#ypr.data[0]; }
        get pitch() { EzMath.toEulerYPR(this.#ypr, this.orientation); return this.#ypr.data[1]; }
        get roll()  { EzMath.toEulerYPR(this.#ypr, this.orientation); return this.#ypr.data[2]; }

        get view() {
            const f = this.forward, u = this.up, p = this.position;
            EzMath.add(this.#scratchTgt, p, f);
            EzMath.lookAt(this.#view, p, this.#scratchTgt, u);
            return this.#view;
        }

        get projection() {
            if (this.orthographic) {
                const h = this.orthoSize, w = h * this.aspect;
                EzMath.ortho(this.#proj, -w, w, -h, h, this.near, this.far);
            } else {
                EzMath.perspective(this.#proj, this.fov * (Math.PI / 180), this.aspect, this.near, this.far);
            }
            return this.#proj;
        }

        set(cfg = {}) {
            if (cfg.position != null) {
                if (cfg.position.kind === KIND_VEC3) this.position.copy(cfg.position);
                else this.position.set(cfg.position);
            }
            if (cfg.orientation != null) {
                if (cfg.orientation.kind === KIND_QUAT) this.orientation.copy(cfg.orientation);
                else this.orientation.set(cfg.orientation);
                EzMath.normalize(this.orientation, this.orientation);
            }
            if (cfg.near         != null) this.near         = cfg.near;
            if (cfg.far          != null) this.far          = cfg.far;
            if (cfg.aspect       != null) this.aspect       = cfg.aspect;
            if (cfg.fov          != null) this.fov          = cfg.fov;
            if (cfg.orthoSize    != null) this.orthoSize    = cfg.orthoSize;
            if (cfg.orthographic != null) this.orthographic = !!cfg.orthographic;
            return this;
        }

        rotate(yawDelta = 0, pitchDelta = 0, rollDelta = 0) {
            const d2r = Math.PI / 180;
            const tmpQ = this.#scratchQ, axis = this.#scratchAxis;
            if (yawDelta) {
                axis.data[0]=0; axis.data[1]=1; axis.data[2]=0;
                EzMath.fromAxisAngle(tmpQ, axis, yawDelta * d2r);
                EzMath.mul(this.orientation, tmpQ, this.orientation);
            }
            if (pitchDelta) {
                axis.data[0]=1; axis.data[1]=0; axis.data[2]=0;
                EzMath.fromAxisAngle(tmpQ, axis, pitchDelta * d2r);
                EzMath.mul(this.orientation, this.orientation, tmpQ);
            }
            if (rollDelta) {
                axis.data[0]=0; axis.data[1]=0; axis.data[2]=-1;
                EzMath.fromAxisAngle(tmpQ, axis, rollDelta * d2r);
                EzMath.mul(this.orientation, this.orientation, tmpQ);
            }
            EzMath.normalize(this.orientation, this.orientation);
            return this;
        }

        // target / up: Vec3 (or anything `Vec3.set()` accepts via the scratch path).
        lookAt(target, up = null) {
            const tgt = (target && target.kind === KIND_VEC3)
                ? target
                : this.#scratchTgt.set(target);
            const upv = up == null
                ? EzCamera3D.#LOCAL_UP
                : (up.kind === KIND_VEC3 ? up : this.#scratchAxis.set(up));

            const pd = this.position.data;
            const td = tgt.data;
            const ud = upv.data;
            let fx = td[0] - pd[0], fy = td[1] - pd[1], fz = td[2] - pd[2];
            const fl = Math.hypot(fx, fy, fz);
            if (fl < 1e-8) return this;
            fx /= fl; fy /= fl; fz /= fl;

            let rx = fy * ud[2] - fz * ud[1];
            let ry = fz * ud[0] - fx * ud[2];
            let rz = fx * ud[1] - fy * ud[0];
            let rl = Math.hypot(rx, ry, rz);
            if (rl < 1e-6) {
                const ax = 0, ay = Math.abs(fy) > 0.9 ? 0 : 1, az = Math.abs(fy) > 0.9 ? 1 : 0;
                rx = fy * az - fz * ay;
                ry = fz * ax - fx * az;
                rz = fx * ay - fy * ax;
                rl = Math.hypot(rx, ry, rz) || 1;
            }
            rx /= rl; ry /= rl; rz /= rl;
            const uxv = ry * fz - rz * fy;
            const uyv = rz * fx - rx * fz;
            const uzv = rx * fy - ry * fx;

            // Rotation matrix columns: right, up, -forward.
            const m00 = rx,  m01 = uxv, m02 = -fx;
            const m10 = ry,  m11 = uyv, m12 = -fy;
            const m20 = rz,  m21 = uzv, m22 = -fz;

            const tr = m00 + m11 + m22;
            let qx, qy, qz, qw;
            if (tr > 0) {
                const s = Math.sqrt(tr + 1) * 2;
                qw = 0.25 * s;
                qx = (m21 - m12) / s;
                qy = (m02 - m20) / s;
                qz = (m10 - m01) / s;
            } else if (m00 > m11 && m00 > m22) {
                const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
                qw = (m21 - m12) / s;
                qx = 0.25 * s;
                qy = (m01 + m10) / s;
                qz = (m02 + m20) / s;
            } else if (m11 > m22) {
                const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
                qw = (m02 - m20) / s;
                qx = (m01 + m10) / s;
                qy = 0.25 * s;
                qz = (m12 + m21) / s;
            } else {
                const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
                qw = (m10 - m01) / s;
                qx = (m02 + m20) / s;
                qy = (m12 + m21) / s;
                qz = 0.25 * s;
            }
            const od = this.orientation.data;
            od[0] = qx; od[1] = qy; od[2] = qz; od[3] = qw;
            EzMath.normalize(this.orientation, this.orientation);
            return this;
        }

        // Returns { origin: Vec3, direction: Vec3 }. The returned Vec3 instances
        // are NEW (caller may keep references). For zero-alloc paths, read x/y/z
        // and discard.
        raygen(ndc) {
            const x = ndc[0], y = ndc[1];
            const f = this.forward.data, r = this.right.data, u = this.up.data;
            const direction = new Vec3();
            const dd = direction.data;

            if (!this.orthographic) {
                const tanFov = Math.tan((this.fov * Math.PI / 180) * 0.5);
                const px = x * this.aspect * tanFov;
                const py = y * tanFov;
                dd[0] = f[0] + r[0]*px + u[0]*py;
                dd[1] = f[1] + r[1]*px + u[1]*py;
                dd[2] = f[2] + r[2]*px + u[2]*py;
                EzMath.normalize(direction, direction);
                const origin = new Vec3();
                origin.copy(this.position);
                return { origin, direction };
            } else {
                const h = this.orthoSize, w = h * this.aspect;
                const xw = x * w, yh = y * h;
                const origin = new Vec3();
                const od = origin.data, pd = this.position.data;
                od[0] = pd[0] + r[0]*xw + u[0]*yh;
                od[1] = pd[1] + r[1]*xw + u[1]*yh;
                od[2] = pd[2] + r[2]*xw + u[2]*yh;
                dd[0] = f[0]; dd[1] = f[1]; dd[2] = f[2];
                return { origin, direction };
            }
        }

        // offset: Vec3 (or array-like; copied through scratch).
        translate(offset) {
            const off = (offset && offset.kind === KIND_VEC3) ? offset : this.#scratchOff.set(offset);
            EzMath.add(this.position, this.position, off);
            return this;
        }
    }

    class EzMesh3D {
        vao               = null;
        vbo               = null;
        ebo               = null;
        instanceVBO       = null;
        indexType         = 0;
        indexBytes        = 0;
        primitives        = [];   // [{ indexOffset?, indexCount?, vertexOffset?, vertexCount?, material, morph? }]
        defaulted         = [];   // [{ loc, default }]
        morphTotalWeights = 0;

        destroy(gl) {
            if (this.vao)         gl.deleteVertexArray(this.vao);
            if (this.vbo)         gl.deleteBuffer(this.vbo);
            if (this.ebo)         gl.deleteBuffer(this.ebo);
            if (this.instanceVBO) gl.deleteBuffer(this.instanceVBO);
            for (const p of this.primitives)
                if (p.morph) for (const t of p.morph.channels.values()) gl.deleteTexture(t);
        }

        static fromDesc(gl, shader, key, opts = {}) {
            const { vertices, indices, attributes, primitives } = opts;

            const indexType  = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
            const indexBytes = indices instanceof Uint32Array ? 4 : 2;
            const hasVertices = !!vertices;

            const modelAttrsIn = Array.isArray(attributes) && attributes.length
                ? attributes
                : [{ name: "a_position", size: 3 }, { name: "a_uv", size: 2 }];

            let off = 0;
            const modelAttrs = modelAttrsIn.map(a => {
                const e = { name: a.name, size: a.size, offset: off };
                off += a.size * 4;
                return e;
            });
            const vaoStride = off;

            const wired = [], defaulted = [];
            for (const sa of shader.attributes) {
                if (sa.loc < 0) continue;
                const ma = modelAttrs.find(m => m.name === sa.name);
                if (ma) wired.push({ loc: sa.loc, size: ma.size, offset: ma.offset });
                else    defaulted.push({ loc: sa.loc, default: sa.default });
            }

            const vertexCount = hasVertices ? vertices.length / (vaoStride / 4) : 0;
            const primList = Array.isArray(primitives) && primitives.length > 0
                ? primitives.map(p => {
                    const mat = {
                        albedo: p.material?.albedo ?? null,
                        fill:   p.material?.fill   ?? [1, 1, 1, 1],
                    };
                    const hasVertex = (p.vertexOffset != null || p.vertexCount != null) && p.indexOffset == null && p.indexCount == null;
                    const out = hasVertex
                        ? { vertexOffset: p.vertexOffset ?? 0, vertexCount: p.vertexCount ?? vertexCount, material: mat }
                        : { indexOffset:  p.indexOffset  ?? 0, indexCount:  p.indexCount  ?? (indices ? indices.length : 0), material: mat };
                    if (p.morphTargets) out._morphSrc = p.morphTargets;
                    return out;
                })
                : indices
                    ? [{ indexOffset: 0, indexCount: indices.length, material: { albedo: null, fill: [1,1,1,1] } }]
                    : [{ vertexOffset: 0, vertexCount: hasVertices ? vertexCount : 0, material: { albedo: null, fill: [1,1,1,1] } }];

            if (hasVertices) {
                for (const p of primList) {
                    if (p.indexOffset != null) {
                        if (p.indexOffset < 0 || p.indexOffset + p.indexCount > (indices ? indices.length : 0))
                            return _c.warn(`[EzMesh3D]`, `"${key}": primitive index range out of bounds`);
                    } else {
                        if (p.vertexOffset < 0 || p.vertexOffset + p.vertexCount > vertexCount)
                            return _c.warn(`[EzMesh3D]`, `"${key}": primitive vertex range out of bounds`);
                    }
                }
            }

            let morphTotalWeights = 0;
            const shaderMorphChannels = shader._morphChannels ?? [];

            for (const p of primList) {
                const channelsIn = p._morphSrc; delete p._morphSrc;
                if (!channelsIn) continue;
                if (!_is.obj(channelsIn) || Array.isArray(channelsIn))
                    return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets must be an object keyed by channel name`);

                const channelNames = Object.keys(channelsIn);
                let targetCount = -1;
                for (const name of channelNames) {
                    const arr = channelsIn[name];
                    if (arr == null) continue;
                    if (!Array.isArray(arr))
                        return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets.${name} must be an array`);
                    if (targetCount < 0) targetCount = arr.length;
                    else if (arr.length !== targetCount)
                        return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets channel "${name}" has ${arr.length} targets, expected ${targetCount}`);
                }
                if (targetCount <= 0) continue;

                let vBase, vCount;
                if (p.indexOffset != null) {
                    let lo = Infinity, hi = -Infinity;
                    const end = p.indexOffset + p.indexCount;
                    for (let i = p.indexOffset; i < end; i++) {
                        const idx = indices[i];
                        if (idx < lo) lo = idx;
                        if (idx > hi) hi = idx;
                    }
                    vBase  = lo;
                    vCount = hi - lo + 1;
                } else {
                    vBase  = p.vertexOffset;
                    vCount = p.vertexCount;
                }

                p.morph = {
                    targetCount,
                    weightOffset: morphTotalWeights,
                    vertexBase:   vBase,
                    vertexCount:  vCount,
                    channels:     new Map(),
                };

                for (const chName of channelNames) {
                    const arr = channelsIn[chName];
                    if (arr == null) continue;
                    const chIdx = shaderMorphChannels.length > 0
                        ? shaderMorphChannels.indexOf(chName)
                        : channelNames.indexOf(chName);
                    if (chIdx < 0)
                        return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets channel "${chName}" not declared in shader's vertex.morphChannels`);

                    const expected = vCount * 3;
                    for (let t = 0; t < targetCount; t++) {
                        if (!arr[t] || arr[t].length !== expected)
                            return _c.warn(`[EzMesh3D]`, `"${key}": morphTargets.${chName}[${t}] length must be ${expected} (vertexCount*3), got ${arr[t]?.length}`);
                    }

                    const packed = new Float32Array(vCount * targetCount * 3);
                    for (let t = 0; t < targetCount; t++) {
                        const d = arr[t];
                        for (let v = 0; v < vCount; v++) {
                            const dst = (v * targetCount + t) * 3;
                            packed[dst    ] = d[v * 3    ];
                            packed[dst + 1] = d[v * 3 + 1];
                            packed[dst + 2] = d[v * 3 + 2];
                        }
                    }
                    p.morph.channels.set(chIdx, EzRender.uploadTexture2D(gl, null, gl.RGB32F, gl.RGB, gl.FLOAT, targetCount, vCount, packed));
                }

                morphTotalWeights += targetCount;
            }

            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);

            const vbo = gl.createBuffer();
            if (hasVertices) {
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
                for (const w of wired)
                    EzRender.wireAttr(gl, { buffer: vbo, loc: w.loc, size: w.size, stride: vaoStride, offset: w.offset });
            }
            for (const d of defaulted) gl.disableVertexAttribArray(d.loc);

            const ebo = indices ? gl.createBuffer() : null;
            if (ebo) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            }

            const instanceVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
            const instLayout = shader.instanceLayout;
            for (const e of instLayout.entries) {
                if (e.loc < 0) continue;
                if (e.type === "mat4") {
                    for (let col = 0; col < 4; col++)
                        EzRender.wireAttr(gl, { buffer: instanceVBO, loc: e.loc + col, size: 4, stride: instLayout.strideBytes, offset: e.byteOffset + col * 16, divisor: 1 });
                } else {
                    EzRender.wireAttr(gl, { buffer: instanceVBO, loc: e.loc, size: e.floats, stride: instLayout.strideBytes, offset: e.byteOffset, divisor: 1 });
                }
            }
            gl.bindVertexArray(null);

            const mesh = new EzMesh3D();
            mesh.vao               = vao;
            mesh.vbo               = vbo;
            mesh.ebo               = ebo;
            mesh.instanceVBO       = instanceVBO;
            mesh.indexType         = indexType;
            mesh.indexBytes        = indexBytes;
            mesh.primitives        = primList;
            mesh.defaulted         = defaulted;
            mesh.morphTotalWeights = morphTotalWeights;
            return mesh;
        }
    }

    class EzSkeleton3D {
        // bones: [{ parent: int, localBind: Mat4, inverseBind: Mat4, name: string }]
        bones = [];

        // Scratch buffers (allocated lazily in computePalette).
        #globalCurrent  = []; // Mat4[]
        #localScratch   = new Mat4();
        #skinnedScratch = new Mat4();

        // bonePoses: Mat4[] (length === bones.length). Returns a Float32Array of
        // n*16 floats (column-major mat4s) suitable for upload to the bone-palette
        // texture. The palette is freshly allocated each call (caller can keep it).
        computePalette(bonePoses) {
            const n = this.bones.length;
            const gc = this.#globalCurrent;
            if (gc.length !== n) {
                gc.length = 0;
                for (let i = 0; i < n; i++) gc.push(new Mat4());
            }
            const palette = new Float32Array(n * 16);
            const local = this.#localScratch, skinned = this.#skinnedScratch;
            for (let i = 0; i < n; i++) {
                const b = this.bones[i];
                EzMath.mul(local, b.localBind, bonePoses[i]);
                if (b.parent < 0) gc[i].copy(local);
                else              EzMath.mul(gc[i], gc[b.parent], local);
                EzMath.mul(skinned, gc[i], b.inverseBind);
                palette.set(skinned.data, i * 16);
            }
            return palette;
        }

        // skeleton: { bones: [{ parent?, localBind?: Mat4 | { position?, rotation?, euler?, scale? },
        //                       inverseBind?: Mat4, name? }] }
        static fromDesc(key, skeleton) {
            if (!skeleton || !Array.isArray(skeleton.bones) || skeleton.bones.length === 0) return null;
            const bones = [], globalBind = []; // globalBind: Mat4[]
            for (let i = 0; i < skeleton.bones.length; i++) {
                const b = skeleton.bones[i];
                const parent = b.parent ?? -1;
                if (parent >= i)
                    return _c.warn(`[EzSkeleton3D]`, `"${key}": bone ${i} parent must be < self`) || null;

                const localBind = new Mat4();
                EzMath.resolveTransform(localBind, b.localBind ?? null);

                const gb = new Mat4();
                if (parent < 0) gb.copy(localBind);
                else            EzMath.mul(gb, globalBind[parent], localBind);
                globalBind[i] = gb;

                let inverseBind;
                if (b.inverseBind && b.inverseBind.kind === KIND_MAT4) {
                    inverseBind = new Mat4();
                    inverseBind.copy(b.inverseBind);
                } else {
                    inverseBind = new Mat4();
                    if (!EzMath.invert(inverseBind, gb)) inverseBind.identity();
                }

                bones.push({ parent, localBind, inverseBind, name: typeof b.name === "string" ? b.name : `Bone_${i}` });
            }
            const skel = new EzSkeleton3D();
            skel.bones = bones;
            return skel;
        }
    }

    window.EzShader3D      = EzShader3D;
    window.EzMesh3D        = EzMesh3D;
    window.EzSkeleton3D    = EzSkeleton3D;
    window.EzCamera3D      = EzCamera3D;

})();