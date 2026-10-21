# 3D models: where they come from and how to rebuild them

All models in `public/models/` are CC0 and compressed with gltfpack (meshoptimizer) so phones download about 2 MB in total.

| Folder | Source | Licence |
|---|---|---|
| `sub/` | Kenney City Kit Suburban 2.0 (21 houses, 2 trees) | CC0 |
| `car/` | Kenney Car Kit (sedan, suv, van, delivery, delivery-flat, police, taxi, ambulance, firetruck, garbage-truck, tractor-shovel, sedan-sports) | CC0 |
| `chr/` | Kenney Mini Characters (8 people, 32 animations each) | CC0 |
| `ual/` | Quaternius Universal Animation Library (mannequin, 43 animations) | CC0 |

Each Kenney folder keeps its own `Textures/colormap.png` (the packs use different palettes); the models reference it with `-tr`.

Rebuild (gltfpack is the npm package `gltfpack`, a WASM build, so it runs anywhere Node does):

```
node gltfpack/cli.js -c -tr -i building-type-a.glb -o public/models/sub/building-type-a.glb
node gltfpack/cli.js -c -i UAL1_Standard.glb -o public/models/ual/ual.glb
```

`-c` writes EXT_meshopt_compression + KHR_mesh_quantization. three r128's GLTFLoader reads both once `setMeshoptDecoder(MeshoptDecoder)` is set (`loadModels()` in the game). Quantised UVs come with KHR_texture_transform on each texture, so any texture you swap in must copy the original's offset/repeat (`roofTex()`).

Sounds: `public/sfx/sfx.mp3` and `sfx.webm` are one sprite built with ffmpeg from Kenney Impact Sounds, Casino Audio and Interface Sounds (CC0). Offsets are in `SPR` in `public/index.html`.
