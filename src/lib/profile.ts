import { createProfileStore, type ProfileStore } from "@profullstack/profile";
import { db } from "@/lib/db";

let store: ProfileStore | null = null;

/**
 * The signup profile (@profullstack/profile) in `user_profiles`, keyed by
 * users.id; the table is created by db/schema.pg.sql. Built on first use so
 * `next build` never opens the database. The libSQL-shaped Postgres client
 * says it is Postgres, but the dialect is pinned rather than inferred.
 */
export function profileStore(): ProfileStore {
  store ??= createProfileStore(db(), { keyType: "bigint", dialect: "postgres" });
  return store;
}
