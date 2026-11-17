// Original 24-unit line icons. Keep stroke weight, caps and joins consistent.
const radial=(points,radii)=>points.map((angle,i)=>`${12+Math.cos(angle)*radii[i]},${12+Math.sin(angle)*radii[i]}`).join(' ');
const star=radial(Array.from({length:10},(_,i)=>(-90+i*36)*Math.PI/180),Array.from({length:10},(_,i)=>i%2?4.25:9.2));
const gear=radial(Array.from({length:32},(_,i)=>(-95+i*11.25)*Math.PI/180),Array.from({length:32},(_,i)=>[10,10,8.2,8.2][i%4]));
module.exports={
 search:'<circle cx="10.5" cy="10.5" r="6.8"/><path d="m15.5 15.5 5 5"/>',
 settings:`<polygon points="${gear}"/><circle cx="12" cy="12" r="3.2"/>`,
 filter:'<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h2m4 0h12"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
 more:'<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></g>',
 volume:'<path d="m11 5-5 4H3v6h3l5 4V5ZM15 8.5a5 5 0 0 1 0 7M18 5.5a9 9 0 0 1 0 13"/>',
 star:`<polygon points="${star}"/>`,
 'star-filled':`<polygon points="${star}" fill="currentColor"/>`,
 chevron:'<path d="m9 5.5 6.5 6.5-6.5 6.5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2.3"/><path d="M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
 edit:'<path d="m15.5 4 4.5 4.5M4 20l4.5-1L20 7.5a2.5 2.5 0 0 0-3.5-3.5L5 15.5 4 20Z"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7.5 3v4M16.5 3v4M3 10h18M8 14h.1M12 14h.1M16 14h.1M8 17.5h.1M12 17.5h.1"/>',
 history:'<path d="M4 8a9 9 0 1 1-1 6M3 4v5h5M12 7v5l3.5 2"/>',
 home:'<path d="m3 10 9-7 9 7M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M9 21v-8h6v8"/>',
 book:'<path d="M12 5v16M3 4.5c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1v-15Z"/>',
 family:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 4.5a3 3 0 0 1 0 5.5M18 14a5 5 0 0 1 3 4.5V20"/>',
 sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4M18 4h4"/>',
 shield:'<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 8.5c0-3 6-3 6 0 0 2-3 2-3 4M12 17h.01"/>',
 chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 2V6a3 3 0 0 1 3-3h6.5a8.5 8.5 0 0 1 8.5 8.5ZM7 8h9M7 12h6"/>'
};
