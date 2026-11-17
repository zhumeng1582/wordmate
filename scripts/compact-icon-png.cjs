// Solid-color icons only: store antialiasing as an indexed alpha palette.
// This keeps native PNG compatibility without adding a runtime image dependency.
const {inflateSync,deflateSync}=require('node:zlib');
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(name,data){const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);let value=0xffffffff;for(const byte of Buffer.concat([type,data]))value=crcTable[(value^byte)&255]^(value>>>8);crc.writeUInt32BE((value^0xffffffff)>>>0);return Buffer.concat([length,type,data,crc]);}
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
module.exports=function compactIconPng(base64,color){
 const png=Buffer.from(base64,'base64'),idat=[];let header;
 for(let offset=8;offset<png.length;){const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size);if(type==='IHDR')header=Buffer.from(data);if(type==='IDAT')idat.push(data);offset+=size+12;}
 if(!header||header[8]!==8||header[9]!==6||header[12]!==0)throw Error('Expected non-interlaced RGBA icon PNG');
 const width=header.readUInt32BE(0),height=header.readUInt32BE(4),stride=width*4,raw=inflateSync(Buffer.concat(idat)),pixels=Buffer.alloc(stride*height);
 let offset=0;for(let y=0;y<height;y++){const filter=raw[offset++];if(filter>4)throw Error('Invalid PNG row filter');for(let x=0;x<stride;x++){const index=y*stride+x,a=x>=4?pixels[index-4]:0,b=y?pixels[index-stride]:0,c=x>=4&&y?pixels[index-stride-4]:0;pixels[index]=(raw[offset++]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
 const alpha=Array.from({length:width*height},(_,i)=>Math.min(255,Math.round(pixels[i*4+3]/4)*4)),levels=[...new Set(alpha)].sort((a,b)=>a-b),indices=new Map(levels.map((a,i)=>[a,i]));
 const rgb=Buffer.from(color.slice(1),'hex'),palette=Buffer.concat(levels.map(()=>rgb)),transparency=Buffer.from(levels),rows=[];let previous=Buffer.alloc(width);
 for(let y=0;y<height;y++){
  const row=Buffer.from(alpha.slice(y*width,(y+1)*width).map(a=>indices.get(a))),candidates=[row,Buffer.from(row.map((v,x)=>(v-(x?row[x-1]:0))&255)),Buffer.from(row.map((v,x)=>(v-previous[x])&255))];
  let chosen=0,score=Infinity;for(let i=0;i<candidates.length;i++){const current=candidates[i].reduce((sum,v)=>sum+Math.min(v,256-v),0);if(current<score){chosen=i;score=current;}}
  rows.push(Buffer.from([chosen]),candidates[chosen]);previous=row;
 }
 header[9]=3;
 return Buffer.concat([png.subarray(0,8),chunk('IHDR',header),chunk('PLTE',palette),chunk('tRNS',transparency),chunk('IDAT',deflateSync(Buffer.concat(rows),{level:9})),chunk('IEND',Buffer.alloc(0))]).toString('base64');
};
