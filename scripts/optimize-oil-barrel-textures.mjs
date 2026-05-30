#!/usr/bin/env node
/**
 * Compress oil barrel textures to WebP (smaller download + VRAM after decode).
 *
 *   node scripts/optimize-oil-barrel-textures.mjs exterior
 *   node scripts/optimize-oil-barrel-textures.mjs interior
 *   node scripts/optimize-oil-barrel-textures.mjs all
 */
import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const TEX = path.join(REPO, "public/textures/oil_barrel");
const INSIDE = path.join(TEX, "inside");

function which(cmd) {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

const CWEBP = which("cwebp");
if (!CWEBP) {
  console.error("cwebp not found (brew install webp)");
  process.exit(1);
}

/** @param {string} src @param {string} dest @param {{ w: number, h: number, lossless?: boolean, q?: number }} opts */
function toWebp(src, dest, opts) {
  const args = [];
  if (opts.lossless) args.push("-lossless");
  else args.push("-q", String(opts.q ?? 82));
  args.push("-resize", String(opts.w), String(opts.h), src, "-o", dest);
  execFileSync(CWEBP, args, { stdio: "inherit" });
  const before = fs.statSync(src).size;
  const after = fs.statSync(dest).size;
  return { before, after };
}

/** @param {{ src: string, out: string, w: number, h: number, lossless?: boolean, q?: number, dir?: string }[]} items */
function runPass(label, items) {
  console.log(`\n=== ${label} ===\n`);
  let totalBefore = 0;
  let totalAfter = 0;
  for (const item of items) {
    const dir = item.dir ?? TEX;
    const srcPath = path.join(dir, item.src);
    const destPath = path.join(dir, item.out);
    if (!fs.existsSync(srcPath)) {
      console.warn(`skip (missing): ${item.src}`);
      continue;
    }
    const { before, after } = toWebp(srcPath, destPath, item);
    totalBefore += before;
    totalAfter += after;
    const pct = ((1 - after / before) * 100).toFixed(0);
    console.log(
      `${item.out}: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (−${pct}%)\n`
    );
  }
  console.log(
    `${label} total: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB`
  );
}

const EXTERIOR = [
  { src: "barrel_body_albedo.png", out: "barrel_body_albedo.webp", w: 512, h: 256, q: 84 },
  { src: "barrel_body_normal.png", out: "barrel_body_normal.webp", w: 512, h: 256, q: 90 },
  { src: "barrel_body_emissive.png", out: "barrel_body_emissive.webp", w: 512, h: 256, q: 80 },
  {
    src: "barrel_top_endcap_albedo.png",
    out: "barrel_top_endcap_albedo.webp",
    w: 512,
    h: 512,
    q: 84,
  },
  {
    src: "barrel_top_endcap_normal.png",
    out: "barrel_top_endcap_normal.webp",
    w: 512,
    h: 512,
    q: 90,
  },
  {
    src: "barrel_bottom_endcap_albedo.png",
    out: "barrel_bottom_endcap_albedo.webp",
    w: 512,
    h: 512,
    q: 84,
  },
  {
    src: "barrel_bottom_endcap_normal.png",
    out: "barrel_bottom_endcap_normal.webp",
    w: 512,
    h: 512,
    q: 90,
  },
];

const INTERIOR = [
  {
    src: "barrel_inside_wall_albedo_4096x2048.png",
    out: "barrel_inside_wall_albedo.webp",
    w: 2048,
    h: 1024,
    q: 82,
    dir: INSIDE,
  },
  {
    src: "barrel_inside_wall_normal_4096x2048.png",
    out: "barrel_inside_wall_normal.webp",
    w: 2048,
    h: 1024,
    q: 90,
    dir: INSIDE,
  },
  {
    src: "barrel_inside_wall_orm_4096x2048.png",
    out: "barrel_inside_wall_orm.webp",
    w: 2048,
    h: 1024,
    q: 88,
    dir: INSIDE,
  },
  {
    src: "barrel_inside_floor_albedo_2048x2048_alpha.png",
    out: "barrel_inside_floor_albedo.webp",
    w: 1024,
    h: 1024,
    q: 84,
    dir: INSIDE,
  },
  {
    src: "barrel_inside_floor_normal_2048x2048_alpha.png",
    out: "barrel_inside_floor_normal.webp",
    w: 1024,
    h: 1024,
    q: 90,
    dir: INSIDE,
  },
  {
    src: "barrel_inside_floor_orm_2048x2048_alpha.png",
    out: "barrel_inside_floor_orm.webp",
    w: 1024,
    h: 1024,
    q: 88,
    dir: INSIDE,
  },
];

const mode = process.argv[2] ?? "exterior";
if (mode === "exterior" || mode === "all") runPass("Exterior", EXTERIOR);
if (mode === "interior" || mode === "all") runPass("Interior", INTERIOR);
if (!["exterior", "interior", "all"].includes(mode)) {
  console.error("Usage: optimize-oil-barrel-textures.mjs exterior|interior|all");
  process.exit(1);
}

console.log("\nDone. Update lib/OilBarrel.js paths if needed, then hard-refresh the game.");
