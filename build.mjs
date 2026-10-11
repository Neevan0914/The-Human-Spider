// Bundles the game (and three.js) into one self-contained HTML file that
// opens with a double-click, no server or internet needed (fonts aside).
//   npm install && npm run build   ->   dist/the-human-spider.html
import { build } from 'esbuild';
import fs from 'fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2020',
  legalComments: 'none',
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [],
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('style.css', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\n/, '');
html = html.replace('<script type="module" src="src/main.js"></script>', () => `<script type="module">\n${js}</script>`);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/the-human-spider.html', html);
console.log(`dist/the-human-spider.html  ${(html.length / 1024).toFixed(0)} KB`);
