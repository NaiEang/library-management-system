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
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to reset ${host}: only local databases (${[...LOCAL_HOSTS].join(', ')}) are allowed`,
    );
  }
  // Local and Docker Postgres run without TLS unless DB_SSL=true says otherwise
  return new DataSource({
    type: 'postgres',
    url,
    entities: ENTITIES,
    ssl: dbSsl(process.env.DB_SSL ?? 'false'),
  });
}

/**
 * Builds the schema straight from the entities. The checked-in migration only alters
 * tables that already exist in Supabase, so it cannot create them on an empty database.
 */
export async function resetSchema(dataSource: DataSource) {
  await dataSource.synchronize(true);
}
