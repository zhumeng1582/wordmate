import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyMigrations,baselineMigrations,migrationPlan,migrationStatus,readMigrations} from '../src/migration-ledger.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const file=(version:number,sql:string)=>({version,name:`${String(version).padStart(3,'0')}_test.sql`,sql,sha256:createHash('sha256').update(sql).digest('hex')});
test('managed migrations require an explicit verified baseline, preserve data and reject changed history',async()=>{
 const pg=new PGlite();await pg.exec("CREATE SCHEMA wordmate; CREATE TABLE wordmate.existing(value text); INSERT INTO wordmate.existing VALUES('kept')");
 const db={query:(sql:string,p?:any[])=>pg.query(sql,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(sql:string,p?:any[])=>q.query(sql,p)}))};
 const initial=file(2,'CREATE TABLE wordmate.legacy(id int);'),next=file(3,'CREATE TABLE wordmate.added(id int);');
 try{
  assert.equal((await migrationStatus(db,[initial,next])).tracked,false);await assert.rejects(applyMigrations(db,[initial,next]),/baseline/);
  await baselineMigrations(db,2,[initial,next]);assert.deepEqual((await migrationStatus(db,[initial,next])).pending,[next.name]);assert.deepEqual(await applyMigrations(db,[initial,next]),[next.name]);assert.equal((await pg.query('SELECT value FROM wordmate.existing')).rows[0].value,'kept');assert.deepEqual(await applyMigrations(db,[initial,next]),[]);
  assert.throws(()=>migrationPlan([file(2,'changed'),next],[{name:initial.name,sha256:initial.sha256}]),/checksum changed/);
  assert.throws(()=>migrationPlan([initial,next],[{name:next.name,sha256:next.sha256}]),/gap/);
  await assert.rejects(baselineMigrations(db,2,[initial,next]),/already exists/);
 }finally{await pg.close();}
});
test('a failed migration rolls back its earlier changes and ledger entries',async()=>{
 const pg=new PGlite();await pg.exec('CREATE SCHEMA wordmate');const db={query:(sql:string,p?:any[])=>pg.query(sql,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(sql:string,p?:any[])=>q.query(sql,p)}))};
 const first=file(2,'SELECT 1;'),good=file(3,'CREATE TABLE wordmate.temporary_result(id int);'),bad=file(4,'INVALID SQL;');
 try{await baselineMigrations(db,2,[first,good,bad]);await assert.rejects(applyMigrations(db,[first,good,bad]));const result=await pg.query("SELECT to_regclass('wordmate.temporary_result') AS name");assert.equal(result.rows[0].name,null);assert.deepEqual((await migrationStatus(db,[first,good,bad])).pending,[good.name,bad.name]);}finally{await pg.close();}
});

test('invalid SQL migration filenames cannot silently disappear from the release',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wordmate-migrations-'));
 try{writeFileSync(join(dir,'002_valid.sql'),'SELECT 1;');assert.equal(readMigrations(dir).length,1);writeFileSync(join(dir,'003-invalid.sql'),'SELECT 1;');assert.throws(()=>readMigrations(dir),/Invalid migration filename: 003-invalid.sql/);}finally{rmSync(dir,{recursive:true,force:true});}
});
