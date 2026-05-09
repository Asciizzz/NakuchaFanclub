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
            if (x != null && typeof x === 'object') { this.data[0]=x[0]||0; this.data[1]=x[1]||0; }
            else { this.data[0] = x; this.data[1] = y; }
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
            if (x != null && typeof x === 'object') { this.data[0]=x[0]||0; this.data[1]=x[1]||0; this.data[2]=x[2]||0; }
            else { this.data[0]=x; this.data[1]=y; this.data[2]=z; }
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
            if (x != null && typeof x === 'object') { this.data[0]=x[0]||0; this.data[1]=x[1]||0; this.data[2]=x[2]||0; this.data[3]=x[3]||0; }
            else { this.data[0]=x; this.data[1]=y; this.data[2]=z; this.data[3]=w; }
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
            if (x != null && typeof x === 'object') { this.data[0]=x[0]||0; this.data[1]=x[1]||0; this.data[2]=x[2]||0; this.data[3]=x[3]!=null?x[3]:1; }
            else { this.data[0]=x; this.data[1]=y; this.data[2]=z; this.data[3]=w; }
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
        constructor(a) {
            this.data = new Float32Array(16);
            this.kind = KIND_MAT4;
            if (a != null && typeof a === 'object') { this.set(a); }
            else { this.data[0] = 1; this.data[5] = 1; this.data[10] = 1; this.data[15] = 1; }
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

        static mult(out, a, b) {
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

            if (ka === KIND_MAT4 && kb === KIND_MAT4 && ko === KIND_MAT4) return EzMath.#multM4M4(out, a, b);
            if (ka === KIND_QUAT && kb === KIND_QUAT && ko === KIND_QUAT) return EzMath.#multQQ(out, a, b);
            if (ka === KIND_MAT4 && kb === KIND_VEC4 && ko === KIND_VEC4) return EzMath.#multM4V4(out, a, b);
            if (ka === KIND_MAT4 && kb === KIND_VEC3 && ko === KIND_VEC3) return EzMath.#multM4Point(out, a, b);
            if (ka === KIND_QUAT && kb === KIND_VEC3 && ko === KIND_VEC3) return EzMath.#multQV3(out, a, b);

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

        static #multM4M4(out, A, B) {
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

        static #multQQ(out, A, B) {
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

        static #multM4V4(out, M, V) {
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
        static #multM4Point(out, M, V) {
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
        static #multQV3(out, Q, V) {
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
        static #BLEND_ENUM_BY_NAME = {
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

        static #resolveBlendEnum(gl, spec, fallback) {
            if (typeof spec === 'number' && Number.isFinite(spec)) return spec;
            if (typeof spec === 'string') {
                const key = spec.trim();
                if (!key) return fallback;
                if (Object.prototype.hasOwnProperty.call(gl, key)) return gl[key];
                const mapped = EzRender.#BLEND_ENUM_BY_NAME[key.toUpperCase()];
                if (mapped != null) return mapped;
            }
            return fallback;
        }

        static bind(gl, program, onbind=null) {
            gl.useProgram(program);
            if (onbind) onbind(gl, program);
        }

        static applyState(gl, cfg) {
            if (!cfg) return;
            const hasProp = (prop) => Object.prototype.hasOwnProperty.call(cfg, prop);

            if (hasProp('depthWrite')) gl.depthMask(!!cfg.depthWrite);
            if (hasProp('depthTest')) {
                cfg.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
            }
            if (hasProp('blend')) {
                cfg.blend ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);

                if (cfg.blend && (hasProp('blendSrc') || hasProp('blendDst'))) {
                    const src = EzRender.#resolveBlendEnum(gl, cfg.blendSrc, gl.SRC_ALPHA);
                    const dst = EzRender.#resolveBlendEnum(gl, cfg.blendDst, gl.ONE_MINUS_SRC_ALPHA);
                    gl.blendFunc(src, dst);
                }
            }
            if (hasProp('cull')) {
                switch (cfg.cull) {
                    case 'none':  gl.disable(gl.CULL_FACE); break;
                    case 'front': gl.enable(gl.CULL_FACE);  gl.cullFace(gl.FRONT); break;
                    default:      gl.enable(gl.CULL_FACE);  gl.cullFace(gl.BACK);  break;
                }
            }
            if (hasProp('clearColor') && cfg.clearColor != null) {
                const c = cfg.clearColor;
                if (Array.isArray(c) || ArrayBuffer.isView(c)) {
                    gl.clearColor(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0);
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

        static SCRATCH_TEX_UNIT = 15;
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
        other     = {};   // free whatever things

        compiled = false;

        #activeStage = 0;
        #spec = null;

        constructor() {
            this.#spec = {
                version: '300 es',
                precision: {},
                outputName: 'ez_output',
                passes: [this.#newPassSpec(), this.#newPassSpec()],
                links: [],
            };

            this.vertexInputs = [];
            this.vertexOutputs = [];
            this.vertexUniforms = [];
            this.fragmentInputs = [];
            this.fragmentOutputs = [];
            this.fragmentUniforms = [];
            this.uniformLocations = new Map();
            this.attributeLocations = new Map();
        }

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

        static STAGE = {
            VERTEX: 0,
            FRAGMENT: 1
        }

        #newPassSpec() {
            return {
                inputs: [],
                outputs: [],
                uniforms: [],
                methods: [],
                main: null,
                precision: {},
            };
        }

        #cloneSpecValue(v) {
            if (Array.isArray(v)) return v.map(item => this.#cloneSpecValue(item));
            if (v && typeof v === 'object') return { ...v };
            return v;
        }

        #resolveStages(options, fallback = [this.#activeStage]) {
            const stage = options?.stage ?? options?.pass;
            if (stage == null) return fallback.slice();
            if (stage === 'both') return [0, 1];
            if (Array.isArray(stage)) return stage.map(p => (p === 1 || p === '1' || p === 'second') ? 1 : 0);
            return [(stage === 1 || stage === '1' || stage === 'second') ? 1 : 0];
        }

        #normalizeDecl(kind, typeOrSpec, name = null, options = {}) {
            const spec = _is.obj(typeOrSpec) ? { ...typeOrSpec } : { type: typeOrSpec, name };
            if (!_is.str(spec.name)) throw new Error('[EzShader] declaration requires a name');
            if (!_is.str(spec.type)) throw new Error(`[EzShader] declaration "${spec.name}" requires a type`);
            const out = {
                kind,
                name: spec.name,
                type: spec.type,
                precision: spec.precision ?? options.precision ?? null,
                location: spec.location ?? options.location ?? null,
                interpolation: spec.interpolation ?? options.interpolation ?? null,
                arraySize: spec.arraySize ?? options.arraySize ?? null,
                divisor: spec.divisor ?? options.divisor ?? undefined,
                instance: spec.instance ?? options.instance ?? undefined,
                floats: spec.floats ?? options.floats ?? undefined,
                slots: spec.slots ?? options.slots ?? undefined,
                default: spec.default != null ? this.#cloneSpecValue(spec.default) : null,
            };
            return out;
        }

        #normalizeMethod(methodOrSig, body = null) {
            if (_is.str(methodOrSig)) {
                const signature = methodOrSig.trim().replace(/[\s;{]+$/, '');
                if (!signature) throw new Error('[EzShader] method signature cannot be empty');
                return { signature, body: body != null ? String(body) : '' };
            }
            if (!_is.obj(methodOrSig)) throw new Error('[EzShader] method requires a signature string or descriptor object');
            const spec = { ...methodOrSig };
            let signature = _is.str(spec.signature) ? spec.signature.trim().replace(/[\s;{]+$/, '') : null;
            if (!signature) {
                if (!_is.str(spec.name)) throw new Error('[EzShader] method descriptor requires name');
                const returnType = _is.str(spec.returnType) ? spec.returnType : 'void';
                const args = Array.isArray(spec.args)
                    ? spec.args.map(arg => {
                        if (_is.str(arg)) return arg.trim();
                        if (!_is.obj(arg)) throw new Error(`[EzShader] method "${spec.name}" has an invalid argument descriptor`);
                        const argType = _is.str(arg.type) ? arg.type : null;
                        const argName = _is.str(arg.name) ? arg.name : null;
                        if (!argType || !argName) throw new Error(`[EzShader] method "${spec.name}" argument requires type and name`);
                        return `${argType} ${argName}`;
                    })
                    : [];
                signature = `${returnType} ${spec.name}(${args.join(', ')})`;
            }
            return { signature, body: spec.body != null ? String(spec.body) : (body != null ? String(body) : '') };
        }

        #indentBlock(src, indent = '    ') {
            const text = String(src ?? '').replace(/\s+$/, '');
            if (!text) return indent;
            return text.split('\n').map(line => indent + line).join('\n');
        }

        #formatDecl(decl, storage) {
            const parts = [];
            if (decl.location != null) parts.push(`layout(location=${decl.location})`);
            if (decl.interpolation) parts.push(decl.interpolation);
            parts.push(storage);
            if (decl.precision) parts.push(decl.precision);
            parts.push(decl.type);
            parts.push(decl.arraySize != null ? `${decl.name}[${decl.arraySize}]` : decl.name);
            return `${parts.join(' ')};`;
        }

        #formatMethod(method) {
            const body = this.#indentBlock(method.body);
            return `${method.signature} {\n${body}\n}`;
        }

        #assertStageIndex(stage) {
            if (stage !== 0 && stage !== 1) throw new Error('[EzShader] stage index must be 0 or 1');
            return stage;
        }

        #stageLabel(stage) {
            return stage === 0 ? 'primary' : 'secondary';
        }

        stage(stageIndex = 0) {
            this.#activeStage = this.#assertStageIndex(stageIndex);
            return this;
        }

        version(versionText) {
            if (_is.str(versionText)) this.#spec.version = versionText.trim();
            return this;
        }

        precision(type, value, options = {}) {
            if (!_is.str(type) || !_is.str(value)) throw new Error('[EzShader] precision requires type and value');
            const stages = this.#resolveStages(options);
            for (const stage of stages) {
                this.#spec.passes[stage].precision[type] = value;
            }
            return this;
        }

        input(typeOrSpec, name = null, options = {}) {
            const spec = this.#normalizeDecl('input', typeOrSpec, name, options);
            const stages = this.#resolveStages(options);
            for (const stage of stages) this.#spec.passes[stage].inputs.push(spec);
            return this;
        }

        inputs(specs, options = {}) {
            if (Array.isArray(specs)) {
                for (const spec of specs) this.input(spec, null, options);
            }
            return this;
        }

        output(typeOrSpec, name = null, options = {}) {
            const spec = this.#normalizeDecl('output', typeOrSpec, name, options);
            const stages = this.#resolveStages(options);
            for (const stage of stages) this.#spec.passes[stage].outputs.push(spec);
            return this;
        }

        outputs(specs, options = {}) {
            if (Array.isArray(specs)) {
                for (const spec of specs) this.output(spec, null, options);
            }
            return this;
        }

        uniform(typeOrSpec, name = null, options = {}) {
            const spec = this.#normalizeDecl('uniform', typeOrSpec, name, options);
            const stages = this.#resolveStages(options);
            for (const stage of stages) this.#spec.passes[stage].uniforms.push(spec);
            return this;
        }

        uniforms(specs, options = {}) {
            if (Array.isArray(specs)) {
                for (const spec of specs) this.uniform(spec, null, options);
            }
            return this;
        }

        link(typeOrSpec, name = null, options = {}) {
            const spec = this.#normalizeDecl('link', typeOrSpec, name, options);
            this.#spec.links.push(spec);
            return this;
        }

        method(methodOrSig, body = null, options = {}) {
            const spec = this.#normalizeMethod(methodOrSig, body);
            const stages = this.#resolveStages(options);
            for (const stage of stages) this.#spec.passes[stage].methods.push(spec);
            return this;
        }

        methods(specs, options = {}) {
            if (Array.isArray(specs)) {
                for (const spec of specs) this.method(spec, null, options);
            }
            return this;
        }

        main(body, options = {}) {
            const stage = this.#assertStageIndex(options.stage ?? options.pass ?? this.#activeStage);
            this.#spec.passes[stage].main = String(body ?? '');
            return this;
        }

        setRenderCfg(cfg = null) {
            this.renderCfg = _is.obj(cfg) ? cfg : null;
            return this;
        }

        setOnbind(fn = null) {
            this.onbind = typeof fn === 'function' ? fn : null;
            return this;
        }

        #buildStage(stageIndex) {
            const spec = this.#spec.passes[stageIndex];
            const seen = new Set();
            const checkName = (name, where) => {
                if (seen.has(name)) throw new Error(`[EzShader] duplicate name "${name}" in ${where}`);
                seen.add(name);
            };

            const lines = [`#version ${this.#spec.version}`];
            const precision = { float: 'highp', int: 'highp', ...spec.precision };
            for (const [type, value] of Object.entries(precision)) lines.push(`precision ${value} ${type};`);

            if (stageIndex === 0) {
                for (const decl of this.#spec.links) {
                    checkName(decl.name, 'link');
                    lines.push(this.#formatDecl(decl, 'out'));
                }
            }
            if (stageIndex === 1) {
                for (const decl of this.#spec.links) {
                    checkName(decl.name, 'link');
                    lines.push(this.#formatDecl(decl, 'in'));
                }
            }

            for (const decl of spec.inputs) {
                checkName(decl.name, 'inputs');
                lines.push(this.#formatDecl(decl, 'in'));
            }
            for (const decl of spec.outputs) {
                checkName(decl.name, 'outputs');
                lines.push(this.#formatDecl(decl, 'out'));
            }
            for (const decl of spec.uniforms) {
                checkName(decl.name, 'uniforms');
                lines.push(this.#formatDecl(decl, 'uniform'));
            }
            for (const method of spec.methods) {
                const signatureHead = method.signature.replace(/\s*\(.*/, '');
                const methodName = signatureHead.split(/\s+/).filter(Boolean).pop() ?? method.signature;
                checkName(methodName, 'methods');
                lines.push(this.#formatMethod(method));
            }

            if (!spec.main) throw new Error(`[EzShader] ${this.#stageLabel(stageIndex)} stage is missing main body`);
            lines.push(`void main() {`, this.#indentBlock(spec.main), `}`);
            return lines.join('\n');
        }

        build() {
            const source0 = this.#buildStage(0);
            const source1 = this.#buildStage(1);
            const built = {
                sources: [source0, source1],
                primary: source0,
                secondary: source1,
                renderCfg: this.renderCfg,
                onbind: this.onbind,
                stages: this.#spec.passes.map(stage => ({
                    inputs: stage.inputs.map(decl => ({ ...decl })),
                    outputs: stage.outputs.map(decl => ({ ...decl })),
                    uniforms: stage.uniforms.map(decl => ({ ...decl })),
                })),
            };
            this.other.builder = built;
            return built;
        }

        compile(vertSrc, fragSrc, gl) {
            if (arguments.length === 1) {
                gl = vertSrc;
                const built = this.build();
                this.program = this.#createProgram(gl, built.primary, built.secondary);
                if (!this.program) throw new Error('[EzShader] GL program compilation failed');
                this.renderCfg = built.renderCfg;
                this.onbind = built.onbind;
                this.#refreshReflection(gl);
                this.compiled = true;
                return this;
            }

            this.program = this.#createProgram(gl, vertSrc, fragSrc);
            if (!this.program) throw new Error("[EzShader] GL program compilation failed");
            this.#refreshReflection(gl);
            this.compiled = true;
            return this;
        }

        #refreshReflection(gl) {
            const stage0 = this.#spec.passes[0];
            const stage1 = this.#spec.passes[1];

            const resolveAttr = decl => ({
                ...decl,
                loc: gl.getAttribLocation(this.program, decl.name),
            });
            const resolveUniform = decl => ({
                ...decl,
                loc: gl.getUniformLocation(this.program, decl.name),
            });

            this.vertexInputs   = stage0.inputs.map(resolveAttr);
            this.vertexOutputs  = stage0.outputs.map(resolveUniform);
            this.vertexUniforms = stage0.uniforms.map(resolveUniform);
            this.fragmentInputs  = stage1.inputs.map(resolveUniform);
            this.fragmentOutputs = stage1.outputs.map(resolveUniform);
            this.fragmentUniforms = stage1.uniforms.map(resolveUniform);

            this.attributeLocations = new Map(this.vertexInputs.map(decl => [decl.name, decl.loc]));
            this.uniformLocations = new Map([
                ...this.vertexUniforms.map(decl => [decl.name, decl.loc]),
                ...this.fragmentUniforms.map(decl => [decl.name, decl.loc]),
            ]);

            this.attributes = this.vertexInputs;
            this.outputs = this.fragmentOutputs;
            this.uniforms = [...this.vertexUniforms, ...this.fragmentUniforms];
        }

        getAttributeLocation(name) {
            return this.attributeLocations.get(name) ?? -1;
        }

        getUniformLocation(name) {
            return this.uniformLocations.get(name) ?? null;
        }

        bind(gl) {
            EzRender.bind(gl, this.program, this.onbind);
            return this;
        }

        applyRenderState(gl) { EzRender.applyState(gl, this.renderCfg); return this; }
        static restoreRenderState(gl) { EzRender.restoreDefaultState(gl); }

        #compileShader(gl, type, src) {
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

        #createProgram(gl, vertSrc, fragSrc) {
            const vshader = this.#compileShader(gl, gl.VERTEX_SHADER,   vertSrc);
            const fshader = this.#compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

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
            const alpha = typeof opts.alpha === "boolean" ? opts.alpha : true;
            const gl = c.getContext("webgl2", { alpha, antialias });
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
            gl.clearColor(0, 0, 0, alpha ? 0 : 1);

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

    window.EzRender        = EzRender;
    window.EzShader        = EzShader;
    window.EzCanvas3D      = EzCanvas3D;

// Every thing below this line is highly specialized for 3D-object-driven rendering
// --------------------------------------------------------------------------------
    class EzCamera3D {
        position    = new Vec3(0, 0, 3);
        orientation = new Quat();

        near = 0.1; far = 1000;
        fov  = 45;
        aspect = 1;

        orthographic = false;
        orthoSize    = 5;   // half-height

        #forward = new Vec3();
        #right   = new Vec3();
        #up      = new Vec3();
        #view    = new Mat4();
        #proj    = new Mat4();
        #ypr     = new Vec3(); // (yaw, pitch, roll) in degrees

        static #LOCAL_FWD   = new Vec3( 0,  0, -1);
        static #LOCAL_RIGHT = new Vec3( 1,  0,  0);
        static #LOCAL_UP    = new Vec3( 0,  1,  0);

        #scratchQ    = new Quat();
        #scratchAxis = new Vec3();
        #scratchTgt  = new Vec3();
        #scratchDir  = new Vec3();
        #scratchOff  = new Vec3();

        constructor() {}

        get forward() { return EzMath.mult(this.#forward, this.orientation, EzCamera3D.#LOCAL_FWD); }
        get right()   { return EzMath.mult(this.#right,   this.orientation, EzCamera3D.#LOCAL_RIGHT); }
        get up()      { return EzMath.mult(this.#up,      this.orientation, EzCamera3D.#LOCAL_UP); }
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
                EzMath.mult(this.orientation, tmpQ, this.orientation);
            }
            if (pitchDelta) {
                axis.data[0]=1; axis.data[1]=0; axis.data[2]=0;
                EzMath.fromAxisAngle(tmpQ, axis, pitchDelta * d2r);
                EzMath.mult(this.orientation, this.orientation, tmpQ);
            }
            if (rollDelta) {
                axis.data[0]=0; axis.data[1]=0; axis.data[2]=-1;
                EzMath.fromAxisAngle(tmpQ, axis, rollDelta * d2r);
                EzMath.mult(this.orientation, this.orientation, tmpQ);
            }
            EzMath.normalize(this.orientation, this.orientation);
            return this;
        }

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

        // { origin: Vec3, direction: Vec3 }
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

        translate(offset) {
            const off = (offset && offset.kind === KIND_VEC3) ? offset : this.#scratchOff.set(offset);
            EzMath.add(this.position, this.position, off);
            return this;
        }
    }


    class EzMesh3D {
        constructor() {
            this.vertexBuffers = []; // [{ vbo, stride, vertexCount, attributes:[{name, size, type, normalized, offset}] }]

            this.ebo        = null;
            this.indexType  = 0;
            this.indexBytes = 0;
            this.indexCount = 0;

            this.submeshes = [];

            this.morphTargetCount = 0;
            this.morphTargetNames = null;

            this.ABmin = [ Infinity,  Infinity,  Infinity];
            this.ABmax = [-Infinity, -Infinity, -Infinity];
        }

        destroy(gl) {
            for (const vb of this.vertexBuffers) if (vb.vbo) gl.deleteBuffer(vb.vbo);
            if (this.ebo) gl.deleteBuffer(this.ebo);
            for (const sm of this.submeshes) {
                if (sm.morph) for (const t of sm.morph.channels.values()) gl.deleteTexture(t);
            }
            this.vertexBuffers = [];
            this.ebo = null;
            this.submeshes = [];
        }

        // Build a mesh from a description
        // opts:
        //   vertexBuffers?: [{ data, attributes: [{ name, size, type?, normalized?, offset? }], stride? }]
        //   vertices?:   Float32Array | TypedArray
        //   attributes?: [{ name, size, type?, normalized? }]
        //   indices?:   Uint16Array | Uint32Array
        //   submeshes?: [{
        //       indexOffset?, indexCount?, vertexOffset?, vertexCount?,
        //       materialKey?,
        //       ABmin?, ABmax?,
        //       morphTargets?: { [channelName]: Float32Array[] }   // each target = vec3[]
        //   }]
        //   morphTargetNames?: string[]
        static fromDesc(gl, opts = {}) {
            const mesh = new EzMesh3D();

            // -- Vertex buffers -----------------------------------------
            const vbDescs = (Array.isArray(opts.vertexBuffers) && opts.vertexBuffers.length)
                ? opts.vertexBuffers
                : (opts.vertices != null
                    ? [{ data: opts.vertices, attributes: opts.attributes ?? [{name:"a_position", size:3}, {name:"a_uv", size:2}], stride: opts.stride }]
                    : []);

            for (const vb of vbDescs) {
                const data = vb.data;
                if (!data) continue;
                const attrs = [];
                let off = 0;
                for (const a of (vb.attributes || [])) {
                    const o = a.offset != null ? a.offset : off;
                    attrs.push({
                        name:       a.name,
                        size:       a.size,
                        type:       a.type ?? gl.FLOAT,
                        normalized: !!a.normalized,
                        offset:     o,
                    });
                    off = o + a.size * 4;
                }
                const stride = vb.stride != null ? vb.stride : off;

                const vbo = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

                mesh.vertexBuffers.push({
                    vbo, stride, attributes: attrs,
                    vertexCount: stride > 0 ? (data.byteLength / stride) | 0 : 0,
                });
            }

            // -- Indices ------------------------------------------------
            const indices = opts.indices;
            if (indices) {
                mesh.indexType  = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
                mesh.indexBytes = indices instanceof Uint32Array ? 4 : 2;
                mesh.indexCount = indices.length;
                mesh.ebo = gl.createBuffer();
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ebo);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            }

            // -- Submeshes ----------------------------------------------
            const defaultVCount = mesh.vertexBuffers[0]?.vertexCount ?? 0;
            const subs = (Array.isArray(opts.submeshes) && opts.submeshes.length)
                ? opts.submeshes
                : (indices
                    ? [{ indexOffset: 0, indexCount: indices.length, vertexOffset: 0, vertexCount: defaultVCount }]
                    : [{ vertexOffset: 0, vertexCount: defaultVCount }]);

            for (const s of subs) {
                const sub = {
                    indexOffset:  s.indexOffset  ?? 0,
                    indexCount:   s.indexCount   ?? 0,
                    vertexOffset: s.vertexOffset ?? 0,
                    vertexCount:  s.vertexCount  ?? defaultVCount,
                    materialKey:  s.materialKey  ?? null,
                    ABmin: s.ABmin ? s.ABmin.slice() : [ Infinity,  Infinity,  Infinity],
                    ABmax: s.ABmax ? s.ABmax.slice() : [-Infinity, -Infinity, -Infinity],
                    morph: null,
                };

                // Per-submesh morph deltas - keyed by channel name; the
                // project resolves names to shader sampler bindings.
                if (s.morphTargets && _is.obj(s.morphTargets) && !Array.isArray(s.morphTargets)) {
                    const names = Object.keys(s.morphTargets);
                    let targetCount = 0;
                    for (const ch of names) {
                        const arr = s.morphTargets[ch];
                        if (Array.isArray(arr) && arr.length > targetCount) targetCount = arr.length;
                    }
                    const vCount = sub.vertexCount;
                    if (targetCount > 0 && vCount > 0) {
                        sub.morph = {
                            targetCount,
                            vertexBase:  sub.vertexOffset,
                            vertexCount: vCount,
                            channels:    new Map(),
                        };
                        for (const ch of names) {
                            const arr = s.morphTargets[ch];
                            if (!Array.isArray(arr) || !arr.length) continue;
                            // Pack as a (vCount × targetCount) RGB32F texture, with the
                            // shader fetching texel(t, vertexLocal). Inner loop = target
                            // index, outer = vertex - matches the existing rig shader.
                            const packed = new Float32Array(vCount * targetCount * 3);
                            for (let t = 0; t < targetCount; t++) {
                                const d = arr[t]; if (!d) continue;
                                for (let v = 0; v < vCount; v++) {
                                    const dst = (v * targetCount + t) * 3;
                                    packed[dst    ] = d[v*3    ];
                                    packed[dst + 1] = d[v*3 + 1];
                                    packed[dst + 2] = d[v*3 + 2];
                                }
                            }
                            sub.morph.channels.set(ch, EzRender.uploadTexture2D(
                                gl, null, gl.RGB32F, gl.RGB, gl.FLOAT,
                                targetCount, vCount, packed,
                            ));
                        }
                        if (targetCount > mesh.morphTargetCount) mesh.morphTargetCount = targetCount;
                    }
                }

                mesh.submeshes.push(sub);
                for (let k = 0; k < 3; k++) {
                    if (sub.ABmin[k] < mesh.ABmin[k]) mesh.ABmin[k] = sub.ABmin[k];
                    if (sub.ABmax[k] > mesh.ABmax[k]) mesh.ABmax[k] = sub.ABmax[k];
                }
            }

            if (Array.isArray(opts.morphTargetNames) && opts.morphTargetNames.length) {
                mesh.morphTargetNames = opts.morphTargetNames.slice(0, mesh.morphTargetCount);
                while (mesh.morphTargetNames.length < mesh.morphTargetCount)
                    mesh.morphTargetNames.push(`Target_${mesh.morphTargetNames.length}`);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
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
                EzMath.mult(local, b.localBind, bonePoses[i]);
                if (b.parent < 0) gc[i].copy(local);
                else              EzMath.mult(gc[i], gc[b.parent], local);
                EzMath.mult(skinned, gc[i], b.inverseBind);
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
                else            EzMath.mult(gb, globalBind[parent], localBind);
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

    window.EzMesh3D        = EzMesh3D;
    window.EzSkeleton3D    = EzSkeleton3D;
    window.EzCamera3D      = EzCamera3D;

})();