import { reelProgress } from './math';

export function splitTitle(element: HTMLElement, mode: string) {
  const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
  const nodes: Text[]=[];
  while(walker.nextNode()) nodes.push(walker.currentNode as Text);
  const glyphs: HTMLElement[]=[];
  nodes.forEach(node=>{
    const fragment=document.createDocumentFragment();
    (node.textContent||'').split(/(\s+)/).forEach(word=>{
      if(!word.trim()){fragment.append(document.createTextNode(word));return;}
      const group=document.createElement('span');group.className='motion-word';group.setAttribute('aria-hidden','true');
      Array.from(word).forEach(char=>{const mask=document.createElement('span');mask.className='glyph-mask';const glyph=document.createElement('span');glyph.className='motion-glyph';
        if(mode==='slot'){mask.classList.add('slot-mask');for(let copy=0;copy<4;copy++){const letter=document.createElement('span');letter.textContent=char;glyph.append(letter);}}else glyph.textContent=char;
        mask.append(glyph);group.append(mask);glyphs.push(glyph);});fragment.append(group);
    });node.replaceWith(fragment);
  });
  return glyphs;
}

export function renderReelGlyph(glyph: HTMLElement, elapsed: number, index: number, count: number) {
  glyph.style.transform = `translate3d(0,${-500 * (1 - reelProgress(elapsed, index, count))}%,0)`;
  glyph.style.opacity = '1';
}
