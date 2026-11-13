import {saveMotionForLanguage} from '../motion/engine';
/** Preserve the actual viewport, not a stale hash left by an earlier menu click. */
export function bindLanguageSwitch() {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const control = document.querySelector<HTMLInputElement>('[data-locale-switch]');
  try {
    const raw=sessionStorage.getItem('portfolio-scroll');
    sessionStorage.removeItem('portfolio-scroll');
    if(raw){const saved=JSON.parse(raw);if(saved.path===location.pathname){
      history.scrollRestoration='manual';
      const restore=()=>{
        if(abort.signal.aborted)return;
        const anchor=saved.id?document.getElementById(saved.id):null;
        const top=anchor?anchor.getBoundingClientRect().top+scrollY+saved.offset:saved.y;
        scrollTo({top,behavior:'instant'});
      };
      requestAnimationFrame(restore);document.fonts.ready.then(()=>requestAnimationFrame(restore));
    }}
  } catch { /* Optional browser storage. */ }
  control?.addEventListener('change',event=>{
    const control=event.currentTarget as HTMLInputElement;
    const destination=new URL(control.dataset.target!,location.href);destination.hash='';
    const sections=[...document.querySelectorAll<HTMLElement>('main section[id]')];
    const anchor=sections.filter(s=>s.getBoundingClientRect().top<=innerHeight*.25).at(-1);
    try {sessionStorage.setItem('portfolio-scroll',JSON.stringify({path:destination.pathname,id:anchor?.id,offset:anchor?-anchor.getBoundingClientRect().top:0,y:scrollY}));} catch {}
    control.disabled=true;
    timer=setTimeout(()=>{saveMotionForLanguage(destination.pathname);location.assign(destination.href);},matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);
  }, {signal:abort.signal});
  return () => { abort.abort(); clearTimeout(timer); if(control)control.disabled=false; };
}
