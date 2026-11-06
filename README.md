# Tactical Survivors

A small isometric skirmish in Three.js. The first battle is Ashfield. Stand-in meshes hold each spot until you drop a model in.

## Run

```bash
bun install
bun run dev
```

Open the URL Vite prints. Amber moves first. Controls, the wave clock, and level-up choices are in `PLAY.md`.

```bash
bun run test
```

## Models

The Ashfield fighters and the ring around the board use the cute-set GLBs. `ASSET-MAP.md` lists which source file became which mesh. Those files have no texture and no vertex color, so they render as gray clay. Optional `tile.glb`, `brush.glb`, and `stone.glb` still replace the ground.

A missing file keeps the stand-in. Amber faces the host. If a mesh looks sideways, set `yaw` on that slot in `src/models.ts` (radians). The first animation clip loops.
