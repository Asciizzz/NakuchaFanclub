// 3D-only bootstrap (WeebGPU)
// Load order matters because these files publish runtime globals on window.

import './lib/Azm.js';
import './lib/AzWGPU.js';

import './WeebGPU/ZCamera.js';
import './WeebGPU/ZCanvasWGPU.js';
import './WeebGPU/ZRShader.js';
import './WeebGPU/ZCShader.js';

import './WeebGPU/ZTree.js';
import './WeebGPU/EzScene.js';
import './WeebGPU/EzLoader.js';
import './WeebGPU/EzMesh.js';
import './WeebGPU/EzAssets.js';
import './WeebGPU/ZRenderGraph.js';
import './WeebGPU/EzProject.js';
import './WeebGPU/EzNakurin.js';

import './welcome/scene.js';
