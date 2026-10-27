import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { PgStorage } from "./storage";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("PostgreSQL migration upgrades legacy data and completes a submission exactly once", {
  skip: !databaseUrl ? "Set TEST_DATABASE_URL to run PostgreSQL migration tests." : false,
}, async () => {
  const schema = `qpp_test_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  let store: PgStorage | undefined;
  let secondStore: PgStorage | undefined;

  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    await adminPool.query(`
      CREATE TABLE "${schema}".workspaces (
        id text PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL,
        logo_url text,
        primary_color text,
        secondary_color text,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    await adminPool.query(`
      CREATE TABLE "${schema}".packs (
        id text PRIMARY KEY,
        workspace_id text NOT NULL,
        name text NOT NULL,
        slug text NOT NULL,
        published_version_id text,
        is_paid boolean NOT NULL DEFAULT false,
        stripe_price_id text,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    await adminPool.query(`
      CREATE TABLE "${schema}".pack_versions (
        id text PRIMARY KEY,
        pack_id text NOT NULL,
        version integer NOT NULL,
        definition jsonb NOT NULL,
        created_at timestamptz NOT NULL
      )
    `);
    await adminPool.query(`
      CREATE TABLE "${schema}".submissions (
        id text PRIMARY KEY,
        workspace_id text NOT NULL,
        pack_id text NOT NULL,
        pack_version_id text NOT NULL,
        email text,
        first_name text,
        answers jsonb NOT NULL,
        score integer,
        outcome_id text,
        outcome_label text,
        paid boolean NOT NULL DEFAULT false,
        stripe_session_id text,
        pdf_sent boolean NOT NULL DEFAULT false,
        completed_at timestamptz,
        created_at timestamptz NOT NULL
      )
    `);
    await adminPool.query(`
      INSERT INTO "${schema}".workspaces (id, name, slug, created_at, updated_at)
      VALUES ('workspace-1', 'Legacy Workspace', 'legacy', now(), now())
    `);
    await adminPool.query(`
      INSERT INTO "${schema}".packs (id, workspace_id, name, slug, created_at, updated_at)
      VALUES ('pack-1', 'workspace-1', 'Legacy Pack', 'legacy-pack', now(), now())
    `);
    await adminPool.query(`
      INSERT INTO "${schema}".pack_versions (id, pack_id, version, definition, created_at)
      VALUES ('version-1', 'pack-1', 1, '{"questions":[],"outcomes":[]}', now())
    `);
    await adminPool.query(`
      INSERT INTO "${schema}".submissions (
        id, workspace_id, pack_id, pack_version_id, email, answers, paid, created_at
      ) VALUES ('submission-1', 'workspace-1', 'pack-1', 'version-1', 'legacy@example.com', '{"answer":"preserved"}', false, now())
    `);

    const poolOptions = {
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    };
    store = new PgStorage(poolOptions);
    await store.healthCheck();

    const legacyWorkspace = await store.getWorkspace("workspace-1");
    const legacySubmission = await store.getSubmission("submission-1");
    assert.equal(legacyWorkspace?.name, "Legacy Workspace");
    assert.equal(legacyWorkspace?.brandPlan, "legacy");
    assert.deepEqual(legacyWorkspace?.brandSettings, {});
    assert.equal(legacySubmission?.email, "legacy@example.com");
    assert.deepEqual(legacySubmission?.answers, { answer: "preserved" });
    assert.equal(legacySubmission?.amountPaidCents, 0);

    const columns = await adminPool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name IN ('packs', 'submissions', 'workspaces')
    `, [schema]);
    const columnNames = new Set(columns.rows.map((row) => row.column_name));
    assert.ok(columnNames.has("views"));
    assert.ok(columnNames.has("amount_paid_cents"));
    assert.ok(columnNames.has("brand_plan"));
    assert.ok(columnNames.has("brand_settings"));

    const completionData = {
      email: "first@example.com",
      firstName: "First",
      answers: { answer: "first" },
      score: 10,
      outcomeId: "pass",
      outcomeLabel: "Pass",
      paid: false,
      amountPaidCents: 0,
      stripeSessionId: null,
    };
    const completions = await Promise.all([
      store.completeSubmission("submission-1", completionData),
      store.completeSubmission("submission-1", { ...completionData, email: "second@example.com", score: 20 }),
    ]);
    assert.equal(completions.filter((item) => item.newlyCompleted).length, 1);
    assert.ok(completions.every((item) => item.submission?.completedAt));

    await store.close();
    store = undefined;
    secondStore = new PgStorage(poolOptions);
    await secondStore.healthCheck();
    const completed = await secondStore.getSubmission("submission-1");
    assert.ok(completed?.completedAt);
    assert.ok(completed?.email === "first@example.com" || completed?.email === "second@example.com");
    const migrations = await adminPool.query<{ version: number }>(
      `SELECT version FROM "${schema}".app_schema_migrations ORDER BY version`,
    );
    assert.deepEqual(migrations.rows.map((row) => row.version), [1, 2, 3]);
  } finally {
    await store?.close().catch(() => undefined);
    await secondStore?.close().catch(() => undefined);
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await adminPool.end();
  }
});
