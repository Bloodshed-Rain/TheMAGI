const { createServer } = require('../../../node_modules/vite');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const bridge = fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8');
createServer({
  configFile: path.join(root, 'vite.config.ts'),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [{
    name: 'audit-preview-only',
    transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', children: bridge, injectTo: 'head-prepend' }] },
    configureServer(server) {
      server.middlewares.use('/audit-preview', (req, res) => {
        const q = new URL(req.url, 'http://localhost').searchParams;
        const width = q.get('size') === 'small' ? 900 : 1200;
        const height = q.get('size') === 'small' ? 600 : 800;
        const scene = ['empty', 'populated', 'save-error', 'load-error'].includes(q.get('scene')) ? q.get('scene') : 'populated';
        const theme = q.get('theme') === 'windows2000' ? 'windows2000' : 'liquid';
        const route = /^\/[a-z]+$/.test(q.get('route')) ? q.get('route') : '/dashboard';
        res.setHeader('Content-Type', 'text/html');
        res.end(`<html><head><title>MAGI audit preview</title></head><body style="margin:0;background:#ddd;font:14px Arial"><div style="padding:8px">AUDIT FIXTURE — synthetic data, isolated memory, ${width} × ${height} renderer. Native playback and real services are not connected.</div><iframe title="MAGI app preview" style="border:0;width:${width}px;height:${height}px" src="/?auditScene=${scene}&auditTheme=${theme}#${route}"></iframe></body></html>`);
      });
    },
  }],
}).then(async server => { await server.listen(); console.log('Audit fixture preview: http://127.0.0.1:5173/audit-preview'); });
