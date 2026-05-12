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
    .write({ version: "300 es" })
    .write({
        stage: ZShader.STAGE.VERTEX,
        inputs: [
            { name: "a_position", type: "vec3" },
            { name: "a_color", type: "vec3" },
        ],
        outputs: [{ name: "v_color", type: "vec3" }],
        uniforms: [
            { name: "u_view", type: "mat4" },
            { name: "u_proj", type: "mat4" },
            { name: "u_model", type: "mat4" },
        ],
        main: `
            gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
            v_color = a_color;
        `,
    })
    .write({
        stage: ZShader.STAGE.FRAGMENT,
        inputs: [{ name: "v_color", type: "vec3" }],
        outputs: [{ name: "fragColor", type: "vec4" }],
        main: `
            fragColor = vec4(v_color, 1.0);
        `,
    })
    .compile(gl);

const VERTEX_STRIDE_FLOATS = 6;
const VERTEX_STRIDE_BYTES = VERTEX_STRIDE_FLOATS * 4;
const POSITION_OFFSET_BYTES = 0;
const COLOR_OFFSET_BYTES = 3 * 4;

function createRawDrawable({ name, vertices, indices, mode = gl.TRIANGLES }) {
    const vertexArray = Float32Array.from(vertices);
    const vertexBuffer = new ZBuffer(gl, gl.ARRAY_BUFFER, gl.STATIC_DRAW)
        .upload(vertexArray);

    const indexType = highestIndex(indices) > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    const indexArray = indexType === gl.UNSIGNED_INT
        ? Uint32Array.from(indices)
        : Uint16Array.from(indices);

    const indexBuffer = new ZBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW)
        .upload(indexArray);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionLoc = shader.getInputLocation("a_position");
    if (positionLoc !== -1) {
        vertexBuffer.attrib(positionLoc, 3, gl.FLOAT, false, VERTEX_STRIDE_BYTES, POSITION_OFFSET_BYTES);
    }

    const colorLoc = shader.getInputLocation("a_color");
    if (colorLoc !== -1) {
        vertexBuffer.attrib(colorLoc, 3, gl.FLOAT, false, VERTEX_STRIDE_BYTES, COLOR_OFFSET_BYTES);
    }

    indexBuffer.bind();
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    return {
        name,
        vao,
        vertexBuffer,
        indexBuffer,
        indexType,
        indexBytes: indexType === gl.UNSIGNED_INT ? 4 : 2,
        indexCount: indexArray.length,
        mode,
    };
}

function highestIndex(indices) {
    let max = 0;
    for (let i = 0; i < indices.length; i++) if (indices[i] > max) max = indices[i];
    return max;
}

function buildRectDrawable() {
    return createRawDrawable({
        name: "rect",
        vertices: [
            // x, y, z,    r, g, b
            -0.8, -0.8, 0, 1.0, 0.2, 0.2,
             0.8, -0.8, 0, 0.2, 1.0, 0.2,
             0.8,  0.8, 0, 0.2, 0.4, 1.0,
            -0.8,  0.8, 0, 1.0, 0.8, 0.2,
        ],
        indices: [0, 1, 2, 0, 2, 3],
    });
}

function buildCubeDrawable() {
    return createRawDrawable({
        name: "cube",
        vertices: [
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
        ],
        indices: [
            0, 1, 2, 0, 2, 3,
            1, 5, 6, 1, 6, 2,
            5, 4, 7, 5, 7, 6,
            4, 0, 3, 4, 3, 7,
            3, 2, 6, 3, 6, 7,
            4, 5, 1, 4, 1, 0,
        ],
    });
}

const rect = buildRectDrawable();
const cube = buildCubeDrawable();

const rectModel = ZMath.M4.identity();
rectModel[12] = -1.9;
rectModel[14] = -5.0;

const cubeModel = ZMath.M4.identity();
cubeModel[12] = 1.9;
cubeModel[14] = -7.0;

const modelScratch = ZMath.M4.identity();
const rotScratch = ZMath.M4.identity();

function drawRaw(drawable, indexOffset = 0) {
    ZRender.withVAO(gl, drawable.vao, () => {
        gl.drawElements(
            drawable.mode,
            drawable.indexCount,
            drawable.indexType,
            indexOffset * drawable.indexBytes
        );
    });
}

const start = performance.now();
function frame() {
    const t = (performance.now() - start) * 0.001;

    ZRender.setState(gl, {
        clear: ["color", "depth"],
        clearColor: [0, 0, 0, 0],
        depthTest: true,
        cull: "back",
    });

    shader.bind(gl);
    shader.setUniform(gl, "u_view", camera.view);
    shader.setUniform(gl, "u_proj", camera.projection);

    shader.setUniform(gl, "u_model", rectModel);
    drawRaw(rect);

    const rot = t * 0.9;
    rotScratch.set([
         Math.cos(rot), 0, Math.sin(rot), 0,
         0,             1, 0,             0,
        -Math.sin(rot), 0, Math.cos(rot), 0,
         0,             0, 0,             1,
    ]);
    ZMath.M4.mul(cubeModel, rotScratch, modelScratch);

    shader.setUniform(gl, "u_model", modelScratch);
    drawRaw(cube);

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
