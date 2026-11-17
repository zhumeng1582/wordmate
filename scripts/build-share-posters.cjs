// Full-resolution WebP backgrounds and JPEG fallbacks, stored on private OSS.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'assets/share-posters/compressed');
const names=fs.readdirSync(path.join(root,'assets/share-posters')).filter(name=>/^\d{2}-[a-z0-9-]+\.png$/.test(name)).sort();
if(names.length!==10)throw Error('Expected ten original poster backgrounds');
fs.mkdirSync(folder,{recursive:true});const files=[];
for(const name of names){
 const original=path.join(root,'assets/share-posters',name),id=name.replace('.png','');
 execFileSync('cwebp',['-quiet','-q','65','-m','6',original,'-o',path.join(folder,id+'.webp')]);
 execFileSync('sips',['-s','format','jpeg','-s','formatOptions','65',original,'--out',path.join(folder,id+'.jpg')],{stdio:'ignore'});
 for(const format of ['webp','jpg']){const file=id+'.'+format,bytes=fs.readFileSync(path.join(folder,file));files.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
}
fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({version:'compressed-v1',files},null,2)+'\n');
for(const format of ['webp','jpg'])console.log(format,files.filter(f=>f.file.endsWith('.'+format)).reduce((sum,f)=>sum+f.bytes,0),'bytes');
