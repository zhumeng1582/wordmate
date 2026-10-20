const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {randomUUID}=require('node:crypto');
const ts=require(process.env.TYPESCRIPT_MODULE||'typescript');
// Compile this adapter only; external module paths are explicit test harness inputs.
const filename=path.resolve('apps/api/dist/database.js');
const compiled=ts.transpileModule(fs.readFileSync('apps/api/src/database.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded=new Module(filename);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));
if(process.env.TEST_MODULE_DIRECTORY)loaded.paths.push(process.env.TEST_MODULE_DIRECTORY);
loaded._compile(compiled,filename);
const {connect}=loaded.exports;
test('embedded development DB initializes once, persists after reopen and rejects unsafe modes',async()=>{
 const name=`adapter-test-${randomUUID()}`,directory=path.resolve('.local',name),url=`pglite:.local/${name}`;
 process.env.NODE_ENV='development';process.env.AUTH_MODE='development';
 let connection;
 try{
  connection=await connect(url);
  await connection.db.query("INSERT INTO wordmate.users(wx_app_id,wx_open_id,display_name) VALUES('test','test','持久化测试')");
  await connection.source.destroy();connection=undefined;
  connection=await connect(url);
  const rows=await connection.db.query('SELECT display_name FROM wordmate.users');assert.equal(rows.rows[0].display_name,'持久化测试');
  await connection.source.destroy();connection=undefined;
  await assert.rejects(connect('pglite:../outside'),/inside .local/);
  process.env.NODE_ENV='production';await assert.rejects(connect(url),/only enabled for local development/);
 }finally{if(connection)await connection.source.destroy();fs.rmSync(directory,{recursive:true,force:true});}
});
