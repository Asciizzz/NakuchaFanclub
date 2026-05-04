const ez3d = new EzCanvas3D("content");
const container = document.querySelector("#welcome");
const gl = ez3d.gl;

ez3d.mount(container);
ez3d.resize(window.innerWidth, window.innerHeight);
new ResizeObserver(() => ez3d.settings.fitContainer()).observe(container);

ez3d.camera.set({ near: 0.1, far: 200, fov: 50, orthographic: true, orthoSize: 2 });

class Environment {
    static SHADER_KEY = "env_lit";
    static #shaderRegistered = false;

    static #ensureShader(ez) {
        if (Environment.#shaderRegistered) return;
        ez.shaders.add(Environment.SHADER_KEY, new EzShader3D().describe({
            renderCfg: { blend: true },
            uniKeys: [
                { name: "u_light", type: "vec3" },
            ],
            onbind: (gl, program) => {
                gl.uniform3fv(gl.getUniformLocation(program, "u_light"), [0.3, 1.0, 0.5]);
            },
            vertex: {
                attributes: [
                    { name: "a_position",   size: 3, default: [0,0,0,0] },
                    { name: "a_normal",     size: 3, default: [0,1,0,0] },
                    { name: "a_uv",         size: 2, default: [0,0,0,0] },
                    { name: "a_boneID",     size: 4, default: [0,0,0,0] },
                    { name: "a_boneWeight", size: 4, default: [0,0,0,0] },
                ],
                instanceData: [
                    { name: "a_instMat4",  type: "mat4" },
                    { name: "a_instColor", type: "vec4", default: [1,1,1,1] }
                ],
                morphChannels: ["u_morphPosTex"],
                hasSkeleton: true,
                defaultKeys: { view: "u_view", projection: "u_proj" },
                outputs: [
                    { name: "v_normal", type: "vec3" },
                    { name: "v_uv",     type: "vec2" },
                    { name: "v_color",  type: "vec4" },
                ],
                main: `
                    vec3 pos    = a_position + applyMorph(0, morphVertexLocal());
                    mat4 skin   = computeSkin(a_boneID, a_boneWeight);
                    mat4 model  = a_instMat4 * skin;
                    gl_Position = u_proj * u_view * model * vec4(pos, 1.0);
                    v_normal    = normalize(mat3(model) * a_normal);
                    v_uv        = a_uv;
                    v_color     = a_instColor;
                `,
            },
            fragment: {
                defaultKeys: { fill: "u_fill", albedo: "u_albedo" },
                outputColor: "fragColor",
                main: `
                    vec3 lightDir = normalize(u_light);
                    float diff = max(dot(normalize(v_normal), lightDir), 0.0);

                    vec4  albedo = texture(u_albedo, v_uv) * u_fill;
                    albedo *= v_color;

                    if (albedo.r + albedo.g + albedo.b < 0.3) {
                        albedo.rgb = v_color.rgb;
                    }

                    fragColor    = vec4(albedo.rgb, albedo.a);
                `,
            },
        }));
        Environment.#shaderRegistered = true;
    }

    constructor(ez) {
        this.ez     = ez;
        this.models = new Map();   // modelKey -> { data, instances:Set }
    }

    async load(modelKey, url) {
        Environment.#ensureShader(this.ez);
        const data = await EzLoaderBeta.load(url, {
            ez:           this.ez,
            modelKey,
            shaderKey:    Environment.SHADER_KEY,
            morphChannel: "u_morphPosTex",
        });
        if (!data.added) throw new Error(`[Environment] models.add("${modelKey}") failed`);
        this.models.set(modelKey, { data, instances: new Set() });
        return data;
    }

    has(modelKey)  { return this.models.has(modelKey); }
    get(modelKey)  { return this.models.get(modelKey) ?? null; }

    addInstance(modelKey, init = null) {
        const entry = this.models.get(modelKey);
        if (!entry) return null;
        const k = this.ez.addInstance(modelKey, init);
        if (k) entry.instances.add(k);
        return k;
    }

    write(key, opts) { return this.ez.writeInstance(key, opts); }
    read(key)        { return this.ez.readInstance(key); }
    remove(key) {
        for (const e of this.models.values()) e.instances.delete(key);
        return this.ez.removeInstance(key);
    }
}

const environment = new Environment(ez3d);
const cameraCfg = {
    center: [0, 0, 0],
    distance: 5.5,
    tOffset: [0, 0, 0],

    rOffset: { yaw: 5, pitch: 3 },
    rSpeed: 5.0,
    // Runtime
    rCurrent: { yaw: 0, pitch: 0 },
    rTarget: { yaw: 0, pitch: 0 },
};

(async () => {
    await environment.load("Test", "/Models/Switch.glb");
    environment.addInstance("Test", {
        data: {
            a_instMat4: {
                position: [0, 0, 0],
                rotation: EzMath.Quat.fromEulerYPR(0, 0, 0),
                scale:    [1, 1, 1]
            },
            a_instColor: [1, 1, 1, 1],
        },
    });

    // …more loads / instances here
})().catch(console.error);

document.addEventListener('mousemove', e => {
    const nx = (e.clientX / window.innerWidth  - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;

    cameraCfg.rTarget.yaw   = -nx * cameraCfg.rOffset.yaw; // flip x so object "face" towards cursor
    cameraCfg.rTarget.pitch =  ny * cameraCfg.rOffset.pitch;
});



let lastT = null;
function frame(ts) {
    if (!lastT) lastT = ts;
    const dt = Math.min((ts - lastT) / 1000, 0.05);
    lastT = ts;

    ez3d.render({ clear: false });

    // Smooth interpolation of camera rotation towards rTarget
    cameraCfg.rCurrent.yaw   += (cameraCfg.rTarget.yaw   - cameraCfg.rCurrent.yaw)   * dt * cameraCfg.rSpeed;
    cameraCfg.rCurrent.pitch += (cameraCfg.rTarget.pitch - cameraCfg.rCurrent.pitch) * dt * cameraCfg.rSpeed;

    const yawRad   = cameraCfg.rCurrent.yaw * Math.PI / 180;
    const pitchRad = cameraCfg.rCurrent.pitch * Math.PI / 180;
    const cosPitch = Math.cos(pitchRad);
    const sinPitch = Math.sin(pitchRad);
    const sinYaw   = Math.sin(yawRad);
    const cosYaw   = Math.cos(yawRad);

    ez3d.camera.set({
        position: [
            cameraCfg.center[0] + sinYaw * cosPitch * cameraCfg.distance + cameraCfg.tOffset[0],
            cameraCfg.center[1] + sinPitch * cameraCfg.distance          + cameraCfg.tOffset[1],
            cameraCfg.center[2] + cosYaw * cosPitch * cameraCfg.distance + cameraCfg.tOffset[2],
        ],
    });
    ez3d.camera.lookAt(cameraCfg.center);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);