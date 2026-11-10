import { clamp } from './math';
export interface MotionFrame { y: number; maxScroll: number; width: number; height: number; delta: number; direction: number; reduced: boolean; introTime: number; }
export interface MotionEffect { measure(frame: MotionFrame): void; render(frame: MotionFrame): boolean; dispose?(): void; }

/** A single frame loop and scroll listener for all effects. Read geometry before writing styles. */
export function createMotionEngine(effects: MotionEffect[]) {
  const abort = new AbortController();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let request = 0, last = 0, previousY = scrollY, direction = 1, disposed = false;
  let introStart: number|null=null;
  const schedule = () => { if (!request&&!disposed) request = requestAnimationFrame(tick); };
  const tick = (time: number) => {
    request=0;
    const y=scrollY;
    if(Math.abs(y-previousY)>1) direction=Math.sign(y-previousY);
    const frame: MotionFrame={y,maxScroll:Math.max(0,document.documentElement.scrollHeight-innerHeight),width:document.documentElement.clientWidth,height:innerHeight,delta:clamp((time-last)/1000,.001,.05),direction,reduced:media.matches,introTime:introStart===null?0:Math.max(0,(time-introStart)/1000)};
    previousY=y;last=time;
    effects.forEach(effect=>effect.measure(frame));
    let active=false;
    effects.forEach(effect=>{if(effect.render(frame))active=true;});
    if(active&&!frame.reduced)schedule();
  };
  addEventListener('scroll',schedule,{passive:true,signal:abort.signal});
  addEventListener('resize',schedule,{signal:abort.signal});
  addEventListener('load',schedule,{once:true,signal:abort.signal});
  media.addEventListener('change',schedule,{signal:abort.signal});
  document.addEventListener('toggle',schedule,{capture:true,signal:abort.signal});
  const resize=new ResizeObserver(schedule);
  resize.observe(document.body);
  document.fonts.ready.then(()=>{introStart=performance.now();schedule();});
  schedule();
  return () => { disposed=true;abort.abort();resize.disconnect();cancelAnimationFrame(request);effects.forEach(effect=>effect.dispose?.()); };
}
