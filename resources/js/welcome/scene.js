const container = document.getElementById("main-canvas");

const ez = new ZCanvas("main-canvas", { antialias: true, alpha: true });
ez.mount(container).fitContainer();

const gl = ez.gl;

const camera = new ZCamera();
camera.fov = 45;
camera.near = 0.1;
camera.far = 200;
camera.position = ZMath.V3.set(0, 0, 0);
camera.aspect = container.clientWidth / container.clientHeight;

new ResizeObserver(() => {
    ez.fitContainer();
    camera.aspect = container.clientWidth / container.clientHeight;
}).observe(container);

const shader = new ZShader()
    .version("300 es")
    .stage(ZShader.STAGE.VERTEX)
    .inputs([
        { name: "a_position", type: "vec3" },
        { name: "a_color", type: "vec3" },
    ])
    .outputs([{ name: "v_color", type: "vec3" }])
    .uniforms([
        { name: "u_view", type: "mat4" },
        { name: "u_proj", type: "mat4" },
        { name: "u_model", type: "mat4" },
    ])
    .main(`
        gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
        v_color = a_color;
    `)
    .stage(ZShader.STAGE.FRAGMENT)
    .inputs([{ name: "v_color", type: "vec3" }])
    .outputs([{ name: "fragColor", type: "vec4" }])
    .main(`
        fragColor = vec4(v_color, 1.0);
    `)
    .compile(gl);

function buildRectMesh() {
    const rectVerts = [
        // x, y,   r, g, b
        -0.8, -0.8, 1.0, 0.2, 0.2,
         0.8, -0.8, 0.2, 1.0, 0.2,
         0.8,  0.8, 0.2, 0.4, 1.0,
        -0.8,  0.8, 1.0, 0.8, 0.2,
    ];
    const rectIndices = [0, 1, 2, 0, 2, 3];

    return new ZMesh()
        .vertexLayout([
            { name: "a_position", type: "float32", size: 2 },
            { name: "a_color", type: "float32", size: 3 },
        ])
        .submesh({
            vertices: rectVerts,
            indices: rectIndices,
        })
        .build(gl);
}

function buildCubeMesh() {
    const p = [
        // front
        -1, -1,  1,   1, 0, 0,
         1, -1,  1,   0, 1, 0,
         1,  1,  1,   0, 0, 1,
        -1,  1,  1,   1, 1, 0,
        // back
        -1, -1, -1,   1, 0, 1,
         1, -1, -1,   0, 1, 1,
         1,  1, -1,   1, 1, 1,
        -1,  1, -1,   0.3, 0.3, 0.3,
    ];
    const idx = [
        0, 1, 2, 0, 2, 3, // front
        1, 5, 6, 1, 6, 2, // right
        5, 4, 7, 5, 7, 6, // back
        4, 0, 3, 4, 3, 7, // left
        3, 2, 6, 3, 6, 7, // top
        4, 5, 1, 4, 1, 0, // bottom
    ];

    return new ZMesh()
        .vertexLayout([
            { name: "a_position", type: "float32", size: 3 },
            { name: "a_color", type: "float32", size: 3 },
        ])
        .submesh({
            vertices: p,
            indices: idx,
        })
        .build(gl);
}

const rectMesh = buildRectMesh();
const cubeMesh = buildCubeMesh();
const rectVaoEntry = rectMesh.getVAO(gl, shader, {
    a_position: "a_position",
    a_color: "a_color",
}, 0);
const cubeVaoEntry = cubeMesh.getVAO(gl, shader, null, 0);

const rectModel = ZMath.M4.identity();
rectModel[12] = -1.9;
rectModel[14] = -5.0;

const cubeModel = ZMath.M4.identity();
cubeModel[12] = 1.9;
cubeModel[14] = -7.0;

const modelScratch = ZMath.M4.identity();
const rotScratch = ZMath.M4.identity();

function drawMesh(mesh, vaoEntry) {
    if (!vaoEntry) return;
    ZRender.withVAO(gl, vaoEntry.vao, () => {
        for (let i = 0; i < mesh.submeshes.length; i++) {
            const sm = mesh.submeshes[i];
            if (sm.indexCount > 0 && mesh.indexBuffer) {
                gl.drawElements(sm.mode ?? gl.TRIANGLES, sm.indexCount, mesh.indexType, sm.indexOffset * mesh.indexBytes);
            } else {
                gl.drawArrays(sm.mode ?? gl.TRIANGLES, sm.vertexOffset, sm.vertexCount);
            }
        }
    });
}

const start = performance.now();
function frame() {
    const t = (performance.now() - start) * 0.001;

    ZRender.applyState(gl, {
        clear: ["color", "depth"],
        clearColor: [0, 0, 0, 0],
        depthTest: true,
        cull: "back",
    });

    shader.bind(gl);
    shader.setUniform(gl, "u_view", camera.view);
    shader.setUniform(gl, "u_proj", camera.projection);
    shader.setUniform(gl, "u_model", rectModel);
    drawMesh(rectMesh, rectVaoEntry);

    const rot = t * 0.9;
    rotScratch.set([
         Math.cos(rot), 0, Math.sin(rot), 0,
         0,             1, 0,             0,
        -Math.sin(rot), 0, Math.cos(rot), 0,
         0,             0, 0,             1,
    ]);
    ZMath.M4.mul(cubeModel, rotScratch, modelScratch);
    shader.setUniform(gl, "u_model", modelScratch);
    drawMesh(cubeMesh, cubeVaoEntry);

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
