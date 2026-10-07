import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { ConversationReport } from "@/lib/schemas/report";
import type { RubricContent } from "@/lib/schemas/rubric";

export const rubrics = pgTable(
  "rubrics",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    content: jsonb("content").$type<RubricContent>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one default rubric.
    uniqueIndex("rubrics_single_default").on(table.isDefault).where(sql`${table.isDefault}`),
  ],
);

export type RubricRow = typeof rubrics.$inferSelect;

/** Single-row key/value store for app settings (validated by SettingsSchema on read). */
export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Finished evaluations keyed by a hash of everything that determines the result
 * (conversation, rubric content, model, language, judge version). Editing a rubric
 * changes the key, so stale results are never served.
 */
export const evaluationCache = pgTable("evaluation_cache", {
  key: text("key").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  report: jsonb("report").$type<ConversationReport>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
