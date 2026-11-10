/** Case interaction is independent from motion and works with reduced motion enabled. */
export function bindCaseDialogs(root: ParentNode = document) {
  const controller=new AbortController();
  root.querySelectorAll<HTMLButtonElement>('[data-case]').forEach(button=>button.addEventListener('click',()=>{
    const dialog=document.getElementById(`case-${button.dataset.case}`) as HTMLDialogElement|null;
    if(!dialog||dialog.open)return;
    dialog.showModal();document.body.classList.add('dialog-open');
    dialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');button.focus();},{once:true,signal:controller.signal});
  },{signal:controller.signal}));
  root.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{
    const rect=dialog.getBoundingClientRect();
    if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();
  },{signal:controller.signal}));
  return ()=>controller.abort();
}
