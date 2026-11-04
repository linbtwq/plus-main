export const ACHIEVEMENT_SOURCES=['movies','plans','ratingHistory','deletedItems','friendships','jointRatings','watchSessions','activityStats','profile'];
export function pendingAchievements(uid){try{return JSON.parse(localStorage.getItem(`achievementDirty:${uid}`)||'{}')||{};}catch{return {};}}
export function markAchievementsDirty(uid,sources){
 if(!uid)return;
 try{const pending=pendingAchievements(uid);for(const source of sources)if(ACHIEVEMENT_SOURCES.includes(source))pending[source]=crypto.randomUUID();localStorage.setItem(`achievementDirty:${uid}`,JSON.stringify(pending));}catch{}
 window.dispatchEvent(new CustomEvent('achievements:dirty',{detail:{uid,sources}}));
}
export function clearAchievementPending(uid,processed){try{const pending=pendingAchievements(uid);for(const [source,stamp] of Object.entries(processed))if(pending[source]===stamp)delete pending[source];localStorage.setItem(`achievementDirty:${uid}`,JSON.stringify(pending));}catch{}}
