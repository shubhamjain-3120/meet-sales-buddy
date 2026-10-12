import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// Development/test adapter runs the same SQL as D1, without a hosted account.
export function localDatabase(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  if (!db.prepare("SELECT name FROM sqlite_master WHERE name = 'rooms'").get()) db.exec(readFileSync(new URL("./migrations/0001_room.sql", import.meta.url), "utf8"));
  function prepare(sql) {
    let values = [];
    const execute = () => {
      const query = db.prepare(sql);
      return query.columns().length ? { results: query.all(...values), meta: { changes: 0 } } : { results: [], meta: { changes: query.run(...values).changes } };
    };
    return {
      bind(...args) { values = args; return this; },
      first: async () => db.prepare(sql).get(...values) ?? null,
      run: async () => ({ meta: { changes: db.prepare(sql).run(...values).changes } }),
      all: async () => execute(),
      execute
    };
  }
  return {
    prepare,
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => statement.execute());
        db.exec("COMMIT");
        return results;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    close: () => db.close()
  };
}
