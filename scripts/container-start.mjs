// Setup completes before the application accepts traffic. Existing CSV/auth data
// are retained; Metabase setup reuses its saved database, cards and credentials.
await import('./metabase-setup.mjs');
await import('./start.mjs');
