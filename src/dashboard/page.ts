export function buildDashboardSearchRequest(apiKey: string, userId: string, query: string): {
  url: string;
  init: RequestInit;
} {
  return {
    url: '/v1/memories/search',
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, query }),
    },
  };
}

export function renderDashboardLogin(): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mem0 Edge Dashboard</title></head>
<body>
  <main>
    <h1>Mem0 Edge Dashboard</h1>
    <p>Unauthorized</p>
    <form action="/dashboard/login" method="post">
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

export function renderDashboard(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mem0 Edge Dashboard</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #18212b; background: #f5f7f8; }
    body { margin: 0; }
    main { max-width: 760px; margin: 48px auto; padding: 0 20px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { margin: 0 0 24px; color: #5b6875; }
    form { display: grid; gap: 16px; }
    label { display: grid; gap: 6px; font-weight: 600; }
    input, button { font: inherit; }
    input { box-sizing: border-box; width: 100%; padding: 9px 10px; border: 1px solid #aeb8c2; border-radius: 4px; }
    button { justify-self: start; padding: 9px 14px; border: 0; border-radius: 4px; color: #fff; background: #176b5a; cursor: pointer; }
    pre { min-height: 80px; margin-top: 24px; padding: 16px; overflow: auto; border: 1px solid #d5dce2; border-radius: 4px; background: #fff; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>Mem0 Edge Dashboard</h1>
    <p>Search stored memories for a user.</p>
    <form id="search-form">
      <label>API key<input name="api_key" type="password" autocomplete="off" required></label>
      <label>User ID<input name="user_id" required></label>
      <label>Query<input name="query" required></label>
      <button type="submit">Search</button>
    </form>
    <form action="/dashboard/logout" method="post">
      <button type="submit">Log out</button>
    </form>
    <pre id="result" aria-live="polite">Enter a query to search memories.</pre>
  </main>
  <script>
    ${buildDashboardSearchRequest.toString()}
    const form = document.getElementById('search-form');
    const result = document.getElementById('result');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      result.textContent = 'Searching...';
      try {
        const request = buildDashboardSearchRequest(
          String(data.get('api_key')),
          String(data.get('user_id')),
          String(data.get('query')),
        );
        const response = await fetch(request.url, request.init);
        const body = await response.json();
        result.textContent = JSON.stringify(body, null, 2);
      } catch (error) {
        result.textContent = JSON.stringify({ error: error instanceof Error ? error.message : 'Search failed' }, null, 2);
      }
    });
  </script>
</body>
</html>`;
}
