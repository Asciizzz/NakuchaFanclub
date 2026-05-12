const submesh = new ZSubmesh()
    .vertices([...])
    .indices([...])
    .buffer({
        name: "morphTargetDeltas",
        layout: [
            { name: "position", type: "float32", size: 3 },
            { name: "normal", type: "float32", size: 3 },
        ],
        data: [...],
        info: {
            morphTargetCount: 4,
        }
    }) -> agnostic, for this example, buffer is for packing all morph target deltas into a single buffer
       -> Is NOT built yet

const mesh = new ZMesh()
    .vertexLayout([
        { name: "position", type: "float32", size: 3 },
        { name: "normal", type: "float32", size: 3 },
    ])
    .instanceLayout([
        { name: "instanceMatrix", type: "float32", size: 16 }
    ])
    .submesh(submesh)
    .build(gl)

Note: ZMesh/ZSubmesh are agnostic, can be used for 2d or 3d rendering. Doesn't understand what a morph or a skeleton is.