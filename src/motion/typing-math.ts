/** Lusion ProjectItem caption constants: forty characters/s, five unresolved glyphs. */
export const typingSpeed=40;
export const randomTail=5;
export const typingDuration=(length:number)=>(length+randomTail)/typingSpeed;
export function typingCounts(time:number,length:number){
 const step=Math.floor(Math.max(0,time)*typingSpeed);
 return {settled:Math.max(0,Math.min(length,step-randomTail)),visible:Math.min(length,step)};
}
