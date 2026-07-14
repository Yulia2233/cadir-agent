const endpoints = [process.env.API_HEALTH_URL ?? 'http://127.0.0.1:8080/health/ready'];

let failed = false;
for (const endpoint of endpoints) {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5_000) });
    const body = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    process.stdout.write(`${endpoint}: ${body.status ?? 'ok'}\n`);
  } catch (error) {
    failed = true;
    process.stderr.write(
      `${endpoint}: unhealthy (${error instanceof Error ? error.message : 'unknown'})\n`,
    );
  }
}

process.exitCode = failed ? 1 : 0;
