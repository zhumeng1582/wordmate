export type FloatBounds={width:number;height:number;size:number;bottomInset:number};
export type FloatPoint={x:number;y:number};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function constrainTutorFloat(point:FloatPoint,bounds:FloatBounds):FloatPoint{
 const edge=8,top=8,bottom=8+Math.max(0,bounds.bottomInset);
 return {x:clamp(point.x,edge,Math.max(edge,bounds.width-bounds.size-edge)),y:clamp(point.y,top,Math.max(top,bounds.height-bounds.size-bottom))};
}
export function snapTutorFloat(point:FloatPoint,bounds:FloatBounds):FloatPoint{
 const safe=constrainTutorFloat(point,bounds);
 return {...safe,x:safe.x+bounds.size/2<bounds.width/2?8:Math.max(8,bounds.width-bounds.size-8)};
}
