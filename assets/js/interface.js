// Общая клавиатурная навигация для всплывающих окон приложения.
const overlays=Array.from(document.querySelectorAll('.modal-overlay'));
const returns=new WeakMap(),opened=new WeakSet();
const visible=()=>overlays.filter(el=>!el.classList.contains('hidden')&&!el.hidden);
const controls=el=>Array.from(el.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(node=>node.getClientRects().length);
function closeButton(overlay){return overlay.querySelector('[id^="close-"]');}
function synchronize(){
    for(const overlay of overlays){
        const showing=!overlay.classList.contains('hidden')&&!overlay.hidden;
        if(showing&&!opened.has(overlay)){
            opened.add(overlay);
            if(!overlay.contains(document.activeElement))returns.set(overlay,document.activeElement);
            const box=overlay.querySelector('.modal-box,.detail-box,.trailer-box');
            if(box){box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');if(!box.hasAttribute('aria-label')&&!box.hasAttribute('aria-labelledby'))box.setAttribute('aria-label',overlay.id==='trailer-modal'?'Трейлер':overlay.id==='result-modal'?'Результат рулетки':'Информация о фильме');}
            (closeButton(overlay)||controls(overlay)[0])?.focus({preventScroll:true});
        }else if(!showing&&opened.has(overlay)){
            opened.delete(overlay);const target=returns.get(overlay);returns.delete(overlay);
            if(target?.isConnected&&target.getClientRects().length)target.focus({preventScroll:true});
        }
    }
    document.body.classList.toggle('overlay-open',visible().length>0);
}
for(const overlay of overlays){new MutationObserver(synchronize).observe(overlay,{attributes:true,attributeFilter:['class','hidden']});overlay.addEventListener('click',event=>{if(event.target===overlay)closeButton(overlay)?.click();});}
document.addEventListener('keydown',event=>{
    const overlay=visible().at(-1);if(!overlay)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeButton(overlay)?.click();}
    if(event.key==='Tab'){
        const items=controls(overlay),first=items[0],last=items.at(-1);if(!first)return;
        if(event.shiftKey&&(document.activeElement===first||!overlay.contains(document.activeElement))){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!overlay.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
},true);
synchronize();


// Короткая реакция появляется только при добавлении в планы, не при загрузке карточек.
new MutationObserver(records=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    for(const record of records){
        const button=record.target;
        if(record.oldValue==='false'&&button.matches('.cat-plan-toggle[aria-pressed="true"]')){button.classList.remove('is-celebrating');requestAnimationFrame(()=>button.classList.add('is-celebrating'));}
    }
}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['aria-pressed'],attributeOldValue:true});
document.addEventListener('animationend',event=>{if(event.animationName==='heart-settle')event.target.classList.remove('is-celebrating');});
