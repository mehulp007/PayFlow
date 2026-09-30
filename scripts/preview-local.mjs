process.env.NODE_ENV='preview';
process.env.SERVE_WEB='1';
await import('../apps/api/dist/server.js');
