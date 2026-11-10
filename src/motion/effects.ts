import type { MotionEffect } from './engine';
import { damp, ease, expansion, range, advanceTile, expoOut, titleProgress, introProgress } from './math';

function startsInViewport(element: HTMLElement) {
  const rect=element.getBoundingClientRect();
  return rect.top<innerHeight*.95&&rect.bottom>0;
}
function usesIntro(element: HTMLElement) {
  return !!element.closest('[data-intro-once]')&&startsInViewport(element);
}

/** Only initially visible panels use the load timeline; offscreen panels wait for scroll. */
export function firstScreenEffect(element: HTMLElement): MotionEffect {
  const initial=startsInViewport(element);
  let target=initial?0:1,value=target;
  return {
    measure(frame){if(!initial){const r=element.getBoundingClientRect();target=range(frame.height*.96-r.top,0,frame.height*.4);}},
    render(frame){
      if(initial)value=frame.reduced?1:introProgress(frame.introTime,.12,1.8);
      else value=frame.reduced?1:damp(value,target,frame.delta,9);
      const p=ease(value),header=element.matches('header');
      element.style.transform=header?`translateY(${(1-p)*-14}px)`:`translateY(${(1-p)*24}px) scale(${.975+.025*p})`;
      element.style.opacity=String(.35+.65*p);
      return !frame.reduced&&(initial?value<1:value!==target);
    },
    dispose(){element.style.removeProperty('transform');element.style.removeProperty('opacity');}
  };
}

/** Shared DOM/CSS entrance. Late entry gate and replay work from either viewport edge. */
export function tileEffect(element: HTMLElement, index: number): MotionEffect {
  const stage=element.querySelector<HTMLElement>('.project-stage')!;
  const image=stage.querySelector<HTMLElement>('.stage-image');
  const side=index%2===0?1:-1;
  const run={started:false,elapsed:0};
  let top=0,bottom=0;
  return {
    measure(){const rect=element.getBoundingClientRect();top=rect.top;bottom=rect.bottom;},
    render(frame){
      advanceTile(run,top,bottom,frame.height,frame.delta);
      const reveal=frame.reduced?1:expoOut(run.elapsed/.8);
      const placement=frame.reduced?1:expoOut(run.elapsed/1.1);
      stage.style.clipPath='none';stage.style.borderRadius='16px';
      stage.style.transform=`translate3d(${side*(1-placement)*(frame.width<=700?8:20)}px,${(1-placement)*7}px,0) rotate(${side*(1-placement)*1.5}deg) scale(${.8+.2*reveal})`;
      image?.style.setProperty('--media-scale',String(1+(1-reveal)*.035));
      return run.started&&run.elapsed<1.1&&!frame.reduced;
    },
    dispose(){stage.style.removeProperty('clip-path');stage.style.removeProperty('border-radius');stage.style.removeProperty('transform');image?.style.removeProperty('--media-scale');}
  };
}

/** Splits text once, preserves markup, keeps a single accessible heading name. */
export function titleEffect(element: HTMLElement): MotionEffect {
  const intro=usesIntro(element);
  const original=element.innerHTML;
  const accessible=element.getAttribute('aria-label');
  const label=element.cloneNode(true) as HTMLElement;
  label.querySelectorAll('br').forEach(br=>br.replaceWith(' '));
  element.setAttribute('aria-label',label.textContent?.replace(/\s+/g,' ').trim()||'');
  const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
  const nodes: Text[]=[];
  while(walker.nextNode()) nodes.push(walker.currentNode as Text);
  const glyphs: HTMLElement[]=[];
  nodes.forEach(node=>{
    const fragment=document.createDocumentFragment();
    (node.textContent||'').split(/(\s+)/).forEach(word=>{
      if(!word.trim()){fragment.append(document.createTextNode(word));return;}
      const group=document.createElement('span');group.className='motion-word';group.setAttribute('aria-hidden','true');
      Array.from(word).forEach(char=>{const mask=document.createElement('span');mask.className='glyph-mask';const glyph=document.createElement('span');glyph.className='motion-glyph';glyph.textContent=char;mask.append(glyph);group.append(mask);glyphs.push(glyph);});fragment.append(group);
    });node.replaceWith(fragment);
  });
  let target=1,value=0;
  const mode=element.dataset.title||'chars';
  return {
    measure(frame){const r=element.getBoundingClientRect();target=Math.min(titleProgress(r.top,frame.height,frame.y,frame.maxScroll),range(r.bottom+50,0,frame.height*.16));},
    render(frame){
      value=frame.reduced?1:intro?introProgress(frame.introTime,.35,2.1):damp(value,target,frame.delta,10);
      glyphs.forEach((glyph,i)=>{
        const delay=glyphs.length>1?i/(glyphs.length-1)*.3:0;
        const p=ease(range(value,delay,.7+delay));
        const x=mode==='left'?-65:mode==='right'?65:0;
        glyph.style.transform=`translate3d(${(1-p)*x}px,${(1-p)*(mode==='chars'?115:25)}%,0) rotate(${(1-p)*(mode==='right'?-7:7)}deg)`;
      });return !frame.reduced&&(intro?value<1:value!==target);
    },
    dispose(){element.innerHTML=original;if(accessible===null)element.removeAttribute('aria-label');else element.setAttribute('aria-label',accessible);}
  };
}

/** Side text and diagrams use the same offset effect, configured through data-slide. */
export function slideEffect(element: HTMLElement): MotionEffect {
  const intro=usesIntro(element);
  let target=1,value=0;
  const side=element.dataset.slide==='right'?1:-1;
  return {
    measure(frame){const r=element.getBoundingClientRect();target=range(frame.height*.94-r.top,0,frame.height*.45);},
    render(frame){value=frame.reduced?1:intro?introProgress(frame.introTime,.5,1.9):damp(value,target,frame.delta,9);const p=ease(value);element.style.transform=`translate3d(${side*(1-p)*(intro?45:80)}px,${(1-p)*18}px,0)`;element.style.opacity=String(.2+.8*p);return !frame.reduced&&(intro?value<1:value!==target);},
    dispose(){element.style.removeProperty('transform');element.style.removeProperty('opacity');}
  };
}

/** Small left-aligned screen becomes a viewport-sized screen inside one sticky section. */
export function expandScreenEffect(section: HTMLElement): MotionEffect {
  const screen=section.querySelector<HTMLElement>('[data-expanding-screen]')!;
  const copy=section.querySelector<HTMLElement>('.expansion-copy')!;
  let target=0,value=0,width=0,height=0;
  return {
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
    dispose(){screen.removeAttribute('style');copy.removeAttribute('style');section.style.removeProperty('--expansion');}
  };
}
