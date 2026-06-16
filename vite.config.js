import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const showcaseDir = path.resolve(__dirname, '../personal webapp portfolio/showcase');
const e2eScreenshots = path.resolve(__dirname, '../personal webapp portfolio/milkman-portfolio/e2e/screenshots');
const wcScreenshots = path.resolve(__dirname, '../war-council/tests/screenshots');

function showcaseStaticPlugin() {
  return {
    name: 'milkman-showcase-proxy',
    configureServer(server) {
      server.middlewares.use('/showcase/wc', (req, res, next) => {
        const rel = (req.url || '/').split('?')[0].replace(/^\//, '');
        const file = path.join(showcaseDir, rel);
        if (!file.startsWith(showcaseDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next();
        }
        const ext = path.extname(file);
        const types = { '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
      });

      server.middlewares.use('/showcase/war-council-screenshots', (req, res, next) => {
        const rel = (req.url || '/').split('?')[0];
        const file = path.join(wcScreenshots, rel.replace(/^\//, ''));
        if (!file.startsWith(wcScreenshots) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next();
        }
        const ext = path.extname(file);
        const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
      });

      server.middlewares.use('/showcase/screenshots', (req, res, next) => {
        const rel = (req.url || '/').split('?')[0];
        const file = path.join(e2eScreenshots, rel.replace(/^\//, ''));
        if (!file.startsWith(e2eScreenshots) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next();
        }
        const ext = path.extname(file);
        const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
      });

      server.middlewares.use('/showcase/voxnovel', (req, res, next) => {
        const rel = req.url === '/' || req.url === '' ? '/index.html' : req.url.split('?')[0];
        const file = path.join(showcaseDir, rel.replace(/^\//, ''));
        if (!file.startsWith(showcaseDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next();
        }
        const ext = path.extname(file);
        const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), showcaseStaticPlugin()],
  server: {
    port: 5180,
    open: true,
    fs: {
      allow: [
        __dirname,
        path.resolve(__dirname, '../personal webapp portfolio'),
        path.resolve(__dirname, '../war-council'),
        path.resolve(__dirname, '../copilot-tts'),
      ],
    },
  },
});
