import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { PgStorage, storage } from "./storage";
import { serveStatic } from "./static";
import { createServer } from "http";
import { isVercelStudioPreviewAuthEnabled } from "./preview-auth";
import { emailIsConfigured, stripeIsConfigured } from "./external-side-effects";

if (process.env.NODE_ENV === "production") {
  const adminKey = process.env.ADMIN_KEY?.trim();
  if ((!adminKey || adminKey.length < 32) && !isVercelStudioPreviewAuthEnabled()) {
    throw new Error("ADMIN_KEY must be configured with at least 32 characters in production.");
  }
  // Vercel supplies the deployment host at runtime. Use it as the staging origin
  // when a dedicated PUBLIC_APP_URL has not been configured.
  if (!process.env.PUBLIC_APP_URL?.trim() && process.env.VERCEL_URL) {
    process.env.PUBLIC_APP_URL = `https://${process.env.VERCEL_URL}`;
  }
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  let parsedPublicAppUrl: URL | null = null;
  try {
    parsedPublicAppUrl = publicAppUrl ? new URL(publicAppUrl) : null;
  } catch {
    parsedPublicAppUrl = null;
  }
  if (
    !parsedPublicAppUrl ||
    parsedPublicAppUrl.protocol !== "https:" ||
    Boolean(parsedPublicAppUrl.username || parsedPublicAppUrl.password) ||
    parsedPublicAppUrl.hostname === "localhost" ||
    parsedPublicAppUrl.pathname !== "/" ||
    parsedPublicAppUrl.search ||
    parsedPublicAppUrl.hash
  ) {
    throw new Error("PUBLIC_APP_URL must be a valid HTTPS origin in production.");
  }
}

const app = express();
export default app;
const stagingEnvironment = process.env.STAGING_ENV === "true";
app.disable("x-powered-by");
const trustProxyHops = process.env.TRUST_PROXY_HOPS === undefined
  ? process.env.NODE_ENV === "production" ? 1 : 0
  : Number(process.env.TRUST_PROXY_HOPS);
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
  throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10.");
}
app.set("trust proxy", trustProxyHops);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (stagingEnvironment) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
const httpServer = createServer(app);
let appReady: Promise<void> = Promise.resolve();
app.use((_req, res, next) => {
  void appReady.then(() => next()).catch((error: unknown) => {
    console.error("Application initialization failed:", error);
    if (!res.headersSent) res.status(503).json({ message: "Service initialization failed." });
  });
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "100kb" }));

if (stagingEnvironment) {
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  });
}

app.get("/healthz", async (_req, res) => {
  const storageType = process.env.DATABASE_URL ? "postgres" : "memory";
  try {
    await storage.healthCheck();
    return res.json({
      ok: true,
      storage: storageType,
      publicAppUrlConfigured: Boolean(process.env.PUBLIC_APP_URL),
      stripeConfigured: stripeIsConfigured(),
      emailConfigured: emailIsConfigured(),
    });
  } catch {
    return res.status(503).json({ ok: false, storage: storageType });
  }
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

appReady = (async () => {
  await registerRoutes(httpServer, app);

  const { seedDemoCatalog, seedDemoData } = await import("./seed");
  const { storage } = await import("./storage");
  await seedDemoCatalog(storage);

  if (
    process.env.NODE_ENV === "development" ||
    process.env.SEED_DEMO_DATA === "true"
  ) {
    await seedDemoData(storage);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({
      message: status >= 500 ? "Internal server error" : message,
    });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
})();

// Vercel invokes the exported Express app directly. Keep the long-lived listener
// for local/Render deployments, but never open a port inside a Vercel Function.
if (process.env.VERCEL !== "1") {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Received ${signal}; draining HTTP server.`);
    if (!httpServer.listening) {
      log("HTTP listener is not active; exiting.");
      process.exit(0);
    }
    const shutdownTimeout = setTimeout(() => {
      console.error("Graceful shutdown deadline exceeded.");
      process.exit(1);
    }, 25_000);
    shutdownTimeout.unref();
    httpServer.close((error) => {
      void (async () => {
        let shutdownFailed = Boolean(error);
        if (error) console.error("HTTP server shutdown failed.");
        if (storage instanceof PgStorage) {
          try {
            await storage.close();
          } catch {
            shutdownFailed = true;
            console.error("Database pool shutdown failed.");
          }
        }
        clearTimeout(shutdownTimeout);
        if (shutdownFailed) {
          process.exitCode = 1;
        } else {
          log("HTTP server and database pool drained.");
        }
      })();
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  appReady.then(() => {
    if (shuttingDown) return;
    const port = Number(process.env.PORT) || 3000;
    const hasHostEnv = typeof process.env.HOST === "string" && process.env.HOST.length > 0;
    log(`startup port=${port} hostEnvPresent=${hasHostEnv}`);
    httpServer.listen(port, "0.0.0.0", () => {
      log(`QPP server running on http://localhost:${port}`);
    });
  }).catch((error: unknown) => {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
  });
}
