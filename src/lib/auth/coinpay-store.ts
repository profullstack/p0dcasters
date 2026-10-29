import { db, args, one } from "@/lib/db";
import { ensureTables as ensureNewsletterTables } from "@/lib/newsletter-store";
import { now } from "./crypto";
import type { CoinpayStore, IdentityRow } from "./coinpay";

// Also in db/schema.pg.sql; created here on first use because nothing applies
// that file on deploy. coinpay_sub is the binding (primary key); user_id is
// unique so one account holds at most one CoinPay identity.
const DDL = [
  `CREATE TABLE IF NOT EXISTS coinpay_identities (
     coinpay_sub text PRIMARY KEY,
     user_id bigint NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
     coinpay_email text,
     coinpay_name text,
     created_via text NOT NULL,
     created_at bigint NOT NULL,
     last_login_at bigint
   )`,
];

let ready: Promise<void> | null = null;

export function ensureCoinpayTables(): Promise<void> {
  ready ??= (async () => {
    await ensureNewsletterTables();
    for (const sql of DDL) await db().execute(sql);
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

const COLS = "user_id, coinpay_sub, coinpay_email, coinpay_name, created_via";

function row(r: IdentityRow | null): IdentityRow | null {
  return r ? { ...r, user_id: Number(r.user_id) } : null;
}

export function dbCoinpayStore(): CoinpayStore {
  return {
    async identityBySub(sub) {
      await ensureCoinpayTables();
      return row(await one<IdentityRow>(`SELECT ${COLS} FROM coinpay_identities WHERE coinpay_sub = ?`, [sub]));
    },
    async identityByUser(userId) {
      await ensureCoinpayTables();
      return row(await one<IdentityRow>(`SELECT ${COLS} FROM coinpay_identities WHERE user_id = ?`, [userId]));
    },
    async link(r) {
      await ensureCoinpayTables();
      const res = await db().execute({
        sql: `INSERT INTO coinpay_identities(coinpay_sub, user_id, coinpay_email, coinpay_name, created_via, created_at, last_login_at)
              VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
        args: args([r.coinpay_sub, r.user_id, r.coinpay_email, r.coinpay_name, r.created_via, now(), now()]),
      });
      return Number(res.rowsAffected ?? 0) > 0 ? "ok" : "conflict";
    },
    async unlink(userId) {
      await ensureCoinpayTables();
      await db().execute({ sql: "DELETE FROM coinpay_identities WHERE user_id = ?", args: args([userId]) });
    },
    async touch(sub) {
      await ensureCoinpayTables();
      await db().execute({ sql: "UPDATE coinpay_identities SET last_login_at = ? WHERE coinpay_sub = ?", args: args([now(), sub]) });
    },
    async createUser(email) {
      await ensureCoinpayTables();
      // Digest off: the placeholder address cannot receive it.
      const res = await db().execute({
        sql: "INSERT INTO users(email, created_at, newsletter) VALUES(?,?,0) RETURNING id",
        args: args([email, now()]),
      });
      const id = Number((res.rows[0] as unknown as { id: unknown } | undefined)?.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error("user could not be created");
      return id;
    },
    async deleteUser(userId) {
      await db().execute({ sql: "DELETE FROM users WHERE id = ?", args: args([userId]) });
    },
  };
}
