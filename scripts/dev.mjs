import { spawn } from "child_process";
import { existsSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const reset = args.includes("--reset");
const useWebpack = args.includes("--webpack");
const devArgs = useWebpack ? [] : ["--turbo"];

function killPort(port) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGKILL");
        console.log(`killed pid ${pid} on :${port}`);
      } catch {
        // already gone
      }
    }
  } catch {
    // nothing listening
  }
}

if (reset) {
  killPort(3000);
  killPort(3001);
  for (const dir of [
    path.join(root, ".next"),
    path.join(root, "node_modules", ".cache", "next"),
  ]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`removed ${path.relative(root, dir)}`);
    }
  }
}

const child = spawn("next", ["dev", ...devArgs], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
