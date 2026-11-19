'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {backupDatabaseCosts} = require('../server-backup.cjs');

test('server backups include protected operator costs from persistent spool state or an explicit override', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'wordmate-backup-costs-'));
  try {
    const output = path.join(root,'backup');
    fs.mkdirSync(output);
    assert.equal(backupDatabaseCosts(root,{},output),null);
    const state = path.join(root,'state');
    fs.mkdirSync(state);
    const source = path.join(state,'admin-database-costs.json');
    const content = '{"format":1,"revision":1,"bills":[],"plans":[]}';
    fs.writeFileSync(source,content);
    const result = backupDatabaseCosts(root,{AUDIO_SPOOL_DIR:path.join(state,'audio-spool')},output);
    assert.equal(result.sha256,createHash('sha256').update(content).digest('hex'));
    const copy = path.join(output,'admin-database-costs.json');
    assert.equal(fs.readFileSync(copy,'utf8'),content);
    assert.equal(fs.statSync(copy).mode & 0o777,0o600);
    assert.equal(backupDatabaseCosts(root,{ADMIN_DATABASE_COSTS_FILE:source},output).bytes,content.length);
    assert.throws(() => backupDatabaseCosts(root,{ADMIN_DATABASE_COSTS_FILE:'relative.json'},output),/absolute path/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
