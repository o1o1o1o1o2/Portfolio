import { clamp } from './math';
const INTRO_TIME_SCALE = .7;
const INTRO_END = 2.45;
export interface MotionFrame { y: number; maxScroll: number; width: number; height: number; delta: number; direction: number; reduced: boolean; introTime: number; }
export interface MotionEffect { measure(frame: MotionFrame): void; render(frame: MotionFrame): boolean; snapshot?():unknown; restore?(state:any):void; dispose?(): void; }
let capture:(()=>unknown)|undefined;
export function saveMotionForLanguage(path:string){try{if(capture)sessionStorage.setItem('portfolio-motion',JSON.stringify({path,state:capture()}));}catch{}}
function takeSavedMotion(){
  try {
    const raw=sessionStorage.getItem('portfolio-motion');
    sessionStorage.removeItem('portfolio-motion');
    const saved=raw?JSON.parse(raw):null;
    return saved?.path===location.pathname && Array.isArray(saved.state?.effects) &&
      typeof saved.state.restart==='boolean' ? saved.state : null;
  } catch { return null; }
}

function compatibleSnapshot(value: unknown, template: unknown): boolean {
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (typeof template === 'boolean') return typeof value === 'boolean';
  if (template && typeof template === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(template).every(([key, expected]) =>
      compatibleSnapshot((value as Record<string, unknown>)[key], expected));
  }
  return value === template;
}

/** A single frame loop and scroll listener for all effects. Read geometry before writing styles. */
export function createMotionEngine(effects: MotionEffect[]) {
  const abort = new AbortController();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let request = 0, last = 0, previousY = scrollY, direction = 1, disposed = false;
  let introStart: number|null=null;
  const saved=takeSavedMotion();
  const introTime = (time: number) => introStart === null
    ? (saved && !saved.restart ? INTRO_END : 0)
    : Math.max(0, (time - introStart) / (1000 * INTRO_TIME_SCALE));
  if(saved&&!saved.restart)effects.forEach((effect,i)=>{
    const template=effect.snapshot?.();
    if(template!==undefined&&compatibleSnapshot(saved.effects[i],template))effect.restore?.(saved.effects[i]);
  });
  const captureState=()=>({restart:introTime(performance.now())<INTRO_END,effects:effects.map(e=>e.snapshot?.())});
  capture=captureState;
  const schedule = () => { if (!request&&!disposed) request = requestAnimationFrame(tick); };
  const tick = (time: number) => {
    request=0;
    const y=scrollY;
    if(Math.abs(y-previousY)>1) direction=Math.sign(y-previousY);
    const frame: MotionFrame={y,maxScroll:Math.max(0,document.documentElement.scrollHeight-innerHeight),width:document.documentElement.clientWidth,height:innerHeight,delta:clamp((time-last)/1000,.001,.05),direction,reduced:media.matches,introTime:introTime(time)};
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
  document.fonts.ready.then(()=>{if(disposed)return;introStart=performance.now()-(saved&&!saved.restart?INTRO_END*1000*INTRO_TIME_SCALE:0);schedule();});
  schedule();
  return () => { disposed=true;if(capture===captureState)capture=undefined;abort.abort();resize.disconnect();cancelAnimationFrame(request);effects.forEach(effect=>effect.dispose?.()); };
}
