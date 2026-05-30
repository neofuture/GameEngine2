# Oil barrel interior (open top)

Used when `topCap` is false — cylindrical inner wall + circular floor.

**Shipped assets:** WebP only (~**260 KB** total). Re-export from your texture pack (4K/2K PNG) and run:

```bash
node scripts/optimize-oil-barrel-textures.mjs interior
```

ORM: **R** = AO, **G** = roughness, **B** = metallic.

## Runtime files

| File | Resolution | Notes |
|------|------------|--------|
| `barrel_inside_wall_albedo.webp` | 1024×512 | 2× horizontal tile on cylinder |
| `barrel_inside_wall_normal.webp` | 1024×512 | |
| `barrel_inside_wall_orm.webp` | 1024×512 | |
| `barrel_inside_floor_albedo.webp` | 512×512 | Alpha (circular mask) |
| `barrel_inside_floor_normal.webp` | 512×512 | |
| `barrel_inside_floor_orm.webp` | 512×512 | |

Rotation: **Interior wall rotation (°)** in the oil barrel tuning panel.
