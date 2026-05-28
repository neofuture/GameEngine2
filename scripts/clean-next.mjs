import { rmSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDirs = [
  path.join(root, ".next"),
  path.join(root, "node_modules", ".cache", "next"),
];

function killPort(port) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGKILL");
        console.log(`stopped dev server pid ${pid} on :${port}`);
      } catch {
        // already gone
      }
    }
  } catch {
    // nothing listening
  }
}

// Deleting cache while Next is still running causes ENOENT → white screen / 500.
for (const port of [3000, 3001]) killPort(port);

for (const dir of cacheDirs) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${path.relative(root, dir)}`);
  }
}
