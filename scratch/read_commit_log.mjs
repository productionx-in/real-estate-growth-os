import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function readObject(sha) {
  const dir = sha.slice(0, 2);
  const file = sha.slice(2);
  const objPath = path.join('.git', 'objects', dir, file);
  if (fs.existsSync(objPath)) {
    const raw = fs.readFileSync(objPath);
    const uncompressed = zlib.inflateSync(raw);
    const nullIdx = uncompressed.indexOf(0);
    const header = uncompressed.slice(0, nullIdx).toString('utf8');
    const [type, size] = header.split(' ');
    const content = uncompressed.slice(nullIdx + 1);
    return { type, content: content.toString('utf8') };
  }
  return null;
}

let cur = fs.readFileSync('.git/refs/heads/phase1-database-validation', 'utf8').trim();
console.log('Recent commits on phase1-database-validation:');
for (let i = 0; i < 5 && cur; i++) {
  const obj = readObject(cur);
  if (!obj) break;
  const lines = obj.content.split('\n');
  const tree = lines.find(l => l.startsWith('tree '));
  const parent = lines.find(l => l.startsWith('parent '));
  const author = lines.find(l => l.startsWith('author '));
  const committer = lines.find(l => l.startsWith('committer '));
  const msgIdx = lines.findIndex(l => l.trim() === '');
  const msg = lines.slice(msgIdx + 1).join('\n').trim();
  console.log(`\nCommit: ${cur}`);
  console.log(`Author: ${author}`);
  console.log(`Message: ${msg}`);
  cur = parent ? parent.split(' ')[1] : null;
}
