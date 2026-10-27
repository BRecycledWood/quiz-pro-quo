import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { serveStatic } from "./static";
import { createServer } from "http";

if (process.env.NODE_ENV === "production") {
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey || adminKey.length < 32) {
    throw new Error("ADMIN_KEY must be configured with at least 32 characters in production.");
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
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
const httpServer = createServer(app);

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

app.get("/healthz", async (_req, res) => {
  const storageType = process.env.DATABASE_URL ? "postgres" : "memory";
  try {
    await storage.healthCheck();
    return res.json({
      ok: true,
      storage: storageType,
      publicAppUrlConfigured: Boolean(process.env.PUBLIC_APP_URL),
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      emailConfigured: Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD &&
        process.env.EMAIL_FROM,
      ),
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

(async () => {
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

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 3000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = Number(process.env.PORT) || 3000;
  const hasHostEnv = typeof process.env.HOST === "string" && process.env.HOST.length > 0;
  log(`startup port=${port} hostEnvPresent=${hasHostEnv}`);
  // Bind on all interfaces for containers and Arena's live preview proxy.
  httpServer.listen(port, "0.0.0.0", () => {
    log(`QPP server running on http://localhost:${port}`);
  });
})();
