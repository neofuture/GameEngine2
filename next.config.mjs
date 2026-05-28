import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const threePath = path.resolve(__dirname, "node_modules/three");
/** Turbopack treats alias values as project-relative paths — not absolute. */
const threeTurbopackAlias = "./node_modules/three";

/** Keep Next build output out of Dropbox-synced .next (webpack pack cache corrupts there). */
const distDir = path.join("node_modules", ".cache", "next");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  distDir,
  transpilePackages: ["three"],
  turbopack: {
    resolveAlias: {
      three: threeTurbopackAlias,
    },
  },
  webpack: (config, { dev }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      three: threePath,
    };
    // Avoid writing webpack pack files to disk in dev — Dropbox/HMR often corrupts them.
    if (dev) {
      config.cache = { type: "memory" };
    }
    return config;
  },
};

export default nextConfig;
