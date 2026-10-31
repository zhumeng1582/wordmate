const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../apps/miniapp/dist');
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
assert.equal(project.appid,'wxcf7d28bc513949d4');
assert.equal(project.setting.urlCheck,true,'release project must check legal server domains');
assert.equal(app.lazyCodeLoading,'requiredComponents','component lazy loading must be enabled');
for(const page of ['pages/login/index','pages/privacy-policy/index','pages/privacy/index','pages/ai-settings/index','pages/ai-advanced/index','pages/ai-usage/index','pages/generation/index','pages/add-words/index','pages/invite/index','pages/settings/index','pages/word-search/index','pages/wordbooks/index','pages/wordbook-edit/index','pages/wordbook-share/index'])assert(app.pages.includes(page),`missing configured page: ${page}`);
assert(!app.pages.includes('pages/discover/index'),'public discovery must not be registered');
assert(!fs.existsSync(path.join(root,'pages/discover/index.js')),'public discovery must not be bundled');
const pageCode=page=>fs.readFileSync(path.join(root,`pages/${page}/index.js`),'utf8').replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
for(const page of ['words','wordbooks','wordbook-share'])assert.doesNotMatch(pageCode(page),/发现词本|发现共享词本|允许其他用户搜索并加入|保存设置|pages\/discover/,'public-sharing UI must be absent');
assert.match(pageCode('wordbook-share'),/停止历史共享/);
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
assert.equal(fs.readFileSync(path.join(root,'assets/invite-cover.png')).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
const mediaExtensions=new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg','.ico','.avif','.mp3','.wav','.ogg','.aac','.m4a','.flac','.wma','.aiff','.amr']);
const mediaFiles=fs.readdirSync(root,{recursive:true}).filter(file=>mediaExtensions.has(path.extname(file).toLowerCase())&&fs.statSync(path.join(root,file)).isFile());
for(const file of mediaFiles)assert(fs.statSync(path.join(root,file)).size<=200*1024,`packaged media exceeds 200 KB: ${file}`);
for(const page of app.pages)for(const ext of ['.js','.json','.wxml'])assert(fs.statSync(path.join(root,page+ext)).size>0,`${page}${ext}`);
assert(fs.statSync(path.join(root,'app.js')).size>0);
console.log(`PASS: WeChat build includes app config, expected AppID, all ${app.pages.length} configured page artifacts, native light/dark theme configuration, required-components lazy loading and ${mediaFiles.length} media files within 200 KB each. Simulator rendering still needs DevTools verification.`);
