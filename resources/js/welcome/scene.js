const container = document.getElementById('main-canvas');

const ez = new ZCanvas("main-canvas", { antialias: true, alpha: true });
ez.mount(container).fitContainer();

const gl = ez.gl;

const camera = new ZCamera();
camera.fov = 45;
camera.near = 0.1;
camera.far = 200;
camera.aspect = container.clientWidth / container.clientHeight;

new ResizeObserver(() => {
    ez.fitContainer()
    camera.aspect = container.clientWidth / container.clientHeight;
}).observe(container);


const shader = new ZShader()
    .version('300 es')
    .stage(ZShader.STAGE.VERTEX)
    .inputs([
        { name: 'a_position', type: 'vec3' },
        { name: 'a_color',    type: 'vec3' }
    ])
    .outputs([{ name: 'v_color', type: 'vec3' }])
    .uniforms([
        { name: "u_view", type: "mat4" },
        { name: "u_proj", type: "mat4" },
        { name: 'u_time', type: 'float' }
    ])
    .main(`
        // Rotate around Y axis
        float angle = u_time * 100.0;
        mat4 rotY = mat4(
            cos(angle), 0.0, sin(angle), 0.0,
            0.0, 1.0, 0.0, 0.0,
            -sin(angle), 0.0, cos(angle), 0.0,
            0.0, 0.0, 0.0, 1.0
        );
        gl_Position = u_proj * u_view * rotY * vec4(a_position, 1.0);
        v_color = a_color;
    `)
    .stage(ZShader.STAGE.FRAGMENT)
    .inputs([{ name: 'v_color', type: 'vec3' }])
    .outputs([{ name: 'fragColor', type: 'vec4' }])
    .main(`
        fragColor = vec4(v_color, 1.0);
    `)
    .compile(gl);

const viewLoc = shader.getUniformLocation('u_view');
const projLoc = shader.getUniformLocation('u_proj');
const timeLoc = shader.getUniformLocation('u_time');

const posLoc = shader.getInputLocation('a_position');
const colLoc = shader.getInputLocation('a_color');

const verts = new Float32Array([
    0.0,  0.6,  -3.0,   1.0, 0.0, 0.0,
    -0.6, -0.4, -3.0,   1.0, 1.0, 0.0,
    0.6,  -0.4, -3.0,   0.0, 1.0, 0.0
]);

const vao = gl.createVertexArray();
const vbo = gl.createBuffer();

ZRender.uploadVBO(gl, vbo, verts, gl.STATIC_DRAW);

const stride = verts.BYTES_PER_ELEMENT * 6;
gl.bindVertexArray(vao);
ZRender.wireAttr(gl, { buffer: vbo, loc: posLoc, size: 3, stride, offset: 0 });
ZRender.wireAttr(gl, { buffer: vbo, loc: colLoc, size: 3, stride, offset: 3 * verts.BYTES_PER_ELEMENT });
gl.bindVertexArray(null);

const t0 = performance.now();
function frame(){
    const now = (performance.now() - t0) * 0.001;

    ZRender.applyState(gl, {clear: ["color", "depth"], clearColor: [0, 0, 0, 0]});

    shader.bind(gl);

    shader.setUniform(gl, 'u_view', camera.view);
    shader.setUniform(gl, 'u_proj', camera.projection);

    if (timeLoc != null) shader.setUniform(gl, 'u_time', now);
    ZRender.withVAO(gl, vao, () => {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);