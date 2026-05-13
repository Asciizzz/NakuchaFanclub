Note: Every assets will have a unique string ID created from their data (for example, you can use the vertices, indices and submesh data to generate a unique ID), some assets will rely on the ID to be referenced.

You should also store the ID directly in the asset data as well, for convenience.

ZLoader: no GL context, generate the assets and hierarchy data to be handled by ZProject
	Material: {
		fillColor
		albedoTex: ID of a texture asset
	}

	return {
		meshes: {
			"meshID": {
				some mesh and submesh data
				for submesh's material: {
					fillColor
					albedoTex: ID of a texture asset
						// other material data in the future
				}
			}...
		},
		textures: {
			"textureID": {
				some ZTexture data
			}...
		},
		...,
		scene: Use the ZScene structure
	}

ZScene extend ZTree:
	node can have custom components
	override addNode operation: call super, and add Transform component by default
	An additional addScene function which will combine a different scene into the current one, with proper remapping of IDs. For convenience, you can add an additional addScene tracker, which will allow you to do a simple renaming which added a suffix for convience. For example, if you add a new scene to the existing one, instead of having to go through the node tracker, you just iterate them and add the suffix to the node ID instead.

	0: {
		1: {
			// The first added scene
			1_0: {
				...
			},
			// The second added scene
			1_1: {
				...
			}
		}
	}

	contains: GL and the ZAssets of the project it belongs to.

	Automatic rendering, batching, various other methods for components and components management

	If theres any flaw in this logic, speak up immediately

Node components (classes)
	Transform: { local, world }
	MeshRenderer: { meshID, shaderID, skeletonNode?, morphWeights?}
	Skeleton: { skeletonID, bone data} -> the active skeleton data, which references the STATIC skeleton in assets


ZAssets: a WebGL powered asset storage for 3D objects (basically, it stores 3d data and their GPU memories in the most efficient way), it also contains scenes


ZProject: central 3D render engine contains:
	ZAssets
	ZCanvas (GL context)

	A method to from URL automatically load assets and scenes, and store them in ZAssets, returning the scene ID in ZAssets

	Ability to retrieve ZScene which allows you to freely manipulate/render

Example flow:

- Create new ZProject -> Automatically create ZAssets and ZCanvas

- Load a scene from URL -> return the scene ID, and store the assets in ZAssets

- Retrieve the scene using the scene ID -> return a ZScene object, which allows you to manipulate the scene freely
	scene = project.getScene(sceneID)

- Manipulate the scene
  - node = scene.node("nodeID")
  - node.transform.local.position = ZMath.V3(1, 2, 3)

- A update function:
  - scene.update(deltaTime) -> update every node

- Render the scene -> scene.render() - dont forget, shader belongs to ZAssets, and scene can read from ZAssets