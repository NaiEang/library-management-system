// In-memory stand-in for a TypeORM repository: only the methods my services
// call. Rows are cloned on the way out, like real query results.
type Row = Record<string, any>;
type Where = Row | Row[];

function matches(row: Row, where: Where): boolean {
  const options = Array.isArray(where) ? where : [where];
  return options.some((option) =>
    Object.entries(option).every(([key, value]) => row[key] === value),
  );
}

export class FakeRepository<T extends Row> {
  private nextId = 1000;
  // Throw for these lookups, to simulate a database failure.
  failWhen?: (where: Where) => boolean;

  constructor(public rows: T[] = []) {}

  findOne = vi.fn(({ where }: { where: Where }) => {
    if (this.failWhen?.(where)) {
      return Promise.reject(new Error('connection refused'));
    }
    const row = this.rows.find((r) => matches(r, where));
    return Promise.resolve(row ? (structuredClone(row) as T) : null);
  });

  update = vi.fn((where: Where, patch: Partial<T>) => {
    const affected = this.rows.filter((r) => matches(r, where));
    affected.forEach((row) => Object.assign(row, patch));
    return Promise.resolve({ affected: affected.length });
  });

  insert = vi.fn((values: Partial<T> | Partial<T>[]) => {
    const list = Array.isArray(values) ? values : [values];
    const inserted = list.map(
      (value) =>
        ({
          id: String(this.nextId++),
          createdAt: new Date(),
          ...value,
        }) as unknown as T,
    );
    this.rows.push(...inserted);
    return Promise.resolve({
      identifiers: inserted.map((row) => ({ id: row.id })),
    });
  });
}
