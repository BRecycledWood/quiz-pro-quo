import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function findAvailablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

const port = await findAvailablePort();
const childEnv = { ...process.env };
delete childEnv.DATABASE_URL;
Object.assign(childEnv, {
  NODE_ENV: "production",
  ALLOW_MEMORY_STORAGE: "true",
  ADMIN_KEY: "production-smoke-admin-key-at-least-32-characters",
  PUBLIC_APP_URL: "https://qpp-smoke.example",
  PORT: String(port),
  SEED_DEMO_DATA: "false",
  TRUST_PROXY_HOPS: "0",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  EMAIL_FROM: "",
  LEAD_NOTIFICATION_EMAIL: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
});

const child = spawn(process.execPath, ["dist/index.cjs"], {
  cwd: process.cwd(),
  env: childEnv,
  stdio: ["ignore", "inherit", "inherit"],
});
let exitCode: number | null = null;
child.once("exit", (code) => { exitCode = code; });

try {
  let healthResponse: globalThis.Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (exitCode !== null) throw new Error(`Production server exited early with code ${exitCode}.`);
    try {
      healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
      break;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  if (!healthResponse) throw new Error(`Production server did not become healthy: ${String(lastError)}`);
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(healthResponse.headers.get("x-frame-options"), "DENY");
  const health = await healthResponse.json() as {
    ok: boolean;
    storage: string;
    publicAppUrlConfigured: boolean;
    stripeConfigured: boolean;
    emailConfigured: boolean;
  };
  assert.equal(health.ok, true);
  assert.equal(health.storage, "memory");
  assert.equal(health.publicAppUrlConfigured, true);
  assert.equal(health.stripeConfigured, false);
  assert.equal(health.emailConfigured, false);

  const homepage = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /<div id="root"><\/div>/);
  console.log("Production startup smoke passed using explicitly enabled in-memory storage.");
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      delay(5_000).then(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }),
    ]);
  }
}
