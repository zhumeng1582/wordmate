// Rebuild: node scripts/build-icons.cjs prepare
// swift scripts/render-icons.swift .local/icon-build/icons.html .local/icon-build/icons.json
// node scripts/build-icons.cjs build
const fs=require('node:fs'),path=require('node:path');
const compact=require('./compact-icon-png.cjs');
const icons=require('./icon-sources.cjs'),root=path.resolve(__dirname,'..'),dir=path.join(root,'.local/icon-build');
const tones={normal:['#607680','#b1c4c8'],primary:['#286d9f','#9ed0ed'],inverse:['#ffffff','#173446']};
fs.mkdirSync(dir,{recursive:true});
if(process.argv[2]==='prepare'){
 const samples=[];for(const [name,body] of Object.entries(icons))for(const [tone,colors] of Object.entries(tones))for(let theme=0;theme<2;theme++)samples.push({id:`${name}:${tone}:${theme}`,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" color="${colors[theme]}">${body}</svg>`});
 fs.writeFileSync(path.join(dir,'icons.html'),`<!doctype html><meta charset="utf-8"><script>const samples=${JSON.stringify(samples)};window.iconExports={};(async()=>{for(const sample of samples){const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(sample.svg)});const canvas=document.createElement('canvas');canvas.width=72;canvas.height=72;canvas.getContext('2d').drawImage(image,0,0);window.iconExports[sample.id]=canvas.toDataURL('image/png').split(',')[1]}window.iconReady=true})().catch(e=>window.iconError=String(e));</script>`);
 console.log(JSON.stringify({icons:Object.keys(icons).length,samples:samples.length}));
}else if(process.argv[2]==='build'){
 const rendered=JSON.parse(fs.readFileSync(path.join(dir,'icons.json'),'utf8'));
 let css='/* Generated from scripts/icon-sources.cjs. Native-safe PNGs at 3x; no icon font or network request. */\n.app-icon{display:inline-block;flex:none;align-self:center;vertical-align:middle;width:40px;height:40px;line-height:1;background-repeat:no-repeat;background-position:center;background-size:100% 100%;pointer-events:none}\n.app-icon-sm{width:32px;height:32px}.app-icon-lg{width:48px;height:48px}.app-icon-primary{background-image:var(--glyph-primary)}.app-icon-inverse{background-image:var(--glyph-inverse)}\n';
 for(let theme=0;theme<2;theme++){
  if(theme)css+='@media(prefers-color-scheme:dark){\n';
  for(const name of Object.keys(icons)){
   const vars=Object.keys(tones).map(tone=>{const original=rendered[`${name}:${tone}:${theme}`];const data=original?compact(original,tones[tone][theme]):null;if(!data)throw Error('Missing icon raster');return `--glyph-${tone}:url("data:image/png;base64,${data}")`;}).join(';');
   css+=`.app-icon-${name}{${vars}${theme?'':';background-image:var(--glyph-normal)'}}\n`;
  }
  if(theme)css+='}\n';
 }
 // Tone rules follow individual glyph definitions so active/inverse wins.
 css+='.app-icon.app-icon-primary{background-image:var(--glyph-primary)}.app-icon.app-icon-inverse{background-image:var(--glyph-inverse)}\n';
 fs.writeFileSync(path.join(root,'apps/miniapp/src/components/Icon.css'),css);
 console.log(JSON.stringify({icons:Object.keys(icons).length,cssBytes:Buffer.byteLength(css)}));
}else throw Error('Usage: node scripts/build-icons.cjs prepare|build');
