# Tactical Survivors

A small isometric skirmish in Three.js. The first battle is Ashfield. Stand-in meshes hold each spot until you drop a model in.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints. Amber moves first.

## Models

The Ashfield fighters and the ring around the board use cutout stills from the cute set. `ASSET-MAP.md` lists which source file became which picture. The Comfy GLBs are flat gray, with no texture and no vertex color, so they are not on the board.

A missing picture keeps the stand-in mesh. Drop a `.glb` on a fighter slot in `src/models.ts` and that slot uses the mesh again. Optional `tile.glb`, `brush.glb`, and `stone.glb` still replace the ground. Amber faces the host. If a mesh looks sideways, set `yaw` on that slot (radians). The first animation clip loops.
