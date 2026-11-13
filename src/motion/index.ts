import { createMotionEngine } from './engine';
import { tileEffect, titleEffect, slideEffect, firstScreenEffect,rowRevealEffect,expandScreenEffect } from './effects';
import { bindCaseDialogs } from './case-dialogs';
import {typewriterEffect} from './typewriter';
import {fitProjectTitles} from './title-fit';
import {bindProjectSlideshows} from './slideshow';
import {bindProjectVideos} from './project-video';

let cleanup: (()=>void)|undefined;
export function mountPortfolioMotion() {
  cleanup?.();
  const stopTitleFit=fitProjectTitles();
  const effects=[
    ...Array.from(document.querySelectorAll<HTMLElement>('.motion-project')).map(tileEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-title]')).map(titleEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-slide]')).map(slideEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-expansion]')).map(expandScreenEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-intro-panel]')).map(firstScreenEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-typewriter]')).map(typewriterEffect),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-row-reveal]')).map(rowRevealEffect),
  ];
  const stopMotion=createMotionEngine(effects);
  const stopCases=bindCaseDialogs();
  const stopSlideshows=bindProjectSlideshows();
  const stopVideos=bindProjectVideos();
  cleanup=()=>{stopMotion();stopCases();stopTitleFit();stopSlideshows();stopVideos();};
  return cleanup;
}
