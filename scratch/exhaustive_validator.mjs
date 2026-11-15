import fs from 'node:fs';
import path from 'node:path';

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

console.log(`Starting Exhaustive Database Schema & Migration Validator on ${files.length} migrations...`);

// State
const types = new Map();
const tables = new Map();
const functions = new Map();
const triggers = new Map();
const policies = new Map();

// Types
['uuid', 'text', 'varchar', 'integer', 'bigint', 'boolean', 'timestamptz', 'timestamp', 'json', 'jsonb', 'numeric', 'bytea', 'trigger', 'record', 'void'].forEach(t => types.set(t, new Set()));

// Auth tables
const authUsersCols = new Map([
  ['id', 'uuid'],
  ['email', 'text'],
  ['encrypted_password', 'text'],
  ['email_confirmed_at', 'timestamptz'],
  ['raw_app_meta_data', 'jsonb'],
  ['raw_user_meta_data', 'jsonb'],
  ['created_at', 'timestamptz'],
  ['updated_at', 'timestamptz'],
  ['role', 'text'],
  ['aud', 'text']
]);
tables.set('auth.users', authUsersCols);

const issues = [];

function report(file, type, msg) {
  issues.push({ file, type, msg });
  console.log(`[${type}] ${file}: ${msg}`);
}

function cleanName(n) {
  return n.trim().toLowerCase().replace(/^public\./, '').replace(/^"|"$/g, '');
}

function splitStatements(content) {
  const statements = [];
  let currentStmt = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    const nextCh = content[i + 1] || '';
    
    if (!inDollarQuote && !inSingleQuote && !inBlockComment && ch === '-' && nextCh === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    
    if (!inDollarQuote && !inSingleQuote && !inLineComment && ch === '/' && nextCh === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && nextCh === '/') {
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    
    if (!inDollarQuote && ch === "'") {
      if (inSingleQuote && nextCh === "'") {
        currentStmt += "''";
        i += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      currentStmt += ch;
      i++;
      continue;
    }
    if (inSingleQuote) {
      currentStmt += ch;
      i++;
      continue;
    }
    
    if (ch === '$') {
      const match = content.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        const tag = match[1];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
          currentStmt += tag;
          i += tag.length;
          continue;
        } else if (inDollarQuote && tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
          currentStmt += tag;
          i += tag.length;
          continue;
        }
      }
    }
    
    if (!inDollarQuote && ch === ';') {
      if (currentStmt.trim()) statements.push(currentStmt.trim());
      currentStmt = '';
      i++;
      continue;
    }
    
    currentStmt += ch;
    i++;
  }
  if (currentStmt.trim()) statements.push(currentStmt.trim());
  return statements;
}

for (const file of files) {
  const filePath = path.join(dir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const statements = splitStatements(content);

  for (let sIdx = 0; sIdx < statements.length; sIdx++) {
    const rawStmt = statements[sIdx];
    const stmt = rawStmt.replace(/\s+/g, ' ');

    // 1. CREATE TYPE ... AS ENUM
    const enumMatch = stmt.match(/CREATE\s+TYPE\s+([a-zA-Z0-9_\.]+)\s+AS\s+ENUM\s*\(([\s\S]*?)\)/i);
    if (enumMatch) {
      const typeName = cleanName(enumMatch[1]);
      const vals = enumMatch[2].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
      if (types.has(typeName) && !stmt.toLowerCase().includes('exception when duplicate_object')) {
        report(file, 'DUPLICATE_TYPE', `Type ${typeName} already created`);
      }
      types.set(typeName, new Set(vals));
    }

    // 2. CREATE TABLE
    const tableMatch = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_\.]+)\s*\(([\s\S]*)\)/i);
    if (tableMatch) {
      const tblName = cleanName(tableMatch[1]);
      const body = tableMatch[2];
      
      if (!tables.has(tblName)) {
        tables.set(tblName, new Map());
      }
      const colMap = tables.get(tblName);

      // Parse column definitions
      const lines = body.split(',');
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|CONSTRAINT|UNIQUE|CHECK)/i.test(trimmed)) continue;
        const colMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_\.]+)/);
        if (colMatch) {
          const colName = colMatch[1].toLowerCase();
          const colType = cleanName(colMatch[2]);
          colMap.set(colName, colType);
        }
      }
    }

    // 3. ALTER TABLE ... ADD COLUMN (handling multiple ADD COLUMN clauses)
    const alterTableMatch = stmt.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?([a-zA-Z0-9_\.]+)\s+([\s\S]*)/i);
    if (alterTableMatch) {
      const tbl = cleanName(alterTableMatch[1]);
      const rest = alterTableMatch[2];
      
      // Match each ADD COLUMN ...
      const addColRegex = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_\.]+)/gi;
      let acm;
      while ((acm = addColRegex.exec(rest)) !== null) {
        const col = acm[1].toLowerCase();
        const typ = cleanName(acm[2]);
        if (!tables.has(tbl)) {
          report(file, 'TABLE_NOT_FOUND', `ALTER TABLE on non-existent table ${tbl}`);
        } else {
          tables.get(tbl).set(col, typ);
        }
      }
    }

    // 4. DROP TRIGGER
    const dropTrgMatch = stmt.match(/DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+ON\s+([a-zA-Z0-9_\.]+)/i);
    if (dropTrgMatch) {
      const trgName = dropTrgMatch[1].toLowerCase();
      const tblName = cleanName(dropTrgMatch[2]);
      triggers.delete(`${tblName}.${trgName}`);
    }

    // 5. CREATE TRIGGER
    const createTrgMatch = stmt.match(/CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)\s+(BEFORE|AFTER|INSTEAD\s+OF)[\s\S]*?ON\s+([a-zA-Z0-9_\.]+)[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([a-zA-Z0-9_\.]+)\s*\(/i);
    if (createTrgMatch) {
      const trgName = createTrgMatch[1].toLowerCase();
      const tblName = cleanName(createTrgMatch[3]);
      const funcName = cleanName(createTrgMatch[4]);
      const key = `${tblName}.${trgName}`;

      if (!tables.has(tblName) && tblName !== 'auth.users') {
        report(file, 'TABLE_NOT_FOUND', `Trigger ${trgName} registered on non-existent table ${tblName}`);
      }
      if (triggers.has(key)) {
        report(file, 'DUPLICATE_TRIGGER', `Trigger ${trgName} already exists on ${tblName} (from ${triggers.get(key).file})`);
      }
      triggers.set(key, { file, funcName });
    }

    // 6. UPDATE <table> SET col = ...
    // Note: only direct updates, not inside function bodies (which execute at runtime)
    if (!stmt.toLowerCase().startsWith('create or replace function') && !stmt.toLowerCase().startsWith('create function')) {
      const updateMatch = stmt.match(/UPDATE\s+(?:ONLY\s+)?([a-zA-Z0-9_\.]+)\s+(?:AS\s+[a-zA-Z0-9_]+\s+)?SET\s+([\s\S]*?)(?:WHERE|RETURNING|$)/i);
      if (updateMatch) {
        const tblName = cleanName(updateMatch[1]);
        const setClause = updateMatch[2];
        
        if (tables.has(tblName)) {
          const colMap = tables.get(tblName);
          const assignments = setClause.split(',');
          for (const ass of assignments) {
            const colMatch = ass.trim().match(/^([a-zA-Z0-9_]+)\s*=/);
            if (colMatch) {
              const col = colMatch[1].toLowerCase();
              if (!colMap.has(col)) {
                report(file, 'INVALID_COLUMN_UPDATE', `Direct migration UPDATE on table ${tblName} references non-existent column "${col}"`);
              }
            }
          }
        } else {
          report(file, 'TABLE_NOT_FOUND', `UPDATE on non-existent table ${tblName}`);
        }
      }
    }

    // 7. CREATE OR REPLACE FUNCTION
    const funcMatch = stmt.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_\.]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)(?:AS\s+\$\$|\$BODY\$)/i);
    if (funcMatch) {
      const fnName = cleanName(funcMatch[1]);
      const isSecDef = /SECURITY\s+DEFINER/i.test(stmt);
      const searchPathMatch = stmt.match(/SET\s+search_path\s*=\s*([\s\S]*?)(?:AS|\$\$|LANGUAGE|SECURITY|$)/i);
      const searchPath = searchPathMatch ? searchPathMatch[1].trim() : null;

      // Check for duplicate LANGUAGE plpgsql in header and footer
      const headerHasLang = /LANGUAGE\s+plpgsql/i.test(stmt.slice(0, stmt.indexOf('$$')));
      const footerHasLang = /\$\$\s*LANGUAGE\s+plpgsql/i.test(stmt);
      if (headerHasLang && footerHasLang) {
        report(file, 'DUPLICATE_LANGUAGE', `Function ${fnName} has duplicate LANGUAGE plpgsql in header and footer`);
      }
    }
  }
}

console.log(`\n===================================================================`);
console.log(`TOTAL DETECTED SCHEMA / MIGRATION ISSUES: ${issues.length}`);
console.log(`===================================================================`);
for (const iss of issues) {
  console.log(`- [${iss.type}] ${iss.file}: ${iss.msg}`);
}
