// usage.js — building vertex + index buffers with ZBuffer
// The class knows nothing about "triangles" or "vertices";
// we bring all that meaning here.

const canvas = document.querySelector('canvas');
const gl     = canvas.getContext('webgl');

// ── 1. Geometry data (CPU side) ───────────────────────────

const vertices = new Float32Array([
  // x       y      r     g     b
   0.0,   0.6,   1.0, 0.4, 0.4,   // top — red
  -0.5,  -0.4,   0.4, 1.0, 0.5,   // bottom-left — green
   0.5,  -0.4,   0.4, 0.6, 1.0,   // bottom-right — blue
]);

const indices = new Uint16Array([0, 1, 2]);

// ── 2. Create ZBuffers ────────────────────────────────────

// Vertex buffer — interleaved pos+color, 20 bytes per vertex
const vbo = new ZBuffer(gl, gl.ARRAY_BUFFER,          gl.STATIC_DRAW)
  .upload(vertices);

// Index buffer — tells GPU which vertices to connect
const ibo = new ZBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW)
  .upload(indices);

// ── 3. Link layout to shader attributes ──────────────────

const STRIDE = 20;  // 5 floats × 4 bytes = 20 bytes per vertex
const posLoc = gl.getAttribLocation(program, 'a_pos');
const colLoc = gl.getAttribLocation(program, 'a_color');

vbo
  .attrib(posLoc, 2, gl.FLOAT, false, STRIDE, 0)   // vec2 at byte 0
  .attrib(colLoc, 3, gl.FLOAT, false, STRIDE, 8);  // vec3 at byte 8

// ── 4. Draw ───────────────────────────────────────────────

function render() {
  gl.clear(gl.COLOR_BUFFER_BIT);
  ibo.bind();
  gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0);
  requestAnimationFrame(render);
}