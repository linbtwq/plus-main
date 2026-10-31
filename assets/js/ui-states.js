export function posterSkeletons(container,count=6){
    container.replaceChildren();container.setAttribute('aria-busy','true');
    for(let i=0;i<count;i++){const card=document.createElement('div');card.className='poster-placeholder';card.setAttribute('aria-hidden','true');const frame=document.createElement('div');frame.className='poster-placeholder-frame skeleton-surface';const line=document.createElement('div');line.className='skeleton-line skeleton-surface';card.append(frame,line);container.append(card);}
}
export function emptyState(container,title,description,action){
    container.replaceChildren();const box=document.createElement('div');box.className='library-empty';const heading=document.createElement('h2');heading.textContent=title;const text=document.createElement('p');text.textContent=description;box.append(heading,text);
    if(action){const button=document.createElement('button');button.type='button';button.className='profile-small-btn';button.textContent=action.label;button.addEventListener('click',action.run);box.append(button);}container.append(box);
}
