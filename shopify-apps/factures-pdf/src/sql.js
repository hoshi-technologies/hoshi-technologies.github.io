// Adaptateurs SQLite : même interface pour node:sqlite (serveur Node) et pour le stockage
// SQLite des Durable Objects Cloudflare. Toutes les méthodes sont synchrones.
//   exec(script)            plusieurs instructions, sans résultat
//   run(sql, ...params)     → { changes, lastInsertRowid }
//   get(sql, ...params)     → première ligne ou undefined
//   all(sql, ...params)     → toutes les lignes
//   transaction(fn)         exécute fn() de façon atomique

export function nodeSql(db) {
  return {
    raw: db,
    exec: (script) => db.exec(script),
    run: (sql, ...params) => {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    get: (sql, ...params) => db.prepare(sql).get(...params),
    all: (sql, ...params) => db.prepare(sql).all(...params),
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

/** `storage` : this.ctx.storage d'un Durable Object adossé à SQLite. */
export function durableObjectSql(storage) {
  const sql = storage.sql;
  const rows = (query, params) => sql.exec(query, ...params).toArray();
  return {
    raw: storage,
    exec: (script) => {
      // Les PRAGMA de journalisation sont gérés par Cloudflare.
      const cleaned = script.replace(/PRAGMA journal_mode\s*=\s*WAL;/i, '');
      sql.exec(cleaned);
    },
    run: (query, ...params) => {
      const cursor = sql.exec(query, ...params);
      cursor.toArray();
      const { id } = sql.exec('SELECT last_insert_rowid() AS id').one();
      return { changes: cursor.rowsWritten, lastInsertRowid: Number(id) };
    },
    get: (query, ...params) => rows(query, params)[0],
    all: (query, ...params) => rows(query, params),
    transaction: (fn) => storage.transactionSync(fn),
  };
}
