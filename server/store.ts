import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

export class Store {
  db: DatabaseSync;
  constructor(
    path = resolve(process.env.OMS_DATA_DIR || "data", "oh-my-stock.sqlite"),
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind,id));
      PRAGMA user_version=1;`);
  }
  all<T>(kind: string): T[] {
    return this.db
      .prepare("SELECT payload FROM records WHERE kind=? ORDER BY rowid DESC")
      .all(kind)
      .map((r) => JSON.parse(String(r.payload)));
  }
  get<T>(kind: string, id: string): T | undefined {
    const r = this.db
      .prepare("SELECT payload FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return r ? JSON.parse(String(r.payload)) : undefined;
  }
  put(kind: string, id: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload",
      )
      .run(kind, id, JSON.stringify(value));
  }
  delete(kind: string, id: string) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  atomic<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  export() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      records: this.db
        .prepare("SELECT kind,id,payload FROM records")
        .all()
        .map((r) => ({
          kind: r.kind,
          id: r.id,
          value: JSON.parse(String(r.payload)),
        })),
    };
  }
  close() {
    this.db.close();
  }
}
