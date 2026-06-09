# NakuchaFanclub

- Cute lil website for our one and only Aitsuki Nakuru... is what you guys said, idk man, I uuuh, am just here for the frontend design, but hey she seems pretty cool

- I made the drawings and 3d models btw, took me 3 entire weeks learning Blender

## Huge inspiration

- The [Tetohira](https://aidn.jp/tetohira/) website made by [@daniwell](https://aidn.jp)
- My own Snow Miku plushie
- Meinkraft by Ado
- Source 2 engine
- A* algorithm (it taught me that edges can have data)

## Technical Wizardry

- This shi is going to blow your fcking mind

### Graph theory

#### Agraph.js

- Custom graph library for generic directed graph structures with mutable nodes and edges
- Needed for excution flow and scene graph management
- Old tree and DAG-lite structure was not sufficient, since Edge having data is genuinely useful and flexible ah hell

#### Aflow.js

- Layer on top of Agraph for defining execution flows
- Was made to support the new Render-as-a-Component (RaaC) structure in Awgpu/Awgl2, but can be used for any kind of directed execution workflow (downstream for execute, upstream for dependency and debugging)
- Significant upgrade over old Adag.js thanks to having edge data for more customizability, better control, and a good way for me to use the SOLID thingy I learnt in software design class (I almost flunked)

##### Traversal:

- `flow.run({ from: nodeId, state })` to execute from a specific node with a mutable state object
- Flow runs through DFS, no visisted node checking so repeatition is supported (something we WANT)
- This allow you to do something like:

```
A[Renderpass] =(order: 0)=> B[Bind Shader A] ==> D[Draw Call]
A[Renderpass] =(order: 1)=> C[Bind Shader B] ==> D[Draw Call]
A[Renderpass] =(order: 2)=> E[End Pass]
```

Traversal order:
- `A[Renderpass] -> B[Bind Shader A] -> D[Draw Call] -> C[Bind Shader B] -> D[Draw Call] -> E[End Pass]`

Notable benefits:

- `D[Draw Call` only needs to be defined once
- Edge data allow for control over execution order

### Rendering engine

#### Awgpu

- Extension of Aflow, support WebGPU RaaC structure, `rendering command` extend `Afstep` to be used in a flow
- Refer to previous example in Aflow.js section above

#### Awgl2 (Beta)

- Similar to Awgpu but with commands for WebGL2
- Early in development since I need to 

#### Note

- Rendering remain agnostic, concept only related to WebGPU and WebGL2
- Things like Mesh, Material, Camera, Scene, etc are not understood by Awgpu/Awgl2, those belongs in the WeebRender layer which will be discussed next
- You can do some CRAZY shi with it

### Scene engine

#### WeebRender

- Has understanding of high level rendering concepts like Mesh, Material, Camera, Scene, etc
- Tree structure for scene management, but still uses the Awgpu/Awgl2 for rendering
- World can be assigned with a render node from the Awgpu/Awgl2 flow
- World have control over that render node, can read, write, modify payload so that it fits the current scene state (ignoring mesh binding because all its instances are culled for example)


### Other

#### Adoc.js

- Lightweight document compiler
- I don't want to go on google everytime I want to use regex to parse text and shi, so this compiler turns those instruction into more human-friendly attribute names

#### Alm.js

- Math library for vectors, matrices and quater-onions (yummers, wanna cram in as much fat fck)

#### Atree.js

- Simple n-ary tree structure for general use
- API is highly confusing so will be reworked soon