export class AudioFileCache{
 private files=new Map<string,string>();
 private limit:number;private removeFile:(path:string)=>void;
 constructor(limit:number,removeFile:(path:string)=>void){this.limit=limit;this.removeFile=removeFile;}
 get(key:string){const path=this.files.get(key);if(path){this.files.delete(key);this.files.set(key,path);}return path;}
 set(key:string,path:string){const previous=this.files.get(key);if(previous&&previous!==path)this.removeFile(previous);this.files.delete(key);this.files.set(key,path);while(this.files.size>this.limit){const oldest=this.files.keys().next().value!;this.remove(oldest);}}
 remove(key:string){const path=this.files.get(key);this.files.delete(key);if(path)this.removeFile(path);}
 clear(){for(const path of new Set(this.files.values()))this.removeFile(path);this.files.clear();}
}
