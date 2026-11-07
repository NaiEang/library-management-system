import type { DataSource } from 'typeorm';

export type Row = Record<string, unknown>;

/** Bulk insert with snake_case column names, for seeds and test fixtures. */
export async function insertRows(
  dataSource: DataSource,
  table: string,
  rows: Row[],
) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  for (let start = 0; start < rows.length; start += 500) {
    const params: unknown[] = [];
    const values = rows.slice(start, start + 500).map((row) => {
      const slots = columns.map((column) => {
        params.push(row[column]);
        return `$${params.length}`;
      });
      return `(${slots.join(', ')})`;
    });
    await dataSource.query(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${values.join(', ')}`,
      params,
    );
  }
}

/** Rows inserted with explicit ids leave the sequence behind; move it past them. */
export async function syncSequence(dataSource: DataSource, table: string) {
  await dataSource.query(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT MAX(id) FROM "${table}"), 1))`,
  );
}
