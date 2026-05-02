import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Logger } from "../utils/logger.js";
import { content, contentRelations } from "./schema/content.js";
import { kv } from "./schema/kv.js";
import {
  providerContent,
  providerContentRelations,
} from "./schema/provider_content.js";
import { streams } from "./schema/streams.js";
import { subtitles } from "./schema/subtitles.js";
import * as sqlite from "./sqlite.js";

const logger = new Logger("DB");

export const db = sqlite.db
  ? drizzle(sqlite.db.getDb(), {
      schema: {
        content,
        providerContent,
        streams,
        subtitles,
        kv,
        contentRelations,
        providerContentRelations,
      },
    })
  : null;

export function initMigrations() {
  try {
    if (db) {
      migrate(db, { migrationsFolder: "drizzle" });
      logger.log("Migration completed");
    } else {
      logger.log("Migration skipped: Database not initialized");
    }
  } catch (err) {
    logger.log(`Migration skipped: ${err}`);
  }
}
