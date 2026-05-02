import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { content } from "./content.js";

export const providerContent = sqliteTable(
  "provider_content",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id").references(() => content.id),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    year: integer("year").notNull(),
    type: text("type", {
      enum: ["movie", "series", "channel", "tv"],
    }).notNull(),
    image: text("image"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
    ttl: integer("ttl"),
  },
  (table) => [
    index("idx_provider_content_external_id").on(
      table.provider,
      table.externalId,
    ),
  ],
);
export const providerContentRelations = relations(
  providerContent,
  ({ one }) => ({
    content: one(content, {
      fields: [providerContent.contentId],
      references: [content.id],
    }),
  }),
);

export type EProviderContent = typeof providerContent.$inferSelect;
export type EProviderContentInsert = typeof providerContent.$inferInsert;
