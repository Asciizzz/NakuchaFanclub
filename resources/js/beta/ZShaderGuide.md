# ZShader Builder Guide

## Overview

**ZShader** is an agnostic GLSL shader compiler that uses a fluent builder pattern to construct shaders without any domain-specific knowledge (no 3D/2D concepts). It generates both vertex and fragment shaders from a single unified specification and handles reflection for attribute/uniform location resolution.

## Key Concepts

### Two-Stage Architecture
- **Stage 0 (Primary)**: Vertex shader
- **Stage 1 (Secondary)**: Fragment shader
- Both stages receive the same input declarations but generate different GLSL code

### Builder Pattern
ZShader uses method chaining to construct shader specifications before compilation:

```javascript
const shader = new ZShader();
shader.version("300 es")
    .stage(ZShader.STAGE.VERTEX)
    .input({name: "a_position", type: "vec3"})
    .output({name: "v_color", type: "vec4"})
    .uniform({name: "u_mvp", type: "mat4"})
    .method({signature: "vec4 myFunc()", body: "return vec4(1.0);"})
    .main("gl_Position = u_mvp * vec4(a_position, 1.0);")
    .stage(ZShader.STAGE.FRAGMENT)
    .input({name: "v_color", type: "vec4"})
    .output({name: "fragColor", type: "vec4"})
    .main("fragColor = v_color;")
    .compile(gl);
```

## API Reference

### Configuration

#### `version(versionString)`
Set GLSL version and precision (default: "300 es")
```javascript
shader.version("300 es");
```

#### `setRenderCfg(config)`
Set rendering configuration (blend, culling, render queue, etc.)
```javascript
shader.setRenderCfg({
    blend: true,
    rQueue: 1000,
    cull: 'back',
    depthTest: true
});
```

#### `setOnbind(function)`
Set a callback that runs when the shader program is bound
```javascript
shader.setOnbind((gl, prog) => {
    ZRender.setUniform(gl, prog, "vec3", "u_light", [0.5, 0.8, 0.6]);
});
```

#### `ZShader.STAGE` (Static Constants)
Predefined stage constants for better code readability
```javascript
ZShader.STAGE.VERTEX = 0;      // Vertex shader stage
ZShader.STAGE.FRAGMENT = 1;    // Fragment shader stage

// Usage:
shader.stage(ZShader.STAGE.VERTEX);
shader.stage(ZShader.STAGE.FRAGMENT);
```

### Stage Selection

#### `stage(stageIndex)`
Switch to vertex or fragment stage
```javascript
shader.stage(ZShader.STAGE.VERTEX);
shader.stage(ZShader.STAGE.FRAGMENT);
```

### Declarations

All declaration methods can accept either:
- A full spec object: `{name, type, precision, location, ...}`
- Positional args: `(type, name, options)`

#### `input(typeOrSpec, name?, options?)`
Declare an input attribute/varying
```javascript
// Full spec
shader.input({name: "a_position", type: "vec3", divisor: 0});

// Positional
shader.input("vec3", "a_position");

// Instance attribute (divisor = 1)
shader.input({
    name: "a_instMat4",
    type: "mat4",
    divisor: 1,      // <- IMPORTANT: marks as instance attribute
    slots: 4,        // mat4 consumes 4 attribute slots
    default: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
});

shader.input({
    name: "a_instColor",
    type: "vec4",
    divisor: 1,      // <- instance attribute
    default: [1,1,1,1]
});
```

**Important**: Set `divisor: 1` on attributes that are per-instance (updated once per instance draw call). This is **preserved** during reflection and used by the renderer to wire them to the instance buffer.

#### `inputs(specs, options?)`
Batch declare multiple inputs at once
```javascript
shader.inputs([
    {name: "a_position", type: "vec3"},
    {name: "a_normal", type: "vec3"},
    {name: "a_uv", type: "vec2"},
    {name: "a_instMat4", type: "mat4", divisor: 1, slots: 4},
]);
```

#### `output(typeOrSpec, name?, options?)`
Declare an output varying/fragment output
```javascript
shader.output("vec4", "v_color");
shader.output({name: "fragColor", type: "vec4"});
```

#### `outputs(specs, options?)`
Batch declare multiple outputs at once
```javascript
shader.outputs([
    {name: "v_color", type: "vec4"},
    {name: "v_normal", type: "vec3"},
]);
```

#### `uniform(typeOrSpec, name?, options?)`
Declare a uniform (constant across all vertices/fragments)
```javascript
shader.uniform("mat4", "u_mvp");
shader.uniform({name: "u_light", type: "vec3", precision: "highp"});
```

#### `uniforms(specs, options?)`
Batch declare multiple uniforms at once
```javascript
shader.uniforms([
    {name: "u_mvp", type: "mat4"},
    {name: "u_light", type: "vec3"},
    {name: "u_albedo", type: "sampler2D", precision: "highp"},
]);
```

#### `link(typeOrSpec, name?, options?)`
Declare a varying that links vertex → fragment
```javascript
shader.link("vec4", "v_color");
```
Automatically generates `out v_color` in vertex shader and `in v_color` in fragment shader.

#### `attribute(...args)` (alias)
Shorthand for `input()`
```javascript
shader.attribute("vec3", "a_position");
```

### Methods

#### `method(methodOrSig, body?)`
Declare a helper function
```javascript
// Full spec
shader.method({
    signature: "vec4 getColor(float t)",
    body: "return vec4(t, 1.0-t, 0.5, 1.0);"
});

// Positional
shader.method(
    "vec4 getColor(float t)",
    "return vec4(t, 1.0-t, 0.5, 1.0);"
);

// Descriptor form (auto-generates signature)
shader.method({
    name: "getColor",
    returnType: "vec4",
    args: [{type: "float", name: "t"}],
    body: "return vec4(t, 1.0-t, 0.5, 1.0);"
});
```

#### `methods(specs)`
Batch declare multiple helper functions at once
```javascript
shader.methods([
    {
        signature: "vec4 getColor(float t)",
        body: "return vec4(t, 1.0-t, 0.5, 1.0);"
    },
    {
        signature: "float saturate(float x)",
        body: "return clamp(x, 0.0, 1.0);"
    },
    {
        name: "linearToSRGB",
        returnType: "vec3",
        args: [{type: "vec3", name: "rgb"}],
        body: "return pow(rgb, vec3(1.0 / 2.2));"
    }
]);
```

### Main Shader Body

#### `main(sourceCode)`
Set the main function body (vertex or fragment depending on current stage)
```javascript
shader.stage(ZShader.STAGE.VERTEX)
    .main(`
        gl_Position = u_projection * u_view * a_position;
    `);

shader.stage(ZShader.STAGE.FRAGMENT)
    .main(`
        fragColor = vec4(1.0);
    `);
```

### Compilation

#### `build()`
Generate GLSL source code (vertex + fragment)
```javascript
const built = shader.build();
console.log(built.primary);    // Vertex shader GLSL
console.log(built.secondary);  // Fragment shader GLSL
```

#### `compile(gl)`
Compile and link the shader program with WebGL context
```javascript
shader.compile(gl);
if (shader.compiled) {
    console.log("Shader ready!");
}
```

## Post-Compilation Reflection

After `compile(gl)`, the shader exposes:

### Attribute Reflection
```javascript
shader.vertexInputs       // Array of inputs with resolved GL locations
shader.attributeLocations // Map of {name → location}
shader.getInputLocation(name)  // Get location or -1
```

### Uniform Reflection
```javascript
shader.vertexUniforms     // Vertex stage uniforms with GL locations
shader.fragmentUniforms   // Fragment stage uniforms with GL locations
shader.uniformLocations   // Map of {name → location}
shader.getUniformLocation(name)  // Get location or null
```

### Varyings
```javascript
shader.fragmentInputs     // Varyings coming into fragment stage
```

### Metadata Preservation
**All declaration metadata is preserved during reflection**, including:
- `divisor` - marks instance vs. vertex attributes
- `slots` - for types like mat4 (4 slots)
- `floats` - explicit float count
- `instance` - alternative marker for instance attributes
- `default` - default values for disabled attributes

```javascript
shader.vertexInputs.forEach(attr => {
    console.log(`${attr.name}: loc=${attr.loc}, divisor=${attr.divisor}, slots=${attr.slots}`);
});
```

## Complete Example

```javascript
function buildMyShader(gl) {
    const shader = new ZShader();
    
    shader
        .version("300 es")
        .setRenderCfg({blend: false, cull: 'back'})
        
        // Vertex Stage
        .stage(ZShader.STAGE.VERTEX)
        .inputs([
            {name: "a_position", type: "vec3"},
            {name: "a_normal", type: "vec3"},
            {name: "a_instMat4", type: "mat4", divisor: 1, slots: 4, 
             default: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]},
        ])
        .outputs([{name: "v_normal", type: "vec3"}])
        .uniforms([
            {name: "u_view", type: "mat4"},
            {name: "u_projection", type: "mat4"},
        ])
        .methods([{
            signature: "vec3 transform(vec3 pos)",
            body: "return normalize((a_instMat4 * vec4(pos, 1.0)).xyz);"
        }])
        .main(`
            gl_Position = u_projection * u_view * a_instMat4 * vec4(a_position, 1.0);
            v_normal = transform(a_normal);
        `)
        
        // Fragment Stage
        .stage(ZShader.STAGE.FRAGMENT)
        .inputs([{name: "v_normal", type: "vec3"}])
        .outputs([{name: "fragColor", type: "vec4"}])
        .uniforms([{name: "u_light", type: "vec3"}])
        .main(`
            float lambert = max(dot(normalize(v_normal), normalize(u_light)), 0.0);
            fragColor = vec4(vec3(lambert), 1.0);
        `)
        
        .compile(gl);
    
    return shader;
}

const shader = buildMyShader(gl);
console.log("a_position location:", shader.getInputLocation("a_position"));
console.log("a_instMat4 location:", shader.getInputLocation("a_instMat4"));
console.log("u_view location:", shader.getUniformLocation("u_view"));
```

**Batch Methods Benefit**: Using `.inputs()`, `.outputs()`, `.uniforms()`, and `.methods()` makes the code cleaner and easier to organize related declarations together. Perfect for complex shaders with many attributes.

## Important Notes

### Metadata Preservation
Ensure all custom metadata (`divisor`, `slots`, `floats`, `instance`) is passed in the full spec object:
```javascript
// Correct - metadata is preserved
shader.input({
    name: "a_instMat4",
    type: "mat4",
    divisor: 1,
    slots: 4
});

// Wrong - metadata is lost with positional form
shader.input("mat4", "a_instMat4");  // divisor/slots not set
```

### Instance Attributes
Mark per-instance attributes with `divisor: 1` so the renderer can distinguish them:
```javascript
// Mesh vertex attributes (divisor: 0 or omitted)
shader.input({name: "a_position", type: "vec3"});

// Instance attributes (divisor: 1)
shader.input({
    name: "a_instMat4",
    type: "mat4",
    divisor: 1,
    slots: 4
});
```

### Locations
GL automatically assigns locations, but you can override with explicit `location`:
```javascript
shader.input({name: "a_position", type: "vec3", location: 0});
shader.input({name: "a_normal", type: "vec3", location: 1});
```

### Precision
Set per-uniform or per-declaration for high-precision types:
```javascript
shader.uniform({name: "u_tex", type: "sampler2D", precision: "highp"});
```

## Troubleshooting

### Attributes Showing Location -1
- The attribute was declared but not used in the shader code
- Or the GLSL optimizer removed it (check `build()` output)

### Instance Attributes Not Updating
- Ensure `divisor: 1` is set on the input declaration
- Verify metadata was preserved in reflection: `shader.vertexInputs.find(a => a.name === "a_instMat4")`

### Compilation Failures
- Check shader source via `shader.build()` before compile
- Look for duplicate names across inputs/uniforms/methods
- Verify GLSL syntax in method bodies
