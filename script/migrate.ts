import { PgStorage, storage } from "../server/storage";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run database migrations.");
  }
  if (!(storage instanceof PgStorage)) {
    throw new Error("PostgreSQL storage is not configured.");
  }

  try {
    await storage.healthCheck();
    console.log("Database schema migrations are applied.");
  } finally {
    await storage.close();
  }
}

main().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
