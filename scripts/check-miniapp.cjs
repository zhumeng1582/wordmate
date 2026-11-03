const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../apps/miniapp/dist');
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
assert.equal(project.appid,'wxcf7d28bc513949d4');
assert.equal(project.setting.urlCheck,true,'release project must check legal server domains');
assert.equal(app.lazyCodeLoading,'requiredComponents','component lazy loading must be enabled');
for(const page of ['pages/login/index','pages/privacy-policy/index','pages/privacy/index','pages/ai-settings/index','pages/ai-advanced/index','pages/ai-usage/index','pages/generation/index','pages/add-words/index','pages/invite/index','pages/settings/index','pages/word-search/index','pages/favorites/index','pages/wordbooks/index','pages/discover/index','pages/wordbook-edit/index','pages/wordbook-share/index'])assert(app.pages.includes(page),`missing configured page: ${page}`);
const pageCode=page=>fs.readFileSync(path.join(root,`pages/${page}/index.js`),'utf8').replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
assert.match(pageCode('wordbooks'),/pages\/discover|发现词本/);
assert.match(pageCode('wordbook-share'),/公开共享/);
assert.equal(app.darkmode,true);
const theme=JSON.parse(fs.readFileSync(path.join(root,app.themeLocation),'utf8'));
for(const mode of ['light','dark']){
 for(const field of ['navigationBarBackgroundColor','navigationBarTextStyle','backgroundColor','backgroundTextStyle']){
  const variable=app.window[field];assert(variable.startsWith('@'));assert(theme[mode][variable.slice(1)],mode+' '+field);
 }
}
assert.notEqual(theme.light.pageBackground,theme.dark.pageBackground);
assert.match(fs.readFileSync(path.join(root,'app-origin.wxss'),'utf8'),/prefers-color-scheme:\s*dark/);

assert.match(fs.readFileSync(path.join(root,'pages/family/index.js'),'utf8'),/enableShareAppMessage\s*=\s*(true|!0)/);
assert.match(fs.readFileSync(path.join(root,'pages/calendar/index.js'),'utf8'),/enableShareAppMessage\s*=\s*(true|!0)/);
assert.equal(fs.readFileSync(path.join(root,'assets/invite-cover.jpg')).subarray(0,2).toString('hex'),'ffd8');
const mediaExtensions=new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg','.ico','.avif','.mp3','.wav','.ogg','.aac','.m4a','.flac','.wma','.aiff','.amr']);
const mediaFiles=fs.readdirSync(root,{recursive:true}).filter(file=>mediaExtensions.has(path.extname(file).toLowerCase())&&fs.statSync(path.join(root,file)).isFile());
const mediaBytes=mediaFiles.reduce((total,file)=>total+fs.statSync(path.join(root,file)).size,0);
assert(mediaBytes<=200*1024,`packaged media totals ${mediaBytes} bytes, exceeding 200 KB`);
const files=fs.readdirSync(root,{recursive:true}).filter(file=>fs.statSync(path.join(root,file)).isFile());
const packageBytes=files.reduce((total,file)=>total+fs.statSync(path.join(root,file)).size,0);
assert(packageBytes<1.5*1024*1024,`main package totals ${packageBytes} bytes, exceeding 1.5 MB`);
for(const page of app.pages)for(const ext of ['.js','.json','.wxml'])assert(fs.statSync(path.join(root,page+ext)).size>0,`${page}${ext}`);
assert(fs.statSync(path.join(root,'app.js')).size>0);
console.log(`PASS: WeChat build includes app config, expected AppID, all ${app.pages.length} configured page artifacts, native light/dark theme configuration, required-components lazy loading and ${mediaFiles.length} media files totaling ${mediaBytes} bytes, and ${packageBytes} main package bytes. Simulator rendering still needs DevTools verification.`);
