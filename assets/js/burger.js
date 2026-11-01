document.addEventListener('DOMContentLoaded', () => {
    const burger=document.getElementById('burger-btn'),sidebar=document.getElementById('sidebar'),overlay=document.getElementById('sidebar-overlay');
    if(!burger||!sidebar||!overlay)return;
    // Закрытое меню не участвует в чтении страницы и обходе клавишей Tab.
    sidebar.inert=true;sidebar.setAttribute('aria-hidden','true');
    function setOpen(open){
        burger.classList.toggle('active',open);sidebar.classList.toggle('active',open);overlay.classList.toggle('active',open);burger.setAttribute('aria-expanded',String(open));
        sidebar.inert=!open;sidebar.setAttribute('aria-hidden',String(!open));document.body.classList.toggle('sidebar-open',open);
        if(open)sidebar.querySelector('a,button')?.focus();else burger.focus({preventScroll:true});
    }
    burger.setAttribute('aria-expanded','false');burger.setAttribute('aria-controls','sidebar');
    burger.addEventListener('click',()=>setOpen(!sidebar.classList.contains('active')));overlay.addEventListener('click',()=>setOpen(false));
    document.addEventListener('keydown',event=>{
        if(!sidebar.classList.contains('active'))return;
        if(event.key==='Escape'){event.preventDefault();setOpen(false);}
        if(event.key==='Tab'){
            const items=Array.from(sidebar.querySelectorAll('a[href],button:not(:disabled)')),first=items[0],last=items.at(-1);
            if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
            else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
    });
});
