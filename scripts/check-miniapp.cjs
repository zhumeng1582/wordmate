const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../apps/miniapp/dist');
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
assert.equal(project.appid,'wxcf7d28bc513949d4');
assert.equal(app.pages.length,10);
assert(app.pages.includes('pages/generation/index'));
assert(app.pages.includes('pages/invite/index'));
assert(app.pages.includes('pages/settings/index'));
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
assert.equal(fs.readFileSync(path.join(root,'assets/invite-cover.png')).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
for(const page of app.pages)for(const ext of ['.js','.json','.wxml'])assert(fs.statSync(path.join(root,page+ext)).size>0,`${page}${ext}`);
assert(fs.statSync(path.join(root,'app.js')).size>0);
console.log('PASS: WeChat build includes app config, expected AppID and all ten page artifacts and native light/dark theme configuration. Simulator rendering still needs DevTools verification.');
