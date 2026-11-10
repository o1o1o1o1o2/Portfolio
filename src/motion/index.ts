import { createMotionEngine } from './engine';
import { tileEffect, titleEffect, slideEffect, expandScreenEffect, firstScreenEffect } from './effects';
import { bindCaseDialogs } from './case-dialogs';

let cleanup: (()=>void)|undefined;
export function mountPortfolioMotion() {
  cleanup?.();
  const effects=[
    ...Array.from(document.querySelectorAll<HTMLElement>('.motion-project')).map(tileEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-title]')).map(titleEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-slide]')).map(slideEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-expansion]')).map(expandScreenEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-intro-panel]')).map(firstScreenEffect),
  ];
  const stopMotion=createMotionEngine(effects);
  const stopCases=bindCaseDialogs();
  cleanup=()=>{stopMotion();stopCases();};
  return cleanup;
}
