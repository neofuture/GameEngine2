#!/usr/bin/env node
/**
 * Compress oil barrel textures to WebP sized for a ~0.6 m prop on screen.
 *
 *   node scripts/optimize-oil-barrel-textures.mjs exterior
 *   node scripts/optimize-oil-barrel-textures.mjs interior
 *   node scripts/optimize-oil-barrel-textures.mjs rim
 *   node scripts/optimize-oil-barrel-textures.mjs all
 *
 * Reads existing .webp in-repo, or .png source files when present.
 */
import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const TEX = path.join(REPO, "public/textures/oil_barrel");
const INSIDE = path.join(TEX, "inside");
const RIM_DIR = path.join(TEX, "rim");

function which(cmd) {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

const CWEBP = which("cwebp");
if (!CWEBP) {
  console.error("cwebp not found (brew install webp)");
  process.exit(1);
}

/** @param {string} dir @param {string} base @param {string} outName */
function resolveSrc(dir, base, outName) {
  const stem = base.replace(/\.(png|webp)$/i, "");
  for (const ext of [".png", ".webp"]) {
    const p = path.join(dir, stem + ext);
    if (fs.existsSync(p)) return p;
  }
  const outStem = outName.replace(/\.webp$/, "");
  for (const ext of [".png", ".webp"]) {
    const p = path.join(dir, outStem + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** @param {string} src @param {string} dest @param {{ w: number, h: number, q?: number }} opts */
function toWebp(src, dest, opts) {
  const tmp = `${dest}.tmp`;
  const args = ["-q", String(opts.q ?? 78), "-resize", String(opts.w), String(opts.h), src, "-o", tmp];
  execFileSync(CWEBP, args, { stdio: "inherit" });
  fs.renameSync(tmp, dest);
  const before = fs.statSync(src).size;
  const after = fs.statSync(dest).size;
  return { before, after };
}

/** @param {{ base?: string, out: string, w: number, h: number, q?: number, dir?: string }[]} items */
function runPass(label, items) {
  console.log(`\n=== ${label} ===\n`);
  let totalBefore = 0;
  let totalAfter = 0;
  for (const item of items) {
    const dir = item.dir ?? TEX;
    const srcPath = resolveSrc(dir, item.base ?? item.out, item.out);
    const destPath = path.join(dir, item.out);
    if (!srcPath) {
      console.warn(`skip (missing): ${item.out}`);
      continue;
    }
    const { before, after } = toWebp(srcPath, destPath, item);
    totalBefore += before;
    totalAfter += after;
    const pct = before > after ? ((1 - after / before) * 100).toFixed(0) : "0";
    console.log(
      `${item.out} (${item.w}×${item.h} q${item.q}): ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (−${pct}%)\n`
    );
  }
  console.log(
    `${label} total: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB`
  );
}

/** Sized for OIL_BARREL_RADIUS 0.3 m — few pixels per cm on screen at normal engagement range. */
const EXTERIOR = [
  { out: "barrel_body_albedo.webp", w: 256, h: 128, q: 78 },
  { out: "barrel_body_normal.webp", w: 256, h: 128, q: 85 },
  { out: "barrel_body_emissive.webp", w: 256, h: 128, q: 75 },
  { out: "barrel_top_endcap_albedo.webp", w: 256, h: 256, q: 78 },
  { out: "barrel_top_endcap_normal.webp", w: 256, h: 256, q: 85 },
  { out: "barrel_bottom_endcap_albedo.webp", w: 256, h: 256, q: 78 },
  { out: "barrel_bottom_endcap_normal.webp", w: 256, h: 256, q: 85 },
];

/** Interior wall tiles 2× on U — 1024 wide ≈ 512 texels per wrap around ~0.56 m ID. */
/** Rim fillet ~4 cm tall — 256² is plenty; aggressive q for small download. */
const RIM_TEX = [
  {
    base: "barrel_rim_reflective_metal_albedo.png",
    out: "barrel_rim_albedo.webp",
    w: 256,
    h: 256,
    q: 60,
    dir: RIM_DIR,
  },
  {
    base: "barrel_rim_reflective_metal_normal_opengl.png",
    out: "barrel_rim_normal.webp",
    w: 256,
    h: 256,
    q: 70,
    dir: RIM_DIR,
  },
  {
    base: "barrel_rim_reflective_metal_orm.png",
    out: "barrel_rim_orm.webp",
    w: 256,
    h: 256,
    q: 68,
    dir: RIM_DIR,
  },
];

const INTERIOR = [
  { out: "barrel_inside_wall_albedo.webp", w: 1024, h: 512, q: 76, dir: INSIDE },
  { out: "barrel_inside_wall_normal.webp", w: 1024, h: 512, q: 84, dir: INSIDE },
  { out: "barrel_inside_wall_orm.webp", w: 1024, h: 512, q: 82, dir: INSIDE },
  { out: "barrel_inside_floor_albedo.webp", w: 512, h: 512, q: 76, dir: INSIDE },
  { out: "barrel_inside_floor_normal.webp", w: 512, h: 512, q: 84, dir: INSIDE },
  { out: "barrel_inside_floor_orm.webp", w: 512, h: 512, q: 82, dir: INSIDE },
];

const mode = process.argv[2] ?? "all";
if (mode === "exterior" || mode === "all") runPass("Exterior", EXTERIOR);
if (mode === "interior" || mode === "all") runPass("Interior", INTERIOR);
if (mode === "rim" || mode === "all") runPass("Rim", RIM_TEX);
if (!["exterior", "interior", "rim", "all"].includes(mode)) {
  console.error("Usage: optimize-oil-barrel-textures.mjs exterior|interior|rim|all");
  process.exit(1);
}

console.log("\nDone. Hard-refresh the game to pick up smaller WebP assets.");
