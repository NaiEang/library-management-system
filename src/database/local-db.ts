import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { dbSsl } from './ssl';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

/**
 * A DataSource for seeds and test setup that refuses anything but a local or Docker
 * database, since callers drop and rebuild the schema. Supabase is never touched.
 */
export function localDataSource(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  assertLocal(url);
  // Local and Docker Postgres run without TLS unless DB_SSL=true says otherwise
  return new DataSource({
    type: 'postgres',
    url,
    entities: ENTITIES,
    ssl: dbSsl(process.env.DB_SSL ?? 'false'),
  });
}

/**
 * Creates the database named in `url` when it does not exist yet, so a fresh local,
 * Docker or CI Postgres needs no init script. It connects to the server's `postgres`
 * database to do that, which the Docker and CI users can.
 */
export async function ensureDatabase(url: string) {
  assertLocal(url);
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  const server = new URL(url);
  server.pathname = '/postgres';
  const admin = new DataSource({
    type: 'postgres',
    url: server.toString(),
    ssl: dbSsl(process.env.DB_SSL ?? 'false'),
  });
  await admin.initialize();
  try {
    const found = await admin.query<unknown[]>(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (!found.length)
      await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await admin.destroy();
  }
}

function assertLocal(url: string) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to reset ${host}: only local databases (${[...LOCAL_HOSTS].join(', ')}) are allowed`,
    );
  }
}

/**
 * Builds the schema straight from the entities. The checked-in migration only alters
 * tables that already exist in Supabase, so it cannot create them on an empty database.
 */
export async function resetSchema(dataSource: DataSource) {
  await dataSource.synchronize(true);
}
