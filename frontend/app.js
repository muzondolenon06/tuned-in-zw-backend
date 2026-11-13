const API_BASE = window.location.hostname.includes('vercel.app') ? 'https://tuned-in-zw-backend.onrender.com' : ((window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : 'http://127.0.0.1:8006');

// -----------------------------------------
// Session & Neon-Synced Activity Storage Keys
// -----------------------------------------
const DELTAS_SESSION_TOKEN_KEY = 'deltasSessionToken';
const DELTAS_SESSION_USER_KEY = 'deltasUserSession';
const DELTAS_PORTAL_UNLOCKED_KEY = 'deltasPortalUnlocked';

// -----------------------------------------
// Global State
// -----------------------------------------
let currentSessionToken = localStorage.getItem(DELTAS_SESSION_TOKEN_KEY) || sessionStorage.getItem(DELTAS_SESSION_TOKEN_KEY) || '';
let currentUserId = 1;
let currentUsername = 'SmartAmbassador';
let currentUniversity = 'UZ';
let currentSafeSpaceTopic = 'How I Navigated Peer Pressure';

const ACADEMY_TITLES = [
    "Binge Drinking & Health Limits",
    "Drinking & Driving Prevention",
    "Illicit & Unregulated Brews",
    "Underage Drinking & Campus Culture",
    "Alcohol & Pregnancy",
    "Sugary Drinks, Diet & Long-Term Health"
];

const SUPPORT_HUB_TITLES = [
    "Peer Pressure & Social Isolation",
    "Gender-Based Violence (GBV) & Alcohol",
    "Mental Health & Coping",
    "Overdose & Alcohol Poisoning Protocol"
];

const PEER_STORY_CATEGORIES = [
    "How I Navigated Peer Pressure",
    "Overcoming Addiction",
    "Hosting Sober Events",
    "Campus Stories"
];

// -----------------------------------------
// User-Scoped Activity Stores (Synced with Neon)
// -----------------------------------------
let userRSVPs = {};
let userLikedStories = {};
let completedSmartModulesCache = [];

function _userCacheKey(prefix, uid = currentUserId) {
    return `${prefix}_u${uid || 1}`;
}

function getAuthHeaders(extra = {}) {
    const headers = { ...extra };
    if (currentSessionToken) {
        headers['X-Session-Token'] = currentSessionToken;
    }
    return headers;
}

function readLocalJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function writeLocalJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
}

function loadUserActivityCache(uid = currentUserId) {
    userRSVPs = readLocalJSON(_userCacheKey('userRSVPs', uid), {});
    userLikedStories = readLocalJSON(_userCacheKey('userLikedStories', uid), {});
    completedSmartModulesCache = readLocalJSON(_userCacheKey('completedSmartModules', uid), []);
}

function saveUserActivityCache(uid = currentUserId) {
    writeLocalJSON(_userCacheKey('userRSVPs', uid), userRSVPs);
    writeLocalJSON(_userCacheKey('userLikedStories', uid), userLikedStories);
    writeLocalJSON(_userCacheKey('completedSmartModules', uid), completedSmartModulesCache);
}

function loadSessionFromBrowserStorage() {
    const saved = readLocalJSON(DELTAS_SESSION_USER_KEY, null);
    if (saved && saved.user_id) {
        currentUserId = parseInt(saved.user_id, 10) || 1;
        currentUsername = saved.username || 'SmartAmbassador';
        currentUniversity = saved.university || 'UZ';
    } else {
        currentUserId = sessionStorage.getItem('currentUserId') ? parseInt(sessionStorage.getItem('currentUserId'), 10) : 1;
        currentUsername = sessionStorage.getItem('currentUsername') || 'SmartAmbassador';
        currentUniversity = sessionStorage.getItem('currentUniversity') || 'UZ';
    }
    loadUserActivityCache(currentUserId);
}

function updateSessionUI() {
    const isSignedIn = !!(currentSessionToken || sessionStorage.getItem('currentUsername') || localStorage.getItem(DELTAS_SESSION_USER_KEY));
    const navText = document.getElementById('nav-login-text');
    if (navText) navText.innerText = isSignedIn ? currentUsername : 'Ambassador';

    const userPill = document.getElementById('active-user-pill');
    if (userPill) userPill.innerText = isSignedIn ? `${currentUsername} (${currentUniversity})` : 'Delta & Boost Challenge';

    const landingLoginBtnText = document.querySelector('.btn-portal-login span');
    if (landingLoginBtnText) {
        landingLoginBtnText.innerText = isSignedIn ? `Enter Portal (${currentUsername})` : 'Sign In to Portal';
    }
}

function applyServerUserState(data) {
    if (!data) return;
    if (data.session_token) {
        currentSessionToken = data.session_token;
        try { localStorage.setItem(DELTAS_SESSION_TOKEN_KEY, currentSessionToken); } catch (e) {}
        try { sessionStorage.setItem(DELTAS_SESSION_TOKEN_KEY, currentSessionToken); } catch (e) {}
    }
    if (data.user_id) currentUserId = parseInt(data.user_id, 10) || 1;
    if (data.username) currentUsername = data.username;
    if (data.university) currentUniversity = data.university;

    const meta = {
        user_id: currentUserId,
        username: currentUsername,
        university: currentUniversity
    };
    writeLocalJSON(DELTAS_SESSION_USER_KEY, meta);
    try {
        sessionStorage.setItem('currentUserId', String(currentUserId));
        sessionStorage.setItem('currentUsername', currentUsername);
        sessionStorage.setItem('currentUniversity', currentUniversity);
    } catch (e) {}

    loadUserActivityCache(currentUserId);

    if (Array.isArray(data.completed_modules)) {
        completedSmartModulesCache = data.completed_modules;
    }
    if (Array.isArray(data.rsvp_event_ids)) {
        const nextRSVPs = {};
        data.rsvp_event_ids.forEach(id => { nextRSVPs[id] = true; });
        userRSVPs = nextRSVPs;
    }
    if (Array.isArray(data.liked_story_ids)) {
        const nextLikes = {};
        data.liked_story_ids.forEach(id => { nextLikes[id] = true; });
        userLikedStories = nextLikes;
    }

    saveUserActivityCache(currentUserId);
    updateSessionUI();
}

function clearClientSessionState() {
    currentSessionToken = '';
    currentUserId = 1;
    currentUsername = 'SmartAmbassador';
    currentUniversity = 'UZ';
    userRSVPs = {};
    userLikedStories = {};
    completedSmartModulesCache = [];

    [DELTAS_SESSION_TOKEN_KEY, DELTAS_SESSION_USER_KEY, DELTAS_PORTAL_UNLOCKED_KEY].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
        try { sessionStorage.removeItem(k); } catch (e) {}
    });
    ['currentUserId', 'currentUsername', 'currentUniversity'].forEach(k => {
        try { sessionStorage.removeItem(k); } catch (e) {}
    });
    updateSessionUI();
}

async function syncActivityFromNeon() {
    if (!currentUserId && !currentSessionToken) return null;
    try {
        const res = await fetch(`${API_BASE}/user/activity?user_id=${currentUserId}`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) return null;
        const data = await res.json();
        applyServerUserState(data);
        return data;
    } catch (e) {
        return null;
    }
}

async function syncUniversityChapter(newUni) {
    currentUniversity = newUni || 'UZ';
    writeLocalJSON(DELTAS_SESSION_USER_KEY, {
        user_id: currentUserId,
        username: currentUsername,
        university: currentUniversity
    });
    try { sessionStorage.setItem('currentUniversity', currentUniversity); } catch (e) {}
    updateSessionUI();

    try {
        await fetch(`${API_BASE}/auth/session/university`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ user_id: currentUserId, university: currentUniversity })
        });
    } catch (e) {}
}

loadSessionFromBrowserStorage();

// -----------------------------------------
// Skeleton Loading Renderers (Mirrors Content • Zero Layout Shift)
// -----------------------------------------
function renderEventsSkeleton(count = 3) {
    let cards = '';
    for (let i = 0; i < count; i++) {
        cards += `
            <div class="event-card-skeleton" aria-hidden="true">
                <div class="skeleton-shimmer skeleton-banner"></div>
                <div style="padding:18px; display:flex; flex-direction:column; flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div class="skeleton-shimmer skeleton-badge"></div>
                        <div class="skeleton-shimmer skeleton-badge" style="width:70px;"></div>
                    </div>
                    <div class="skeleton-shimmer skeleton-title" style="margin-bottom:10px;"></div>
                    <div class="skeleton-shimmer skeleton-line medium" style="margin-bottom:6px;"></div>
                    <div class="skeleton-shimmer skeleton-line short" style="margin-bottom:12px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="margin-bottom:6px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="width:88%; margin-bottom:16px;"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; margin-top:auto;">
                        <div class="skeleton-shimmer skeleton-line short" style="width:85px; margin-bottom:0;"></div>
                        <div class="skeleton-shimmer skeleton-btn"></div>
                    </div>
                </div>
            </div>
        `;
    }
    return cards;
}

function renderPeerStoriesSkeleton(count = 3) {
    let items = '';
    for (let i = 0; i < count; i++) {
        items += `
            <div class="peer-story-skeleton" aria-hidden="true">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="skeleton-shimmer skeleton-avatar"></div>
                        <div class="skeleton-shimmer skeleton-line short" style="width:85px; height:15px; margin-bottom:0;"></div>
                    </div>
                    <div class="skeleton-shimmer skeleton-badge" style="width:105px;"></div>
                </div>
                <div class="skeleton-shimmer skeleton-line" style="margin-bottom:6px;"></div>
                <div class="skeleton-shimmer skeleton-line" style="width:80%; margin-bottom:10px;"></div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06);">
                    <div class="skeleton-shimmer skeleton-badge" style="width:65px; height:24px; border-radius:15px !important;"></div>
                </div>
            </div>
        `;
    }
    return items;
}

function renderNewsSkeleton(count = 4) {
    let cards = '';
    for (let i = 0; i < count; i++) {
        cards += `
            <div class="news-card-skeleton" aria-hidden="true">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div class="skeleton-shimmer skeleton-badge" style="width:80px;"></div>
                        <div class="skeleton-shimmer skeleton-badge" style="width:65px;"></div>
                    </div>
                    <div class="skeleton-shimmer skeleton-title" style="margin-bottom:12px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="margin-bottom:6px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="margin-bottom:6px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="width:75%; margin-bottom:16px;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">
                    <div class="skeleton-shimmer skeleton-line short" style="width:70px; margin-bottom:0;"></div>
                    <div class="skeleton-shimmer skeleton-line short" style="width:90px; margin-bottom:0;"></div>
                </div>
            </div>
        `;
    }
    return cards;
}

function renderModulesSkeleton(count = 6) {
    let cards = '';
    for (let i = 0; i < count; i++) {
        cards += `
            <div class="outreach-card" style="display:flex; flex-direction:column; justify-content:space-between; height:100%; min-height:220px;" aria-hidden="true">
                <div>
                    <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
                        <div class="skeleton-shimmer skeleton-badge" style="width:90px;"></div>
                    </div>
                    <div class="skeleton-shimmer skeleton-title" style="margin-bottom:12px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="margin-bottom:6px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="width:85%; margin-bottom:16px;"></div>
                </div>
                <div class="skeleton-shimmer skeleton-btn" style="width:100%; height:42px;"></div>
            </div>
        `;
    }
    return `<div class="grid-layout">${cards}</div>`;
}

function getCompletedModules() {
    if (Array.isArray(completedSmartModulesCache) && completedSmartModulesCache.length > 0) {
        return completedSmartModulesCache;
    }
    const stored = readLocalJSON(_userCacheKey('completedSmartModules', currentUserId), []);
    completedSmartModulesCache = Array.isArray(stored) ? stored : [];
    return completedSmartModulesCache;
}

function markModuleCompleted(title, moduleId = null) {
    const completed = getCompletedModules().slice();
    if (!completed.includes(title)) {
        completed.push(title);
        completedSmartModulesCache = completed;
        saveUserActivityCache(currentUserId);
    }

    fetch(`${API_BASE}/modules/progress`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            user_id: currentUserId,
            module_id: moduleId,
            module_title: title
        })
    })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && Array.isArray(data.completed_modules)) {
                completedSmartModulesCache = data.completed_modules;
                saveUserActivityCache(currentUserId);
            }
        })
        .catch(() => {});

    return completed;
}

// -----------------------------------------
// Portal Ambient Slideshow System (Across All Views)
// -----------------------------------------
const PORTAL_PAGE_IMAGES = {
    outreach: [
        'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1600&auto=format&fit=crop&q=80'
    ],
    news: [
        'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1600&auto=format&fit=crop&q=80'
    ],
    radio: [
        'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1600&auto=format&fit=crop&q=80'
    ],
    influence: [
        'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1519834785169-98be25ec3f84?w=1600&auto=format&fit=crop&q=80'
    ],
    events: [
        'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1511578314322-379afb476865?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1600&auto=format&fit=crop&q=80'
    ],
    besure: [
        'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1600&auto=format&fit=crop&q=80'
    ],
    login: [
        'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1600&auto=format&fit=crop&q=80'
    ]
};

let portalCurrentView = 'outreach';
let portalImageIndex = 0;
let portalActiveLayer = 'a';
let portalSlideshowTimer = null;

function setPortalSlide(imageUrl) {
    const slideA = document.getElementById('portal-slide-a');
    const slideB = document.getElementById('portal-slide-b');
    if (!slideA || !slideB) return;

    if (portalActiveLayer === 'a') {
        slideB.style.backgroundImage = `url('${imageUrl}')`;
        slideB.classList.add('active');
        slideA.classList.remove('active');
        portalActiveLayer = 'b';
    } else {
        slideA.style.backgroundImage = `url('${imageUrl}')`;
        slideA.classList.add('active');
        slideB.classList.remove('active');
        portalActiveLayer = 'a';
    }
}

function advancePortalSlideshow() {
    const images = PORTAL_PAGE_IMAGES[portalCurrentView] || PORTAL_PAGE_IMAGES.outreach;
    if (!images || images.length === 0) return;
    portalImageIndex = (portalImageIndex + 1) % images.length;
    setPortalSlide(images[portalImageIndex]);
}

function updatePortalSlideshowView(viewId, isInitial = false) {
    const normalizedView = PORTAL_PAGE_IMAGES[viewId] ? viewId : 'outreach';
    portalCurrentView = normalizedView;
    portalImageIndex = 0;

    const scrim = document.getElementById('portal-scrim');
    if (scrim) {
        scrim.className = 'portal-scrim scrim-' + normalizedView;
    }

    const images = PORTAL_PAGE_IMAGES[normalizedView];
    if (images && images.length > 0 && !isInitial) {
        setPortalSlide(images[0]);
    }

    if (portalSlideshowTimer) {
        clearInterval(portalSlideshowTimer);
    }
    portalSlideshowTimer = setInterval(advancePortalSlideshow, 5200);
}

function initPortalSlideshow(initialView = 'outreach') {
    const slideA = document.getElementById('portal-slide-a');
    const slideB = document.getElementById('portal-slide-b');
    const images = PORTAL_PAGE_IMAGES[initialView] || PORTAL_PAGE_IMAGES.outreach;
    if (slideA && images && images.length > 0) {
        slideA.style.backgroundImage = `url('${images[0]}')`;
        slideA.classList.add('active');
    }
    if (slideB) {
        slideB.classList.remove('active');
    }
    portalActiveLayer = 'a';
    updatePortalSlideshowView(initialView, true);
}

function stopPortalSlideshow() {
    if (portalSlideshowTimer) {
        clearInterval(portalSlideshowTimer);
        portalSlideshowTimer = null;
    }
}

// -----------------------------------------
// Navigation Logic
// -----------------------------------------
function switchMainView(viewId, el) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const targetNav = el || document.querySelector(`.bottom-nav .nav-item[data-view="${viewId}"]`);
    if (targetNav) targetNav.classList.add('active');

    document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    // Dynamically update the ambient background slideshow for this portal view
    updatePortalSlideshowView(viewId);

    if (viewId === 'outreach') {
        loadOutreach('home');
    } else if (viewId === 'influence') {
        loadAboveTheInfluenceView();
    } else if (viewId === 'news') {
        loadNews('All');
    } else if (viewId === 'radio') {
        loadRadio('All');
    } else if (viewId === 'events') {
        loadEvents('All');
    } else if (viewId === 'besure') {
        switchBeSureTab('verify', document.querySelector('#view-besure .out-tab'));
    }
}

function closeDetailView() {
    switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view="outreach"]'));
    switchOutreachTab('home', document.querySelectorAll('#view-outreach .out-tab')[0]);
}

function closeSafeSpaceDetailView() {
    switchMainView('influence', document.querySelector('.bottom-nav .nav-item[data-view="influence"]'));
}

async function loadAboveTheInfluenceView() {
    const container = document.getElementById('influence-feed');
    if (!container) return;
    container.innerHTML = renderModulesSkeleton(4);

    try {
        await syncActivityFromNeon();
        const res = await fetch(`${API_BASE}/modules`);
        const allModules = await res.json();
        const modules = allModules.filter(m => SUPPORT_HUB_TITLES.includes(m.title));

        let html = `
            <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start;">
        `;

        // Left Column: 4 Harm-Reduction Guides
        html += '<div style="flex: 1 1 58%; min-width:300px;">';
        html += '<h3 style="margin-bottom:15px; color:var(--primary);">Harm-Reduction &amp; Coping Playbooks</h3>';
        html += '<div class="grid-layout" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">';
        if (modules.length === 0) {
            html += '<p style="text-align:center; padding:20px; width:100%;">No guides available.</p>';
        } else {
            modules.forEach(mod => {
                html += `
                    <div class="outreach-card" style="display:flex; flex-direction:column; justify-content:space-between; height:100%; border-left:4px solid var(--primary);">
                        <div>
                            <h3 class="card-title">${mod.title}</h3>
                            <p class="card-desc" style="font-size:14px; margin-bottom:15px;">${mod.description}</p>
                        </div>
                        <button onclick="openModuleDetail(${mod.id}, '${mod.title.replace(/'/g, "\\'")}', false)" class="btn-primary" style="width:100%; padding:10px;">
                            Open Harm-Reduction Playbook →
                        </button>
                    </div>
                `;
            });
        }
        html += '</div>';

        // Quick Watchdog Banner inside Support Hub
        html += `
            <div class="outreach-card" style="margin-top:20px; border:1px solid var(--cream-sand); background:var(--cream-soft); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
                <div>
                    <h4 style="color:var(--primary); margin:0 0 5px 0; font-size:1.05rem;">Spotted Illicit Brews ('Kambwa') or Underage Selling?</h4>
                    <p style="color:var(--text-muted); font-size:0.88rem; margin:0;">Submit a 100% confidential tip to Campus Security &amp; Law Enforcement Liaisons.</p>
                </div>
                <button onclick="switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view=\\'outreach\\']')); setTimeout(() => switchOutreachTab('watchdog', document.querySelectorAll('#view-outreach .out-tab')[1]), 100);" class="btn-primary" style="padding:10px 18px;">
                    Report Confidentially →
                </button>
            </div>
        `;
        html += '</div>';

        // Right Column: Peer Stories Forum with Anonymous Toggle & 4 Categories
        html += `
            <div style="flex: 1 1 36%; min-width:290px;" class="outreach-card">
                <h3 class="card-title" style="margin-bottom:8px;">Peer Stories Forum</h3>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Real stories from Zimbabwean university students navigating peer pressure, sobriety, and campus life.</p>
                
                <button onclick="document.getElementById('global-share-form').style.display='block'; this.style.display='none';" id="global-share-btn" class="btn-secondary" style="width:100%; padding:10px; margin-bottom:14px;">
                    + Share Your Story (Anonymous Option)
                </button>
                
                <div id="global-share-form" style="display:none; margin-bottom:18px; background:var(--card-bg-warm); padding:16px; border-radius:10px; border:1px solid var(--border-color); box-shadow:var(--shadow-sm);">
                    <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:4px; font-weight:600;">Story Category:</label>
                    <select id="global-share-topic" style="width:100%; margin-bottom:10px; padding:9px; background:#fff; color:var(--text-main); border:1.5px solid var(--border-color); border-radius:6px;">
                        ${PEER_STORY_CATEGORIES.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                    <textarea id="global-share-text" placeholder="Share how you declined a drink, helped a friend, overcame addiction, or hosted a sober event..." style="width:100%; height:85px; margin-bottom:10px; padding:10px; border-radius:6px; border:1.5px solid var(--border-color); background:#fff; color:var(--text-main); box-sizing:border-box;"></textarea>
                    
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--primary); margin-bottom:12px; cursor:pointer; font-weight:600;">
                        <input type="checkbox" id="global-share-anon" checked />
                        <span>Post Anonymously (Hide my name)</span>
                    </label>
                    
                    <input type="file" id="global-share-image" accept="image/*" style="margin-bottom:12px; width:100%; color:var(--text-muted); font-size:0.8rem;" />
                    <button onclick="submitGlobalExperience()" id="global-submit-btn" class="btn-sage" style="width:100%; padding:10px;">
                        Publish Peer Story
                    </button>
                </div>

                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
                    <button onclick="fetchGlobalPeerFeed('')" style="font-size:0.72rem; padding:4px 10px; border-radius:14px; border:1px solid var(--border-color); background:var(--cream-accent); color:var(--secondary-dark); cursor:pointer; font-weight:700;">All</button>
                    ${PEER_STORY_CATEGORIES.map(c => `<button onclick="fetchGlobalPeerFeed('${c.replace(/'/g, "\\'")}')" style="font-size:0.72rem; padding:4px 10px; border-radius:14px; border:1px solid var(--border-color); background:#fff; color:var(--text-muted); cursor:pointer; font-weight:600;">${c}</button>`).join('')}
                </div>
                
                <div id="global-peer-feed" style="max-height: 520px; overflow-y: auto; padding-right:5px;">
                    <p style="text-align:center;">Loading peer stories...</p>
                </div>
            </div>
        `;
        html += '</div>';
        container.innerHTML = html;

        fetchGlobalPeerFeed();
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red;">Failed to load Support Hub. Ensure backend is running.</p>';
    }
}

// -----------------------------------------
// Youth Connect+: Above the Influence (Outreach) Logic
// -----------------------------------------
function switchOutreachTab(tabId, el) {
    document.querySelectorAll('#view-outreach .out-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadOutreach(tabId);
}

async function loadOutreach(tabId) {
    const container = document.getElementById('outreach-feed');
    container.innerHTML = renderModulesSkeleton(6);

    try {
        if (tabId === 'home') {
            const [res] = await Promise.all([
                fetch(`${API_BASE}/modules`),
                syncActivityFromNeon()
            ]);
            const allModules = await res.json();
            const modules = allModules.filter(m => ACADEMY_TITLES.includes(m.title));
            const completed = getCompletedModules();
            const pct = Math.min(100, Math.round((completed.length / ACADEMY_TITLES.length) * 100));
            const isFullAmbassador = completed.length >= ACADEMY_TITLES.length;

            let html = `
                <div class="outreach-card" style="margin-bottom:25px; background:linear-gradient(135deg, #FAF7F2 0%, var(--cream-accent) 100%); border:1px solid var(--cream-sand); padding:24px; box-shadow:var(--shadow-sm);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
                        <div>
                            <span style="background:${isFullAmbassador ? 'var(--accent-amber)' : 'var(--primary)'}; color:#fff; font-family:'Poppins',sans-serif; font-size:0.75rem; font-weight:700; padding:4px 12px; border-radius:14px; text-transform:uppercase; letter-spacing:0.04em;">
                                ${isFullAmbassador ? 'Certified Smart Drinking Ambassador' : 'Ambassador Certification Track'}
                            </span>
                            <h3 style="margin:12px 0 6px 0; font-size:1.4rem; color:var(--text-main);">"Smart Drinking Ambassador" Digital Badge</h3>
                            <p style="color:var(--text-muted); font-size:0.92rem; margin:0;">
                                Complete all 6 core Smart Living &amp; Moderation modules to unlock your verified Ambassador Badge &amp; contribute points to <strong>${currentUniversity}</strong>.
                            </p>
                        </div>
                        <div style="text-align:right; min-width:160px;">
                            <div style="font-size:1.75rem; font-weight:800; font-family:'Poppins',sans-serif; color:var(--primary);">${completed.length} / ${ACADEMY_TITLES.length} Modules</div>
                            <div style="font-size:0.82rem; color:var(--text-muted); font-weight:600;">${pct}% Complete</div>
                        </div>
                    </div>
                    <div style="background:rgba(63, 54, 50, 0.12); height:10px; border-radius:5px; margin-top:16px; overflow:hidden;">
                        <div style="background:var(--gradient-primary); width:${pct}%; height:100%; border-radius:5px; transition:width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);"></div>
                    </div>
                </div>

                <div class="outreach-header">
                    <h2 style="font-size:1.85rem; margin-bottom:10px;">Smart Living &amp; Moderation Academy – 6 Core Modules</h2>
                    <p>Evidence-based alcohol education, BAC science, illicit brew awareness, and healthy campus living.</p>
                </div>
                <div class="grid-layout">
            `;

            if (modules.length === 0) {
                html += '<p style="text-align:center; padding:20px; width:100%;">No modules available.</p>';
            } else {
                modules.forEach(mod => {
                    const isDone = completed.includes(mod.title);
                    html += `
                        <div class="outreach-card" style="position:relative; display:flex; flex-direction:column; justify-content:space-between; height:100%; padding-bottom:20px; border-top:3.5px solid ${isDone ? 'var(--accent-sage)' : 'var(--primary)'};">
                            <div>
                                <div style="position:absolute; top:-11px; right:15px; background:${isDone ? 'var(--accent-sage)' : 'var(--primary)'}; color:#fff; font-family:'Poppins',sans-serif; font-size:11px; font-weight:700; padding:4px 10px; border-radius:12px; letter-spacing:0.03em;">
                                    ${isDone ? '✓ Badge Earned' : 'Smart Living Module'}
                                </div>
                                <h3 class="card-title" style="margin-top:12px;">${mod.title}</h3>
                                <p class="card-desc" style="font-size:14px; margin-bottom:20px;">${mod.description}</p>
                            </div>
                            <button onclick="openModuleDetail(${mod.id}, '${mod.title.replace(/'/g, "\\'")}', true)" class="${isDone ? 'btn-sage' : 'btn-primary'}" style="width:100%; padding:11px;">
                                ${isDone ? 'Review Module & Guide →' : 'Start Module & Earn Badge →'}
                            </button>
                        </div>
                    `;
                });
            }
            html += '</div>';
            container.innerHTML = html;

        } else if (tabId === 'safespace') {
            switchMainView('influence', document.querySelector('.bottom-nav .nav-item[data-view="influence"]'));
            return;
        } else if (tabId === 'watchdog') {
            loadWatchdogIntoContainer(container);

        } else if (tabId === 'opportunities') {
            loadOpportunitiesIntoContainer(container);

        } else if (tabId === 'contact') {
            container.innerHTML = `
                <div class="outreach-card" style="text-align:center; max-width:650px; margin:0 auto; padding:32px;">
                    <h2 class="card-title" style="font-size:1.8rem; margin-bottom:12px;">Emergency Medical, Addiction &amp; GBV Helplines</h2>
                    <p class="card-desc" style="font-size:0.96rem; margin-bottom:22px; line-height:1.7;">
                        If a peer is showing signs of acute alcohol poisoning (C.U.P.S.), struggling with substance dependence, or facing Gender-Based Violence, contact these verified Zimbabwean services immediately:
                    </p>
                    <div style="text-align:left; background:var(--card-bg-warm); padding:24px; border-radius:12px; line-height:2.2; border:1px solid var(--border-color); border-left:4px solid var(--primary);">
                        <p><strong>National Ambulance &amp; Medical Emergency:</strong> <span style="color:var(--primary); font-weight:bold;">999 / 994 / MARS 0800 3222</span></p>
                        <p><strong>Musasa Project (24/7 Toll-Free GBV Helpline):</strong> <span style="color:var(--accent-sage); font-weight:bold;">0800 4321 / +263 773 843 139</span></p>
                        <p><strong>Youth Helpline &amp; Mental Health Support:</strong> <span style="color:var(--primary); font-weight:bold;">116 (Toll-Free)</span></p>
                        <p><strong>Adult Rape Clinic (Parirenyatwa Hospital):</strong> <span style="color:var(--accent-sage); font-weight:bold;">+263 242 703 823 / 0775 672 770</span></p>
                        <p><strong>ZRP Community Liaison &amp; Victim Friendly Unit:</strong> Report illicit brews ('kambwa') or underage sales at your nearest ZRP Station or via our <strong>Community Watchdog</strong> tab.</p>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red;">Failed to load data. Ensure backend is running.</p>';
    }
}

// -----------------------------------------
// Confidential Community Watchdog Logic
// -----------------------------------------
async function loadWatchdogIntoContainer(container) {
    container.innerHTML = `
        <div class="outreach-header">
            <h2 style="font-size:1.85rem; margin-bottom:8px;">Confidential Community Watchdog &amp; Reporting</h2>
            <p>Aligned with law enforcement &amp; campus security liaisons: Discreetly report illicit substance distribution ('kambwa'/'musombodhiya'), counterfeit alcohol, or underage selling without exposing your identity.</p>
        </div>
        <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start;">
            <div style="flex:1 1 45%; min-width:300px;" class="outreach-card">
                <h3 class="card-title" style="color:var(--primary); margin-bottom:10px;">Submit Anonymous Watchdog Alert</h3>
                <p style="font-size:0.86rem; color:var(--text-muted); margin-bottom:15px;">Zero personal identifiers or IP addresses are displayed. Reports are routed to Campus Security &amp; ZRP Community Liaisons.</p>
                
                <label style="font-size:0.82rem; color:var(--text-muted); display:block; margin-bottom:5px; font-weight:600;">Campus / Community Location:</label>
                <input type="text" id="watchdog-location" placeholder="e.g. UZ Mt Pleasant Perimeter, Senga MSU, NUST Gate..." style="width:100%; margin-bottom:12px; box-sizing:border-box;" />
                
                <label style="font-size:0.82rem; color:var(--text-muted); display:block; margin-bottom:5px; font-weight:600;">Incident Category:</label>
                <select id="watchdog-type" style="width:100%; margin-bottom:12px; box-sizing:border-box;">
                    <option value="Illicit / Unregulated Brew Distribution ('Kambwa')">Illicit / Unregulated Brew Distribution ('Kambwa')</option>
                    <option value="Underage Alcohol Sales (Liquor Act Violation)">Underage Alcohol Sales (Liquor Act Violation)</option>
                    <option value="Counterfeit / Unsealed Spirit Bottles">Counterfeit / Unsealed Spirit Bottles</option>
                    <option value="Unsafe Party Venue / Drink-Spiking Risk">Unsafe Party Venue / Drink-Spiking Risk</option>
                    <option value="Drunk Driving Hazard Near Campus">Drunk Driving Hazard Near Campus</option>
                </select>
                
                <label style="font-size:0.82rem; color:var(--text-muted); display:block; margin-bottom:5px; font-weight:600;">What did you observe? (Avoid naming innocent bystanders):</label>
                <textarea id="watchdog-desc" placeholder="Describe the illicit product, vehicle/outlet location, and time observed..." style="width:100%; height:95px; margin-bottom:16px; box-sizing:border-box;"></textarea>
                
                <button onclick="submitWatchdogReport()" id="watchdog-submit-btn" class="btn-primary" style="width:100%; padding:12px; font-size:0.95rem;">
                    Submit Confidential Report
                </button>
                <p id="watchdog-feedback" style="display:none; color:var(--accent-sage); font-weight:bold; margin-top:12px; text-align:center;"></p>
            </div>
            
            <div style="flex:1 1 48%; min-width:300px;" class="outreach-card">
                <h3 class="card-title" style="margin-bottom:12px;">Recent Community Watchdog Dispatches</h3>
                <div id="watchdog-feed-list">
                    <p style="color:var(--text-muted);">Loading recent watchdog alerts...</p>
                </div>
            </div>
        </div>
    `;
    fetchWatchdogReports();
}

async function fetchWatchdogReports() {
    const list = document.getElementById('watchdog-feed-list');
    if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/watchdog/reports`);
        const reports = await res.json();
        if (!reports || reports.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);">No watchdog alerts logged yet.</p>';
            return;
        }
        let html = '';
        reports.forEach(r => {
            html += `
                <div style="padding:14px; margin-bottom:12px; background:var(--card-bg-warm); border-left:4px solid var(--primary); border:1px solid var(--border-color); border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                        <span style="background:var(--primary-light); color:var(--primary); font-family:'Poppins',sans-serif; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:4px;">${r.incident_type}</span>
                        <span style="font-size:0.78rem; color:var(--text-light);">${r.campus_or_area}</span>
                    </div>
                    <p style="font-size:0.9rem; color:var(--text-main); margin:6px 0; line-height:1.5;">${r.description}</p>
                    <div style="font-size:0.75rem; color:var(--accent-sage); font-weight:700; margin-top:6px;">✓ ${r.status}</div>
                </div>
            `;
        });
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = '<p style="color:red;">Error loading watchdog dispatches.</p>';
    }
}

async function submitWatchdogReport() {
    const loc = document.getElementById('watchdog-location').value.trim();
    const type = document.getElementById('watchdog-type').value;
    const desc = document.getElementById('watchdog-desc').value.trim();
    const fb = document.getElementById('watchdog-feedback');

    if (!loc || !desc) {
        alert("Please specify both the location/area and what you observed.");
        return;
    }

    const btn = document.getElementById('watchdog-submit-btn');
    btn.disabled = true;
    btn.innerText = 'Encrypting & Submitting...';

    try {
        const res = await fetch(`${API_BASE}/watchdog/reports`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                campus_or_area: loc,
                incident_type: type,
                description: desc
            })
        });
        if (!res.ok) throw new Error("Failed");
        document.getElementById('watchdog-location').value = '';
        document.getElementById('watchdog-desc').value = '';
        fb.style.display = 'block';
        fb.innerText = '✓ Confidential Watchdog Alert logged and routed to Campus Security & ZRP Liaison.';
        fetchWatchdogReports();
    } catch (e) {
        alert("Error submitting report. Please check connection.");
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit Confidential Report';
    }
}

// -----------------------------------------
// Module Detail Logic
// -----------------------------------------
async function openModuleDetail(moduleId, title, isHomeMode) {
    document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
    updatePortalSlideshowView(isHomeMode ? 'outreach' : 'influence');

    if (isHomeMode) {
        markModuleCompleted(title, moduleId);
        const view = document.getElementById('view-module-detail');
        view.classList.add('active');
        document.getElementById('module-detail-title').textContent = title;
        const list = document.getElementById('module-content-list');
        list.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading Smart Living module content...</p></div>';

        try {
            const res = await fetch(`${API_BASE}/modules/${moduleId}/content`);
            const contents = await res.json();
            if (contents && contents.length > 0) {
                let html = '';
                contents.forEach(c => {
                    html += `
                        <div class="outreach-card" style="padding:25px; margin-bottom:20px; border-left:4px solid var(--primary);">
                            <h3 style="color:var(--primary); margin-bottom:15px; font-size:1.4rem;">${c.title}</h3>
                            <p style="font-size:1.02rem; line-height:1.8; color:var(--text-main); white-space:pre-line;">${c.content_text || 'Reading material pending.'}</p>
                            ${c.content_url ? `<a href="${c.content_url}" target="_blank" class="card-action" style="display:inline-block; margin-top:15px; font-weight:bold;">External WHO / Health Resource →</a>` : ''}
                        </div>
                    `;
                });
                html += `
                    <div class="outreach-card" style="text-align:center; padding:24px; background:var(--cream-soft); border:1px solid var(--cream-sand);">
                        <h4 style="color:var(--primary); margin-bottom:8px; font-size:1.2rem;">Module Registered Towards Your Smart Drinking Ambassador Badge!</h4>
                        <p style="color:var(--text-muted); font-size:0.92rem; margin-bottom:16px;">Ready to test how you would apply this in a real campus situation?</p>
                        <button onclick="switchMainView('besure', document.querySelector('.bottom-nav .nav-item[data-view=\\'besure\\']')); setTimeout(() => switchBeSureTab('real_or_manipulated', document.querySelectorAll('#view-besure .out-tab')[1]), 150);" class="btn-primary" style="padding:11px 24px;">
                            Launch Smart Scenario Simulator →
                        </button>
                    </div>
                `;
                list.innerHTML = html;
            } else {
                list.innerHTML = '<p style="text-align:center; padding:20px;">No reading material uploaded yet.</p>';
            }
        } catch (e) {
            list.innerHTML = '<p style="color:red; text-align:center;">Failed to load lesson.</p>';
        }

    } else {
        const view = document.getElementById('view-safespace-detail');
        view.classList.add('active');
        document.getElementById('safespace-detail-title').textContent = title;
        document.getElementById('safespace-peer-topic').textContent = title;
        currentSafeSpaceTopic = title;

        const articleContainer = document.getElementById('safespace-article-container');
        articleContainer.innerHTML = '<div style="text-align:center; padding:20px;"><p>Loading playbook...</p></div>';

        try {
            const res = await fetch(`${API_BASE}/modules/${moduleId}/content`);
            const contents = await res.json();
            if (contents && contents.length > 0) {
                const article = contents[0];
                articleContainer.innerHTML = `
                    <div class="outreach-card" style="border-left:4px solid var(--primary); padding:24px;">
                        <h3 style="color:var(--primary); margin-bottom:12px; font-size:1.35rem;">Above the Influence Playbook: ${title}</h3>
                        <p style="font-size:1.02rem; line-height:1.8; color:var(--text-main); white-space:pre-line;">${article.content_text}</p>
                    </div>
                `;
            } else {
                articleContainer.innerHTML = '<p style="color:var(--text-muted);">Playbook instructions being prepared.</p>';
            }
        } catch(e) {
            articleContainer.innerHTML = '<p style="color:red;">Error loading playbook.</p>';
        }

        fetchPeerPosts();
    }
}

// -----------------------------------------
// Peer Stories Forum Logic (Support Hub)
// -----------------------------------------
function fetchPeerPosts() {
    const list = document.getElementById('safespace-comments-list');
    if (!list) return;
    list.innerHTML = renderPeerStoriesSkeleton(3);

    fetch(`${API_BASE}/safespace/experiences`)
        .then(res => res.json())
        .then(posts => {
            if (!posts || posts.length === 0) {
                list.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:15px;">No peer stories shared yet. Be the first to share!</p>';
                return;
            }
            let html = '';
            posts.forEach(post => {
                const initial = post.author_name ? post.author_name.charAt(0).toUpperCase() : 'A';
                const isLiked = !!userLikedStories[post.id];
                const likes = post.likes_count || 5;
                html += `
                    <div class="outreach-card" style="margin-bottom:14px; background:var(--card-bg); border:1px solid var(--border-color); border-left:4px solid var(--primary); padding:18px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div style="width:34px; height:34px; background:var(--gradient-primary); border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#fff;">${initial}</div>
                                <span style="font-weight:bold; font-size:0.95rem; color:var(--text-main);">${post.author_name || 'Anonymous Peer'}</span>
                            </div>
                            <span style="font-size:0.75rem; color:var(--primary); background:var(--cream-accent); font-weight:700; padding:3px 9px; border-radius:10px; border:1px solid var(--cream-sand);">${post.topic}</span>
                        </div>
                        <p style="font-size:0.95rem; line-height:1.6; color:var(--text-main); margin-bottom:12px;">${post.content}</p>
                        ${post.image_url ? `<img src="${post.image_url}" style="max-width:100%; border-radius:8px; margin-top:5px; margin-bottom:12px; max-height:250px; object-fit:cover;" />` : ''}
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid var(--border-color); margin-top:10px;">
                            <button onclick="likePeerStory(${post.id}, this)" class="like-button-chip optimistic-btn ${isLiked ? 'is-active' : ''}">
                                <span>${isLiked ? '❤️' : '🤍'}</span>
                                <span id="story-likes-${post.id}">${likes}</span>
                                <span>Helpful</span>
                            </button>
                            <span style="font-size:0.75rem; color:var(--text-light); font-weight:600;">Verified Peer Story</span>
                        </div>
                    </div>
                `;
            });
            list.innerHTML = html;
        })
        .catch(err => {
            list.innerHTML = '<p style="color:red; text-align:center;">Failed to load peer stories.</p>';
        });
}

async function likePeerStory(storyId, btn) {
    const countSpan = document.getElementById(`story-likes-${storyId}`);
    if (!btn || !countSpan) return;

    // --- SNAPSHOT PREVIOUS STATE FOR ROLLBACK ---
    const wasLiked = !!userLikedStories[storyId];
    const prevLikes = parseInt(countSpan.innerText, 10) || 0;
    const prevClass = btn.className;
    const prevHTML = btn.innerHTML;

    // --- OPTIMISTIC UI: UPDATE IMMEDIATELY ---
    const isNowLiked = !wasLiked;
    userLikedStories[storyId] = isNowLiked;
    saveUserActivityCache(currentUserId);

    const newLikes = isNowLiked ? (prevLikes + 1) : Math.max(0, prevLikes - 1);
    countSpan.innerText = newLikes;

    if (isNowLiked) {
        btn.classList.add('is-active', 'liked');
        btn.innerHTML = `<span>❤️</span> <span id="story-likes-${storyId}">${newLikes}</span> <span>Helpful</span>`;
    } else {
        btn.classList.remove('is-active', 'liked');
        btn.innerHTML = `<span>🤍</span> <span id="story-likes-${storyId}">${newLikes}</span> <span>Helpful</span>`;
    }

    // --- BACKGROUND SERVER REQUEST (SYNCED TO NEON) ---
    try {
        const res = await fetch(`${API_BASE}/safespace/experiences/${storyId}/like?user_id=${currentUserId}`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ user_id: currentUserId, active: isNowLiked })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.new_likes_count !== undefined) {
            countSpan.innerText = data.new_likes_count;
        }
        if (Array.isArray(data.liked_story_ids)) {
            applyServerUserState({ liked_story_ids: data.liked_story_ids });
        }
    } catch (err) {
        // --- QUIET ROLLBACK TO PREVIOUS VALUE IF REQUEST FAILS ---
        console.warn(`[Optimistic UI Rollback] Like failed on story ${storyId}:`, err);
        userLikedStories[storyId] = wasLiked;
        saveUserActivityCache(currentUserId);
        countSpan.innerText = prevLikes;
        btn.className = prevClass;
        btn.innerHTML = prevHTML;
    }
}


async function submitSafeSpaceComment() {
    const text = document.getElementById('safespace-post-text').value;
    const isAnon = document.getElementById('safespace-post-anon') ? document.getElementById('safespace-post-anon').checked : true;
    const fileInput = document.getElementById('safespace-post-image');
    const imageFile = fileInput.files[0];

    if (!text.trim() && !imageFile) {
        alert("Please write your story or upload an image.");
        return;
    }

    const btn = document.getElementById('safespace-submit-btn');
    btn.innerText = 'Posting...';
    btn.disabled = true;

    let image_base64 = null;
    if (imageFile) {
        image_base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(imageFile);
        });
    }

    const authorDisplay = isAnon ? "Anonymous Peer" : (`${currentUsername} (${currentUniversity})`);

    fetch(`${API_BASE}/safespace/experiences`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            topic: currentSafeSpaceTopic,
            content: text,
            image_url: image_base64,
            author_name: authorDisplay
        })
    })
    .then(res => {
        if (!res.ok) throw new Error("Failed to post");
        return res.json();
    })
    .then(data => {
        document.getElementById('safespace-post-text').value = '';
        fileInput.value = '';
        document.getElementById('safespace-post-form').style.display = 'none';
        document.getElementById('safespace-share-btn').style.display = 'block';
        btn.innerText = 'Post Peer Story';
        btn.disabled = false;
        fetchPeerPosts();
    })
    .catch(err => {
        alert("Error posting your story.");
        btn.innerText = 'Post Peer Story';
        btn.disabled = false;
    });
}

function fetchGlobalPeerFeed(filterTopic = '') {
    const feed = document.getElementById('global-peer-feed');
    if (!feed) return;
    feed.innerHTML = renderPeerStoriesSkeleton(3);

    const url = filterTopic
        ? `${API_BASE}/safespace/experiences?topic=${encodeURIComponent(filterTopic)}`
        : `${API_BASE}/safespace/experiences`;

    fetch(url)
    .then(res => res.json())
    .then(posts => {
        if (!posts || posts.length === 0) {
            feed.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No peer stories in this category yet. Share yours above!</p>';
            return;
        }
        let html = '';
        posts.forEach(post => {
            const initial = post.author_name ? post.author_name.charAt(0).toUpperCase() : 'A';
            const isLiked = !!userLikedStories[post.id];
            const likes = post.likes_count || 5;
            html += `
                <div style="padding:14px; margin-bottom:12px; background:var(--card-bg-warm); border-radius:10px; border:1px solid var(--border-color); border-left:4px solid var(--primary);">
                    <div style="font-size:0.75rem; color:var(--primary); margin-bottom:4px; font-weight:700; font-family:'Poppins',sans-serif;">${post.topic}</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <div style="width:26px; height:26px; background:var(--gradient-primary); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; color:#fff; font-weight:bold;">${initial}</div>
                        <span style="font-size:0.88rem; font-weight:bold; color:var(--text-main);">${post.author_name}</span>
                    </div>
                    <p style="font-size:0.88rem; color:var(--text-main); margin:0 0 8px 0; line-height:1.5;">${post.content}</p>
                    ${post.image_url ? `<img src="${post.image_url}" style="max-width:100%; border-radius:6px; margin-bottom:8px; max-height:150px; object-fit:cover;" />` : ''}
                    <div style="display:flex; justify-content:flex-end;">
                        <button onclick="likePeerStory(${post.id}, this)" class="like-button-chip optimistic-btn ${isLiked ? 'is-active' : ''}" style="padding:3px 10px; font-size:0.75rem;">
                            <span>${isLiked ? '❤️' : '🤍'}</span>
                            <span id="story-likes-${post.id}">${likes}</span>
                        </button>
                    </div>
                </div>
            `;
        });
        feed.innerHTML = html;
    })
    .catch(err => {
        if (feed) feed.innerHTML = '<p style="color:red; font-size:0.9rem;">Failed to load peer stories.</p>';
    });
}

async function submitGlobalExperience() {
    const topic = document.getElementById('global-share-topic').value;
    const text = document.getElementById('global-share-text').value;
    const isAnon = document.getElementById('global-share-anon') ? document.getElementById('global-share-anon').checked : true;
    const fileInput = document.getElementById('global-share-image');
    const imageFile = fileInput.files[0];

    if (!text.trim() && !imageFile) {
        alert("Please write your story or upload an image.");
        return;
    }

    const btn = document.getElementById('global-submit-btn');
    btn.innerText = 'Publishing...';
    btn.disabled = true;

    let image_base64 = null;
    if (imageFile) {
        image_base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(imageFile);
        });
    }

    const authorDisplay = isAnon ? "Anonymous Peer" : (`${currentUsername} (${currentUniversity})`);

    fetch(`${API_BASE}/safespace/experiences`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            topic: topic,
            content: text,
            image_url: image_base64,
            author_name: authorDisplay
        })
    })
    .then(res => {
        if (!res.ok) throw new Error("Failed to post");
        return res.json();
    })
    .then(data => {
        document.getElementById('global-share-text').value = '';
        fileInput.value = '';
        document.getElementById('global-share-form').style.display = 'none';
        document.getElementById('global-share-btn').style.display = 'block';
        btn.innerText = 'Publish Peer Story';
        btn.disabled = false;
        fetchGlobalPeerFeed();
    })
    .catch(err => {
        alert("Error publishing your story.");
        btn.innerText = 'Publish Peer Story';
        btn.disabled = false;
    });
}

// -----------------------------------------
// Smart Campus & Health News Hub Logic
// -----------------------------------------
async function filterNews(source, el) {
    document.querySelectorAll('#view-news .filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadNews(source);
}

async function loadNews(source) {
    const container = document.getElementById('news-feed');
    container.innerHTML = renderNewsSkeleton(4);

    try {
        const url = source === 'All' ? `${API_BASE}/news/today` : `${API_BASE}/news/${encodeURIComponent(source)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; padding:20px;">No articles found for this stream.</p>';
            return;
        }

        let html = '';
        data.forEach(item => {
            const badgeColor = item.source === 'Health News' ? 'var(--accent-sage)' : (item.source === 'Campus Innovation' ? 'var(--primary)' : 'var(--secondary-dark)');
            html += `
                <div class="article-card" style="display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span class="card-tag" style="background:${badgeColor}; color:#fff;">${item.source}</span>
                            ${item.descriptive_topic ? `<span style="font-size:0.75rem; color:var(--text-light); font-weight:600;">${item.descriptive_topic}</span>` : ''}
                        </div>
                        <h3 class="card-title" style="margin-top:10px;">${item.title}</h3>
                        <p class="card-desc" style="font-size:0.92rem; margin-bottom:15px; line-height:1.6;">${item.summary || 'Click below to read full report...'}</p>
                    </div>
                    <div class="card-meta" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:12px;">
                        <span style="font-size:0.8rem; color:var(--text-light);">${new Date(item.published_date).toLocaleDateString()}</span>
                        <a href="${item.url}" class="card-action" target="_blank">READ BRIEFING ↗</a>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red; grid-column: 1/-1;">Error loading Youth Impact news.</p>';
    }
}

// -----------------------------------------
// Campus Voice & Community Radio Hub Logic
// -----------------------------------------
async function filterRadio(station, el) {
    document.querySelectorAll('#view-radio .filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadRadio(station);
}

async function loadRadio(station) {
    const container = document.getElementById('radio-feed');
    container.innerHTML = '<p style="text-align:center; padding: 20px;">Loading Campus Voice &amp; Radio streams...</p>';

    try {
        const res = await fetch(`${API_BASE}/radio/${encodeURIComponent(station)}`);
        const data = await res.json();

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center;">No broadcasts or podcasts found for this filter.</p>';
            return;
        }

        let html = '';
        data.forEach(item => {
            const isPodcast = item.source === 'Student Panels' || item.source === 'Expert Q&As';
            const tagColor = isPodcast ? 'var(--primary)' : 'var(--secondary-dark)';
            html += `
                <div class="radio-card" style="background:var(--card-bg); padding:18px; border-radius:12px; margin-bottom:15px; border:1px solid var(--border-color); border-left:4px solid ${tagColor}; box-shadow:var(--shadow-sm);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        <span class="card-tag" style="background:${tagColor}; color:#fff; font-size:0.75rem; padding:4px 10px; border-radius:4px; font-weight:bold;">${item.source}</span>
                        <span style="font-size:0.8rem; color:var(--primary); font-weight:700;">${item.descriptive_topic || 'Youth Connect+ Audio Stream'}</span>
                    </div>
                    <h3 class="card-title" style="margin:10px 0 6px 0;">${item.title}</h3>
                    <p class="card-desc" style="font-size:0.92rem; margin-bottom:14px; line-height:1.6;">${item.summary || 'Smart Drinking dialogue and campus broadcast.'}</p>
                    <div class="card-meta" style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.8rem; color:var(--text-light);">${isPodcast ? 'On-Demand Curated Episode' : 'Live Radio Stream'}</span>
                        <a href="${item.url}" class="btn-primary" target="_blank" style="padding:7px 16px; border-radius:6px; font-size:0.82rem; text-decoration:none;">
                            ${isPodcast ? 'LISTEN TO EPISODE ↗' : 'TUNE IN LIVE ↗'}
                        </a>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red;">Error loading radio &amp; podcast streams.</p>';
    }
}

// -----------------------------------------
// Campus & Community Events Hub Logic
// -----------------------------------------
let currentEventCategory = 'All';

async function filterEvents(category, el) {
    document.querySelectorAll('#view-events .filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    currentEventCategory = category;
    loadEvents(category);
}

function toggleEventPostForm() {
    const modal = document.getElementById('event-post-modal');
    if (!modal) return;
    const isHidden = modal.style.display === 'none' || modal.style.display === '';
    modal.style.display = isHidden ? 'block' : 'none';
}

async function loadEvents(category = 'All') {
    const container = document.getElementById('events-feed');
    if (!container) return;
    container.innerHTML = renderEventsSkeleton(3);

    try {
        const url = (category === 'All') ? `${API_BASE}/events` : `${API_BASE}/events?category=${encodeURIComponent(category)}`;
        const [res] = await Promise.all([
            fetch(url),
            syncActivityFromNeon()
        ]);
        const events = await res.json();

        if (!events || events.length === 0) {
            container.innerHTML = '<p style="text-align:center; grid-column:1/-1; padding:30px; color:var(--text-muted);">No events scheduled in this category yet. Organizers can post an event above!</p>';
            return;
        }

        let html = '';
        const catColors = {
            'Marathons & Sports': 'var(--primary)',
            'Campaigns & Pledges': 'var(--secondary-dark)',
            'Sober Festivals & Arts': 'var(--accent-amber)',
            'Workshops': 'var(--accent-sage)'
        };

        events.forEach(evt => {
            const badgeColor = catColors[evt.category] || 'var(--primary)';
            const isRSVPed = !!userRSVPs[evt.id];
            html += `
                <div class="article-card" style="display:flex; flex-direction:column; justify-content:space-between; padding:0; overflow:hidden; border:1px solid var(--border-color); min-height:410px; border-radius:14px; box-shadow:var(--shadow-sm);">
                    ${evt.banner_url ? `<img src="${evt.banner_url}" alt="${evt.title}" style="width:100%; height:180px; object-fit:cover; display:block;" />` : ''}
                    <div style="padding:20px; display:flex; flex-direction:column; flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                            <span class="card-tag" style="background:${badgeColor}; color:#fff; font-size:0.75rem; padding:3px 9px; border-radius:4px; font-weight:bold;">${evt.category}</span>
                            <span style="font-size:0.78rem; color:var(--accent-sage); font-weight:700;"><span id="event-rsvp-${evt.id}">${evt.rsvp_count}</span> Attending</span>
                        </div>
                        <h3 class="card-title" style="margin:0 0 8px 0; font-size:1.15rem;">${evt.title}</h3>
                        <div style="font-size:0.83rem; color:var(--accent-amber); font-weight:700; margin-bottom:6px;">${evt.date_str}</div>
                        <div style="font-size:0.82rem; color:var(--primary); font-weight:600; margin-bottom:10px;">${evt.location}</div>
                        <p class="card-desc" style="font-size:0.88rem; line-height:1.6; margin-bottom:14px; flex:1;">${evt.description}</p>
                        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:12px; margin-top:auto;">
                            <span style="font-size:0.78rem; color:var(--text-light);">By: <strong>${evt.organizer}</strong></span>
                            <button onclick="rsvpEvent(${evt.id})" id="btn-rsvp-${evt.id}" class="${isRSVPed ? 'btn-sage' : 'btn-primary'} optimistic-btn" style="padding:7px 16px; font-size:0.82rem;">
                                ${isRSVPed ? '✓ Registered (Attending)' : '✓ RSVP / Join'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red; grid-column:1/-1;">Error loading events. Please check connection.</p>';
    }
}

async function rsvpEvent(eventId) {
    const btn = document.getElementById(`btn-rsvp-${eventId}`);
    const countSpan = document.getElementById(`event-rsvp-${eventId}`);
    if (!btn || !countSpan) return;

    // --- 1. SNAPSHOT PREVIOUS STATE FOR QUIET ROLLBACK ---
    const wasRSVPed = !!userRSVPs[eventId];
    const prevRSVPState = wasRSVPed;
    const prevCount = parseInt(countSpan.innerText, 10) || 0;
    const prevBtnBg = btn.style.background;
    const prevBtnHTML = btn.innerHTML;

    // --- 2. OPTIMISTIC UI: UPDATE IMMEDIATELY ON CLICK ---
    const isNowRSVPed = !wasRSVPed;
    userRSVPs[eventId] = isNowRSVPed;
    saveUserActivityCache(currentUserId);

    const newCount = isNowRSVPed ? (prevCount + 1) : Math.max(0, prevCount - 1);
    countSpan.innerText = newCount;
    btn.className = isNowRSVPed ? 'btn-sage optimistic-btn' : 'btn-primary optimistic-btn';
    btn.style.background = isNowRSVPed ? 'var(--accent-sage)' : 'var(--primary)';
    btn.innerHTML = isNowRSVPed ? '✓ Registered (Attending)' : '✓ RSVP / Join';

    // --- 3. EXECUTE SERVER REQUEST IN BACKGROUND (SYNCED TO NEON) ---
    try {
        const res = await fetch(`${API_BASE}/events/${eventId}/rsvp?user_id=${currentUserId}`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ user_id: currentUserId, active: isNowRSVPed })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.new_rsvp_count !== undefined) {
            countSpan.innerText = data.new_rsvp_count;
        }
        if (Array.isArray(data.rsvp_event_ids)) {
            applyServerUserState({ rsvp_event_ids: data.rsvp_event_ids });
        }
    } catch (err) {
        // --- 4. QUIET ROLLBACK TO PREVIOUS VALUE IF REQUEST FAILS ---
        console.warn(`[Optimistic UI Rollback] Event RSVP failed for ID ${eventId}:`, err);
        userRSVPs[eventId] = prevRSVPState;
        saveUserActivityCache(currentUserId);
        countSpan.innerText = prevCount;
        btn.style.background = prevBtnBg;
        btn.innerHTML = prevBtnHTML;
    }
}

async function submitNewEvent() {
    const title = document.getElementById('event-input-title').value.trim();
    const organizer = document.getElementById('event-input-organizer').value.trim();
    const category = document.getElementById('event-input-category').value;
    const dateStr = document.getElementById('event-input-date').value.trim();
    const location = document.getElementById('event-input-location').value.trim();
    const desc = document.getElementById('event-input-desc').value.trim();
    const fb = document.getElementById('event-form-feedback');

    if (!title || !organizer || !dateStr || !location || !desc) {
        alert("Please fill in all event details (title, organizer, date, location, and description).");
        return;
    }

    const btn = document.getElementById('btn-submit-event');
    btn.disabled = true;
    btn.innerText = 'Publishing Event...';

    try {
        const res = await fetch(`${API_BASE}/events`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                title: title,
                organizer: organizer,
                category: category,
                date_str: dateStr,
                location: location,
                description: desc
            })
        });

        if (!res.ok) throw new Error("Failed to create event");
        
        document.getElementById('event-input-title').value = '';
        document.getElementById('event-input-organizer').value = '';
        document.getElementById('event-input-date').value = '';
        document.getElementById('event-input-location').value = '';
        document.getElementById('event-input-desc').value = '';

        fb.style.display = 'block';
        fb.innerText = '✓ Event published successfully to Campus Events Hub!';
        setTimeout(() => {
            fb.style.display = 'none';
            toggleEventPostForm();
            loadEvents(currentEventCategory);
        }, 1200);
    } catch (e) {
        alert("Error publishing event. Please check backend connection.");
    } finally {
        btn.disabled = false;
        btn.innerText = 'Publish Event';
    }
}


// -----------------------------------------
// Opportunities Logic
// -----------------------------------------
async function loadOpportunitiesIntoContainer(container) {
    container.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading youth innovation opportunities...</p></div>';

    try {
        const res = await fetch(`${API_BASE}/opportunities`);
        const data = await res.json();

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:30px;">No opportunities found.</p>';
            return;
        }

        let html = '<div class="outreach-header"><h2 style="font-size:1.85rem; margin-bottom:10px;">Smart Drinking Grants, Fellowships &amp; Opportunities</h2><p>Curated innovation challenges, Enactus fellowships, and youth leadership programs.</p></div>';
        html += '<div class="grid-layout">';
        data.forEach(item => {
            html += `
                <div class="outreach-card" style="display:flex; flex-direction:column; justify-content:space-between; height: 100%;">
                    <div>
                        <span class="card-tag" style="background:var(--cream-accent); color:var(--secondary-dark); border:1px solid var(--cream-sand);">${item.source}</span>
                        <h3 class="card-title" style="margin-top:10px;">${item.title}</h3>
                        <p class="card-desc" style="font-size:0.92rem; margin-bottom:15px; line-height:1.6;">${item.description || item.summary || 'Click below to review eligibility criteria.'}</p>
                    </div>
                    <a href="${item.url}" class="btn-primary" target="_blank" style="display:block; text-align:center; text-decoration:none; padding:10px;">APPLY / VIEW DETAILS ↗</a>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red;">Error loading opportunities.</p>';
    }
}

// -----------------------------------------
// "BeSmart" Moderation & Decision Toolkit Logic
// -----------------------------------------
function switchBeSureTab(tabId, el) {
    document.querySelectorAll('#view-besure .out-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');

    const container = document.getElementById('besure-feed');

    if (tabId === 'verify') {
        const sampleMyths = [
            "Drinking strong coffee or taking a cold shower sobers you up faster",
            "Mixing energy drinks with alcohol neutralizes the crash and makes driving safer",
            "Unlabelled cheap street spirits ('kambwa') are just strong normal alcohol",
            "A small glass of wine or beer in late pregnancy is safe for the baby",
            "Eating a full meal and alternating with water slows down BAC spikes"
        ];

        container.innerHTML = `
            <div class="outreach-card" style="margin-bottom:20px; padding:25px;">
                <h3 class="card-title" style="font-size:1.4rem; color:var(--primary);">Alcohol &amp; Health Myth vs. Fact Checker</h3>
                <p class="card-desc" style="margin-bottom:14px;">
                    Enter any common drinking myth, party rumor, or health claim below—or click a popular campus claim—to evaluate the biological and medical facts.
                </p>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
                    <input type="text" id="verify-input" placeholder="e.g., 'Cold showers cure hangovers faster' or 'Mixing energy drinks with alcohol...'" style="flex:1; min-width:250px; padding:12px; box-sizing:border-box;" />
                    <button onclick="submitVerify()" class="btn-primary" style="padding:12px 24px;">Check Myth vs. Fact</button>
                </div>
                <div style="margin-bottom:10px;">
                    <span style="font-size:0.8rem; color:var(--text-light); font-weight:600; display:block; margin-bottom:6px;">Quick-Test a Common Campus Claim:</span>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${sampleMyths.map(m => `<button onclick="document.getElementById('verify-input').value='${m.replace(/'/g, "\\'")}'; submitVerify();" class="btn-cream" style="padding:6px 12px; border-radius:18px; font-size:0.78rem;">"${m}"</button>`).join('')}
                    </div>
                </div>
                <div id="verify-result" style="margin-top:20px; display:none; background:var(--card-bg-warm); padding:20px; border-radius:10px; border:1px solid var(--border-color); border-left:4px solid var(--accent-sage);"></div>
            </div>

            <div class="outreach-card" style="padding:22px;">
                <h4 class="card-title" style="margin-bottom:12px;">Recent Campus Myths Verified</h4>
                <div style="display:grid; gap:12px;">
                    <div style="padding:14px; background:var(--primary-light); border-left:4px solid var(--primary); border-radius:8px;">
                        <span style="background:var(--primary); color:#fff; font-family:'Poppins',sans-serif; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:4px;">DANGEROUS</span>
                        <strong style="margin-left:8px; color:var(--primary-dark);">"Mixing energy drinks with alcohol neutralizes the crash."</strong>
                        <p style="font-size:0.88rem; color:var(--text-main); margin:6px 0 0 0; line-height:1.5;">High-dose caffeine masks alcohol's sedative warning signs ('wide-awake drunk'), increasing binge consumption and cardiovascular strain without lowering BAC.</p>
                    </div>
                    <div style="padding:14px; background:var(--cream-soft); border-left:4px solid var(--secondary-dark); border-radius:8px;">
                        <span style="background:var(--secondary-dark); color:#fff; font-family:'Poppins',sans-serif; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:4px;">FALSE</span>
                        <strong style="margin-left:8px; color:var(--secondary-dark);">"Cold showers or hot coffee sober you up so you can drive."</strong>
                        <p style="font-size:0.88rem; color:var(--text-main); margin:6px 0 0 0; line-height:1.5;">Only liver enzymes (Alcohol Dehydrogenase) eliminate alcohol at ~1 standard drink per hour. Cold showers can trigger shock in intoxicated individuals.</p>
                    </div>
                    <div style="padding:14px; background:var(--accent-sage-soft); border-left:4px solid var(--accent-sage); border-radius:8px;">
                        <span style="background:var(--accent-sage); color:#fff; font-family:'Poppins',sans-serif; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:4px;">TRUE</span>
                        <strong style="margin-left:8px; color:var(--accent-sage-hover);">"Eating protein/carbs before drinking and alternating with water slows BAC spikes."</strong>
                        <p style="font-size:0.88rem; color:var(--text-main); margin:6px 0 0 0; line-height:1.5;">Food slows gastric emptying into the small intestine, preventing dangerous rapid spikes in Blood Alcohol Concentration.</p>
                    </div>
                </div>
            </div>
        `;

    } else if (tabId === 'real_or_manipulated') {
        container.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading Smart Scenario Simulator...</p></div>';
        fetch(`${API_BASE}/besmart/scenarios`)
            .then(res => res.json())
            .then(scenarios => {
                if (!scenarios || scenarios.length === 0) {
                    container.innerHTML = '<p style="text-align:center; padding:20px;">No scenarios available.</p>';
                    return;
                }
                let html = `
                    <div class="outreach-header" style="margin-bottom:15px;">
                        <h3 style="font-size:1.55rem; color:var(--primary);">Smart Scenario Simulator: What Would You Do?</h3>
                        <p style="font-size:0.92rem;">Practice high-stakes campus social decisions. Choose your action to see community consensus and expert de-escalation tips.</p>
                    </div>
                    <div class="grid-layout">
                `;
                scenarios.forEach(s => {
                    html += `
                        <div class="outreach-card" style="display:flex; flex-direction:column; justify-content:space-between; padding:22px;">
                            <div>
                                <span class="card-tag" style="background:var(--cream-accent); color:var(--secondary-dark); border:1px solid var(--cream-sand); margin-bottom:12px; display:inline-block;">${s.category}</span>
                                ${s.image_url ? `<img src="${s.image_url}" alt="Scenario" style="width:100%; height:170px; object-fit:cover; border-radius:10px; margin-bottom:14px;"/>` : ''}
                                <p style="font-weight:700; font-size:1rem; line-height:1.55; color:var(--text-main); margin-bottom:15px;">"${s.scenario_text}"</p>
                                
                                <div style="display:flex; flex-direction:column; gap:9px; margin-bottom:12px;">
                                    <button onclick="submitScenarioChoice(${s.id}, 'A')" id="scen-btn-${s.id}-A" class="btn-cream" style="text-align:left; padding:11px 14px; font-size:0.88rem; line-height:1.4; border-radius:8px;">
                                        <strong>Option A:</strong> ${s.option_a}
                                    </button>
                                    <button onclick="submitScenarioChoice(${s.id}, 'B')" id="scen-btn-${s.id}-B" class="btn-cream" style="text-align:left; padding:11px 14px; font-size:0.88rem; line-height:1.4; border-radius:8px;">
                                        <strong>Option B:</strong> ${s.option_b}
                                    </button>
                                    <button onclick="submitScenarioChoice(${s.id}, 'C')" id="scen-btn-${s.id}-C" class="btn-cream" style="text-align:left; padding:11px 14px; font-size:0.88rem; line-height:1.4; border-radius:8px;">
                                        <strong>Option C:</strong> ${s.option_c}
                                    </button>
                                </div>
                            </div>
                            <div id="scenario-feedback-${s.id}" style="display:none; margin-top:10px; padding:14px; border-radius:8px; background:var(--card-bg-warm); border:1px solid var(--border-color); font-size:0.88rem; line-height:1.6;"></div>
                        </div>
                    `;
                });
                html += '</div>';
                container.innerHTML = html;
            })
            .catch(err => {
                container.innerHTML = '<p style="text-align:center; color:red;">Failed to load scenarios.</p>';
            });

    } else if (tabId === 'mil_challenge') {
        loadWeeklyChallengeAndLeaderboard(container);

    } else if (tabId === 'mil_score') {
        container.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading your Smart Lifestyle &amp; Moderation Score...</p></div>';
        fetch(`${API_BASE}/mil/score/${currentUserId}`)
            .then(res => res.json())
            .then(data => {
                const avg = Math.floor((data.info_verification + data.ai_awareness + data.digital_safety + data.source_evaluation) / 4);
                let html = `
                    <div class="outreach-card" style="text-align:center; max-width:580px; margin:0 auto; padding:32px;">
                        <span style="background:var(--cream-accent); color:var(--secondary-dark); border:1px solid var(--cream-sand); padding:4px 14px; border-radius:15px; font-family:'Poppins',sans-serif; font-size:0.78rem; font-weight:700;">
                            University Chapter: ${currentUniversity}
                        </span>
                        <h2 style="font-size:1.35rem; color:var(--text-muted); margin-top:14px; margin-bottom:5px;">YOUR SMART LIFESTYLE &amp; MODERATION SCORE</h2>
                        <h1 style="font-size:62px; font-family:'Poppins',sans-serif; font-weight:800; color:var(--primary); margin:10px 0;">${avg}/100</h1>
                        <p style="color:var(--text-muted); font-size:0.92rem; margin-bottom:16px;">Reflects your mastery of BAC limits, refusal skills, party harm-reduction, and Zimbabwe liquor law awareness.</p>
                        
                        <div style="text-align:left; max-width:420px; margin:20px auto; background:var(--card-bg-warm); border:1px solid var(--border-color); padding:22px; border-radius:12px; line-height:2.0; color:var(--text-main);">
                            <p style="margin-bottom:10px;"><strong>BAC &amp; Health Limits Knowledge:</strong> ${data.info_verification}%</p>
                            <p style="margin-bottom:10px;"><strong>Peer Pressure &amp; Refusal Skills:</strong> ${data.ai_awareness}%</p>
                            <p style="margin-bottom:10px;"><strong>Harm Reduction &amp; Party Safety:</strong> ${data.digital_safety}%</p>
                            <p style="margin-bottom:0;"><strong>Safe Decision-Making &amp; Law:</strong> ${data.source_evaluation}%</p>
                        </div>
                        
                        <div style="background:var(--cream-soft); border:1px solid var(--cream-sand); padding:18px; border-radius:12px; margin-top:20px;">
                            <p style="margin-bottom:12px; color:var(--text-main);">Boost your score &amp; earn points for <strong>${currentUniversity}</strong> by completing modules and scenarios!</p>
                            <button onclick="switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view=\\'outreach\\']'));" class="btn-primary" style="padding:10px 22px;">
                                Open Smart Living Academy →
                            </button>
                        </div>
                    </div>
                `;
                container.innerHTML = html;
            })
            .catch(err => {
                container.innerHTML = '<p style="text-align:center; color:red;">Failed to load Smart Lifestyle Score.</p>';
            });
    }
}

async function submitVerify() {
    const text = document.getElementById('verify-input').value;
    const resDiv = document.getElementById('verify-result');
    if (!text.trim()) return;

    resDiv.style.display = 'block';
    resDiv.innerHTML = '<p style="color:var(--text-muted);">Evaluating claim against WHO, Toxicology, and Smart Drinking medical guidelines...</p>';

    try {
        const res = await fetch(`${API_BASE}/safespace/verify`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({content: text})
        });
        const data = await res.json();
        const verdict = (data.verdict || 'FALSE').toUpperCase();
        const badgeColor = verdict.includes('TRUE') ? 'var(--accent-sage)' : 'var(--primary)';
        resDiv.style.borderLeftColor = badgeColor;
        resDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <span style="background:${badgeColor}; color:#fff; font-family:'Poppins',sans-serif; font-weight:800; padding:4px 12px; border-radius:4px; font-size:0.85rem;">VERDICT: ${verdict}</span>
                <span style="color:var(--text-light); font-size:0.9rem;">${data.publisher}</span>
            </div>
            <p style="margin-bottom:10px; color:var(--text-main);"><strong>1. Scientific &amp; Biological Reality:</strong><br><span style="color:var(--text-muted);">${data.original_source}</span></p>
            <p style="margin-bottom:10px; color:var(--text-main);"><strong>2. What WHO &amp; Medical Experts Say:</strong><br><span style="color:var(--text-muted);">${data.credible_sources}</span></p>
            <p style="margin-bottom:0; color:var(--accent-sage);"><strong>3. Smart Drinking Recommendation:</strong><br><span>${data.recommendation}</span></p>
        `;
    } catch(e) {
        resDiv.innerHTML = '<p style="color:red;">Verification failed. Please check connection.</p>';
    }
}

async function submitScenarioChoice(scenarioId, optionLetter) {
    const fb = document.getElementById(`scenario-feedback-${scenarioId}`);
    if (!fb) return;
    fb.style.display = 'block';
    fb.innerHTML = '<span style="color:var(--text-muted);">Evaluating choice...</span>';

    try {
        const res = await fetch(`${API_BASE}/besmart/scenarios/${scenarioId}/answer`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: currentUserId,
                selected_option: optionLetter,
                reasoning: "Selected via Smart Scenario Simulator"
            })
        });
        const data = await res.json();
        const borderCol = data.correct ? 'var(--accent-sage)' : 'var(--primary)';
        fb.style.borderLeft = `4px solid ${borderCol}`;
        fb.innerHTML = `
            <div style="font-weight:bold; color:${borderCol}; margin-bottom:6px; font-size:1rem;">${data.message}</div>
            <div style="font-size:0.82rem; color:var(--primary); font-weight:700; margin-bottom:6px;">Community Consensus: ${data.consensus_stats}</div>
            <div style="color:var(--text-main);"><strong>Expert De-escalation Tip:</strong> ${data.expert_tip}</div>
        `;
    } catch (e) {
        fb.innerHTML = '<span style="color:red;">Error evaluating scenario.</span>';
    }
}

async function loadWeeklyChallengeAndLeaderboard(container) {
    container.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading Weekly Challenge &amp; Inter-University Leaderboard...</p></div>';
    try {
        const res = await fetch(`${API_BASE}/besmart/leaderboard`);
        const universities = await res.json();

        let html = `
            <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start;">
                <!-- Left: Interactive Weekly Smart Drinking Quiz & Pledge 18 -->
                <div style="flex:1 1 46%; min-width:300px;" class="outreach-card">
                    <span class="card-tag" style="background:var(--cream-accent); color:var(--secondary-dark); border:1px solid var(--cream-sand);">Week 1 Challenge • +30 Campus Points</span>
                    <h3 class="card-title" style="margin-top:12px; font-size:1.35rem;">Smart Drinking Weekly Quiz &amp; Pledge 18</h3>
                    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:15px;">Answer all 3 situational questions &amp; sign Pledge 18 to boost your university's Enactus ranking!</p>
                    
                    <div style="margin-bottom:14px;">
                        <label style="font-size:0.82rem; color:var(--primary); font-weight:700;">Select Your University Chapter:</label>
                        <select id="quiz-uni-select" onchange="syncUniversityChapter(this.value);" style="width:100%; padding:9px; margin-top:4px; box-sizing:border-box;">
                            ${universities.map(u => `<option value="${u.short_code}" ${u.short_code === currentUniversity ? 'selected' : ''}>${u.university_name} (${u.short_code})</option>`).join('')}
                        </select>
                    </div>

                    <div style="margin-bottom:12px; padding:14px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:8px;">
                        <p style="font-size:0.88rem; font-weight:700; margin:0 0 6px 0; color:var(--text-main);">Q1. How many standard drinks can a healthy human liver metabolize per hour?</p>
                        <select id="quiz-q1" style="width:100%; padding:8px; box-sizing:border-box;">
                            <option value="wrong1">3 standard drinks per hour if you drink coffee</option>
                            <option value="correct">Roughly 1 standard drink (10–14g pure alcohol) per hour</option>
                            <option value="wrong2">5 standard drinks per hour if you exercise</option>
                        </select>
                    </div>

                    <div style="margin-bottom:12px; padding:14px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:8px;">
                        <p style="font-size:0.88rem; font-weight:700; margin:0 0 6px 0; color:var(--text-main);">Q2. What is the statutory legal age to purchase alcohol under Zimbabwe's Liquor Act (Pledge 18)?</p>
                        <select id="quiz-q2" style="width:100%; padding:8px; box-sizing:border-box;">
                            <option value="correct">18 years and above (Strictly no sales or supply to under-18s)</option>
                            <option value="wrong1">16 years if accompanied by a cousin</option>
                        </select>
                    </div>

                    <div style="margin-bottom:14px; padding:14px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:8px;">
                        <p style="font-size:0.88rem; font-weight:700; margin:0 0 6px 0; color:var(--text-main);">Q3. If a friend passes out after drinking and is vomiting or breathing slowly, what must you do?</p>
                        <select id="quiz-q3" style="width:100%; padding:8px; box-sizing:border-box;">
                            <option value="correct">Place them on their side (Recovery Position) and call medical help (999/994) immediately</option>
                            <option value="wrong1">Leave them on their back to sleep it off</option>
                            <option value="wrong2">Put them under a cold shower</option>
                        </select>
                    </div>

                    <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--primary); margin-bottom:14px; cursor:pointer; font-weight:700;">
                        <input type="checkbox" id="quiz-pledge18" checked />
                        <span>I sign "Pledge 18": I will lead Above the Influence, drink smart, and never supply alcohol to minors.</span>
                    </label>

                    <button onclick="submitWeeklyQuiz()" id="weekly-quiz-btn" class="btn-primary" style="width:100%; padding:12px; font-size:0.95rem;">
                        Submit Challenge &amp; Add Points to My University
                    </button>
                    <p id="weekly-quiz-feedback" style="display:none; margin-top:12px; font-weight:bold; text-align:center;"></p>
                </div>

                <!-- Right: Inter-University Enactus Leaderboard -->
                <div style="flex:1 1 48%; min-width:300px;" class="outreach-card">
                    <h3 class="card-title" style="margin-bottom:6px;">Inter-University Smart Drinking Leaderboard</h3>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:15px;">Live campus safety &amp; moderation rankings across Zimbabwean Enactus chapters.</p>
                    <div id="leaderboard-table-container">
                        ${renderLeaderboardHTML(universities)}
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red;">Failed to load leaderboard.</p>';
    }
}

function renderLeaderboardHTML(universities) {
    if (!universities || universities.length === 0) return '<p>No universities found.</p>';
    return universities.map((u, idx) => {
        const rankIcon = `#${idx + 1}`;
        const isUserUni = u.short_code === currentUniversity;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px; margin-bottom:10px; border-radius:10px; background:${isUserUni ? 'var(--cream-soft)' : '#FFFFFF'}; border:1.5px solid ${isUserUni ? 'var(--primary)' : 'var(--border-color)'}; box-shadow:${isUserUni ? 'var(--shadow-sm)' : 'none'}; transition:all var(--transition-fast);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.2rem; font-weight:bold; min-width:28px;">${rankIcon}</span>
                    <div>
                        <div style="font-weight:700; font-size:0.95rem; color:var(--text-main);">${u.university_name} <span style="color:var(--primary);">(${u.short_code})</span></div>
                        <div style="font-size:0.78rem; color:var(--text-muted);">${u.ambassadors_count} Ambassadors • ${u.pledge_18_signed} Pledge 18s</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; font-family:'Poppins',sans-serif; color:var(--primary); font-size:1.1rem;">${u.points.toLocaleString()} pts</div>
                </div>
            </div>
        `;
    }).join('');
}

async function submitWeeklyQuiz() {
    const q1 = document.getElementById('quiz-q1').value;
    const q2 = document.getElementById('quiz-q2').value;
    const q3 = document.getElementById('quiz-q3').value;
    const uniCode = document.getElementById('quiz-uni-select').value;
    const fb = document.getElementById('weekly-quiz-feedback');

    let correctCount = 0;
    if (q1 === 'correct') correctCount++;
    if (q2 === 'correct') correctCount++;
    if (q3 === 'correct') correctCount++;

    const points = (correctCount * 10) + 10; // up to 40 points
    const btn = document.getElementById('weekly-quiz-btn');
    btn.disabled = true;
    btn.innerText = 'Recording Campus Points...';

    try {
        const res = await fetch(`${API_BASE}/besmart/pledge`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: currentUserId,
                university_code: uniCode,
                points_earned: points
            })
        });
        const data = await res.json();
        fb.style.display = 'block';
        fb.style.color = 'var(--accent-sage)';
        fb.innerText = `✓ You scored ${correctCount}/3 on the Quiz! ${data.message}`;

        // Refresh leaderboard table
        const lbRes = await fetch(`${API_BASE}/besmart/leaderboard`);
        const lbData = await lbRes.json();
        const lbContainer = document.getElementById('leaderboard-table-container');
        if (lbContainer) lbContainer.innerHTML = renderLeaderboardHTML(lbData);
    } catch (e) {
        fb.style.display = 'block';
        fb.style.color = 'red';
        fb.innerText = 'Error recording points.';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit Challenge & Add Points to My University';
    }
}

// -----------------------------------------
// Multi-Frame Landing Page, Automated Slideshows & Login Gate
// -----------------------------------------
const slideshowTimers = {};

function initLandingSlideshows() {
    const slideshows = document.querySelectorAll('.frame-slideshow');
    slideshows.forEach((container, idx) => {
        const id = container.id;
        if (!id) return;
        const slides = container.querySelectorAll('.slide-bg');
        if (slides.length <= 1) return;

        let currentIdx = 0;
        if (slideshowTimers[id]) clearInterval(slideshowTimers[id]);

        // Stagger intervals slightly per frame for organic visual transitions
        const intervalMs = 4800 + (idx * 350);
        slideshowTimers[id] = setInterval(() => {
            currentIdx = (currentIdx + 1) % slides.length;
            updateSlideshowState(id, currentIdx);
        }, intervalMs);
    });
}

function updateSlideshowState(slideshowId, activeIndex) {
    const container = document.getElementById(slideshowId);
    if (!container) return;
    const slides = container.querySelectorAll('.slide-bg');
    slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === activeIndex);
    });

    const dotsWrap = document.querySelector(`[data-slideshow-dots="${slideshowId}"]`);
    if (dotsWrap) {
        const dots = dotsWrap.querySelectorAll('.slide-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === activeIndex);
        });
    }
}

function setFrameSlide(slideshowId, index) {
    updateSlideshowState(slideshowId, index);
    const container = document.getElementById(slideshowId);
    if (!container) return;
    const slides = container.querySelectorAll('.slide-bg');
    if (slideshowTimers[slideshowId]) clearInterval(slideshowTimers[slideshowId]);

    let currentIdx = index;
    slideshowTimers[slideshowId] = setInterval(() => {
        currentIdx = (currentIdx + 1) % slides.length;
        updateSlideshowState(slideshowId, currentIdx);
    }, 5000);
}

// -----------------------------------------
// Continuous Horizontal Strategic Pillar Poster Slideshow (Frame 1)
// -----------------------------------------
const PILLAR_COUNT = 6;
const PILLAR_INTERVAL_MS = 5400;
let pillarCurrentPos = 0;
let pillarTimer = null;
let pillarPaused = false;
let pillarTransitionResetTimer = null;

function updatePillarNavButtons(activeIdx) {
    const navButtons = document.querySelectorAll('#pillar-carousel-nav .pillar-nav-btn');
    navButtons.forEach((btn, i) => {
        btn.classList.remove('active');
        if (i === activeIdx) {
            void btn.offsetWidth; // restart progress bar animation cleanly
            btn.classList.add('active');
        }
    });
}

function applyPillarTransform(pos, animate = true) {
    const track = document.getElementById('pillar-carousel-track');
    if (!track) return;
    track.style.transition = animate ? 'transform 0.78s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    track.style.transform = `translateX(-${pos * 100}%)`;
}

function resetPillarAutoTimer() {
    if (pillarTimer) clearInterval(pillarTimer);
    pillarTimer = setInterval(() => {
        if (!pillarPaused) {
            advancePillarPoster();
        }
    }, PILLAR_INTERVAL_MS);
}

function advancePillarPoster() {
    const track = document.getElementById('pillar-carousel-track');
    if (!track) return;

    if (pillarTransitionResetTimer) {
        clearTimeout(pillarTransitionResetTimer);
        pillarTransitionResetTimer = null;
    }

    pillarCurrentPos += 1;
    applyPillarTransform(pillarCurrentPos, true);
    updatePillarNavButtons(pillarCurrentPos % PILLAR_COUNT);

    if (pillarCurrentPos >= PILLAR_COUNT) {
        // After smooth slide onto cloned slide 0, silently snap back to index 0 for infinite horizontal loop
        pillarTransitionResetTimer = setTimeout(() => {
            pillarCurrentPos = 0;
            applyPillarTransform(0, false);
            void track.offsetWidth;
        }, 800);
    }
}

function stepPillarPoster(delta) {
    const track = document.getElementById('pillar-carousel-track');
    if (!track) return;

    if (pillarTransitionResetTimer) {
        clearTimeout(pillarTransitionResetTimer);
        pillarTransitionResetTimer = null;
        if (pillarCurrentPos >= PILLAR_COUNT) {
            pillarCurrentPos = 0;
            applyPillarTransform(0, false);
            void track.offsetWidth;
        }
    }

    if (delta > 0) {
        advancePillarPoster();
    } else {
        if (pillarCurrentPos <= 0) {
            pillarCurrentPos = PILLAR_COUNT - 1;
        } else {
            pillarCurrentPos -= 1;
        }
        applyPillarTransform(pillarCurrentPos, true);
        updatePillarNavButtons(pillarCurrentPos % PILLAR_COUNT);
    }
    resetPillarAutoTimer();
}

function goToPillarPoster(targetIdx) {
    const track = document.getElementById('pillar-carousel-track');
    if (!track) return;

    if (pillarTransitionResetTimer) {
        clearTimeout(pillarTransitionResetTimer);
        pillarTransitionResetTimer = null;
    }

    pillarCurrentPos = ((targetIdx % PILLAR_COUNT) + PILLAR_COUNT) % PILLAR_COUNT;
    applyPillarTransform(pillarCurrentPos, true);
    updatePillarNavButtons(pillarCurrentPos);
    resetPillarAutoTimer();
}

function initPillarPosterSlideshow() {
    const showcase = document.getElementById('pillar-poster-showcase');
    const track = document.getElementById('pillar-carousel-track');
    if (!showcase || !track) return;

    // Ensure seamless continuous wrap clone exists once
    if (!track.querySelector('[data-clone="true"]')) {
        const firstSlide = track.querySelector('.pillar-poster-slide');
        if (firstSlide) {
            const clone = firstSlide.cloneNode(true);
            clone.setAttribute('data-clone', 'true');
            clone.setAttribute('aria-hidden', 'true');
            track.appendChild(clone);
        }
    }

    pillarCurrentPos = 0;
    applyPillarTransform(0, false);
    updatePillarNavButtons(0);
    resetPillarAutoTimer();

    if (!showcase.dataset.hoverBound) {
        showcase.addEventListener('mouseenter', () => {
            pillarPaused = true;
            showcase.classList.add('is-paused');
        });
        showcase.addEventListener('mouseleave', () => {
            pillarPaused = false;
            showcase.classList.remove('is-paused');
        });
        showcase.dataset.hoverBound = 'true';
    }
}

// -----------------------------------------
// Continuous Horizontal Event Poster Slideshow (Frame 6)
// -----------------------------------------
const EVENT_POSTER_COUNT = 4;
const EVENT_POSTER_INTERVAL_MS = 5000;
let eventCurrentPos = 0;
let eventTimer = null;
let eventPaused = false;
let eventTransitionResetTimer = null;

function updateEventNavButtons(activeIdx) {
    const navButtons = document.querySelectorAll('#events-carousel-nav .events-nav-pill');
    navButtons.forEach((btn, i) => {
        btn.classList.remove('active');
        if (i === activeIdx) {
            void btn.offsetWidth; // Restart progress bar animation cleanly
            btn.classList.add('active');
        }
    });
}

function applyEventTransform(pos, animate = true) {
    const track = document.getElementById('events-carousel-track');
    if (!track) return;
    track.style.transition = animate ? 'transform 0.75s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    track.style.transform = `translateX(-${pos * 100}%)`;
}

function resetEventAutoTimer() {
    if (eventTimer) clearInterval(eventTimer);
    eventTimer = setInterval(() => {
        if (!eventPaused) {
            advanceEventPoster();
        }
    }, EVENT_POSTER_INTERVAL_MS);
}

function advanceEventPoster() {
    const track = document.getElementById('events-carousel-track');
    if (!track) return;

    if (eventTransitionResetTimer) {
        clearTimeout(eventTransitionResetTimer);
        eventTransitionResetTimer = null;
    }

    eventCurrentPos += 1;
    applyEventTransform(eventCurrentPos, true);
    updateEventNavButtons(eventCurrentPos % EVENT_POSTER_COUNT);

    if (eventCurrentPos >= EVENT_POSTER_COUNT) {
        // After smooth slide onto cloned slide 0, silently snap back to index 0 for infinite horizontal loop
        eventTransitionResetTimer = setTimeout(() => {
            eventCurrentPos = 0;
            applyEventTransform(0, false);
            void track.offsetWidth;
        }, 760);
    }
}

function stepEventPoster(delta) {
    const track = document.getElementById('events-carousel-track');
    if (!track) return;

    if (eventTransitionResetTimer) {
        clearTimeout(eventTransitionResetTimer);
        eventTransitionResetTimer = null;
        if (eventCurrentPos >= EVENT_POSTER_COUNT) {
            eventCurrentPos = 0;
            applyEventTransform(0, false);
            void track.offsetWidth;
        }
    }

    if (delta > 0) {
        advanceEventPoster();
    } else {
        if (eventCurrentPos <= 0) {
            eventCurrentPos = EVENT_POSTER_COUNT - 1;
        } else {
            eventCurrentPos -= 1;
        }
        applyEventTransform(eventCurrentPos, true);
        updateEventNavButtons(eventCurrentPos % EVENT_POSTER_COUNT);
    }
    resetEventAutoTimer();
}

function goToEventPoster(targetIdx) {
    const track = document.getElementById('events-carousel-track');
    if (!track) return;

    if (eventTransitionResetTimer) {
        clearTimeout(eventTransitionResetTimer);
        eventTransitionResetTimer = null;
    }

    eventCurrentPos = ((targetIdx % EVENT_POSTER_COUNT) + EVENT_POSTER_COUNT) % EVENT_POSTER_COUNT;
    applyEventTransform(eventCurrentPos, true);
    updateEventNavButtons(eventCurrentPos);
    resetEventAutoTimer();
}

function initEventPosterSlideshow() {
    const showcase = document.getElementById('events-poster-showcase');
    const track = document.getElementById('events-carousel-track');
    if (!showcase || !track) return;

    // Ensure clone exists for continuous seamless looping if not already rendered
    if (!track.querySelector('.event-poster-clone')) {
        const firstSlide = track.querySelector('.event-poster-slide');
        if (firstSlide) {
            const clone = firstSlide.cloneNode(true);
            clone.classList.add('event-poster-clone');
            clone.setAttribute('aria-hidden', 'true');
            track.appendChild(clone);
        }
    }

    eventCurrentPos = 0;
    applyEventTransform(0, false);
    updateEventNavButtons(0);
    resetEventAutoTimer();

    if (!showcase.dataset.hoverBound) {
        showcase.addEventListener('mouseenter', () => {
            eventPaused = true;
            showcase.classList.add('is-paused');
        });
        showcase.addEventListener('mouseleave', () => {
            eventPaused = false;
            showcase.classList.remove('is-paused');
        });

        // Touch swipe support for mobile devices
        let touchStartX = 0;
        let touchEndX = 0;
        showcase.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            eventPaused = true;
        }, { passive: true });

        showcase.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            eventPaused = false;
            const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 40) {
                if (diff > 0) {
                    stepEventPoster(1);
                } else {
                    stepEventPoster(-1);
                }
            }
        }, { passive: true });

        showcase.dataset.hoverBound = 'true';
    }
}

window.stepEventPoster = stepEventPoster;
window.goToEventPoster = goToEventPoster;

function scrollToLandingFrame(frameId) {
    const target = document.getElementById(frameId);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function initLandingScrollSpy() {
    const frames = document.querySelectorAll('.landing-frame');
    if (!frames.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const activeId = entry.target.id;
                document.querySelectorAll('.frame-nav-link').forEach(link => {
                    link.classList.toggle('active', link.getAttribute('data-target') === activeId);
                });
                document.querySelectorAll('.rail-dot').forEach(dot => {
                    dot.classList.toggle('active', dot.getAttribute('data-target') === activeId);
                });
            }
        });
    }, { threshold: 0.35 });

    frames.forEach(frame => observer.observe(frame));
}

function switchFrame2Feature(mode, btnElement) {
    if (btnElement) {
        document.querySelectorAll('.feature-mode-switcher .feature-switch-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }
    const container = document.getElementById('frame2-dual-container');
    const academyPanel = document.getElementById('frame2-panel-academy');
    const watchdogPanel = document.getElementById('frame2-panel-watchdog');
    if (!container || !academyPanel || !watchdogPanel) return;

    if (mode === 'both') {
        container.classList.remove('mode-single');
        academyPanel.style.display = 'block';
        watchdogPanel.style.display = 'block';
    } else if (mode === 'academy') {
        container.classList.add('mode-single');
        academyPanel.style.display = 'block';
        watchdogPanel.style.display = 'none';
    } else if (mode === 'watchdog') {
        container.classList.add('mode-single');
        academyPanel.style.display = 'none';
        watchdogPanel.style.display = 'block';
    }
}

function openLandingLoginModal() {
    if (currentSessionToken && localStorage.getItem(DELTAS_PORTAL_UNLOCKED_KEY) === 'true') {
        enterPortalShellUI();
        return;
    }
    const modal = document.getElementById('landing-login-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeLandingLoginModal() {
    const modal = document.getElementById('landing-login-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function fillModalCredentials(email, password, uni) {
    const emailEl = document.getElementById('modal-login-email');
    const pwdEl = document.getElementById('modal-login-password');
    const uniEl = document.getElementById('modal-login-uni');
    if (emailEl) emailEl.value = email;
    if (pwdEl) pwdEl.value = password;
    if (uniEl) uniEl.value = uni;
}

async function authenticateAmbassador(email, password, uni) {
    const cleanEmail = (email || '').trim();
    const cleanUni = uni || 'UZ';
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                email: cleanEmail,
                password: password || '',
                university: cleanUni
            })
        });
        if (!res.ok) throw new Error('Auth status ' + res.status);
        const data = await res.json();
        return {
            session_token: data.session_token || '',
            user_id: data.user_id || 1,
            username: data.username || cleanEmail.split('@')[0],
            university: data.university || cleanUni,
            completed_modules: data.completed_modules,
            rsvp_event_ids: data.rsvp_event_ids,
            liked_story_ids: data.liked_story_ids
        };
    } catch (e) {
        // Fallback for offline or local session continuity
        return {
            session_token: '',
            user_id: 1,
            username: cleanEmail ? cleanEmail.split('@')[0] : 'ambassador',
            university: cleanUni
        };
    }
}

function enterPortalShellUI(scrollTop = true) {
    const landing = document.getElementById('landing-experience');
    const portal = document.getElementById('portal-app-shell');
    if (landing) landing.style.display = 'none';
    if (portal) portal.style.display = 'block';
    document.body.classList.remove('on-landing');

    initPortalSlideshow('outreach');
    if (scrollTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    loadOutreach('home');
}

function refreshActivePortalView() {
    const activeView = document.querySelector('.content-view.active');
    if (!activeView) return;
    if (activeView.id === 'view-outreach') {
        const activeTab = document.querySelector('#view-outreach .out-tab.active');
        if (!activeTab || activeTab.textContent.includes('SMART LIVING')) {
            loadOutreach('home');
        }
    } else if (activeView.id === 'view-events') {
        loadEvents(currentEventCategory);
    } else if (activeView.id === 'view-influence') {
        fetchGlobalPeerFeed();
    } else if (activeView.id === 'view-safespace-detail') {
        fetchPeerPosts();
    }
}

function unlockAndEnterPortal(authData) {
    applyServerUserState(authData);

    try {
        localStorage.setItem(DELTAS_PORTAL_UNLOCKED_KEY, 'true');
        sessionStorage.setItem(DELTAS_PORTAL_UNLOCKED_KEY, 'true');
    } catch (e) {}

    closeLandingLoginModal();
    enterPortalShellUI(true);
}

function showLandingExperience() {
    stopPortalSlideshow();
    const landing = document.getElementById('landing-experience');
    const portal = document.getElementById('portal-app-shell');
    if (portal) portal.style.display = 'none';
    if (landing) landing.style.display = 'block';
    document.body.classList.add('on-landing');
    window.scrollTo(0, 0);
}

function handleLogout() {
    stopPortalSlideshow();
    const tokenToRevoke = currentSessionToken;
    if (tokenToRevoke) {
        fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ session_token: tokenToRevoke }),
            keepalive: true
        }).catch(() => {});
    }

    clearClientSessionState();

    // Clear previous login feedback messages so the landing page login forms look fresh
    const modalFb = document.getElementById('modal-login-feedback');
    if (modalFb) modalFb.style.display = 'none';
    const inlineFb = document.getElementById('inline-login-feedback');
    if (inlineFb) inlineFb.style.display = 'none';
    const portalMsg = document.getElementById('login-message');
    if (portalMsg) portalMsg.style.display = 'none';

    showLandingExperience();
}

async function restoreServerSession() {
    if (!currentSessionToken) return null;
    try {
        const res = await fetch(`${API_BASE}/auth/session`, {
            headers: getAuthHeaders()
        });
        if (res.status === 401) {
            clearClientSessionState();
            showLandingExperience();
            return null;
        }
        if (!res.ok) return null;
        const data = await res.json();
        applyServerUserState(data);
        refreshActivePortalView();
        return data;
    } catch (e) {
        return null;
    }
}

async function quickDemoLogin(role = 'ambassador') {
    const email = role === 'coordinator' ? 'coordinator@nust.ac.zw' : 'ambassador@deltas.org.zw';
    const uni = role === 'coordinator' ? 'NUST' : 'UZ';
    const authData = await authenticateAmbassador(email, 'Deltas2026!', uni);
    unlockAndEnterPortal(authData);
}

async function submitPortalGateLogin(source = 'modal') {
    const isModal = source === 'modal';
    const emailEl = document.getElementById(isModal ? 'modal-login-email' : 'inline-login-email');
    const pwdEl = document.getElementById(isModal ? 'modal-login-password' : 'inline-login-password');
    const uniEl = document.getElementById(isModal ? 'modal-login-uni' : 'inline-login-uni');
    const fbEl = document.getElementById(isModal ? 'modal-login-feedback' : 'inline-login-feedback');

    const email = emailEl ? emailEl.value.trim() : '';
    const pwd = pwdEl ? pwdEl.value : '';
    const uni = uniEl ? uniEl.value : 'UZ';

    if (!email) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = 'var(--secondary-orange-dark)';
            fbEl.innerText = 'Please enter your email address.';
        }
        return;
    }

    if (!pwd) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = 'var(--secondary-orange-dark)';
            fbEl.innerText = 'Please enter your account password.';
        }
        return;
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = 'Authenticating with DELTAS Portal...';
    }

    const authData = await authenticateAmbassador(email, pwd, uni);
    if (fbEl) {
        fbEl.innerText = `✓ Welcome, ${authData.username}! Launching platform...`;
    }
    setTimeout(() => {
        unlockAndEnterPortal(authData);
    }, 350);
}

// -----------------------------------------
// Login / Ambassador Registration Logic (Inside Portal)
// -----------------------------------------
async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-password').value;
    const uni = document.getElementById('login-university') ? document.getElementById('login-university').value : 'UZ';
    const msg = document.getElementById('login-message');

    if (!email) {
        msg.innerText = "Please enter your email address.";
        msg.style.display = 'block';
        msg.style.color = 'red';
        return;
    }

    if (!pwd) {
        msg.innerText = "Please enter your password.";
        msg.style.display = 'block';
        msg.style.color = 'red';
        return;
    }

    const authData = await authenticateAmbassador(email, pwd, uni);
    msg.style.color = 'var(--accent-sage)';
    msg.innerText = `Welcome, Ambassador ${authData.username}! Redirecting...`;
    msg.style.display = 'block';

    setTimeout(() => {
        unlockAndEnterPortal(authData);
        switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view="outreach"]'));
    }, 600);
}

// -----------------------------------------
// Real-Student Background Videos (Permanently Muted Campus Media)
// -----------------------------------------
function initRadioStudioVideos() {
    const videoPlayers = document.querySelectorAll('.poster-video-player, .poster-theme-radio video, .poster-theme-support video');
    videoPlayers.forEach(video => {
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 0;
        video.playsInline = true;
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                // Autoplay may be restricted until first user interaction
                const onFirstTouch = () => {
                    video.muted = true;
                    video.play().catch(() => {});
                    document.removeEventListener('click', onFirstTouch);
                    document.removeEventListener('touchstart', onFirstTouch);
                };
                document.addEventListener('click', onFirstTouch, { once: true });
                document.addEventListener('touchstart', onFirstTouch, { once: true });
            });
        }
    });
}

// Initialize Landing Experience or Unlocked Portal on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    initLandingSlideshows();
    initPillarPosterSlideshow();
    initEventPosterSlideshow();
    initLandingScrollSpy();
    initRadioStudioVideos();

    loadSessionFromBrowserStorage();
    updateSessionUI();

    const isUnlocked = localStorage.getItem(DELTAS_PORTAL_UNLOCKED_KEY) === 'true'
        || sessionStorage.getItem(DELTAS_PORTAL_UNLOCKED_KEY) === 'true';

    // Keep portal unlocked across refreshes/reopens while an active session exists
    if (isUnlocked && (currentSessionToken || sessionStorage.getItem('currentUsername'))) {
        enterPortalShellUI(false);
    } else {
        showLandingExperience();
    }

    // Verify and hydrate session, modules, RSVPs, and story likes from Neon
    restoreServerSession();
});
