export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const range = (value: number, start: number, end: number) => clamp((value-start)/(end-start));
export const ease = (value: number) => 1-Math.pow(1-clamp(value),3);
export const introProgress = (time: number, delay = .25, duration = 1.9) => range(time,delay,delay+duration);
/** Start at the lower edge; finish when the card top reaches the upper third. */
export const expoOut = (value: number) => value>=1?1:1-Math.pow(2,-10*clamp(value));
export interface TileRun { started: boolean; elapsed: number; }
/** Replay on either entrance, but never consume the animation for a thin visible strip. */
export function advanceTile(run: TileRun,top: number,bottom: number,viewport: number,delta: number) {
  if(bottom<=0||top>=viewport){run.started=false;run.elapsed=0;return;}
  if(run.started||(top<=viewport*.82&&bottom>=viewport*.18)){
    run.started=true;run.elapsed=Math.min(2,run.elapsed+delta);
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
