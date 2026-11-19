/* A single reversible timeline. No timers, wheel interception, forced scrolling or
   viewport snapping. Layout coordinates are cached and recomputed on resize. */
(()=>{'use strict';
const root=document.querySelector('.kx');if(!root)return;
const q=s=>root.querySelector(s),qa=s=>Array.from(root.querySelectorAll(s));
const panel=q('.kx-instrument'), entries=qa('.kx-entry'), index=qa('.kx-index a'), pins=qa('.kx-pin');
const machine=q('#kx-machine'), map=q('#kx-map'), ghost=q('#kx-ghost'), track=q('#kx-track'), rider=q('#kx-rider'), book=q('#kx-book'), leaf=q('#kx-leaf'), pinGroup=q('#kx-pins'),leaders=q('#kx-leaders');
const layers=[0,1,2,3].map(i=>q('#kx-layer'+i)),meter=q('.kx-meter i'),cap=q('#kx-caption'),fig=q('#kx-fig');
const caps=['Fig. 01 — Exploded assembly','Fig. 02 — Survey of four projects','Fig. 03 — Before the prompt'];
const m=matchMedia('(prefers-reduced-motion: reduce)'), small=matchMedia('(max-width:850px)'),short=matchMedia('(max-height:540px)');
let ys=[],raf=0,dirty=true,len=track.getTotalLength(),last=-1,access=null,prev=-10;
const cut=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=cut(x);return x*x*(3-2*x)},ramp=(v,a,b)=>ease((v-a)/(b-a));
const tr=(el,v)=>el.setAttribute('transform',v),op=(el,v)=>el.setAttribute('opacity',v.toFixed(3));
function size(){const mobile=small.matches&&!short.matches,h=innerHeight;
root.style.setProperty('--kx-panel',Math.ceil(panel.getBoundingClientRect().height)+'px');
const focus=mobile?panel.getBoundingClientRect().height+(h-panel.getBoundingClientRect().height)*.44:h*.52;
ys=[0,...entries.map(e=>{const r=e.getBoundingClientRect();return scrollY+r.top+r.height*.44-focus}),0];
ys[4]=ys[3]+entries[2].offsetHeight*.50;
for(let i=1;i<5;i++)ys[i]=Math.max(ys[i-1]+1,ys[i]);dirty=false}
function update(){raf=0;if(m.matches)return;if(dirty)size();let y=scrollY,i=0;while(i<3&&y>ys[i+1])i++;const p=i+cut((y-ys[i])/(ys[i+1]-ys[i]));if(Math.abs(p-prev)<.00005)return;prev=p;
const spread=.72+.40*ramp(p,0,1.0),flatten=ramp(p,1.02,1.72),survey=ramp(p,1.08,1.71),bind=ramp(p,2.19,2.85),turn=ramp(p,2.68,3.80);
layers.forEach((l,j)=>tr(l,'translate(0 '+((1-spread)*((j-1.4)*83)+flatten*(j-1.4)*70).toFixed(2)+')'));
op(leaders,.52+.48*ramp(p,0,.85)-.8*flatten);op(ghost,.19*(1-survey));
tr(machine,'translate(360 '+(290+flatten*38)+') scale('+(1-.22*flatten)+' '+(1-.70*flatten)+') translate(-360 -290)');op(machine,1-flatten);
op(map,survey*(1-bind));tr(map,'translate(360 295) scale('+(1-.22*bind)+') translate(-360 -295)');
const route=ramp(p,1.47,2.47);track.style.strokeDashoffset=String(1-route);const pos=track.getPointAtLength(route*len);rider.setAttribute('cx',pos.x);rider.setAttribute('cy',pos.y);op(rider,1-bind);
const clickable=survey>.88&&bind<.16;pinGroup.style.opacity=String(survey*(1-bind));if(clickable!==access){access=clickable;pinGroup.style.pointerEvents=access?'auto':'none';pinGroup.setAttribute('aria-hidden',String(!access));pins.forEach(a=>a.setAttribute('tabindex',access?'0':'-1'))}
op(book,bind);tr(book,'translate(360 295) rotate('+(-6*(1-bind)+1.8*turn)+') scale('+(.76+.24*bind)+') translate(-360 -295)');
const cos=Math.cos(turn*Math.PI);leaf.style.transform='scaleX('+cos.toFixed(4)+')';leaf.style.opacity=cos<0?String(1-ramp(turn,.52,.92)):'1';
const n=p<1.49?0:p<2.53?1:2;if(n!==last){last=n;cap.textContent=caps[n];fig.textContent='0'+(n+1);index.forEach((a,j)=>j===n?a.setAttribute('aria-current','step'):a.removeAttribute('aria-current'))}
meter.style.transform='scaleX('+cut(p/3.8)+')'}
function queue(){if(!raf)raf=requestAnimationFrame(update)}
function resize(){dirty=true;prev=-10;queue()}
function configure(){root.classList.toggle('kx-live',!m.matches);if(m.matches){[machine,map,book,ghost,leaders,...layers].forEach(e=>e.removeAttribute('transform'));op(machine,1);op(map,0);op(book,0);op(ghost,.18);op(leaders,1);pinGroup.style.opacity='0';pinGroup.style.pointerEvents='none';pinGroup.setAttribute('aria-hidden','true');pins.forEach(a=>a.setAttribute('tabindex','-1'));index.forEach(a=>a.removeAttribute('aria-current'));cap.textContent=caps[0];fig.textContent='01';meter.style.transform='scaleX(0)';last=-1;access=null}else resize()}
addEventListener('scroll',queue,{passive:true});addEventListener('resize',resize,{passive:true});addEventListener('pageshow',resize);m.addEventListener('change',configure);if(document.fonts)document.fonts.ready.then(resize);if(window.ResizeObserver){const ro=new ResizeObserver(resize);entries.forEach(e=>ro.observe(e));ro.observe(panel)}configure();
})();
