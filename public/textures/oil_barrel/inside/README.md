# Oil barrel interior (open top)

Used when `topCap` is false — cylindrical inner wall + circular floor.

**Shipped assets:** WebP only (~1.3 MB total). Original 4K/2K PNGs are not in the repo; re-export from your texture pack and run:

```bash
node scripts/optimize-oil-barrel-textures.mjs interior
```

ORM: **R** = AO, **G** = roughness, **B** = metallic.

## Runtime files

| File | Resolution | Notes |
|------|------------|--------|
| `barrel_inside_wall_albedo.webp` | 2048×1024 | 2× horizontal tile on cylinder |
| `barrel_inside_wall_normal.webp` | 2048×1024 | |
| `barrel_inside_wall_orm.webp` | 2048×1024 | |
| `barrel_inside_floor_albedo.webp` | 1024×1024 | Alpha (circular mask) |
| `barrel_inside_floor_normal.webp` | 1024×1024 | |
| `barrel_inside_floor_orm.webp` | 1024×1024 | |

Rotation: **Interior wall rotation (°)** in the oil barrel tuning panel.
