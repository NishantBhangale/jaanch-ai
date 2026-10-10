// Copies the built React app (frontend/dist) into backend/public so one server serves both.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'frontend', 'dist');
const to = path.join(root, 'backend', 'public');

if (!fs.existsSync(path.join(from, 'index.html'))) {
  console.error('frontend/dist not found. Run the frontend build first.');
  process.exit(1);
}
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log(`Copied ${path.relative(root, from)} to ${path.relative(root, to)}`);
