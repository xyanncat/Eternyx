// Run on the phone with: node --env-file=.env.web verify-web.cjs
// Credentials stay on the phone; output only operational health fields.
const origin = 'http://127.0.0.1:3000';
async function main() {
  const login = await fetch(`${origin}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: process.env.DASHBOARD_ACCESS_KEY }),
  });
  if (!login.ok) throw new Error(`Login returned ${login.status}`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Login did not create a session');
  const response = await fetch(`${origin}/api/overview`, { headers: { cookie } });
  if (!response.ok) throw new Error(`Overview returned ${response.status}`);
  const data = await response.json();
  const snapshot = data.snapshot || {};
  const ageSeconds = Math.round((Date.now() - snapshot.receivedAt) / 1000);
  console.log(JSON.stringify({
    authenticated: true, demo: Boolean(snapshot.demo), ageSeconds,
    bot: snapshot.bot?.username, gatewayMs: snapshot.bot?.wsPingMs,
    memoryMb: snapshot.bot?.rssMb, channels: snapshot.guild?.channels?.length,
    queue: data.queue?.length, results: data.results?.length,
  }, null, 2));
  if (snapshot.demo || !Number.isFinite(ageSeconds) || ageSeconds > 180) {
    throw new Error('No fresh live phone snapshot');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
