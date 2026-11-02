// Sends realistic dummy traffic to a running local API (DEV_AUTH=true) so traces, logs
// and metrics have something to show. `npm run simulate -- 120` runs for 120s (default: until Ctrl+C).
import 'dotenv/config';

type DevUser = { id: string; role: 'admin' | 'librarian' | 'member' };
type Scenario = { name: string; weight: number; run: () => Promise<unknown> };

const BASE =
  process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const DURATION_S = Number(process.argv[2] ?? 0);
const WORKERS = Number(process.env.SIM_WORKERS ?? 4);

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const id = (max: number) => 1 + Math.floor(Math.random() * max);
const stats = new Map<string, number>();

async function call(
  userId: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bucket = `${Math.floor(response.status / 100)}xx`;
  stats.set(bucket, (stats.get(bucket) ?? 0) + 1);
  await response.text();
  return response.status;
}

async function main() {
  const users = (await (await fetch(`${BASE}/dev/users`)).json()) as DevUser[];
  if (!Array.isArray(users))
    throw new Error(
      `${BASE}/dev/users is unavailable: start the API with DEV_AUTH=true`,
    );
  const ids = (role: DevUser['role']) =>
    users.filter((user) => user.role === role).map((user) => user.id);
  const admins = ids('admin');
  const librarians = ids('librarian');
  const members = ids('member');
  const staff = [...admins, ...librarians];

  const scenarios: Scenario[] = [
    {
      name: 'staff dashboard',
      weight: 14,
      run: () => call(pick(staff), 'GET', '/dashboard/stats'),
    },
    {
      name: 'browse books',
      weight: 18,
      run: () => call(pick(members), 'GET', '/books'),
    },
    {
      name: 'view book',
      weight: 8,
      run: () => call(pick(members), 'GET', `/books/${id(180)}`),
    },
    {
      name: 'activity logs',
      weight: 6,
      run: () => call(pick(staff), 'GET', `/activity-logs?page=${id(3)}`),
    },
    {
      name: 'activity facets',
      weight: 1,
      run: () => call(pick(staff), 'GET', '/activity-logs/facets'),
    },
    {
      name: 'list loans',
      weight: 6,
      run: () => call(pick(librarians), 'GET', '/loans'),
    },
    {
      name: 'list members',
      weight: 4,
      run: () => call(pick(staff), 'GET', '/members'),
    },
    {
      name: 'notifications',
      weight: 5,
      run: () => call(pick(members), 'GET', '/notifications'),
    },
    {
      name: 'request loan',
      weight: 5,
      run: () => call(pick(members), 'POST', '/loans', {}),
    },
    {
      name: 'update loan',
      weight: 4,
      run: () => call(pick(librarians), 'PATCH', `/loans/${id(560)}`, {}),
    },
    {
      name: 'record payment',
      weight: 2,
      run: () => call(pick(librarians), 'POST', '/payments', {}),
    },
    {
      name: 'add book',
      weight: 1.5,
      run: () => call(pick(librarians), 'POST', '/books', {}),
    },
    {
      name: 'update member',
      weight: 1,
      run: () => call(pick(admins), 'PATCH', `/members/${id(120)}`, {}),
    },
    {
      name: 'member on dashboard',
      weight: 1.5,
      run: () => call(pick(members), 'GET', '/dashboard/stats'),
    },
    {
      name: 'no auth header',
      weight: 1,
      run: () => call(null, 'GET', '/activity-logs'),
    },
    {
      name: 'bad query',
      weight: 1,
      run: () => call(pick(staff), 'GET', '/activity-logs?limit=500'),
    },
    {
      name: 'unknown route',
      weight: 0.5,
      run: () => call(pick(members), 'GET', '/borrows'),
    },
  ];
  const totalWeight = scenarios.reduce(
    (sum, scenario) => sum + scenario.weight,
    0,
  );
  const nextScenario = () => {
    let roll = Math.random() * totalWeight;
    for (const scenario of scenarios) {
      roll -= scenario.weight;
      if (roll <= 0) return scenario;
    }
    return scenarios[0];
  };

  const deadline = DURATION_S ? Date.now() + DURATION_S * 1000 : Infinity;
  let stopped = false;
  process.once('SIGINT', () => (stopped = true));

  const worker = async () => {
    while (!stopped && Date.now() < deadline) {
      try {
        await nextScenario().run();
      } catch (error) {
        stats.set('network', (stats.get('network') ?? 0) + 1);
        if (stats.get('network') === 1)
          console.error(`Cannot reach ${BASE}: ${(error as Error).message}`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 150 + Math.random() * 550),
      );
    }
  };

  const report = setInterval(
    () =>
      console.log(new Date().toLocaleTimeString(), Object.fromEntries(stats)),
    10_000,
  );
  console.log(
    `Simulating traffic against ${BASE} with ${WORKERS} workers${DURATION_S ? ` for ${DURATION_S}s` : ''}…`,
  );
  await Promise.all(Array.from({ length: WORKERS }, worker));
  clearInterval(report);
  console.log('Done', Object.fromEntries(stats));
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
