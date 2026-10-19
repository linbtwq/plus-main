document.addEventListener('DOMContentLoaded', () => {
    const burger = document.getElementById('burger-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!burger || !sidebar || !overlay) return;

    function openSidebar() {
        burger.classList.add('active'); sidebar.classList.add('active'); overlay.classList.add('active'); burger.setAttribute('aria-expanded', 'true');
    }
    function closeSidebar() {
        burger.classList.remove('active'); sidebar.classList.remove('active'); overlay.classList.remove('active'); burger.setAttribute('aria-expanded', 'false');
    }
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-controls', 'sidebar');
    burger.addEventListener('click', () => { sidebar.classList.contains('active') ? closeSidebar() : openSidebar(); });
    overlay.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sidebar.classList.contains('active')) closeSidebar(); });
});