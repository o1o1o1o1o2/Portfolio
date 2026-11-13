import { renderReelGlyph, splitTitle } from './title-glyphs';
import type { MotionEffect } from './engine';
import { REPLAY_ENTRANCE_ANIMATIONS } from './config';
import { damp, ease, expansion, range, advanceTile, expoOut, titleProgress, introProgress, glyphReveal,tilePlacement,headingSlideProgress,textEntrance,lineShiftProgress,reelDuration } from './math';

function startsInViewport(element: HTMLElement) {
  const rect=element.getBoundingClientRect();
  return rect.top<innerHeight*.95&&rect.bottom>0;
}
function isIntroElement(element: HTMLElement) {
  return element.closest('[data-intro-once]') !== null;
}

/** Whole rows, right to left, with a short overlapping opacity stagger. */
export function rowRevealEffect(element:HTMLElement):MotionEffect{
 const rows=Array.from(element.querySelectorAll<HTMLElement>('[data-reveal-row]'));
 const rises = element.dataset.rowReveal === 'up';
 const duration = rises ? .62 : 1.73;
 const delay = rises ? 0 : .35;
 const stagger = rises ? .11 : .18;
 const replay=!isIntroElement(element);
 let intro=!replay&&startsInViewport(element),top=0,bottom=0;const run={started:false,elapsed:0};
 return {
  snapshot:()=>({intro,run:{...run}}),restore(s){if(s){intro=s.intro;if(s.run)Object.assign(run,s.run);}},
  measure(){const rect=element.getBoundingClientRect();top=rect.top;bottom=rect.bottom;},
  render(frame){
   const visible = Math.min(bottom, frame.height) - Math.max(top, 0);
   if (!rises || run.started || visible >= Math.min(bottom - top, frame.height) * .30) {
    advanceTile(run,top,bottom,frame.height,frame.delta,3,replay && REPLAY_ENTRANCE_ANIMATIONS);
   }
   const time=intro?frame.introTime:run.elapsed;
   rows.forEach((row,i)=>{
    const start = delay + i * stagger;
    const p=frame.reduced?1:ease(range(time,start,start+duration));
    if (rises) {
     const offset = (1 - p) * 100;
     row.style.transform = `translateY(${offset}%)`;
     row.style.clipPath = offset ? `inset(0 0 ${offset}%)` : '';
    } else {
     row.style.transform=`translate3d(${(1-p)*42}px,0,0)`;
     row.style.opacity=String(p);
    }
   });
   return !frame.reduced&&(intro||run.started)&&time<delay+duration+(rows.length-1)*stagger;
  },
  dispose(){rows.forEach(row=>{row.style.removeProperty('transform');row.style.removeProperty('opacity');row.style.removeProperty('clip-path');});}
 };
}

/** Only initially visible panels use the load timeline; offscreen panels wait for scroll. */
export function firstScreenEffect(element: HTMLElement): MotionEffect {
  if (element.matches('.m-header')) return headerIntroEffect(element);
  let initial=startsInViewport(element);
  let top=0,bottom=0;
  const run={started:false,elapsed:0};
  return {
    snapshot:()=>({initial,run:{...run}}),restore(s){if(s){initial=s.initial;if(s.run)Object.assign(run,s.run);}},
    measure(){if(!initial){const r=element.getBoundingClientRect();top=r.top;bottom=r.bottom;}},
    render(frame){
      if(!initial)advanceTile(run,top,bottom,frame.height,frame.delta,.9,false);
      const value=frame.reduced?1:initial?introProgress(frame.introTime,.12,1.8):range(run.elapsed,0,.9);
      const p=ease(value);
      element.style.transform=`translateY(${(1-p)*24}px) scale(${.975+.025*p})`;
      element.style.opacity=String(.35+.65*p);
      return !frame.reduced&&value<1&&(initial||run.started);
    },
    dispose(){element.style.removeProperty('transform');element.style.removeProperty('opacity');}
  };
}

function headerIntroEffect(header: HTMLElement): MotionEffect {
  const controls = header.querySelectorAll<HTMLElement>('nav > a, .locale-toggle, .m-talk');
  const reset = (control: HTMLElement) => {
    control.style.removeProperty('transform');
    control.style.removeProperty('clip-path');
  };
  return {
    measure() {},
    render(frame) {
      let active = false;
      controls.forEach((control, index) => {
        const progress = frame.reduced || control.matches(':focus-within')
          ? 1 : introProgress(frame.introTime, .18 + index * .08, .68);
        if (progress === 1) {
          reset(control);
          return;
        }
        const offset = 100 * (1 - ease(progress));
        control.style.transform = `translateY(${-offset}%)`;
        control.style.clipPath = `inset(${offset}% -8px -8px)`;
        active = true;
      });
      return active;
    },
    dispose() { controls.forEach(reset); },
  };
}

/** Shared DOM/CSS entrance. Late entry gate and replay work from either viewport edge. */
export function tileEffect(element: HTMLElement, index: number): MotionEffect {
  const stage=element.querySelector<HTMLElement>('.project-stage')!;
  const pointerEvents = new AbortController();
  const parallax = matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)');
  const resetParallax = () => {
    stage.style.removeProperty('--project-media-x');
    stage.style.removeProperty('--project-media-y');
  };
  stage.addEventListener('pointermove', event => {
    if (!parallax.matches || event.pointerType !== 'mouse') return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Use 84% of the available overscan at the edges.
    const x = 42 * (1 - 2 * range(event.clientX, rect.left, rect.right));
    const y = 42 * (1 - 2 * range(event.clientY, rect.top, rect.bottom));
    stage.style.setProperty('--project-media-x', `${x}%`);
    stage.style.setProperty('--project-media-y', `${y}%`);
  }, { passive: true, signal: pointerEvents.signal });
  stage.addEventListener('pointerleave', resetParallax, { signal: pointerEvents.signal });
  stage.addEventListener('pointercancel', resetParallax, { signal: pointerEvents.signal });
  parallax.addEventListener('change', resetParallax, { signal: pointerEvents.signal });
  const run={started:false,elapsed:0};
  let top=0,width=0,height=0;
  return {
    snapshot:()=>({...run}),restore(s){if(s)Object.assign(run,s);},
    measure(){const rect=element.getBoundingClientRect();top=rect.top;width=stage.offsetWidth;height=stage.offsetHeight;},
    render(frame){
      advanceTile(run,top,top+height,frame.height,frame.delta,3,REPLAY_ENTRANCE_ANIMATIONS);
      const reveal=frame.reduced?1:expoOut(run.elapsed/1.5);
      const pose=tilePlacement(frame.reduced?2:run.elapsed*1.5,index,width,height,frame.width,frame.width<=700);
      const inset=(1-reveal)*5;
      stage.style.clipPath=`inset(${inset}% round 16px)`;stage.style.borderRadius='16px';
      stage.style.transformOrigin='50% 50%';
      stage.style.transform=`translate3d(${pose.x}px,${pose.y}px,0) rotate(${pose.rotation}deg) skewY(${pose.skew}deg)`;
      return run.started&&run.elapsed<2&&!frame.reduced;
    },
    dispose(){
      pointerEvents.abort();
      resetParallax();
      stage.style.removeProperty('clip-path');
      stage.style.removeProperty('border-radius');
      stage.style.removeProperty('transform-origin');
      stage.style.removeProperty('transform');
    }
  };
}

/** Splits text once, preserves markup, keeps a single accessible heading name. */
export function titleEffect(element: HTMLElement): MotionEffect {
  const replay=!isIntroElement(element);
  let intro=!replay;
  const mode=element.dataset.title||'chars';
  const lines=Array.from(element.querySelectorAll<HTMLElement>('[data-title-line]'));
  const lineDirection=element.dataset.lineDirection==='right'?1:-1;
  const run={started:false,elapsed:0};
  let top=0,bottom=0;
  const original=element.innerHTML;
  const accessible=element.getAttribute('aria-label');
  const label=element.cloneNode(true) as HTMLElement;
  label.querySelectorAll('br').forEach(br=>br.replaceWith(' '));
  element.setAttribute('aria-label',label.textContent?.replace(/\s+/g,' ').trim()||'');
  const glyphs=splitTitle(element,mode);
  let target=1,value=0;
  return {
    snapshot:()=>({intro,target,value,run:{...run}}),restore(s){if(s){intro=s.intro;target=s.target;value=s.value;if(s.run)Object.assign(run,s.run);}},
    measure(frame){const r=element.getBoundingClientRect();top=r.top;bottom=r.bottom;target=Math.min(titleProgress(r.top,frame.height,frame.y,frame.maxScroll),range(r.bottom+50,0,frame.height*.16));},
    render(frame){
      advanceTile(run,top,bottom,frame.height,frame.delta,3,replay && REPLAY_ENTRANCE_ANIMATIONS);
      value=frame.reduced?1:intro?introProgress(frame.introTime,.35,2.1):range(run.elapsed,0,.85);
      glyphs.forEach((glyph,i)=>{
        if(!intro&&mode==='slot'){renderReelGlyph(glyph,frame.reduced?reelDuration:run.elapsed,i,glyphs.length);return;}
        if(!intro&&mode!=='left'&&mode!=='right'){const pose=textEntrance(run.elapsed,i,glyphs.length,mode);glyph.style.transform=frame.reduced?'none':`translate3d(${pose.x}px,${pose.y}%,0)`;glyph.style.opacity=String(frame.reduced?1:pose.opacity);return;}
        const delay=glyphs.length>1?i/(glyphs.length-1)*.3:0;
        const p=frame.reduced?1:intro?ease(range(value,delay,.7+delay)):mode==='chars'?glyphReveal(run.elapsed,i,glyphs.length):headingSlideProgress(run.elapsed);
        const x=mode==='left'?-65:mode==='right'?65:0;
        glyph.style.transform=`translate3d(${(1-p)*x}px,${(1-p)*(mode==='chars'?115:25)}%,0)`;
        glyph.style.opacity=String(frame.reduced?1:range(p,0,.2));
      });
      lines.forEach((line,i)=>{line.style.transform=frame.reduced?'none':`translateX(${lineDirection*lineShiftProgress(run.elapsed,i)*(frame.width<=700?10:24)*(i+1)}px)`;});
      if(mode==='rise-side')element.style.transform=frame.reduced?'none':`translateX(${(1-lineShiftProgress(run.elapsed,0))*18}px)`;
      return !frame.reduced&&(intro?value<1:run.started&&run.elapsed<(lines.length?2.5:mode==='slot'?reelDuration:mode==='rise-side'?1.6:1.4));
    },
    dispose(){if(mode==='rise-side')element.style.removeProperty('transform');element.innerHTML=original;if(accessible===null)element.removeAttribute('aria-label');else element.setAttribute('aria-label',accessible);}
  };
}

/** Side text and diagrams use the same offset effect, configured through data-slide. */
export function slideEffect(element: HTMLElement): MotionEffect {
  const replay=!isIntroElement(element);
  let intro=!replay&&startsInViewport(element);
  let target=1,value=0;
  const run={started:false,elapsed:0};
  let top=0,bottom=0;
  const direction = element.dataset.slide;
  const side = direction === 'up' ? 0 : direction === 'right' ? 1 : -1;
  const rise = direction === 'up' ? 32 : 18;
  return {
    snapshot:()=>({intro,target,value,run:{...run}}),restore(s){if(s){intro=s.intro;target=s.target;value=s.value;if(s.run)Object.assign(run,s.run);}},
    measure(){const r=element.getBoundingClientRect();top=r.top;bottom=r.bottom;},
    render(frame){advanceTile(run,top,bottom,frame.height,frame.delta,3,replay && REPLAY_ENTRANCE_ANIMATIONS);value=frame.reduced?1:intro?introProgress(frame.introTime,.5,1.9):range(run.elapsed,0,.9);const p=ease(value);element.style.transform=`translate3d(${side*(1-p)*(intro?45:80)}px,${(1-p)*rise}px,0)`;element.style.opacity=String(.2+.8*p);return !frame.reduced&&(intro?value<1:run.started&&value<1);},
    dispose(){element.style.removeProperty('transform');element.style.removeProperty('opacity');}
  };
}

/** Small left-aligned screen becomes a viewport-sized screen inside one sticky section. */
export function expandScreenEffect(section: HTMLElement): MotionEffect {
  const screen=section.querySelector<HTMLElement>('[data-expanding-screen]')!;
  const copy=section.querySelector<HTMLElement>('.expansion-copy')!;
  const screenStyle = screen.getAttribute('style');
  const copyStyle = copy.getAttribute('style');
  let target=0,value=0,width=0,height=0;
  return {
    snapshot:()=>({target,value}),restore(s){if(s){target=s.target;value=s.value;}},
    measure(frame){const r=section.getBoundingClientRect();target=expansion(r.top,r.height,frame.height);width=frame.width;height=frame.height;},
    render(frame){
      value=frame.reduced?0:damp(value,target,frame.delta,10);
      const p=ease(value),mobile=width<=700;
      const margin=mobile?16:48;
      const fromWidth=mobile?width-32:(width-margin*2)*.46;
      const toWidth=width-(mobile?12:24);
      const fromHeight=mobile?Math.min(240,height*.38):Math.min(380,height*.53);
      const toHeight=height-(mobile?36:48);
      screen.style.width=`${fromWidth+(toWidth-fromWidth)*p}px`;
      screen.style.height=`${fromHeight+(toHeight-fromHeight)*p}px`;
      screen.style.left=`${margin+( (width-toWidth)/2-margin)*p}px`;
      screen.style.top=`${(mobile?height*.15:height*.22)+((height-toHeight)/2-(mobile?height*.15:height*.22))*p}px`;
      screen.style.borderRadius=`${18-10*p}px`;
      screen.style.transform=`rotate(${(1-p)*-3}deg)`;
      copy.style.opacity=String(1-range(p,0,.55));
      copy.style.transform=`translate3d(${p*150}px,${p*-35}px,0)`;
      section.style.setProperty('--expansion',String(p));
      return value!==target&&!frame.reduced;
    },
    dispose(){
      if(screenStyle===null)screen.removeAttribute('style');else screen.setAttribute('style',screenStyle);
      if(copyStyle===null)copy.removeAttribute('style');else copy.setAttribute('style',copyStyle);
      section.style.removeProperty('--expansion');
    }
  };
}
