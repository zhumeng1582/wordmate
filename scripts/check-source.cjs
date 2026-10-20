// Parse/transpile-only check: this does not replace installed dependency typechecking/builds.
const fs=require('node:fs'),path=require('node:path');
const ts=require(process.env.TYPESCRIPT_MODULE||'typescript');
let count=0,failed=false;
function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory()){if(!['node_modules','dist'].includes(f.name))walk(p);}else if(/\.tsx?$/.test(p)&&!p.endsWith('.d.ts')){count++;const out=ts.transpileModule(fs.readFileSync(p,'utf8'),{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,experimentalDecorators:true,emitDecoratorMetadata:true}});for(const d of out.diagnostics||[]){if(d.category===ts.DiagnosticCategory.Error){failed=true;console.error(p,ts.flattenDiagnosticMessageText(d.messageText,'\n'));}}}}}
walk('apps');console.log(`${count} TypeScript/TSX files parsed; dependency resolution and semantic typechecking not included.`);process.exitCode=failed?1:0;
