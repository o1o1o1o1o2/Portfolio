/** One shared size, limited by the longest title and the space used by its arrow. */
export function fitProjectTitles(){
 const titles=Array.from(document.querySelectorAll<HTMLElement>('.project-name'));
 const labels=titles.map(title=>title.textContent||'');
 const ctx=document.createElement('canvas').getContext('2d');if(!ctx)return ()=>{};
 let disposed=false;
 const fit=()=>{if(disposed)return;let size=44;
  titles.forEach((title,i)=>{const css=getComputedStyle(title),width=title.parentElement!.clientWidth;ctx.font=`${css.fontWeight} 100px ${css.fontFamily}`;const em=ctx.measureText(labels[i]).width/100-Math.max(0,labels[i].length-1)*.025;size=Math.min(size,(width-3)/(em+1.5));});
  titles.forEach(title=>title.style.fontSize=`${Math.max(12,size)}px`);
 };
 const observer=new ResizeObserver(fit);titles.forEach(title=>observer.observe(title.parentElement!));document.fonts.ready.then(fit);fit();
 return ()=>{disposed=true;observer.disconnect();titles.forEach(title=>title.style.removeProperty('font-size'));};
}
