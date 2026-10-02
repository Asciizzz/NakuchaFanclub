export const VST_RACK_WGSL = /* wgsl */ `
struct SceneUniforms {
	resolution: vec2<f32>,
	time: f32,
	visualOffset: f32,
};

@group(0) @binding(0) var<uniform> uniforms: SceneUniforms;

struct VertexOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
	var out: VertexOutput;
	var pos = array<vec2<f32>, 3>(
		vec2<f32>(-1.0, -1.0),
		vec2<f32>( 3.0, -1.0),
		vec2<f32>(-1.0,  3.0)
	);
	let p = pos[vertex_index];
	out.position = vec4<f32>(p, 0.0, 1.0);
	out.uv = p * 0.5 + 0.5;
	return out;
}

// =============================================================================
// Minimalist High-Key Chalk-White VST Audio Console
// Muted, subtle, and airy aesthetic matching Torinoko City white/chalk palette
// =============================================================================

const PI: f32 = 3.141592653589793;

fn r2d(p: vec2<f32>, t: f32) -> vec2<f32> {
	let c = cos(t);
	let s = sin(t);
	return vec2<f32>(p.x * c + p.y * s, -p.x * s + p.y * c);
}

struct Basis {
	x: vec3<f32>,
	y: vec3<f32>,
	z: vec3<f32>,
};

fn orthbas(zIn: vec3<f32>) -> Basis {
	let z = normalize(zIn);
	var up = vec3<f32>(0.0, 1.0, 0.0);
	if (abs(z.y) > 0.999) {
		up = vec3<f32>(0.0, 0.0, 1.0);
	}
	let x = normalize(cross(up, z));
	return Basis(x, cross(z, x), z);
}

fn basisMul(b: Basis, v: vec3<f32>) -> vec3<f32> {
	return b.x * v.x + b.y * v.y + b.z * v.z;
}

fn pcg3d(sIn: vec3<u32>) -> vec3<u32> {
	var s = sIn * 1145141919u + 1919810u;
	s.x += s.y * s.z;
	s.y += s.z * s.x;
	s.z += s.x * s.y;
	s ^= (s >> vec3<u32>(16u, 16u, 16u));
	s.x += s.y * s.z;
	s.y += s.z * s.x;
	s.z += s.x * s.y;
	return s;
}

fn pcg3df(s: vec3<f32>) -> vec3<f32> {
	let r = pcg3d(bitcast<vec3<u32>>(s));
	return vec3<f32>(r) / 4294967295.0;
}

struct Grid {
	s: vec3<f32>,
	c: vec3<f32>,
	h: vec3<f32>,
	i: i32,
	d: f32,
};

fn dogrid(ro: vec3<f32>, rd: vec3<f32>) -> Grid {
	var r: Grid;
	r.s = vec3<f32>(2.0, 2.0, 100.0);
	for (var i = 0; i < 3; i++) {
		r.c = (floor(ro / r.s) + 0.5) * r.s;
		r.h = pcg3df(r.c);
		r.i = i;

		if (r.h.x < 0.4) {
			break;
		} else if (i == 0) {
			r.s = vec3<f32>(2.0, 1.0, 100.0);
		} else if (i == 1) {
			r.s = vec3<f32>(1.0, 1.0, 100.0);
		}
	}

	let src = -(ro - r.c) / rd;
	let dst = abs(0.501 * r.s / rd);
	let bv = src + dst;
	let b = min(min(bv.x, bv.y), bv.z);
	r.d = b;

	return r;
}

fn sdbox3(p: vec3<f32>, s: vec3<f32>) -> f32 {
	let d = abs(p) - s;
	return length(max(d, vec3<f32>(0.0))) + min(0.0, max(max(d.x, d.y), d.z));
}

fn sdbox2(p: vec2<f32>, s: vec2<f32>) -> f32 {
	let d = abs(p) - s;
	return length(max(d, vec2<f32>(0.0))) + min(0.0, max(d.x, d.y));
}

fn lofi(i: f32, j: f32) -> f32 {
	return floor(i / j) * j;
}

fn lofir(i: f32, j: f32) -> f32 {
	return round(i / j) * j;
}

fn lofi2(i: vec2<f32>, j: vec2<f32>) -> vec2<f32> {
	return floor(i / j) * j;
}

// Map scene Signed Distance Fields with conservative distance culling
fn map(pIn: vec3<f32>, grid: Grid, time: f32) -> vec4<f32> {
	var p = pIn - grid.c;
	p.z += 0.4 * sin(2.0 * time + 1.0 * fract(grid.h.z * 28.0) + 0.3 * (grid.c.x + grid.c.y));

	let psize = vec3<f32>(grid.s.x * 0.5 - 0.02, grid.s.y * 0.5 - 0.02, 0.98);
	var d = sdbox3(p + vec3<f32>(0.0, 0.0, 1.0), psize) - 0.02;

	var pcol = 1.0;
	var pt = p;

	if (grid.i == 0) {
		// 2x2 Module Unit
		if (grid.h.y < 0.3) {
			// Speaker grill array (evaluated only near surface)
			if (d < 0.15) {
				pt = vec3<f32>(r2d(pt.xy, PI * 0.25), pt.z);
				var c = vec3<f32>(0.0);
				c.x = lofir(pt.x, 0.1);
				c.y = lofir(pt.y, 0.1);
				pt = pt - c;
				pt = vec3<f32>(r2d(pt.xy, -PI * 0.25), pt.z);

				let r = 0.02 * smoothstep(0.9, 0.7, abs(p.x)) * smoothstep(0.9, 0.7, abs(p.y));
				let hole = length(pt.xy) - r;
				d = max(d, -hole);
			}
		} else if (grid.h.y < 0.5) {
			// Graphic EQ sliders
			var c = vec3<f32>(0.0);
			c.x = clamp(lofir(pt.x, 0.2), -0.6, 0.6);
			pt = pt - c;
			let hole = sdbox2(pt.xy, vec2<f32>(0.0, 0.7)) - 0.03;
			d = max(d, -hole);

			pt.y -= 0.5 - smoothstep(-0.5, 0.5, sin(time + c.x + grid.h.z * 100.0));
			let d2 = sdbox3(pt, vec3<f32>(0.02, 0.07, 0.07)) - 0.03;

			if (d2 < d) {
				let l = step(abs(pt.y), 0.02);
				return vec4<f32>(d2, 2.0 * l, l, 0.0);
			}

			if (d < 0.1) {
				pt = p;
				c.y = clamp(lofir(pt.y, 0.2), -0.6, 0.6);
				pt = pt - c;
				pcol *= smoothstep(0.0, 0.01, sdbox2(pt.xy, vec2<f32>(0.07, 0.0)) - 0.005);

				pt = p;
				c.y = clamp(lofir(pt.y, 0.6), -0.6, 0.6);
				pt = pt - c;
				pcol *= smoothstep(0.0, 0.01, sdbox2(pt.xy, vec2<f32>(0.1, 0.0)) - 0.01);
				pcol = mix(1.0, pcol, smoothstep(0.0, 0.01, sdbox2(pt.xy, vec2<f32>(0.03, 1.0)) - 0.01));
			}
		} else if (grid.h.y < 0.6) {
			// Kaoss dynamic touch pad
			let hole = sdbox2(p.xy, vec2<f32>(0.9, 0.9) + 0.02);
			d = max(d, -hole);

			let d2 = sdbox3(p, vec3<f32>(0.9, 0.9, 0.05));
			if (d2 < d) {
				let l = step(abs(p.x), 0.7) * step(abs(p.y), 0.7);
				return vec4<f32>(d2, 4.0 * l, 0.0, 0.0);
			}
		} else {
			// Large master potentiometer dial
			let ani = smoothstep(-0.5, 0.5, sin(time + grid.h.z * 100.0));
			pt = vec3<f32>(r2d(pt.xy, (PI * 5.0 / 6.0) * mix(-1.0, 1.0, ani)), pt.z);

			let metal = step(length(pt.xy), 0.45);
			var d2 = length(pt.xy) - 0.63 + 0.05 * pt.z;
			if (d < 0.08) {
				d2 -= 0.02 * cos(8.0 * atan2(pt.y, pt.x));
			}
			d2 = max(d2, abs(pt.z) - 0.4);

			let d2b = max(length(pt.xy) - 0.67 + 0.05 * pt.z, abs(pt.z) - 0.04);
			d2 = min(d2, d2b);

			if (d2 < d) {
				let l = smoothstep(0.01, 0.0, length(pt.xy - vec2<f32>(0.0, 0.53)) - 0.03);
				return vec4<f32>(d2, 3.0 * metal, l, 0.0);
			}

			if (d < 0.1) {
				pt = p;
				var a = clamp(lofir(atan2(-pt.x, pt.y), PI / 12.0), -PI * 5.0 / 6.0, PI * 5.0 / 6.0);
				pt = vec3<f32>(r2d(pt.xy, a), pt.z);
				pcol *= smoothstep(0.0, 0.01, length(pt.xy - vec2<f32>(0.0, 0.74)) - 0.015);

				pt = p;
				a = clamp(lofir(atan2(-pt.x, pt.y), PI * 5.0 / 6.0), -PI * 5.0 / 6.0, PI * 5.0 / 6.0);
				pt = vec3<f32>(r2d(pt.xy, a), pt.z);
				pcol *= smoothstep(0.0, 0.01, length(pt.xy - vec2<f32>(0.0, 0.74)) - 0.03);
			}

			let d3 = length(p - vec3<f32>(0.7, -0.7, 0.0)) - 0.05;
			if (d3 < d) {
				let led = (1.0 - ani) * (0.5 + 0.5 * sin(time * exp2(3.0 + 3.0 * grid.h.z)));
				return vec4<f32>(d3, 2.0, led, 0.0);
			}
		}
	} else if (grid.i == 1) {
		// 2x1 Module Unit
		if (grid.h.y < 0.4) {
			// Horizontal channel fader
			let hole = sdbox2(p.xy, vec2<f32>(0.9, 0.05));
			d = max(d, -hole);

			let ani = smoothstep(-0.2, 0.2, sin(time + grid.h.z * 100.0));
			pt.x -= mix(-0.8, 0.8, ani);

			var d2 = sdbox3(pt, vec3<f32>(0.07, 0.25, 0.4)) + 0.05 * p.z;
			d2 = max(d2, -p.z);

			if (d2 < d) {
				let l = smoothstep(0.01, 0.0, abs(p.y) - 0.02);
				return vec4<f32>(d2, 0.0, l, 0.0);
			}

			if (d < 0.1) {
				pt = p;
				var c = vec3<f32>(0.0);
				c.x = clamp(lofir(pt.x, 0.2), -0.8, 0.8);
				pt = pt - c;
				pcol *= smoothstep(0.0, 0.01, sdbox2(pt.xy, vec2<f32>(0.0, 0.15)) - 0.005);

				pt = p;
				c = vec3<f32>(0.0);
				c.x = clamp(lofir(pt.x, 0.8), -0.8, 0.8);
				pt = pt - c;
				pcol *= smoothstep(0.0, 0.01, sdbox2(pt.xy, vec2<f32>(0.0, 0.18)) - 0.01);
				pcol = mix(1.0, pcol, smoothstep(0.0, 0.01, sdbox2(p.xy, vec2<f32>(1.0, 0.08))));
			}
		} else if (grid.h.y < 0.5) {
			// 808 Step-sequencer illuminated buttons
			var c = vec3<f32>(0.0);
			c.x = clamp(lofi(pt.x, 0.44) + 0.22, -0.66, 0.66);
			pt = pt - c;

			let hole = sdbox2(pt.xy, vec2<f32>(0.19, 0.33)) - 0.01;
			d = max(d, -hole);

			let ani = smoothstep(0.8, 0.9, sin(10.0 * time - c.x * 2.2 + grid.h.z * 100.0));

			var best = vec4<f32>(d, 0.0, 0.0, 0.0);
			let d3 = length(pt - vec3<f32>(0.0, 0.22, 0.04)) - 0.05;

			if (d3 < best.x) {
				best = vec4<f32>(d3, 2.0, ani, 0.0);
			}

			var d2 = sdbox3(pt, vec3<f32>(0.17, 0.3, 0.05)) - 0.01;
			d2 = min(d2, sdbox3(pt - vec3<f32>(0.0, -0.1, 0.0), vec3<f32>(0.17, 0.2, 0.08)) - 0.01) + 0.5 * pt.z;

			if (d2 < best.x) {
				best = vec4<f32>(d2, 5.0, fract(grid.h.z * 8.89), 0.0);
			}

			if (best.x < d) {
				return best;
			}
		} else {
			// Stereo VU level meter
			let hole = sdbox2(p.xy, vec2<f32>(0.9, 0.3) + 0.02);
			d = max(d, -hole);

			let d2 = sdbox3(p, vec3<f32>(0.9, 0.3, 0.1));
			if (d2 < d) {
				let l = step(abs(p.x), 0.8) * step(abs(p.y), 0.2);
				return vec4<f32>(d2, l, 0.0, 0.0);
			}
		}
	} else {
		// 1x1 Module Unit
		if (grid.h.y < 0.5) {
			// Rotary micro-knob
			let hole = length(p.xy) - 0.25;
			d = max(d, -hole);

			let ani = smoothstep(-0.5, 0.5, sin(2.0 * time + grid.h.z * 100.0));
			pt = vec3<f32>(r2d(pt.xy, (PI * 5.0 / 6.0) * mix(-1.0, 1.0, ani)), pt.z);

			let d2 = max(length(pt.xy) - 0.23 + 0.05 * pt.z, abs(pt.z) - 0.4);
			if (d2 < d) {
				var l = smoothstep(0.01, 0.0, abs(pt.x) - 0.015);
				l *= smoothstep(0.01, 0.0, -pt.y + 0.05);
				return vec4<f32>(d2, 0.0, l, 0.0);
			}

			if (d < 0.1) {
				pt = p;
				var a = clamp(lofir(atan2(-pt.x, pt.y), PI / 6.0), -PI * 5.0 / 6.0, PI * 5.0 / 6.0);
				pt = vec3<f32>(r2d(pt.xy, a), pt.z);
				pcol *= smoothstep(0.0, 0.01, sdbox2(pt.xy - vec2<f32>(0.0, 0.34), vec2<f32>(0.0, 0.02)) - 0.005);

				pt = p;
				a = clamp(lofir(atan2(-pt.x, pt.y), PI * 5.0 / 6.0), -PI * 5.0 / 6.0, PI * 5.0 / 6.0);
				pt = vec3<f32>(r2d(pt.xy, a), pt.z);
				pcol *= smoothstep(0.0, 0.01, sdbox2(pt.xy - vec2<f32>(0.0, 0.34), vec2<f32>(0.0, 0.03)) - 0.01);
			}
		} else if (grid.h.y < 0.8) {
			// Quarter-inch stereo audio jack socket
			let hole = length(p.xy) - 0.1;
			d = max(d, -hole);

			var d2 = max(length(p.xy) - 0.15, abs(p.z) - 0.12);

			if (d < 0.15) {
				pt = vec3<f32>(r2d(pt.xy, 100.0 * grid.h.z), pt.z);
				var d3 = abs(pt.y) - 0.2;
				pt = vec3<f32>(r2d(pt.xy, PI * 2.0 / 3.0), pt.z);
				d3 = max(d3, abs(pt.y) - 0.2);
				pt = vec3<f32>(r2d(pt.xy, PI * 2.0 / 3.0), pt.z);
				d3 = max(d3, abs(pt.y) - 0.2);
				d3 = max(d3, abs(p.z) - 0.03);

				d2 = min(d2, d3);
				d2 = max(d2, -hole);
			}

			if (d2 < d) {
				return vec4<f32>(d2, 3.0, 0.0, 0.0);
			}
		} else if (grid.h.y < 0.99) {
			// Push-latch button with LED indicator
			pt.y += 0.08;
			let hole = sdbox2(pt.xy, vec2<f32>(0.22, 0.22)) - 0.05;
			d = max(d, -hole);

			let aniSin = sin(2.0 * time + grid.h.z * 100.0);
			let push = smoothstep(0.3, 0.0, abs(aniSin));
			let ani = smoothstep(-0.1, 0.1, aniSin);
			pt.z += 0.06 * push;

			let d2 = sdbox3(pt, vec3<f32>(0.2, 0.2, 0.05)) - 0.05;
			if (d2 < d) {
				return vec4<f32>(d2, 0.0, 0.0, 0.0);
			}

			let d3 = length(p - vec3<f32>(0.0, 0.3, 0.0)) - 0.05;
			if (d3 < d) {
				return vec4<f32>(d3, 2.0, ani, 0.0);
			}
		} else {
			// Laser-etched graphic mark
			pt = vec3<f32>(abs(pt.xy), pt.z);
			if (pt.x < pt.y) {
				pt = vec3<f32>(pt.y, pt.x, pt.z);
			}
			pcol *= smoothstep(0.0, 0.01, sdbox2(pt.xy, vec2<f32>(0.05, 0.05)));
			pcol *= smoothstep(0.0, 0.01, sdbox2(pt.xy - vec2<f32>(0.2, 0.0), vec2<f32>(0.05, 0.15)));
			pcol = 1.0 - pcol;
		}
	}

	return vec4<f32>(d, 0.0, pcol, 0.0);
}

// 3-tap forward difference normal calculation
fn nmap(p: vec3<f32>, grid: Grid, dd: f32, time: f32) -> vec3<f32> {
	let h = map(p, grid, time).x;
	let e = vec2<f32>(dd, 0.0);
	return normalize(vec3<f32>(
		map(p + e.xyy, grid, time).x - h,
		map(p + e.yxy, grid, time).x - h,
		map(p + e.yyx, grid, time).x - h
	));
}

struct March {
	isect: vec4<f32>,
	rp: vec3<f32>,
	rl: f32,
	grid: Grid,
};

fn domarch(ro: vec3<f32>, rd: vec3<f32>, iter: i32, time: f32) -> March {
	var rl: f32 = 0.01;
	var rp = ro + rd * rl;
	var isect = vec4<f32>(1.0);
	var grid = dogrid(rp, rd);
	var gridlen = rl;

	for (var i = 0; i < iter; i++) {
		if (gridlen <= rl) {
			grid = dogrid(rp, rd);
			gridlen += grid.d;
		}

		isect = map(rp, grid, time);
		rl = min(rl + isect.x * 0.94, gridlen);
		rp = ro + rd * rl;

		if (abs(isect.x) < 0.0002 || rl > 28.0) {
			break;
		}
	}

	var r: March;
	r.isect = isect;
	r.rp = rp;
	r.rl = rl;
	r.grid = grid;
	return r;
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
	let aspect = uniforms.resolution.x / uniforms.resolution.y;
	let p = (uv * 2.0 - 1.0) * vec2<f32>(aspect, 1.0);

	let time = uniforms.time;

	// Site Core Color Palette: High-key chalk white with pale cyan / steel blue accents
	let cPureWhite  = vec3<f32>(0.995, 0.998, 1.000); // #FFFFFF pure white
	let cChalkWhite = vec3<f32>(0.925, 0.957, 0.980); // #E8F2FA crisp chalk
	let cCyanDust   = vec3<f32>(0.690, 0.784, 0.863); // #B0C8DC soft dusty pale cyan
	let cSteelBlue  = vec3<f32>(0.294, 0.420, 0.541); // #4B6B8A steel blue

	// Cinematic perspective camera sweeping smoothly through the synth rack
	let canim = smoothstep(-0.2, 0.2, sin(time * 0.4));
	var co = mix(vec3<f32>(-6.0, -8.0, -40.0), vec3<f32>(0.0, -2.0, -40.0), canim);
	var ct = vec3<f32>(0.0, 0.0, -50.0);
	let cr = mix(0.35, 0.0, canim);

	// Slow ambient drift + horizontal section transition panning
	let shiftX = uniforms.visualOffset * 0.008;
	co.x += time * 0.5 + shiftX;
	co.y += time * 0.5;
	ct.x += time * 0.5 + shiftX;
	ct.y += time * 0.5;

	let cb = orthbas(co - ct);
	let ro = co + basisMul(cb, vec3<f32>(4.0 * r2d(p, cr), 0.0));
	let rd = basisMul(cb, normalize(vec3<f32>(0.0, 0.0, -2.0)));

	// Fast primary raymarch (38 steps max)
	let march = domarch(ro, rd, 38, time);

	// Atmospheric studio void: deep calming slate-navy (low-glare, eye-friendly)
	let cVoid = vec3<f32>(0.035, 0.055, 0.085);
	var col = cVoid;

	if (march.isect.x < 0.01) {
		// Muted studio console materials: steel-navy slate chassis with subtle cyan accents
		var basecol = vec3<f32>(0.10, 0.15, 0.22);
		var speccol = vec3<f32>(0.25, 0.35, 0.45);
		var specpow = 24.0;
		var ndelta = 0.0002;
		var emissive = vec3<f32>(0.0);

		let mtl = march.isect.y;
		var mtlp = march.isect.z;

		if (mtl == 0.0) {
			// Panel chassis: Soothing matte steel-navy slate with delicate pale cyan engravings
			mtlp = mix(mtlp, 1.0 - mtlp, step(fract(march.grid.h.z * 66.0), 0.1));
			basecol = mix(vec3<f32>(0.10, 0.15, 0.22), vec3<f32>(0.24, 0.38, 0.52), mtlp * 0.35);
			speccol = vec3<f32>(0.15, 0.22, 0.30);
			specpow = 20.0;
		} else if (mtl == 1.0) {
			// VU meter: Muted backlit LCD segments (soft sea-cyan with gentle warm amber peak)
			let size = vec2<f32>(0.05, 0.2);
			let pp = (march.rp - march.grid.c).xy;
			let c = lofi2(pp, size) + size * 0.5;
			let cc = pp - c;
			let ledShape = exp(-50.0 * sdbox2(cc, vec2<f32>(0.0, 0.08)));

			let isPeak = select(0.0, 1.0, c.x > 0.45);
			let segColor = mix(vec3<f32>(0.32, 0.72, 0.88), vec3<f32>(0.85, 0.48, 0.38), isPeak);

			let audioSync = 0.5 + 0.42 * sin(time * 3.5 + march.grid.h.z * 25.0);
			let isLit = step(c.x, -0.8 + 1.6 * audioSync);

			basecol = vec3<f32>(0.04, 0.06, 0.09);
			speccol = vec3<f32>(0.30, 0.40, 0.50);
			specpow = 40.0;

			emissive = ledShape * isLit * segColor * 0.75;
		} else if (mtl == 2.0) {
			// Indicator LEDs: Subtle sky-cyan and warm pearl status diodes
			basecol = vec3<f32>(0.08, 0.12, 0.16);
			speccol = vec3<f32>(0.4);
			specpow = 45.0;
			let ledTint = mix(vec3<f32>(0.40, 0.75, 0.92), vec3<f32>(0.90, 0.72, 0.50), fract(march.grid.h.z * 17.1));
			emissive = mtlp * ledTint * 0.65;
		} else if (mtl == 3.0) {
			// Metal knobs and jacks: Anodized dark steel-blue aluminum with crisp specular glints
			basecol = vec3<f32>(0.14, 0.20, 0.28);
			speccol = vec3<f32>(0.60, 0.75, 0.90);
			specpow = 40.0;
			ndelta = 0.015;
		} else if (mtl == 4.0) {
			// Kaoss pad: Deep oceanic frosted glass with soothing cyan ripples
			basecol = vec3<f32>(0.06, 0.11, 0.17);
			speccol = vec3<f32>(0.30, 0.45, 0.55);
			specpow = 25.0;

			let size = vec2<f32>(0.1, 0.1);
			let pp = (march.rp - march.grid.c).xy;
			let c = lofi2(pp, size) + size * 0.5;
			let cc = pp - c;
			let ledShape = exp(-45.0 * sdbox2(cc, vec2<f32>(0.0, 0.0)));

			var plasma = sin(length(c) * 7.0 - 4.0 * time + march.grid.h.z * 0.7);
			plasma += sin(c.y * 7.0 - 3.0 * time);
			let padColor = mix(vec3<f32>(0.20, 0.55, 0.75), vec3<f32>(0.40, 0.70, 0.85), sin(plasma) * 0.5 + 0.5);
			emissive = 0.45 * ledShape * padColor;
		} else if (mtl == 5.0) {
			// 808 Step buttons: Tactile dual-tone slate-teal keycaps
			let btnTint = select(vec3<f32>(0.12, 0.18, 0.25), vec3<f32>(0.20, 0.30, 0.40), mtlp > 0.5);
			basecol = btnTint;
			speccol = vec3<f32>(0.25, 0.35, 0.45);
			specpow = 24.0;
		}

		let n = nmap(march.rp, march.grid, ndelta, time);
		let v = -rd;

		// Key directional light: crisp cool daylight from upper-right
		let l1 = normalize(vec3<f32>(1.2, 3.0, 4.0));
		let h1 = normalize(l1 + v);
		let dotnl1 = max(0.0, dot(n, l1));
		let dotnh1 = max(0.0, dot(n, h1));
		let shadow1 = step(0.08, domarch(march.rp, l1, 6, time).isect.x);
		let softShadow = mix(0.38, 1.0, shadow1);

		let lightCol1 = vec3<f32>(0.85, 0.93, 1.0);
		let diff1 = basecol * dotnl1 * lightCol1 * 0.85;
		let spec1 = speccol * pow(dotnh1, specpow) * lightCol1 * 0.60;

		// Fill light: soft cyan-steel ambient fill from lower-left
		let l2 = normalize(vec3<f32>(-1.0, -1.0, 4.0));
		let h2 = normalize(l2 + v);
		let dotnl2 = max(0.0, dot(n, l2));
		let dotnh2 = max(0.0, dot(n, h2));

		let lightCol2 = vec3<f32>(0.45, 0.60, 0.75);
		let diff2 = basecol * dotnl2 * lightCol2 * 0.40;
		let spec2 = speccol * pow(dotnh2, specpow) * lightCol2 * 0.25;

		// Gentle ambient base term
		let ambient = basecol * 0.45;

		var surface = ambient + (diff1 + spec1) * softShadow + (diff2 + spec2) + emissive;

		// Distance fog smoothly fading distant modules into atmospheric void
		let fog = smoothstep(12.0, 26.0, march.rl);
		col = mix(surface, cVoid, fog);
	} else {
		// Missed ray / infinite horizon
		col = cVoid;
	}

	// Tone mapping, gamma correction, and soft contrast clamp
	col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(0.4545));
	col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

	return vec4<f32>(col, 1.0);
}
`;
