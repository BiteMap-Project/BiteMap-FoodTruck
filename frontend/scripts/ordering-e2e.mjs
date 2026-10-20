import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const project = `bitemap-e2e-${randomUUID().slice(0, 8)}`;
const compose = ["compose", "--env-file", "/dev/null", "-p", project, "-f", "docker-compose.e2e.yml"];
const run = (command, args, options = {}) => spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
let result = 1;
try {
  const started = run("docker", [...compose, "up", "--build", "--wait", "--wait-timeout", "240"]);
  if (started.status === 0) {
    result = run(process.execPath, ["frontend/node_modules/@playwright/test/cli.js", "test",
      "--config=frontend/playwright.config.ts"], {
      env: { ...process.env, BITEMAP_E2E_PROJECT: project },
    }).status ?? 1;
  }
  if (result !== 0) run("docker", [...compose, "logs", "--no-color", "--tail", "100"]);
} finally {
  // Only this run's randomly named disposable project is removed.
  const cleanup = run("docker", [...compose, "down", "--volumes"]);
  if (cleanup.status !== 0) result = 1;
}
process.exitCode = result;
