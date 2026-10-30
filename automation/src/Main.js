export const settings = () => ({
  endpoint: process.env.RED_PANDA_CDP ?? 'ws://127.0.0.1:9222/',
  url: process.env.RED_PANDA_URL ?? `data:text/html,${encodeURIComponent('<!doctype html><title>Red Panda demo</title><h1>Ready</h1><a href="https://example.com/">Example</a>')}`,
});
