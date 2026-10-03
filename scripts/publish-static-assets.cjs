const fs = require('node:fs');
const path = require('node:path');

// Next assetPrefix changes URLs but does not move the static export files.
// Publish the matching directory while retaining /_next for existing tabs.
const output = path.resolve(__dirname, '../out');
fs.mkdirSync(path.join(output, 'foco-assets'), { recursive: true });
fs.cpSync(path.join(output, '_next'), path.join(output, 'foco-assets/_next'), { recursive: true });

const html = fs.readFileSync(path.join(output, 'trade/index.html'), 'utf8');
const urls = [...html.matchAll(/(?:src|href)="(\/foco-assets\/_next\/[^"?]+)"/g)].map(match => match[1]);
if (!urls.length) throw new Error('Trade export has no namespaced static assets');
for (const url of urls) {
  if (!fs.existsSync(path.join(output, url))) throw new Error(`Missing published asset: ${url}`);
}
console.log(`Verified ${new Set(urls).size} Trade static assets in the export.`);
