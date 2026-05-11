const canvas = document.getElementById('main-canvas');

const ez = new EzCanvas3D("main-canvas", { antialias: true, alpha: true });
ez.mount(canvas).fitContainer();

const gl = ez.gl;

const camera = new EzCamera3D();
camera.set({
    fov: 45,
    near: 0.1,
    far: 200,
    aspect: canvas.clientWidth / canvas.clientHeight,
});

new ResizeObserver(() => {
    ez.fitContainer()
    camera.set({ aspect: canvas.clientWidth / canvas.clientHeight });
}).observe(canvas);


const shader = new EzShader()
    .version('300 es')
    .stage(EzShader.STAGE.VERTEX)
    .inputs([
        { name: 'a_position', type: 'vec2' },
        { name: 'a_color',    type: 'vec3' }
    ])
    .outputs([{ name: 'v_color', type: 'vec3' }])
    .uniform({ name: 'u_time', type: 'float' })
    .main(`
        float s = sin(u_time), c = cos(u_time);
        mat2 R = mat2(c, -s, s, c);
        vec2 p = R * a_position;
        gl_Position = vec4(p, 0.0, 1.0);
        v_color = a_color;
    `)
    .stage(EzShader.STAGE.FRAGMENT)
    .inputs([{ name: 'v_color', type: 'vec3' }])
    .outputs([{ name: 'fragColor', type: 'vec4' }])
    .main(`
        fragColor = vec4(v_color, 1.0);
    `)
    .compile(gl);

const posLoc = shader.getAttributeLocation('a_position');
const colLoc = shader.getAttributeLocation('a_color');
const timeLoc = shader.getUniformLocation('u_time');

const verts = new Float32Array([
    0.0,  0.6,   1.0, 0.0, 0.0,
    -0.6, -0.4,  0.0, 1.0, 1.0,
    0.6,  -0.4,  0.0, 0.0, 1.0
]);

const vao = gl.createVertexArray();
const vbo = gl.createBuffer();
// upload buffer via EzRender helper (handles grow/subdata)
EzRender.uploadVBO(gl, vbo, verts, gl.STATIC_DRAW);
const stride = 5 * 4;
gl.bindVertexArray(vao);
EzRender.wireAttr(gl, { buffer: vbo, loc: posLoc, size: 2, stride, offset: 0 });
EzRender.wireAttr(gl, { buffer: vbo, loc: colLoc, size: 3, stride, offset: 2 * 4 });
gl.bindVertexArray(null);
gl.clearColor(0.08, 0.09, 0.12, 1.0);

const t0 = performance.now();
function frame(){
    const now = (performance.now() - t0) * 0.001;

    EzRender.applyState(gl, {clear: ["color", "depth"], clearColor: [0, 0, 0, 0]});
    EzRender.bind(gl, shader.program);
    if (timeLoc != null) EzRender.setUniform(gl, shader.program, 'float', timeLoc, now);
    EzRender.withVAO(gl, vao, () => {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);