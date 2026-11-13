import type {MotionEffect} from './engine';
import {advanceTile} from './math';
import {typingCounts,typingDuration} from './typing-math';
/** Original caption clock and random tail, with stable wrapping and accessible text. */
export function typewriterEffect(element:HTMLElement):MotionEffect{
 const original=element.textContent||'',label=element.getAttribute('aria-label');
 const chars=Array.from(original),run={started:false,elapsed:0};let top=0,bottom=0;
 element.setAttribute('aria-label',original);
 const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');
 const letters=chars.map(char=>{const span=document.createElement('span');span.style.position='relative';const spacer=document.createElement('span');spacer.textContent=char;spacer.style.visibility='hidden';const ink=document.createElement('span');ink.style.position='absolute';ink.style.inset='0';span.append(spacer,ink);visual.append(span);return ink;});element.replaceChildren(visual);
 return {
  snapshot:()=>({...run}),restore(s){if(s)Object.assign(run,s);},
  measure(){const rect=element.getBoundingClientRect();top=rect.top;bottom=rect.bottom;},
  render(frame){advanceTile(run,top,bottom,frame.height,frame.delta,typingDuration(chars.length)+1);const count=frame.reduced?{settled:chars.length,visible:chars.length}:typingCounts(run.elapsed,chars.length);
   letters.forEach((letter,i)=>{const next=i<count.settled?chars[i]:i<count.visible?String.fromCharCode(33+Math.floor(Math.random()*93)):'';if(letter.textContent!==next)letter.textContent=next;});
   return !frame.reduced&&run.started&&count.settled<chars.length;
  },
  dispose(){element.textContent=original;if(label===null)element.removeAttribute('aria-label');else element.setAttribute('aria-label',label);}
 };
}
