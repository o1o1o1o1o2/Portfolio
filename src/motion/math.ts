export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const range = (value: number, start: number, end: number) => clamp((value-start)/(end-start));
export const ease = (value: number) => 1-Math.pow(1-clamp(value),3);
/** Visible movement from the first frame, with a gentle one-second settling tail. */
export const headingSlideProgress=(elapsed:number)=>1-Math.pow(1-clamp(elapsed/.9),2);
export function textEntrance(elapsed:number,index:number,count:number,mode:string){
 const delay=(count>1?index/(count-1):0)*.18;
 const p=ease(range(elapsed,delay,delay+.85));
 if(mode==='mixed'){const direction=index%4;return {x:(direction===2?-35:direction===3?35:0)*(1-p),y:(direction===0?-85:direction===1?85:0)*(1-p),opacity:range(p,0,.25)};}
 return {x:0,y:90*(1-p),opacity:range(p,0,.25)};
}
export const lineShiftProgress=(elapsed:number,line:number)=>ease(range(elapsed,.7+line*.18,1.5+line*.18));
export const introProgress = (time: number, delay = .25, duration = 1.9) => range(time,delay,delay+duration);
/** Start at the lower edge; finish when the card top reaches the upper third. */
export const expoOut = (value: number) => value>=1?1:1-Math.pow(2,-10*clamp(value));
export function expoInOut(value:number){const p=clamp(value);return p===0||p===1?p:p<.5?Math.pow(2,20*p-10)/2:(2-Math.pow(2,-20*p+10))/2;}
/** Original card headings stagger along a cosine, with a timed vertical reveal. */
export function glyphReveal(elapsed:number,index:number,count:number){
 const angle=Math.PI/2+(count>1?index/(count-1):0)*Math.PI;
 return expoInOut(elapsed*.8-Math.cos(angle)/20);
}
/** Lusion ProjectItem: time += dt * .8; phase = cos(PI/2 .. 3PI/2) / 20.
 * All reels use the same clock, not sequential per-letter delays or random speeds.
 */
export const reelDuration=1.25;
export function reelProgress(elapsed:number,index:number,count:number){
 return glyphReveal(elapsed,index,count);
}
/** Tilt settles separately from the faster scale entrance so it remains visible. */
export function tileTilt(elapsed:number,mobile=false){
  const remaining=Math.pow(1-clamp(elapsed/1.25),2);
  return {z:remaining*(mobile?1.8:2.5),x:remaining*(mobile?2.5:4),y:remaining*(mobile?1:2)};
}
/** Keep the rotated inner edge inside its own column throughout the entrance. */
export function tilePlacement(elapsed:number,index:number,width:number,height:number,viewport:number,mobile=false){
 const side=index%2===0?-1:1;
 const settle=1-expoOut(elapsed/2),tilt=Math.pow(1-clamp(elapsed/1.25),2),scale=.9+.1*expoOut(elapsed/1.5);
 // Previous skew for comparison: desktop 2.6°, mobile 1.5°.
 const rotation=side*tilt*(mobile?2:3),skew=-side*settle*(mobile?1.2:2),radians=Math.abs(rotation)*Math.PI/180;
 const skewRadians=Math.abs(skew)*Math.PI/180;
 const extent=scale*(width*(Math.cos(radians)+Math.sin(radians)*Math.tan(skewRadians))+height*Math.sin(radians))/2;
 const clearance=Math.max(0,extent-width/2);
 return {x:side*Math.max(settle*viewport*(mobile?.008:.012),clearance),y:tilt*(mobile?8:14),rotation,skew,scale};
}
export interface TileRun { started: boolean; elapsed: number; }
export const revealThreshold = (height: number, viewport: number) => Math.min(height, viewport) * .15;
/** Start after 15% is visible and replay after fully leaving either viewport edge. */
export function advanceTile(run: TileRun,top: number,bottom: number,viewport: number,delta: number,maximum=3,replay=true) {
  if(replay&&(bottom<=0||top>=viewport)){run.started=false;run.elapsed=0;return;}
  const visible=Math.min(bottom,viewport)-Math.max(top,0);
  if(run.started||visible>=revealThreshold(bottom-top,viewport)){
    run.started=true;run.elapsed=Math.min(maximum,run.elapsed+delta);
  }
}
/** Clamp the reveal runway to the actual end of the document. */
export function titleProgress(top: number, viewport: number, scroll: number, maxScroll: number): number {
  const start=scroll+top-viewport*.96;
  const end=Math.max(start+1,Math.min(start+viewport*.46,maxScroll-16));
  return range(scroll,start,end);
}
export function damp(current: number, target: number, delta: number, speed = 11): number {
  const next = current+(target-current)*(1-Math.exp(-speed*delta));
  return Math.abs(next-target)<.0005 ? target : next;
}

export function expansion(top: number, height: number, viewport: number): number {
  return range(-top,0,Math.max(1,height-viewport)*.84);
}
