/** Supabase needs TLS; a local, Docker or CI Postgres has none, so those set DB_SSL=false. */
export function dbSsl(value = process.env.DB_SSL) {
  return value === 'false' ? false : { rejectUnauthorized: false };
}
