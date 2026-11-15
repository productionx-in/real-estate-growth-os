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
    return { type, content };
  }
  return null;
}

function parseTree(buf) {
  const entries = [];
  let idx = 0;
  while (idx < buf.length) {
    const spaceIdx = buf.indexOf(32, idx);
    const mode = buf.slice(idx, spaceIdx).toString('utf8');
    const nullIdx = buf.indexOf(0, spaceIdx);
    const name = buf.slice(spaceIdx + 1, nullIdx).toString('utf8');
    const sha = buf.slice(nullIdx + 1, nullIdx + 21).toString('hex');
    entries.push({ mode, name, sha });
    idx = nullIdx + 21;
  }
  return entries;
}

function getFileContent(commitSha, targetPath) {
  const commit = readObject(commitSha);
  if (!commit) return null;
  const commitText = commit.content.toString('utf8');
  const treeSha = commitText.split('\n')[0].split(' ')[1];
  
  const segments = targetPath.split(/[/\\]/);
  let curSha = treeSha;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const treeObj = readObject(curSha);
    if (!treeObj) return null;
    const entries = parseTree(treeObj.content);
    const found = entries.find(e => e.name === seg);
    if (!found) return null;
    if (i === segments.length - 1) {
      const blobObj = readObject(found.sha);
      return blobObj ? blobObj.content.toString('utf8') : null;
    } else {
      curSha = found.sha;
    }
  }
  return null;
}

const baseCommit = '0f23857fbb51ddc4e15a2198cf166f1cf95185bc';
const headCommit = '1d682b1652c70b3d8dd2930176dd868b608b7052';

const files = [
  'supabase/migrations/20260032_payment_and_commercial_integrity.sql',
  'tests/db-integration/phase1-real-db.test.mjs',
  'tests/db-integration/phase1-concurrency.test.mjs',
  '.github/workflows/phase1-database-validation.yml'
];

for (const f of files) {
  console.log(`\n===================================================================`);
  console.log(`DIFF FOR: ${f}`);
  console.log(`Comparing ${baseCommit.slice(0, 8)} -> Working Tree (${headCommit.slice(0, 8)})`);
  console.log(`===================================================================`);
  
  const oldContent = getFileContent(baseCommit, f);
  const newContent = fs.readFileSync(f, 'utf8');

  if (oldContent === null) {
    console.log('Old content could not be read.');
    continue;
  }
  const oldLines = oldContent.replace(/\r\n/g, '\n').split('\n');
  const newLines = newContent.replace(/\r\n/g, '\n').split('\n');

  // Simple hunk finder
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else {
      // Find match ahead
      let matchOld = -1, matchNew = -1;
      for (let look = 1; look < 40; look++) {
        if (i + look < oldLines.length && oldLines[i + look] === newLines[j]) {
          matchOld = i + look;
          matchNew = j;
          break;
        }
        if (j + look < newLines.length && oldLines[i] === newLines[j + look]) {
          matchOld = i;
          matchNew = j + look;
          break;
        }
      }
      if (matchOld !== -1) {
        console.log(`\n@@ -${i + 1} +${j + 1} @@`);
        while (i < matchOld) {
          console.log(`- ${oldLines[i++]}`);
        }
        while (j < matchNew) {
          console.log(`+ ${newLines[j++]}`);
        }
      } else {
        console.log(`\n@@ -${i + 1} +${j + 1} @@`);
        console.log(`- ${oldLines[i++] || ''}`);
        console.log(`+ ${newLines[j++] || ''}`);
      }
    }
  }
}
