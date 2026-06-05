/* Alm (Math)
By Asciiz

Lightweight mathlib for Float32Array vectors/matrices/quater-onions(yummers)

# Components
    Vec2, Vec3, Vec4, Quat (Today, I want a quaso), Mat4

# Constants
    EPSILON
    DEG2RAD
    RAD2DEG

# Notes
    Matrices are column-major
    Quaternion format is [x, y, z, w]
*/

export const EPSILON = 0.000001;
export const DEG2RAD = 0.017453292519943295;
export const RAD2DEG = 57.29577951308232;
export const TAU = 6.283185307179586;
export const PI_HALF = 1.5707963267948966;
export const PI_QUARTER = 0.7853981633974483;
export const PI_THIRD = 1.0471975511965976;

export const Vec2 = function(xOrArray = 0, y = 0) {
    if (ArrayBuffer.isView(xOrArray) || Array.isArray(xOrArray)) {
        const out = new Float32Array(2);
        out[0] = xOrArray[0] ?? 0;
        out[1] = xOrArray[1] ?? 0;
        return out;
    }
    const out = new Float32Array(2);
    out[0] = xOrArray ?? 0;
    out[1] = y ?? 0;
    return out;
};

export const Vec3 = function(xOrArray = 0, y = 0, z = 0) {
    if (ArrayBuffer.isView(xOrArray) || Array.isArray(xOrArray)) {
        const out = new Float32Array(3);
        out[0] = xOrArray[0] ?? 0;
        out[1] = xOrArray[1] ?? 0;
        out[2] = xOrArray[2] ?? 0;
        return out;
    }
    const out = new Float32Array(3);
    out[0] = xOrArray ?? 0;
    out[1] = y ?? 0;
    out[2] = z ?? 0;
    return out;
};

export const Vec4 = function(xOrArray = 0, y = 0, z = 0, w = 0) {
    if (ArrayBuffer.isView(xOrArray) || Array.isArray(xOrArray)) {
        const out = new Float32Array(4);
        out[0] = xOrArray[0] ?? 0;
        out[1] = xOrArray[1] ?? 0;
        out[2] = xOrArray[2] ?? 0;
        out[3] = xOrArray[3] ?? 0;
        return out;
    }
    const out = new Float32Array(4);
    out[0] = xOrArray ?? 0;
    out[1] = y ?? 0;
    out[2] = z ?? 0;
    out[3] = w ?? 0;
    return out;
};

export const Quat = function(xOrArray = 0, y = 0, z = 0, w = 0) {
    if (ArrayBuffer.isView(xOrArray) || Array.isArray(xOrArray)) {
        const out = new Float32Array(4);
        out[0] = xOrArray[0] ?? 0;
        out[1] = xOrArray[1] ?? 0;
        out[2] = xOrArray[2] ?? 0;
        out[3] = xOrArray[3] ?? 0;
        return out;
    }
    const out = new Float32Array(4);
    out[0] = xOrArray ?? 0;
    out[1] = y ?? 0;
    out[2] = z ?? 0;
    out[3] = w ?? 0;
    return out;
};

export const Mat4 = function(arrayLike = null) {
    const out = new Float32Array(16);
    if (arrayLike && (ArrayBuffer.isView(arrayLike) || Array.isArray(arrayLike))) {
        out.set(arrayLike.subarray ? arrayLike.subarray(0, 16) : arrayLike.slice(0, 16));
    }
    return out;
};

// V2



Vec2.set = function(x, y, out = null) {
    out ??= new Float32Array(2);
    out[0] = x;
    out[1] = y;
    return out;
};

Vec2.copy = function(a, out = null) {
    out ??= new Float32Array(2);
    out[0] = a[0];
    out[1] = a[1];
    return out;
};

Vec2.add = function(a, b, out = null) {
    out ??= new Float32Array(2);
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    return out;
};

Vec2.sub = function(a, b, out = null) {
    out ??= new Float32Array(2);
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    return out;
};

Vec2.scale = function(a, s, out = null) {
    out ??= new Float32Array(2);
    out[0] = a[0] * s;
    out[1] = a[1] * s;
    return out;
};

Vec2.dot = function(a, b) {
    return a[0] * b[0] + a[1] * b[1];
};

Vec2.len = function(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
};

Vec2.norm = function(a, out = null) {
    out ??= new Float32Array(2);
    const x = a[0], y = a[1];
    const lsq = x * x + y * y;
    if (lsq > EPSILON * EPSILON) {
        const invLen = 1.0 / Math.sqrt(lsq);
        out[0] = x * invLen;
        out[1] = y * invLen;
    } else {
        out[0] = 0;
        out[1] = 0;
    }
    return out;
};

Vec2.lerp = function(a, b, t, out = null) {
    out ??= new Float32Array(2);
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    return out;
};


// V3



Vec3.UP      = new Float32Array([0, 1, 0]);
Vec3.RIGHT   = new Float32Array([1, 0, 0]);
Vec3.FORWARD = new Float32Array([0, 0, -1]);

Vec3.set = function(x, y, z, out = null) {
    out ??= new Float32Array(3);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
};

Vec3.copy = function(a, out = null) {
    out ??= new Float32Array(3);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
};

Vec3.add = function(a, b, out = null) {
    out ??= new Float32Array(3);
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
};

Vec3.sub = function(a, b, out = null) {
    out ??= new Float32Array(3);
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
};

Vec3.mul = function(a, b, out = null) {
    out ??= new Float32Array(3);
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    out[2] = a[2] * b[2];
    return out;
};

Vec3.scale = function(a, s, out = null) {
    out ??= new Float32Array(3);
    out[0] = a[0] * s;
    out[1] = a[1] * s;
    out[2] = a[2] * s;
    return out;
};

Vec3.dot = function(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

Vec3.cross = function(a, b, out = null) {
    out ??= new Float32Array(3);
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
};

Vec3.len = function(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
};

Vec3.norm = function(a, out = null) {
    out ??= new Float32Array(3);
    const x = a[0], y = a[1], z = a[2];
    const lsq = x * x + y * y + z * z;
    if (lsq > EPSILON * EPSILON) {
        const invLen = 1.0 / Math.sqrt(lsq);
        out[0] = x * invLen;
        out[1] = y * invLen;
        out[2] = z * invLen;
    } else {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
    }
    return out;
};

Vec3.distance = function(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

Vec3.lerp = function(a, b, t, out = null) {
    out ??= new Float32Array(3);
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
};


// V4



Vec4.set = function(x, y, z, w, out = null) {
    out ??= new Float32Array(4);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
    return out;
};

Vec4.copy = function(a, out = null) {
    out ??= new Float32Array(4);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

Vec4.add = function(a, b, out = null) {
    out ??= new Float32Array(4);
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    out[3] = a[3] + b[3];
    return out;
};

Vec4.sub = function(a, b, out = null) {
    out ??= new Float32Array(4);
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    out[3] = a[3] - b[3];
    return out;
};

Vec4.scale = function(a, s, out = null) {
    out ??= new Float32Array(4);
    out[0] = a[0] * s;
    out[1] = a[1] * s;
    out[2] = a[2] * s;
    out[3] = a[3] * s;
    return out;
};

Vec4.dot = function(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
};

Vec4.len = function(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]);
};

Vec4.norm = function(a, out = null) {
    out ??= new Float32Array(4);
    const x = a[0], y = a[1], z = a[2], w = a[3];
    const lsq = x * x + y * y + z * z + w * w;
    if (lsq > EPSILON * EPSILON) {
        const invLen = 1.0 / Math.sqrt(lsq);
        out[0] = x * invLen;
        out[1] = y * invLen;
        out[2] = z * invLen;
        out[3] = w * invLen;
    } else {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
    }
    return out;
};


// Q (Quaternion) - stored as [x, y, z, w]



Quat.IDENTITY = Object.freeze([0, 0, 0, 1]);

Quat.makeIdentity = function(out = null) {
    out ??= new Float32Array(4);
    out[0] = Quat.IDENTITY[0];
    out[1] = Quat.IDENTITY[1];
    out[2] = Quat.IDENTITY[2];
    out[3] = Quat.IDENTITY[3];
    return out;
};

Quat.copy = function(a, out = null) {
    out ??= new Float32Array(4);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

Quat.mul = function(a, b, out = null) {
    out ??= new Float32Array(4);
    const ax = a[0], ay = a[1], az = a[2], aw = a[3];
    const bx = b[0], by = b[1], bz = b[2], bw = b[3];
    out[0] = aw * bx + ax * bw + ay * bz - az * by;
    out[1] = aw * by - ax * bz + ay * bw + az * bx;
    out[2] = aw * bz + ax * by - ay * bx + az * bw;
    out[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
};

Quat.len = function(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]);
};

Quat.norm = function(a, out = null) {
    out ??= new Float32Array(4);
    const x = a[0], y = a[1], z = a[2], w = a[3];
    const lsq = x * x + y * y + z * z + w * w;
    if (lsq > EPSILON * EPSILON) {
        const invLen = 1.0 / Math.sqrt(lsq);
        out[0] = x * invLen;
        out[1] = y * invLen;
        out[2] = z * invLen;
        out[3] = w * invLen;
    } else {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
    }
    return out;
};

Quat.invert = function(a, out = null) {
    out ??= new Float32Array(4);
    const dot = a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3];
    const inv = dot > EPSILON ? 1 / dot : 0;
    out[0] = -a[0] * inv;
    out[1] = -a[1] * inv;
    out[2] = -a[2] * inv;
    out[3] =  a[3] * inv;
    return out;
};

Quat.fromAxisAngle = function(axis, rad, out = null) {
    out ??= new Float32Array(4);
    const half = rad * 0.5;
    const s = Math.sin(half);
    out[0] = axis[0] * s;
    out[1] = axis[1] * s;
    out[2] = axis[2] * s;
    out[3] = Math.cos(half);
    return out;
};

Quat.fromM4 = function(m, out = null) {
    out ??= new Float32Array(4);
    const m00 = m[0], m01 = m[1], m02 = m[2];
    const m10 = m[4], m11 = m[5], m12 = m[6];
    const m20 = m[8], m21 = m[9], m22 = m[10];
    const trace = m00 + m11 + m22;

    let s;
    if (trace > 0) {
        s = 0.5 / Math.sqrt(trace + 1);
        out[3] = 0.25 / s;
        out[0] = (m21 - m12) * s;
        out[1] = (m02 - m20) * s;
        out[2] = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
        s = 2 * Math.sqrt(1 + m00 - m11 - m22);
        out[3] = (m21 - m12) / s;
        out[0] = 0.25 * s;
        out[1] = (m01 + m10) / s;
        out[2] = (m02 + m20) / s;
    } else if (m11 > m22) {
        s = 2 * Math.sqrt(1 + m11 - m00 - m22);
        out[3] = (m02 - m20) / s;
        out[0] = (m01 + m10) / s;
        out[1] = 0.25 * s;
        out[2] = (m12 + m21) / s;
    } else {
        s = 2 * Math.sqrt(1 + m22 - m00 - m11);
        out[3] = (m10 - m01) / s;
        out[0] = (m02 + m20) / s;
        out[1] = (m12 + m21) / s;
        out[2] = 0.25 * s;
    }
    return out;
};

Quat.toEulerYPR = function(q, out = null) {
    out ??= new Float32Array(3);
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const sx = 2 * (w * x - y * z);
    const clamped = Math.max(-1, Math.min(1, sx));
    const pitch = Math.asin(clamped);
    const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
    const roll = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));
    out[0] = yaw * RAD2DEG;
    out[1] = pitch * RAD2DEG;
    out[2] = roll * RAD2DEG;
    return out;
};

Quat.transformV3 = function(q, v, out = null) {
    out ??= new Float32Array(3);
    const vx = v[0], vy = v[1], vz = v[2];
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    out[0] = vx + qw * tx + qy * tz - qz * ty;
    out[1] = vy + qw * ty + qz * tx - qx * tz;
    out[2] = vz + qw * tz + qx * ty - qy * tx;
    return out;
};

Quat.slerp = function(a, b, t, out = null) {
    out ??= new Float32Array(4);
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

    // If dot is negative, negate b to take the shorter arc
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    if (dot < 0) {
        dot = -dot;
        bx = -bx; by = -by; bz = -bz; bw = -bw;
    }

    let scale0, scale1;
    if (dot > 1 - EPSILON) {
        // Quaternions are very close - use linear interpolation
        scale0 = 1 - t;
        scale1 = t;
    } else {
        const theta = Math.acos(dot);
        const sinTheta = Math.sin(theta);
        scale0 = Math.sin((1 - t) * theta) / sinTheta;
        scale1 = Math.sin(t * theta) / sinTheta;
    }

    out[0] = scale0 * a[0] + scale1 * bx;
    out[1] = scale0 * a[1] + scale1 * by;
    out[2] = scale0 * a[2] + scale1 * bz;
    out[3] = scale0 * a[3] + scale1 * bw;
    return out;
};


// M4 - column-major Float32Array[16]
//
//  Index layout (column-major):
//   0  4  8  12
//   1  5  9  13
//   2  6  10 14
//   3  7  11 15



Mat4.IDENTITY = Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
]);

Mat4.makeIdentity = function(out = null) {
    out ??= new Float32Array(16);
    out.set(Mat4.IDENTITY);
    return out;
};

Mat4.copy = function(a, out = null) {
    out ??= new Float32Array(16);
    out.set(a);
    return out;
};

Mat4.mul = function(a, b, out = null) {
    out ??= new Float32Array(16);
    const a00 = a[0],  a01 = a[1],  a02 = a[2],  a03 = a[3];
    const a10 = a[4],  a11 = a[5],  a12 = a[6],  a13 = a[7];
    const a20 = a[8],  a21 = a[9],  a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0, b1, b2, b3;

    b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
    out[0]  = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1]  = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2]  = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3]  = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4]  = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5]  = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6]  = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7]  = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8]  = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9]  = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    return out;
};

Mat4.transpose = function(a, out = null) {
    out ??= new Float32Array(16);
    if (out === a) {
        let t;
        t = a[1];  a[1]  = a[4];  a[4]  = t;
        t = a[2];  a[2]  = a[8];  a[8]  = t;
        t = a[3];  a[3]  = a[12]; a[12] = t;
        t = a[6];  a[6]  = a[9];  a[9]  = t;
        t = a[7];  a[7]  = a[13]; a[13] = t;
        t = a[11]; a[11] = a[14]; a[14] = t;
        return out;
    }
    out[0]  = a[0];  out[1]  = a[4];  out[2]  = a[8];  out[3]  = a[12];
    out[4]  = a[1];  out[5]  = a[5];  out[6]  = a[9];  out[7]  = a[13];
    out[8]  = a[2];  out[9]  = a[6];  out[10] = a[10]; out[11] = a[14];
    out[12] = a[3];  out[13] = a[7];  out[14] = a[11]; out[15] = a[15];
    return out;
};

Mat4.invert = function(a, out = null) {
    out ??= new Float32Array(16);
    const a00 = a[0],  a01 = a[1],  a02 = a[2],  a03 = a[3];
    const a10 = a[4],  a11 = a[5],  a12 = a[6],  a13 = a[7];
    const a20 = a[8],  a21 = a[9],  a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) <= EPSILON) return null;
    det = 1 / det;

    out[0]  = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1]  = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2]  = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3]  = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4]  = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5]  = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6]  = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7]  = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8]  = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9]  = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b06 - a10 * b09 - a12 * b06 + a10 * b09) * det; // simplified below
    // Redo last column correctly:
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
};

Mat4.fromTranslation = function(v, out = null) {
    out ??= new Float32Array(16);
    out.set(Mat4.IDENTITY);
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    return out;
};

Mat4.fromScaling = function(v, out = null) {
    out ??= new Float32Array(16);
    out.set(Mat4.IDENTITY);
    out[0]  = v[0];
    out[5]  = v[1];
    out[10] = v[2];
    return out;
};

Mat4.fromRotationX = function(rad, out = null) {
    out ??= new Float32Array(16);
    out.set(Mat4.IDENTITY);
    const c = Math.cos(rad), s = Math.sin(rad);
    out[5]  =  c; out[6]  = s;
    out[9]  = -s; out[10] = c;
    return out;
};

Mat4.fromRotationY = function(rad, out = null) {
    out ??= new Float32Array(16);
    out.set(Mat4.IDENTITY);
    const c = Math.cos(rad), s = Math.sin(rad);
    out[0]  =  c; out[2]  = -s;
    out[8]  =  s; out[10] =  c;
    return out;
};

Mat4.fromRotationZ = function(rad, out = null) {
    out ??= new Float32Array(16);
    out.set(Mat4.IDENTITY);
    const c = Math.cos(rad), s = Math.sin(rad);
    out[0] =  c; out[1] = s;
    out[4] = -s; out[5] = c;
    return out;
};

Mat4.fromQuat = function(q, out = null) {
    out ??= new Float32Array(16);
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, yx = y * x2, yy = y * y2;
    const zx = z * x2, zy = z * y2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    out[0]  = 1 - yy - zz; out[1]  = yx + wz;      out[2]  = zx - wy;      out[3]  = 0;
    out[4]  = yx - wz;     out[5]  = 1 - xx - zz;  out[6]  = zy + wx;      out[7]  = 0;
    out[8]  = zx + wy;     out[9]  = zy - wx;      out[10] = 1 - xx - yy;  out[11] = 0;
    out[12] = 0;           out[13] = 0;            out[14] = 0;            out[15] = 1;
    return out;
};

Mat4.fromTRS = function(pos, rotQ, scale, out = null) {
    out ??= new Float32Array(16);
    const x = rotQ[0], y = rotQ[1], z = rotQ[2], w = rotQ[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = scale[0], sy = scale[1], sz = scale[2];

    out[0]  = (1 - (yy + zz)) * sx;
    out[1]  = (xy + wz)       * sx;
    out[2]  = (xz - wy)       * sx;
    out[3]  = 0;
    out[4]  = (xy - wz)       * sy;
    out[5]  = (1 - (xx + zz)) * sy;
    out[6]  = (yz + wx)       * sy;
    out[7]  = 0;
    out[8]  = (xz + wy)       * sz;
    out[9]  = (yz - wx)       * sz;
    out[10] = (1 - (xx + yy)) * sz;
    out[11] = 0;
    out[12] = pos[0];
    out[13] = pos[1];
    out[14] = pos[2];
    out[15] = 1;
    return out;
};

Mat4.translate = function(m, v, out = null) {
    out ??= new Float32Array(16);
    const x = v[0], y = v[1], z = v[2];
    if (out !== m) {
        out[0] = m[0]; out[1] = m[1]; out[2] = m[2]; out[3] = m[3];
        out[4] = m[4]; out[5] = m[5]; out[6] = m[6]; out[7] = m[7];
        out[8] = m[8]; out[9] = m[9]; out[10] = m[10]; out[11] = m[11];
    }
    out[12] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[13] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[14] = m[2] * x + m[6] * y + m[10] * z + m[14];
    out[15] = m[3] * x + m[7] * y + m[11] * z + m[15];
    return out;
};

Mat4.rotateX = function(m, rad, out = null) {
    const r = Mat4.fromRotationX(rad);
    return Mat4.mul(m, r, out);
};

Mat4.rotateY = function(m, rad, out = null) {
    const r = Mat4.fromRotationY(rad);
    return Mat4.mul(m, r, out);
};

Mat4.rotateZ = function(m, rad, out = null) {
    const r = Mat4.fromRotationZ(rad);
    return Mat4.mul(m, r, out);
};

Mat4.rotateQ = function(m, q, out = null) {
    const r = Mat4.fromQuat(q);
    return Mat4.mul(m, r, out);
};

Mat4.scale = function(m, v, out = null) {
    out ??= new Float32Array(16);
    const x = v[0], y = v[1], z = v[2];
    out[0] = m[0] * x; out[1] = m[1] * x; out[2] = m[2] * x; out[3] = m[3] * x;
    out[4] = m[4] * y; out[5] = m[5] * y; out[6] = m[6] * y; out[7] = m[7] * y;
    out[8] = m[8] * z; out[9] = m[9] * z; out[10] = m[10] * z; out[11] = m[11] * z;
    out[12] = m[12]; out[13] = m[13]; out[14] = m[14]; out[15] = m[15];
    return out;
};

Mat4.perspective = function(fovy, aspect, near, far, out = null) {
    out ??= new Float32Array(16);
    const f = 1 / Math.tan(fovy * 0.5);
    const nf = 1 / (near - far);

    out[0]  = f / aspect;
    out[1]  = 0; out[2] = 0; out[3] = 0;
    out[4]  = 0;
    out[5]  = f;
    out[6]  = 0; out[7] = 0;
    out[8]  = 0; out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0; out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
    return out;
};

Mat4.ortho = function(left, right, bottom, top, near, far, out = null) {
    out ??= new Float32Array(16);
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);

    out[0]  = -2 * lr;
    out[1]  = 0; out[2] = 0; out[3] = 0;
    out[4]  = 0;
    out[5]  = -2 * bt;
    out[6]  = 0; out[7] = 0;
    out[8]  = 0; out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
};

Mat4.lookAt = function(eye, target, up, out = null) {
    out ??= new Float32Array(16);

    let fx = eye[0] - target[0];
    let fy = eye[1] - target[1];
    let fz = eye[2] - target[2];
    let len = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (len < EPSILON) {
        out.set(Mat4.IDENTITY);
        return out;
    }
    const invLenF = 1 / len;
    fx *= invLenF; fy *= invLenF; fz *= invLenF;

    // right = up × forward
    let rx = up[1] * fz - up[2] * fy;
    let ry = up[2] * fx - up[0] * fz;
    let rz = up[0] * fy - up[1] * fx;
    len = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (len < EPSILON) { rx = 0; ry = 0; rz = 0; }
    else {
        const invLenR = 1 / len;
        rx *= invLenR; ry *= invLenR; rz *= invLenR;
    }

    // recalc up = forward × right
    const ux = fy * rz - fz * ry;
    const uy = fz * rx - fx * rz;
    const uz = fx * ry - fy * rx;

    out[0]  = rx;    out[1]  = ux;    out[2]  = fx;    out[3]  = 0;
    out[4]  = ry;    out[5]  = uy;    out[6]  = fy;    out[7]  = 0;
    out[8]  = rz;    out[9]  = uz;    out[10] = fz;    out[11] = 0;
    out[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
    out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
    out[14] = -(fx * eye[0] + fy * eye[1] + fz * eye[2]);
    out[15] = 1;
    return out;
};

Mat4.transformV2 = function(m, v, out = null) {
    out ??= new Float32Array(2);
    const x = v[0], y = v[1];
    out[0] = m[0] * x + m[4] * y + m[12];
    out[1] = m[1] * x + m[5] * y + m[13];
    return out;
};

Mat4.transformV3 = function(m, v, out = null) {
    out ??= new Float32Array(3);
    const x = v[0], y = v[1], z = v[2];
    const w = 1 / (m[3] * x + m[7] * y + m[11] * z + m[15]);
    out[0] = (m[0] * x + m[4] * y + m[8]  * z + m[12]) * w;
    out[1] = (m[1] * x + m[5] * y + m[9]  * z + m[13]) * w;
    out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * w;
    return out;
};

Mat4.transformV4 = function(m, v, out = null) {
    out ??= new Float32Array(4);
    const x = v[0], y = v[1], z = v[2], w = v[3];
    out[0] = m[0] * x + m[4] * y + m[8]  * z + m[12] * w;
    out[1] = m[1] * x + m[5] * y + m[9]  * z + m[13] * w;
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
    out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
    return out;
};

export const Alm = {
    // Constants
    EPSILON,
    DEG2RAD,
    RAD2DEG,
    // Types
    Vec2,
    Vec3,
    Vec4,
    Quat,
    Mat4
};

if (typeof window !== "undefined") {
    window.Alm = Alm;
}

export default Alm;
