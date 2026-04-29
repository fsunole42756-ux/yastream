import type { ContentType } from "@stremio-addon/sdk";
import { and, count, eq, lt, sql } from "drizzle-orm";
import type { ContentDetail } from "../source/meta.js";
import { Logger } from "../utils/logger.js";
import { db } from "./drizzle.js";
import { content, EContentInsert, type EContent } from "./schema/content.js";
import { EKVInsert, kv } from "./schema/kv.js";
import {
  EProviderContentInsert,
  providerContent,
  type EProviderContent,
} from "./schema/provider_content.js";
import { EStreamInsert, streams } from "./schema/streams.js";
import { ESubtitleInsert, subtitles } from "./schema/subtitles.js";

const logger = new Logger("DB");

// CONTENT
export async function upsertContent(
  id: string,
  contentData: ContentDetail,
  ttlMs: number,
) {
  if (!db) return;
  const now = Date.now();
  const row: EContentInsert = {
    id: id,
    title: contentData.title,
    altTitle: contentData.altTitle ?? null,
    overview: contentData.overview,
    year: contentData.year,
    type: contentData.type,
    imdbId: contentData.imdbId?.toString() ?? null,
    tmdbId: contentData.tmdbId?.toString() ?? null,
    tvdbId: contentData.tvdbId?.toString() ?? null,
    poster: contentData.thumbnail,
    background: contentData.thumbnail,
    logo: contentData.logo ?? null,
    genres: null,
    createdAt: now,
    updatedAt: null,
    ttl: Math.floor(ttlMs / 1000),
  };

  try {
    await db
      .insert(content)
      .values(row)
      .onConflictDoUpdate({
        target: content.id,
        set: {
          title: row.title,
          altTitle: row.altTitle,
          overview: row.overview,
          year: row.year,
          type: row.type,
          imdbId: row.imdbId,
          tmdbId: row.tmdbId,
          tvdbId: row.tvdbId,
          poster: row.poster,
          background: row.background,
          logo: row.logo,
          genres: row.genres,
          updatedAt: now,
          ttl: row.ttl,
        },
      });
    logger.log(`Upserted content ${contentData.title}`);
  } catch (e) {
    logger.error(`Failed to upsert content ${id} | ${e}`);
  }
}

export async function getContentByTmdb(
  tmdbId: string,
  type: ContentType,
): Promise<EContent | undefined> {
  if (!db) return;
  const row = await db.query.content.findFirst({
    where: and(eq(content.tmdbId, tmdbId), eq(content.type, type)),
  });
  return row;
}

// PROVIDER_CONTENT
export async function upsertProviderContent(
  providerContentData: Omit<EProviderContentInsert, "createdAt" | "updatedAt">,
) {
  if (!db) return;
  const now = Date.now();
  const row = { ...providerContentData, createdAt: now, updatedAt: null };

  try {
    await db
      .insert(providerContent)
      .values(row)
      .onConflictDoUpdate({
        target: providerContent.id,
        set: {
          provider: row.provider,
          contentId: row.contentId,
          externalId: row.externalId,
          title: row.title,
          year: row.year,
          type: row.type,
          image: row.image,
          updatedAt: now,
          ttl: row.ttl,
        },
      });
    logger.log(`Upserted provider_content ${row.title}`);
  } catch (e) {
    logger.error(
      `Failed to upsert provider_content ${providerContentData.id} | ${e}`,
    );
  }
}

export async function getProviderContentById(
  id: string,
): Promise<EProviderContent | undefined> {
  if (!db) return;
  const row = await db.query.providerContent.findFirst({
    where: eq(providerContent.id, id),
  });
  return row;
}

export async function getProviderContent(
  id: string,
): Promise<EProviderContent | undefined> {
  if (!db) return;
  const row = await db.query.providerContent.findFirst({
    where: eq(providerContent.id, id),
  });
  return row;
}

export async function getCountProviderContent() {
  if (!db) return;
  const number = await db
    .select({ count: count(providerContent.id) })
    .from(providerContent);
  return number;
}

// STREAMS
export async function upsertStream(stream: Omit<EStreamInsert, "createdAt">[]) {
  if (!db) return;
  const now = Date.now();
  const rows = stream.map((r) => ({ ...r, createdAt: now }));
  try {
    await db
      .insert(streams)
      .values(rows)
      .onConflictDoUpdate({
        target: streams.id,
        set: {
          providerContentId: sql.raw(
            `excluded.${streams.providerContentId.name}`,
          ),
          provider: sql.raw(`excluded.${streams.provider.name}`),
          externalId: sql.raw(`excluded.${streams.externalId.name}`),
          season: sql.raw(`excluded.${streams.season.name}`),
          episode: sql.raw(`excluded.${streams.episode.name}`),
          url: sql.raw(`excluded.${streams.url.name}`),
          playlist: sql.raw(`excluded.${streams.playlist.name}`),
          hash: sql.raw(`excluded.${streams.hash.name}`),
          resolution: sql.raw(`excluded.${streams.resolution.name}`),
          size: sql.raw(`excluded.${streams.size.name}`),
          duration: sql.raw(`excluded.${streams.duration.name}`),
          ttl: sql.raw(`excluded.${streams.ttl.name}`),
        },
      });
    const row = rows[0];
    logger.log(
      `Upserted streams ${row?.providerContentId}:${row?.season}:${row?.episode}`,
    );
  } catch (e) {
    const row = rows[0];
    logger.error(
      `Failed to upsert streams ${row?.providerContentId}:${row?.season}:${row?.episode} | ${e}`,
    );
  }
}

export async function getStream(id: string) {
  if (!db) return;
  const row = await db.query.streams.findFirst({
    where: eq(streams.id, id),
  });
  return row;
}
export async function getStreamsJoinProvider(
  id: string,
  season: number,
  episode: number,
) {
  if (!db) return [];
  const seasonString = season.toString();
  const episodeString = episode.toString();
  const rows = await db
    .select()
    .from(streams)
    .innerJoin(
      providerContent,
      eq(streams.providerContentId, providerContent.id),
    )
    .where(
      and(
        eq(streams.providerContentId, id),
        eq(streams.season, seasonString),
        eq(streams.episode, episodeString),
      ),
    );
  return rows;
}
export async function getCountStream() {
  if (!db) return;
  const number = await db.select({ count: count(streams.id) }).from(streams);
  return number;
}

// SUBTITLES
export async function upsertSubtitles(
  subtitlesData: Omit<ESubtitleInsert, "createdAt">[],
) {
  if (!db) return;
  const now = Date.now();
  const rows = subtitlesData.map((subtitle) => ({
    id: subtitle.id,
    providerContentId: subtitle.providerContentId,
    url: subtitle.url,
    lang: subtitle.lang,
    season: subtitle.season,
    episode: subtitle.episode,
    subtitle: subtitle.subtitle,
    createdAt: now,
    ttl: subtitle.ttl,
  }));

  try {
    await db
      .insert(subtitles)
      .values(rows)
      .onConflictDoUpdate({
        target: subtitles.id,
        set: {
          url: sql.raw(`excluded.${subtitles.url.name}`),
          season: sql.raw(`excluded.${subtitles.season.name}`),
          episode: sql.raw(`excluded.${subtitles.episode.name}`),
          subtitle: sql.raw(`excluded.${subtitles.subtitle.name}`),
          ttl: sql.raw(`excluded.${subtitles.ttl.name}`),
        },
      });
    const row = rows[0];
    logger.log(
      `Upserted subtitles ${row?.providerContentId}:${row?.season}:${row?.episode}`,
    );
  } catch (e) {
    const row = rows[0];
    logger.error(
      `Failed to upsert subtitles ${row?.providerContentId}:${row?.season}:${row?.episode} | ${e}`,
    );
  }
}
export async function getSubtitle(id: string) {
  if (!db) return;
  const row = db.query.subtitles.findFirst({
    where: eq(subtitles.id, id),
  });
  return row;
}
export async function getSubtitlesJoinProvider(
  id: string,
  season: number,
  episode: number,
) {
  if (!db) return;
  const row = await db
    .select()
    .from(subtitles)
    .innerJoin(
      providerContent,
      eq(subtitles.providerContentId, providerContent.id),
    )
    .where(
      and(
        eq(subtitles.providerContentId, id),
        eq(subtitles.season, season.toString()),
        eq(subtitles.episode, episode.toString()),
      ),
    );
  return row;
}
export async function getCountSubtitles() {
  if (!db) return;
  const number = await db
    .select({ count: count(subtitles.id) })
    .from(subtitles);
  return number;
}

// KV
export function setKv(
  key: string,
  value: any,
  size: number,
  expiresAt: number,
) {
  if (!db) return;
  db.insert(kv)
    .values({
      key,
      value: JSON.stringify(value),
      size: size,
      createdAt: Date.now(),
      expiresAt: expiresAt,
    })
    .onConflictDoUpdate({
      target: kv.key,
      set: {
        value: sql.raw(`excluded.${kv.value.name}`),
        size: sql.raw(`excluded.${kv.size.name}`),
        createdAt: sql.raw(`excluded.${kv.createdAt.name}`),
        expiresAt: sql.raw(`excluded.${kv.expiresAt.name}`),
      },
    })
    .run();
}
export async function setKvs(kvs: EKVInsert[]) {
  if (!db) return;
  try {
    await db
      .insert(kv)
      .values(kvs)
      .onConflictDoUpdate({
        target: kv.key,
        set: {
          value: sql.raw(`excluded.${kv.value.name}`),
          size: sql.raw(`excluded.${kv.size.name}`),
          expiresAt: sql.raw(`excluded.${kv.expiresAt.name}`),
        },
      })
      .run();
  } catch (e) {
    logger.error(`Failed to upsert kvs | ${e}`);
  }
}

export function getKv(key: string) {
  if (!db) return;
  const row = db.query.kv.findFirst({
    where: eq(kv.key, key),
  });
  return row.sync();
}

export function deleteKv(key: string) {
  if (!db) return;
  const row = db.delete(kv).where(eq(kv.key, key));
  return row;
}

export function cleanKv() {
  if (!db) return;
  cleanKvLimit();
}
async function cleanKvLimit(limit = 500) {
  if (!db) return;

  const result = await db
    .delete(kv)
    .where(lt(kv.expiresAt, Date.now()))
    .limit(limit);
  console.log(`Cleaned ${result.changes} KV entries`);
}
