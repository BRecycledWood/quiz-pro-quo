import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const packs = pgTable("packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  publishedVersionId: varchar("published_version_id"),
  isPaid: boolean("is_paid").default(false).notNull(),
  stripePriceId: text("stripe_price_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const packVersions = pgTable("pack_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packId: varchar("pack_id").notNull(),
  version: integer("version").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type Pack = typeof packs.$inferSelect;
export type PackVersion = typeof packVersions.$inferSelect;
