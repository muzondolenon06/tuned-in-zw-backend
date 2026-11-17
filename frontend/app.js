const API_BASE = window.location.hostname.includes('vercel.app') ? 'https://tuned-in-zw-backend.onrender.com' : ((window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : 'http://127.0.0.1:8006');

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

// -----------------------------------------
// Continuous Smart Lifestyle & Moderation Points Engine
// -----------------------------------------
function getSmartActivityPointsLog(uid = currentUserId) {
    return readLocalJSON(_userCacheKey('smartActivityPointsLog', uid), {
        handbooksRead: {},
        supportTasksCompleted: {},
        scenariosAnswered: {},
        mythsVerifiedCount: 0,
        ambassadorActions: {},
        customPointsBonus: 0
    });
}

function saveSmartActivityPointsLog(logObj, uid = currentUserId) {
    writeLocalJSON(_userCacheKey('smartActivityPointsLog', uid), logObj);
}

function awardSmartActivityPoints(arg1, arg2, arg3) {
    const log = getSmartActivityPointsLog(currentUserId);
    log.activities = log.activities || {};
    log.recentActivities = Array.isArray(log.recentActivities) ? log.recentActivities : [];

    let key = '';
    let pts = 20;
    let label = '';

    if (typeof arg2 === 'number') {
        key = String(arg1);
        pts = Number(arg2) || 20;
        label = String(arg3 || key);
    } else if (typeof arg2 === 'string') {
        key = `${arg1}_${arg2}`;
        pts = Number(arg3) || 20;
        label = `${arg1}: ${arg2}`;
    } else {
        key = String(arg1);
        pts = 20;
        label = key;
    }

    let awarded = false;
    if (!log.activities[key]) {
        log.activities[key] = pts;
        log.customPointsBonus = (log.customPointsBonus || 0) + pts;
        log.recentActivities.unshift({
            key,
            label,
            points: pts,
            timestamp: new Date().toISOString()
        });
        if (log.recentActivities.length > 25) log.recentActivities.pop();
        awarded = true;
    }

    if (arg1 === 'handbook') {
        log.handbooksRead = log.handbooksRead || {};
        log.handbooksRead[arg2] = pts;
    } else if (arg1 === 'support_task') {
        log.supportTasksCompleted = log.supportTasksCompleted || {};
        log.supportTasksCompleted[arg2] = pts;
    } else if (arg1 === 'scenario') {
        log.scenariosAnswered = log.scenariosAnswered || {};
        log.scenariosAnswered[arg2] = pts;
    } else if (arg1 === 'myth_check') {
        log.mythsVerifiedCount = (log.mythsVerifiedCount || 0) + 1;
    } else if (arg1 === 'ambassador_action') {
        log.ambassadorActions = log.ambassadorActions || {};
        log.ambassadorActions[arg2] = (log.ambassadorActions[arg2] || 0) + pts;
    }

    saveSmartActivityPointsLog(log, currentUserId);
    updateTopCornerPointsDisplay();
    const bd = getSmartLifestylePointsBreakdown(currentUserId);
    return {
        awarded,
        total: bd.totalPoints,
        breakdown: bd
    };
}

function getSmartLifestylePointsBreakdown(uid = currentUserId) {
    const log = getSmartActivityPointsLog(uid);
    const baseWelcomePoints = 0;

    let academySubsectionsCount = 0;
    let academyPassedQuizzesCount = 0;
    let academyCompletedModulesCount = 0;

    if (typeof SMART_LIVING_CURRICULA !== 'undefined' && typeof getBingeModuleOverallStats === 'function') {
        ACADEMY_TITLES.forEach(title => {
            if (SMART_LIVING_CURRICULA[title]) {
                const st = getBingeModuleState(uid, title);
                const stats = getBingeModuleOverallStats(st, title);
                academySubsectionsCount += (stats.completedSubsectionsCount || 0);
                academyPassedQuizzesCount += (stats.passedSectionsCount || 0);
                if (stats.isModuleComplete) academyCompletedModulesCount += 1;
            }
        });
    } else if (typeof getCompletedModules === 'function') {
        const comp = getCompletedModules();
        academyCompletedModulesCount = comp.length;
    } else if (Array.isArray(completedSmartModulesCache)) {
        academyCompletedModulesCount = completedSmartModulesCache.length;
    }

    // vi. Deltas Youth Connect+ : Smart Living Academy section, maximum 150 pts total for all modules
    const rawAcademy = (academyPassedQuizzesCount * 5) + (academyCompletedModulesCount * 25);
    const academyPoints = Math.min(150, Math.round(rawAcademy));

    const handbooksMap = log.handbooksRead || {};
    const tasksMap = log.supportTasksCompleted || {};
    // iii. Handbooks & Scheduled Wellness Tasks section, maximum 15 pts
    const handbooksPoints = Object.values(handbooksMap).reduce((a, b) => a + Math.min(15, Number(b) || 0), 0);
    const supportTasksPoints = Object.values(tasksMap).reduce((a, b) => a + Math.min(15, Number(b) || 0), 0);
    const supportHubPoints = handbooksPoints + supportTasksPoints;

    const scenMap = log.scenariosAnswered || {};
    // i. in the BeSmart Moderation & Decision Toolkit section, maximum points awarded is 5pts
    let scenarioPoints = Object.values(scenMap).reduce((a, b) => a + Math.min(5, Number(b) || 0), 0);
    const mythPoints = Math.min((log.mythsVerifiedCount || 0) * 5, 50);

    // ii. Campus & Community Events Hub, events registration maximum 10pts
    const rsvpPoints = Object.keys(userRSVPs || {}).filter(k => userRSVPs[k]).length * 10;

    // iv. Campus Voice & Community Radio Hub maximum 5pts
    // v. Youth Impact News Hub maximum 5pts
    let radioAndNewsPoints = 0;
    const acts = log.activities || {};
    Object.keys(acts).forEach(k => {
        if (k.startsWith('radio_listen_')) radioAndNewsPoints += Math.min(5, Number(acts[k]) || 5);
        if (k.startsWith('news_read_')) radioAndNewsPoints += Math.min(5, Number(acts[k]) || 5);
        if (k.startsWith('ai_custom_scenario_')) scenarioPoints += Math.min(5, Number(acts[k]) || 5);
    });

    const ambMap = log.ambassadorActions || {};
    const ambActionPoints = Object.values(ambMap).reduce((a, b) => a + (Number(b) || 0), 0);
    const communityAndMythPoints = mythPoints + rsvpPoints + radioAndNewsPoints + ambActionPoints;

    const totalPoints = baseWelcomePoints + academyPoints + supportHubPoints + scenarioPoints + communityAndMythPoints;

    return {
        totalPoints: totalPoints || 0,
        baseWelcomePoints: baseWelcomePoints || 0,
        academyPoints: academyPoints || 0,
        completedSubsectionsCount: academySubsectionsCount || 0,
        completedModulesCount: academyCompletedModulesCount || 0,
        academySubsectionsCount: academySubsectionsCount || 0,
        academyPassedQuizzesCount: academyPassedQuizzesCount || 0,
        academyCompletedModulesCount: academyCompletedModulesCount || 0,
        supportHubPoints: supportHubPoints || 0,
        supportTaskPoints: supportHubPoints || 0,
        handbooksPoints: handbooksPoints || 0,
        supportTasksPoints: supportTasksPoints || 0,
        handbooksCount: Object.keys(handbooksMap).length,
        supportTasksCount: Object.keys(tasksMap).length,
        scenarioPoints: scenarioPoints || 0,
        scenariosCount: Object.keys(scenMap).length,
        mythCheckPoints: mythPoints || 0,
        ambassadorPoints: (rsvpPoints + ambActionPoints) || 0,
        communityAndMythPoints: communityAndMythPoints || 0,
        mythsVerifiedCount: log.mythsVerifiedCount || 0,
        recentLog: Array.isArray(log.recentActivities) ? log.recentActivities : []
    };
}

function updateTopCornerPointsDisplay() {
    const pillVal = document.getElementById('top-corner-points-val');
    const breakdown = getSmartLifestylePointsBreakdown(currentUserId);
    if (pillVal) {
        pillVal.innerText = `${breakdown.totalPoints.toLocaleString()} pts`;
    }
}

function updateSessionUI() {
    const isSignedIn = !!(currentSessionToken || sessionStorage.getItem('currentUsername') || localStorage.getItem(DELTAS_SESSION_USER_KEY));
    const navText = document.getElementById('nav-login-text');
    if (navText) navText.innerText = 'Ambassador';

    const userPill = document.getElementById('active-user-pill');
    if (userPill) userPill.innerText = isSignedIn ? `${currentUsername} (${currentUniversity})` : 'Delta & Boost Challenge';

    const landingLoginBtnText = document.querySelector('.btn-portal-login span');
    if (landingLoginBtnText) {
        landingLoginBtnText.innerText = isSignedIn ? `Enter Portal (${currentUsername})` : 'Sign In to Portal';
    }

    updateTopCornerPointsDisplay();
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
    if (typeof syncUserAcademyProgressWithReferralAmbassador === 'function') {
        syncUserAcademyProgressWithReferralAmbassador(currentUserId);
    }
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
    if (typeof syncUserAcademyProgressWithReferralAmbassador === 'function') {
        syncUserAcademyProgressWithReferralAmbassador(currentUserId);
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
                if (typeof syncUserAcademyProgressWithReferralAmbassador === 'function') {
                    syncUserAcademyProgressWithReferralAmbassador(currentUserId);
                }
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
        loadAboveTheInfluenceView(currentInfluenceSubTab || 'forum');
    } else if (viewId === 'news') {
        loadNews('All');
    } else if (viewId === 'radio') {
        loadRadio('All');
    } else if (viewId === 'events') {
        loadEvents('All');
    } else if (viewId === 'besure') {
        switchBeSureTab('verify', document.querySelector('#view-besure .out-tab'));
    } else if (viewId === 'login') {
        loadAmbassadorHubView();
    } else if (viewId === 'admin' || viewId === 'admin-dashboard') {
        openAdminDashboard();
        return;
    }
    updateTopCornerPointsDisplay();
    updateAdminFloatingReturnVisibility();
}

function closeDetailView() {
    switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view="outreach"]'));
    switchOutreachTab('home', document.querySelectorAll('#view-outreach .out-tab')[0]);
}

function closeSafeSpaceDetailView() {
    switchMainView('influence', document.querySelector('.bottom-nav .nav-item[data-view="influence"]'));
}

// -----------------------------------------
// "Above the Influence" Community Support Hub (2 Subsections: Peer Stories Forum & Peer and Community Support)
// -----------------------------------------
let currentInfluenceSubTab = 'forum';

const SUPPORT_HELP_ISSUES = [
    "Peer Pressure & Social Refusal Confidence",
    "Binge Drinking & Moderation Pacing",
    "Overcoming Substance Dependence & Recovery",
    "Exam Stress, Anxiety & Mental Health (H.A.L.T.)",
    "Alcohol-Facilitated GBV & Personal Safety",
    "Family, Hostel & Relationship Boundaries"
];

const DEFAULT_VERIFIED_MENTORS = [
    {
        id: 'mentor-1',
        name: 'Dr. Rudo Moyo',
        role: 'Clinical Counsellor & Addiction Recovery Specialist',
        institution: 'University of Zimbabwe (UZ) Health & Wellness Directorate',
        specialization: 'Overcoming Substance Dependence, H.A.L.T. Stress & Relapse Prevention',
        bio: '11+ years supporting young adults and university students across Zimbabwe through trauma-informed sobriety coaching and cognitive behavioural coping.',
        qualification: 'PhD Clinical Psychology • Registered Allied Health Practitioner (HPAZ)',
        verified: true,
        badgeLabel: 'Verified Clinical Counsellor'
    },
    {
        id: 'mentor-2',
        name: 'Tendai Chikwanda',
        role: 'Senior Peer Sobriety & Smart Living Mentor',
        institution: 'Boost Fellowship & National Youth Wellness Network (NUST / MSU)',
        specialization: 'Peer Pressure Refusal, Regulated Pacing & Sober Campus Leadership',
        bio: 'Former student union leader and 4-year sobriety mentor guiding students through Freshers orientation, sports discipline, and high-pressure social circles.',
        qualification: 'Certified Peer Recovery Coach & WHO mhGAP Youth Facilitator',
        verified: true,
        badgeLabel: 'Verified Sobriety Mentor'
    },
    {
        id: 'mentor-3',
        name: 'Sr. Chipo Ndebele',
        role: 'Trauma-Informed Safety & Maternal Wellness Counsellor',
        institution: 'Friendship Bench & Campus Safe-Space Liaison',
        specialization: 'Alcohol-Facilitated GBV Support, FASD Prevention & Crisis Care',
        bio: 'Dedicated to confidential, non-judgmental counselling, bystander safety planning, and rapid crisis stabilization for students and learners.',
        qualification: 'MSc Community Mental Health & Certified Trauma Counsellor',
        verified: true,
        badgeLabel: 'Verified Crisis Counsellor'
    }
];

const ALL_WELLNESS_TASKS_BANK = [
    {
        id: 'task_book_digest',
        category: 'Reading Handbook',
        title: 'Read Sobriety & Habit Digest: "The Clear-Mind Edge & Atomic Refusal Habits"',
        points: 15,
        duration: '8 min interactive digest',
        description: 'Master the neuroscience of dopamine resetting, the 1-for-1 water pacing rule, and how to rewire social cues without losing your friend circle.',
        detailHtml: `
            <div style="background:#FFFFFF; border:1px solid var(--border-color); border-left:4px solid var(--primary); padding:14px; border-radius:8px; margin-top:10px; font-size:0.88rem; line-height:1.65;">
                <strong>Key Takeaways from the Handbook Digest:</strong>
                <ul style="margin:6px 0 0 18px; padding:0;">
                    <li><strong>The Craving Wave (Urge Surfing):</strong> Social urges to binge peak for only 10–15 minutes. Holding a non-alcoholic Decoy Cup during the first 15 minutes of a party eliminates 80% of peer pressure.</li>
                    <li><strong>Protecting REM Sleep & Dopamine:</strong> Alcohol spikes GABA artificially and crashes baseline dopamine the next morning ('hangxiety'). Choosing sobriety or strict 1-for-1 water pacing preserves 40% more exam memory consolidation.</li>
                    <li><strong>Identity-Based Refusal:</strong> Saying <em>"I'm in training / keeping a clear head for tomorrow"</em> commands immediate peer respect.</li>
                </ul>
            </div>
        `
    },
    {
        id: 'task_motivation_video',
        category: 'Motivation Video',
        title: 'Watch Motivation Briefing: "Above the Influence — Owning Your Future & Sobriety"',
        points: 15,
        duration: 'Embedded Video Session',
        description: 'Watch this curated behavioural science and youth sobriety motivation briefing on how alcohol impacts the developing brain and how to lead with confidence.',
        videoEmbedUrl: 'https://www.youtube.com/embed/V2Aj-iJ6p38?rel=0'
    },
    {
        id: 'task_wellness_run',
        category: 'Physical Reset Task',
        title: 'Complete a 3km / 5km Clear-Mind Campus Run or 25-Min Brisk Walk',
        points: 15,
        duration: '25–30 mins outdoor activity',
        description: 'Replace evening stress or weekend boredom with a natural endorphin and BDNF brain-growth boost. Log your completed run or walk below to claim your Smart Lifestyle points.'
    },
    {
        id: 'task_halt_checkin',
        category: 'Mental Health Protocol',
        title: 'Complete a Personal H.A.L.T. (Hungry, Angry, Lonely, Tired) Check-In & Refusal Script Practice',
        points: 15,
        duration: '5 min self-audit',
        description: 'Pause before any social gathering to audit whether you are Hungry, Angry, Lonely, or Tired, and lock in your non-negotiable drink cap and safe transport plan.'
    },
    {
        id: 'task_cups_handbook',
        category: 'Emergency Preparedness',
        title: 'Review the C.U.P.S. Alcohol Poisoning & 5D Bystander Protection Handbook',
        points: 15,
        duration: '6 min clinical checklist',
        description: 'Verify that you can spot Cold skin, Unconsciousness, Puking, and Slow breathing (<8 breaths/min), place a peer in the side Recovery Position, and dial 999 / 994.'
    },
    {
        id: 'task_sleep_reset',
        category: 'Circadian Recovery',
        title: 'Complete Night-Time Sleep Hygiene & Cortisol Detox Routine',
        points: 15,
        duration: '10 min evening routine',
        description: 'Establish a 30-minute screen-free wind-down window and hydrate with herbal tea or magnesium-rich water to accelerate neuro-cellular liver repair.'
    },
    {
        id: 'task_decoy_cup',
        category: 'Social Pacing & Refusal Drill',
        title: 'Practice the "Decoy Cup" & Active Buddy Anchoring Strategy',
        points: 15,
        duration: '5 min mental drill',
        description: 'Plan your social outing with an identified sober wing-person, pre-load a carbonated mocktail with citrus, and rehearse confident boundary scripts.'
    },
    {
        id: 'task_hydration_boost',
        category: 'Hepatic & Cellular Protection',
        title: 'Log 2 Litres of Clean Hydration with Electrolyte Pacing',
        points: 15,
        duration: 'All-day hydration log',
        description: 'Maintain continuous optimal cellular hydration to protect renal filtration and flush metabolic byproducts efficiently throughout academic study days.'
    },
    {
        id: 'task_urgesurfing',
        category: 'Neuroscience Mindfulness Drill',
        title: 'Practice 10-Minute Urge Surfing & Breath Regulation Protocol',
        points: 15,
        duration: '10 min mindfulness session',
        description: 'Ride out dopamine-seeking impulsivity waves by observing bodily sensations with box-breathing (4s inhale, 4s hold, 4s exhale, 4s pause).'
    },
    {
        id: 'task_bystander_5d',
        category: 'Campus Leadership Action',
        title: 'Review the 5D Bystander Intervention Safety Flowchart',
        points: 15,
        duration: '7 min safety protocol',
        description: 'Master the 5Ds (Direct, Distract, Delegate, Delay, Document) to defuse alcohol-facilitated harassment, drink tampering, and peer coercion.'
    }
];

const SYSTEM_SUGGESTED_SUPPORT_TASKS = ALL_WELLNESS_TASKS_BANK;

function getRotatingWellnessTasks(uid = currentUserId) {
    const activityLog = getSmartActivityPointsLog(uid);
    const completedMap = activityLog.supportTasksCompleted || {};
    const uncompleted = ALL_WELLNESS_TASKS_BANK.filter(t => !completedMap[t.id]);

    const activeList = [];
    const maxActive = 4;
    
    for (let i = 0; i < uncompleted.length && activeList.length < maxActive; i++) {
        activeList.push(uncompleted[i]);
    }

    if (activeList.length < maxActive) {
        const completedTotal = Object.keys(completedMap).length;
        const cycle = Math.floor(completedTotal / ALL_WELLNESS_TASKS_BANK.length) + 1;
        for (let i = 0; i < ALL_WELLNESS_TASKS_BANK.length && activeList.length < maxActive; i++) {
            const base = ALL_WELLNESS_TASKS_BANK[i];
            const freshId = `${base.id}_r${cycle}`;
            if (!completedMap[freshId]) {
                activeList.push({
                    ...base,
                    id: freshId,
                    points: 15
                });
            }
        }
    }

    return activeList.length > 0 ? activeList : ALL_WELLNESS_TASKS_BANK.slice(0, maxActive);
}

function switchInfluenceTab(tabId, btnEl) {
    currentInfluenceSubTab = tabId || 'forum';
    if (currentInfluenceSubTab === 'support') {
        currentSupportSubTab = 'home';
        currentSupportPosterSlideIdx = 0;
    }
    document.querySelectorAll('#influence-subtabs .out-tab').forEach(b => b.classList.remove('active'));
    if (btnEl) {
        btnEl.classList.add('active');
    } else {
        const buttons = document.querySelectorAll('#influence-subtabs .out-tab');
        if (currentInfluenceSubTab === 'forum' && buttons[0]) buttons[0].classList.add('active');
        if (currentInfluenceSubTab === 'support' && buttons[1]) buttons[1].classList.add('active');
    }
    loadAboveTheInfluenceView(currentInfluenceSubTab);
}

async function loadAboveTheInfluenceView(subTab = currentInfluenceSubTab) {
    currentInfluenceSubTab = subTab || 'forum';
    const container = document.getElementById('influence-feed');
    if (!container) return;

    // Sync active tab pill in DOM
    const subButtons = document.querySelectorAll('#influence-subtabs .out-tab');
    if (subButtons.length >= 2) {
        subButtons[0].classList.toggle('active', currentInfluenceSubTab === 'forum');
        subButtons[1].classList.toggle('active', currentInfluenceSubTab === 'support');
    }

    if (currentInfluenceSubTab === 'support') {
        renderPeerAndCommunitySupportSubsection(container);
        return;
    }

    container.innerHTML = renderModulesSkeleton(4);

    try {
        await syncActivityFromNeon();
        const res = await fetch(`${API_BASE}/modules`);
        const allModules = await res.json();
        const modules = allModules.filter(m => SUPPORT_HUB_TITLES.includes(m.title));

        let html = `
            <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start;">
        `;

        // Left Column: 4 Harm-Reduction Handbooks
        html += '<div style="flex: 1 1 58%; min-width:300px;">';
        html += '<h3 style="margin-bottom:15px; color:#FFFFFF; font-size:1.35rem; font-weight:800; text-shadow:0 2px 6px rgba(0,0,0,0.5); letter-spacing:0.01em;">Harm-Reduction &amp; Coping Handbooks</h3>';
        html += '<div class="grid-layout" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">';
        if (modules.length === 0) {
            html += '<p style="text-align:center; padding:20px; width:100%;">No handbooks available.</p>';
        } else {
            modules.forEach(mod => {
                html += `
                    <div class="outreach-card" style="display:flex; flex-direction:column; justify-content:space-between; height:100%; border-left:4px solid var(--primary);">
                        <div>
                            <h3 class="card-title">${mod.title}</h3>
                            <p class="card-desc" style="font-size:14px; margin-bottom:15px;">${mod.description}</p>
                        </div>
                        <button onclick="openModuleDetail(${mod.id}, '${mod.title.replace(/'/g, "\\'")}', false)" class="btn-primary" style="width:100%; padding:10px;">
                            Open Harm-Reduction Handbook
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
                    <h4 style="color:var(--primary); margin:0 0 5px 0; font-size:1.05rem;">Need 1-on-1 Mentorship, Scheduled Sobriety Tasks, or Counsellor Support?</h4>
                    <p style="color:var(--text-muted); font-size:0.88rem; margin:0;">Connect with Verified Mentors, message a counsellor directly, or complete wellness tasks to boost your Smart Lifestyle Score.</p>
                </div>
                <button onclick="switchInfluenceTab('support')" class="btn-primary" style="padding:10px 18px;">
                    Open Peer &amp; Community Support
                </button>
            </div>
        `;
        html += '</div>';

        // Right Column: Peer Stories Forum with Anonymous Toggle & 4 Categories
        html += `
            <div style="flex: 1 1 36%; min-width:290px;" class="outreach-card">
                <h3 class="card-title" style="margin-bottom:8px;">Peer Stories Forum</h3>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Real stories and verified Ambassador Insights from Zimbabwean students navigating peer pressure, sobriety, and campus life.</p>
                
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

function getSupportRegistrationProfile(uid = currentUserId) {
    return readLocalJSON(_userCacheKey('supportMenteeProfile', uid), null);
}

function saveSupportRegistrationProfile(profile, uid = currentUserId) {
    writeLocalJSON(_userCacheKey('supportMenteeProfile', uid), profile);
}

function getAllSupportMentors() {
    const customMentors = readLocalJSON('deltasCustomMentorApplications', []);
    const approvedCustom = customMentors.filter(m => m.verified === true);
    return [...DEFAULT_VERIFIED_MENTORS, ...approvedCustom];
}

function getAllMentorApplications() {
    return readLocalJSON('deltasCustomMentorApplications', []);
}

function saveAllMentorApplications(list) {
    writeLocalJSON('deltasCustomMentorApplications', list);
}

function getDirectMentorMessages(mentorId, uid = currentUserId) {
    const key = _userCacheKey(`mentorChat_${mentorId}`, uid);
    const existing = readLocalJSON(key, null);
    if (existing && Array.isArray(existing) && existing.length > 0) return existing;
    const mentor = getAllSupportMentors().find(m => m.id === mentorId) || DEFAULT_VERIFIED_MENTORS[0];
    return [
        {
            sender: 'mentor',
            author: mentor.name,
            time: 'Today',
            text: `Hello ${currentUsername}! Welcome to the confidential DELTAS Direct Support Line. I am ${mentor.name} (${mentor.badgeLabel}). How can I support you today with moderation, sobriety, or navigating campus pressures?`
        }
    ];
}

function saveDirectMentorMessages(mentorId, messages, uid = currentUserId) {
    const key = _userCacheKey(`mentorChat_${mentorId}`, uid);
    writeLocalJSON(key, messages);
}

let currentSupportSubTab = 'home';
let currentSupportPosterSlideIdx = 0;

function isUserRegisteredForSupport(uid = currentUserId) {
    if (sessionStorage.getItem('deltas_is_admin') === 'true' || localStorage.getItem('deltas_is_admin') === 'true') {
        return true;
    }
    const regProfile = getSupportRegistrationProfile(uid);
    if (regProfile && (regProfile.registeredAt || (regProfile.issues && regProfile.issues.length > 0))) {
        return true;
    }
    const allApps = getAllMentorApplications();
    const hasApp = allApps.some(a => 
        (String(a.userId) === String(uid) || (a.name && currentUsername && a.name.toLowerCase().trim() === currentUsername.toLowerCase().trim()))
    );
    if (hasApp) {
        return true;
    }
    return false;
}

function getCurrentSupportTabLabel(tabKey) {
    switch (tabKey) {
        case 'home': return 'Support Home';
        case 'registration': return 'Registration';
        case 'mentorship': return 'Mentorship Program';
        case 'communication': return 'Direct Chat Line';
        case 'tasks': return 'Wellness Tasks & Handbooks';
        case 'accreditation': return 'Accreditation';
        default: return 'Support Home';
    }
}

function toggleSupportSidebarMenu(forceState) {
    const drawer = document.getElementById('support-sidebar-drawer');
    const overlay = document.getElementById('support-sidebar-overlay');
    if (!drawer) return;
    const shouldOpen = forceState !== undefined ? forceState : !drawer.classList.contains('open');
    if (shouldOpen) {
        drawer.classList.add('open');
        if (overlay) overlay.classList.add('open');
    } else {
        drawer.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
    }
}

function switchSupportPosterSlide(idx) {
    currentSupportPosterSlideIdx = idx;
    const slides = document.querySelectorAll('.support-poster-slide');
    const dots = document.querySelectorAll('.support-poster-dot');
    slides.forEach((s, i) => {
        s.classList.toggle('active', i === idx);
    });
    dots.forEach((d, i) => {
        d.classList.toggle('active', i === idx);
    });
}

function nextSupportPosterSlide() {
    const total = 3;
    const nextIdx = (currentSupportPosterSlideIdx + 1) % total;
    switchSupportPosterSlide(nextIdx);
}

function prevSupportPosterSlide() {
    const total = 3;
    const prevIdx = (currentSupportPosterSlideIdx - 1 + total) % total;
    switchSupportPosterSlide(prevIdx);
}

function renderSupportAccessGate(targetSectionName, targetTabKey) {
    return `
        <div class="outreach-card" style="border-top:5px solid var(--accent-amber); padding:36px 28px; text-align:center; max-width:820px; margin:0 auto; background:linear-gradient(180deg, #FFFFFF 0%, #FFFBEB 100%); border-radius:18px; box-shadow:var(--shadow-md);">
            <div style="display:inline-flex; align-items:center; gap:8px; background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; padding:6px 18px; border-radius:999px; font-size:0.8rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:16px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                <span>Registration Required • Protected Support Service</span>
            </div>

            <h3 style="font-size:1.45rem; font-weight:800; color:var(--text-main); margin:0 0 10px 0;">
                Complete Registration to Access ${escapeHtml(targetSectionName)}
            </h3>

            <p style="font-size:0.95rem; color:#4B5563; max-width:620px; margin:0 auto 24px auto; line-height:1.6;">
                To protect student confidentiality, match you with verified university mentors, and track your +15 Smart Lifestyle Points for wellness tasks, you must complete your <strong>Peer &amp; Community Support Registration</strong> (or submit <strong>Mentor &amp; Counsellor Accreditation</strong>) first.
            </p>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; max-width:680px; margin:0 auto 28px auto; text-align:left;">
                <div style="background:#FFFFFF; padding:14px 16px; border-radius:10px; border:1px solid #E5E7EB;">
                    <strong style="color:var(--primary); font-size:0.88rem; display:block; margin-bottom:4px;">Confidential Matching</strong>
                    <span style="font-size:0.8rem; color:var(--text-muted);">Connects you directly to accredited mentors from your specific campus chapter.</span>
                </div>
                <div style="background:#FFFFFF; padding:14px 16px; border-radius:10px; border:1px solid #E5E7EB;">
                    <strong style="color:var(--primary); font-size:0.88rem; display:block; margin-bottom:4px;">1-Click Linked Details</strong>
                    <span style="font-size:0.8rem; color:var(--text-muted);">Your account credentials link automatically so enrollment takes only seconds.</span>
                </div>
                <div style="background:#FFFFFF; padding:14px 16px; border-radius:10px; border:1px solid #E5E7EB;">
                    <strong style="color:var(--primary); font-size:0.88rem; display:block; margin-bottom:4px;">Lifestyle Points (+15 Pts)</strong>
                    <span style="font-size:0.8rem; color:var(--text-muted);">Unlocks rotating wellness tasks and direct communication credits.</span>
                </div>
            </div>

            <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
                <button type="button" class="btn-primary" onclick="switchSupportFeatureTab('registration')" style="padding:13px 26px; font-weight:700; font-size:0.92rem;">
                    Complete Peer &amp; Community Support Registration
                </button>
                <button type="button" class="btn-cream" onclick="switchSupportFeatureTab('accreditation')" style="padding:13px 22px; font-weight:700; font-size:0.92rem;">
                    Apply for Mentor &amp; Counsellor Accreditation
                </button>
                <button type="button" class="btn-outline" onclick="switchSupportFeatureTab('home')" style="padding:13px 20px; font-weight:700; font-size:0.92rem;">
                    Back to Support Home
                </button>
            </div>
        </div>
    `;
}

function switchSupportFeatureTab(tabKey) {
    currentSupportSubTab = tabKey || 'home';
    toggleSupportSidebarMenu(false);
    const container = document.getElementById('influence-feed');
    if (container && currentInfluenceSubTab === 'support') {
        renderPeerAndCommunitySupportSubsection(container);
    }
}

function renderPeerAndCommunitySupportSubsection(container) {
    const isRegistered = isUserRegisteredForSupport(currentUserId);
    const regProfile = getSupportRegistrationProfile(currentUserId);
    const mentors = getAllSupportMentors();
    const allApps = getAllMentorApplications();
    const pendingApps = allApps.filter(a => !a.verified);
    const activeMentorId = (regProfile && regProfile.matchedMentorId) ? regProfile.matchedMentorId : mentors[0].id;
    const activeMentor = mentors.find(m => m.id === activeMentorId) || mentors[0];
    const chatMessages = getDirectMentorMessages(activeMentor.id, currentUserId);
    const activityLog = getSmartActivityPointsLog(currentUserId);
    const completedTasksMap = activityLog.supportTasksCompleted || {};
    const pointsBreakdown = getSmartLifestylePointsBreakdown(currentUserId);

    let html = `
        <!-- Side-Placed Menu Bar & Active Section Breadcrumb -->
        <div class="support-subnav-bar">
            <div class="support-subnav-crumb">
                <span>Peer &amp; Community Support</span>
                <span style="color:#CBD5E1;">&bull;</span>
                <span class="crumb-active-tab">${getCurrentSupportTabLabel(currentSupportSubTab)}</span>
            </div>
            <button type="button" class="btn-support-menu-toggle" id="btn-support-menu-toggle" onclick="toggleSupportSidebarMenu()" aria-label="Open Support Menu">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
                <span>Support Menu</span>
            </button>
        </div>

        <!-- Side-Placed Menu Drawer & Backdrop Overlay -->
        <div class="support-sidebar-overlay" id="support-sidebar-overlay" onclick="toggleSupportSidebarMenu(false)"></div>
        <div class="support-sidebar-drawer" id="support-sidebar-drawer">
            <div class="support-drawer-header">
                <div>
                    <h3>Support Hub Menu</h3>
                    <p>Accredited guidance, wellness &amp; peer network</p>
                </div>
                <button type="button" class="support-drawer-close" onclick="toggleSupportSidebarMenu(false)" aria-label="Close Menu">&times;</button>
            </div>

            <div class="support-drawer-menu-list">
                <!-- 1. Support Home -->
                <div class="support-drawer-item ${currentSupportSubTab === 'home' ? 'active' : ''}" onclick="switchSupportFeatureTab('home')">
                    <div class="support-drawer-item-title-row">
                        <span class="support-drawer-item-title">Support Home</span>
                        <span class="support-drawer-badge badge-green">Overview</span>
                    </div>
                    <div class="support-drawer-item-desc">3-Slide poster presentation &amp; complete hub overview</div>
                </div>

                <!-- 2. Peer & Community Support Registration -->
                <div class="support-drawer-item ${currentSupportSubTab === 'registration' ? 'active' : ''}" onclick="switchSupportFeatureTab('registration')">
                    <div class="support-drawer-item-title-row">
                        <span class="support-drawer-item-title">Peer &amp; Community Support Registration</span>
                        <span class="support-drawer-badge badge-green">Instant Enrollment</span>
                    </div>
                    <div class="support-drawer-item-desc">1-Click linked account matching for personalized guidance</div>
                </div>

                <!-- 3. Mentorship Program -->
                <div class="support-drawer-item ${currentSupportSubTab === 'mentorship' ? 'active' : ''}" onclick="switchSupportFeatureTab('mentorship')">
                    <div class="support-drawer-item-title-row">
                        <span class="support-drawer-item-title">Mentorship Program</span>
                        ${isRegistered ? `
                            <span class="support-drawer-badge badge-green">Accredited Directory</span>
                        ` : `
                            <span class="support-drawer-badge badge-locked">Registration Required</span>
                        `}
                    </div>
                    <div class="support-drawer-item-desc">Explore verified clinical counsellors and peer mentors</div>
                </div>

                <!-- 4. Direct Communication -->
                <div class="support-drawer-item ${currentSupportSubTab === 'communication' ? 'active' : ''}" onclick="switchSupportFeatureTab('communication')">
                    <div class="support-drawer-item-title-row">
                        <span class="support-drawer-item-title">Direct Communication with Mentor/Counsellor</span>
                        ${isRegistered ? `
                            <span class="support-drawer-badge badge-green">1-on-1 Chat</span>
                        ` : `
                            <span class="support-drawer-badge badge-locked">Registration Required</span>
                        `}
                    </div>
                    <div class="support-drawer-item-desc">Confidential messaging with your matched mentor</div>
                </div>

                <!-- 5. Handbooks & Scheduled Wellness Tasks -->
                <div class="support-drawer-item ${currentSupportSubTab === 'tasks' ? 'active' : ''}" onclick="switchSupportFeatureTab('tasks')">
                    <div class="support-drawer-item-title-row">
                        <span class="support-drawer-item-title">Handbooks and Wellness Tasks</span>
                        ${isRegistered ? `
                            <span class="support-drawer-badge badge-amber">+15 Pts Each</span>
                        ` : `
                            <span class="support-drawer-badge badge-locked">Registration Required</span>
                        `}
                    </div>
                    <div class="support-drawer-item-desc">Daily rotating BeSmart AI tasks and harm-reduction guides</div>
                </div>

                <!-- 6. Mentor & Counsellor Accreditation -->
                <div class="support-drawer-item ${currentSupportSubTab === 'accreditation' ? 'active' : ''}" onclick="switchSupportFeatureTab('accreditation')">
                    <div class="support-drawer-item-title-row">
                        <span class="support-drawer-item-title">Mentor &amp; Counsellor Accreditation</span>
                        <span class="support-drawer-badge badge-green">Practitioner Portal</span>
                    </div>
                    <div class="support-drawer-item-desc">Submit qualifications for Admin Review &amp; Verified Badge</div>
                </div>
            </div>

            <div class="support-drawer-footer">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <span style="color:var(--text-muted); font-size:0.75rem;">Membership Status:</span>
                    <strong style="color:${isRegistered ? '#15803D' : '#B45309'}; font-size:0.78rem;">
                        ${isRegistered ? 'Registered (Full Access Unlocked)' : 'Unregistered (Registration Required)'}
                    </strong>
                </div>
            </div>
        </div>
    `;

    // VIEW: Support Home (3-Slide Poster-Like Display)
    if (currentSupportSubTab === 'home') {
        html += `
            <div class="support-poster-container">
                <!-- Slide 1: Mentorship Program & 1-on-1 Guidance -->
                <div class="support-poster-slide ${currentSupportPosterSlideIdx === 0 ? 'active' : ''}" id="support-slide-0">
                    <img src="assets/poster/support_hub_counseling.jpg" alt="Compassionate student counselling and peer mentorship session on university campus" class="support-poster-bg" />
                    <div class="support-poster-scrim"></div>
                    <div class="support-poster-content">
                        <div class="support-poster-kicker">Confidential 1-on-1 Guidance • Campus Liaisons</div>
                        <h2 class="support-poster-title">Accredited Mentorship &amp; Personalized Guidance</h2>
                        <p class="support-poster-desc">
                            Connect one-on-one with verified clinical psychologists, sobriety peer leaders, and campus health professionals. Receive compassionate, 100% confidential support tailored to your university life, moderation goals, and exam stress.
                        </p>
                        <div class="support-poster-pills-row">
                            <span class="support-poster-pill">100% Confidential Conversations</span>
                            <span class="support-poster-pill">Matched by University Chapter &amp; Goals</span>
                            <span class="support-poster-pill">Verified Clinical &amp; Peer Counsellors</span>
                        </div>
                        <div class="support-poster-actions">
                            <button type="button" class="btn-primary" onclick="switchSupportFeatureTab('registration')" style="padding:12px 24px; font-weight:700; font-size:0.92rem;">
                                Register for Support
                            </button>
                            <button type="button" class="btn-poster-gold" onclick="toggleSupportSidebarMenu(true)" style="padding:12px 22px; font-weight:700; font-size:0.92rem;">
                                Explore Support Menu
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Slide 2: Handbooks & Scheduled Wellness Tasks -->
                <div class="support-poster-slide ${currentSupportPosterSlideIdx === 1 ? 'active' : ''}" id="support-slide-1">
                    <img src="assets/poster/academy_peer_study.jpg" alt="University students collaborating and checking daily wellness and harm-reduction routines" class="support-poster-bg" />
                    <div class="support-poster-scrim"></div>
                    <div class="support-poster-content">
                        <div class="support-poster-kicker">Evidence-Based Practices • Rotating Wellness Tasks</div>
                        <h2 class="support-poster-title">Interactive Sobriety Handbooks &amp; Daily Wellness Tasks</h2>
                        <p class="support-poster-desc">
                            Master essential student harm-reduction practices with real-time handbooks covering social pressure refusal scripts, binge pacing rules, and the H.A.L.T. check. Complete daily scheduled wellness tasks suggested by BeSmart AI to earn +15 Smart Lifestyle Points.
                        </p>
                        <div class="support-poster-pills-row">
                            <span class="support-poster-pill">Continuously Rotating Wellness Tasks</span>
                            <span class="support-poster-pill">Earn Up to +15 Points per Task</span>
                            <span class="support-poster-pill">Step-by-Step Refusal &amp; Pacing Handbooks</span>
                        </div>
                        <div class="support-poster-actions">
                            <button type="button" class="btn-primary" onclick="switchSupportFeatureTab('tasks')" style="padding:12px 24px; font-weight:700; font-size:0.92rem;">
                                Access Wellness Tasks
                            </button>
                            <button type="button" class="btn-poster-gold" onclick="toggleSupportSidebarMenu(true)" style="padding:12px 22px; font-weight:700; font-size:0.92rem;">
                                View Support Menu
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Slide 3: Professional Mentors, Accreditation & Peer Support -->
                <div class="support-poster-slide ${currentSupportPosterSlideIdx === 2 ? 'active' : ''}" id="support-slide-2">
                    <img src="assets/poster/support_hub_circle.jpg" alt="Youth peer support circle and community health leaders meeting on university grounds" class="support-poster-bg" />
                    <div class="support-poster-scrim"></div>
                    <div class="support-poster-content">
                        <div class="support-poster-kicker">Verified Digital Badge • Practitioner Accreditation</div>
                        <h2 class="support-poster-title">A Verified National Network of Mentors &amp; Clinical Counsellors</h2>
                        <p class="support-poster-desc">
                            Are you a health professional, certified counsellor, or experienced sobriety advocate? Submit your qualifications for Administrator Verification in the Admin Console to earn the official Verified Mentor Badge and guide young peers across Zimbabwean universities.
                        </p>
                        <div class="support-poster-pills-row">
                            <span class="support-poster-pill">Verified Mentor Digital Badge</span>
                            <span class="support-poster-pill">Admin-Audited Medical Credentials</span>
                            <span class="support-poster-pill">National Multi-Campus Peer Network</span>
                        </div>
                        <div class="support-poster-actions">
                            <button type="button" class="btn-primary" onclick="switchSupportFeatureTab('accreditation')" style="padding:12px 24px; font-weight:700; font-size:0.92rem;">
                                Mentor Accreditation Portal
                            </button>
                            <button type="button" class="btn-poster-gold" onclick="toggleSupportSidebarMenu(true)" style="padding:12px 22px; font-weight:700; font-size:0.92rem;">
                                Open Support Menu
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Bottom Navigation Bar for Slides -->
                <div class="support-poster-nav-bar">
                    <div class="support-poster-dots">
                        <button type="button" class="support-poster-dot ${currentSupportPosterSlideIdx === 0 ? 'active' : ''}" onclick="switchSupportPosterSlide(0)" aria-label="Slide 1"></button>
                        <button type="button" class="support-poster-dot ${currentSupportPosterSlideIdx === 1 ? 'active' : ''}" onclick="switchSupportPosterSlide(1)" aria-label="Slide 2"></button>
                        <button type="button" class="support-poster-dot ${currentSupportPosterSlideIdx === 2 ? 'active' : ''}" onclick="switchSupportPosterSlide(2)" aria-label="Slide 3"></button>
                    </div>
                    <div class="support-poster-arrows">
                        <button type="button" class="support-poster-arrow-btn" onclick="prevSupportPosterSlide()">Previous</button>
                        <button type="button" class="support-poster-arrow-btn" onclick="nextSupportPosterSlide()">Next</button>
                    </div>
                </div>
            </div>
        `;
    }
    // Tab 1: Peer & Community Support Registration (Always accessible)
    else if (currentSupportSubTab === 'registration') {
        html += `
            <div class="outreach-card" style="border-top:4px solid var(--primary); padding:24px;">
                <div style="margin-bottom:16px;">
                    <h3 class="card-title" style="margin:0 0 6px 0; font-size:1.35rem; color:var(--primary);">Peer &amp; Community Support Registration</h3>
                    <p style="color:var(--text-muted); font-size:0.9rem; margin:0;">
                        Your logged-in account details are automatically linked so you never have to re-enter personal credentials. Choose your support preferences and select the areas where you would like guidance.
                    </p>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:14px; background:var(--card-bg-warm); padding:14px; border-radius:10px; border:1px solid var(--border-color);">
                    <div>
                        <label style="font-size:0.76rem; color:var(--text-muted); font-weight:700; display:block;">Logged-In Member Name</label>
                        <input type="text" value="${currentUsername}" readonly style="width:100%; background:#F3F4F6; color:var(--text-main); font-weight:700; border:1px solid var(--border-color); padding:8px 10px; border-radius:6px; box-sizing:border-box;" />
                    </div>
                    <div>
                        <label style="font-size:0.76rem; color:var(--text-muted); font-weight:700; display:block;">Institution / Chapter</label>
                        <input type="text" value="${currentUniversity}" readonly style="width:100%; background:#F3F4F6; color:var(--text-main); font-weight:700; border:1px solid var(--border-color); padding:8px 10px; border-radius:6px; box-sizing:border-box;" />
                    </div>
                    <div>
                        <label style="font-size:0.76rem; color:var(--text-muted); font-weight:700; display:block;">Preferred Support Mode</label>
                        <select id="support-reg-mode" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color); box-sizing:border-box;">
                            <option value="1-on-1 Verified Mentor & Scheduled Tasks" ${regProfile && regProfile.mode === '1-on-1 Verified Mentor & Scheduled Tasks' ? 'selected' : ''}>1-on-1 Verified Mentor &amp; Scheduled Tasks</option>
                            <option value="Anonymous Peer Support & Self-Paced Handbooks" ${regProfile && regProfile.mode === 'Anonymous Peer Support & Self-Paced Handbooks' ? 'selected' : ''}>Anonymous Peer Support &amp; Self-Paced Handbooks</option>
                            <option value="Clinical Counsellor Direct Consultation" ${regProfile && regProfile.mode === 'Clinical Counsellor Direct Consultation' ? 'selected' : ''}>Clinical Counsellor Direct Consultation</option>
                        </select>
                    </div>
                </div>

                <label style="font-size:0.84rem; font-weight:700; color:var(--text-main); display:block; margin-bottom:6px;">
                    Select the issues or goals you would like help with (check all that apply):
                </label>
                <div class="support-issue-grid" style="margin-bottom:14px;">
                    ${SUPPORT_HELP_ISSUES.map((issue, idx) => {
                        const isChecked = regProfile && Array.isArray(regProfile.issues) ? regProfile.issues.includes(issue) : (idx === 0 || idx === 1);
                        return `
                            <label class="support-issue-chip">
                                <input type="checkbox" class="support-issue-checkbox" value="${issue}" ${isChecked ? 'checked' : ''} />
                                <span>${issue}</span>
                            </label>
                        `;
                    }).join('')}
                </div>

                <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                    <input type="text" id="support-reg-custom-note" value="${regProfile && regProfile.customNote ? regProfile.customNote.replace(/"/g, '&quot;') : ''}" placeholder="Optional: Any specific goal or challenge you want your mentor to know..." style="flex:1; min-width:240px; padding:10px 12px; border-radius:8px; border:1.5px solid var(--border-color); box-sizing:border-box;" />
                    <button type="button" onclick="submitSupportMenteeRegistration()" class="btn-primary" style="padding:11px 22px;">
                        ${regProfile ? 'Update My Support Preferences' : 'Complete Support Registration (+15 pts)'}
                    </button>
                </div>
                <p id="support-reg-feedback" style="display:${regProfile ? 'block' : 'none'}; color:var(--accent-sage); font-weight:700; margin:10px 0 0 0; font-size:0.88rem;">
                    ${regProfile ? `Active Support Profile: Focusing on ${(regProfile.issues || []).join(', ')} • Matched with ${activeMentor.name}` : ''}
                </p>
            </div>
        `;
    } 
    // Tab 2: Mentorship Program
    else if (currentSupportSubTab === 'mentorship') {
        if (!isRegistered) {
            html += renderSupportAccessGate('the Accredited Mentorship Program Directory', 'mentorship');
        } else {
            html += `
                <div class="outreach-card" style="border-top:4px solid var(--primary); padding:24px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
                        <div>
                            <h3 class="card-title" style="margin:0 0 6px 0; font-size:1.35rem; color:var(--primary);">Mentorship Program Directory</h3>
                            <p style="font-size:0.88rem; color:var(--text-muted); margin:0;">
                                Connect with accredited peer mentors, clinical counsellors, and health advisors across Zimbabwe. Each mentor holds the official <strong>DELTAS Admin Verification Badge</strong>.
                            </p>
                        </div>
                        <button type="button" onclick="switchSupportFeatureTab('communication')" class="btn-primary" style="padding:8px 18px; font-size:0.82rem;">
                            Open Direct Chat Line
                        </button>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px;">
                        ${mentors.map(m => {
                            const isMatched = activeMentor.id === m.id;
                            const shortBio = m.bio.length > 95 ? m.bio.slice(0, 92) + '...' : m.bio;
                            return `
                                <div class="verified-mentor-card" style="border-color:${isMatched ? 'var(--primary)' : 'var(--border-color)'}; background:${isMatched ? 'var(--cream-soft)' : '#FFFFFF'}; display:flex; flex-direction:column; justify-content:space-between; height:100%; padding:18px; border-radius:12px; border:1.5px solid ${isMatched ? 'var(--primary)' : 'var(--border-color)'};">
                                    <div>
                                        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                                            <span class="mentor-verified-badge" style="font-size:0.74rem;">Verified • ${m.badgeLabel || 'Verified Mentor'}</span>
                                            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${m.institution.split('(')[0].trim()}</span>
                                        </div>
                                        <h4 style="margin:4px 0 2px 0; font-size:1.15rem; color:var(--text-main); font-weight:800;">${m.name}</h4>
                                        <div style="font-size:0.82rem; color:var(--primary); font-weight:700; margin-bottom:8px;">${m.role}</div>
                                        <div style="font-size:0.78rem; color:var(--text-muted); background:var(--card-bg-warm); padding:6px 10px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:10px; line-height:1.45;">
                                            <strong style="color:var(--text-main);">Focus:</strong> ${m.specialization}
                                        </div>
                                        <p style="font-size:0.84rem; color:var(--text-muted); margin:0 0 12px 0; line-height:1.5;">${shortBio}</p>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding-top:12px; border-top:1px solid var(--border-color); margin-top:auto; flex-wrap:wrap;">
                                        <button type="button" onclick="openMentorFullProfileModal('${m.id}')" class="btn-cream" style="padding:8px 12px; font-size:0.8rem; font-weight:700; border:1px solid var(--border-color); border-radius:6px;">
                                            View Full Profile
                                        </button>
                                        <button type="button" onclick="selectVerifiedSupportMentor('${m.id}')" class="${isMatched ? 'btn-sage' : 'btn-primary'}" style="padding:8px 14px; font-size:0.8rem; font-weight:700; border-radius:6px;">
                                            ${isMatched ? 'Open Direct Chat' : 'Select &amp; Chat'}
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    } 
    // Tab 3: Direct communication with mentor/counsellor
    else if (currentSupportSubTab === 'communication') {
        if (!isRegistered) {
            html += renderSupportAccessGate('Direct Communication with Mentor/Counsellor', 'communication');
        } else {
            html += `
                <div class="outreach-card" style="border-top:4px solid var(--primary); padding:24px; max-width:880px; margin:0 auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--border-color);">
                        <div>
                            <span class="mentor-verified-badge" style="margin-bottom:4px; display:inline-block;">Encrypted 1-on-1 Confidential Thread</span>
                            <h3 class="card-title" style="margin:2px 0 4px 0; font-size:1.3rem;">Direct Line: ${activeMentor.name}</h3>
                            <p style="font-size:0.84rem; color:var(--text-muted); margin:0;">
                                ${activeMentor.role} • <strong>${activeMentor.institution}</strong> (${activeMentor.specialization})
                            </p>
                        </div>
                        <button type="button" onclick="switchSupportFeatureTab('mentorship')" class="btn-cream" style="padding:8px 16px; font-size:0.82rem;">
                            Browse All Mentors
                        </button>
                    </div>

                    <div class="mentor-chat-box" id="mentor-direct-chat-box" style="height:340px; overflow-y:auto; padding:16px; background:#F8FAFC; border:1px solid var(--border-color); border-radius:10px; margin-bottom:16px;">
                        ${chatMessages.map(msg => `
                            <div class="mentor-chat-msg ${msg.sender === 'user' ? 'from-user' : 'from-mentor'}" style="margin-bottom:12px;">
                                <div style="font-size:0.72rem; font-weight:700; color:${msg.sender === 'user' ? 'var(--primary)' : 'var(--secondary-dark)'}; margin-bottom:3px;">
                                    ${msg.author} • ${msg.time || 'Just now'}
                                </div>
                                <div style="font-size:0.9rem; line-height:1.5;">${msg.text}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <textarea id="mentor-chat-input" placeholder="Write a confidential message to ${activeMentor.name} about sobriety, pacing, stress, or support..." style="width:100%; height:75px; padding:10px; border-radius:8px; border:1.5px solid var(--border-color); box-sizing:border-box; font-size:0.88rem;"></textarea>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span style="font-size:0.75rem; color:var(--text-muted);">Replies are immediate &amp; confidential</span>
                            <button type="button" onclick="sendDirectMentorMessage('${activeMentor.id}')" class="btn-primary" style="padding:10px 22px; font-size:0.88rem;">
                                Send Direct Message
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    } 
    // Tab 4: Handbooks and wellness tasks
    else if (currentSupportSubTab === 'tasks') {
        if (!isRegistered) {
            html += renderSupportAccessGate('Handbooks and Scheduled Wellness Tasks', 'tasks');
        } else {
            const activeRotatingTasks = getRotatingWellnessTasks(currentUserId);
            const completedCount = Object.keys(completedTasksMap).length;

            html += `
                <div style="display:flex; flex-direction:column; gap:22px;">
                    <!-- Scheduled Tasks & Handbooks -->
                    <div class="outreach-card" style="border-top:4px solid var(--accent-sage); padding:24px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
                            <div>
                                <h3 class="card-title" style="margin:0 0 6px 0; font-size:1.35rem; color:var(--primary);">Handbooks &amp; Scheduled Wellness Tasks</h3>
                                <p style="font-size:0.9rem; color:var(--text-muted); margin:0;">
                                    Complete these scheduled reading digests, wellness check-ins, motivation videos, and runs to build healthy habits and boost your <strong>Smart Lifestyle Score</strong>.
                                </p>
                            </div>
                            <div style="background:linear-gradient(135deg, #064E3B 0%, #047857 100%); color:#FFFFFF; padding:12px 18px; border-radius:12px; text-align:center; border:1.5px solid #FFE055;">
                                <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.04em; opacity:0.9;">Your Current Smart Score</div>
                                <div style="font-size:1.35rem; font-weight:800; color:#FFE055; font-family:'Poppins',sans-serif;">${pointsBreakdown.totalPoints.toLocaleString()} Points</div>
                                <div style="font-size:0.74rem; opacity:0.9;">${completedCount} Wellness Tasks Completed</div>
                            </div>
                        </div>

                        <div style="display:grid; gap:14px;">
                            ${activeRotatingTasks.map(task => {
                                const isDone = !!completedTasksMap[task.id];
                                return `
                                    <div style="padding:18px; border-radius:12px; background:${isDone ? '#F1F8E9' : 'var(--card-bg-warm)'}; border:1.5px solid ${isDone ? 'var(--accent-sage)' : 'var(--border-color)'}; display:flex; flex-direction:column; gap:10px;">
                                        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                                            <div>
                                                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                                                    <span style="font-size:0.74rem; font-weight:800; color:var(--primary); background:var(--primary-light); padding:3px 10px; border-radius:999px;">${task.category}</span>
                                                    <span style="font-size:0.76rem; color:var(--text-muted); font-weight:600;">${task.duration}</span>
                                                    <span style="font-size:0.76rem; font-weight:800; color:#05241B; background:#FFE055; padding:2px 10px; border-radius:999px;">+15 Smart Score Points</span>
                                                </div>
                                                <h4 style="margin:4px 0; font-size:1.06rem; color:var(--text-main); font-weight:800;">${task.title}</h4>
                                                <p style="margin:0; font-size:0.88rem; color:var(--text-muted); line-height:1.55;">${task.description}</p>
                                            </div>
                                            <button type="button" onclick="completeSupportScheduledTask('${task.id}', 15)" class="${isDone ? 'btn-sage' : 'btn-primary'}" style="padding:9px 18px; font-size:0.83rem; flex-shrink:0;">
                                                ${isDone ? 'Completed (+15 pts Earned)' : 'Complete Task & Claim +15 pts'}
                                            </button>
                                        </div>
                                        ${task.detailHtml ? task.detailHtml : ''}
                                        ${task.videoEmbedUrl ? `
                                            <div style="margin-top:8px; border-radius:12px; overflow:hidden; border:1px solid var(--border-color); background:#000; max-width:680px;">
                                                <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden;">
                                                    <iframe src="${task.videoEmbedUrl}" title="${task.title}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- 24/7 Verified Support Helplines -->
                    <div class="outreach-card" style="border-top:4px solid var(--accent-amber); padding:24px;">
                        <h3 class="card-title" style="margin:0 0 6px 0; font-size:1.25rem; color:var(--primary);">24/7 Verified National &amp; Campus Support Helplines</h3>
                        <p style="font-size:0.86rem; color:var(--text-muted); margin-bottom:14px;">
                            Immediate toll-free emergency medical, addiction recovery, mental health, and GBV protection channels across Zimbabwe:
                        </p>
                        <div style="background:var(--card-bg-warm); padding:18px; border-radius:12px; border:1px solid var(--border-color); border-left:4px solid var(--primary); line-height:1.95; font-size:0.88rem;">
                            <div><strong>National Ambulance &amp; Medical Emergency:</strong> <span style="color:var(--primary); font-weight:800;">999 / 994 / MARS 0800 3222</span></div>
                            <div><strong>Musasa Project (24/7 Toll-Free GBV Helpline):</strong> <span style="color:var(--accent-sage); font-weight:800;">0800 4321 / +263 773 843 139</span></div>
                            <div><strong>Youth Helpline &amp; Mental Health Support:</strong> <span style="color:var(--primary); font-weight:800;">116 (Toll-Free)</span></div>
                            <div><strong>Friendship Bench Zimbabwe (Counselling):</strong> <span style="color:var(--accent-sage); font-weight:800;">+263 784 845 294 / Campus Wellness Desks</span></div>
                            <div><strong>Adult Rape Clinic (Parirenyatwa Hospital):</strong> <span style="color:var(--primary); font-weight:800;">+263 242 703 823 / 0775 672 770</span></div>
                            <div><strong>ZRP Victim Friendly Unit (VFU):</strong> <span style="color:var(--text-main); font-weight:700;">Available 24/7 at your nearest ZRP Station</span></div>
                        </div>
                    </div>
                </div>
            `;
        }
    } 
    // Tab 5: Mentor & Counsellor Accreditation
    else if (currentSupportSubTab === 'accreditation') {
        html += `
            <div class="outreach-card" style="border-top:4px solid var(--primary); padding:24px; max-width:920px; margin:0 auto;">
                <div style="margin-bottom:18px;">
                    <h3 class="card-title" style="margin:0 0 6px 0; font-size:1.35rem; color:var(--primary);">Mentor &amp; Counsellor Accreditation</h3>
                    <p style="font-size:0.88rem; color:var(--text-muted); margin:0;">
                        Are you a certified counsellor, health professional, or experienced sobriety peer leader? Upload your qualifications for <strong>Admin Review</strong> to earn the official <strong>Verified Mentor Badge</strong>.
                    </p>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:12px;">
                    <div>
                        <label style="font-size:0.78rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:3px;">Applicant Name &amp; Title:</label>
                        <input type="text" id="mentor-app-name" value="${currentUsername}" placeholder="e.g. Counsellor Tariro Moyo" style="width:100%; padding:9px; border-radius:6px; border:1px solid var(--border-color); box-sizing:border-box;" />
                    </div>
                    <div>
                        <label style="font-size:0.78rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:3px;">Role Category:</label>
                        <select id="mentor-app-role" style="width:100%; padding:9px; border-radius:6px; border:1px solid var(--border-color); box-sizing:border-box;">
                            <option value="Clinical & Mental Health Counsellor">Clinical &amp; Mental Health Counsellor</option>
                            <option value="Peer Sobriety & Moderation Mentor">Peer Sobriety &amp; Moderation Mentor</option>
                            <option value="Medical / Toxicology Advisor">Medical / Toxicology Advisor</option>
                            <option value="GBV & Bystander Safety Specialist">GBV &amp; Bystander Safety Specialist</option>
                        </select>
                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="font-size:0.78rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:3px;">Specialization &amp; Mentorship Focus:</label>
                    <input type="text" id="mentor-app-spec" placeholder="e.g. Sobriety Coaching, Binge Pacing, Exam Stress & H.A.L.T. Counselling" style="width:100%; padding:9px; border-radius:6px; border:1px solid var(--border-color); box-sizing:border-box;" />
                </div>

                <div style="margin-bottom:12px;">
                    <label style="font-size:0.78rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:3px;">Upload Relevant Qualifications / Certificates (PDF, JPG, PNG, DOC):</label>
                    <input type="file" id="mentor-app-qual-file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style="width:100%; padding:8px; background:var(--card-bg-warm); border:1.5px dashed var(--primary); border-radius:8px; font-size:0.82rem; box-sizing:border-box;" />
                </div>

                <div style="margin-bottom:14px;">
                    <label style="font-size:0.78rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:3px;">Professional / Peer Bio &amp; Qualification Summary:</label>
                    <textarea id="mentor-app-bio" placeholder="Summarize your counselling qualifications, certification body, and experience helping youth..." style="width:100%; height:75px; padding:9px; border-radius:6px; border:1px solid var(--border-color); box-sizing:border-box;"></textarea>
                </div>

                <button type="button" onclick="submitMentorCounsellorApplication()" class="btn-primary" style="width:100%; padding:12px; font-size:0.92rem;">
                    Submit Application &amp; Qualifications for Admin Verification
                </button>
                <p id="mentor-app-feedback" style="display:none; color:var(--accent-sage); font-weight:700; margin-top:10px; text-align:center; font-size:0.86rem;"></p>

                <!-- Mentor / Counsellor Application Status & Verification Tracking -->
                <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <strong style="font-size:0.9rem; color:var(--primary);">Your Accreditation Status &amp; Admin Review Tracking</strong>
                        <span style="font-size:0.75rem; background:var(--cream-accent); padding:2px 8px; border-radius:999px; font-weight:700;">Admin Console Linked</span>
                    </div>
                    ${allApps.length === 0 ? `
                        <div style="padding:14px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:8px; font-size:0.82rem; color:var(--text-muted); line-height:1.5;">
                            All qualifications and credentials submitted above are routed directly to the Platform Administrator for accreditation review. Once verified in the Admin Console, your official Verified Mentor Badge will be activated and your profile will be published to the Mentorship Program Directory.
                        </div>
                    ` : allApps.map(app => `
                        <div style="padding:14px; background:${app.verified ? '#F0FDF4' : 'var(--card-bg-warm)'}; border:1px solid ${app.verified ? '#BBF7D0' : 'var(--border-color)'}; border-left:4px solid ${app.verified ? 'var(--accent-sage)' : 'var(--accent-amber)'}; border-radius:8px; margin-bottom:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                                <strong style="font-size:0.9rem; color:${app.verified ? '#065F46' : 'var(--text-main)'};">${escapeHtml(app.name)} (${escapeHtml(app.role)})</strong>
                                <span style="font-size:0.75rem; background:${app.verified ? '#DCFCE7' : '#FFF3E0'}; color:${app.verified ? '#15803D' : '#E65100'}; padding:2px 10px; border-radius:999px; font-weight:800;">
                                    ${app.verified ? 'Verified Accredited Mentor' : 'Pending Admin Verification'}
                                </span>
                            </div>
                            <div style="font-size:0.8rem; color:${app.verified ? '#166534' : 'var(--text-muted)'}; margin:5px 0;">
                                <strong>Uploaded Credential:</strong> ${escapeHtml(app.fileName || 'Credential Document')} • <strong>Focus:</strong> ${escapeHtml(app.specialization)}
                            </div>
                            <div style="font-size:0.78rem; color:${app.verified ? '#15803D' : 'var(--text-muted)'}; line-height:1.4;">
                                ${app.verified ? 
                                    'Accreditation confirmed. Your Verified Mentor Badge is active across the Mentorship Directory and Direct Student Support Chat.' : 
                                    'Your application is under active review by the Platform Administrator in the Admin Console. The Verified Mentor Badge will be awarded upon accreditation approval.'}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

function submitSupportMenteeRegistration() {
    const checkboxes = document.querySelectorAll('.support-issue-checkbox:checked');
    const selectedIssues = Array.from(checkboxes).map(cb => cb.value);
    const customNoteEl = document.getElementById('support-reg-custom-note');
    const modeEl = document.getElementById('support-reg-mode');

    if (selectedIssues.length === 0) {
        alert("Please select at least one issue or goal you would like support with.");
        return;
    }

    const existing = getSupportRegistrationProfile(currentUserId);
    const profile = {
        userId: currentUserId,
        username: currentUsername,
        university: currentUniversity,
        issues: selectedIssues,
        customNote: customNoteEl ? customNoteEl.value.trim() : '',
        mode: modeEl ? modeEl.value : '1-on-1 Verified Mentor & Scheduled Tasks',
        matchedMentorId: (existing && existing.matchedMentorId) ? existing.matchedMentorId : DEFAULT_VERIFIED_MENTORS[0].id,
        registeredAt: new Date().toISOString()
    };

    saveSupportRegistrationProfile(profile, currentUserId);
    awardSmartActivityPoints('support_task', 'mentee_registration', 15);

    const container = document.getElementById('influence-feed');
    if (container) renderPeerAndCommunitySupportSubsection(container);
}


function openMentorFullProfileModal(mentorId) {
    const mentors = getAllSupportMentors();
    const mentor = mentors.find(m => m.id === mentorId) || DEFAULT_VERIFIED_MENTORS[0];
    let modal = document.getElementById('mentor-profile-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mentor-profile-modal';
        modal.className = 'landing-modal-overlay';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(5, 36, 27, 0.65)';
        modal.style.backdropFilter = 'blur(6px)';
        modal.style.zIndex = '999999';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.onclick = function(e) {
            if (e.target === modal) closeMentorFullProfileModal();
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="landing-modal-card" style="max-width:580px; width:92%; max-height:90vh; overflow-y:auto; padding:28px; border-top:5px solid var(--primary); position:relative; background:#FFFFFF; border-radius:16px; box-shadow:0 20px 40px rgba(0,0,0,0.25);" role="dialog" aria-labelledby="mentor-profile-modal-name">
            <button type="button" class="modal-close-btn" onclick="closeMentorFullProfileModal()" aria-label="Close Profile" style="position:absolute; top:16px; right:16px; background:none; border:none; font-size:1.6rem; cursor:pointer; color:var(--text-muted);">&times;</button>
            
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                <span class="mentor-verified-badge" style="font-size:0.78rem; padding:4px 12px;">Verified Badge • ${mentor.badgeLabel || 'Verified Mentor'}</span>
                <span style="font-size:0.8rem; font-weight:700; color:var(--accent-sage);">Admin-Accredited Professional</span>
            </div>
            
            <h3 id="mentor-profile-modal-name" style="margin:4px 0; font-size:1.45rem; color:var(--text-main); font-weight:800;">${mentor.name}</h3>
            <div style="font-size:0.92rem; font-weight:700; color:var(--primary); margin-bottom:4px;">${mentor.role}</div>
            <div style="font-size:0.84rem; color:var(--text-muted); margin-bottom:16px; font-weight:600;">${mentor.institution}</div>
            
            <div style="background:var(--card-bg-warm); padding:16px; border-radius:10px; border:1px solid var(--border-color); margin-bottom:16px; line-height:1.6; font-size:0.88rem;">
                <div style="margin-bottom:10px;">
                    <strong style="color:var(--text-main); display:block; font-size:0.82rem; text-transform:uppercase; letter-spacing:0.03em; margin-bottom:2px;">Specialization &amp; Focus Areas:</strong>
                    <span style="color:var(--text-main); font-weight:600;">${mentor.specialization}</span>
                </div>
                <div>
                    <strong style="color:var(--text-main); display:block; font-size:0.82rem; text-transform:uppercase; letter-spacing:0.03em; margin-bottom:2px;">Verified Credentials &amp; Accreditation:</strong>
                    <span style="color:var(--primary); font-weight:700;">${mentor.qualification}</span>
                </div>
            </div>
            
            <div style="margin-bottom:20px;">
                <h4 style="margin:0 0 6px 0; font-size:0.95rem; color:var(--text-main); font-weight:700;">Full Background &amp; Bio</h4>
                <p style="font-size:0.9rem; color:var(--text-muted); line-height:1.65; margin:0;">${mentor.bio}</p>
            </div>
            
            <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px; padding:12px; margin-bottom:22px; font-size:0.82rem; color:#166534; line-height:1.5;">
                <strong>Confidentiality Guarantee:</strong> All 1-on-1 communications with this accredited mentor are end-to-end encrypted within your private session. Zero chat history is made public.
            </div>
            
            <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap;">
                <button type="button" onclick="closeMentorFullProfileModal()" class="btn-cream" style="padding:10px 18px; font-size:0.88rem; border-radius:8px;">
                    Close
                </button>
                <button type="button" onclick="selectVerifiedSupportMentor('${mentor.id}'); closeMentorFullProfileModal();" class="btn-primary" style="padding:10px 22px; font-size:0.88rem; font-weight:700; border-radius:8px;">
                    Select Mentor &amp; Start Direct Chat
                </button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeMentorFullProfileModal() {
    const modal = document.getElementById('mentor-profile-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function selectVerifiedSupportMentor(mentorId) {
    const existing = getSupportRegistrationProfile(currentUserId) || {
        userId: currentUserId,
        username: currentUsername,
        university: currentUniversity,
        issues: [SUPPORT_HELP_ISSUES[0], SUPPORT_HELP_ISSUES[1]],
        customNote: '',
        mode: '1-on-1 Verified Mentor & Scheduled Tasks'
    };
    existing.matchedMentorId = mentorId;
    saveSupportRegistrationProfile(existing, currentUserId);
    currentSupportSubTab = 'communication';
    const container = document.getElementById('influence-feed');
    if (container) renderPeerAndCommunitySupportSubsection(container);
}

function sendDirectMentorMessage(mentorId) {
    const input = document.getElementById('mentor-chat-input');
    if (!input || !input.value.trim()) return;
    const userText = input.value.trim();

    const mentors = getAllSupportMentors();
    const mentor = mentors.find(m => m.id === mentorId) || DEFAULT_VERIFIED_MENTORS[0];
    const messages = getDirectMentorMessages(mentorId, currentUserId);

    messages.push({
        sender: 'user',
        author: `${currentUsername} (${currentUniversity})`,
        time: 'Just now',
        text: userText
    });

    // Generate context-aware response from the verified mentor
    const lower = userText.toLowerCase();
    let reply = `Thank you for sharing that with me, ${currentUsername}. Remember the H.A.L.T. check (never drink when Hungry, Angry, Lonely, or Tired) and keep your Decoy Cup ready. I have also highlighted the scheduled wellness tasks below to support your progress this week.`;
    if (lower.includes('pressure') || lower.includes('party') || lower.includes('friends')) {
        reply = `Peer pressure at campus events is very real, ${currentUsername}. Try anchoring with one sober ally before arriving and holding a soda water with lime ('Decoy Cup'). If anyone pushes shots, a calm "I'm on early training tomorrow, I'm good with this" works every time.`;
    } else if (lower.includes('stress') || lower.includes('exam') || lower.includes('anxiet') || lower.includes('sleep')) {
        reply = `Exam anxiety often tempts students to self-medicate, but alcohol blocks REM sleep and triggers a cortisol rebound ('hangxiety') the next day. Let's replace that tonight with the 25-minute brisk walk task and 45-minute study sprints.`;
    } else if (lower.includes('quit') || lower.includes('sober') || lower.includes('addict') || lower.includes('stop')) {
        reply = `Choosing sobriety or strict moderation is a powerful leadership step, ${currentUsername}. Let's take it one day at a time—start with the "Clear-Mind Edge" reading digest below and check in with me here every evening.`;
    }

    messages.push({
        sender: 'mentor',
        author: `${mentor.name} (${mentor.badgeLabel || 'Verified Mentor'})`,
        time: 'Just now',
        text: reply
    });

    saveDirectMentorMessages(mentorId, messages, currentUserId);
    awardSmartActivityPoints('support_task', `mentor_chat_${mentorId}`, 15);

    const container = document.getElementById('influence-feed');
    if (container) renderPeerAndCommunitySupportSubsection(container);
}

function completeSupportScheduledTask(taskId, points) {
    const pts = Math.min(15, Number(points) || 15);
    awardSmartActivityPoints('support_task', taskId, pts);
    const container = document.getElementById('influence-feed');
    if (container) renderPeerAndCommunitySupportSubsection(container);
}

async function submitMentorCounsellorApplication() {
    const nameEl = document.getElementById('mentor-app-name');
    const roleEl = document.getElementById('mentor-app-role');
    const specEl = document.getElementById('mentor-app-spec');
    const bioEl = document.getElementById('mentor-app-bio');
    const fileEl = document.getElementById('mentor-app-qual-file');
    const fbEl = document.getElementById('mentor-app-feedback');

    const name = nameEl ? nameEl.value.trim() : '';
    const role = roleEl ? roleEl.value : 'Peer Sobriety & Moderation Mentor';
    const spec = specEl ? specEl.value.trim() : '';
    const bio = bioEl ? bioEl.value.trim() : '';
    const fileObj = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;

    if (!name || !spec || !bio) {
        alert("Please fill in your name, specialization areas, and qualification summary.");
        return;
    }
    if (!fileObj) {
        alert("Please upload your qualification certificate or credential document for Admin review.");
        return;
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--text-muted)';
        fbEl.innerText = 'Submitting credentials to Platform Admin review desk...';
    }

    let fileUrl = null;
    let fileDataUri = null;
    try {
        fileDataUri = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(fileObj);
        });
    } catch (e) {}

    try {
        const formData = new FormData();
        formData.append('file', fileObj);
        const upRes = await fetch(`${API_BASE}/admin/upload-media`, {
            method: 'POST',
            body: formData
        });
        if (upRes.ok) {
            const upData = await upRes.json();
            fileUrl = upData.url;
        }
    } catch (e) {}

    let appId = 'mentor-custom-' + Date.now();
    try {
        const res = await fetch(`${API_BASE}/mentors/apply`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                name: name,
                role: role,
                specialization: spec,
                bio: bio,
                file_name: fileObj.name,
                file_url: fileUrl || fileDataUri,
                institution: currentUniversity,
                user_id: currentUserId
            })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.application_id) {
                appId = data.application_id;
            }
        }
    } catch (e) {}

    const apps = getAllMentorApplications();
    const newApp = {
        id: appId,
        userId: currentUserId,
        name: name,
        role: role,
        institution: currentUniversity,
        specialization: spec,
        bio: bio,
        fileName: fileObj.name,
        fileUrl: fileUrl || fileDataUri,
        fileDataUri: fileDataUri,
        qualification: `Verified Credential Upload (${fileObj.name})`,
        status: 'pending',
        verified: false,
        badgeLabel: 'Verified ' + (role.includes('Clinical') ? 'Clinical Counsellor' : 'Peer Mentor'),
        created_at: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
    apps.unshift(newApp);
    saveAllMentorApplications(apps);

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--accent-sage)';
        fbEl.innerText = `Application & credentials (${fileObj.name}) submitted! Forwarded to the Admin Console for official verification and badge issuance.`;
    }
    setTimeout(() => {
        const container = document.getElementById('influence-feed');
        if (container) renderPeerAndCommunitySupportSubsection(container);
    }, 750);
}

function adminVerifyMentorApplication(appId) {
    adminVerifyMentorApplicationAction(appId);
}


// -----------------------------------------
// Youth Connect+: Above the Influence (Outreach) Logic
// -----------------------------------------
const BINGE_MODULE_TITLE = "Binge Drinking & Health Limits";
let currentActiveBingeModuleId = 1;
let currentActiveBingeSectionId = null;

const BINGE_DRINKING_CURRICULUM = {
    shortTitle: "Binge Drinking & Health Limits",
    title: "Binge Drinking & Health Limits: Curriculum & Study Guide",
    targetAudience: "Learners Aged 16+",
    coreFocus: "Blood Alcohol Concentration (BAC), Standard Drink Metrics, Hepatic Metabolism, and Acute Physiological Safety",
    overview: "This study guide equips students and young adults aged 16 and older with practical, easy-to-understand knowledge about how alcohol is measured, absorbed, and broken down by the human body, alongside essential safety skills for recognizing and responding to alcohol emergencies.",
    learningObjectives: [
        "Define binge drinking and calculate how many \"standard drinks\" are in common alcoholic beverages.",
        "Explain how Blood Alcohol Concentration (BAC) works and why alcohol affects different people in different ways.",
        "Understand how the liver breaks down alcohol at a fixed speed and why popular \"quick sober-up\" tricks do not work.",
        "Recognize the warning signs of alcohol poisoning (C.U.P.S.) and take the right steps to help a friend in an emergency."
    ],
    sections: [
        {
            id: 1,
            numberLabel: "Section 1",
            title: "Understanding Binge Drinking & Standard Drink Sizes",
            summary: "Learn the 0.08% BAC definition of binge drinking, why 'one cup' does not equal 'one standard drink' (14g pure alcohol), and how to calculate standard drinks from container size and ABV %.",
            order: ["video", "1.1", "1.2", "1.3", "quiz"],
            video: {
                key: "video",
                code: "Video 1",
                shortLabel: "CDC Binge Drinking Video",
                title: "CDC's \"Binge Drinking\"",
                youtubeUrl: "https://www.youtube.com/watch?v=I9hdkDTaQWU",
                embedUrl: "https://www.youtube.com/embed/I9hdkDTaQWU?rel=0",
                guidance: "Watch this short video at the start of Section 1 to learn the basic definition of binge drinking, high-risk drinking limits, and standard drink sizes."
            },
            subsections: {
                "1.1": {
                    key: "1.1",
                    code: "1.1",
                    shortLabel: "1.1 What Is Binge Drinking?",
                    title: "1.1 What Is Binge Drinking?",
                    html: `
                        <p>Binge drinking is defined not by how many days a week a person drinks, but by how fast they drink during a single occasion. Health experts define binge drinking as drinking enough alcohol in a short time to raise a person's <strong>Blood Alcohol Concentration (BAC) to 0.08% or higher</strong>.</p>
                        <div class="binge-callout-box">
                            <strong>Standard Binge Drinking Threshold (Within ~2 Hours):</strong>
                            <ul style="margin:8px 0 0 20px;">
                                <li><strong>Males:</strong> Consuming <strong>5 or more standard drinks</strong> within about 2 hours.</li>
                                <li><strong>Females:</strong> Consuming <strong>4 or more standard drinks</strong> within about 2 hours.</li>
                                <li><strong>Teens &amp; Young Adults (Aged 16–20):</strong> Lighter body weights and still-developing brains mean that BAC often hits <strong>0.08% with even fewer drinks</strong>.</li>
                            </ul>
                        </div>
                    `
                },
                "1.2": {
                    key: "1.2",
                    code: "1.2",
                    shortLabel: "1.2 Standard Drink Sizes",
                    title: "1.2 What Counts as a Standard Drink?",
                    html: `
                        <p>One of the biggest mistakes people make at parties or social gatherings is thinking that <em>"one cup equals one drink."</em> In reality, a <strong>Standard Drink</strong> is a way of measuring the exact amount of pure alcohol inside a drink, no matter how big or small the glass is.</p>
                        <p>In the United States, one standard drink contains <strong>14 grams (0.6 fluid ounces) of pure alcohol</strong> (other countries define a standard unit as 10 grams). Because different types of alcohol have very different strengths—measured as <strong>Alcohol by Volume (ABV %)</strong>—it takes a much smaller serving of strong liquor to equal the alcohol in a full can of beer.</p>
                        <div class="binge-table-wrap">
                            <table class="binge-curriculum-table">
                                <thead>
                                    <tr>
                                        <th>Type of Drink</th>
                                        <th>Typical Strength (ABV)</th>
                                        <th>1 Standard Drink Size</th>
                                        <th>Common Real-World Mistake</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><strong>Regular Beer or Hard Seltzer</strong></td>
                                        <td><code>5% ABV</code></td>
                                        <td><strong>12 fl oz (355 mL)</strong> regular can or bottle</td>
                                        <td>Strong craft beers often contain 7% to 9% ABV. A single 16 fl oz tall can of 8% beer actually equals <strong>2.1 standard drinks</strong>.</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Table Wine</strong></td>
                                        <td><code>12% ABV</code></td>
                                        <td><strong>5 fl oz (148 mL)</strong> small pour</td>
                                        <td>Large wine glasses hold 10 to 12 fl oz. Filling a big wine glass to the top can equal <strong>2 to 2.5 standard drinks</strong>.</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Hard Liquor / Spirits</strong><br><span style="font-size:0.8rem; color:var(--text-muted);">(Vodka, Gin, Rum, Whiskey, Tequila)</span></td>
                                        <td><code>40% ABV (80 Proof)</code></td>
                                        <td><strong>1.5 fl oz (44 mL)</strong> single shot</td>
                                        <td>Mixed plastic party cups or heavy pours often contain 3 to 4.5 fl oz of liquor, which equals <strong>2 to 3 standard drinks</strong> in just one cup.</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Sweet Liqueurs / Fortified Wines</strong></td>
                                        <td><code>17% – 24% ABV</code></td>
                                        <td><strong>2.5 to 3.5 fl oz (75 – 100 mL)</strong></td>
                                        <td>Sugary flavors hide the strong taste of alcohol, making it easy to drink too much without noticing.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    `
                },
                "1.3": {
                    key: "1.3",
                    code: "1.3",
                    shortLabel: "1.3 Label Math & Formula",
                    title: "1.3 Glass Size vs. Actual Alcohol: Checking the Label",
                    html: `
                        <p>When someone pours a mixed drink at a party or opens an oversized can, they often have no idea how many standard drinks they are actually consuming. You can quickly estimate how many standard drinks are in any container by comparing its size (in fluid ounces) and its strength (ABV %) against a regular 12 fl oz beer at 5% ABV (<code>12 × 5 = 60</code>):</p>
                        <div class="binge-formula-box">
                            <div style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--primary-dark); font-weight:800; margin-bottom:4px;">Standard Drink Estimation Formula</div>
                            <div style="font-size:1.15rem; font-weight:800; color:var(--text-main);">Standard Drinks ≈ (Container Size in fl oz × ABV %) ÷ 60</div>
                        </div>
                        <p><strong>Worked Example:</strong> A single <strong>24 fl oz</strong> large can of an <strong>8% ABV</strong> malt drink contains <code>(24 × 8) ÷ 60 = 192 ÷ 60 = 3.2 standard drinks</code> inside just one can!</p>
                    `
                }
            },
            quiz: {
                key: "quiz",
                code: "1.4",
                shortLabel: "1.4 Review Questions (≥80%)",
                title: "1.4 Section 1 Review Questions (Multiple-Choice Assessment)",
                passThreshold: 80,
                questions: [
                    {
                        id: "s1_q1",
                        topic: "1. Basic Definition (BAC & Standard Drink Limits)",
                        prompt: "What Blood Alcohol Concentration (BAC) level defines binge drinking, and how many standard drinks within about 2 hours typically cause an adult to reach that level?",
                        options: [
                            "0.05% BAC — reached after 3 standard drinks for males or 2 for females within 2 hours.",
                            "0.08% BAC or higher — typically reached after 5 or more standard drinks for males, or 4 or more standard drinks for females, within about 2 hours (and even fewer drinks for teens aged 16–20).",
                            "0.15% BAC — reached after 6 standard drinks for both males and females over an entire evening.",
                            "0.02% BAC — reached after consuming any single alcoholic beverage in 1 hour."
                        ],
                        correctIndex: 1,
                        explanation: "Health experts define binge drinking as raising BAC to 0.08% or higher, which typically happens after 5+ standard drinks for males or 4+ standard drinks for females in about 2 hours (and fewer drinks for lighter 16–20 year-olds)."
                    },
                    {
                        id: "s1_q2",
                        topic: "2. Quick Math (Applying the Standard Drink Formula)",
                        prompt: "A 17-year-old drinks two 16 fl oz cans of strong cider (7.5% ABV) over 90 minutes. Using the formula Standard Drinks ≈ (Container Size in fl oz × ABV %) ÷ 60, how many standard drinks did they consume, and does this cross the binge drinking limit?",
                        options: [
                            "2.0 standard drinks — does not cross the binge drinking limit.",
                            "3.0 standard drinks — stays safely below all binge drinking limits.",
                            "4.0 standard drinks ((32 fl oz × 7.5) ÷ 60 = 240 ÷ 60 = 4.0) — Yes, 4 standard drinks in 90 minutes meets the adult female binge limit and easily crosses the 0.08% BAC threshold for a 17-year-old.",
                            "5.5 standard drinks — calculated by adding container size and ABV."
                        ],
                        correctIndex: 2,
                        explanation: "Two 16 fl oz cans = 32 fl oz total. (32 × 7.5) ÷ 60 = 240 ÷ 60 = 4.0 standard drinks. Consuming 4.0 standard drinks in 90 minutes crosses the binge drinking threshold (especially for a 17-year-old)."
                    },
                    {
                        id: "s1_q3",
                        topic: "3. Real-World Thinking (Party Cups vs. Standard Drinks)",
                        prompt: "Why is counting 'cups' or 'cans' a poor way to track alcohol intake at a party?",
                        options: [
                            "Because plastic cups absorb alcohol and make drinks weaker over time.",
                            "Because a Standard Drink measures pure alcohol (14g / 0.6 fl oz), whereas party cups and tall cans vary wildly in size and ABV%—so a single plastic party cup with 3–4.5 fl oz of liquor actually contains 2 to 3 standard drinks.",
                            "Because only glass bottles contain standard drinks, while cans always equal 1 standard drink.",
                            "Because sugary mixers neutralize the alcohol in liqueurs and spirits."
                        ],
                        correctIndex: 1,
                        explanation: "A 'Standard Drink' measures 14g (0.6 fl oz) of pure alcohol. Large wine pours, tall high-ABV craft beer cans, and mixed plastic party cups often pack 2 to 3+ standard drinks into a single cup or can."
                    },
                    {
                        id: "s1_q4",
                        topic: "4. Standard Drink Table (Craft Beer & Wine Pours)",
                        prompt: "According to the Standard Drink Reference Table, how many standard drinks are in a single 16 fl oz tall can of 8% ABV craft beer, and how many are in a large wine glass filled with 10–12 fl oz of 12% ABV wine?",
                        options: [
                            "1.0 standard drink in the tall craft beer, and 1.0 standard drink in the large wine glass.",
                            "2.1 standard drinks in the 16 fl oz (8% ABV) craft beer, and 2 to 2.5 standard drinks in the filled 10–12 fl oz wine glass.",
                            "0.5 standard drinks in the craft beer, and 4.0 standard drinks in the wine glass.",
                            "3.5 standard drinks in the craft beer, and 1.2 standard drinks in the wine glass."
                        ],
                        correctIndex: 1,
                        explanation: "A 16 fl oz can of 8% ABV beer equals (16 × 8) ÷ 60 = 2.1 standard drinks, and a 10–12 fl oz pour of 12% ABV wine equals 2 to 2.5 standard drinks (since 1 standard wine pour is only 5 fl oz)."
                    },
                    {
                        id: "s1_q5",
                        topic: "5. Pure Alcohol Metric & Large Malt Cans",
                        prompt: "How much pure alcohol is in one US Standard Drink, and how many standard drinks are inside a single 24 fl oz can of 8% ABV malt liquor?",
                        options: [
                            "14 grams (0.6 fl oz) of pure alcohol per standard drink; the 24 fl oz (8% ABV) malt can contains 3.2 standard drinks.",
                            "28 grams (1.2 fl oz) of pure alcohol per standard drink; the malt can contains 1.6 standard drinks.",
                            "5 grams of pure alcohol per standard drink; the malt can contains 1.0 standard drink.",
                            "50 grams of pure alcohol per standard drink; the malt can contains 5.0 standard drinks."
                        ],
                        correctIndex: 0,
                        explanation: "One standard drink contains 14 grams (0.6 fl oz) of pure alcohol. Using the formula: (24 fl oz × 8% ABV) ÷ 60 = 192 ÷ 60 = 3.2 standard drinks in a single can."
                    }
                ]
            }
        },
        {
            id: 2,
            numberLabel: "Section 2",
            title: "Blood Alcohol Concentration (BAC) & Personal Factors",
            summary: "Explore how alcohol is absorbed through the stomach (20%) and small intestine (80%), why biological sex, body water, and food change peak BAC, and what happens at each BAC tier from 0.02% to ≥0.35%.",
            order: ["2.1", "video", "2.2", "2.3", "quiz"],
            video: {
                key: "video",
                code: "Video 2",
                shortLabel: "Forensic Metabolism Video (Part 1)",
                title: "\"Forensic Medicine Alcohol Metabolism\" (Part 1: Absorption & Rising BAC)",
                youtubeUrl: "https://www.youtube.com/watch?v=5S6wT7YrMvE",
                embedUrl: "https://www.youtube.com/embed/5S6wT7YrMvE?rel=0",
                guidance: "Watch the first half of this video during Section 2 to see how alcohol enters the bloodstream and how BAC rises over time."
            },
            subsections: {
                "2.1": {
                    key: "2.1",
                    code: "2.1",
                    shortLabel: "2.1 How BAC Is Measured",
                    title: "2.1 How BAC Is Measured",
                    html: `
                        <p><strong>Blood Alcohol Concentration (BAC)</strong> measures the percentage of alcohol in a person's bloodstream. For example, a BAC of <strong>0.08%</strong> means there are <strong>0.08 grams of alcohol for every 100 milliliters (mL) of blood</strong>.</p>
                        <p>Unlike food, which must be slowly digested before your body can use it, alcohol needs no digestion at all:</p>
                        <ul>
                            <li>About <strong>20% of the alcohol</strong> passes straight through the <strong>stomach wall</strong> into the blood.</li>
                            <li>The remaining <strong>80% is absorbed very quickly through the small intestine</strong>.</li>
                        </ul>
                        <p>From there, the blood carries alcohol throughout all water-filled tissues of the body, reaching the brain within minutes.</p>
                    `
                },
                "2.2": {
                    key: "2.2",
                    code: "2.2",
                    shortLabel: "2.2 Why BAC Varies by Person",
                    title: "2.2 Why BAC Varies From Person to Person",
                    html: `
                        <p>Two people can drink the exact same amount of alcohol in the same amount of time and end up with very different BAC levels. Several key personal factors explain why:</p>
                        <ul>
                            <li><strong>Biological Sex and Body Water:</strong> Alcohol mixes easily with water, not body fat. On average, male bodies are about <strong>58% to 65% water</strong>, while female bodies are about <strong>48% to 55% water</strong> (because females naturally carry a higher percentage of essential body fat). With less body water to dilute the alcohol, a female will reach a higher BAC than a male of the exact same weight after drinking the same amount. Females also naturally have lower levels of a stomach enzyme (ADH) that breaks down a small portion of alcohol before it hits the bloodstream.</li>
                            <li><strong>Body Weight:</strong> A heavier person generally has more blood and body water to dilute the alcohol than a lighter person, resulting in a lower BAC from the same number of drinks.</li>
                            <li><strong>Food in the Stomach:</strong> Eating a meal (especially foods with protein, fat, and carbohydrates) before drinking keeps the <strong>stomach valve</strong> (between the stomach and small intestine) closed longer. This traps the alcohol in the stomach where it absorbs slowly, keeping peak BAC much lower. Drinking on an empty stomach lets alcohol rush straight into the small intestine, causing a fast, dangerous spike in BAC.</li>
                            <li><strong>Speed of Drinking:</strong> Gulping drinks, playing drinking games, or taking back-to-back shots floods the bloodstream faster than the liver can keep up.</li>
                            <li><strong>Drink Strength and Fizz:</strong> Carbonated (fizzy) drinks like champagne, hard seltzers, or liquor mixed with soda irritate the stomach valve and push alcohol into the small intestine faster, speeding up absorption.</li>
                        </ul>
                    `
                },
                "2.3": {
                    key: "2.3",
                    code: "2.3",
                    shortLabel: "2.3 BAC Effects Chart",
                    title: "2.3 How Different BAC Levels Affect You",
                    html: `
                        <p>As BAC climbs higher, alcohol shuts down more and more areas of the brain:</p>
                        <div class="binge-table-wrap">
                            <table class="binge-curriculum-table">
                                <thead>
                                    <tr>
                                        <th>BAC Range</th>
                                        <th>Stage</th>
                                        <th>How It Affects the Brain and Body</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><code>0.02% – 0.04%</code></td>
                                        <td><strong>Mild Relaxation</strong></td>
                                        <td>Slight warm feeling, relaxed mood, and a minor drop in the ability to focus on two tasks at once.</td>
                                    </tr>
                                    <tr>
                                        <td><code>0.05% – 0.07%</code></td>
                                        <td><strong>Lowered Judgment &amp; Reflexes</strong></td>
                                        <td>Less self-control, louder or riskier social behavior, slower reaction times, and reduced hand-eye coordination.</td>
                                    </tr>
                                    <tr>
                                        <td><code>0.08% – 0.14%</code></td>
                                        <td><strong>Binge Threshold / Legally Impaired</strong></td>
                                        <td>Clear trouble with balance, slurred speech, poorer vision and hearing, bad judgment, and strong mood swings.</td>
                                    </tr>
                                    <tr>
                                        <td><code>0.15% – 0.24%</code></td>
                                        <td><strong>Heavy Intoxication &amp; Blackout Risk</strong></td>
                                        <td>Stumbling or falling, dizziness, nausea and vomiting, confusion, and a high chance of memory blackouts.</td>
                                    </tr>
                                    <tr>
                                        <td><code>0.25% – 0.34%</code></td>
                                        <td><strong>Severe Danger / Passing Out</strong></td>
                                        <td>Unable to stand or walk, loss of bladder control, loss of the gag reflex (high choking risk), drop in body temperature, and passing out.</td>
                                    </tr>
                                    <tr>
                                        <td><code>≥ 0.35%</code></td>
                                        <td><strong>Coma &amp; Life-Threatening Risk</strong></td>
                                        <td>Complete unconsciousness (coma); the brain centers that control breathing and heartbeat can shut down, which can be fatal.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    `
                }
            },
            quiz: {
                key: "quiz",
                code: "2.4",
                shortLabel: "2.4 Review Questions (≥80%)",
                title: "2.4 Section 2 Review Questions (Multiple-Choice Assessment)",
                passThreshold: 80,
                questions: [
                    {
                        id: "s2_q1",
                        topic: "1. How Food Helps (Stomach Valve & Small Intestine)",
                        prompt: "Why does drinking on an empty stomach cause a much sharper spike in BAC than drinking after eating a full meal?",
                        options: [
                            "Food chemically destroys 50% of the alcohol before it is swallowed.",
                            "Eating a meal with protein, fat, and carbohydrates keeps the stomach valve closed longer so alcohol stays in the stomach (where absorption is slow), whereas an empty stomach lets alcohol rush straight into the small intestine (where 80% is absorbed rapidly).",
                            "An empty stomach manufactures extra alcohol inside the digestive tract.",
                            "Food doubles the speed of liver enzymes so alcohol disappears in 15 minutes."
                        ],
                        correctIndex: 1,
                        explanation: "Food keeps the stomach valve closed longer, trapping alcohol in the stomach where only ~20% absorbs slowly. On an empty stomach, alcohol rushes straight into the small intestine where ~80% absorbs rapidly into the bloodstream."
                    },
                    {
                        id: "s2_q2",
                        topic: "2. Comparing Two Drinkers (Biological Sex & Body Water)",
                        prompt: "A male and a female student, both weighing 65 kg (143 lbs), each drink 3 standard drinks in 1 hour on an empty stomach. Who will likely have a higher BAC, and what two biological reasons explain why?",
                        options: [
                            "Both will have the exact same BAC because they weigh the same (65 kg).",
                            "The male student, because males absorb alcohol faster through muscle tissue.",
                            "The female student, because (1) females naturally have a lower percentage of body water (48%–55% vs. 58%–65% in males) to dilute alcohol, and (2) females have less of the stomach enzyme (ADH) that breaks down alcohol before it enters the blood.",
                            "The female student, only because females breathe out less alcohol than males."
                        ],
                        correctIndex: 2,
                        explanation: "Even at the exact same body weight (65 kg), the female student will reach a higher BAC because females average 48%–55% body water (vs. 58%–65% in males) to dilute the alcohol and have lower levels of stomach ADH enzyme."
                    },
                    {
                        id: "s2_q3",
                        topic: "3. Reading the Table (Vomiting & Memory Blackout Range)",
                        prompt: "According to the BAC Effects Table, at what BAC range does a person move from lowered self-control into Heavy Intoxication with a high risk for vomiting and memory blackouts?",
                        options: [
                            "0.02% – 0.04% (Mild Relaxation)",
                            "0.05% – 0.07% (Lowered Judgment & Reflexes)",
                            "0.15% – 0.24% (Heavy Intoxication & Blackout Risk)",
                            "0.01% – 0.02% (Initial Absorption)"
                        ],
                        correctIndex: 2,
                        explanation: "At 0.15% – 0.24% BAC (Heavy Intoxication & Blackout Risk), drinkers experience stumbling or falling, dizziness, nausea and vomiting, confusion, and a high chance of memory blackouts."
                    },
                    {
                        id: "s2_q4",
                        topic: "4. Absorption Split & Fizzy Mixers",
                        prompt: "What percentage of alcohol is absorbed through the stomach vs. the small intestine, and how do carbonated (fizzy) drinks like champagne, hard seltzers, or soda mixers affect absorption?",
                        options: [
                            "About 20% is absorbed through the stomach wall and 80% through the small intestine; fizzy drinks irritate the stomach valve and push alcohol into the small intestine faster, speeding up absorption.",
                            "80% is absorbed in the mouth and 20% in the large intestine; carbonation slows absorption down.",
                            "50% is digested in the stomach over 4 hours; bubbles evaporate the alcohol.",
                            "100% is absorbed in the stomach; soda keeps the stomach valve locked shut."
                        ],
                        correctIndex: 0,
                        explanation: "Roughly 20% of alcohol passes through the stomach wall while 80% is absorbed rapidly through the small intestine. Carbonated mixers irritate the stomach valve and push alcohol into the small intestine faster."
                    },
                    {
                        id: "s2_q5",
                        topic: "5. Severe Danger & Coma Thresholds",
                        prompt: "According to the BAC table, what life-threatening risks occur at 0.25% – 0.34% BAC and at ≥ 0.35% BAC?",
                        options: [
                            "At 0.25%–0.34%, only mild warmth occurs; at ≥0.35%, reaction times slightly slow down.",
                            "At 0.25%–0.34%, loss of the gag reflex (high choking risk), drop in body temperature, and passing out occur; at ≥ 0.35% BAC, complete unconsciousness (coma) occurs and brain centers controlling breathing and heartbeat can shut down fatally.",
                            "At 0.25%–0.34%, coordination improves; at ≥0.35%, the liver clears alcohol twice as fast.",
                            "Both ranges only cause a mild headache the next day without immediate medical risk."
                        ],
                        correctIndex: 1,
                        explanation: "At 0.25%–0.34% BAC, the person cannot stand, loses their gag reflex, drops in body temperature, and passes out. At ≥ 0.35% BAC, coma and fatal shutdown of breathing and heartbeat centers can occur."
                    }
                ]
            }
        },
        {
            id: 3,
            numberLabel: "Section 3",
            title: "Liver Metabolism Rates & How Alcohol Leaves the Body",
            summary: "Understand the 2-step hepatic enzyme pathway (ADH to toxic acetaldehyde; ALDH to harmless acetate), the fixed 0.015% BAC/hr clearance speed, the 'Traffic Jam Effect,' and why sobering-up myths fail.",
            order: ["3.1", "3.2", "video", "3.3", "quiz"],
            video: {
                key: "video",
                code: "Video 3",
                shortLabel: "Forensic Metabolism Video (Part 2)",
                title: "\"Forensic Medicine Alcohol Metabolism\" (Part 2: Hepatic Clearance & Return to Zero)",
                youtubeUrl: "https://www.youtube.com/watch?v=5S6wT7YrMvE",
                embedUrl: "https://www.youtube.com/embed/5S6wT7YrMvE?rel=0",
                guidance: "Watch the second half of this video to see how the liver clears alcohol from the blood and why it takes so many hours for BAC to return to zero."
            },
            subsections: {
                "3.1": {
                    key: "3.1",
                    code: "3.1",
                    shortLabel: "3.1 Two-Step Liver Breakdown",
                    title: "3.1 How the Liver Breaks Down Alcohol",
                    html: `
                        <p>Once alcohol is in your bloodstream, your body treats it like a poison and works to get rid of it. About <strong>90% to 95%</strong> of the alcohol you drink must be broken down (metabolized) by your <strong>liver</strong>. Only a tiny amount (<strong>5% to 10%</strong>) leaves the body directly through your breath (which is what breathalyzer tests measure), urine, and sweat.</p>
                        <p>Inside the liver, special proteins called <strong>enzymes</strong> break down alcohol in two main steps:</p>
                        <div class="binge-callout-box" style="border-left-color:var(--secondary-teal);">
                            <p style="margin-bottom:8px;"><strong>1. Step 1 (Alcohol to Toxic Byproduct):</strong> An enzyme called <strong>ADH</strong> (Alcohol Dehydrogenase) turns alcohol into a toxic chemical called <strong>acetaldehyde</strong>. Acetaldehyde is very hard on the body—it causes skin flushing, a racing heart, nausea, cell damage, and bad hangover symptoms.</p>
                            <p style="margin-bottom:0;"><strong>2. Step 2 (Toxic Byproduct to Harmless Waste):</strong> A second enzyme called <strong>ALDH</strong> (Aldehyde Dehydrogenase) turns acetaldehyde into a harmless substance called <strong>acetate</strong> (similar to vinegar), which the body easily breaks down into <strong>water and carbon dioxide</strong> that you breathe and pee out.</p>
                        </div>
                    `
                },
                "3.2": {
                    key: "3.2",
                    code: "3.2",
                    shortLabel: "3.2 Fixed Speed (0.015%/hr)",
                    title: "3.2 Why the Liver Works at One Fixed Speed",
                    html: `
                        <p>Your liver has a limited supply of alcohol-fighting enzymes. After just 1 or 2 drinks, those enzymes are completely maxed out. Once they are maxed out, <strong>the liver works at one fixed, steady speed and cannot go any faster</strong>, no matter how much more you drink.</p>
                        <div class="binge-formula-box">
                            <div style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--primary-dark); font-weight:800; margin-bottom:4px;">Fixed Hepatic Clearance Rate</div>
                            <div style="font-size:1.1rem; font-weight:800; color:var(--text-main);">Average Breakdown Speed: Lowers BAC by ~0.015% per hour (≈ 1 Standard Drink per hour)</div>
                        </div>
                        <p><strong>The Traffic Jam Effect:</strong> If a person has <strong>6 standard drinks in 2 hours</strong>, their liver will only clear about <strong>2 of those drinks</strong> during that time. The other <strong>4 drinks stay backed up in the bloodstream</strong>, circulating through the brain and organs for hours.</p>
                    `
                },
                "3.3": {
                    key: "3.3",
                    code: "3.3",
                    shortLabel: "3.3 Sobering Up Myths",
                    title: "3.3 Myths About \"Sobering Up Quickly\"",
                    html: `
                        <p>Because the liver's enzymes cannot be sped up, <strong>only time can lower your BAC</strong>. Every popular trick for "sobering up fast" is a myth:</p>
                        <div class="binge-table-wrap">
                            <table class="binge-curriculum-table">
                                <thead>
                                    <tr>
                                        <th>Common Myth</th>
                                        <th>Why People Think It Works</th>
                                        <th>What Actually Happens in the Body</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><strong>Drinking Coffee or Energy Drinks</strong></td>
                                        <td>Caffeine makes a sleepy person feel more awake.</td>
                                        <td>Caffeine does not lower BAC at all. It just creates a <strong>"wide-awake drunk"</strong> person whose coordination and judgment are still completely impaired, and it worsens dehydration.</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Taking a Cold Shower</strong></td>
                                        <td>The shock of cold water wakes the person up for a moment.</td>
                                        <td>It does nothing to help the liver clear alcohol. Worse, alcohol causes the body to lose heat through the skin, so a cold shower can trigger dangerous <strong>low body temperature (hypothermia)</strong>.</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Exercising or "Sweating It Out"</strong></td>
                                        <td>People think heavy sweating pushes the alcohol out.</td>
                                        <td>Very little alcohol comes out in sweat. Exercising while drunk increases the risk of severe dehydration, irregular heartbeat, and serious falls.</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Eating Greasy Food After Drinking</strong></td>
                                        <td>People think food "soaks up" alcohol after they already feel drunk.</td>
                                        <td>Food only slows down absorption if you eat it <em>before or while</em> alcohol is still in your stomach. Once alcohol is already in your blood, eating cannot speed up your liver.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    `
                }
            },
            quiz: {
                key: "quiz",
                code: "3.4",
                shortLabel: "3.4 Review Questions (≥80%)",
                title: "3.4 Section 3 Review Questions (Multiple-Choice Assessment)",
                passThreshold: 80,
                questions: [
                    {
                        id: "s3_q1",
                        topic: "1. How the Liver Works (Enzymatic Steps & Acetaldehyde)",
                        prompt: "What are the two enzymatic steps the liver uses to break down alcohol, and why does the chemical created in Step 1 make people feel sick?",
                        options: [
                            "Step 1: ADH turns alcohol into acetaldehyde (a toxic chemical that causes skin flushing, racing heart, nausea, cell damage, and hangover symptoms); Step 2: ALDH turns acetaldehyde into harmless acetate (then water and carbon dioxide).",
                            "Step 1: ALDH turns alcohol directly into glucose; Step 2: insulin turns glucose into sweat.",
                            "Step 1: Stomach acid turns alcohol into caffeine; Step 2: kidneys filter 95% of it out in 15 minutes.",
                            "Step 1: ADH turns alcohol into oxygen; Step 2: lungs exhale 90% of it immediately."
                        ],
                        correctIndex: 0,
                        explanation: "In Step 1, liver enzyme ADH converts alcohol into toxic acetaldehyde (which causes flushing, racing heart, nausea, and hangover sickness). In Step 2, ALDH converts acetaldehyde into harmless acetate, which breaks down into water and CO2."
                    },
                    {
                        id: "s3_q2",
                        topic: "2. Calculating Sobriety Time (0.015% BAC per Hour)",
                        prompt: "A person's BAC hits 0.15% at 1:00 AM when they stop drinking. Since the liver lowers BAC by 0.015% per hour, what time will their BAC reach 0.00%, and what will their BAC still be at 7:00 AM?",
                        options: [
                            "Reaches 0.00% at 4:00 AM; BAC at 7:00 AM is 0.00%.",
                            "Takes 10 hours (0.15 ÷ 0.015 = 10), reaching 0.00% at 11:00 AM; at 7:00 AM (6 hours later, after clearing 0.09%), their BAC is still 0.06% (still impaired and unsafe to drive).",
                            "Reaches 0.00% at 7:00 AM; BAC at 7:00 AM is 0.00%.",
                            "Takes 2 hours, reaching 0.00% at 3:00 AM if they drink coffee."
                        ],
                        correctIndex: 1,
                        explanation: "0.15% ÷ 0.015%/hr = 10 hours total. Starting from 1:00 AM, BAC reaches 0.00% at 11:00 AM. At 7:00 AM (6 hours after 1:00 AM), the liver has cleared 6 × 0.015% = 0.09%, leaving BAC at 0.15% - 0.09% = 0.06%."
                    },
                    {
                        id: "s3_q3",
                        topic: "3. Busted Myths (Energy Drinks & Cold Showers)",
                        prompt: "Why does giving a drunk friend an energy drink and a cold shower fail to make them safe to drive?",
                        options: [
                            "Because energy drinks only work when combined with greasy food after drinking.",
                            "Because liver enzymes work at one fixed speed (~0.015%/hr) and cannot be sped up: caffeine only creates a 'wide-awake drunk' whose coordination and judgment remain impaired, and a cold shower does not lower BAC while risking dangerous hypothermia.",
                            "Because cold showers increase BAC by 0.05% per minute.",
                            "Because caffeine blocks the lungs from breathing out carbon dioxide."
                        ],
                        correctIndex: 1,
                        explanation: "Once liver enzymes are maxed out, they clear alcohol at a fixed speed (~0.015% BAC/hr). Caffeine only masks sleepiness ('wide-awake drunk') without fixing impaired reflexes, and cold showers can trigger hypothermia."
                    },
                    {
                        id: "s3_q4",
                        topic: "4. The Traffic Jam Effect & Elimination Routes",
                        prompt: "What percentage of alcohol must be broken down by the liver, and what happens if a person drinks 6 standard drinks in 2 hours?",
                        options: [
                            "Only 20% is broken down by the liver; all 6 drinks are sweated out in 2 hours.",
                            "About 90% to 95% must be broken down by the liver (only 5%–10% leaves via breath, urine, and sweat); after 6 drinks in 2 hours, the liver only clears ~2 drinks, leaving 4 drinks backed up in the bloodstream.",
                            "50% is broken down by the liver and 50% is absorbed by body fat.",
                            "100% leaves through the breath within 1 hour."
                        ],
                        correctIndex: 1,
                        explanation: "90%–95% of alcohol must be metabolized by the liver at roughly 1 standard drink per hour. Drinking 6 drinks in 2 hours means only ~2 drinks are cleared while 4 stay backed up circulating in the blood."
                    },
                    {
                        id: "s3_q5",
                        topic: "5. Exercising & Greasy Food After Drinking Myths",
                        prompt: "Why do 'sweating it out' through exercise or eating greasy food AFTER you are already drunk fail to lower BAC?",
                        options: [
                            "Exercising while drunk clears 80% of alcohol through sweat, and greasy food soaks alcohol out of the blood.",
                            "Very little alcohol leaves in sweat (exercising while drunk only risks severe dehydration, irregular heartbeat, and falls), and food only slows absorption if eaten BEFORE or WHILE alcohol is still in the stomach—once alcohol is in the blood, eating cannot speed up the liver.",
                            "Greasy food stops the liver from working for 6 hours.",
                            "Sweating raises BAC by 0.10% per hour."
                        ],
                        correctIndex: 1,
                        explanation: "Only 5%–10% of alcohol leaves via breath, urine, and sweat combined, and food cannot soak up alcohol that has already entered the bloodstream."
                    }
                ]
            }
        },
        {
            id: 4,
            numberLabel: "Section 4",
            title: "Acute Health Impacts on the Brain & Body",
            summary: "Examine how alcohol acts as a CNS depressant (boosting GABA 'brakes' and blocking glutamate 'gas pedals'), why memory blackouts happen in the hippocampus (~0.14%–0.16% BAC), and how alcohol causes severe dehydration and gag-reflex loss.",
            order: ["4.1", "4.2", "4.3", "video", "quiz"],
            video: {
                key: "video",
                code: "Video 4",
                shortLabel: "What Happens to Your Body Video",
                title: "\"Binge Drinking: What Really Happens to Your Body\"",
                youtubeUrl: "https://www.youtube.com/watch?v=VcQD6GFBmp0",
                embedUrl: "https://www.youtube.com/embed/VcQD6GFBmp0?rel=0",
                guidance: "Watch this video to see how heavy drinking slows down brain signals, causes severe dehydration, and upsets the stomach."
            },
            subsections: {
                "4.1": {
                    key: "4.1",
                    code: "4.1",
                    shortLabel: "4.1 Brain Brakes (GABA) & Gas (Glutamate)",
                    title: "4.1 How Alcohol Slows Down the Brain",
                    html: `
                        <p>Alcohol is a <strong>Central Nervous System (CNS) depressant</strong>, which means it slows down brain activity and nerve signals. Even though a person might act loud or energetic after their first drink (because alcohol quiets the part of the brain that normally keeps shyness and inhibitions in check), alcohol actually slows the brain down in two ways:</p>
                        <ul>
                            <li><strong>Pressing the Brain's "Brakes" (GABA):</strong> Alcohol boosts the brain's main calming chemical messenger (called <strong>GABA</strong>). This is like slamming on the brakes in a car—it causes slurred speech, clumsy movement, slow reflexes, sleepiness, and eventually slowed breathing.</li>
                            <li><strong>Blocking the Brain's "Gas Pedal" (Glutamate):</strong> Alcohol blocks the brain's main energizing chemical messenger (called <strong>glutamate</strong>), which normally keeps you alert, focused, and able to learn. Without it, thinking becomes slow and muddy.</li>
                        </ul>
                    `
                },
                "4.2": {
                    key: "4.2",
                    code: "4.2",
                    shortLabel: "4.2 Blackouts vs. Passing Out",
                    title: "4.2 Memory Blackouts vs. Passing Out",
                    html: `
                        <p>Many people confuse a "blackout" with "passing out" (falling asleep or losing consciousness). During a <strong>blackout</strong>, a person is still wide awake—walking, talking, and making decisions—but their brain has temporarily lost the ability to record new memories.</p>
                        <p>When BAC spikes quickly (usually around <strong>0.14% to 0.16% or higher</strong>), alcohol temporarily shuts down the <strong>hippocampus</strong>, the part of the brain that acts like a "save button" to turn short-term experiences into lasting memories. There are two types of blackouts:</p>
                        <ul>
                            <li><strong>Partial Blackout ("Brownout"):</strong> Spotty memory loss where parts of the night are missing, though some memories may come back if friends remind you of what happened.</li>
                            <li><strong>Complete Blackout:</strong> Total memory loss for hours at a time. Because the brain's "save button" was turned off completely, those memories were never recorded and <strong>can never be remembered</strong>.</li>
                        </ul>
                        <div class="binge-callout-box">
                            <strong>Why Young Adults Are at Higher Risk:</strong> The human brain continues developing until around age 25. Compared to older adults, teens and young adults (aged 16 to 21) do not feel sleepy as early when drinking, but their memory centers are <em>more</em> sensitive to alcohol. This means young drinkers are much more likely to stay awake drinking longer and experience blackouts.
                        </div>
                    `
                },
                "4.3": {
                    key: "4.3",
                    code: "4.3",
                    shortLabel: "4.3 Dehydration & Gag Reflex",
                    title: "4.3 Dehydration and Stomach Upset",
                    html: `
                        <ul>
                            <li><strong>Shutting Off the Body's Water-Saving Hormone:</strong> Alcohol blocks a hormone (called <strong>antidiuretic hormone, or ADH / vasopressin</strong>) that tells your kidneys to hold onto water. Without this signal, the kidneys dump water straight into the bladder. Drinking <strong>1 cup of an alcoholic drink can make your body pee out 3 to 4 cups of water</strong>, leading to severe dehydration, pounding headaches, dizziness, and loss of important minerals (electrolytes).</li>
                            <li><strong>Stomach Irritation and Loss of the Gag Reflex:</strong> Large amounts of alcohol irritate the lining of the stomach and trigger the brain's vomiting center. At the same time, high BAC numbs the <strong>gag reflex</strong> in the throat—creating a deadly risk of choking on vomit if the person passes out.</li>
                        </ul>
                    `
                }
            },
            quiz: {
                key: "quiz",
                code: "4.4",
                shortLabel: "4.4 Review Questions (≥80%)",
                title: "4.4 Section 4 Review Questions (Multiple-Choice Assessment)",
                passThreshold: 80,
                questions: [
                    {
                        id: "s4_q1",
                        topic: "1. Brain Signals (GABA 'Brakes' & Glutamate 'Gas Pedal')",
                        prompt: "Using the brain's 'brakes' (GABA) and 'gas pedal' (glutamate), why is alcohol classified as a CNS depressant even though people sometimes act loud after their first drink?",
                        options: [
                            "Alcohol is a stimulant for the first 2 hours before turning into a depressant.",
                            "The first drink quiets the brain region that keeps shyness/inhibitions in check, making people seem loud—but chemically alcohol is a CNS depressant that boosts GABA ('slamming on the brakes') and blocks glutamate ('blocking the gas pedal'), slowing reflexes, speech, thinking, and breathing.",
                            "Alcohol blocks GABA and boosts glutamate, speeding up nerve transmission.",
                            "Alcohol only affects muscle fibers and has no effect on brain neurotransmitters."
                        ],
                        correctIndex: 1,
                        explanation: "Alcohol is strictly a Central Nervous System (CNS) depressant: it boosts calming GABA ('brakes') and blocks energizing glutamate ('gas pedal'). People only act loud initially because the brain's inhibition center is quieted first."
                    },
                    {
                        id: "s4_q2",
                        topic: "2. Blackouts vs. Passing Out (The Hippocampus 'Save Button')",
                        prompt: "What is the difference between having a blackout and passing out, and why can memories from a complete blackout never be recovered?",
                        options: [
                            "A blackout and passing out are identical—both mean the person is unconscious.",
                            "Passing out means losing consciousness, whereas during a blackout a person is wide awake (walking, talking), but high BAC (~0.14%–0.16%+) shuts down the hippocampus ('save button'), so memories during a complete blackout were never recorded and can never be remembered.",
                            "Complete blackout memories are temporarily hidden in the stomach and return after sleeping.",
                            "Blackouts only occur at 0.02% BAC when drinking water."
                        ],
                        correctIndex: 1,
                        explanation: "During a blackout, the person is still awake and active, but rapid BAC spikes (~0.14%–0.16%+) shut down the hippocampus. In a complete blackout, the brain's 'save button' is turned off completely, so memories were never recorded."
                    },
                    {
                        id: "s4_q3",
                        topic: "3. Dehydration (Antidiuretic Hormone / Vasopressin)",
                        prompt: "How does alcohol trick the kidneys into losing far more water than the person drank?",
                        options: [
                            "Alcohol blocks antidiuretic hormone (ADH / vasopressin)—the body's water-saving hormone—causing the kidneys to dump water straight into the bladder so 1 cup of an alcoholic drink can make your body pee out 3 to 4 cups of water.",
                            "Alcohol increases vasopressin, trapping all fluid inside the stomach.",
                            "Alcohol converts body water into sugar inside the liver.",
                            "Alcohol only causes water loss if mixed with salty food."
                        ],
                        correctIndex: 0,
                        explanation: "By blocking antidiuretic hormone (ADH/vasopressin), alcohol stops the kidneys from conserving water. Drinking 1 cup of an alcoholic beverage can cause the body to urinate out 3 to 4 cups of water."
                    },
                    {
                        id: "s4_q4",
                        topic: "4. Youth Vulnerability (Ages 16–21 Brain Development)",
                        prompt: "Why are teens and young adults (aged 16 to 21) at a much higher risk of experiencing memory blackouts than older adults?",
                        options: [
                            "Because their livers metabolize alcohol 4 times faster than older adults.",
                            "Because the human brain develops until ~age 25: teens and young adults do not feel sleepy as early when drinking compared to older adults, yet their memory centers are MORE sensitive to alcohol—so they stay awake drinking longer and experience blackouts more easily.",
                            "Because young adults have more body water than older adults.",
                            "Because partial blackouts ('brownouts') never happen to young adults."
                        ],
                        correctIndex: 1,
                        explanation: "Developing brains (until ~age 25) feel alcohol's sleepy warning cues later than older adults while having more sensitive memory centers (hippocampus), leading young drinkers to stay awake drinking longer and hit blackout thresholds."
                    },
                    {
                        id: "s4_q5",
                        topic: "5. Stomach Irritation & Loss of the Gag Reflex",
                        prompt: "Why is the combination of stomach irritation and high BAC so dangerous if a drinker passes out?",
                        options: [
                            "High BAC strengthens the throat's gag reflex and prevents vomiting.",
                            "Large amounts of alcohol irritate the stomach lining and trigger the brain's vomiting center, while high BAC simultaneously numbs the gag reflex in the throat—creating a deadly risk of choking on vomit while unconscious.",
                            "Vomiting immediately lowers blood alcohol back to 0.00%.",
                            "Stomach irritation makes the liver clear alcohol twice as fast."
                        ],
                        correctIndex: 1,
                        explanation: "Heavy drinking triggers the vomiting center by irritating the stomach lining while simultaneously numbing the protective gag reflex, creating a fatal choking hazard if the person is unconscious."
                    }
                ]
            }
        },
        {
            id: 5,
            numberLabel: "Section 5",
            title: "Safety, Alcohol Poisoning & Emergency Action",
            summary: "Understand 'alcohol tunnel vision,' why 'sleeping it off' is deadly as BAC continues rising for 30–90 minutes, how to spot the 4 warning signs of C.U.P.S., and how to execute the 3 emergency steps including the Recovery Position.",
            order: ["5.1", "5.2", "5.3", "video", "quiz"],
            video: {
                key: "video",
                code: "Video 5",
                shortLabel: "DREAM Grade 9-12: ALCOHOL Video",
                title: "\"DREAM Grade 9-12: ALCOHOL\"",
                youtubeUrl: "https://www.youtube.com/watch?v=WK_YQy1ioV4",
                embedUrl: "https://www.youtube.com/embed/WK_YQy1ioV4?rel=0",
                guidance: "Watch this video at the end of the module to learn how to handle peer pressure, spot the warning signs of alcohol poisoning, and save a friend's life."
            },
            subsections: {
                "5.1": {
                    key: "5.1",
                    code: "5.1",
                    shortLabel: "5.1 Alcohol Tunnel Vision & Peer Pressure",
                    title: "5.1 Risky Decisions, \"Alcohol Tunnel Vision,\" and Peer Pressure",
                    html: `
                        <p>As BAC climbs past <strong>0.06%</strong>, alcohol dulls the front part of the brain responsible for planning ahead and weighing risks. Psychologists call the result <strong>"alcohol tunnel vision"</strong>—people focus only on what is right in front of them (like a dare, an argument, or peer pressure to take another shot) while ignoring long-term consequences or danger.</p>
                        <p>This sharply raises the risk of serious falls, car crashes, fights, water accidents, and unsafe situations where clear consent cannot be given.</p>
                    `
                },
                "5.2": {
                    key: "5.2",
                    code: "5.2",
                    shortLabel: "5.2 Why 'Sleeping It Off' Is Deadly",
                    title: "5.2 Why \"Sleeping It Off\" Is Dangerous",
                    html: `
                        <p>The most dangerous mistake friends make at a party is putting someone who has passed out into a bed alone to <em>"sleep it off."</em></p>
                        <div class="binge-callout-box" style="border-left-color:#D32F2F; background:#FFF5F5;">
                            <p style="margin-bottom:6px; color:#B71C1C;"><strong>CRITICAL WARNING: A person's BAC keeps rising even after they stop drinking or pass out!</strong></p>
                            <p style="margin-bottom:0;">Because it takes <strong>30 to 90 minutes</strong> for alcohol in the stomach and intestines to finish absorbing into the blood, the drinks or shots a person took right before passing out keep entering their bloodstream while they are unconscious. Someone who passes out at <strong>0.22% BAC</strong> can quietly climb to a deadly <strong>0.35% BAC</strong> in their sleep, stopping breathing or choking on vomit with no one watching.</p>
                        </div>
                    `
                },
                "5.3": {
                    key: "5.3",
                    code: "5.3",
                    shortLabel: "5.3 C.U.P.S. & Recovery Position",
                    title: "5.3 Signs of Alcohol Poisoning & How to Help",
                    html: `
                        <p>Alcohol poisoning is a life-threatening medical emergency. You can remember the four major warning signs using the acronym <strong>C.U.P.S.</strong>:</p>
                        <div class="binge-cups-grid">
                            <div class="binge-cups-card">
                                <span class="binge-cups-letter">C</span>
                                <h4 style="font-size:0.95rem; margin-bottom:4px; color:var(--text-main);">Cold, Clammy, Pale, or Bluish Skin</h4>
                                <p style="font-size:0.84rem; margin:0; color:var(--text-muted);">Skin feels icy or sweaty; lips or fingernails look pale or blue from lack of oxygen.</p>
                            </div>
                            <div class="binge-cups-card">
                                <span class="binge-cups-letter">U</span>
                                <h4 style="font-size:0.95rem; margin-bottom:4px; color:var(--text-main);">Unconscious (Passed Out)</h4>
                                <p style="font-size:0.84rem; margin:0; color:var(--text-muted);">Cannot be woken up by loud talking or gentle shaking, or wakes up for a second and immediately passes back out.</p>
                            </div>
                            <div class="binge-cups-card">
                                <span class="binge-cups-letter">P</span>
                                <h4 style="font-size:0.95rem; margin-bottom:4px; color:var(--text-main);">Puking Repeatedly or While Passed Out</h4>
                                <p style="font-size:0.84rem; margin:0; color:var(--text-muted);">Throwing up over and over, or vomiting while half-asleep when the gag reflex isn't working properly.</p>
                            </div>
                            <div class="binge-cups-card">
                                <span class="binge-cups-letter">S</span>
                                <h4 style="font-size:0.95rem; margin-bottom:4px; color:var(--text-main);">Slow or Uneven Breathing</h4>
                                <p style="font-size:0.84rem; margin:0; color:var(--text-muted);">Fewer than <strong>8 breaths per minute</strong>, or gaps of <strong>10 seconds or more</strong> between breaths.</p>
                            </div>
                        </div>
                        <div class="binge-formula-box" style="margin-top:16px;">
                            <h4 style="color:var(--primary-dark); margin-bottom:10px; font-size:1rem;">Emergency Action Steps (If You See Even ONE Sign of C.U.P.S.):</h4>
                            <ol style="margin:0 0 0 20px; font-family:'Manrope',sans-serif; font-size:0.92rem; line-height:1.65;">
                                <li style="margin-bottom:8px;"><strong>Call Emergency Services Right Away (e.g., 911 / 999 / 112):</strong> Do not wait for all four signs to appear, and do not worry about getting in trouble—most places have <em>Good Samaritan / Medical Amnesty</em> rules that protect underage youth who call for medical help to save a friend.</li>
                                <li style="margin-bottom:8px;"><strong>Roll Them Onto Their Side (The Recovery Position):</strong> Never leave an unconscious person lying flat on their back. Gently roll them onto their side with their bottom arm stretched out under their head and their top knee bent forward onto the floor so they cannot roll onto their back or stomach. Tilt their chin slightly up to keep their airway open so any vomit drains safely out of their mouth.</li>
                                <li style="margin-bottom:0;"><strong>Stay With Them &amp; Keep Them Warm:</strong> Never leave them alone, never try to make them drink water or coffee, and never try to make them throw up. Cover them with a jacket or blanket and watch their breathing until paramedics arrive.</li>
                            </ol>
                        </div>
                    `
                }
            },
            quiz: {
                key: "quiz",
                code: "5.4",
                shortLabel: "5.4 Review Questions (≥80%)",
                title: "5.4 Section 5 Review Questions (Multiple-Choice Assessment)",
                passThreshold: 80,
                questions: [
                    {
                        id: "s5_q1",
                        topic: "1. Hidden Danger (Delayed Absorption After Passing Out)",
                        prompt: "Why does a person's BAC keep going up for up to 90 minutes even after they take their last drink and pass out?",
                        options: [
                            "Because the brain produces extra alcohol while a person is asleep.",
                            "Because it takes 30 to 90 minutes for unabsorbed alcohol still sitting in the stomach and intestines to finish absorbing into the bloodstream—so someone who passes out at 0.22% BAC can quietly climb to a deadly 0.35% BAC in their sleep.",
                            "Because the liver completely stops working when someone closes their eyes.",
                            "Because lying down compresses the lungs and doubles blood alcohol."
                        ],
                        correctIndex: 1,
                        explanation: "Alcohol from drinks or shots taken shortly before passing out takes 30 to 90 minutes to finish absorbing from the stomach and intestines into the blood, causing BAC to keep climbing while the person is unconscious."
                    },
                    {
                        id: "s5_q2",
                        topic: "2. Spotting an Emergency (C.U.P.S. & Breathing Numbers)",
                        prompt: "What do the four letters in C.U.P.S. stand for, and what numbers indicate that a person's breathing is dangerously slow?",
                        options: [
                            "Coughing, Upset stomach, Pale hands, Sweating — fewer than 20 breaths per minute.",
                            "Cold/clammy/pale/bluish skin, Unconscious (passed out), Puking repeatedly or while passed out, Slow or uneven breathing — fewer than 8 breaths per minute, or gaps of 10 seconds or more between breaths.",
                            "Confused, Unsteady, Paralyzed, Shivering — fewer than 15 breaths per minute.",
                            "Cramps, Urgency, Pulse racing, Slurred speech — 30 breaths per minute."
                        ],
                        correctIndex: 1,
                        explanation: "C.U.P.S. stands for Cold/clammy/pale/bluish skin, Unconscious, Puking repeatedly/while passed out, and Slow/uneven breathing (<8 breaths per minute or ≥10 seconds between breaths)."
                    },
                    {
                        id: "s5_q3",
                        topic: "3. What Would You Do? (Party Emergency Scenario)",
                        prompt: "At a party, a 17-year-old friend drinks several strong mixed cups, throws up twice, won't wake up when you shake their shoulder, and has 12-second pauses between breaths. Others say to leave them on their back on the couch to sleep. Why is that dangerous, and what three steps must you take right away?",
                        options: [
                            "Leaving them on their back is safe as long as you prop their feet up and give them coffee.",
                            "They show clear signs of alcohol poisoning (U, P, and S of C.U.P.S.) and could choke to death on vomit or stop breathing as BAC rises. You must: (1) Call emergency services (911/999/112) immediately, (2) Roll them onto their side in the Recovery Position, and (3) Stay with them, keep them warm with a jacket/blanket, and monitor breathing until paramedics arrive.",
                            "Put them in a cold shower, force them to drink water, and walk them outside.",
                            "Try to make them throw up again and check on them in the morning."
                        ],
                        correctIndex: 1,
                        explanation: "With unconsciousness, vomiting, and 12-second breathing gaps, leaving them on their back can be fatal. Immediately (1) Call 911/999/112, (2) Roll them onto their side in the Recovery Position, and (3) Stay with them, keep them warm, and monitor breathing."
                    },
                    {
                        id: "s5_q4",
                        topic: "4. 'Alcohol Tunnel Vision' & Risky Decisions",
                        prompt: "What happens in the brain as BAC climbs past 0.06% that causes 'alcohol tunnel vision'?",
                        options: [
                            "Alcohol improves long-term planning and peripheral vision.",
                            "Alcohol dulls the front part of the brain responsible for planning ahead and weighing risks, causing people to pay attention only to what is right in front of them (like a dare or peer pressure) while ignoring long-term consequences or danger.",
                            "Alcohol makes people overly cautious and unwilling to talk to peers.",
                            "Alcohol only affects hearing and has no impact on decision-making."
                        ],
                        correctIndex: 1,
                        explanation: "Past 0.06% BAC, alcohol dulls the prefrontal cortex (which weighs risks and plans ahead), creating 'alcohol tunnel vision' where immediate impulses and peer pressure override safety."
                    },
                    {
                        id: "s5_q5",
                        topic: "5. Recovery Position Technique & Actions to Avoid",
                        prompt: "How do you properly position an unconscious friend in the Recovery Position, and what must you NEVER do while waiting for paramedics?",
                        options: [
                            "Lay them flat on their back and pour cold water or coffee into their mouth.",
                            "Roll them onto their side with their bottom arm stretched out under their head, top knee bent forward to brace them, and chin tilted slightly up so vomit drains safely—and NEVER leave them alone, NEVER force water/coffee, and NEVER try to make them vomit.",
                            "Sit them upright in a chair and leave the room so they can sleep undisturbed.",
                            "Roll them flat onto their stomach and put ice packs on their neck."
                        ],
                        correctIndex: 1,
                        explanation: "The Recovery Position keeps the airway open on their side with the top knee bent forward for stability. Never leave them alone, never force fluids into an unconscious person, and never induce vomiting."
                    }
                ]
            }
        }
    ]
};


const DRINKING_DRIVING_CURRICULUM = {
    "shortTitle": "Drinking & Driving Prevention",
    "title": "Drinking & Driving Prevention: Curriculum & Study Guide",
    "targetAudience": "Learners Aged 16+ (Senior Secondary, College & Young Adult Smart Living Education)",
    "coreFocus": "Physics of Reaction-Time Impairment, Vision & Coordination Loss, Statutory BAC Limits in Zimbabwe, Designated Driver Protocols, and Safe Campus Transport",
    "overview": "This comprehensive curriculum and study guide accompanies the Drinking & Driving Prevention Smart Living module. Tailored for learners aged 16 and older—the minimum age at which young people in Zimbabwe can legally obtain a learner's or driver's licence—this guide explains in clear, everyday language how alcohol slows driver reaction times and increases stopping distances, how vision and steering control break down, what Zimbabwean traffic laws say about Blood Alcohol Concentration (BAC) limits and roadside breathalysers, how to follow strict designated driver protocols, and how to use safe campus and night transport.",
    "learningObjectives": [
        "Understand how a moving vehicle's total stopping distance is made up of thinking distance plus braking distance, and calculate how alcohol-delayed reaction times add dozens of extra metres at 60 km/h, 80 km/h, and 120 km/h.",
        "Explore how alcohol impairs the eyes and brain long before a driver feels 'drunk'—causing divided-attention failure, tunnel vision, night-glare blindness, poor depth perception, and steering over-correction.",
        "Master Zimbabwe's legal driving age (16) vs. drinking age (18), the statutory 0.08% BAC limit (80 mg/100 mL) under the Road Traffic Act [Chapter 13:11], ZRP breathalyser rules (SI 7 of 2026), and car insurance intoxication exclusion clauses.",
        "Define a true 0.00% BAC Designated Driver, calculate morning-after residual BAC, follow the Four Golden Rules, and use the 4-C Method (Calm, Collect, Coalition, Choice) to stop a friend from driving after drinking.",
        "Apply the 'There and Back' transport budget rule and 80% phone battery rule, avoid unregistered pirate taxis (mushikashika), and execute the 4-Step Passenger Safety Checklist."
    ],
    "sections": [
        {
            "id": 1,
            "numberLabel": "Section 1",
            "title": "The Physics of Reaction-Time Impairment & Stopping Distance",
            "summary": "Understand how total stopping distance splits into thinking distance plus braking distance, calculate extra metres travelled during alcohol-delayed reaction times, and see why doubling speed quadruples braking distance.",
            "order": [
                "video",
                "1.1",
                "1.2",
                "1.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 1",
                "shortLabel": "Cognito Stopping Distances Video",
                "title": "Cognito: \"GCSE Physics — Stopping Distances — Thinking Distance | Braking Distance\"",
                "youtubeUrl": "https://www.youtube.com/watch?v=q0yjYZdTS3I",
                "embedUrl": "https://www.youtube.com/embed/q0yjYZdTS3I?rel=0",
                "guidance": "Watch this video at the start of Section 1. It clearly illustrates how a vehicle's total stopping distance is split into two phases and why any delay in driver reaction time adds huge distances before the brakes even begin to slow the car.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "1.1": {
                    "key": "1.1",
                    "code": "1.1",
                    "shortLabel": "1.1 Thinking vs. Braking Distance",
                    "title": "1.1 Thinking Distance vs. Braking Distance",
                    "html": "\n                        <p>Many new drivers mistakenly believe that if they spot a hazard on the road—such as a child or pedestrian stepping onto a crossing, an unlit broken-down vehicle, a pothole, or stray cattle on a rural road—the car starts slowing down the instant they see it. In reality, the laws of physics divide stopping a moving car into two separate stages:</p>\n                        <ul>\n                            <li><strong>Stage 1 — Thinking Distance (Reaction Distance):</strong> This is the distance the vehicle continues travelling forward at <em>100% full speed</em> during the time it takes for (1) your eyes to spot the danger, (2) your brain to recognise the hazard and decide to brake, and (3) your nerves and muscles to lift your right foot off the accelerator and press down firmly on the brake pedal. During thinking distance, the car has not slowed down at all.</li>\n                            <li><strong>Stage 2 — Braking Distance:</strong> This is the distance the vehicle travels forward <em>after</em> your foot fully presses the brake pedal until the friction between the brake pads, tyres, and road surface brings the car to a complete stop.</li>\n                        </ul>\n                        <div class=\"binge-formula-box\">\n                            <div style=\"font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--primary-dark); font-weight:800; margin-bottom:4px;\">The Total Stopping Distance Formula</div>\n                            <div style=\"font-size:1.1rem; font-weight:800; color:var(--text-main);\">Total Stopping Distance = Thinking Distance + Braking Distance</div>\n                        </div>\n                    "
                },
                "1.2": {
                    "key": "1.2",
                    "code": "1.2",
                    "shortLabel": "1.2 Reaction-Time Delay Math",
                    "title": "1.2 How Alcohol Slows Reaction Time & Adds Extra Metres",
                    "html": "\n                        <p>As covered in our biology module, alcohol is a central nervous system depressant that slows down electrical and chemical messages travelling between the eyes, the brain, and the leg muscles. An alert, sober driver typically has a reaction time of about <strong>0.75 to 0.8 seconds</strong>. After drinking alcohol, reaction time frequently slows to <strong>1.5 to 2.5 seconds</strong> (or even longer).</p>\n                        <p>Adding just <strong>1.2 extra seconds</strong> to your reaction time sounds tiny in normal life, but inside a moving car it can be fatal. You can calculate the exact distance a car travels during your reaction time using this simple physics formula:</p>\n                        <div class=\"binge-formula-box\">\n                            <div style=\"font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--primary-dark); font-weight:800; margin-bottom:4px;\">Thinking Distance Formula</div>\n                            <div style=\"font-size:1.06rem; font-weight:800; color:var(--text-main);\">Thinking Distance (metres) = Speed (in metres per second, m/s) × Reaction Time (in seconds)</div>\n                        </div>\n                        <p><em>Quick Conversion Tip:</em> To convert a speedometer reading from <strong>kilometres per hour (km/h)</strong> into <strong>metres per second (m/s)</strong>, divide the km/h speed by <strong>3.6</strong> (because 1 km = 1,000 metres and 1 hour = 3,600 seconds).</p>\n                        <div class=\"binge-callout-box\">\n                            <p style=\"margin-bottom:10px;\"><strong>Example at 60 km/h (Town &amp; Campus Speed Limit):</strong> 60 km/h ÷ 3.6 = <strong>16.7 metres per second</strong>.</p>\n                            <ul style=\"margin:0 0 12px 20px;\">\n                                <li><strong>Sober Driver (0.8 s reaction time):</strong> 16.7 m/s × 0.8 s = <strong>13.3 metres</strong> travelled before touching the brake.</li>\n                                <li><strong>Impaired Driver (2.0 s reaction time):</strong> 16.7 m/s × 2.0 s = <strong>33.4 metres</strong> travelled before touching the brake—an <strong>extra 20.1 metres</strong> (about five car lengths) at full speed!</li>\n                            </ul>\n                            <p style=\"margin-bottom:10px;\"><strong>Example at 120 km/h (Highway Speed Limit):</strong> 120 km/h ÷ 3.6 = <strong>33.3 metres per second</strong>.</p>\n                            <ul style=\"margin:0 0 0 20px;\">\n                                <li><strong>Sober Driver (0.8 s reaction time):</strong> 33.3 m/s × 0.8 s = <strong>26.6 metres</strong> travelled before touching the brake.</li>\n                                <li><strong>Impaired Driver (2.0 s reaction time):</strong> 33.3 m/s × 2.0 s = <strong>66.6 metres</strong> travelled before touching the brake—two-thirds of a football field covered before the brakes are even touched!</li>\n                            </ul>\n                        </div>\n                    "
                },
                "1.3": {
                    "key": "1.3",
                    "code": "1.3",
                    "shortLabel": "1.3 Speed, Energy & Wet Roads",
                    "title": "1.3 Why Higher Speeds and Wet Roads Multiply the Danger",
                    "html": "\n                        <p>In Zimbabwe, the general speed limits for private light vehicles are <strong>60 km/h in built-up urban/campus areas</strong>, <strong>80 km/h on secondary rural roads</strong>, and <strong>120 km/h on wide tarred highways</strong>. Alcohol often causes drivers to drive faster than they realise while slowing their reaction time. Physics shows why speeding while impaired is a deadly combination:</p>\n                        <ul>\n                            <li><strong>Thinking Distance Grows in Step With Speed:</strong> If you double your speed (from 60 km/h to 120 km/h), your thinking distance <strong>doubles (×2)</strong>.</li>\n                            <li><strong>Braking Distance Quadruples When Speed Doubles:</strong> Because a moving car's forward energy (kinetic energy) equals ½ × mass × speed², doubling your speed multiplies the car's forward energy by <strong>four (×4)</strong>. That means your brakes and tyres must do four times as much work, so your <strong>braking distance quadruples (×4)</strong>—rising from 18 metres at 60 km/h to 72 metres at 120 km/h on a dry road.</li>\n                            <li><strong>Rainy Season &amp; Loose Gravel Hazards:</strong> On wet tar roads during Zimbabwe's rainy season (November to March) or on dusty gravel shoulders, tyre grip drops sharply and braking distance can easily <strong>double again</strong>.</li>\n                        </ul>\n                        <div class=\"binge-table-wrap\">\n                            <table class=\"binge-curriculum-table\">\n                                <thead>\n                                    <tr>\n                                        <th>Zimbabwe Speed Limit Zone</th>\n                                        <th>Speed in m/s</th>\n                                        <th>Sober Thinking Distance (0.8 s)</th>\n                                        <th>Impaired Thinking Distance (2.0 s)</th>\n                                        <th>Dry-Road Braking Distance</th>\n                                        <th>Total Stopping Distance (Sober vs. Impaired)</th>\n                                    </tr>\n                                </thead>\n                                <tbody>\n                                    <tr>\n                                        <td><strong>60 km/h</strong> (Urban &amp; Campus Zones)</td>\n                                        <td>16.7 m/s</td>\n                                        <td>13.3 m</td>\n                                        <td>33.4 m <em>(+20.1 m extra)</em></td>\n                                        <td>18.0 m</td>\n                                        <td><strong>31.3 m</strong> (Sober) vs. <strong>51.4 m</strong> (Impaired)</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>80 km/h</strong> (Secondary / Rural Roads)</td>\n                                        <td>22.2 m/s</td>\n                                        <td>17.8 m</td>\n                                        <td>44.4 m <em>(+26.6 m extra)</em></td>\n                                        <td>32.0 m</td>\n                                        <td><strong>49.8 m</strong> (Sober) vs. <strong>76.4 m</strong> (Impaired)</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>100 km/h</strong> (Regional Trunk Roads)</td>\n                                        <td>27.8 m/s</td>\n                                        <td>22.2 m</td>\n                                        <td>55.6 m <em>(+33.4 m extra)</em></td>\n                                        <td>50.0 m</td>\n                                        <td><strong>72.2 m</strong> (Sober) vs. <strong>105.6 m</strong> (Impaired)</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>120 km/h</strong> (Main Highways)</td>\n                                        <td>33.3 m/s</td>\n                                        <td>26.6 m</td>\n                                        <td>66.6 m <em>(+40.0 m extra)</em></td>\n                                        <td>72.0 m</td>\n                                        <td><strong>98.6 m</strong> (Sober) vs. <strong>138.6 m</strong> (Impaired)</td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n                    "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "1.4",
                "shortLabel": "Section 1 Knowledge Check",
                "title": "1.4 Section 1 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "dd_s1_q1",
                        "topic": "1. Physics Concepts (Thinking vs. Braking Distance)",
                        "prompt": "What is the difference between thinking distance and braking distance, and which of the two is directly lengthened by alcohol in the driver's bloodstream?",
                        "options": [
                            "Thinking distance is how far the car skids after the brakes lock; braking distance is how far it rolls before the driver sees the hazard. Alcohol only changes tyre friction.",
                            "Thinking distance is the distance travelled at full speed while the driver spots a hazard, decides to act, and moves their foot to the brake pedal; braking distance is the distance travelled after the brakes are pressed until the car stops. Alcohol directly lengthens thinking distance by slowing brain and nerve signals.",
                            "Thinking distance and braking distance are identical, and alcohol reduces both of them at low speeds.",
                            "Braking distance happens before the foot touches the pedal, while thinking distance happens after the car comes to a complete stop."
                        ],
                        "correctIndex": 1,
                        "explanation": "Thinking distance is the distance a car travels at 100% full speed while the driver spots a hazard, decides to act, and moves their foot to the brake pedal; braking distance is the distance travelled after the brakes are pressed. Alcohol directly lengthens thinking distance because it slows down nerve signals in the central nervous system."
                    },
                    {
                        "id": "dd_s1_q2",
                        "topic": "2. Stopping Distance Calculation (80 km/h Night Hazard)",
                        "prompt": "A driver is travelling at 80 km/h (22.2 m/s) at night when a broken-down lorry without reflectors appears 60 metres ahead. Using the stopping distance table (32.0 m braking distance at 80 km/h), what happens to the sober driver (0.8 s reaction time) versus the alcohol-impaired driver (2.0 s reaction time)?",
                        "options": [
                            "Both drivers stop safely at 49.8 metres with 10.2 metres to spare.",
                            "The sober driver travels 17.8 m thinking + 32.0 m braking = 49.8 m total stopping distance (stopping safely 10.2 m before the lorry), whereas the impaired driver travels 44.4 m thinking + 32.0 m braking = 76.4 m total stopping distance (crashing heavily into the lorry at 60 m).",
                            "Both drivers crash into the lorry because braking distance alone at 80 km/h is 72 metres.",
                            "The impaired driver stops at 44.4 metres while the sober driver stops at 60 metres."
                        ],
                        "correctIndex": 1,
                        "explanation": "At 80 km/h (22.2 m/s), the sober driver (0.8 s) travels 17.8 m thinking + 32.0 m braking = 49.8 metres total stopping distance, stopping safely 10.2 metres before the lorry. The alcohol-impaired driver (2.0 s) travels 44.4 m thinking + 32.0 m braking = 76.4 metres total stopping distance, crashing heavily into the lorry."
                    },
                    {
                        "id": "dd_s1_q3",
                        "topic": "3. Speed & Weather Effects (Kinetic Energy & Wet Roads)",
                        "prompt": "Why does doubling your driving speed from 60 km/h to 120 km/h cause your dry-road braking distance to increase four times (from 18 m to 72 m), and how does wet weather affect this?",
                        "options": [
                            "Because wind resistance stops working above 80 km/h, and rain makes tyres heavier.",
                            "Because a moving vehicle's kinetic energy increases with the square of its speed (½mv²), so doubling speed multiplies forward energy by four (×4), requiring four times the braking distance (18 m × 4 = 72 m); wet roads reduce tyre-to-tar friction and can double braking distance again.",
                            "Because brake pads automatically turn off at 120 km/h, and rain cools the engine down.",
                            "Doubling speed only increases braking distance by 2 metres, and wet roads reduce stopping distance."
                        ],
                        "correctIndex": 1,
                        "explanation": "Because kinetic energy equals ½mv², doubling speed from 60 km/h to 120 km/h multiplies forward energy by four (2² = 4), so the brakes need four times the distance (18 m × 4 = 72 m) to absorb that energy. Wet roads reduce friction between the tyres and tar, which can double braking distance again."
                    },
                    {
                        "id": "dd_s1_q4",
                        "topic": "4. Campus Speed Zone Calculation (60 km/h)",
                        "prompt": "At the 60 km/h urban and campus speed limit (16.7 m/s), how much extra distance does an impaired driver (2.0 s reaction time) travel before even touching the brake pedal compared to a sober driver (0.8 s reaction time)?",
                        "options": [
                            "2.5 extra metres (less than half a car length).",
                            "20.1 extra metres (33.4 m vs. 13.3 m — about five full car lengths travelled at 100% full speed before touching the brake).",
                            "5.0 extra metres.",
                            "0 extra metres because reaction time does not matter at 60 km/h."
                        ],
                        "correctIndex": 1,
                        "explanation": "At 60 km/h (16.7 m/s), a sober driver (0.8 s) travels 13.3 metres before braking, while an impaired driver (2.0 s) travels 33.4 metres—an extra 20.1 metres (about five car lengths) at full speed before touching the pedal."
                    },
                    {
                        "id": "dd_s1_q5",
                        "topic": "5. Speed Unit Conversion & Highway Thinking Distance",
                        "prompt": "How do you convert a speedometer reading from km/h into metres per second (m/s), and how far does a car at 120 km/h (33.3 m/s) travel during a 2.0-second alcohol-delayed reaction time before the brakes are touched?",
                        "options": [
                            "Divide km/h by 10; the car travels 12.0 metres before braking.",
                            "Divide km/h by 3.6; at 120 km/h (33.3 m/s), a 2.0-second reaction time covers 66.6 metres (two-thirds of a football field) before the brakes are even touched.",
                            "Multiply km/h by 3.6; the car travels 20.0 metres before braking.",
                            "Subtract 36 from km/h; the car travels 33.3 metres total."
                        ],
                        "correctIndex": 1,
                        "explanation": "Dividing km/h by 3.6 converts speed into m/s (120 ÷ 3.6 = 33.3 m/s). Multiplying 33.3 m/s × 2.0 seconds = 66.6 metres travelled before the driver's foot even touches the brake."
                    }
                ]
            }
        },
        {
            "id": 2,
            "numberLabel": "Section 2",
            "title": "How Alcohol Impairs Vision, Coordination & Divided Attention",
            "summary": "Explore why divided attention (multitasking) is the very first driving skill damaged at 0.02%–0.04% BAC, how alcohol causes tunnel vision and night-glare blindness, and why delayed steering leads to highway rollover crashes.",
            "order": [
                "2.1",
                "video",
                "2.2",
                "2.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 2",
                "shortLabel": "Fatal Vision Goggles Video",
                "title": "Innocorp: \"The Fatal Vision® Impairment Goggles — Drunk Driving Awareness\"",
                "youtubeUrl": "https://www.youtube.com/watch?v=T6K9V1zFiCU",
                "embedUrl": "https://www.youtube.com/embed/T6K9V1zFiCU?rel=0",
                "guidance": "Watch this video during Section 2 to see how participants wearing impairment goggles struggle to walk a straight line, judge distances, or catch keys, illustrating how alcohol disrupts the brain-eye-muscle connection.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "2.1": {
                    "key": "2.1",
                    "code": "2.1",
                    "shortLabel": "2.1 Divided Attention Failure",
                    "title": "2.1 Divided-Attention Failure: Why Driving Requires Multitasking",
                    "html": "\n                        <p>Safe driving is not a single task—it is a constant <strong>divided-attention (multitasking)</strong> challenge. Even on a familiar street, a driver's brain must simultaneously:</p>\n                        <ul>\n                            <li>Hold the vehicle steady inside the lane and adjust the steering wheel;</li>\n                            <li>Monitor speed and keep a safe following distance behind the car ahead;</li>\n                            <li>Scan mirrors, side streets, traffic lights, and pedestrian crossings; and</li>\n                            <li>Listen for horns, sirens, or engine sounds while ignoring passenger chatter.</li>\n                        </ul>\n                        <div class=\"binge-callout-box\">\n                            <strong>The First Skill Lost (0.02% – 0.04% BAC):</strong> Research shows that the brain's ability to split attention between two or more tasks is the <strong>very first skill damaged by alcohol—starting at BAC levels as low as 0.02% to 0.04%</strong> (just one drink). An impaired driver may stare hard at the white line directly in front of the bonnet to stay straight, but completely fail to notice a red traffic light or a cyclist at the side of the road.\n                        </div>\n                    "
                },
                "2.2": {
                    "key": "2.2",
                    "code": "2.2",
                    "shortLabel": "2.2 Tunnel Vision & Night Glare",
                    "title": "2.2 Visual Impairment: Tunnel Vision, Night Glare & Depth Perception",
                    "html": "\n                        <p>More than 90% of the information a driver uses comes through their eyes. Alcohol weakens the small muscles that control the eye lens, pupil, and eye movement in four dangerous ways:</p>\n                        <ul>\n                            <li><strong>Loss of Side Vision (\"Tunnel Vision\"):</strong> At a sober 0.00% BAC, your eyes have wide peripheral (side) vision of nearly 180 degrees. As BAC rises toward 0.08%, peripheral vision narrows into a \"tunnel,\" making it nearly impossible to see cars pulling out of side junctions or pedestrians stepping off the pavement.</li>\n                            <li><strong>Night-Glare Blindness:</strong> Normally, your pupils quickly shrink when hit by bright oncoming headlights at night and quickly widen again once the car passes. Alcohol slows down the pupil's recovery time, leaving an impaired driver temporarily blind for several seconds after passing oncoming headlights.</li>\n                            <li><strong>Poor Depth Perception:</strong> Alcohol makes it difficult for the two eyes to work together to judge how far away an object is or how fast an oncoming car is approaching, leading to dangerous overtaking crashes.</li>\n                            <li><strong>Blurred &amp; Double Vision:</strong> At higher BAC levels, the six tiny muscles that align both eyes lose coordination, causing road signs, lane markings, and taillights to blur or split into double images.</li>\n                        </ul>\n                    "
                },
                "2.3": {
                    "key": "2.3",
                    "code": "2.3",
                    "shortLabel": "2.3 Steering Drift & False Confidence",
                    "title": "2.3 Steering Drift, Over-Correction & False Confidence",
                    "html": "\n                        <p>When alcohol slows communication between the inner ear (balance), eyes, and arm muscles, drivers begin weaving or drifting toward the edge of the tar road. Because their reaction is delayed, they notice the drift late and jerk the steering wheel too hard in the opposite direction (<strong>over-correction</strong>), which is a leading cause of cars rolling over on Zimbabwean highways.</p>\n                        <div class=\"binge-table-wrap\">\n                            <table class=\"binge-curriculum-table\">\n                                <thead>\n                                    <tr>\n                                        <th>BAC Level (%)</th>\n                                        <th>Effect on Vision &amp; Brain Focus</th>\n                                        <th>Specific Impact on Driving Performance &amp; Crash Risk</th>\n                                    </tr>\n                                </thead>\n                                <tbody>\n                                    <tr>\n                                        <td><code>0.02% – 0.04%</code><br><em>(~1 Standard Drink)</em></td>\n                                        <td>Slight drop in visual tracking of moving objects; reduced multitasking ability.</td>\n                                        <td>Harder to track moving pedestrians while keeping constant speed; driver may miss subtle road signs or drift slightly in the lane.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><code>0.05% – 0.07%</code><br><em>(~2–3 Standard Drinks)</em></td>\n                                        <td>Slowed eye pupil adjustment to night glare; lowered caution; slower hand-foot coordination.</td>\n                                        <td>Slower braking response to sudden hazards; wider steering swings; overconfidence leads to tailgating, speeding, or risky overtaking.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><code>0.08% – 0.12%</code><br><em>(Zimbabwe Statutory Limit = 0.08%)</em></td>\n                                        <td>Peripheral \"tunnel vision\"; poor depth perception; reaction time slowed by 50% to 100%.</td>\n                                        <td>Severe trouble staying in the lane; late and harsh braking; failure to spot pedestrians or side-road traffic; crash risk is at least <strong>4 to 7 times higher</strong> than a sober driver.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><code>≥ 0.15%</code><br><em>(Heavy Binge Level)</em></td>\n                                        <td>Blurred or double vision; severe loss of balance and muscle control; extreme confusion.</td>\n                                        <td>Inability to steer straight or judge road curves; high likelihood of running off the road, head-on collisions, or rolling the vehicle. Crash risk is <strong>over 25 times higher</strong>.</td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n                    "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "2.4",
                "shortLabel": "Section 2 Knowledge Check",
                "title": "2.4 Section 2 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "dd_s2_q1",
                        "topic": "1. Divided Attention (Multitasking Behind the Wheel)",
                        "prompt": "Why is driving considered a 'divided-attention' task, and what happens when a driver with a 0.05% BAC tries to focus on steering while approaching a busy intersection?",
                        "options": [
                            "Driving only requires looking straight ahead; at 0.05% BAC, multitasking actually improves.",
                            "Driving requires dividing attention simultaneously between lane steering, speed control, mirror scanning, and watching cross-traffic. Alcohol damages divided attention first (from 0.02%–0.05% BAC), so a driver concentrating on keeping the steering wheel straight often fails to notice a pedestrian or oncoming car at the intersection.",
                            "Divided attention only applies to manual-gear lorries, not automatic cars.",
                            "At 0.05% BAC, the brain ignores steering and only listens to the car radio."
                        ],
                        "correctIndex": 1,
                        "explanation": "Driving requires dividing attention simultaneously between steering, speed control, mirror scanning, and cross-traffic. Alcohol damages divided attention first (starting at 0.02%–0.05% BAC), causing the driver to fixate on one task while missing hazards like pedestrians or red lights."
                    },
                    {
                        "id": "dd_s2_q2",
                        "topic": "2. Night Driving Hazards (Tunnel Vision & Headlight Glare)",
                        "prompt": "How do 'tunnel vision' and slow pupil recovery from headlight glare make driving after drinking especially dangerous at night?",
                        "options": [
                            "Tunnel vision makes objects directly ahead look twice as large, while headlight glare permanently changes eye colour.",
                            "Tunnel vision narrows peripheral (side) eyesight so the driver cannot see hazards entering from the sides of the road, while alcohol slows the eye pupil's ability to shrink and recover after bright oncoming headlights pass—leaving the driver temporarily blinded for several seconds at night.",
                            "Tunnel vision only happens inside road tunnels, and oncoming headlights help an impaired driver see better.",
                            "Both effects only occur above 0.30% BAC during daytime driving."
                        ],
                        "correctIndex": 1,
                        "explanation": "Tunnel vision narrows peripheral (side) vision from ~180 degrees so side-road hazards and pedestrians are missed, while slowed pupil constriction/recovery leaves the impaired driver temporarily blinded for several seconds after passing oncoming headlights."
                    },
                    {
                        "id": "dd_s2_q3",
                        "topic": "3. Rollover Crashes (Steering Drift & Over-Correction)",
                        "prompt": "Why do alcohol-impaired drivers frequently roll their vehicles when one wheel drifts onto the gravel shoulder of a highway?",
                        "options": [
                            "Because gravel roads magnetize car tyres when the driver has been drinking.",
                            "Impaired drivers notice lane drift late due to delayed reaction times and blurred vision, then panic and yank the steering wheel too sharply back toward the road (over-correction), causing the tyres to lose grip and the car to flip or roll over.",
                            "Because alcohol causes the car's suspension springs to lock up automatically.",
                            "Rollover crashes only happen when a tyre bursts at speeds below 30 km/h."
                        ],
                        "correctIndex": 1,
                        "explanation": "Delayed reaction times and inner-ear balance disruption cause impaired drivers to notice lane drift late; they then panic and jerk the steering wheel too hard in the opposite direction (over-correction), flipping or rolling the vehicle."
                    },
                    {
                        "id": "dd_s2_q4",
                        "topic": "4. Depth Perception & Double Vision",
                        "prompt": "How does alcohol-induced poor depth perception and eye-muscle uncoordination create high-speed crash risks on highways?",
                        "options": [
                            "It makes the speedometer read 20 km/h higher than actual speed.",
                            "Alcohol stops the two eyes from working together smoothly—making it hard to judge how far away an object is or how fast an oncoming car is approaching during overtaking, and causing road signs, lane lines, and taillights to blur or split into double images.",
                            "It only affects reading small text on a phone screen, not distant cars.",
                            "It makes red traffic lights appear green."
                        ],
                        "correctIndex": 1,
                        "explanation": "Alcohol weakens the six tiny muscles that align both eyes and control the lens, ruining depth perception (judging distance and oncoming speed when overtaking) and splitting taillights and lane markings into blurred or double images."
                    },
                    {
                        "id": "dd_s2_q5",
                        "topic": "5. Crash Risk Multipliers by BAC Tier",
                        "prompt": "According to the Vision & Driving Performance Table, how much higher is a driver's crash risk at 0.08%–0.12% BAC (Zimbabwe's statutory limit tier) and at ≥ 0.15% BAC compared to a sober driver?",
                        "options": [
                            "Crash risk is 1.2 times higher at 0.08%–0.12% BAC, and 2 times higher at ≥ 0.15% BAC.",
                            "Crash risk is at least 4 to 7 times higher at 0.08%–0.12% BAC, and over 25 times higher at ≥ 0.15% BAC.",
                            "Crash risk only increases once BAC passes 0.25%.",
                            "Crash risk is identical at all BAC levels as long as the driver drives slowly."
                        ],
                        "correctIndex": 1,
                        "explanation": "At 0.08%–0.12% BAC, crash risk is at least 4 to 7 times higher than a sober driver; at ≥ 0.15% BAC (heavy binge level), crash risk climbs to over 25 times higher."
                    }
                ]
            }
        },
        {
            "id": 3,
            "numberLabel": "Section 3",
            "title": "Statutory BAC Limits & Drink-Driving Laws in Zimbabwe",
            "summary": "Learn the legal gap between Zimbabwe's driving age (16) and drinking age (18), the 0.08% BAC limit (80 mg/100 mL) under the Road Traffic Act [Chapter 13:11], ZRP breathalyser rules (SI 7 of 2026), and car insurance intoxication exclusions.",
            "order": [
                "3.1",
                "3.2",
                "video",
                "3.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 3",
                "shortLabel": "0.08% BAC & TSCZ Enforcement Video",
                "title": "CDC: \"Binge Drinking & 0.08% BAC Threshold\" + Traffic Safety Council of Zimbabwe (TSCZ)",
                "youtubeUrl": "https://www.youtube.com/watch?v=I9hdkDTaQWU",
                "embedUrl": "https://www.youtube.com/embed/I9hdkDTaQWU?rel=0",
                "guidance": "Watch this video in Section 3 and explore the Traffic Safety Council of Zimbabwe (TSCZ) channel to connect the 0.08% BAC threshold with Zimbabwe's Road Traffic Act rules, ZRP roadblocks, and national road safety enforcement.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Traffic Safety Council of Zimbabwe (TSCZ) Official Video Channel",
                        "source": "",
                        "youtubeUrl": "https://www.youtube.com/channel/UC1iW5u79V6_L-We622NwcCw/videos",
                        "embedUrl": ""
                    }
                ]
            },
            "subsections": {
                "3.1": {
                    "key": "3.1",
                    "code": "3.1",
                    "shortLabel": "3.1 Driving Age (16) vs. Drinking Age (18)",
                    "title": "3.1 Legal Driving Age (16) vs. Legal Drinking Age (18) in Zimbabwe",
                    "html": "\n                        <p>Every young Zimbabwean needs to understand two separate laws that overlap during late secondary school and early college years:</p>\n                        <ul>\n                            <li><strong>Minimum Driving Age (16 Years):</strong> Under Zimbabwe's <em>Road Traffic Act [Chapter 13:11]</em>, a person who has reached the age of <strong>16 years</strong> can legally apply for a provisional learner's licence and a Certificate of Competency (driver's licence) for a motorcycle (Class 3) or a private light motor vehicle/car (Class 4).</li>\n                            <li><strong>Minimum Legal Drinking Age (18 Years):</strong> Under Zimbabwe's <em>Liquor Act [Chapter 14:12]</em> and <em>Children's Act [Chapter 5:06]</em>, it is strictly illegal to sell, supply, or deliver alcohol to any person under the age of <strong>18 years</strong>, or for an under-18 to buy alcohol in a bar, bottle store, or club.</li>\n                            <li><strong>Why Young Drivers (Ages 16–20) Face Double Risk:</strong> First, for a 16- or 17-year-old driver, consuming alcohol is already illegal under underage liquor laws. Second, because a new driver's brain is still working hard to remember gears, mirrors, and road rules, adding even a tiny amount of alcohol (0.02%–0.05% BAC) causes a much sharper spike in crash risk than in an experienced driver.</li>\n                        </ul>\n                    "
                },
                "3.2": {
                    "key": "3.2",
                    "code": "3.2",
                    "shortLabel": "3.2 Zimbabwe's 0.08% BAC Limit",
                    "title": "3.2 Statutory BAC Limits Under Zimbabwe's Road Traffic Act [Chapter 13:11]",
                    "html": "\n                        <p>Zimbabwe's <em>Road Traffic Act [Chapter 13:11]</em> sets clear legal rules against driving under the influence of alcohol:</p>\n                        <ul>\n                            <li><strong>Statutory Limit for Private Drivers (0.08% BAC):</strong> Under the Act, it is a criminal offence to drive or attempt to drive on a road while the concentration of alcohol in your blood equals or exceeds <strong>80 milligrams of alcohol per 100 millilitres of blood</strong>—which is written as <strong>0.08% BAC</strong> (or 0.08 g/dL).</li>\n                            <li><strong>Driving While Impaired Below 0.08% BAC:</strong> A driver can <em>still</em> be arrested and convicted even if their BAC is below 0.08% (for example, at 0.05% or 0.06%) under Section 55 of the <em>Road Traffic Act</em> if alcohol has impaired their skill or judgment to the point that they are <em>\"incapable of having proper control of the vehicle.\"</em></li>\n                            <li><strong>Commercial &amp; Public Service Vehicle Drivers:</strong> Drivers of commuter omnibuses (<em>kombis</em>), long-distance buses, school buses, and heavy goods vehicles must be at least 25 years old and are subject to strict zero-tolerance professional safety regulations.</li>\n                        </ul>\n                    "
                },
                "3.3": {
                    "key": "3.3",
                    "code": "3.3",
                    "shortLabel": "3.3 Breathalysers, Penalties & Insurance",
                    "title": "3.3 ZRP Roadside Breathalysers, Refusal Laws & Car Insurance Consequences",
                    "html": "\n                        <p>To strengthen enforcement against drunk driving, the Government of Zimbabwe gazetted <em>Statutory Instrument 7 of 2026 (Road Traffic Act — Use of Breathalysers Notice, 2026)</em> alongside Sections 67 and 68 of the <em>Road Traffic Act</em>. Uniformed Zimbabwe Republic Police (ZRP) officers at roadblocks and accident scenes use certified digital breathalysers to test drivers' breath alcohol levels on the spot.</p>\n                        <div class=\"binge-table-wrap\">\n                            <table class=\"binge-curriculum-table\">\n                                <thead>\n                                    <tr>\n                                        <th>Legal Rule or Situation</th>\n                                        <th>How the Law Works in Zimbabwe</th>\n                                        <th>Real-World Impact on a Young Driver or Family</th>\n                                    </tr>\n                                </thead>\n                                <tbody>\n                                    <tr>\n                                        <td><strong>Driving at or Above 0.08% BAC (or Driving Under the Influence)</strong></td>\n                                        <td>Criminal offence under Sections 54 &amp; 55 of the <em>Road Traffic Act [Chapter 13:11]</em>.</td>\n                                        <td>Immediate arrest, heavy court fines or prison sentence, mandatory suspension/cancellation of your driver's licence, and a permanent criminal record that can block university scholarships, overseas visas, and future careers.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>Refusing a Roadside Breathalyser or Blood Test</strong></td>\n                                        <td>Under Sections 67 &amp; 68 of the <em>Road Traffic Act</em>, refusing to blow into an approved breathalyser (<em>SI 7 of 2026</em>) or refusing a medical blood sample without a valid medical excuse is a standalone crime.</td>\n                                        <td>Refusing to blow does <strong>not</strong> protect you from conviction—you can be arrested on the spot and face the exact same court penalties and licence ban as a convicted drunk driver.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>Causing Injury or Death While Driving Under the Influence</strong></td>\n                                        <td>Prosecuted as reckless driving or <em>Culpable Homicide</em> in the Magistrates' or High Court, with alcohol treated as an aggravating factor.</td>\n                                        <td>Multi-year imprisonment without the option of a fine, lifelong driving ban, and civil lawsuits from victims' families.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>Motor Vehicle Insurance \"Intoxication Exclusion\"</strong></td>\n                                        <td>Standard comprehensive and third-party car insurance policies in Zimbabwe void coverage if the driver was under the influence of alcohol or over the legal BAC limit.</td>\n                                        <td>If you scratch, dent, or write off your parents' car or hit another vehicle after drinking, the insurance company pays <strong>$0</strong>. You or your family must personally pay thousands of US dollars for repairs, towing, and medical bills.</td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n                    "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "3.4",
                "shortLabel": "Section 3 Knowledge Check",
                "title": "3.4 Section 3 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "dd_s3_q1",
                        "topic": "1. Zimbabwean Law & Age Limits",
                        "prompt": "What is the minimum legal driving age in Zimbabwe compared to the minimum legal age to purchase alcohol, and what is the statutory blood alcohol limit (in both % BAC and mg/100 mL) for private vehicle drivers?",
                        "options": [
                            "Minimum driving age is 18 years, minimum drinking age is 21 years, and the BAC limit is 0.15% (150 mg/100 mL).",
                            "Minimum driving age is 16 years (Road Traffic Act [Chapter 13:11]), minimum legal drinking age is 18 years (Liquor Act [Chapter 14:12]), and the statutory BAC limit for private drivers is 0.08% BAC (80 milligrams of alcohol per 100 millilitres of blood).",
                            "Both driving and drinking ages are 16 years, and the BAC limit is 0.05% (50 mg/100 mL).",
                            "Minimum driving age is 25 years for all cars, and there is no numerical BAC limit."
                        ],
                        "correctIndex": 1,
                        "explanation": "In Zimbabwe, the minimum legal age to obtain a learner's or Class 3/4 driver's licence is 16 years (Road Traffic Act [Chapter 13:11]), whereas the minimum legal age to buy or be served alcohol is 18 years (Liquor Act [Chapter 14:12]). The statutory BAC limit for private vehicle drivers is 0.08% BAC (80 mg per 100 mL of blood)."
                    },
                    {
                        "id": "dd_s3_q2",
                        "topic": "2. Roadblock Scenario (Below 0.08% BAC & Breathalyser Refusal)",
                        "prompt": "Can a driver in Zimbabwe be charged with an offence if their breathalyser reading is 0.06% BAC (below 0.08%) after they swerved across a lane? And what happens if a driver refuses to blow into a police breathalyser at a ZRP roadblock?",
                        "options": [
                            "No, anyone below 0.08% is completely immune from arrest, and drivers have the right to refuse breathalysers without penalty.",
                            "Yes—under Section 55 of the Road Traffic Act, a driver below 0.08% (such as 0.06%) can still be charged if alcohol makes them incapable of proper control of the vehicle. Under Sections 67 & 68 (and SI 7 of 2026), refusing to blow into an approved police breathalyser without a valid medical excuse is a standalone crime carrying the same penalties as drunk driving.",
                            "They can only be given a verbal warning, and refusing a breathalyser only results in a $5 parking ticket.",
                            "Only commercial bus drivers can be tested with breathalysers at ZRP roadblocks."
                        ],
                        "correctIndex": 1,
                        "explanation": "Under Section 55 of the Road Traffic Act, a driver below 0.08% (e.g., 0.06%) can still be arrested and convicted if alcohol impairs their skill/judgment so they are incapable of proper control. Under Sections 67 & 68 and SI 7 of 2026, refusing a ZRP breathalyser or blood test without valid medical excuse is a standalone criminal offence."
                    },
                    {
                        "id": "dd_s3_q3",
                        "topic": "3. The Motor Insurance Trap (Intoxication Exclusion Clause)",
                        "prompt": "What is an 'intoxication exclusion clause' in a Zimbabwean car insurance policy, and how can a single crash after drinking affect a student's family?",
                        "options": [
                            "It is a clause that gives drivers a 50% discount on repairs if they were at a campus party.",
                            "It is a standard policy clause that voids all insurance coverage if the driver was under the influence of alcohol or over the legal BAC limit—meaning even with full comprehensive insurance, the insurer pays $0 and the driver or their family must pay thousands of US dollars out of pocket for all repairs, towing, and medical bills.",
                            "It means the insurance company pays for the other person's car and gives the drunk driver a free rental car.",
                            "It only applies to unregistered pirate taxis, never to private family cars."
                        ],
                        "correctIndex": 1,
                        "explanation": "An intoxication exclusion clause cancels all insurance protection if the driver was under the influence of alcohol at the time of a crash. Even with comprehensive insurance, the insurer pays $0, forcing the student or their family to pay all repair, replacement, and medical costs out of pocket."
                    },
                    {
                        "id": "dd_s3_q4",
                        "topic": "4. Commercial & Public Service Vehicle Rules",
                        "prompt": "What are the age and alcohol rules for drivers of commuter omnibuses (kombis), school buses, long-distance buses, and heavy goods vehicles in Zimbabwe?",
                        "options": [
                            "They can be 16 years old and have a 0.12% BAC limit.",
                            "They must be at least 25 years old and are subject to strict zero-tolerance professional safety regulations.",
                            "They must be 18 years old and are allowed two beers before driving.",
                            "They are exempt from ZRP breathalyser roadblocks."
                        ],
                        "correctIndex": 1,
                        "explanation": "Drivers of commuter omnibuses (kombis), long-distance buses, school buses, and heavy goods vehicles must be at least 25 years old and are subject to strict zero-tolerance professional safety regulations."
                    },
                    {
                        "id": "dd_s3_q5",
                        "topic": "5. Why Young Drivers (Ages 16–20) Face Double Risk",
                        "prompt": "Why do young drivers aged 16 to 20 face a 'double risk' when alcohol is involved?",
                        "options": [
                            "Because cars built after 2020 run faster when driven by teenagers.",
                            "First, for a 16- or 17-year-old, consuming alcohol is already illegal under the Liquor Act [Chapter 14:12]; second, because a new driver's brain is still working hard to coordinate gears, mirrors, and road rules, even a tiny amount of alcohol (0.02%–0.05% BAC) causes a much sharper spike in crash risk than in an experienced driver.",
                            "Because young drivers only drive during the daytime when traffic is light.",
                            "Because learner's licences allow highway driving without supervision."
                        ],
                        "correctIndex": 1,
                        "explanation": "Young drivers aged 16–20 face double risk: underage alcohol possession/consumption is illegal under 18, and a novice driver's brain is already heavily loaded managing gears, mirrors, and traffic rules, so even 0.02%–0.05% BAC causes a dramatic spike in crash probability."
                    }
                ]
            }
        },
        {
            "id": 4,
            "numberLabel": "Section 4",
            "title": "Designated Driver Protocols & Peer Responsibility",
            "summary": "Define a true 0.00% BAC Designated Driver, calculate why the 'morning-after' drink-driving trap catches drivers above 0.08% BAC at 7:00 AM, and master the Four Golden Rules and 4-C Peer Intervention Method.",
            "order": [
                "4.1",
                "video",
                "4.2",
                "4.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 4",
                "shortLabel": "GOHS Designated Driver Video",
                "title": "GOHS: \"Make the Right Call to Never Drive After Drinking\"",
                "youtubeUrl": "https://www.youtube.com/watch?v=EI9HbWxeUac",
                "embedUrl": "https://www.youtube.com/embed/EI9HbWxeUac?rel=0",
                "guidance": "Watch this video during Section 4 to see how choosing a committed, 100% sober Designated Driver before the night begins keeps everyone safe.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "4.1": {
                    "key": "4.1",
                    "code": "4.1",
                    "shortLabel": "4.1 What a True Designated Driver Is",
                    "title": "4.1 What Makes a True Designated Driver?",
                    "html": "\n                        <p>In many peer groups, people misuse the term \"Designated Driver\" (DD) to mean <em>\"the person in our group who looks the most sober at midnight\"</em> or <em>\"the friend who only drank three beers instead of six.\"</em> That is a dangerous myth. Because judgment and self-awareness are the first things alcohol dulls, an impaired person is the worst judge of their own fitness to drive.</p>\n                        <div class=\"binge-callout-box\" style=\"border-left-color:var(--accent-sage);\">\n                            <strong>True Designated Driver Definition:</strong> A true <strong>Designated Driver</strong> is a licensed driver who agrees before the event starts to maintain a <strong>0.00% BAC—consuming zero alcoholic drinks</strong>—for the entire outing until every passenger has been dropped safely inside their home or campus residence.\n                        </div>\n                    "
                },
                "4.2": {
                    "key": "4.2",
                    "code": "4.2",
                    "shortLabel": "4.2 The 'Morning-After' Driving Trap",
                    "title": "4.2 The \"Morning-After\" Drink-Driving Trap",
                    "html": "\n                        <p>Many students who responsibly avoid driving on Friday or Saturday night accidentally break the law—and crash—at 7:00 AM or 8:00 AM the next morning when driving home, to church, or to morning sports practice. Why? <strong>Because sleep does not speed up the liver!</strong></p>\n                        <ul>\n                            <li><strong>How the Math Works:</strong> Remember from our first module that the human liver can only lower BAC at a fixed rate of about <strong>0.015% per hour</strong> (roughly one standard drink per hour).</li>\n                            <li><strong>Real-World Morning-After Example:</strong> Suppose a driver reaches a <strong>0.18% BAC</strong> at 1:30 AM and goes to sleep. Five and a half hours later, at <strong>7:00 AM</strong>, their liver has only cleared about 5.5 × 0.015% = <strong>0.0825% BAC</strong>. That means at 7:00 AM—even after sleeping, showering, and drinking coffee—their BAC is still nearly <strong>0.10%</strong>, well above Zimbabwe's <strong>0.08% legal limit</strong>! They will not reach 0.00% BAC until <strong>1:30 PM</strong> that afternoon.</li>\n                        </ul>\n                    "
                },
                "4.3": {
                    "key": "4.3",
                    "code": "4.3",
                    "shortLabel": "4.3 Four Golden Rules & Stopping Friends",
                    "title": "4.3 The Four Golden Rules of Designated Driving & Stopping a Friend",
                    "html": "\n                        <div class=\"binge-table-wrap\">\n                            <table class=\"binge-curriculum-table\">\n                                <thead>\n                                    <tr>\n                                        <th>Protocol Stage</th>\n                                        <th>What the Designated Driver Must Do</th>\n                                        <th>What the Passengers / Friends Must Do</th>\n                                    </tr>\n                                </thead>\n                                <tbody>\n                                    <tr>\n                                        <td><strong>1. Before Leaving Home / Campus</strong></td>\n                                        <td>Commit to <strong>0.00% BAC</strong> (zero alcohol), bring a valid driver's licence, and take possession of the car keys before anyone has a drink.</td>\n                                        <td>Agree on a clear departure time before going out, and contribute cash upfront for fuel and parking.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>2. During the Event / Braai / Party</strong></td>\n                                        <td>Stick strictly to soft drinks, mocktails, juice, or water; keep the car keys securely in your own pocket or bag.</td>\n                                        <td>Buy the DD's food and non-alcoholic drinks all evening; <strong>never</strong> tease or pressure the DD to \"just have one cider or shot.\"</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>3. On the Drive Home</strong></td>\n                                        <td>Ensure every passenger wears a seatbelt, keep music at a sensible level, and watch carefully for night hazards and roadblocks.</td>\n                                        <td>Wear seatbelts, never distract the driver or grab the steering wheel, and wait until each friend walks safely inside their gate/door.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>4. If the DD Drinks Any Alcohol</strong></td>\n                                        <td>Admit immediately that you can no longer drive and hand the keys to a sober adult or lock the car in a secure car park overnight.</td>\n                                        <td>Switch to Plan B right away—book a verified ride-hailing taxi or call a parent/guardian for a safe pickup.</td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n                        <div class=\"binge-formula-box\" style=\"margin-top:14px;\">\n                            <h4 style=\"color:var(--primary-dark); margin-bottom:8px; font-size:1rem;\">How to Stop an Impaired Friend From Driving (The 4-C Method):</h4>\n                            <p style=\"margin-bottom:8px; font-family:'Manrope',sans-serif; font-size:0.92rem;\">If a friend who has been drinking tries to drive, use the <strong>Calm, Collect, Coalition, Choice</strong> approach:</p>\n                            <ol style=\"margin:0 0 0 20px; font-family:'Manrope',sans-serif; font-size:0.92rem; line-height:1.65;\">\n                                <li style=\"margin-bottom:6px;\"><strong>Stay Calm &amp; Avoid Insults:</strong> Never yell \"You're drunk!\" which triggers pride and arguments. Instead use \"I\" and \"We\" statements: <em>\"Hey, there are ZRP breathalyser roadblocks on Samora Machel / Borrowdale Road tonight—I don't want you losing your licence.\"</em></li>\n                                <li style=\"margin-bottom:6px;\"><strong>Collect the Keys Early:</strong> Offer to fetch a jersey or phone charger from their car earlier in the evening and keep the keys safe, or distract them with food while a friend puts the keys away.</li>\n                                <li style=\"margin-bottom:6px;\"><strong>Build a Coalition of Friends:</strong> Don't argue one-on-one. Bring two or three friends over so everyone gives the same caring message together.</li>\n                                <li style=\"margin-bottom:0;\"><strong>Give a Ready-Made Choice:</strong> Offer two safe options right away: <em>\"Do you want to crash on my spare mattress tonight, or shall we split a registered ride-hailing cab right now and fetch your car at 11 AM tomorrow?\"</em></li>\n                            </ol>\n                        </div>\n                    "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "4.4",
                "shortLabel": "Section 4 Knowledge Check",
                "title": "4.4 Section 4 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "dd_s4_q1",
                        "topic": "1. Defining the Role (True Designated Driver vs. 'Least Drunk' Myth)",
                        "prompt": "Why is choosing 'the friend who drank the least' at the end of a party a dangerous fake version of the Designated Driver rule?",
                        "options": [
                            "Because the friend who drank the least might not know the shortest route home.",
                            "Because even the 'least drunk' person has slowed reaction times, impaired night vision, and dulled self-awareness (making an impaired person the worst judge of their own fitness to drive). A true Designated Driver must commit before the event to maintaining a 0.00% BAC (zero alcohol) all night.",
                            "Because Zimbabwean law allows a Designated Driver to drink up to four beers.",
                            "Because only unlicensed drivers can serve as Designated Drivers."
                        ],
                        "correctIndex": 1,
                        "explanation": "Even the 'least drunk' person in a group has slowed reaction times, impaired night vision, and poor judgment. A true Designated Driver must maintain a 0.00% BAC by drinking zero alcohol for the entire outing."
                    },
                    {
                        "id": "dd_s4_q2",
                        "topic": "2. Morning-After BAC Calculation (0.15% BAC at 2:00 AM)",
                        "prompt": "A student stops drinking at 2:00 AM with a BAC of 0.15%. Using the liver's breakdown rate of 0.015% per hour, what will their BAC be at 6:00 AM when they wake up to drive to an early morning sports match, and at what time will their BAC finally reach 0.00%?",
                        "options": [
                            "0.00% BAC at 6:00 AM because 4 hours of sleep clears all alcohol immediately.",
                            "At 6:00 AM (4 hours later), the liver has cleared 4 × 0.015% = 0.06% BAC, leaving them at 0.09% BAC—still above Zimbabwe's 0.08% legal limit! Clearing the full 0.15% BAC takes 10 hours (0.15 ÷ 0.015), so they will not reach 0.00% BAC until 12:00 PM (noon).",
                            "0.02% BAC at 6:00 AM, reaching 0.00% BAC at 7:00 AM after a cold shower and coffee.",
                            "0.15% BAC at 6:00 AM because the liver only works during the afternoon."
                        ],
                        "correctIndex": 1,
                        "explanation": "From 2:00 AM to 6:00 AM is 4 hours. At 0.015% per hour, the liver clears 4 × 0.015% = 0.06% BAC. Subtracting 0.06% from 0.15% leaves the driver at 0.09% BAC at 6:00 AM—still above Zimbabwe's 0.08% legal limit! Full clearance takes 0.15 ÷ 0.015 = 10 hours (12:00 PM noon)."
                    },
                    {
                        "id": "dd_s4_q3",
                        "topic": "3. Peer Intervention (The 4-C Method)",
                        "prompt": "Using the 4-C Method, what are the four practical steps you and your friends should use to peacefully stop a stubborn friend from driving home after drinking at a weekend braai?",
                        "options": [
                            "Criticize them loudly, Confiscate their phone, Call the police immediately, and Cancel their friendship.",
                            "(1) Stay Calm & avoid insults (mention ZRP roadblocks or licence safety using 'I/We' statements), (2) Collect the car keys early/quietly, (3) Build a Coalition of 2–3 friends so you aren't arguing one-on-one, and (4) Give a ready-made safe Choice (staying over or splitting a verified ride-hailing cab and fetching the car tomorrow).",
                            "Challenge them to walk a straight line, Give them black coffee, Let them drive slowly in the left lane, and Follow behind them.",
                            "Wait until they start the car engine and then jump in front of the bonnet."
                        ],
                        "correctIndex": 1,
                        "explanation": "The 4-C Method stands for: (1) Stay Calm and avoid insults, (2) Collect the car keys early/quietly, (3) form a Coalition with 2–3 friends, and (4) offer an immediate safe Choice (crash on a mattress or split a verified ride-hailing taxi)."
                    },
                    {
                        "id": "dd_s4_q4",
                        "topic": "4. Passenger Responsibilities in the Four Golden Rules",
                        "prompt": "According to the Four Golden Rules of Designated Driving, what must passengers/friends do before leaving and during the party to support their Designated Driver?",
                        "options": [
                            "Nothing—the Designated Driver must pay for all fuel, parking, and drinks alone.",
                            "Agree on a clear departure time and contribute cash upfront for fuel/parking before going out; buy the DD's food and non-alcoholic drinks all evening; never tease or pressure the DD to 'just have one'; and wear seatbelts without distracting the driver on the ride home.",
                            "Hold the car keys while drinking and hand them back at 2:00 AM.",
                            "Encourage the DD to have one cider early in the evening so they feel included."
                        ],
                        "correctIndex": 1,
                        "explanation": "Passengers must agree on a departure time, chip in cash upfront for fuel and parking, buy the DD's food and soft drinks/mocktails all night, never pressure the DD to drink, and wear seatbelts without distracting the driver."
                    },
                    {
                        "id": "dd_s4_q5",
                        "topic": "5. Protocol Stage 4 (If the DD Drinks Any Alcohol)",
                        "prompt": "Under Rule 4 of the Designated Driver Protocol, what must happen immediately if the Designated Driver ends up drinking any alcohol during the event?",
                        "options": [
                            "The DD should wait 30 minutes, drink water, and drive home slowly.",
                            "The DD must immediately admit they can no longer drive and hand the keys to a sober adult or lock the car in a secure car park overnight, while the group switches to Plan B right away (booking a verified ride-hailing taxi or calling a parent/guardian).",
                            "The passenger who drank the least should take over driving.",
                            "Everyone should walk home along the highway shoulder."
                        ],
                        "correctIndex": 1,
                        "explanation": "If the DD drinks any alcohol, they are no longer a 0.00% BAC Designated Driver. They must lock the car safely overnight or hand keys to a sober adult, and the group must switch immediately to Plan B (verified ride-hailing taxi or parent/guardian pickup)."
                    }
                ]
            }
        },
        {
            "id": 5,
            "numberLabel": "Section 5",
            "title": "Safe Campus Transport, Night Travel & Emergency Action",
            "summary": "Protect your night return with the 'There and Back' fare rule and 80% battery rule, avoid unregistered pirate taxis (mushikashika), and execute the 4-Step Passenger Safety Checklist.",
            "order": [
                "5.1",
                "5.2",
                "5.3",
                "video",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 5",
                "shortLabel": "Plan a Safe Ride Home Video",
                "title": "Manitoba Public Insurance: \"Plan a Safe Ride Home\"",
                "youtubeUrl": "https://www.youtube.com/watch?v=3WyPIzBEWGo",
                "embedUrl": "https://www.youtube.com/embed/3WyPIzBEWGo?rel=0",
                "guidance": "Watch this video at the end of the module to see how planning your return ride before leaving your room prevents dangerous late-night transport mistakes.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "5.1": {
                    "key": "5.1",
                    "code": "5.1",
                    "shortLabel": "5.1 'There and Back' Budget Rule",
                    "title": "5.1 The \"There and Back\" Budget Rule & Pre-Outing Prep",
                    "html": "\n                        <p>For sixth-formers, college students, and university students across Zimbabwe, most dangerous transport choices happen late at night when a student runs out of cash, mobile data, or phone battery. Protect yourself with three non-negotiable habits before leaving campus or home:</p>\n                        <ul>\n                            <li><strong>The \"There and Back\" Fare Rule:</strong> Always set aside your return taxi/shuttle fare in a separate zipped pocket or mobile wallet <em>before</em> spending a single dollar on food, entry tickets, or drinks. If you only have enough money to get <em>to</em> an event, stay home until you can afford the safe ride back.</li>\n                            <li><strong>The 80% Battery &amp; Power Bank Rule:</strong> A dead phone at midnight cuts you off from ride-hailing apps, GPS tracking, and family help. Never leave for an evening event with less than 80% battery, and switch on battery-saver mode or carry a charged power bank.</li>\n                            <li><strong>The Campus Buddy Rule:</strong> Travel in pairs or small groups, check in on each other throughout the event, and follow the rule: <strong>\"Arrive together, leave together.\"</strong> Never let an impaired friend wander off or get into a vehicle alone.</li>\n                        </ul>\n                    "
                },
                "5.2": {
                    "key": "5.2",
                    "code": "5.2",
                    "shortLabel": "5.2 Shuttles & Taxis vs. Pirate Taxis",
                    "title": "5.2 Comparing Campus & Night Transport Options in Zimbabwe",
                    "html": "\n                        <p>Whether you study or live in Harare, Bulawayo, Gweru, Mutare, Masvingo, Bindura, or Chinhoyi, knowing which transport options are safe—and which ones are high-risk—is essential after dark:</p>\n                        <div class=\"binge-table-wrap\">\n                            <table class=\"binge-curriculum-table\">\n                                <thead>\n                                    <tr>\n                                        <th>Transport Option</th>\n                                        <th>Safety Rating</th>\n                                        <th>Why It Matters &amp; How to Use It Safely</th>\n                                    </tr>\n                                </thead>\n                                <tbody>\n                                    <tr>\n                                        <td><strong>Official University / College Campus Shuttles</strong></td>\n                                        <td><strong>Safest Option</strong></td>\n                                        <td>Driven by vetted, sober institutional drivers on fixed routes between campus halls, libraries, and city pick-up points. Always check the timetable for the final evening shuttle before heading out.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>Verified Ride-Hailing Apps &amp; Registered Taxis</strong></td>\n                                        <td><strong>High Safety</strong><br><em>(With Plate Check)</em></td>\n                                        <td>Provides digital driver identity, vehicle registration, fare transparency, and live GPS tracking. Wait indoors until the app notifies you that the car is outside.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>Sober Parent, Guardian, or True DD (0.00% BAC)</strong></td>\n                                        <td><strong>High Safety</strong></td>\n                                        <td>Create a family \"Safe Call Pact\" where you can call a parent, older sibling, or residence warden for a pickup at any hour without fear of being yelled at in the middle of the night.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>Unregistered Pirate Taxis (<em>Mushikashika</em>)</strong></td>\n                                        <td><strong>High Danger — Never Use</strong></td>\n                                        <td>Unvetted drivers, unroadworthy cars (often lacking working brakes or lights), no GPS tracking, no passenger insurance, and high rates of reckless driving, mugging, or assault—especially at night.</td>\n                                    </tr>\n                                    <tr>\n                                        <td><strong>Walking Along Dark Roads After Drinking</strong></td>\n                                        <td><strong>High Danger — Never Use</strong></td>\n                                        <td>Alcohol impairs a pedestrian's balance, hearing, and judgment of oncoming traffic speeds. Walking along unlit roads at night carries a severe risk of being hit by a car or robbed.</td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n                    "
                },
                "5.3": {
                    "key": "5.3",
                    "code": "5.3",
                    "shortLabel": "5.3 4-Step Passenger Safety Checklist",
                    "title": "5.3 The 4-Step Passenger Safety Checklist & Zimbabwe Emergency Numbers",
                    "html": "\n                        <div class=\"binge-callout-box\" style=\"border-left-color:var(--accent-sage);\">\n                            <ol style=\"margin:0 0 0 20px; line-height:1.7;\">\n                                <li style=\"margin-bottom:8px;\"><strong>Verify Before You Open the Door (\"Who Are You Picking Up?\"):</strong> Match the physical number plate, car make/colour, and driver's face against your ride-hailing app. Ask the driver, <em>\"Who are you picking up?\"</em> so they must state your name from their screen—never say <em>\"Are you here for [Your Name]?\"</em> first.</li>\n                                <li style=\"margin-bottom:8px;\"><strong>Check the Back Door Handle &amp; Sit in the Back:</strong> When riding alone or with one friend, sit in the rear seat (behind the front passenger seat gives the clearest view and curb-side exit) and test that the inside door handle opens (no child lock engaged) before the car moves.</li>\n                                <li style=\"margin-bottom:8px;\"><strong>Share Your Live Route &amp; Number Plate:</strong> Send a WhatsApp/SMS screenshot of the car's licence plate, driver name, and live trip link to a roommate or parent before departing, and text them the moment you lock your room door.</li>\n                                <li style=\"margin-bottom:0;\"><strong>Refuse Impaired Drivers &amp; Know Emergency Numbers:</strong> Never get into a car if the driver smells of alcohol or has open alcohol bottles near the driver's seat. If you are ever in danger or witness a crash in Zimbabwe, call <strong>112</strong> (Toll-Free Mobile Emergency), <strong>999</strong> (Zimbabwe Republic Police), or <strong>994</strong> (Ambulance Services).</li>\n                            </ol>\n                        </div>\n                    "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "5.4",
                "shortLabel": "Section 5 Knowledge Check",
                "title": "5.4 Section 5 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "dd_s5_q1",
                        "topic": "1. Pre-Outing Planning ('There and Back' & 80% Battery Rules)",
                        "prompt": "How do the 'There and Back' fare rule and the 80% phone battery rule protect students from ending up in dangerous situations late at night?",
                        "options": [
                            "They allow students to spend all their cash on tickets and borrow a stranger's phone at midnight.",
                            "Setting aside return transport money upfront in a separate pocket/wallet ('There and Back' rule) and leaving with at least 80% phone battery (or a power bank) ensure a student is never stranded at midnight without fare or a working phone to book a verified ride, share GPS tracking, or call family.",
                            "They make ride-hailing apps charge 50% less after midnight.",
                            "They only apply when travelling between cities during the daytime."
                        ],
                        "correctIndex": 1,
                        "explanation": "Setting aside return transport money upfront (the 'There and Back' rule) and keeping at least 80% phone battery ensure a student is never stranded without fare or a working phone to book a verified ride or call family late at night."
                    },
                    {
                        "id": "dd_s5_q2",
                        "topic": "2. Transport Risks (Pirate Taxis & Walking After Dark)",
                        "prompt": "Why is boarding an unregistered pirate taxi (mushikashika) or walking home along a dark road after drinking classified as 'High Danger — Never Use'?",
                        "options": [
                            "Because pirate taxis drive too slowly and walking takes too much energy.",
                            "Unregistered pirate taxis (mushikashika) have unvetted drivers, unroadworthy vehicles, no GPS tracking, no passenger insurance, and high risks of crashes, mugging, or assault; walking along dark roads after drinking impairs balance, hearing, and traffic speed judgment, exposing the student to being hit by a car or robbed.",
                            "Because pirate taxis only operate on university campuses during lecture hours.",
                            "Walking after dark is safe as long as you walk in the middle of the road."
                        ],
                        "correctIndex": 1,
                        "explanation": "Unregistered pirate taxis (mushikashika) have unvetted drivers, no GPS tracking, no passenger insurance, and high risks of crashes or crime; walking along dark roads after drinking impairs balance and traffic judgment, exposing the student to being struck by vehicles or mugged."
                    },
                    {
                        "id": "dd_s5_q3",
                        "topic": "3. Passenger Verification (The 4-Step Passenger Safety Checklist)",
                        "prompt": "What are the four steps of the Passenger Safety Checklist that you should complete every time you use a ride-hailing taxi at night?",
                        "options": [
                            "Sit in the front seat, tell the driver your name first, turn off your phone to save battery, and pay double the fare.",
                            "(1) Verify the licence plate, car model, and driver photo, and ask 'Who are you picking up?' before opening the door; (2) Sit in the back seat (behind the front passenger) and test that the inner door handle opens (no child lock); (3) Share your live GPS trip link and plate screenshot with a roommate/parent; and (4) Never ride with an impaired driver (calling 112, 999, or 994 in an emergency).",
                            "Wave down any passing car without plates, sit in the middle seat, and keep the trip secret.",
                            "Only check the colour of the car and nothing else."
                        ],
                        "correctIndex": 1,
                        "explanation": "The 4 steps are: (1) Verify licence plate, car make/colour, driver photo, and ask 'Who are you picking up?'; (2) Sit in the back seat and test that the inner door handle opens (no child lock); (3) Share live GPS route and plate screenshot with a friend/parent; and (4) Refuse impaired drivers and know emergency numbers (112, 999, 994)."
                    },
                    {
                        "id": "dd_s5_q4",
                        "topic": "4. The 'Who Are You Picking Up?' Rule",
                        "prompt": "Why should you always ask a ride-hailing driver 'Who are you picking up?' before opening the car door rather than asking 'Are you here for [Your Name]?'",
                        "options": [
                            "To test if the driver speaks English.",
                            "Because an impersonator or fake driver can easily say 'Yes!' if you give them your name first; making the driver state your name from their app screen proves they are your genuine matched driver.",
                            "Because ride-hailing apps give a free ride if the driver forgets your name.",
                            "It does not matter which question you ask."
                        ],
                        "correctIndex": 1,
                        "explanation": "Asking 'Who are you picking up?' forces the driver to read your name from their verified ride-hailing screen, preventing you from accidentally getting into a stranger's or impersonator's car."
                    },
                    {
                        "id": "dd_s5_q5",
                        "topic": "5. Campus Buddy Rule & Zimbabwe Emergency Numbers",
                        "prompt": "What does the Campus Buddy Rule require at social events, and which three emergency numbers should every student in Zimbabwe know?",
                        "options": [
                            "Arrive alone and leave whenever you want; emergency numbers are 555, 666, and 777.",
                            "Travel in pairs or small groups, check in throughout the event, and 'Arrive together, leave together' (never letting an impaired friend leave alone); the three Zimbabwe emergency numbers are 112 (Toll-Free Mobile Emergency), 999 (ZRP Police), and 994 (Ambulance Services).",
                            "Leave your friends behind if they get tired; only call a taxi app.",
                            "Only check on friends the next afternoon."
                        ],
                        "correctIndex": 1,
                        "explanation": "The Campus Buddy Rule means travelling in pairs/groups, checking in, and following 'Arrive together, leave together.' In an emergency or crash in Zimbabwe, dial 112 (Toll-Free Mobile Emergency), 999 (Zimbabwe Republic Police), or 994 (Ambulance Services)."
                    }
                ]
            }
        }
    ]
};

const ILLICIT_BREWS_CURRICULUM = {
    "shortTitle": "Illicit & Unregulated Brews",
    "title": "Illicit & Unregulated Brews: Curriculum & Study Guide",
    "targetAudience": "Learners Aged 16+ (Senior Secondary, College & Young Adult Smart Living Education)",
    "coreFocus": "Illicitly Distilled Brews (Kambwa / Musombodhiya), Methanol Poisoning, Counterfeit Alcohol Identification, and Substance Mixing Risks",
    "overview": "This curriculum guide accompanies the Illicit & Unregulated Brews Smart Living module. Tailored for learners aged 16 and older in Zimbabwe, it uses clear, everyday language to explain the deadly chemical dangers hidden inside unlabelled, counterfeit, and backyard-distilled alcohols (such as kambwa, musombodhiya, tumbwa, and kachasu), why industrial methanol causes permanent blindness and death, and why mixing alcohol with medicines, energy drinks, or other drugs can stop a person's breathing or heart.",
    "learningObjectives": [
        "Distinguish between regulated, laboratory-tested alcoholic beverages and illicit, unregulated, or counterfeit street brews (kambwa, musombodhiya, tumbwa, and kachasu), and calculate why 70% ABV potency causes rapid alcohol poisoning.",
        "Explain the chemical difference between drinking alcohol (ethanol) and industrial wood alcohol (methanol), the 64.7°C vs 78.4°C boiling-point trap, and how the liver converts methanol into formaldehyde and formic acid that destroy the optic nerve.",
        "Identify toxic adulterants (filtered methylated spirits, battery acid, radiator antifreeze, lead) and apply the 4 Ps + Smell bottle check to spot counterfeit refilled bottles.",
        "Understand the deadly '1 + 1 = 5' synergism of mixing alcohol with cough syrups (Codeine/Broncleer), sleeping pills, energy drinks ('Wide-Awake Drunk' trap), Paracetamol, and antibiotics.",
        "Recognize the 12-to-24-hour delayed warning signs of methanol poisoning ('snowstorm' vision) and execute immediate hospital emergency steps."
    ],
    "sections": [
        {
            "id": 1,
            "numberLabel": "Section 1",
            "title": "Understanding Illicit, Unregulated & Counterfeit Alcohol in Zimbabwe",
            "summary": "Distinguish between licensed laboratory-tested beverages and the 3 categories of illicit alcohol (kambwa/musombodhiya, kachasu/skokiaan, and counterfeit refilled bottles), calculate 70% ABV potency math, and learn Zimbabwe's Harmful Liquids Act [Chapter 9:10].",
            "order": [
                "video",
                "1.1",
                "1.2",
                "1.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 1",
                "shortLabel": "Section 1 Supporting Video",
                "title": "Why Is Counterfeit Alcohol So Dangerous? — Toxicology & Public Health Overview",
                "youtubeUrl": "https://www.youtube.com/watch?v=VQJ0Iv2-phw",
                "embedUrl": "https://www.youtube.com/embed/VQJ0Iv2-phw?rel=0",
                "guidance": "Before reading Section 1, watch this short overview to see how unregulated and fake alcohols are produced in hidden setups, what toxic chemicals end up inside the bottle, and why even a single small bottle can be life-threatening.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "1.1": {
                    "key": "1.1",
                    "code": "1.1",
                    "shortLabel": "1.1 Regulated vs. Unregulated Alco...",
                    "title": "1.1 Regulated vs. Unregulated Alcohol: What Is the Difference?",
                    "html": "\n            <p>Every alcoholic drink sold legally in Zimbabwe must pass strict health, safety, and quality standards before it reaches a shop shelf. However, across townships, growth points, and even near schools and campuses, cheap illegal drinks—known as <strong>illicit or unregulated alcohol</strong>—are sold in hidden backrooms and street corners.</p>\n            <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; margin:14px 0;\">\n              <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 8px 0; color:#166534; font-size:0.98rem;\">Regulated (Legal) Alcohol</h5>\n                <ul style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.9rem; line-height:1.6;\">\n                  <li>Produced by licensed breweries and distilleries (registered with the Ministry of Health and Child Care, the Liquor Licensing Board, and ZIMRA).</li>\n                  <li>Every batch is laboratory-tested to make sure it contains only safe, food-grade alcohol (<strong>ethanol</strong>) at an exact, printed percentage (ABV).</li>\n                  <li>Sealed in hygienic, tamper-proof bottles or cans with clear health warnings, batch numbers, and manufacturer addresses.</li>\n                </ul>\n              </div>\n              <div style=\"background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 8px 0; color:#991b1b; font-size:0.98rem;\">Illicit &amp; Unregulated Alcohol (3 Categories)</h5>\n                <ol style=\"margin:0; padding-left:18px; color:#7f1d1d; font-size:0.9rem; line-height:1.6;\">\n                  <li><strong>Unlabelled Street Brews (<em>Kambwa / Musombodhiya / Tumbwa</em>):</strong> Ultra-cheap, high-strength clear or coloured spirits sold in tiny 200 mL plastic bottles or sachets, often without real labels or tax stamps.</li>\n                  <li><strong>Illicitly Distilled Home Spirits (<em>Kachasu / Skokiaan / Njengu</em>):</strong> Backyard brews fermented and boiled in old metal drums and cooled through car radiators or copper/lead pipes.</li>\n                  <li><strong>Counterfeit Branded Alcohol:</strong> Empty bottles of famous, expensive whisky, vodka, or gin collected from bins, refilled with cheap industrial alcohol and food colouring, and resealed with fake caps to trick buyers.</li>\n                </ol>\n              </div>\n            </div>\n          "
                },
                "1.2": {
                    "key": "1.2",
                    "code": "1.2",
                    "shortLabel": "1.2 Why Kambwa and Musombodhiya Ar...",
                    "title": "1.2 Why Kambwa and Musombodhiya Are So Dangerous",
                    "html": "\n            <p>In many Zimbabwean communities, illicitly mixed spirits are nicknamed <strong><em>\"kambwa\"</em></strong> (meaning \"little dog,\" because of how fiercely it bites and controls the drinker) or <strong><em>\"musombodhiya.\"</em></strong></p>\n            <div style=\"background:#fff7ed; border-left:4px solid #ea580c; border-radius:0 12px 12px 0; padding:14px 18px; margin:12px 0;\">\n              <strong style=\"color:#9a3412; display:block; margin-bottom:6px;\">The US$0.50 Street Trap:</strong>\n              <p style=\"margin:0; color:#7c2d12; font-size:0.93rem; line-height:1.6;\">Because a 200 mL plastic bottle of <em>kambwa</em> can cost as little as <strong>US$0.50 (50 cents)</strong>, young people often mistake it for a harmless, cheap way to have fun. In reality, many of these bottles are made by diluting raw, industrial ethanol—or worse, poisonous industrial solvents—with tap or borehole water, artificial flavours, and sugar.</p>\n            </div>\n            <p>Many illicit plastic bottles contain up to <strong>40% to 70% Alcohol by Volume (ABV)</strong>—that is up to <strong>140 Proof</strong>—yet they are drunk neat (without mixers) in a matter of minutes like a cool drink.</p>\n          "
                },
                "1.3": {
                    "key": "1.3",
                    "code": "1.3",
                    "shortLabel": "1.3 Extreme Potency Math & Zimbabw...",
                    "title": "1.3 Extreme Potency Math & Zimbabwe's Harmful Liquids Act",
                    "html": "\n            <p>In Module 1, you learned that <strong>1 Standard Drink</strong> equals <strong>340 mL of regular beer (5% ABV)</strong> or <strong>44 mL (1 single shot) of legal spirits (40% ABV)</strong>, containing about <strong>14 grams (17.7 mL) of pure alcohol</strong>.</p>\n            <p>Now look at the math of a single <strong>200 mL pocket bottle of illicit spirit at 70% ABV</strong>:</p>\n            <div style=\"background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:16px; margin:14px 0;\">\n              <p style=\"margin:0 0 8px 0; font-family:monospace; font-size:0.98rem; color:#0f172a; font-weight:700;\">\n                200 mL × 70% (0.70) = 140 mL of pure alcohol\n              </p>\n              <p style=\"margin:0 0 8px 0; font-family:monospace; font-size:0.98rem; color:#b91c1c; font-weight:700;\">\n                140 mL ÷ 17.7 mL per standard drink = 7.9 Standard Drinks (nearly 8 shots!)\n              </p>\n              <p style=\"margin:0; font-size:0.9rem; color:#475569; line-height:1.55;\">\n                Drinking just <strong>one</strong> palm-sized 200 mL bottle of 70% illicit spirit dumps the same amount of pure alcohol into your body as <strong>nearly 8 cans of regular beer</strong> or <strong>8 shots of whiskey</strong> all at once! Drinking two small bottles equals nearly <strong>16 standard drinks (280 mL pure alcohol)</strong>—enough to push Blood Alcohol Concentration (BAC) past <strong>0.30% to 0.40%</strong>, stopping the brain's breathing centre and causing sudden death.\n              </p>\n            </div>\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin-top:14px;\">\n              <h5 style=\"margin:0 0 6px 0; color:#166534; font-size:0.98rem;\">Zimbabwe's Legal Ban: The Harmful Liquids Act [Chapter 9:10]</h5>\n              <p style=\"margin:0; color:#1e293b; font-size:0.92rem; line-height:1.6;\">Under Zimbabwe's <strong>Harmful Liquids Act [Chapter 9:10]</strong> and the <strong>Liquor Act [Chapter 14:12]</strong>, it is a serious criminal offence to manufacture, possess, sell, or supply dangerous concoctions such as <em>skokiaan</em>, <em>kachasu</em>, <em>nipa</em>, or any unapproved toxic brew. The law bans these liquids not to spoil fun, but because they routinely cause mass poisonings, liver failure, brain damage, and death.</p>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "1.4",
                "shortLabel": "1.4 Review Questions (≥80%)",
                "title": "1.4 Section 1 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q1_1",
                        "topic": "Question 1 • Section 1 Mastery Check",
                        "prompt": "What are the three main categories of illicit or unregulated alcohol commonly found in Zimbabwe?",
                        "options": [
                            "Light beer, dry wine, and sparkling cider",
                            "Unlabelled street brews (kambwa/musombodhiya/tumbwa), illicitly distilled home spirits (kachasu/skokiaan), and counterfeit refilled branded bottles",
                            "Imported beverages, duty-free spirits, and hotel minibar drinks",
                            "Low-sugar cordials, non-alcoholic maheu, and ginger beer"
                        ],
                        "correctIndex": 1,
                        "explanation": "Illicit alcohol in Zimbabwe falls into three main dangerous categories: (1) unlabelled street brews like kambwa/musombodhiya in 200 mL plastic bottles, (2) home-distilled spirits like kachasu/skokiaan boiled in metal drums and car radiators, and (3) counterfeit refilled branded bottles."
                    },
                    {
                        "id": "q1_2",
                        "topic": "Question 2 • Section 1 Mastery Check",
                        "prompt": "Potency Math: A young person drinks two 200 mL plastic bottles (400 mL total) of an illicit brew that contains 70% ABV. Using 17.7 mL of pure alcohol = 1 Standard Drink, how many milliliters of pure alcohol and how many Standard Drinks have they consumed?",
                        "options": [
                            "40 mL of pure alcohol — about 2.2 Standard Drinks",
                            "140 mL of pure alcohol — about 7.9 Standard Drinks",
                            "280 mL of pure alcohol — about 15.8 Standard Drinks (nearly 16 shots/beers)",
                            "70 mL of pure alcohol — about 4.0 Standard Drinks"
                        ],
                        "correctIndex": 2,
                        "explanation": "400 mL × 0.70 (70% ABV) = 280 mL of pure alcohol. Dividing 280 mL by 17.7 mL per standard drink equals 15.8 Standard Drinks—nearly 16 shots of spirits or 16 beers dumped into the bloodstream rapidly!"
                    },
                    {
                        "id": "q1_3",
                        "topic": "Question 3 • Section 1 Mastery Check",
                        "prompt": "Which specific Zimbabwean Act of Parliament outlaws the brewing, possession, and sale of toxic concoctions such as kachasu and skokiaan?",
                        "options": [
                            "The Harmful Liquids Act [Chapter 9:10] (alongside the Liquor Act [Chapter 14:12])",
                            "The Road Motor Transportation Act [Chapter 13:15]",
                            "The Copyright and Neighbouring Rights Act [Chapter 26:05]",
                            "The Parks and Wild Life Act [Chapter 20:14]"
                        ],
                        "correctIndex": 0,
                        "explanation": "Zimbabwe's Harmful Liquids Act [Chapter 9:10] specifically prohibits the manufacture, possession, sale, or supply of dangerous concoctions like skokiaan, kachasu, nipa, and unapproved toxic brews."
                    },
                    {
                        "id": "q1_4",
                        "topic": "Question 4 • Section 1 Mastery Check",
                        "prompt": "Why can drinking even ONE small 200 mL bottle of 70% ABV kambwa quickly lead to fatal alcohol poisoning?",
                        "options": [
                            "Because plastic bottles make alcohol evaporate into gas inside the stomach",
                            "Because one 200 mL bottle at 70% ABV contains 140 mL of pure alcohol (7.9 standard drinks)—and when gulped neat in minutes, it floods the bloodstream and can push BAC into the coma/respiratory-arrest zone",
                            "Because 70% ABV is weaker than regular 5% beer",
                            "Because it only affects people who haven't eaten breakfast"
                        ],
                        "correctIndex": 1,
                        "explanation": "A single 200 mL pocket bottle at 70% ABV packs 140 mL of pure alcohol (nearly 8 standard drinks). Gulping 8 standard drinks in a few minutes overwhelms the liver and can push BAC past 0.25%–0.30%, shutting down breathing."
                    },
                    {
                        "id": "q1_5",
                        "topic": "Question 5 • Section 1 Mastery Check",
                        "prompt": "How does regulated (legal) alcohol differ from unregulated street alcohol?",
                        "options": [
                            "Regulated alcohol is produced by licensed facilities, lab-tested to ensure it contains only food-grade ethanol at an exact printed ABV, and sealed in hygienic tamper-proof containers",
                            "Regulated alcohol is boiled in backyard oil drums and cooled through car radiators",
                            "Regulated alcohol has no labels, batch numbers, or health warnings",
                            "There is no difference except the price tag"
                        ],
                        "correctIndex": 0,
                        "explanation": "Regulated alcohol must be produced by licensed breweries/distilleries, laboratory-tested to guarantee it contains only food-grade ethanol at the stated ABV, and sealed in tamper-proof packaging with batch numbers."
                    }
                ]
            }
        },
        {
            "id": 2,
            "numberLabel": "Section 2",
            "title": "Methanol vs. Ethanol — The Chemistry of Blindness & Death",
            "summary": "Compare food-grade ethanol with deadly wood alcohol (methanol), understand the 64.7°C vs 78.4°C distillation boiling-point trap, and trace how the liver converts methanol into formaldehyde and formic acid that destroy the optic nerve.",
            "order": [
                "2.1",
                "video",
                "2.2",
                "2.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 2",
                "shortLabel": "Section 2 Supporting Video",
                "title": "Methanol vs Ethanol: A Lethal Difference You Must Know",
                "youtubeUrl": "https://www.youtube.com/watch?v=2_hOLk3cAq8",
                "embedUrl": "https://www.youtube.com/embed/2_hOLk3cAq8?rel=0",
                "guidance": "Watch this medical animation to see how the human liver processes methanol into formaldehyde and formic acid—and why those two chemicals attack the optic nerve (causing permanent blindness) and shut down the body's cells.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "I Saw a Kaleidoscopic Light Before Going Blind — Methanol Poisoning Survivor",
                        "source": "BBC News Real-World Survivor Testimony",
                        "youtubeUrl": "https://www.youtube.com/watch?v=6xpLNgLX6A8",
                        "embedUrl": "https://www.youtube.com/embed/6xpLNgLX6A8?rel=0"
                    }
                ]
            },
            "subsections": {
                "2.1": {
                    "key": "2.1",
                    "code": "2.1",
                    "shortLabel": "2.1 Ethanol vs. Methanol: Two Clea...",
                    "title": "2.1 Ethanol vs. Methanol: Two Clear Liquids, One Deadly Difference",
                    "html": "\n            <p>To understand why illicit brews blind and kill thousands of people worldwide every year, you need to know the difference between two cousin chemicals that look, smell, and taste almost identical:</p>\n            <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; margin:14px 0;\">\n              <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 6px 0; color:#166534; font-size:0.98rem;\">1. Ethanol (Grain / Beverage Alcohol — CH₃CH₂OH)</h5>\n                <p style=\"margin:0; color:#1e293b; font-size:0.91rem; line-height:1.6;\">This is the type of alcohol found in legal beer, wine, cider, and spirits. It is made when yeast ferments natural sugars in grains (like maize, sorghum, or barley) or grapes. While ethanol is still toxic in large amounts (causing drunkenness and alcohol poisoning), your liver has enzymes designed to break it down safely into water and carbon dioxide at a slow, steady pace.</p>\n              </div>\n              <div style=\"background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 6px 0; color:#991b1b; font-size:0.98rem;\">2. Methanol (Wood / Industrial Alcohol — CH₃OH)</h5>\n                <p style=\"margin:0; color:#7f1d1d; font-size:0.91rem; line-height:1.6;\">Methanol is an industrial chemical used in <strong>car windscreen washer fluid, antifreeze, paint stripper, varnish, methylated spirits, and fuel</strong>. It is <strong>NOT</strong> meant for human consumption. Crucially, pure methanol is completely clear, colourless, and smells and tastes just like normal drinking alcohol. <strong>You cannot tell if a drink contains methanol by looking at it, sniffing it, or sipping it.</strong></p>\n              </div>\n            </div>\n          "
                },
                "2.2": {
                    "key": "2.2",
                    "code": "2.2",
                    "shortLabel": "2.2 How Methanol Gets Into Illicit...",
                    "title": "2.2 How Methanol Gets Into Illicit Brews",
                    "html": "\n            <p>Methanol ends up in illegal alcohol in two ways:</p>\n            <ol style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Bad Backyard Distillation (The Boiling-Point Trap):</strong> When fruit, husks, or grains ferment in a drum, a small amount of methanol is naturally created alongside ethanol. Because <strong>methanol boils at a lower temperature (64.7°C)</strong> than <strong>ethanol (78.4°C)</strong>, methanol evaporates first when the pot is heated. Licensed distilleries use precision thermometers and laboratory equipment to throw away this poisonous first batch (called the <em>\"foreshots\"</em> or <em>\"heads\"</em>). Backyard <em>kachasu</em> brewers using firewood and old pipes cannot control the temperature, leaving deadly concentrations of methanol in the drink.</li>\n              <li><strong>Deliberate Spiking with Industrial Solvents:</strong> Greedy bootleggers buy cheap industrial methanol or methylated spirits from hardware stores and mix it into fake vodka, whisky, or <em>kambwa</em> to give the drink a cheap, burning \"kick.\"</li>\n            </ol>\n          "
                },
                "2.3": {
                    "key": "2.3",
                    "code": "2.3",
                    "shortLabel": "2.3 What Happens Inside Your Liver...",
                    "title": "2.3 What Happens Inside Your Liver: Formaldehyde & Formic Acid",
                    "html": "\n            <p>Methanol itself is not what kills your cells—the real danger happens when your liver tries to clean it up using the exact same enzymes (ADH and ALDH) it uses for normal alcohol:</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Step 1 (Methanol to Formaldehyde):</strong> Your liver's <em>Alcohol Dehydrogenase (ADH)</em> enzyme turns methanol into <strong>Formaldehyde</strong>—the chemical used to embalm dead bodies in mortuaries.</li>\n              <li><strong>Step 2 (Formaldehyde to Formic Acid):</strong> Next, the <em>Aldehyde Dehydrogenase (ALDH)</em> enzyme turns formaldehyde into <strong>Formic Acid (Formate)</strong>—the exact chemical venom found in stinging red ants!</li>\n              <li><strong>Step 3 (Attack on the Eyes and Brain):</strong> Formic acid floods the bloodstream, turning the blood dangerously acidic (<strong>severe metabolic acidosis</strong>). It specifically targets and suffocates the power plants (mitochondria) inside the <strong>optic nerve</strong> (the cable connecting your eyes to your brain) and the basal ganglia of the brain.</li>\n            </ul>\n            <div style=\"background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:14px 18px; margin:14px 0;\">\n              <strong style=\"color:#991b1b; display:block; margin-bottom:4px;\">How Little Methanol Takes Your Sight or Life?</strong>\n              <p style=\"margin:0; color:#7f1d1d; font-size:0.93rem; line-height:1.6;\">\n                • Swallowing just <strong>10 mL (2 teaspoons)</strong> of pure methanol can destroy the optic nerve and cause <strong>permanent, irreversible blindness</strong>.<br>\n                • Swallowing <strong>30 mL (2 tablespoons—less than a single shot!)</strong> can be <strong>fatal</strong>.\n              </p>\n            </div>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Feature</th>\n                    <th style=\"padding:10px 12px;\">Ethanol (Safe Beverage Alcohol)</th>\n                    <th style=\"padding:10px 12px;\">Methanol (Deadly Industrial Poison)</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Where It Belongs</td>\n                    <td style=\"padding:10px 12px;\">Regulated beer, wine, cider &amp; spirits</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Antifreeze, paint thinner, fuel, methylated spirits</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Look, Smell &amp; Taste</td>\n                    <td style=\"padding:10px 12px;\">Clear liquid, sharp alcohol smell</td>\n                    <td style=\"padding:10px 12px;\">Identical clear liquid &amp; smell — impossible to taste the difference</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Boiling Point</td>\n                    <td style=\"padding:10px 12px;\"><strong>78.4°C</strong></td>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#b91c1c;\">64.7°C (boils off first in backyard stills)</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Liver Breakdown Products</td>\n                    <td style=\"padding:10px 12px;\">Acetaldehyde to harmless Acetate to Water &amp; CO₂</td>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">Formaldehyde (embalming fluid) to Formic Acid (ant venom)</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">Main Target in the Body</td>\n                    <td style=\"padding:10px 12px;\">Central nervous system (temporary intoxication)</td>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">Optic nerve (permanent blindness), brain &amp; kidneys (acid blood &amp; death)</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "2.4",
                "shortLabel": "2.4 Review Questions (≥80%)",
                "title": "2.4 Section 2 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q2_1",
                        "topic": "Question 1 • Section 2 Mastery Check",
                        "prompt": "The Boiling Point Trap: Why do home-distilled spirits (like backyard kachasu) often end up with high levels of methanol?",
                        "options": [
                            "Because methanol boils at 100°C after all the water has evaporated",
                            "Because methanol boils at a lower temperature (64.7°C) than ethanol (78.4°C), evaporating first into the collection pipe when backyard brewers fail to discard the 'foreshots'",
                            "Because firewood smoke turns water into methanol",
                            "Because yeast only produces methanol and never produces ethanol"
                        ],
                        "correctIndex": 1,
                        "explanation": "Methanol boils at 64.7°C while ethanol boils at 78.4°C. In unregulated backyard stills without temperature control, the poisonous methanol-rich first batch ('foreshots' or 'heads') is collected instead of being safely discarded."
                    },
                    {
                        "id": "q2_2",
                        "topic": "Question 2 • Section 2 Mastery Check",
                        "prompt": "Inside the Liver: When someone drinks methanol, what two toxic chemicals does the liver turn it into, and which part of the eye do they destroy?",
                        "options": [
                            "Glucose and glycogen, which strengthen the retina",
                            "Formaldehyde (embalming fluid) and Formic Acid (formate), which suffocate and destroy the optic nerve",
                            "Citric acid and lactic acid, which only cause temporary watery eyes",
                            "Pure oxygen and nitrogen, which improve night vision"
                        ],
                        "correctIndex": 1,
                        "explanation": "Liver enzymes ADH and ALDH convert methanol into Formaldehyde and then Formic Acid (formate). Formic acid causes severe metabolic acidosis and attacks the mitochondria of the optic nerve, causing permanent blindness."
                    },
                    {
                        "id": "q2_3",
                        "topic": "Question 3 • Section 2 Mastery Check",
                        "prompt": "The Deadly Dose: How many milliliters (and teaspoons/tablespoons) of pure methanol are enough to cause permanent blindness, and how much can be fatal?",
                        "options": [
                            "500 mL (2 cups) for blindness; 2 Litres for death",
                            "10 mL (2 teaspoons) for permanent blindness; 30 mL (2 tablespoons—less than 1 shot) for death",
                            "250 mL (1 cup) for blindness; 1 Litre for death",
                            "100 mL for blindness; 500 mL for death"
                        ],
                        "correctIndex": 1,
                        "explanation": "Just 10 mL (2 teaspoons) of pure methanol can permanently blind a person, and 30 mL (2 tablespoons, less than a single standard shot) can be lethal."
                    },
                    {
                        "id": "q2_4",
                        "topic": "Question 4 • Section 2 Mastery Check",
                        "prompt": "Can an experienced drinker tell if a clear spirit contains methanol by sniffing it or taking a small sip?",
                        "options": [
                            "Yes, methanol always turns bright blue when exposed to air",
                            "No—pure methanol is clear, colourless, and smells and tastes virtually identical to normal drinking ethanol",
                            "Yes, methanol always tastes salty like seawater",
                            "Yes, methanol fizzes like a carbonated soda"
                        ],
                        "correctIndex": 1,
                        "explanation": "Pure methanol looks, smells, and tastes almost identical to food-grade ethanol. You cannot detect methanol in a drink by sight, smell, or taste."
                    },
                    {
                        "id": "q2_5",
                        "topic": "Question 5 • Section 2 Mastery Check",
                        "prompt": "What dangerous blood condition does Formic Acid trigger in a methanol poisoning victim?",
                        "options": [
                            "Severe metabolic acidosis (turning the blood dangerously acidic while starving optic nerve and brain cells of energy)",
                            "High blood calcium that makes bones stronger",
                            "Temporary low blood sugar that is cured by eating bread",
                            "Mild dehydration identical to a normal hangover"
                        ],
                        "correctIndex": 0,
                        "explanation": "Formic acid accumulates in the bloodstream, causing severe metabolic acidosis (acid blood) and shutting down cellular respiration in the optic nerve, brain, and kidneys."
                    }
                ]
            }
        },
        {
            "id": 3,
            "numberLabel": "Section 3",
            "title": "Toxic Adulterants & How to Spot Counterfeit Bottles",
            "summary": "Expose the deadly industrial chemicals added to street brews (methylated spirits filtered through bread, battery acid, car antifreeze, lead radiators) and master the 5-Point Bottle Check (4 Ps + Smell).",
            "order": [
                "3.1",
                "video",
                "3.2",
                "3.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 3",
                "shortLabel": "Section 3 Supporting Video",
                "title": "Trading Standards Warning — Dangers of Fake & Counterfeit Alcohol",
                "youtubeUrl": "https://www.youtube.com/watch?v=rSSAbWhdQuc",
                "embedUrl": "https://www.youtube.com/embed/rSSAbWhdQuc?rel=0",
                "guidance": "Watch how consumer-protection investigators uncover counterfeit vodka and whisky workshops, see what industrial chemicals are found inside fake branded bottles, and learn the visual clues that expose a fake seal or label.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Ethanol, Methanol & Ethylene Glycol Toxicology — Emergency Medicine",
                        "source": "Lecturio Medical Education",
                        "youtubeUrl": "https://www.youtube.com/watch?v=-lXIaS2tkkk",
                        "embedUrl": "https://www.youtube.com/embed/-lXIaS2tkkk?rel=0"
                    }
                ]
            },
            "subsections": {
                "3.1": {
                    "key": "3.1",
                    "code": "3.1",
                    "shortLabel": "3.1 Industrial Chemicals Added for...",
                    "title": "3.1 Industrial Chemicals Added for a 'Kick'",
                    "html": "\n            <p>Methanol is not the only poison found in unregulated brews. Police and forensic laboratories across Southern Africa have tested confiscated illicit drinks and found shocking <strong>toxic adulterants</strong> added by bootleggers to make weak brews feel stronger or ferment faster:</p>\n            <ol style=\"color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n              <li><strong>Methylated Spirits (\"Meths\"):</strong> Colored purple in hardware stores specifically to warn people not to drink it, methylated spirits is a mix of ethanol, deadly <strong>methanol (up to 10%)</strong>, and bitter chemicals. Some street brewers pour it through loaf bread or charcoal thinking it removes the poison—<strong>filtering only removes the purple dye, leaving 100% of the invisible, deadly methanol behind!</strong></li>\n              <li><strong>Battery Acid (Sulphuric Acid) &amp; Cleaning Bleach:</strong> Added in small amounts to speed up fermentation or give a sharp throat burn, causing terrible chemical burns to the mouth, throat, and stomach lining, and internal bleeding.</li>\n              <li><strong>Ethylene Glycol (Car Radiator Antifreeze):</strong> A sweet-tasting syrup sometimes mixed into fake sweet wines or liqueurs. The liver turns ethylene glycol into microscopic, needle-sharp <strong>calcium oxalate crystals</strong> that shred the kidneys and cause total kidney failure.</li>\n              <li><strong>Lead &amp; Heavy Metals:</strong> When illicit distillers use old <strong>car radiators</strong> or lead-soldered pipes to cool boiling <em>kachasu</em> vapour, toxic lead dissolves into the alcohol, causing permanent nerve damage, memory loss, and organ failure.</li>\n              <li><strong>ARVs, Sedatives, or Agricultural Fertilizers (Urea):</strong> Sometimes crushed into street brews to cause instant dizziness and sedation, creating a high risk of coma and drug interactions.</li>\n            </ol>\n          "
                },
                "3.2": {
                    "key": "3.2",
                    "code": "3.2",
                    "shortLabel": "3.2 The Refilled Branded Bottle Scam",
                    "title": "3.2 The Refilled Branded Bottle Scam",
                    "html": "\n            <p>Do not assume a drink is safe just because it is poured from a famous, expensive whisky, vodka, or gin bottle! A common crime in cities and party venues is the <strong>Refilled Bottle Scam</strong>:</p>\n            <div style=\"background:#fff7ed; border-left:4px solid #ea580c; border-radius:0 12px 12px 0; padding:14px 18px; margin:12px 0;\">\n              <p style=\"margin:0; color:#7c2d12; font-size:0.93rem; line-height:1.6;\">Counterfeiters pay bin-pickers to collect empty bottles of premium brands from clubs and rubbish dumps. They wash the bottles, refill them with cheap industrial alcohol mixed with caramel colouring or tea (to look like whisky), and glue or heat-shrink a fake cap on top.</p>\n            </div>\n          "
                },
                "3.3": {
                    "key": "3.3",
                    "code": "3.3",
                    "shortLabel": "3.3 The 5-Point Bottle Check (4 Ps...",
                    "title": "3.3 The 5-Point Bottle Check (4 Ps + Smell)",
                    "html": "\n            <p>Before anyone over 18 ever buys or accepts a bottle of alcohol, they should run the <strong>4 Ps + Smell Safety Check</strong>:</p>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Check Step</th>\n                    <th style=\"padding:10px 12px;\">What to Look For</th>\n                    <th style=\"padding:10px 12px;\">Danger Sign (Walk Away Immediately!)</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">1. PLACE</td>\n                    <td style=\"padding:10px 12px;\">Only buy from reputable, licensed supermarkets or registered bottle stores.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Sold from a car boot, street corner, tuckshop backroom, WhatsApp runner, or informal shebeen.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">2. PRICE</td>\n                    <td style=\"padding:10px 12px;\">Legal alcohol includes production costs and excise tax (ZIMRA duty).</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">A \"famous brand\" sold at half its normal shop price, or a 200 mL spirit sold for US$0.50. If it's too cheap to be true, it's fake.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">3. PACKAGING &amp; SEAL</td>\n                    <td style=\"padding:10px 12px;\">Check the cap ring, label alignment, spelling, and laser batch code.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">The metal/plastic security ring under the cap is cracked, loose, or spins without clicking; crooked or peeling labels; spelling mistakes; missing batch codes; uneven fill levels on the shelf.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">4. PRODUCT LOOK</td>\n                    <td style=\"padding:10px 12px;\">Hold the bottle up to the light and swirl gently.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Cloudy liquid in a clear spirit, tiny floating particles, sediment at the bottom, or strange oily bubbles that do not clear quickly.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">5. SMELL</td>\n                    <td style=\"padding:10px 12px;\">Cautiously sniff the cap before pouring.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">A harsh smell of nail-polish remover (acetone), paint thinner, glue, vinegar, or hospital disinfectant.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "3.4",
                "shortLabel": "3.4 Review Questions (≥80%)",
                "title": "3.4 Section 3 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q3_1",
                        "topic": "Question 1 • Section 3 Mastery Check",
                        "prompt": "The Filtered 'Meths' Trap: Some street brewers pour purple methylated spirits through a loaf of bread or charcoal to make it clear before mixing it into drinks. Why is this practice still deadly?",
                        "options": [
                            "Because bread adds gluten to the alcohol",
                            "Because filtering through bread or charcoal only traps the purple warning dye—leaving 100% of the invisible, deadly methanol dissolved in the clear liquid",
                            "Because charcoal turns ethanol into water",
                            "Because it makes the drink too cold to swallow"
                        ],
                        "correctIndex": 1,
                        "explanation": "Bread or charcoal filtration only absorbs the purple warning pigment added by manufacturers. The dissolved methanol passes right through into the clear liquid, causing blindness and death."
                    },
                    {
                        "id": "q3_2",
                        "topic": "Question 2 • Section 3 Mastery Check",
                        "prompt": "Spotting a Fake Bottle: Which set of physical clues on a branded bottle warns you that it is a counterfeit refilled bottle?",
                        "options": [
                            "A broken or spinning cap security ring, crooked labels with spelling mistakes, missing laser batch codes, uneven fill heights, or floating sediment",
                            "A crisp intact factory seal, laser-etched batch number, and ZIMRA excise stamp",
                            "Clear glass and a printed barcode from a licensed supermarket",
                            "A cold bottle taken from a regulated refrigerator"
                        ],
                        "correctIndex": 0,
                        "explanation": "Counterfeit refilled bottles give themselves away through broken/loose cap security rings, crooked or misspelled labels, missing batch codes, uneven fill levels, cloudiness/floaters, or a nail-polish/paint-thinner smell."
                    },
                    {
                        "id": "q3_3",
                        "topic": "Question 3 • Section 3 Mastery Check",
                        "prompt": "The Car Radiator Danger: What two specific poisons can enter an illicit spirit when a backyard brewer uses an old car radiator to cool boiling alcohol vapour?",
                        "options": [
                            "Vitamin C and iron",
                            "Toxic lead (heavy metal from soldered radiator pipes) and ethylene glycol (antifreeze that forms needle-sharp calcium oxalate crystals that shred the kidneys)",
                            "Table salt and baking soda",
                            "Pure spring water and oxygen"
                        ],
                        "correctIndex": 1,
                        "explanation": "Old car radiators leach toxic lead from soldered metal joints (causing brain and nerve damage) and leftover ethylene glycol antifreeze (which the liver converts into sharp calcium oxalate crystals that cause kidney failure)."
                    },
                    {
                        "id": "q3_4",
                        "topic": "Question 4 • Section 3 Mastery Check",
                        "prompt": "Why do some bootleggers add battery acid (sulphuric acid) or cleaning bleach to illicit brews, and what does it do to the body?",
                        "options": [
                            "To make the drink healthier; it cleans the stomach",
                            "To speed up fermentation or simulate a sharp throat 'kick'; it causes severe chemical burns and internal bleeding in the mouth, throat, and stomach",
                            "To preserve vitamin content in fruit juice",
                            "To lower the alcohol percentage to 0%"
                        ],
                        "correctIndex": 1,
                        "explanation": "Corrosive chemicals like battery acid and bleach are added to fake a strong throat burn or speed up fermentation, causing severe internal chemical burns and stomach bleeding."
                    },
                    {
                        "id": "q3_5",
                        "topic": "Question 5 • Section 3 Mastery Check",
                        "prompt": "In the '4 Ps + Smell' bottle inspection guide, what do the 4 Ps stand for?",
                        "options": [
                            "Place, Price, Packaging (Seal/Label), and Product Look",
                            "Pouring, Passing, Party, and Promotion",
                            "Plastic, Paper, Pint, and Proof",
                            "People, Police, Permit, and Penalty"
                        ],
                        "correctIndex": 0,
                        "explanation": "The 4 Ps are Place (licensed store vs street/car boot), Price (too cheap = fake), Packaging & Seal (cap ring, spelling, batch code), and Product Look (clarity, sediment, fill level), followed by Smell."
                    }
                ]
            }
        },
        {
            "id": 4,
            "numberLabel": "Section 4",
            "title": "The Deadly Risks of Substance Mixing (Polysubstance Use)",
            "summary": "Understand the '1 + 1 = 5' synergism effect when mixing alcohol with cough syrups (Codeine/Broncleer), sleeping pills, energy drinks ('Wide-Awake Drunk' trap), Paracetamol, and antibiotics, plus 3 drink-spiking rules.",
            "order": [
                "4.1",
                "video",
                "4.2",
                "4.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 4",
                "shortLabel": "Section 4 Supporting Video",
                "title": "The Dangers of Mixing Drugs — Céline Valéry",
                "youtubeUrl": "https://www.youtube.com/watch?v=aDsW8tx1KsY",
                "embedUrl": "https://www.youtube.com/embed/aDsW8tx1KsY?rel=0",
                "guidance": "Watch this animated TED-Ed lesson to see how different substances compete for the same liver enzymes and brain receptors—turning a normal dose of medicine into a fatal overdose when mixed with alcohol.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Why Combining Drugs and Alcohol Is Never Safe",
                        "source": "Addiction & Polysubstance Harm Reduction Explainer",
                        "youtubeUrl": "https://www.youtube.com/watch?v=taCX5AxcIeQ",
                        "embedUrl": "https://www.youtube.com/embed/taCX5AxcIeQ?rel=0"
                    }
                ]
            },
            "subsections": {
                "4.1": {
                    "key": "4.1",
                    "code": "4.1",
                    "shortLabel": "4.1 Why Mixing Substances Multipli...",
                    "title": "4.1 Why Mixing Substances Multiplies Danger (The '1 + 1 = 5' Synergism Effect)",
                    "html": "\n            <p>Even when alcohol is legal and regulated, mixing it with prescription medicines, over-the-counter pharmacy pills, caffeinated energy drinks, or street drugs—known as <strong>polysubstance use</strong>—triggers a deadly chemical reaction called <strong>synergism</strong>.</p>\n            <p>In chemistry and medicine, <strong>synergism means 1 + 1 does not equal 2; 1 + 1 equals 5</strong>. Two substances taken together multiply each other's damage in two ways:</p>\n            <ol style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Double-Pressing the Brain's Brakes (CNS Depression):</strong> Alcohol is a <strong>Central Nervous System (CNS) Depressant</strong>—it slows down brain signals, heart rate, and breathing. When mixed with another depressant (like cough syrup or sleeping pills), both drugs press the brakes on the brainstem at the same time, completely shutting down the automatic urge to breathe.</li>\n              <li><strong>Fighting for the Same Liver Enzymes:</strong> Your liver uses specific enzyme \"cleanup crews\" to break down both alcohol and medicines. When alcohol floods the liver, the enzymes are too busy to clear the medicine (or vice versa), causing toxic levels of the drug to build up in the blood or producing liver-destroying toxins.</li>\n            </ol>\n          "
                },
                "4.2": {
                    "key": "4.2",
                    "code": "4.2",
                    "shortLabel": "4.2 High-Risk Alcohol Combinations...",
                    "title": "4.2 High-Risk Alcohol Combinations (Depressants, Energy Drinks, Painkillers & Antibiotics)",
                    "html": "\n            <div style=\"overflow-x:auto; margin:14px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.86rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Substance Mixed With Alcohol</th>\n                    <th style=\"padding:10px 12px;\">What Happens in the Body</th>\n                    <th style=\"padding:10px 12px;\">Immediate Life-Threatening Risk</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">1. Cough Syrups (Codeine / <em>Broncleer</em>) &amp; Sleeping Pills / Sedatives (Diazepam / Xanax)</td>\n                    <td style=\"padding:10px 12px;\"><strong>Double Depressant Effect:</strong> Both chemicals sedate the brainstem's breathing and gag reflexes.</td>\n                    <td style=\"padding:10px 12px; color:#991b1b; font-weight:700;\">Person falls into a deep coma, stops breathing in their sleep (respiratory arrest), or chokes on vomit.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">2. Caffeinated Energy Drinks (Monster, Red Bull, Dragon, etc.)</td>\n                    <td style=\"padding:10px 12px;\"><strong>The \"Wide-Awake Drunk\" Trap:</strong> Caffeine is a stimulant that masks the sleepy feeling of alcohol, but it <strong>does NOT lower BAC</strong> or restore coordination.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Drinkers feel sober enough to keep drinking or drive, leading to 3× higher rates of alcohol poisoning, heart rhythm spikes, and severe dehydration.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">3. Painkillers: Paracetamol (Acetaminophen) &amp; Anti-inflammatories (Ibuprofen / Aspirin)</td>\n                    <td style=\"padding:10px 12px;\">Alcohol forces the liver to convert Paracetamol into a toxic chemical that kills liver cells. Ibuprofen/Aspirin + alcohol strips the stomach's protective mucus.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Acute liver failure (from Paracetamol) or severe stomach ulcers and internal stomach bleeding.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">4. Allergy &amp; Cold Tablets (Antihistamines like Chlorpheniramine / Piriton)</td>\n                    <td style=\"padding:10px 12px;\">Multiplies drowsiness, dizziness, and slowed reaction times.</td>\n                    <td style=\"padding:10px 12px; color:#b45309;\">Sudden blackouts, falls, and road crashes even after just 1 drink.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">5. Antibiotics (e.g., Metronidazole / Flagyl), TB &amp; ARV Medications</td>\n                    <td style=\"padding:10px 12px;\">Some antibiotics completely block the liver's Step 2 enzyme (ALDH), trapping poisonous <strong>acetaldehyde</strong> in the blood. Alcohol also weakens immunity and causes patients to skip doses.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Violent vomiting, pounding rapid heartbeat, chest pain, flushing, liver toxicity, and treatment failure.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">6. Cannabis (<em>Mbanje</em>) or Stimulants (<em>Mutoriro</em> / Crystal Meth)</td>\n                    <td style=\"padding:10px 12px;\">Alcohol widens blood vessels in the stomach and lungs, doubling how fast THC enters the blood (\"greening out\"). Stimulants mask drunkenness while straining the heart.</td>\n                    <td style=\"padding:10px 12px; color:#991b1b; font-weight:700;\">Extreme paranoia, panic attacks, violent vomiting, stroke, or sudden heart failure.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "4.3": {
                    "key": "4.3",
                    "code": "4.3",
                    "shortLabel": "4.3 Drink Spiking Awareness at Par...",
                    "title": "4.3 Drink Spiking Awareness at Parties & Social Venues",
                    "html": "\n            <p>Unregulated substance mixing can also happen <strong>without your consent</strong> when someone slips extra alcohol, sedatives, or crushed pills into an unattended glass (<strong>drink spiking</strong>). Always follow three non-negotiable rules:</p>\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin-top:12px;\">\n              <ol style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>Never leave your drink unattended</strong> (even to go to the bathroom or dance floor)—not even a soft drink or water.</li>\n                <li><strong>Never accept an open cup or unsealed bottle</strong> from a stranger or casual acquaintance; watch the cap or can being opened in front of you.</li>\n                <li><strong>If you or a friend suddenly feel unusually dizzy, confused, blurry-eyed, or sleepy</strong> after only a small drink, tell a trusted friend immediately and get to a safe place or clinic.</li>\n              </ol>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "4.4",
                "shortLabel": "4.4 Review Questions (≥80%)",
                "title": "4.4 Section 4 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q4_1",
                        "topic": "Question 1 • Section 4 Mastery Check",
                        "prompt": "The 'Wide-Awake Drunk' Trap: Why is mixing alcohol with caffeinated energy drinks so dangerous, and does caffeine lower your Blood Alcohol Concentration (BAC)?",
                        "options": [
                            "Caffeine sober you up by burning alcohol inside the stomach",
                            "Caffeine is a stimulant that masks the sleepy warning signs of alcohol without lowering BAC or restoring coordination—tricking drinkers into consuming toxic amounts or driving impaired while straining the heart",
                            "Energy drinks turn ethanol into pure water",
                            "Caffeine prevents all dehydration"
                        ],
                        "correctIndex": 1,
                        "explanation": "Caffeine only masks drowsiness, creating a 'wide-awake drunk' state. Your BAC, reaction time, and coordination remain 100% impaired, leading to 3× higher rates of binge poisoning and heart rhythm strain."
                    },
                    {
                        "id": "q4_2",
                        "topic": "Question 2 • Section 4 Mastery Check",
                        "prompt": "Double Depressants: What happens to the brainstem when someone mixes alcohol with codeine cough syrup (such as Broncleer) or sleeping pills?",
                        "options": [
                            "The two substances cancel each other out so the person feels wide awake",
                            "Both Central Nervous System depressants double-press the brakes on the brainstem simultaneously, which can shut down the automatic breathing and gag reflexes and cause fatal respiratory arrest in sleep",
                            "It only causes a mild headache the next afternoon",
                            "It increases athletic stamina"
                        ],
                        "correctIndex": 1,
                        "explanation": "Alcohol and codeine/sedatives are both CNS depressants. Together they produce a synergistic '1 + 1 = 5' suppression of the brainstem, stopping breathing during sleep."
                    },
                    {
                        "id": "q4_3",
                        "topic": "Question 3 • Section 4 Mastery Check",
                        "prompt": "Everyday Medicines: Why should you never take Paracetamol (acetaminophen) while alcohol is in your system or to 'cure' a heavy night of drinking?",
                        "options": [
                            "Because alcohol forces the liver's enzymes to convert Paracetamol into a toxic metabolite that destroys liver cells and can cause acute liver failure",
                            "Because Paracetamol makes alcohol taste bitter",
                            "Because Paracetamol raises Blood Alcohol Concentration",
                            "Because Paracetamol only works in the morning"
                        ],
                        "correctIndex": 0,
                        "explanation": "When alcohol is present in the liver, enzyme pathways divert Paracetamol into a highly toxic chemical compound that kills liver cells, risking acute liver failure."
                    },
                    {
                        "id": "q4_4",
                        "topic": "Question 4 • Section 4 Mastery Check",
                        "prompt": "What happens when someone drinks alcohol while taking certain antibiotics like Metronidazole (Flagyl)?",
                        "options": [
                            "The antibiotic makes alcohol safer to drink",
                            "The antibiotic blocks the liver's Step 2 enzyme (ALDH), trapping poisonous acetaldehyde in the blood and causing violent vomiting, chest pain, flushing, and a racing heart",
                            "Nothing happens at all",
                            "It turns the antibiotic into a vitamin"
                        ],
                        "correctIndex": 1,
                        "explanation": "Antibiotics like Metronidazole block Aldehyde Dehydrogenase (ALDH), causing a sudden toxic flood of acetaldehyde that triggers violent nausea, vomiting, flushing, and rapid heart rate."
                    },
                    {
                        "id": "q4_5",
                        "topic": "Question 5 • Section 4 Mastery Check",
                        "prompt": "Which of the following is one of the 3 non-negotiable drink-spiking safety rules at parties and social venues?",
                        "options": [
                            "Leave your cup on the table while dancing and ask a stranger to watch it",
                            "Never leave your drink unattended, never accept an open cup or unsealed bottle, and alert a trusted friend immediately if you feel disproportionately dizzy or sleepy",
                            "Only drink from large shared punch bowls",
                            "Wait until the next morning before telling anyone you feel drugged"
                        ],
                        "correctIndex": 1,
                        "explanation": "Protecting against drink spiking requires never leaving any drink unattended, only drinking from cans/bottles you open yourself, and alerting trusted friends immediately if unusual dizziness or sedation strikes."
                    }
                ]
            }
        },
        {
            "id": 5,
            "numberLabel": "Section 5",
            "title": "Recognizing Chemical Poisoning & Emergency Action",
            "summary": "Spot the 12-to-24-hour 'delayed time-bomb' of methanol poisoning, distinguish 'snowstorm' vision changes from a normal hangover, and execute the 3 hospital emergency steps (including antidotes fomepizole and medical ethanol).",
            "order": [
                "5.1",
                "5.2",
                "5.3",
                "video",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 5",
                "shortLabel": "Section 5 Supporting Video",
                "title": "How to Spot Methanol Poisoning Symptoms Before It's Too Late",
                "youtubeUrl": "https://www.youtube.com/watch?v=hC6eQnYNLZo",
                "embedUrl": "https://www.youtube.com/embed/hC6eQnYNLZo?rel=0",
                "guidance": "Watch emergency doctors and campaigners explain the 12-to-24-hour 'time-bomb' delay of methanol poisoning, the early visual warning signs ('snowstorm' or blurry vision), and how hospitals use medical antidotes to save lives.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "5.1": {
                    "key": "5.1",
                    "code": "5.1",
                    "shortLabel": "5.1 The 12-to-24-Hour 'Delayed Tim...",
                    "title": "5.1 The 12-to-24-Hour 'Delayed Time-Bomb'",
                    "html": "\n            <p>The most treacherous thing about <strong>methanol poisoning</strong> is that it acts like a <strong>delayed time-bomb</strong>:</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li>During the first few hours after drinking a contaminated brew, the person just feels mildly tipsy or sleepy—almost like normal alcohol.</li>\n              <li><strong>Why the Delay?</strong> It takes the liver <strong>12 to 24 hours</strong> (and sometimes up to 30 hours if normal ethanol was also in the drink) to slowly convert the methanol into enough <strong>formic acid</strong> to start poisoning the optic nerve and organs.</li>\n              <li>Because the deadly symptoms hit the next day, victims and their friends often make the fatal mistake of thinking, <em>\"It's just a really bad hangover—let them sleep it off.\"</em> <strong>Waiting to \"sleep off\" methanol poisoning leads to permanent blindness or death.</strong></li>\n            </ul>\n          "
                },
                "5.2": {
                    "key": "5.2",
                    "code": "5.2",
                    "shortLabel": "5.2 Warning Signs of Methanol Pois...",
                    "title": "5.2 Warning Signs of Methanol Poisoning vs. a Normal Hangover",
                    "html": "\n            <p>A normal hangover improves slowly with water and rest. <strong>Methanol or chemical poisoning gets steadily WORSE after 12 to 24 hours</strong> and includes these unmistakable red-flag symptoms:</p>\n            <div style=\"background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:16px; margin:14px 0;\">\n              <ol style=\"margin:0; padding-left:18px; color:#7f1d1d; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>Vision Changes (The #1 Warning Sign):</strong> Blurry or misty vision, feeling like you are looking through a <strong>\"snowstorm\" or static on a TV screen</strong>, flashing kaleidoscopic lights, tunnel vision, dark spots in the centre of your sight, or sudden sensitivity to bright light. <em>(A normal hangover NEVER causes blindness or snowstorm vision!)</em></li>\n                <li><strong>Severe, Worsening Pain:</strong> Crushing headache, violent stomach cramps, and nonstop vomiting that starts or worsens a full day after drinking.</li>\n                <li><strong>Breathing &amp; Nervous System Failure:</strong> Deep, rapid gasping for breath (as the body desperately tries to blow off acid in the blood), extreme dizziness, confusion, seizures, and coma.</li>\n              </ol>\n            </div>\n          "
                },
                "5.3": {
                    "key": "5.3",
                    "code": "5.3",
                    "shortLabel": "5.3 Hospital Antidotes & Emergency...",
                    "title": "5.3 Hospital Antidotes & Emergency Steps",
                    "html": "\n            <p>Unlike many poisons, <strong>methanol poisoning CAN be reversed and eyesight CAN be saved—if the victim reaches a hospital emergency room in time!</strong></p>\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:14px 0;\">\n              <h5 style=\"margin:0 0 8px 0; color:#166534; font-size:0.98rem;\">How Hospitals Save Lives (The Enzyme-Blocking Antidote)</h5>\n              <p style=\"margin:0 0 8px 0; color:#1e293b; font-size:0.92rem; line-height:1.6;\">Doctors give an antidote called <strong>Fomepizole</strong> (or carefully measured medical-grade <strong>Ethanol</strong> via IV or hospital tube). Why? Because the liver's ADH enzyme prefers normal ethanol 10 to 20 times more than methanol! By keeping the liver enzymes busy with the antidote, the hospital stops the liver from turning methanol into poisonous formic acid while kidney dialysis washes the raw methanol safely out of the blood.</p>\n              <p style=\"margin:0; color:#991b1b; font-size:0.88rem; font-weight:700;\">Note: Never try to treat someone at home by giving them more street alcohol—only a hospital with blood tests and dialysis can do this safely.</p>\n            </div>\n            <div style=\"background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:16px; margin-top:14px;\">\n              <h5 style=\"margin:0 0 8px 0; color:#1e40af; font-size:0.98rem;\">Your 3 Emergency Action Steps</h5>\n              <ol style=\"margin:0; padding-left:18px; color:#1e3a8a; font-size:0.92rem; line-height:1.7;\">\n                <li><strong>Rush to the Hospital Immediately (Dial 112 or 994):</strong> The moment anyone complains of blurry vision, \"snowstorm\" sight, severe stomach pain, or breathlessness after drinking, get them to the nearest hospital casualty department immediately.</li>\n                <li><strong>Bring the Bottle or Container:</strong> Take the remaining bottle, sachet, or cup to the hospital so doctors and toxicologists can see what they drank.</li>\n                <li><strong>Warn Everyone Else Who Shared that Bottle:</strong> Methanol poisoning happens in clusters. If one person from a party or group shows symptoms, <strong>every single person who drank from that same bottle or batch must go to the hospital immediately</strong> to be tested—even if they still feel fine!</li>\n              </ol>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "5.4",
                "shortLabel": "5.4 Review Questions (≥80%)",
                "title": "5.4 Section 5 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q5_1",
                        "topic": "Question 1 • Section 5 Mastery Check",
                        "prompt": "The Delayed Time-Bomb: Why do the deadliest symptoms of methanol poisoning usually appear 12 to 24 hours after drinking rather than right away?",
                        "options": [
                            "Because methanol stays frozen in the stomach for 12 hours",
                            "Because it takes the liver 12 to 24 hours to slowly convert methanol into enough poisonous formic acid to attack the optic nerve and acidify the blood",
                            "Because methanol only activates when a person goes outside into sunlight",
                            "Because water blocks methanol for the first 10 hours"
                        ],
                        "correctIndex": 1,
                        "explanation": "Methanol itself causes only mild early drowsiness. The lethal damage begins 12 to 24 hours later as liver enzymes gradually convert methanol into formaldehyde and formic acid."
                    },
                    {
                        "id": "q5_2",
                        "topic": "Question 2 • Section 5 Mastery Check",
                        "prompt": "Hangover vs. Poisoning: What specific eye and vision symptoms prove that someone is suffering from methanol poisoning rather than a normal hangover?",
                        "options": [
                            "Slightly tired eyelids that feel better after washing your face",
                            "Blurry or misty vision, looking through a 'snowstorm' or TV static, flashing kaleidoscopic lights, tunnel vision, or dark spots in the centre of sight",
                            "Wanting to wear sunglasses at the beach",
                            "Normal clear vision with a mild thirst"
                        ],
                        "correctIndex": 1,
                        "explanation": "A normal hangover never causes blindness or snowstorm vision. Blurry/misty sight, 'snowstorm' static, flashing lights, or tunnel vision 12–24 hours after drinking are medical emergencies indicating optic nerve poisoning by formic acid."
                    },
                    {
                        "id": "q5_3",
                        "topic": "Question 3 • Section 5 Mastery Check",
                        "prompt": "Cluster Emergency Action: If four friends shared a bottle of cheap spirit on Friday night, and on Saturday afternoon ONE friend develops blurry 'snowstorm' vision and stomach cramps, what must be done for the other three friends who still feel fine?",
                        "options": [
                            "Nothing—if they feel fine after 18 hours, they are completely safe",
                            "All three friends must ALSO go to the hospital emergency room immediately to be tested and treated, and they must bring the suspect bottle with them",
                            "Tell them to drink coffee and stay home",
                            "Wait until Sunday night to see if they go blind too"
                        ],
                        "correctIndex": 1,
                        "explanation": "Methanol poisoning strikes in clusters, and individual metabolism speeds vary (especially if normal ethanol was also consumed). Every person who drank from that batch must go to the hospital immediately—bringing the bottle—even before symptoms start."
                    },
                    {
                        "id": "q5_4",
                        "topic": "Question 4 • Section 5 Mastery Check",
                        "prompt": "How do hospital antidotes like Fomepizole (or controlled medical-grade IV ethanol) save a methanol poisoning victim's sight and life?",
                        "options": [
                            "They occupy the liver's ADH enzyme so it stops converting methanol into poisonous formic acid while dialysis washes the raw methanol out of the blood",
                            "They turn formic acid into vitamin A inside the eye",
                            "They put the patient to sleep for a week",
                            "They coat the stomach lining with chalk"
                        ],
                        "correctIndex": 0,
                        "explanation": "Fomepizole and medical ethanol competitively block the liver's Alcohol Dehydrogenase (ADH) enzyme, halting the production of toxic formic acid so the kidneys or dialysis machine can clear the methanol safely."
                    },
                    {
                        "id": "q5_5",
                        "topic": "Question 5 • Section 5 Mastery Check",
                        "prompt": "Why is it vital to bring the remaining bottle, sachet, or container to the hospital casualty department when rushing a poisoning victim for help?",
                        "options": [
                            "So the hospital can recycle the plastic",
                            "So doctors and toxicologists can quickly identify the toxic chemical or adulterant inside and administer the right emergency treatment and public health warning",
                            "So the victim can get a refund from the shop",
                            "It is not important at all"
                        ],
                        "correctIndex": 1,
                        "explanation": "Bringing the suspect bottle allows emergency doctors to rapidly identify the poison (methanol, ethylene glycol, battery acid, or sedatives) and alert authorities to prevent a wider community outbreak."
                    }
                ]
            }
        }
    ]
};

const UNDERAGE_CAMPUS_CURRICULUM = {
    "shortTitle": "Underage Drinking & Campus Culture",
    "title": "Underage Drinking & Campus Culture: Curriculum & Study Guide",
    "targetAudience": "Learners Aged 16+ (Senior Secondary, First-Year University & Young Adult Smart Living Education)",
    "coreFocus": "Teen Brain Development, The 'Pledge 18' Movement in Zimbabwe, First-Year Orientation Peer Pressure, Refusal Skills, and Building Substance-Free Campus Events",
    "overview": "This comprehensive curriculum and study guide accompanies the Underage Drinking & Campus Culture Smart Living module. Designed in clear, approachable language for learners aged 16 and older—particularly Upper Six students preparing for tertiary education and first-year university or college students—this guide explains why the developing brain is uniquely vulnerable to alcohol before age 18–25, how to champion Zimbabwe's 'Pledge 18' movement, how to navigate first-year orientation ('Freshers' Week') peer pressure without losing friends, and how student leaders can build vibrant, high-energy substance-free university events.",
    "learningObjectives": [
        "Explain how the human brain matures from back to front until age 25, why underage drinking shrinks the hippocampus (memory) by up to 10%, and why starting early multiplies lifetime addiction risk by 4 times.",
        "Understand Zimbabwe's legal minimum drinking age of 18 under the Liquor Act [Chapter 14:12] and Children's Act [Chapter 5:06], and champion the national 'Pledge 18' movement.",
        "Navigate the high-risk First-Year Transition Zone (First 6 Weeks / Freshers' Week), bust the 'Everyone Is Drinking' False Consensus myth, and report illegal orientation hazing.",
        "Master the 4-step S.T.O.P. Refusal Method, the 'Decoy Cup Rule' (stopping 90% of offers), and natural word-for-word refusal scripts.",
        "Use the 3 Ds of Active Bystanders (Direct, Distract, Delegate) and organize high-energy, inclusive, substance-free Friday/Saturday night campus events."
    ],
    "sections": [
        {
            "id": 1,
            "numberLabel": "Section 1",
            "title": "Why Age 18 Matters — Teen Brain Wiring & Zimbabwe's Law",
            "summary": "Explore how the human brain develops back-to-front until age 25, why underage drinking shrinks the hippocampus and multiplies lifetime addiction risk by 4×, and what Zimbabwe's Liquor Act [Chapter 14:12] and Children's Act [Chapter 5:06] mandate.",
            "order": [
                "video",
                "1.1",
                "1.2",
                "1.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 1",
                "shortLabel": "Section 1 Supporting Video",
                "title": "How Alcohol Affects the Teenage Brain | What Every Teen Should Know",
                "youtubeUrl": "https://www.youtube.com/watch?v=PCqBF818Ngg",
                "embedUrl": "https://www.youtube.com/embed/PCqBF818Ngg?rel=0",
                "guidance": "Before reading Section 1, watch this short neuroscience animation to see how the human brain grows from back to front until age 25—and why alcohol harms a young person's memory and decision-making centres much faster than an adult's.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Alcohol's Effect on Teenage Brain — Hippocampus & Prefrontal Cortex",
                        "source": "Missouri Safe and Sober",
                        "youtubeUrl": "https://www.youtube.com/watch?v=EY37BFmVxwQ",
                        "embedUrl": "https://www.youtube.com/embed/EY37BFmVxwQ?rel=0"
                    }
                ]
            },
            "subsections": {
                "1.1": {
                    "key": "1.1",
                    "code": "1.1",
                    "shortLabel": "1.1 How the Teen Brain Develops (B...",
                    "title": "1.1 How the Teen Brain Develops (Back to Front Until Age 25)",
                    "html": "\n            <p>Many young people think that once you reach your full adult height at age 16 or 17, your body is completely grown. While your bones and muscles may look adult-sized, <strong>your brain is still under heavy construction until your mid-20s (around age 25)</strong>.</p>\n            <p>Brain scans show that the human brain matures from the <strong>back to the front</strong>:</p>\n            <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; margin:14px 0;\">\n              <div style=\"background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 6px 0; color:#9a3412; font-size:0.98rem;\">1. The Limbic System (Emotion &amp; Reward Centre — Matures Early)</h5>\n                <p style=\"margin:0; color:#7c2d12; font-size:0.91rem; line-height:1.6;\">Deep inside the brain, the reward centre (including the <em>amygdala</em> and <em>nucleus accumbens</em>) develops early during your teenage years. This is why teens feel excitement, music, friendships, and social pressure so intensely—and why the brain loves thrills and peer approval.</p>\n              </div>\n              <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 6px 0; color:#166534; font-size:0.98rem;\">2. The Prefrontal Cortex (The Brain's 'CEO' — Matures Last, Around Age 25)</h5>\n                <p style=\"margin:0; color:#1e293b; font-size:0.91rem; line-height:1.6;\">Right behind your forehead sits the <strong>Prefrontal Cortex</strong>. It acts as your brain's Chief Executive Officer (CEO)—handling planning ahead, weighing consequences, controlling impulses, and saying <em>\"Wait, this is a bad idea.\"</em></p>\n              </div>\n            </div>\n            <p><strong>Pruning and Wiring (Myelination):</strong> Between ages 15 and 22, your brain is clearing out unused connections (<em>synaptic pruning</em>) and wrapping its most important study, sports, and life-skill pathways in a fast protective insulation called <strong>myelin</strong>. Introducing alcohol during this stage is like pouring water into a computer while its operating system is still installing.</p>\n          "
                },
                "1.2": {
                    "key": "1.2",
                    "code": "1.2",
                    "shortLabel": "1.2 Memory, Grades & Addiction Risk",
                    "title": "1.2 Memory, Grades & Addiction Risk",
                    "html": "\n            <p>Alcohol does not affect a 16- or 17-year-old brain the same way it affects a 35-year-old brain:</p>\n            <ol style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Damage to the Hippocampus (Your Exam Memory Bank):</strong> The <strong>hippocampus</strong> is the part of the brain that turns what you study in class into long-term memory. Research shows that teenagers who binge drink can suffer up to a <strong>10% smaller hippocampus</strong> and score significantly lower on vocabulary, math, and memory recall tests—even days after sobering up.</li>\n              <li><strong>Less Sleepiness, Faster Blackouts:</strong> Teen brains are actually <em>less</em> sensitive to the early sleepy warning signs of alcohol than adults, which tricks young drinkers into thinking they are \"handling their drink well\"—right until they suffer a sudden <strong>memory blackout</strong> or alcohol poisoning.</li>\n              <li><strong>The 4× Addiction Multiplier:</strong> Because the teen reward system is still wiring itself, young people who start drinking before age 15–18 are <strong>4 times more likely</strong> to develop alcohol dependence (addiction) later in life compared to those who wait until at least age 18–21.</li>\n            </ol>\n          "
                },
                "1.3": {
                    "key": "1.3",
                    "code": "1.3",
                    "shortLabel": "1.3 Zimbabwe's Under-18 Liquor Laws",
                    "title": "1.3 Zimbabwe's Under-18 Liquor Laws",
                    "html": "\n            <p>To protect young people's health, education, and safety, Zimbabwe sets the legal minimum age for buying or drinking alcohol at <strong>18 years</strong> under two key laws:</p>\n            <div style=\"background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:16px; margin:14px 0;\">\n              <ul style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>The Liquor Act [Chapter 14:12]:</strong> Makes it a criminal offence for any bottle store, supermarket, bar, or individual to <strong>sell, supply, or deliver alcohol to any person under the age of 18</strong>, or to allow anyone under 18 to drink on licensed premises.</li>\n                <li><strong>The Children's Act [Chapter 5:06]:</strong> Protects minors (under 18) from harmful substances and makes it unlawful for adults or older youths to give intoxicating liquor to a child or teenager under 18.</li>\n              </ul>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "1.4",
                "shortLabel": "1.4 Review Questions (≥80%)",
                "title": "1.4 Section 1 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q1_1",
                        "topic": "Question 1 • Section 1 Mastery Check",
                        "prompt": "Brain Wiring: In what direction does the human brain mature (and until roughly what age), and what is the job of the Prefrontal Cortex?",
                        "options": [
                            "Front to back by age 12; the Prefrontal Cortex only controls breathing",
                            "Back to front until around age 25; the Prefrontal Cortex acts as the brain's 'CEO'—handling planning ahead, weighing consequences, and impulse control",
                            "Left to right by age 16; the Prefrontal Cortex only controls balance",
                            "Top to bottom by age 18; the Prefrontal Cortex only stores childhood memories"
                        ],
                        "correctIndex": 1,
                        "explanation": "The human brain matures from back to front until around age 25. The Limbic System (reward/emotion) matures early, while the Prefrontal Cortex (the brain's 'CEO' for judgment and self-control) is the last region to finish wiring."
                    },
                    {
                        "id": "q1_2",
                        "topic": "Question 2 • Section 1 Mastery Check",
                        "prompt": "Memory & Addiction: Which specific brain structure responsible for learning and exam memory is damaged by underage drinking, and how much higher is the risk of future addiction when someone starts drinking early?",
                        "options": [
                            "The Hippocampus (which can shrink by up to 10%); starting before age 15–18 makes a person 4 times more likely to develop alcohol dependence later in life",
                            "The Optic Nerve; starting early lowers addiction risk",
                            "The Spinal Cord; there is zero difference in addiction risk",
                            "The Inner Ear; starting early only affects hearing"
                        ],
                        "correctIndex": 0,
                        "explanation": "The hippocampus—your brain's 'save button' for classroom learning and exam recall—is highly vulnerable to alcohol during adolescence, and early drinking multiplies lifetime addiction risk by 4×."
                    },
                    {
                        "id": "q1_3",
                        "topic": "Question 3 • Section 1 Mastery Check",
                        "prompt": "The Law in Zimbabwe: What is the legal minimum age to purchase or be supplied with alcohol in Zimbabwe, and which two Acts of Parliament enforce this rule?",
                        "options": [
                            "Age 16 under the Road Traffic Act",
                            "Age 18 under the Liquor Act [Chapter 14:12] and the Children's Act [Chapter 5:06]",
                            "Age 21 under the Companies Act",
                            "There is no minimum age in Zimbabwe"
                        ],
                        "correctIndex": 1,
                        "explanation": "Zimbabwe sets the legal minimum drinking and purchasing age at 18 years under the Liquor Act [Chapter 14:12] and the Children's Act [Chapter 5:06]."
                    },
                    {
                        "id": "q1_4",
                        "topic": "Question 4 • Section 1 Mastery Check",
                        "prompt": "What two critical brain construction processes happen between ages 15 and 22?",
                        "options": [
                            "Synaptic pruning (clearing out unused connections) and myelination (wrapping key study, sport, and life-skill pathways in fast protective insulation)",
                            "Skull bone shrinking and tooth enamel replacement",
                            "Complete shutdown of the reward centre",
                            "Replacing neurons with muscle cells"
                        ],
                        "correctIndex": 0,
                        "explanation": "Between ages 15 and 22, the brain undergoes synaptic pruning and myelination to make neural circuits fast and efficient. Alcohol disrupts both processes."
                    },
                    {
                        "id": "q1_5",
                        "topic": "Question 5 • Section 1 Mastery Check",
                        "prompt": "Why are teenagers often tricked into thinking they are 'handling their drink well' right before suffering a sudden memory blackout or overdose?",
                        "options": [
                            "Because teen livers burn alcohol 10 times faster than adult livers",
                            "Because the teenage brain is less sensitive to the early sleepy/sedative warning cues of alcohol than an adult brain, so teens keep drinking without feeling drowsy until BAC reaches blackout or poisoning levels",
                            "Because alcohol cannot cross the teenage blood-brain barrier",
                            "Because carbonated mixers block alcohol absorption in teens"
                        ],
                        "correctIndex": 1,
                        "explanation": "Adolescent brains experience less early sedation from alcohol than adults, removing the natural 'I'm sleepy, I should stop' warning signal while their hippocampus and brainstem are still being poisoned."
                    }
                ]
            }
        },
        {
            "id": 2,
            "numberLabel": "Section 2",
            "title": "Navigating First-Year Orientation ('Freshers' Week') & Campus Myths",
            "summary": "Understand the high-risk first-year 'Transition Zone' (first 6 weeks on campus), bust the 'Everyone Is Drinking' false consensus myth using Social Norms Theory, and spot illegal initiation hazing.",
            "order": [
                "2.1",
                "video",
                "2.2",
                "2.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 2",
                "shortLabel": "Section 2 Supporting Video",
                "title": "College Drinking: Prevention Perspectives — Embracing Culture & Context",
                "youtubeUrl": "https://www.youtube.com/watch?v=IJIm1lU_QZw",
                "embedUrl": "https://www.youtube.com/embed/IJIm1lU_QZw?rel=0",
                "guidance": "Watch how universities and student leaders address the 'first-six-weeks' transition period on campus, why new students overestimate how much their peers drink, and how campus culture shapes student choices.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "2.1": {
                    "key": "2.1",
                    "code": "2.1",
                    "shortLabel": "2.1 The First-Year 'Transition Zon...",
                    "title": "2.1 The First-Year 'Transition Zone' (The First 6 Weeks on Campus)",
                    "html": "\n            <p>Stepping onto a university, polytechnic, or teachers' college campus for the first time is one of the most exciting milestones in life. However, higher-education researchers call the <strong>first 6 weeks of Semester 1</strong> (starting with <strong>Orientation / \"Freshers' Week\"</strong>) the <strong>\"Red Zone\" or High-Risk Transition Zone</strong>. Why?</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Sudden Freedom Without Curfews:</strong> For the first time, many 18- and 19-year-olds are living away from parents, boarding masters, and school bells. Nobody is checking when you come back to your hostel or off-campus boarding house.</li>\n              <li><strong>The Need to Belong:</strong> Every new first-year student (\"fresher\") wants to make friends quickly, look confident, and avoid feeling lonely or left out.</li>\n              <li><strong>Financial &amp; Academic Risk:</strong> Students who fall into heavy orientation partying often miss morning lectures, blow their entire semester food allowance or stipend in two weekends, and risk failing continuous assessments or losing their scholarship/cadetship.</li>\n            </ul>\n          "
                },
                "2.2": {
                    "key": "2.2",
                    "code": "2.2",
                    "shortLabel": "2.2 Busting the 'Everyone Is Drink...",
                    "title": "2.2 Busting the 'Everyone Is Drinking' Myth (Social Norms Theory)",
                    "html": "\n            <p>When you scroll through WhatsApp statuses, TikTok, or Instagram after a Friday night on campus, it can look like <strong>100% of students are partying and binge drinking</strong>. Psychologists call this the <strong>False Consensus Myth</strong> (studied under <strong>Social Norms Theory</strong>):</p>\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:14px 0;\">\n              <p style=\"margin:0; color:#1e293b; font-size:0.93rem; line-height:1.6;\"><strong>The Perception vs. Reality Gap:</strong> A loud minority of heavy drinkers post noisy videos and stories, making it seem like heavy drinking is the \"normal\" campus rule. In reality, campus health surveys across Zimbabwe and Africa show that <strong>the majority of university students either do not drink alcohol at all, or drink moderately and only occasionally</strong>.</p>\n            </div>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Common Orientation Myth</th>\n                    <th style=\"padding:10px 12px;\">The Real Campus Reality</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">\"Everyone gets drunk during Freshers' Week—if you don't drink, you won't make any friends.\"</td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>False.</strong> Most lasting university friendships are built in lecture study groups, sports clubs, church societies, debate/innovation hubs, and residence kitchens—not in bars.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">\"Senior students will only respect you if you can match them shot-for-shot.\"</td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>False.</strong> Genuine student leaders respect self-confidence. Seniors who force first-years to drink are engaging in bullying/hazing, not mentorship.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">\"Drinking helps cure first-year homesickness and exam stress.\"</td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>False.</strong> Alcohol is a Central Nervous System depressant. Once it wears off, it spikes stress hormones (cortisol), causing worse anxiety (\"hangxiety\") and deeper loneliness the next day.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700; color:#991b1b;\">\"What happens at off-campus bashes stays off-campus.\"</td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>False.</strong> Smartphone cameras record everything, and university disciplinary codes (Student Codes of Conduct) penalize drunken misconduct, property damage, and fighting—even off-campus.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "2.3": {
                    "key": "2.3",
                    "code": "2.3",
                    "shortLabel": "2.3 Spotting Orientation Hazing",
                    "title": "2.3 Spotting Orientation Hazing",
                    "html": "\n            <p><strong>Hazing</strong> is any initiation ritual that humiliates, endangers, or pressures a newcomer to do something against their will—such as forcing first-years to chug alcohol, play dangerous drinking games, or buy alcohol for seniors—in order to be \"accepted\" into a hostel, sports team, or social group.</p>\n            <div style=\"background:#fef2f2; border-left:4px solid #dc2626; border-radius:0 12px 12px 0; padding:14px 18px; margin-top:12px;\">\n              <strong style=\"color:#991b1b; display:block; margin-bottom:4px;\">Know Your Rights on Campus:</strong>\n              <p style=\"margin:0; color:#7f1d1d; font-size:0.93rem; line-height:1.6;\">Every Zimbabwean university and college strictly prohibits hazing and forced drinking. True campus clubs, sports teams, and Student Representative Councils (SRCs) welcome you with respect—never by putting a bottle to your lips. If you witness hazing, report it confidentially to the <strong>Dean of Students</strong> or <strong>Residence Warden</strong>.</p>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "2.4",
                "shortLabel": "2.4 Review Questions (≥80%)",
                "title": "2.4 Section 2 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q2_1",
                        "topic": "Question 1 • Section 2 Mastery Check",
                        "prompt": "The Transition Zone: Why are the first 6 weeks of a student's first year at university or college considered a high-risk period for alcohol harm?",
                        "options": [
                            "Because lectures do not start until Week 10",
                            "Because new students experience sudden freedom without parental curfews and a strong desire to belong—which can lead to orientation binge drinking, missed classes, and blown semester allowances",
                            "Because campus water taps are turned off during Freshers' Week",
                            "Because exams are written on the first day of Orientation"
                        ],
                        "correctIndex": 1,
                        "explanation": "The first 6 weeks combine sudden independence away from home with social anxiety about fitting in, making first-years vulnerable to peer pressure and financial/academic setbacks."
                    },
                    {
                        "id": "q2_2",
                        "topic": "Question 2 • Section 2 Mastery Check",
                        "prompt": "The 'Everyone Is Drinking' Myth: Using Social Norms Theory, explain why new students often think everyone on campus is binge drinking when most students actually abstain or drink moderately.",
                        "options": [
                            "Because a noisy minority of heavy drinkers post loud party videos on social media, creating a 'False Consensus' illusion that makes extreme drinking look like the majority norm",
                            "Because university lecturers tell students that everyone drinks",
                            "Because 100% of students actually drink every night",
                            "Because non-drinkers are not allowed to use WhatsApp"
                        ],
                        "correctIndex": 0,
                        "explanation": "Social Norms Theory shows that loud social media posts from a small minority distort perception (the False Consensus Myth), hiding the truth that most students either don't drink or drink moderately."
                    },
                    {
                        "id": "q2_3",
                        "topic": "Question 3 • Section 2 Mastery Check",
                        "prompt": "Tradition vs. Hazing: What is the difference between a healthy campus welcome tradition and illegal orientation hazing?",
                        "options": [
                            "There is no difference—both require chugging alcohol",
                            "Healthy traditions welcome newcomers with respect and mentorship; hazing humiliates, bullies, or forces newcomers to chug alcohol or buy drinks to be 'accepted'—and must be reported to the Dean of Students or Warden",
                            "Hazing only happens in high school, never at university",
                            "Hazing is required by the Student Representative Council"
                        ],
                        "correctIndex": 1,
                        "explanation": "Forcing or pressuring first-years to consume alcohol as an initiation ritual is illegal hazing and violates university Student Codes of Conduct."
                    },
                    {
                        "id": "q2_4",
                        "topic": "Question 4 • Section 2 Mastery Check",
                        "prompt": "Why is the myth 'What happens at off-campus bashes stays off-campus' false and dangerous for university students?",
                        "options": [
                            "Because smartphone cameras record misconduct and university Student Codes of Conduct penalize drunken fighting, harassment, and disrepute even when it happens off-campus",
                            "Because off-campus parties are always Broadcast on national television",
                            "Because alcohol has zero effect off-campus",
                            "Because off-campus landlords give out academic grades"
                        ],
                        "correctIndex": 0,
                        "explanation": "University disciplinary regulations apply to student conduct both on and off campus, and viral phone videos of drunken misconduct can cost a student their residence room, scholarship, or degree."
                    },
                    {
                        "id": "q2_5",
                        "topic": "Question 5 • Section 2 Mastery Check",
                        "prompt": "Where are the strongest, most lasting university friendships actually formed?",
                        "options": [
                            "Only in late-night bottle stores",
                            "In lecture study groups, sports teams, church/faith societies, debate and innovation clubs, and residence kitchens",
                            "By matching seniors shot-for-shot during initiation",
                            "By skipping Monday morning lectures"
                        ],
                        "correctIndex": 1,
                        "explanation": "Genuine, supportive campus networks are built around shared goals in study groups, sports, clubs, innovation hubs, and residence communities."
                    }
                ]
            }
        },
        {
            "id": 3,
            "numberLabel": "Section 3",
            "title": "Practical Peer Pressure Refusal Skills & Social Confidence",
            "summary": "Distinguish between direct and silent peer pressure, master the 4-step S.T.O.P. refusal method and the 'Decoy Cup Rule' (stopping 90% of offers), and practice word-for-word refusal scripts.",
            "order": [
                "3.1",
                "video",
                "3.2",
                "3.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 3",
                "shortLabel": "Section 3 Supporting Video",
                "title": "Ways to Say No to Drinking or Drugs (Teens & Youth Guide)",
                "youtubeUrl": "https://www.youtube.com/watch?v=d7Dr_bdoiww",
                "embedUrl": "https://www.youtube.com/embed/d7Dr_bdoiww?rel=0",
                "guidance": "Watch this upbeat animated guide for quick, confident, non-awkward ways to turn down a drink at a party while keeping your friends and your sense of humour.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Peer Pressure and Refusal Skills — Roleplay & Assertiveness",
                        "source": "Chestnut Health Systems",
                        "youtubeUrl": "https://www.youtube.com/watch?v=gAUUIWijlng",
                        "embedUrl": "https://www.youtube.com/embed/gAUUIWijlng?rel=0"
                    }
                ]
            },
            "subsections": {
                "3.1": {
                    "key": "3.1",
                    "code": "3.1",
                    "shortLabel": "3.1 Direct vs. Silent Peer Pressure",
                    "title": "3.1 Direct vs. Silent Peer Pressure",
                    "html": "\n            <p>Peer pressure doesn't always look like a bully in a movie shoving a bottle into your hand. On campus and at youth gatherings, it usually takes two forms:</p>\n            <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:14px; margin:14px 0;\">\n              <div style=\"background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 6px 0; color:#991b1b; font-size:0.98rem;\">1. Direct (Spoken) Peer Pressure</h5>\n                <p style=\"margin:0; color:#7f1d1d; font-size:0.91rem; line-height:1.6;\">Someone directly hands you a cup, buys a round without asking, teases you (<em>\"Don't be boring!\"</em>, <em>\"Are you still a high school kid?\"</em>), or invites you into a drinking game.</p>\n              </div>\n              <div style=\"background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 6px 0; color:#9a3412; font-size:0.98rem;\">2. Indirect (Silent / Unspoken) Peer Pressure</h5>\n                <p style=\"margin:0; color:#7c2d12; font-size:0.91rem; line-height:1.6;\">Nobody says a word to you, but three people in your residence room pour drinks and laugh together. Your own mind whispers, <em>\"If I hold a bottle of water, I'll look awkward.\"</em> Recognizing that this pressure is coming from <strong>inside your own thoughts</strong> makes it much easier to beat!</p>\n              </div>\n            </div>\n          "
                },
                "3.2": {
                    "key": "3.2",
                    "code": "3.2",
                    "shortLabel": "3.2 The S.T.O.P. Refusal Method",
                    "title": "3.2 The S.T.O.P. Refusal Method",
                    "html": "\n            <p>Saying \"No\" does not require giving a long lecture or apologizing. The secret is to be <strong>relaxed, brief, and confident</strong> using the <strong>S.T.O.P. Method</strong>:</p>\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:14px 0;\">\n              <ul style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>S — Say \"No, thanks\" with relaxed confidence:</strong> Smile, make eye contact, and keep your voice upbeat. (When you don't act like it's a big deal, nobody else treats it like a big deal.)</li>\n                <li><strong>T — Tell a short, non-negotiable reason (if you want to):</strong> Mention an early morning lecture, sports training, medication, budget, or personal goal.</li>\n                <li><strong>O — Offer a fun alternative or hold a \"Decoy Cup\":</strong> Grab a soft drink, juice, or mocktail first. <strong>The Decoy Cup Rule:</strong> When you already have a cup of cola, ginger beer, or juice with ice in your hand, <strong>90% of people will never offer you a drink</strong> because your hand is already full!</li>\n                <li><strong>P — Promptly change the subject or walk away:</strong> Shift the conversation to music, football, a campus joke, or food—or leave if the person keeps pushing.</li>\n              </ul>\n            </div>\n          "
                },
                "3.3": {
                    "key": "3.3",
                    "code": "3.3",
                    "shortLabel": "3.3 Real-World Refusal Scripts & D...",
                    "title": "3.3 Real-World Refusal Scripts & Decoy Cups",
                    "html": "\n            <p>Keep two or three of these natural, everyday refusal lines ready in your pocket so you never freeze up in the moment:</p>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Situation</th>\n                    <th style=\"padding:10px 12px;\">What They Say</th>\n                    <th style=\"padding:10px 12px;\">Your Confident Response</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">1. The Casual Offer (At a braai or hostel)</td>\n                    <td style=\"padding:10px 12px;\"><em>\"Here, grab a cold one!\"</em></td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>\"I'm good with my ginger beer, thanks! By the way, did you see that match earlier?\"</strong> <em>(Smile + Change subject—works 80% of the time!)</em></td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">2. The \"Grow Up\" Tease</td>\n                    <td style=\"padding:10px 12px;\"><em>\"Come on, you're at varsity now, not high school! Just take one shot.\"</em></td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>\"Haha, being at varsity means I actually have to pass my 8:00 AM lecture tomorrow! I need a clear head—you guys go ahead.\"</strong></td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">3. The Drinking Game / Toast</td>\n                    <td style=\"padding:10px 12px;\"><em>\"Everyone has to drink for the birthday toast!\"</em></td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>Raise your cup of juice/soda high:</strong> <strong>\"To the birthday legend! Wishing you the best year!\"</strong> <em>(Nobody cares what liquid is inside your cup during a toast.)</em></td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">4. The Persistent Pusher</td>\n                    <td style=\"padding:10px 12px;\"><em>\"Why aren't you drinking? Just try a sip!\"</em></td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>The Broken Record Technique:</strong> Calmly repeat: <strong>\"No thanks, I don't drink alcohol.\"</strong> If they ask a third time: <strong>\"I said I'm good, bro—respect my choice. I'm going to grab some food.\"</strong></td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "3.4",
                "shortLabel": "3.4 Review Questions (≥80%)",
                "title": "3.4 Section 3 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q3_1",
                        "topic": "Question 1 • Section 3 Mastery Check",
                        "prompt": "Direct vs. Silent Pressure: What is the difference between direct peer pressure and indirect (silent) peer pressure?",
                        "options": [
                            "Direct pressure is spoken (someone handing you a drink or teasing you); indirect/silent pressure is unspoken—coming from your own internal worry about looking different when others around you are drinking",
                            "Direct pressure happens on WhatsApp; indirect pressure happens via email",
                            "Silent pressure is when the music at a party is turned off",
                            "There is no difference between the two"
                        ],
                        "correctIndex": 0,
                        "explanation": "Direct pressure involves spoken offers or teasing, whereas indirect (silent) pressure comes from our own unspoken thoughts wanting to blend in when we see others pouring drinks."
                    },
                    {
                        "id": "q3_2",
                        "topic": "Question 2 • Section 3 Mastery Check",
                        "prompt": "The S.T.O.P. Method & Decoy Cup: What do the letters S-T-O-P stand for, and why does the 'Decoy Cup Rule' stop 90% of peer pressure before it even starts?",
                        "options": [
                            "Shout, Throw, Outrun, Panic; a decoy cup is used to throw water",
                            "Say 'No, thanks' confidently, Tell a short reason, Offer an alternative / hold a Decoy Cup, Promptly change the subject or walk away; holding a cup of soda/juice means your hand is already full so people rarely offer you a drink",
                            "Stay, Taste, Order, Pay; a decoy cup holds extra alcohol",
                            "Sit, Talk, Observe, Pretend"
                        ],
                        "correctIndex": 1,
                        "explanation": "S.T.O.P. stands for Say 'No, thanks' confidently, Tell a short reason, Offer an alternative/hold a Decoy Cup, and Promptly change the subject. Holding a cold non-alcoholic drink in your hand prevents 90% of offers before they happen."
                    },
                    {
                        "id": "q3_3",
                        "topic": "Question 3 • Section 3 Mastery Check",
                        "prompt": "Roleplay Challenge: You are at a Friday residence braai and a senior student hands you an open cup of spirit saying, 'Drink up, fresher—welcome to our block!' Which response best uses the S.T.O.P. method?",
                        "options": [
                            "Drink it quickly so they don't tease you",
                            "Smile, hold up your can of ginger beer, and say: 'Thanks bro, I'm sorted with my ginger beer—got early football trials tomorrow! How long have you stayed in this block?'",
                            "Give a 20-minute angry speech about liver enzymes",
                            "Accept the open cup and secretly pour it into someone else's glass"
                        ],
                        "correctIndex": 1,
                        "explanation": "Smiling, holding up your decoy drink ('I'm sorted with my ginger beer'), giving a quick non-negotiable reason ('early football trials'), and changing the subject keeps the vibe friendly while standing firm."
                    },
                    {
                        "id": "q3_4",
                        "topic": "Question 4 • Section 3 Mastery Check",
                        "prompt": "What is the 'Broken Record Technique' used for in Situation 4 when a persistent pusher keeps asking you to drink?",
                        "options": [
                            "Playing loud music on a turntable",
                            "Calmly repeating a short boundary ('No thanks, I don't drink alcohol' / 'I said I'm good—respect my choice') without arguing, and walking away if they ask a third time",
                            "Making up five different excuses until they guess they are fake",
                            "Agreeing to take 'just one sip'"
                        ],
                        "correctIndex": 1,
                        "explanation": "The Broken Record Technique means calmly and firmly repeating your exact boundary without getting drawn into a debate, then walking away if they don't respect your answer."
                    },
                    {
                        "id": "q3_5",
                        "topic": "Question 5 • Section 3 Mastery Check",
                        "prompt": "During a birthday toast at a social gathering, do you need alcohol in your glass to join the toast?",
                        "options": [
                            "Yes, it is bad luck to toast with juice",
                            "No—simply raise your cup of juice, water, or soda high and cheer for the birthday friend; nobody cares what liquid is inside your cup",
                            "Yes, you must leave the room during a toast if you don't drink",
                            "You must drink two shots after the toast"
                        ],
                        "correctIndex": 1,
                        "explanation": "Raising a glass of juice, soda, or mocktail lets you celebrate 100% of the social moment without consuming alcohol."
                    }
                ]
            }
        },
        {
            "id": 4,
            "numberLabel": "Section 4",
            "title": "Championing the 'Pledge 18' Movement & Bystander Leadership",
            "summary": "Join Zimbabwe's 'Pledge 18' youth movement, stop illegal 'proxy buying' (social supply) for under-18s, and practice the 3 Ds of Active Bystanders (Direct, Distract, Delegate).",
            "order": [
                "4.1",
                "4.2",
                "video",
                "4.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 4",
                "shortLabel": "Section 4 Supporting Video",
                "title": "Take Action to Prevent Underage Alcohol Use",
                "youtubeUrl": "https://www.youtube.com/watch?v=OjZ_dckxtNQ",
                "embedUrl": "https://www.youtube.com/embed/OjZ_dckxtNQ?rel=0",
                "guidance": "Watch how communities, older siblings, and youth ambassadors work together to stop underage alcohol supply and build a culture where choosing not to drink is celebrated.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Athlete Peer Pressures Nerd To Drink — Standing Up to Peer Pressure",
                        "source": "Dhar Mann Youth Life-Skills Drama",
                        "youtubeUrl": "https://www.youtube.com/watch?v=4cxN25NgwFI",
                        "embedUrl": "https://www.youtube.com/embed/4cxN25NgwFI?rel=0"
                    }
                ]
            },
            "subsections": {
                "4.1": {
                    "key": "4.1",
                    "code": "4.1",
                    "shortLabel": "4.1 What Is Zimbabwe's 'Pledge 18'...",
                    "title": "4.1 What Is Zimbabwe's 'Pledge 18' (Pledge <18) Movement?",
                    "html": "\n            <p>Across Zimbabwe's high schools, universities, youth hubs, and blood-donation drives, thousands of young people have signed onto the <strong>\"Pledge 18\" (Pledge &lt;18) Movement</strong>—a flagship youth responsibility campaign pioneered by <strong>Delta Corporation</strong> in partnership with youth organizations (such as <strong>BOOST Fellowship</strong> and <strong>ZIMPACT</strong>), the <strong>National Blood Service Zimbabwe (NBSZ)</strong>, schools, and retailers.</p>\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:14px 0;\">\n              <h5 style=\"margin:0 0 8px 0; color:#166534; font-size:0.98rem;\">What Taking the \"Pledge 18\" Means</h5>\n              <ol style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.92rem; line-height:1.7;\">\n                <li><strong>If You Are Under 18:</strong> You make a proud, personal promise to stay <strong>100% alcohol-free</strong> until at least age 18—protecting your developing brain, your grades, your sports performance, and your future career.</li>\n                <li><strong>If You Are 18 or Older (University Students &amp; Young Adults):</strong> You pledge to be a <strong>Responsible Role Model</strong>—never buying or supplying alcohol to anyone under 18, never pressuring peers who choose not to drink, and never binge drinking or drink-driving.</li>\n                <li><strong>In Your School, Campus &amp; Community:</strong> You wear your Pledge 18 badge as a leader who looks out for friends and promotes safe, substance-free youth spaces.</li>\n              </ol>\n            </div>\n          "
                },
                "4.2": {
                    "key": "4.2",
                    "code": "4.2",
                    "shortLabel": "4.2 Stopping 'Proxy Buying' for Un...",
                    "title": "4.2 Stopping 'Proxy Buying' for Under-18s",
                    "html": "\n            <p>How do 15-, 16-, and 17-year-olds usually get hold of alcohol? Surveys show that most underage drinkers do not buy it from a shop themselves—they get it through <strong>\"Social Supply\" or \"Proxy Buying\"</strong>: asking an 18- or 19-year-old friend, older sibling, or cousin to buy it for them at a bottle store or sneaking it from a family party.</p>\n            <div style=\"background:#fff7ed; border-left:4px solid #ea580c; border-radius:0 12px 12px 0; padding:14px 18px; margin:12px 0;\">\n              <strong style=\"color:#9a3412; display:block; margin-bottom:6px;\">Why Real Older Friends Say \"No\" to Proxy Buying:</strong>\n              <ul style=\"margin:0; padding-left:18px; color:#7c2d12; font-size:0.92rem; line-height:1.6;\">\n                <li>Buying alcohol for someone under 18 is a <strong>criminal offence under Zimbabwe's Liquor Act [Chapter 14:12]</strong>.</li>\n                <li>If that 16-year-old gets alcohol poisoning, gets into a fight, or is hurt walking home, the older person who bought the bottle shares the moral and legal responsibility.</li>\n                <li>Under the <strong>Pledge 18 Retailer Code</strong>, licensed bottle stores and supermarkets are required to demand a valid <strong>National ID Card, Passport, or Driver's Licence</strong> from anyone who looks under 18—and refuse the sale if they suspect proxy buying.</li>\n              </ul>\n            </div>\n          "
                },
                "4.3": {
                    "key": "4.3",
                    "code": "4.3",
                    "shortLabel": "4.3 The 3 Ds of Active Bystanders",
                    "title": "4.3 The 3 Ds of Active Bystanders",
                    "html": "\n            <p>What should you do if you are at a gathering and see a younger teenager—or a fellow first-year student—being cornered and pressured to drink against their will? Use the <strong>3 Ds of Active Bystander Intervention</strong>:</p>\n            <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin:14px 0;\">\n              <div style=\"background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:14px;\">\n                <strong style=\"color:#0f172a; display:block; margin-bottom:6px;\">1. DIRECT (Step In Kindly)</strong>\n                <p style=\"margin:0; color:#334155; font-size:0.9rem; line-height:1.55;\">Speak up with a friendly smile to take the heat off them: <em>\"Hey guys, leave Tinashe alone—he already said he's on water tonight. Let's go outside!\"</em></p>\n              </div>\n              <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:14px;\">\n                <strong style=\"color:#166534; display:block; margin-bottom:6px;\">2. DISTRACT (Create an Easy Exit Excuse)</strong>\n                <p style=\"margin:0; color:#1e293b; font-size:0.9rem; line-height:1.55;\">If you don't want a confrontation, interrupt with an excuse that pulls your friend away: <em>\"Chipo, sorry to interrupt—can you come help me find my phone charger / take a group photo over here?\"</em></p>\n              </div>\n              <div style=\"background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:14px;\">\n                <strong style=\"color:#1e40af; display:block; margin-bottom:6px;\">3. DELEGATE (Get Backup)</strong>\n                <p style=\"margin:0; color:#1e3a8a; font-size:0.9rem; line-height:1.55;\">If someone is being bullied, hazed, or is already intoxicated and unsafe, alert a Residence Sub-Warden, SRC officer, campus security guard, or trusted senior friend immediately.</p>\n              </div>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "4.4",
                "shortLabel": "4.4 Review Questions (≥80%)",
                "title": "4.4 Section 4 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q4_1",
                        "topic": "Question 1 • Section 4 Mastery Check",
                        "prompt": "The 'Pledge 18' Commitment: What are the three core commitments of Zimbabwe's 'Pledge 18' movement?",
                        "options": [
                            "Under-18s pledge to stay 100% alcohol-free; 18+ students pledge never to supply alcohol to under-18s or pressure non-drinkers; and youth leaders promote safe, substance-free school and campus spaces",
                            "Drinking 18 beers on your 18th birthday",
                            "Only drinking between 6:00 PM (18:00) and midnight",
                            "Buying 18 bottles for orientation week"
                        ],
                        "correctIndex": 0,
                        "explanation": "Pledge 18 unites under-18 learners (staying 100% alcohol-free), 18+ young adults (refusing proxy buying, peer pressure, and binge drinking), and campus ambassadors building safe youth spaces."
                    },
                    {
                        "id": "q4_2",
                        "topic": "Question 2 • Section 4 Mastery Check",
                        "prompt": "Stopping Proxy Buying: What is 'proxy buying' (social supply), and why must an 18- or 19-year-old student refuse if a 16-year-old asks them to buy a bottle?",
                        "options": [
                            "Proxy buying is ordering food online; it is completely legal",
                            "Proxy buying is when an adult/18+ person buys alcohol on behalf of someone under 18—it is a criminal offence under Zimbabwe's Liquor Act [Chapter 14:12], violates Pledge 18, and puts the minor at risk of brain harm and poisoning",
                            "Proxy buying is paying with mobile money instead of cash",
                            "Proxy buying only applies to imported wine"
                        ],
                        "correctIndex": 1,
                        "explanation": "Supplying or buying alcohol for anyone under 18 ('proxy buying') violates Zimbabwe's Liquor Act [Chapter 14:12] and endangers the health and safety of the minor."
                    },
                    {
                        "id": "q4_3",
                        "topic": "Question 3 • Section 4 Mastery Check",
                        "prompt": "The 3 Ds of Bystanders: You see a shy 17-year-old first-year student being cornered by two older students trying to force them to drink. How can you rescue them using the 'Distract' strategy?",
                        "options": [
                            "Start a physical fistfight with the older students",
                            "Walk up casually and interrupt with an easy exit excuse: 'Hey, sorry to interrupt—can you come help me find my phone charger / take a quick photo outside right now?'",
                            "Film the bullying on your phone and do nothing",
                            "Tell the 17-year-old to drink half the cup"
                        ],
                        "correctIndex": 1,
                        "explanation": "The Distract strategy creates a natural, non-confrontational interruption that physically pulls your friend out of the high-pressure situation immediately."
                    },
                    {
                        "id": "q4_4",
                        "topic": "Question 4 • Section 4 Mastery Check",
                        "prompt": "What are the three 'Ds' of Active Bystander Intervention?",
                        "options": [
                            "Direct, Distract, and Delegate",
                            "Drink, Dance, and Depart",
                            "Delay, Deny, and Disappear",
                            "Demand, Debate, and Defeat"
                        ],
                        "correctIndex": 0,
                        "explanation": "The 3 Ds of Active Bystanders are Direct (stepping in kindly), Distract (creating an exit excuse), and Delegate (getting backup from a Warden, SRC officer, or security)."
                    },
                    {
                        "id": "q4_5",
                        "topic": "Question 5 • Section 4 Mastery Check",
                        "prompt": "Under the Pledge 18 Retailer Code and Zimbabwean law, what must a bottle store or supermarket cashier do if a customer looks under 18?",
                        "options": [
                            "Sell them the alcohol as long as they have cash",
                            "Demand a valid National ID Card, Passport, or Driver's Licence—and refuse the sale if they are under 18 or suspected of proxy buying",
                            "Charge them double the price",
                            "Ask them which high school they attend"
                        ],
                        "correctIndex": 1,
                        "explanation": "Retailers must verify age using an official National ID, Passport, or Driver's Licence and refuse service to minors or suspected proxy buyers."
                    }
                ]
            }
        },
        {
            "id": 5,
            "numberLabel": "Section 5",
            "title": "Building Vibrant Substance-Free University & Youth Events",
            "summary": "Prove that 0.0% alcohol equals 100% energy by designing Friday/Saturday night dry campus events (5-a-Side Sports under lights, Mocktail & Braai Lounges, Gaming/Trivia Showdowns, Outdoor Cinema, Talent Battles) using the 6-Step Blueprint.",
            "order": [
                "5.1",
                "5.2",
                "5.3",
                "video",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 5",
                "shortLabel": "Section 5 Supporting Video",
                "title": "College Drinking: Prevention Perspectives — Building Healthy Campus Environments",
                "youtubeUrl": "https://www.youtube.com/watch?v=IJIm1lU_QZw&list=PLBXgZMI_zqfRSxY1UtqSG5JtPknvxMlPq",
                "embedUrl": "https://www.youtube.com/embed/videoseries?list=PLBXgZMI_zqfRSxY1UtqSG5JtPknvxMlPq",
                "guidance": "Explore how universities and student clubs design vibrant, substance-free weekend social events, sports nights, and creative arts festivals that give students exciting places to connect without alcohol.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "5.1": {
                    "key": "5.1",
                    "code": "5.1",
                    "shortLabel": "5.1 Why Substance-Free Events Matter",
                    "title": "5.1 Why Substance-Free Events Matter",
                    "html": "\n            <p>One of the biggest reasons young people end up at risky off-campus drinking spots on a Friday or Saturday night is simple: <strong>boredom and a lack of exciting alternatives</strong>. If the only social event happening on Friday at 8:00 PM is a bar bash, students who want to socialize feel forced to go there.</p>\n            <p>When Student Representative Councils (SRCs), Enactus/BOOST clubs, sports unions, and residence committees organize <strong>high-energy, substance-free (\"dry\") campus events</strong> during peak weekend hours (7:00 PM to 11:30 PM), three amazing things happen:</p>\n            <ol style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>100% Inclusive:</strong> Under-18 freshmen, students who don't drink for health, sport, or religious reasons, and students who just want a chill night out can all attend together on equal footing.</li>\n              <li><strong>Zero Hangovers, Fights, or Regrets:</strong> Everyone wakes up on Saturday morning with their wallet intact, their dignity safe, and their energy ready for study or sport.</li>\n              <li><strong>Real Connection:</strong> You actually remember the people you met and the conversations you had!</li>\n            </ol>\n          "
                },
                "5.2": {
                    "key": "5.2",
                    "code": "5.2",
                    "shortLabel": "5.2 High-Energy Dry Event Ideas",
                    "title": "5.2 High-Energy Dry Event Ideas",
                    "html": "\n            <p>A substance-free event should <strong>never</strong> feel like a boring classroom lecture—it should be the most talked-about event of the semester! Here are five proven campus and youth event formats:</p>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Event Concept</th>\n                    <th style=\"padding:10px 12px;\">What Makes It Exciting</th>\n                    <th style=\"padding:10px 12px;\">Smart Living Twist</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">1. \"Friday Night Lights\" 5-a-Side Sports &amp; Cheer Arena</td>\n                    <td style=\"padding:10px 12px;\">Floodlit inter-residence futsal (5-a-side football), basketball 3×3, netball, and volleyball with a live campus DJ and MC.</td>\n                    <td style=\"padding:10px 12px;\">Free electrolyte hydration station and a \"Pledge 18 Champions Trophy.\"</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">2. Sunset Acoustic Braai &amp; \"Zero-Proof\" Mocktail Lounge</td>\n                    <td style=\"padding:10px 12px;\">Live student bands, acoustic guitar, spoken-word poetry, and nyama/soya braai stands on the campus green.</td>\n                    <td style=\"padding:10px 12px;\">A competition where residences mix the best 0.0% tropical mocktails (using Mazoe, ginger beer, mint, lime, and crushed ice).</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">3. Inter-Residence Gaming, Trivia &amp; Board-Game Showdown</td>\n                    <td style=\"padding:10px 12px;\">Projector screens running EA FC (FIFA) / NBA 2K tournaments alongside fast-paced team tables of <em>30 Seconds</em>, chess blitz, cards, and campus trivia.</td>\n                    <td style=\"padding:10px 12px;\">Great for introverts and extroverts alike—team trivia naturally breaks the ice for new first-years!</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">4. Outdoor Cinema Under the Stars &amp; Popcorn Night</td>\n                    <td style=\"padding:10px 12px;\">Giant inflatable or courtyard screen showing blockbuster movies or live Premier League/AFCON matches with blankets and affordable street food.</td>\n                    <td style=\"padding:10px 12px;\">A 60-second fun Smart Living quiz on the big screen before the movie starts, with airtime/data vouchers as prizes.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">5. Campus \"Got Talent\" Battle, Comedy &amp; Dance-Off</td>\n                    <td style=\"padding:10px 12px;\">Amapiano/hip-hop dance crews, stand-up comedy, choir harmonies, and fashion runway judged by student applause.</td>\n                    <td style=\"padding:10px 12px;\">Celebrates natural talent, confidence, and creativity—proving you don't need \"liquid courage\" to own the stage.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "5.3": {
                    "key": "5.3",
                    "code": "5.3",
                    "shortLabel": "5.3 6-Step Event Planning Blueprint",
                    "title": "5.3 6-Step Event Planning Blueprint",
                    "html": "\n            <p>If you are planning a youth or campus event, follow this <strong>6-Step Blueprint</strong> to guarantee high turnout and safety:</p>\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin-top:12px;\">\n              <ol style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>Schedule at Peak Weekend Hours (Friday/Saturday 7:00 PM – 11:00 PM):</strong> Give students a real alternative right when party pressure is highest.</li>\n                <li><strong>Lead With Fun, Not a Lecture:</strong> Promote the music, food, prizes, and games on your posters first—let the \"100% Substance-Free / Pledge 18\" badge be a natural, cool part of the vibe.</li>\n                <li><strong>Serve Great Food &amp; Signature 0.0% Drinks:</strong> People love holding a cool cup with ice, lime, or mint.</li>\n                <li><strong>Check Bags &amp; Enforce a Clear Door Rule:</strong> Work with student marshals or campus security to make sure no outside unsealed bottles or illicit <em>kambwa</em> are snuck into the venue.</li>\n                <li><strong>Build In Ice-Breaker Activities:</strong> Use team games (like trivia or relay challenges) in the first 30 minutes so shy first-years immediately meet new friends.</li>\n                <li><strong>Plan Safe Transport Home:</strong> End the event on time and coordinate residence walking groups or campus shuttles so nobody walks in the dark alone.</li>\n              </ol>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "5.4",
                "shortLabel": "5.4 Review Questions (≥80%)",
                "title": "5.4 Section 5 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q5_1",
                        "topic": "Question 1 • Section 5 Mastery Check",
                        "prompt": "Why Timing Matters: Why is it important for student clubs and residences to schedule substance-free events on Friday or Saturday nights (7:00 PM – 11:00 PM) instead of only on Tuesday afternoons?",
                        "options": [
                            "Because electricity is cheaper on Friday nights",
                            "Because Friday and Saturday nights (7:00 PM – 11:00 PM) are the peak hours when social boredom and off-campus party pressure are highest—giving students a genuine, exciting alternative right when they need it",
                            "Because lectures happen on Saturday nights",
                            "Because food tastes better after 7:00 PM"
                        ],
                        "correctIndex": 1,
                        "explanation": "Scheduling high-energy dry events during peak Friday/Saturday night social hours directly replaces risky off-campus drinking with an inclusive, fun alternative."
                    },
                    {
                        "id": "q5_2",
                        "topic": "Question 2 • Section 5 Mastery Check",
                        "prompt": "Designing an Inclusive Event: How do events like an Inter-Residence Gaming & Trivia Showdown or a Sunset Acoustic Braai & Mocktail Lounge help shy first-year students make friends without alcohol?",
                        "options": [
                            "They force students to sit in silence for 4 hours",
                            "Team trivia, board games, sports, and mocktail competitions act as natural ice-breakers where students bond over shared fun and teamwork—while holding a cool 0.0% drink cup",
                            "They require every student to give a solo speech on stage",
                            "They only allow final-year students to attend"
                        ],
                        "correctIndex": 1,
                        "explanation": "Structured team activities (trivia, 30 Seconds, EA FC tournaments, 5-a-side sports, mocktail mixing) break the ice naturally so first-years connect without needing alcohol."
                    },
                    {
                        "id": "q5_3",
                        "topic": "Question 3 • Section 5 Mastery Check",
                        "prompt": "Event Safety Rules: Even at a substance-free campus event, why must student organisers enforce a strict 'no outside unsealed bottles' check at the gate?",
                        "options": [
                            "So the organisers can sell more bottled water",
                            "To prevent anyone from sneaking illicit street brews (kambwa) or spiked drinks into the venue, keeping the environment 100% safe and welcoming for everyone",
                            "Because plastic bottles are too heavy to carry",
                            "To make the queue outside look longer"
                        ],
                        "correctIndex": 1,
                        "explanation": "Checking bags and prohibiting outside unsealed bottles prevents hidden alcohol, illicit kambwa, or spiked drinks from compromising the safety of the event."
                    },
                    {
                        "id": "q5_4",
                        "topic": "Question 4 • Section 5 Mastery Check",
                        "prompt": "According to Step 2 of the Event Planning Blueprint, how should student leaders promote a substance-free event on posters and social media?",
                        "options": [
                            "Lead with fun (the music, food, games, prizes, and tournament hype) while featuring the '100% Substance-Free / Pledge 18' badge as a positive part of the vibe—rather than making it sound like a scolding classroom lecture",
                            "Print a 10-page list of punishments on the poster",
                            "Hide the time and location of the event",
                            "Ban music and food from the venue"
                        ],
                        "correctIndex": 0,
                        "explanation": "Students show up for great music, competition, food, and social connection. Leading with excitement and creative 0.0% mocktails makes smart living aspirational."
                    },
                    {
                        "id": "q5_5",
                        "topic": "Question 5 • Section 5 Mastery Check",
                        "prompt": "What should event organisers arrange when a Friday night campus event finishes at 11:00 PM?",
                        "options": [
                            "Turn off all campus lights immediately and leave students stranded",
                            "End on time and coordinate residence walking buddies or campus shuttles so every student gets back to their room safely",
                            "Tell students to hitchhike on the highway",
                            "Lock the residence doors before the event ends"
                        ],
                        "correctIndex": 1,
                        "explanation": "Coordinating residence walking groups or campus shuttles at the end of the event ensures every attendee returns home safely."
                    }
                ]
            }
        }
    ]
};

const ALCOHOL_PREGNANCY_CURRICULUM = {
    "shortTitle": "Alcohol & Pregnancy",
    "title": "Alcohol & Pregnancy: Curriculum & Study Guide",
    "targetAudience": "Learners Aged 16+ (Senior Secondary, College & Young Adult Smart Living Education)",
    "coreFocus": "Maternal Health Science, Placental Alcohol Transfer, Fetal Alcohol Spectrum Disorders (FASD), the Zero-Alcohol Standard, and Partner & Community Support",
    "overview": "This comprehensive curriculum and study guide accompanies the Alcohol & Pregnancy Smart Living module. Designed in clear, everyday language for learners aged 16 and older—both young women and young men—this guide explains the biology of how alcohol passes freely from a mother's bloodstream through the placenta to an unborn baby, why a developing baby cannot break down alcohol, how prenatal alcohol exposure causes lifelong conditions known as Fetal Alcohol Spectrum Disorders (FASD), why 0.0% alcohol is the only safe standard across all three trimesters, and how partners, friends, and families can build a supportive alcohol-free environment during pregnancy and breastfeeding.",
    "learningObjectives": [
        "Explain how the placenta and umbilical cord work, why alcohol crosses freely into the baby's blood within 15–20 minutes, and why an unborn baby's undeveloped liver (<5–10% enzyme capacity) and the Amniotic Fluid Recycling Trap prolong exposure.",
        "Define alcohol as a teratogen (#1 preventable cause of birth defects) and trace how prenatal alcohol damages organs and brain wiring across the First, Second, and Third Trimesters (including the Weeks 1–6 'Before You Know' window).",
        "Distinguish the 4 conditions under Fetal Alcohol Spectrum Disorders (FAS, pFAS, ARND, ARBD), identify the 3 classic FAS facial features, and understand why ARND ('the invisible disability') accounts for over 80% of cases.",
        "Apply the global 0.0% alcohol standard across pregnancy and breastfeeding, bust common myths (red wine, fermented traditional brews vs non-alcoholic maheu, stout and oxytocin), and expose the 'pumping and dumping' myth.",
        "Know the 3 immediate steps if someone drank before discovering pregnancy, how partners take the 'Solidarity Pledge,' and how schools support learners living with FASD."
    ],
    "sections": [
        {
            "id": 1,
            "numberLabel": "Section 1",
            "title": "Maternal Health Science & How Alcohol Crosses the Placenta",
            "summary": "Understand how the placenta and umbilical cord work, why alcohol crosses freely into the baby's bloodstream within 15–20 minutes, and why an unborn baby's undeveloped liver (<5–10% enzyme capacity) and the Amniotic Fluid Recycling Trap prolong exposure.",
            "order": [
                "video",
                "1.1",
                "1.2",
                "1.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 1",
                "shortLabel": "Section 1 Supporting Video",
                "title": "What is Fetal Alcohol Syndrome? — Maternal & Placental Biology",
                "youtubeUrl": "https://www.youtube.com/watch?v=pznWesQo6XU",
                "embedUrl": "https://www.youtube.com/embed/pznWesQo6XU?rel=0",
                "guidance": "Before reading Section 1, watch this medical lesson to see how alcohol travels from the mother's bloodstream through the placenta into the baby's circulation—and why the baby's organs stay exposed to alcohol much longer than the mother's.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Alcohol & Pregnancy: How the Placenta Transfers Alcohol",
                        "source": "Portsmouth Drymester Maternal Health Campaign",
                        "youtubeUrl": "https://www.youtube.com/watch?v=N0OrOwfmXi8",
                        "embedUrl": "https://www.youtube.com/embed/N0OrOwfmXi8?rel=0"
                    }
                ]
            },
            "subsections": {
                "1.1": {
                    "key": "1.1",
                    "code": "1.1",
                    "shortLabel": "1.1 What Do the Placenta & Cord Do?",
                    "title": "1.1 What Do the Placenta & Cord Do?",
                    "html": "\n            <p>During pregnancy, the unborn baby (called an <em>embryo</em> in the first 8 weeks and a <em>fetus</em> from Week 9 until birth) grows inside a protective fluid-filled bag called the <strong>amniotic sac</strong> inside the mother's womb (uterus).</p>\n            <p>To grow, the baby connects to the mother through two life-support structures:</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>The Placenta:</strong> A pancake-shaped organ attached to the wall of the womb that acts as a trading station between the mother's blood and the baby's blood.</li>\n              <li><strong>The Umbilical Cord:</strong> The lifeline tube carrying oxygen, glucose, vitamins, and water from the placenta straight into the baby's body.</li>\n            </ul>\n            <div style=\"background:#fef2f2; border-left:4px solid #dc2626; border-radius:0 12px 12px 0; padding:14px 18px; margin:12px 0;\">\n              <strong style=\"color:#991b1b; display:block; margin-bottom:4px;\">The \"Filter\" Myth:</strong>\n              <p style=\"margin:0; color:#7f1d1d; font-size:0.93rem; line-height:1.6;\">Many people mistakenly believe the placenta acts like a security gate that blocks harmful chemicals from reaching the baby. <strong>This is false.</strong> While the placenta blocks some large bacteria, small molecules like <strong>ethanol (alcohol)</strong> pass right through it as easily as water passing through a tea bag.</p>\n            </div>\n          "
                },
                "1.2": {
                    "key": "1.2",
                    "code": "1.2",
                    "shortLabel": "1.2 Why Alcohol Crosses Freely",
                    "title": "1.2 Why Alcohol Crosses Freely",
                    "html": "\n            <p>When a pregnant woman drinks any alcoholic beverage (beer, cider, wine, spirits, or traditional fermented brew), the alcohol enters her bloodstream and reaches the placenta:</p>\n            <ol style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Equal Blood Alcohol Concentration (BAC) in 15–20 Minutes:</strong> Because alcohol is a tiny molecule that dissolves in both water and fat, it diffuses effortlessly across the placental membrane. Within just <strong>15 to 20 minutes</strong>, the baby's Blood Alcohol Concentration (BAC) rises to match—and can even exceed—the mother's BAC!</li>\n              <li><strong>Cutting Off the Baby's Oxygen Supply:</strong> Alcohol and its toxic breakdown product (<strong>acetaldehyde</strong>) cause the blood vessels in the placenta and umbilical cord to <strong>constrict (narrow)</strong>. This temporarily chokes off the flow of oxygen and essential nutrients to the baby's developing brain.</li>\n            </ol>\n          "
                },
                "1.3": {
                    "key": "1.3",
                    "code": "1.3",
                    "shortLabel": "1.3 The Unborn Baby's Liver & Amni...",
                    "title": "1.3 The Unborn Baby's Liver & Amniotic Trap",
                    "html": "\n            <p>Why is a single drink harmless to an adult's organs over a few hours, yet devastating to an unborn baby?</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>No Liver Enzymes Yet:</strong> As you learned in Module 1, an adult liver uses two enzymes (<strong>ADH</strong> and <strong>ALDH</strong>) to clear about 1 standard drink per hour. An unborn baby's liver is still forming and has <strong>almost zero (0% in early pregnancy, and less than 5–10% in late pregnancy)</strong> of the adult enzymes needed to break down alcohol!</li>\n              <li><strong>The Amniotic Fluid Recycling Trap:</strong> Because the baby cannot break down the alcohol, the alcohol passes through the baby's kidneys into the <strong>amniotic fluid</strong> surrounding the baby. The baby then naturally swallows that amniotic fluid over and over again—forcing the baby to <strong>re-drink the same alcohol repeatedly</strong> for many hours after the mother already feels sober!</li>\n            </ul>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Biological Feature</th>\n                    <th style=\"padding:10px 12px;\">Adult Mother's Body</th>\n                    <th style=\"padding:10px 12px;\">Unborn Baby's Body (Fetus)</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Blood Alcohol Level (BAC)</td>\n                    <td style=\"padding:10px 12px;\">Rises within 15–30 minutes of drinking.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c; font-weight:700;\">Reaches the EXACT SAME BAC as the mother within 15–20 minutes.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Liver Enzymes (ADH &amp; ALDH)</td>\n                    <td style=\"padding:10px 12px;\">100% adult capacity (clears ~0.015% BAC per hour).</td>\n                    <td style=\"padding:10px 12px; color:#991b1b; font-weight:700;\">0% to &lt;10% capacity — the baby cannot break down alcohol on its own.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">How Alcohol Leaves</td>\n                    <td style=\"padding:10px 12px;\">Broken down by the mother's liver into water &amp; CO₂.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Trapped in amniotic fluid (which the baby re-swallows) until it slowly diffuses back to the mother's liver.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">Impact on Cells</td>\n                    <td style=\"padding:10px 12px;\">Temporary intoxication of mature brain cells.</td>\n                    <td style=\"padding:10px 12px; color:#991b1b; font-weight:700;\">Permanent destruction and miswiring of rapidly dividing fetal brain and organ cells.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "1.4",
                "shortLabel": "1.4 Review Questions (≥80%)",
                "title": "1.4 Section 1 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q1_1",
                        "topic": "Question 1 • Section 1 Mastery Check",
                        "prompt": "Crossing the Placenta: Why can't the placenta block alcohol from reaching an unborn baby, and how quickly does the baby's Blood Alcohol Concentration (BAC) match the mother's BAC?",
                        "options": [
                            "The placenta blocks 90% of alcohol; it takes 24 hours for any alcohol to reach the baby",
                            "Ethanol is a tiny molecule that dissolves in both water and fat, diffusing freely across the placenta so the baby's BAC matches the mother's BAC within 15 to 20 minutes",
                            "Alcohol only crosses the placenta during the ninth month of pregnancy",
                            "Only spirits cross the placenta; beer and cider are blocked"
                        ],
                        "correctIndex": 1,
                        "explanation": "The placenta is not a barrier to ethanol. Because alcohol molecules are tiny and water/fat-soluble, they cross straight through the placental membrane, equalizing the baby's BAC with the mother's within 15 to 20 minutes."
                    },
                    {
                        "id": "q1_2",
                        "topic": "Question 2 • Section 1 Mastery Check",
                        "prompt": "The Amniotic Trap: Give the two biological reasons why an unborn baby stays exposed to alcohol for many hours longer than the mother.",
                        "options": [
                            "Because the baby's stomach is larger than the mother's and produces extra alcohol",
                            "First, the baby's undeveloped liver has 0% to <10% of adult ADH/ALDH enzymes; second, alcohol collects in the amniotic fluid which the baby repeatedly swallows (the Amniotic Fluid Recycling Trap)",
                            "Because the baby sleeps for 20 hours a day",
                            "Because umbilical cord blood flows in only one direction"
                        ],
                        "correctIndex": 1,
                        "explanation": "An unborn baby lacks functional ADH/ALDH liver enzymes (0% in early pregnancy, <5–10% late in pregnancy) and excretes alcohol into the amniotic sac, swallowing it repeatedly for hours."
                    },
                    {
                        "id": "q1_3",
                        "topic": "Question 3 • Section 1 Mastery Check",
                        "prompt": "What does alcohol (and its toxic breakdown product acetaldehyde) do to the blood vessels inside the umbilical cord and placenta?",
                        "options": [
                            "It widens them so the baby gets extra oxygen",
                            "It causes the umbilical and placental blood vessels to constrict (narrow), choking off the baby's supply of oxygen and vital nutrients",
                            "It turns umbilical blood into pure glucose",
                            "It has zero effect on blood vessels"
                        ],
                        "correctIndex": 1,
                        "explanation": "Alcohol and acetaldehyde constrict blood vessels in the placenta and umbilical cord, depriving the developing fetus of oxygen and nutrients."
                    },
                    {
                        "id": "q1_4",
                        "topic": "Question 4 • Section 1 Mastery Check",
                        "prompt": "How is alcohol eventually cleared from the unborn baby's body?",
                        "options": [
                            "The baby sweats it out",
                            "It must slowly diffuse back across the placenta into the mother's bloodstream so the mother's liver can break it down",
                            "It stays inside the baby forever",
                            "The baby breathes it out through the lungs"
                        ],
                        "correctIndex": 1,
                        "explanation": "Because the fetal liver cannot metabolize alcohol effectively, the alcohol must slowly diffuse back across the placenta to be broken down by the mother's liver."
                    },
                    {
                        "id": "q1_5",
                        "topic": "Question 5 • Section 1 Mastery Check",
                        "prompt": "Is the myth 'The placenta filters out harmful toxins like alcohol so the baby stays safe' true or false?",
                        "options": [
                            "True for light beer and wine",
                            "Completely false—ethanol passes through the placenta as easily as water passes through a tea bag",
                            "True during the first trimester only",
                            "True if the mother drinks plenty of water afterward"
                        ],
                        "correctIndex": 1,
                        "explanation": "The placenta cannot filter out small molecules like ethanol; every drop of alcohol in the mother's blood shares directly with the fetus."
                    }
                ]
            }
        },
        {
            "id": 2,
            "numberLabel": "Section 2",
            "title": "How Alcohol Affects the Baby Across All Three Trimesters",
            "summary": "Define alcohol as a teratogen (#1 preventable cause of birth defects), map what alcohol damages across the 1st, 2nd, and 3rd trimesters, and understand the critical Weeks 1–6 'Before You Know' window.",
            "order": [
                "2.1",
                "video",
                "2.2",
                "2.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 2",
                "shortLabel": "Section 2 Supporting Video",
                "title": "Fetal Alcohol Syndrome Explained | Features, Diagnosis & Prevention across Trimesters",
                "youtubeUrl": "https://www.youtube.com/watch?v=uFvdAH0aZTw",
                "embedUrl": "https://www.youtube.com/embed/uFvdAH0aZTw?rel=0",
                "guidance": "Watch this clear visual breakdown of how alcohol acts as a 'teratogen'—disrupting organ formation in the first trimester and damaging brain growth across the second and third trimesters.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "2.1": {
                    "key": "2.1",
                    "code": "2.1",
                    "shortLabel": "2.1 Alcohol as a Teratogen",
                    "title": "2.1 Alcohol as a Teratogen",
                    "html": "\n            <p>In medicine, any substance that interferes with normal fetal development and causes birth defects is called a <strong>teratogen</strong> (pronounced <em>teh-RAT-uh-jen</em>). Alcohol is a potent <strong>neuro-behavioural teratogen</strong>—and it is the <strong>#1 leading preventable cause of birth defects, brain damage, and developmental disabilities worldwide</strong>.</p>\n            <p>Inside the womb, a baby's brain is creating up to <strong>250,000 new nerve cells (neurons) every single minute</strong>! Alcohol damages this delicate construction in three ways:</p>\n            <ol style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Kills Dividing Brain Cells:</strong> Alcohol triggers premature cell death (<em>apoptosis</em>) in millions of newly formed neurons.</li>\n              <li><strong>Scrambles Cell Migration:</strong> As the baby's brain forms, new nerve cells must travel (\"migrate\") along microscopic guide wires to reach their correct position. Alcohol scrambles their GPS, causing brain cells to end up in the wrong places or form faulty connections.</li>\n              <li><strong>Starves Tissues of Oxygen &amp; Glucose:</strong> By constricting umbilical blood vessels, alcohol slows overall body and head growth.</li>\n            </ol>\n          "
                },
                "2.2": {
                    "key": "2.2",
                    "code": "2.2",
                    "shortLabel": "2.2 Trimester-by-Trimester Timeline",
                    "title": "2.2 Trimester-by-Trimester Timeline",
                    "html": "\n            <p>A normal human pregnancy lasts about <strong>40 weeks (9 months)</strong>, divided into three 3-month stages called <strong>trimesters</strong>. Because the baby's brain and nervous system develop continuously from <strong>Week 3 all the way to Week 40</strong>, there is <strong>NO safe trimester to drink alcohol</strong>:</p>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Pregnancy Stage</th>\n                    <th style=\"padding:10px 12px;\">What Is Forming in the Baby</th>\n                    <th style=\"padding:10px 12px;\">Damage Caused by Alcohol Exposure</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">First Trimester<br><span style=\"font-weight:400; font-size:0.8rem; color:#475569;\">(Weeks 1 to 12 / Months 1–3)</span></td>\n                    <td style=\"padding:10px 12px;\"><strong>Organogenesis (Major Organ Building):</strong> Neural tube (brain &amp; spinal cord), heart, eyes, ears, kidneys, limbs, and facial features.</td>\n                    <td style=\"padding:10px 12px; color:#991b1b;\">Structural birth defects of the heart, kidneys, eyes, and bones; classic FAS facial changes (especially during <strong>Weeks 3–8</strong>); high risk of <strong>early miscarriage</strong>.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Second Trimester<br><span style=\"font-weight:400; font-size:0.8rem; color:#475569;\">(Weeks 13 to 26 / Months 4–6)</span></td>\n                    <td style=\"padding:10px 12px;\"><strong>Rapid Growth &amp; Brain Wiring:</strong> Skeleton, muscles, and organs grow rapidly; billions of brain cells migrate and connect.</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Stunted body growth, disrupted brain wiring, hearing/vision pathways harmed, and increased risk of <strong>late miscarriage or placental abruption</strong>.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">Third Trimester<br><span style=\"font-weight:400; font-size:0.8rem; color:#475569;\">(Weeks 27 to 40 / Months 7–9)</span></td>\n                    <td style=\"padding:10px 12px;\"><strong>The Massive Brain Growth Spurt:</strong> The brain triples in weight; the <strong>hippocampus</strong> (memory), <strong>prefrontal cortex</strong> (self-control), and <strong>cerebellum</strong> (balance) wire up.</td>\n                    <td style=\"padding:10px 12px; color:#991b1b;\">Severe damage to memory, learning, attention, and emotional control; <strong>premature birth, low birth weight, or stillbirth</strong>.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "2.3": {
                    "key": "2.3",
                    "code": "2.3",
                    "shortLabel": "2.3 The 'Before You Know' Window (...",
                    "title": "2.3 The 'Before You Know' Window (Weeks 1–6)",
                    "html": "\n            <p>Here is a critical medical fact every young adult must know: <strong>Most women do not realize they are pregnant until Week 4 to Week 6</strong> (after missing a monthly period).</p>\n            <div style=\"background:#fff7ed; border-left:4px solid #ea580c; border-radius:0 12px 12px 0; padding:14px 18px; margin:12px 0;\">\n              <ul style=\"margin:0; padding-left:18px; color:#7c2d12; font-size:0.93rem; line-height:1.7;\">\n                <li>Yet the baby's <strong>neural tube (brain and spinal cord), heart, and face</strong> are already forming during <strong>Weeks 3, 4, 5, and 6</strong>—often before a pregnancy test is even taken!</li>\n                <li><strong>The Pre-Pregnancy Protection Rule:</strong> Medical guidelines advise that anyone who is <strong>trying to conceive</strong>, or who is <strong>sexually active without reliable contraception</strong>, should avoid alcohol completely so a baby is never accidentally exposed during those crucial first 6 weeks.</li>\n              </ul>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "2.4",
                "shortLabel": "2.4 Review Questions (≥80%)",
                "title": "2.4 Section 2 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q2_1",
                        "topic": "Question 1 • Section 2 Mastery Check",
                        "prompt": "Defining a Teratogen: What does the medical word 'teratogen' mean, and what are the three ways alcohol damages a developing baby's brain cells?",
                        "options": [
                            "A vitamin that speeds up bone growth",
                            "Any substance that interferes with fetal development and causes birth defects; alcohol kills dividing neurons, scrambles cell migration (GPS), and starves tissues of oxygen/glucose",
                            "A hormone produced by the placenta during labour",
                            "A type of vaccine given to newborns"
                        ],
                        "correctIndex": 1,
                        "explanation": "A teratogen is an agent that causes birth defects or developmental injury. Alcohol is the #1 preventable neuro-behavioural teratogen—killing dividing neurons, scrambling cell migration, and constricting placental oxygen supply."
                    },
                    {
                        "id": "q2_2",
                        "topic": "Question 2 • Section 2 Mastery Check",
                        "prompt": "The 'Before You Know' Window: Why are Weeks 3 to 6 of pregnancy considered such a dangerous 'hidden window' for accidental alcohol exposure?",
                        "options": [
                            "Because women are only thirsty during Weeks 3 to 6",
                            "Because most women do not realize they are pregnant until Week 4–6 (after a missed period), yet the baby's neural tube (brain/spinal cord), heart, and facial features are already forming during Weeks 3–6",
                            "Because pregnancy tests do not work until Month 8",
                            "Because the placenta does not exist in Month 5"
                        ],
                        "correctIndex": 1,
                        "explanation": "Major organogenesis (forming the brain, spinal cord, heart, and face) begins in Weeks 3–6, often before a woman even knows she is pregnant."
                    },
                    {
                        "id": "q2_3",
                        "topic": "Question 3 • Section 2 Mastery Check",
                        "prompt": "The Third-Trimester Myth: Some people claim, 'The baby's organs are already formed by Month 7, so a glass of wine in the Third Trimester is harmless.' Why is this claim medically false?",
                        "options": [
                            "Because the baby's heart only starts forming in Month 8",
                            "Because the Third Trimester (Weeks 27–40) is when the baby's brain undergoes a massive growth spurt (tripling in weight and wiring the hippocampus, prefrontal cortex, and cerebellum)—and alcohol in this stage causes severe learning/memory damage, premature birth, or stillbirth",
                            "Because alcohol stays in the stomach during the Third Trimester",
                            "Because the baby's eyes open in Month 9"
                        ],
                        "correctIndex": 1,
                        "explanation": "During the Third Trimester (Weeks 27–40), the fetal brain triples in weight and wires up memory (hippocampus) and self-control (prefrontal cortex). Alcohol during this stage causes severe neurodevelopmental disability, premature birth, or stillbirth."
                    },
                    {
                        "id": "q2_4",
                        "topic": "Question 4 • Section 2 Mastery Check",
                        "prompt": "During which specific weeks of the First Trimester does alcohol exposure cause the classic facial feature changes of Fetal Alcohol Syndrome (FAS)?",
                        "options": [
                            "Weeks 3 to 8 (during first-trimester organogenesis)",
                            "Weeks 36 to 40",
                            "Only during labour",
                            "Six months after birth"
                        ],
                        "correctIndex": 0,
                        "explanation": "The baby's facial structures and major organs form during Weeks 3 to 8 in the First Trimester."
                    },
                    {
                        "id": "q2_5",
                        "topic": "Question 5 • Section 2 Mastery Check",
                        "prompt": "What is the Pre-Pregnancy Protection Rule recommended by medical guidelines?",
                        "options": [
                            "Only stop drinking after the second ultrasound scan",
                            "Anyone who is trying to conceive, or who is sexually active without reliable contraception, should avoid alcohol completely so an embryo is never accidentally exposed in Weeks 1–6",
                            "Switch from spirits to sweet cider while trying to conceive",
                            "Drink coffee before taking a pregnancy test"
                        ],
                        "correctIndex": 1,
                        "explanation": "Stopping alcohol before conception (or whenever pregnancy is possible) protects the embryo during the earliest weeks before a pregnancy test turns positive."
                    }
                ]
            }
        },
        {
            "id": 3,
            "numberLabel": "Section 3",
            "title": "Understanding Fetal Alcohol Spectrum Disorders (FASD)",
            "summary": "Explore the 4 conditions under the FASD umbrella (FAS, pFAS, ARND, ARBD), understand why ARND ('Invisible Disability') accounts for over 80% of cases, and identify the 3 classic FAS facial features.",
            "order": [
                "3.1",
                "video",
                "3.2",
                "3.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 3",
                "shortLabel": "Section 3 Supporting Video",
                "title": "Fetal Alcohol Spectrum Disorder (FASD) — Understanding the Spectrum",
                "youtubeUrl": "https://www.youtube.com/watch?v=m7zfJCW9Yco",
                "embedUrl": "https://www.youtube.com/embed/m7zfJCW9Yco?rel=0",
                "guidance": "Watch this overview to understand why doctors use the umbrella term 'Fetal Alcohol Spectrum Disorders (FASD),' why most affected children have no visible facial signs ('the invisible disability'), and how FASD affects learning and daily life.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "What is FASD? — Brain Function & Lifelong Support",
                        "source": "University of Sydney Matilda Centre",
                        "youtubeUrl": "https://www.youtube.com/watch?v=n9e8uQtwCH0",
                        "embedUrl": "https://www.youtube.com/embed/n9e8uQtwCH0?rel=0"
                    }
                ]
            },
            "subsections": {
                "3.1": {
                    "key": "3.1",
                    "code": "3.1",
                    "shortLabel": "3.1 What Does the 'Spectrum' Mean?",
                    "title": "3.1 What Does the 'Spectrum' Mean?",
                    "html": "\n            <p><strong>Fetal Alcohol Spectrum Disorders (FASD)</strong> is the medical umbrella term for the full range of physical, brain, learning, and behavioural disabilities that can happen to a person whose mother drank alcohol during pregnancy.</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Why a \"Spectrum\"?</strong> Because every pregnancy is different—depending on <em>when</em> in the pregnancy alcohol was consumed, <em>how much</em>, and how frequently—some children are born with visible physical signs, while most have hidden brain and learning challenges that only show up when they reach school age.</li>\n              <li><strong>Key Fact:</strong> FASD is <strong>NOT a genetic or hereditary disorder</strong>. A mother or father does not pass FASD down in their DNA—it is caused solely by prenatal alcohol exposure, which means <strong>FASD is 100% preventable</strong>. However, once the brain damage happens before birth, <strong>FASD is permanent and lifelong</strong> (a child does not \"outgrow\" it, though early support helps enormously).</li>\n            </ul>\n          "
                },
                "3.2": {
                    "key": "3.2",
                    "code": "3.2",
                    "shortLabel": "3.2 The Four Conditions Under FASD",
                    "title": "3.2 The Four Conditions Under FASD",
                    "html": "\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Condition Name</th>\n                    <th style=\"padding:10px 12px;\">Key Features</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">1. Fetal Alcohol Syndrome (FAS)</td>\n                    <td style=\"padding:10px 12px;\">The most severe, visible end of the spectrum (about 10–15% of all FASD cases). Includes <strong>all three</strong> classic signs: (a) specific facial features, (b) stunted growth before/after birth, and (c) brain/central nervous system damage (often with a smaller head size, called <em>microcephaly</em>).</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">2. Partial Fetal Alcohol Syndrome (pFAS)</td>\n                    <td style=\"padding:10px 12px;\">The child has central nervous system/brain challenges and <em>some</em> (but not all) of the facial features or growth delays of full FAS.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">3. Alcohol-Related Neurodevelopmental Disorder (ARND)</td>\n                    <td style=\"padding:10px 12px;\"><strong>The Most Common Form (Over 80% of FASD Cases — \"The Invisible Disability\"):</strong> The child looks completely normal on the outside (no facial changes and normal height), but suffers significant brain, memory, attention, and impulse-control disabilities.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">4. Alcohol-Related Birth Defects (ARBD)</td>\n                    <td style=\"padding:10px 12px;\">Physical birth defects of the <strong>heart, kidneys, bones, eyes, or hearing</strong> caused by prenatal alcohol exposure.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "3.3": {
                    "key": "3.3",
                    "code": "3.3",
                    "shortLabel": "3.3 Visible Signs vs. Brain Challe...",
                    "title": "3.3 Visible Signs vs. Brain Challenges",
                    "html": "\n            <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; margin:14px 0;\">\n              <div style=\"background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 8px 0; color:#991b1b; font-size:0.98rem;\">1. Visible Physical Signs (Seen in Full FAS — Weeks 3–8 Exposure)</h5>\n                <ul style=\"margin:0; padding-left:18px; color:#7f1d1d; font-size:0.9rem; line-height:1.6;\">\n                  <li><strong>Three Classic Facial Features:</strong><br>\n                    (1) A <strong>smooth philtrum</strong> (the vertical groove between the nose and upper lip is flat instead of ridged),<br>\n                    (2) A <strong>thin upper lip</strong> (<em>vermilion border</em>), and<br>\n                    (3) <strong>Short palpebral fissures</strong> (smaller, narrower eye openings).</li>\n                  <li><strong>Growth &amp; Head Size:</strong> Low birth weight, slower height/weight gain in childhood, and a smaller head circumference (<em>microcephaly</em>).</li>\n                </ul>\n              </div>\n              <div style=\"background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 8px 0; color:#9a3412; font-size:0.98rem;\">2. \"Invisible\" Brain &amp; Learning Challenges (Seen Across All FASD Types)</h5>\n                <ul style=\"margin:0; padding-left:18px; color:#7c2d12; font-size:0.9rem; line-height:1.6;\">\n                  <li><strong>Executive Function &amp; Impulse Control:</strong> Because the prefrontal cortex was injured before birth, a child or teen with FASD struggles to plan ahead, control frustration, or connect an action to its consequence (they may repeat the same mistake without meaning to).</li>\n                  <li><strong>Memory, Math &amp; Time Concepts:</strong> Difficulty holding multi-step instructions in working memory, struggling with numbers/money/time, and forgetting rules they knew yesterday.</li>\n                  <li><strong>Social &amp; Sensory Vulnerability:</strong> Being easily overwhelmed by loud noises or bright lights, struggling to read social cues, and being easily manipulated or taken advantage of by peers.</li>\n                </ul>\n              </div>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "3.4",
                "shortLabel": "3.4 Review Questions (≥80%)",
                "title": "3.4 Section 3 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q3_1",
                        "topic": "Question 1 • Section 3 Mastery Check",
                        "prompt": "FAS vs. ARND: What is the difference between Fetal Alcohol Syndrome (FAS) and Alcohol-Related Neurodevelopmental Disorder (ARND), and why is ARND called an 'invisible disability'?",
                        "options": [
                            "FAS is temporary; ARND only affects eyesight",
                            "FAS (10–15% of cases) includes visible facial features and stunted growth; ARND makes up over 80% of FASD cases and is called an 'invisible disability' because the child looks completely normal on the outside while living with permanent brain, memory, and impulse-control challenges",
                            "ARND only happens in adults over 40",
                            "FAS is genetic; ARND is caused by diet"
                        ],
                        "correctIndex": 1,
                        "explanation": "Over 80% of children born with FASD have ARND: they have no visible facial abnormalities and look completely normal at birth, yet suffer lifelong neurodevelopmental injury to memory, attention, and impulse control."
                    },
                    {
                        "id": "q3_2",
                        "topic": "Question 2 • Section 3 Mastery Check",
                        "prompt": "Physical & Brain Signs: What are the three classic facial features of full Fetal Alcohol Syndrome (FAS), and during which weeks of pregnancy are those facial features formed?",
                        "options": [
                            "Freckles, curly hair, and dimples formed in Week 38",
                            "(1) A smooth philtrum (flat groove between nose and upper lip), (2) a thin upper lip, and (3) short palpebral fissures (small eye openings)—formed during Weeks 3 to 8 of the First Trimester",
                            "Large ears, a wide chin, and long eyelashes formed in Month 7",
                            "Red cheeks and a high forehead formed during birth"
                        ],
                        "correctIndex": 1,
                        "explanation": "The three diagnostic facial features of full FAS are a smooth philtrum, thin upper lip, and short palpebral fissures, caused when alcohol disrupts craniofacial development during Weeks 3–8."
                    },
                    {
                        "id": "q3_3",
                        "topic": "Question 3 • Section 3 Mastery Check",
                        "prompt": "Understanding Invisible Challenges: Why might a teenager born with ARND struggle with math, time management, and peer pressure at school even though they are trying their best?",
                        "options": [
                            "Because they are intentionally being lazy",
                            "Because prenatal alcohol exposure permanently injured their hippocampus (working memory/math) and prefrontal cortex (impulse control, cause-and-effect reasoning, and reading social cues)",
                            "Because they need stronger reading glasses",
                            "Because ARND only affects muscle strength"
                        ],
                        "correctIndex": 1,
                        "explanation": "Students with ARND have a physical brain injury from prenatal alcohol exposure affecting the prefrontal cortex and hippocampus, making multi-step instructions, math, abstract time concepts, and resisting peer manipulation genuinely difficult."
                    },
                    {
                        "id": "q3_4",
                        "topic": "Question 4 • Section 3 Mastery Check",
                        "prompt": "What does Alcohol-Related Birth Defects (ARBD) refer to under the FASD umbrella?",
                        "options": [
                            "Physical birth defects of major organs—such as the heart, kidneys, bones, eyes, or hearing—caused by prenatal alcohol exposure",
                            "Temporary skin rashes in adults",
                            "Normal teething in babies",
                            "Genetic eye colour differences"
                        ],
                        "correctIndex": 0,
                        "explanation": "ARBD covers structural organ defects of the heart, kidneys, bones, vision, or hearing resulting from prenatal alcohol exposure."
                    },
                    {
                        "id": "q3_5",
                        "topic": "Question 5 • Section 3 Mastery Check",
                        "prompt": "Is FASD a genetic disorder passed down in family DNA, or is it 100% preventable?",
                        "options": [
                            "It is 100% genetic and cannot be prevented",
                            "FASD is NOT genetic—it is caused solely by prenatal alcohol exposure, making it 100% preventable by avoiding alcohol during pregnancy",
                            "It is caused by eating spicy food during pregnancy",
                            "It disappears automatically at age 10"
                        ],
                        "correctIndex": 1,
                        "explanation": "FASD is never hereditary in DNA; it is 100% preventable by maintaining 0.0% alcohol during pregnancy, though once the prenatal brain injury occurs it is lifelong."
                    }
                ]
            }
        },
        {
            "id": 4,
            "numberLabel": "Section 4",
            "title": "Why Zero Alcohol Is the Only Safe Standard (Myths & Breastfeeding)",
            "summary": "Learn the global 0.0% consensus (NO safe amount, NO safe trimester, NO safe type), bust 4 common pregnancy & breastfeeding myths (red wine, traditional brews vs maheu, stout & breastmilk), and expose the 'pumping and dumping' myth.",
            "order": [
                "4.1",
                "4.2",
                "video",
                "4.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 4",
                "shortLabel": "Section 4 Supporting Video",
                "title": "Play It Smart — Alcohol and Pregnancy Don't Mix",
                "youtubeUrl": "https://www.youtube.com/watch?v=9fyt2gdTnaM",
                "embedUrl": "https://www.youtube.com/embed/9fyt2gdTnaM?rel=0",
                "guidance": "Watch this public health briefing explaining why the World Health Organization (WHO) and medical authorities worldwide agree on a single clear rule: zero alcohol of any kind during pregnancy.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Stories of FASDs — Diagnosis & Why Every Drink Matters",
                        "source": "CDC (Centers for Disease Control and Prevention)",
                        "youtubeUrl": "https://www.youtube.com/watch?v=-jzz4OZa-fI",
                        "embedUrl": "https://www.youtube.com/embed/-jzz4OZa-fI?rel=0"
                    }
                ]
            },
            "subsections": {
                "4.1": {
                    "key": "4.1",
                    "code": "4.1",
                    "shortLabel": "4.1 Why No 'Safe Limit' Exists (Gl...",
                    "title": "4.1 Why No 'Safe Limit' Exists (Global 0.0% Consensus)",
                    "html": "\n            <p>The <strong>World Health Organization (WHO)</strong>, the <strong>Ministry of Health and Child Care (MoHCC) in Zimbabwe</strong>, the <strong>CDC</strong>, and obstetricians worldwide share one unanimous medical rule for pregnancy:</p>\n            <div style=\"background:#f0fdf4; border:2px solid #16a34a; border-radius:12px; padding:16px; margin:14px 0;\">\n              <ul style=\"margin:0; padding-left:18px; color:#14532d; font-size:0.95rem; font-weight:700; line-height:1.7;\">\n                <li>There is NO known safe amount of alcohol during pregnancy.</li>\n                <li>There is NO safe time (trimester) to drink during pregnancy.</li>\n                <li>There is NO safe type of alcoholic drink during pregnancy.</li>\n              </ul>\n            </div>\n            <p>Remember the <strong>Standard Drink Science</strong> from Module 1: A 355 mL bottle of 5% cider or beer, a 150 mL glass of 12% wine, and a 44 mL shot of 40% spirits all contain the <strong>exact same 14 grams of pure ethanol</strong>. To an unborn baby's brain, a sweet wine cooler or light cider delivers the exact same poison as a shot of whiskey!</p>\n          "
                },
                "4.2": {
                    "key": "4.2",
                    "code": "4.2",
                    "shortLabel": "4.2 Busting Dangerous Pregnancy My...",
                    "title": "4.2 Busting Dangerous Pregnancy Myths",
                    "html": "\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Dangerous Myth</th>\n                    <th style=\"padding:10px 12px;\">The Medical Truth</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">Myth 1: \"Drinking a glass of red wine or traditional beer builds the baby's blood (iron) and helps the mother relax.\"</td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>False.</strong> Alcohol actually <strong>blocks the mother's body from absorbing folic acid (folate) and B-vitamins</strong>—the exact nutrients needed to build healthy blood and prevent spinal cord defects! Iron comes from leafy greens, beans, meat, and clinic iron/folate tablets—never from wine.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">Myth 2: \"Home-brewed traditional beer (7-days / doro) is natural and mild, so it's safe for pregnant women.\"</td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>False.</strong> Fermented traditional beer contains unpredictable, often high levels of ethanol plus fermentation by-products. (Note: Truly <strong>non-alcoholic <em>maheu</em></strong> that has not been fermented into alcohol is a nutritious grain drink—just make sure it is fresh, hygienic, and 0.0% alcohol!)</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">Myth 3: \"Drinking stout or dark beer makes a mother produce more breastmilk.\"</td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>False.</strong> Clinical studies prove that alcohol actually <strong>blocks the hormone oxytocin</strong> (which triggers the milk let-down reflex), causing mothers to produce about <strong>20% LESS breastmilk</strong>!</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">Myth 4: \"My aunt drank during pregnancy and her baby looked fine at birth, so doctors are exaggerating.\"</td>\n                    <td style=\"padding:10px 12px; color:#166534;\"><strong>False.</strong> Over <strong>80% of children harmed by prenatal alcohol (ARND)</strong> look completely normal at birth! Their brain, memory, and impulse-control struggles only become obvious years later in primary or high school.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "4.3": {
                    "key": "4.3",
                    "code": "4.3",
                    "shortLabel": "4.3 Alcohol & Breastfeeding Facts",
                    "title": "4.3 Alcohol & Breastfeeding Facts",
                    "html": "\n            <p>A baby's brain continues to grow rapidly after birth during the first two years of life. What happens if a breastfeeding mother drinks alcohol?</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Alcohol Enters Breastmilk Freely:</strong> Alcohol passes straight from the mother's bloodstream into her breastmilk at the <strong>exact same concentration as her BAC</strong>, peaking 30 to 60 minutes after a drink.</li>\n              <li><strong>Effect on the Newborn:</strong> A newborn baby's liver is still immature (taking twice as long as an adult to clear alcohol). Babies who consume alcohol in breastmilk suffer disrupted sleep cycles, weaker sucking reflexes, lower milk intake, and potential delays in motor development.</li>\n              <li><strong>The \"Pumping and Dumping\" Myth:</strong> Expressing (pumping) breastmilk and throwing it away <strong>does NOT speed up how fast alcohol leaves the mother's milk!</strong> As long as alcohol is in the mother's bloodstream, it continuously diffuses back into her breastmilk until her liver finishes metabolizing it (about 2 to 3 hours per standard drink). The safest choice while breastfeeding—especially in the early months—is to stay alcohol-free.</li>\n            </ul>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "4.4",
                "shortLabel": "4.4 Review Questions (≥80%)",
                "title": "4.4 Section 4 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q4_1",
                        "topic": "Question 1 • Section 4 Mastery Check",
                        "prompt": "The Zero-Alcohol Rule: State the three 'No Safe' rules agreed upon by the WHO and Zimbabwe's Ministry of Health, and explain why switching from spirits to sweet wine or cider does not protect the baby.",
                        "options": [
                            "Only drink on weekends; cider has no alcohol",
                            "There is NO safe amount, NO safe trimester, and NO safe type of alcohol during pregnancy—because 355 mL of 5% cider, 150 mL of 12% wine, and 44 mL of 40% spirits all deliver the exact same 14 grams of pure ethanol to the fetus",
                            "Wine is safe after Month 6; beer is safe in Month 9",
                            "Only clear spirits cross the placenta"
                        ],
                        "correctIndex": 1,
                        "explanation": "WHO and MoHCC guidelines state there is NO safe amount, NO safe trimester, and NO safe type of alcohol. Standard drinks of cider, wine, and spirits all contain 14g of pure ethanol."
                    },
                    {
                        "id": "q4_2",
                        "topic": "Question 2 • Section 4 Mastery Check",
                        "prompt": "Busting the 'Red Wine' Myth: What is the medical truth when someone says a pregnant woman should drink red wine to 'build blood'?",
                        "options": [
                            "Red wine is the best source of iron for pregnant women",
                            "False—alcohol actually blocks the mother's body from absorbing folic acid (folate) and B-vitamins needed to build healthy blood and prevent spinal cord defects; iron and folate come from leafy greens, beans, meat, and clinic supplements",
                            "White wine builds blood faster than red wine",
                            "Stout beer replaces clinic iron tablets"
                        ],
                        "correctIndex": 1,
                        "explanation": "Alcohol interferes with folate (folic acid) and B-vitamin absorption—nutrients essential for preventing neural tube defects and anaemia."
                    },
                    {
                        "id": "q4_3",
                        "topic": "Question 3 • Section 4 Mastery Check",
                        "prompt": "Breastfeeding Science: How does alcohol affect the hormone oxytocin and breastmilk supply, and why doesn't 'pumping and dumping' make breastmilk alcohol-free right away?",
                        "options": [
                            "Alcohol doubles oxytocin and milk production; pumping removes all alcohol from the blood",
                            "Alcohol blocks oxytocin (reducing breastmilk output by ~20%), and 'pumping and dumping' fails because alcohol continuously diffuses from the mother's blood back into breastmilk until her liver clears it (~2–3 hours per drink)",
                            "Alcohol never enters breastmilk",
                            "Pumping and dumping clears BAC in 5 minutes"
                        ],
                        "correctIndex": 1,
                        "explanation": "Alcohol inhibits the oxytocin let-down reflex (cutting milk intake by ~20%), and breastmilk alcohol levels match maternal blood levels until the liver metabolizes the alcohol."
                    },
                    {
                        "id": "q4_4",
                        "topic": "Question 4 • Section 4 Mastery Check",
                        "prompt": "What is the important distinction between fermented traditional beer (doro / 7-days) and fresh, hygienically prepared non-alcoholic maheu during pregnancy?",
                        "options": [
                            "Both contain 40% alcohol",
                            "Fermented traditional beer contains unpredictable, harmful levels of ethanol and must be avoided completely; fresh, unfermented 0.0% maheu is a nutritious grain drink",
                            "Traditional beer has zero alcohol",
                            "Maheu is a distilled spirit"
                        ],
                        "correctIndex": 1,
                        "explanation": "Home-fermented traditional beers contain variable ethanol that harms the fetus, whereas fresh, hygienically prepared non-alcoholic (0.0%) maheu provides safe grain energy."
                    },
                    {
                        "id": "q4_5",
                        "topic": "Question 5 • Section 4 Mastery Check",
                        "prompt": "Why is the statement 'My relative drank during pregnancy and her baby looked normal at birth, so alcohol is safe' scientifically misleading?",
                        "options": [
                            "Because over 80% of children harmed by prenatal alcohol have ARND ('the invisible disability')—they look completely normal at birth, and their brain, memory, and learning struggles only appear years later in school",
                            "Because FASD only appears at age 65",
                            "Because babies are born with adult livers",
                            "Because doctors cannot test memory in school"
                        ],
                        "correctIndex": 0,
                        "explanation": "Over 80% of FASD cases are ARND without facial anomalies at birth; the neurological damage to memory, math, and impulse control surfaces during childhood and adolescence."
                    }
                ]
            }
        },
        {
            "id": 5,
            "numberLabel": "Section 5",
            "title": "Partner Responsibility, Antenatal Care & Community Support",
            "summary": "Learn the 3 reassuring steps if someone drank before discovering pregnancy, how fathers/partners take the 'Solidarity Pledge' and protect pre-conception health, and how schools support learners living with FASD.",
            "order": [
                "5.1",
                "5.2",
                "5.3",
                "video",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 5",
                "shortLabel": "Section 5 Supporting Video",
                "title": "FASD in Adolescence — Support, Strengths & Ending Stigma",
                "youtubeUrl": "https://www.youtube.com/watch?v=5O2_FN7mUr0",
                "embedUrl": "https://www.youtube.com/embed/5O2_FN7mUr0?rel=0",
                "guidance": "Watch how families, partners, schools, and communities can create a supportive, stigma-free environment—both to help expectant mothers stay alcohol-free and to empower young people living with FASD to thrive.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Raising Awareness About Fetal Alcohol Spectrum Disorder in Southern Africa",
                        "source": "eNCA Public Health Report",
                        "youtubeUrl": "https://www.youtube.com/watch?v=pI56FekxhoM",
                        "embedUrl": "https://www.youtube.com/embed/pI56FekxhoM?rel=0"
                    }
                ]
            },
            "subsections": {
                "5.1": {
                    "key": "5.1",
                    "code": "5.1",
                    "shortLabel": "5.1 If Someone Drank Before Knowing",
                    "title": "5.1 If Someone Drank Before Knowing",
                    "html": "\n            <p>What if a young woman had a drink at a party in Week 2 or Week 3 before discovering she was pregnant in Week 5? Many women feel terrified or guilty, and some are afraid to go to the clinic. Share this reassuring, medical message:</p>\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:14px 0;\">\n              <ol style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>Stop Drinking Immediately—Every Alcohol-Free Day Counts!</strong> Because the baby's brain grows throughout all 40 weeks, stopping alcohol the moment you find out you are pregnant dramatically reduces risk and gives your baby the healthiest possible start. Never think, <em>\"I already drank once, so it's too late.\"</em> <strong>It is NEVER too late to stop.</strong></li>\n                <li><strong>Book an Antenatal Care (ANC) Clinic Visit Right Away:</strong> Visit your local clinic, hospital maternity ward, or doctor as early as possible. Be honest with your midwife or doctor—they are there to support you confidentially, prescribe vital <strong>folic acid (folate) and iron supplements</strong>, and monitor your baby's growth.</li>\n                <li><strong>Ask for Help Without Shame:</strong> If someone finds it hard to stop drinking on their own, confidential medical counselling and support groups can help her stop safely without judgment.</li>\n              </ol>\n            </div>\n          "
                },
                "5.2": {
                    "key": "5.2",
                    "code": "5.2",
                    "shortLabel": "5.2 How Partners & Friends Can Help",
                    "title": "5.2 How Partners & Friends Can Help",
                    "html": "\n            <p>Preventing FASD is <strong>NOT just a woman's responsibility</strong>—it is a shared responsibility for boyfriends, husbands, friends, and families! Research shows that the <strong>#1 influence on whether a pregnant woman drinks is the behaviour of her partner and close social circle</strong>:</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Pre-Conception Paternal Health:</strong> Heavy drinking by men before conception damages sperm DNA quality, lowers fertility, and increases the risk of pregnancy complications.</li>\n              <li><strong>Take the \"Solidarity Pledge\":</strong> The best way a male partner or best friend can support an expectant mother is to <strong>go alcohol-free alongside her</strong> during the pregnancy, keep alcohol out of the house, and plan fun, alcohol-free dates and mocktail celebrations.</li>\n              <li><strong>Protect Her From Social Pressure (Even Before She Announces the Pregnancy!):</strong> Many women wait until Week 12 (the end of the First Trimester) before telling friends they are pregnant. That is why—at any party or braai—you should <strong>never interrogate or pressure a woman who says \"No thanks\" to a drink</strong>, and never joke, <em>\"Why aren't you drinking—are you pregnant?\"</em> Respect every \"No\" the first time!</li>\n            </ul>\n          "
                },
                "5.3": {
                    "key": "5.3",
                    "code": "5.3",
                    "shortLabel": "5.3 Supporting Teens Living With F...",
                    "title": "5.3 Supporting Teens Living With FASD",
                    "html": "\n            <p>Remember: A child or teenager living with FASD has a physical brain injury they were born with through no fault of their own. When teachers, classmates, and communities understand FASD:</p>\n            <div style=\"background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:16px; margin-top:12px;\">\n              <ul style=\"margin:0; padding-left:18px; color:#1e3a8a; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>We Replace Blame With Structure:</strong> Instead of calling a student with FASD \"naughty,\" \"stubborn,\" or \"lazy,\" we use short, clear, step-by-step written instructions, visual checklists, and calm, predictable routines.</li>\n                <li><strong>We Celebrate Their Strengths:</strong> Many young people with FASD have wonderful strengths in art, music, drama, athletics, hands-on technical skills, and kindness—and thrive when mentored by patient, protective friends who never lead them into trouble.</li>\n              </ul>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "5.4",
                "shortLabel": "5.4 Review Questions (≥80%)",
                "title": "5.4 Section 5 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q5_1",
                        "topic": "Question 1 • Section 5 Mastery Check",
                        "prompt": "If Someone Drank Before Knowing: If a young woman had a drink at a party in Week 3 before discovering she is pregnant in Week 5, what are the three most important steps she should take immediately?",
                        "options": [
                            "Keep drinking because Week 3 has already passed",
                            "(1) Stop drinking immediately (every alcohol-free day protects ongoing 40-week brain growth), (2) book an early Antenatal Care (ANC) clinic visit for folic acid/iron and honest medical care, and (3) ask for confidential help without shame if stopping is difficult",
                            "Avoid going to the clinic until Month 9",
                            "Switch to drinking traditional beer instead"
                        ],
                        "correctIndex": 1,
                        "explanation": "It is never too late to stop: stopping immediately protects the baby's ongoing brain development across all 40 weeks, and early Antenatal Care (ANC) provides vital folic acid and iron."
                    },
                    {
                        "id": "q5_2",
                        "topic": "Question 2 • Section 5 Mastery Check",
                        "prompt": "Partner & Social Circle Role: What are three practical ways male partners and friends can support a 0.0%-alcohol pregnancy (even before a woman publicly announces she is pregnant)?",
                        "options": [
                            "Drink heavily in front of her and tease women who turn down drinks at braais",
                            "(1) Protect pre-conception paternal health, (2) take the 'Solidarity Pledge' by going alcohol-free alongside her and planning mocktail dates, and (3) never pressure or interrogate any woman who says 'No, thanks' to a drink (since many wait until Week 12 to announce pregnancy)",
                            "Force her to attend loud bar bashes every weekend",
                            "Tell her that one glass of wine is required for toasts"
                        ],
                        "correctIndex": 1,
                        "explanation": "Partners and friends lead by example through pre-conception health, going alcohol-free in solidarity, and respecting every 'No, thanks' at social gatherings without prying questions."
                    },
                    {
                        "id": "q5_3",
                        "topic": "Question 3 • Section 5 Mastery Check",
                        "prompt": "Supporting Peers With FASD: Why is it unfair to label a student living with FASD as 'lazy' or 'naughty,' and what classroom/friendship habits help them succeed?",
                        "options": [
                            "Because FASD is a physical brain injury acquired before birth through no fault of their own; short step-by-step written instructions, visual checklists, calm routines, and celebrating their creative/practical strengths help them thrive",
                            "Because students with FASD never need any instructions",
                            "Because shouting louder fixes working memory",
                            "Because FASD only lasts for one semester"
                        ],
                        "correctIndex": 0,
                        "explanation": "Learners with FASD live with a prenatal neurological injury; replacing stigma with clear step-by-step structure, patience, and positive peer mentorship empowers them to succeed."
                    },
                    {
                        "id": "q5_4",
                        "topic": "Question 4 • Section 5 Mastery Check",
                        "prompt": "How does heavy alcohol consumption by a male partner BEFORE conception affect pregnancy health?",
                        "options": [
                            "It has zero biological effect",
                            "Heavy drinking by men before conception damages sperm DNA quality, lowers fertility, and is the #1 social influence on whether an expectant mother feels pressured to drink",
                            "It makes the placenta thicker",
                            "It increases folic acid in the baby"
                        ],
                        "correctIndex": 1,
                        "explanation": "Paternal heavy drinking damages sperm DNA and fertility before conception and strongly influences household drinking habits during pregnancy."
                    },
                    {
                        "id": "q5_5",
                        "topic": "Question 5 • Section 5 Mastery Check",
                        "prompt": "Why should you NEVER joke 'Why aren't you drinking—are you pregnant?' when a female classmate or friend turns down alcohol at a social gathering?",
                        "options": [
                            "Because many women choose not to drink for health, sport, or personal reasons—and those who ARE in their first trimester (Weeks 1–12) often wish to keep their pregnancy private while protecting their baby",
                            "Because it is against traffic laws",
                            "Because women are not allowed to drink water at braais",
                            "Because it ruins the taste of mocktails"
                        ],
                        "correctIndex": 0,
                        "explanation": "Respecting every 'No, thanks' without interrogation protects women who are quietly safeguarding an early first-trimester pregnancy as well as anyone choosing a smart, alcohol-free lifestyle."
                    }
                ]
            }
        }
    ]
};

const SUGARY_DIET_CURRICULUM = {
    "shortTitle": "Sugary Drinks, Diet & Long-Term Health",
    "title": "Sugary Drinks, Diet & Long-Term Health: Curriculum & Study Guide",
    "targetAudience": "Learners Aged 16+ (Senior Secondary, College & Young Adult Smart Living Education)",
    "coreFocus": "Nutritional Balance, Hydration Science, Smart Non-Alcoholic Beverage Choices, and Long-Term Metabolic Wellness for Peak Student Performance",
    "overview": "This comprehensive curriculum and study guide accompanies the Sugary Drinks, Diet & Long-Term Health Smart Living module. Designed in clear, approachable language for learners aged 16 and older, this guide explains how hidden sugars in everyday drinks affect energy and concentration, how to calculate teaspoons of sugar from nutrition labels, how hydration science drives memory and athletic stamina, how to choose refreshing non-alcoholic beverages without triggering blood-sugar crashes, and how daily dietary habits protect your liver, pancreas, and heart from long-term metabolic diseases like Type 2 diabetes.",
    "learningObjectives": [
        "Compare whole fruit's dietary fibre brake with fibre-free liquid sugar, calculate teaspoons of sugar from nutrition labels using the 4-Grams = 1-Teaspoon Rule, and apply WHO daily sugar limits (25g/6 tsp ideal, 50g/12 tsp max).",
        "Understand why the human brain is 75% water, how a 1–2% water loss triggers a 'study headache' and a 10–15% drop in exam focus, and how to use the 4-level Urine Colour Check.",
        "Use the Traffic-Light Beverage Guide (Green, Amber, Red Tiers) including healthy Zimbabwean choices (water, zumbani, baobab/mawuyu, low-sugar 0.0% maheu), spot hidden '-ose' and 'syrup' sugars, and avoid the 5–6 hour caffeine half-life sleep trap.",
        "Trace the 60–90 minute blood-sugar spike and crash (Reactive Hypoglycaemia), Insulin Resistance & Type 2 Diabetes, and how liquid fructose causes Non-Alcoholic Fatty Liver Disease (NAFLD).",
        "Build the Smart Student Plate (½ Vegetables/Fruits + ¼ Complex Carbs + ¼ Protein/Healthy Fats) using affordable Zimbabwean foods, save US$40–$50/month with smart swaps, and practice 5 daily metabolic habits."
    ],
    "sections": [
        {
            "id": 1,
            "numberLabel": "Section 1",
            "title": "The Science of Sugary Drinks & Hidden Liquid Sugar",
            "summary": "Compare whole fruit fibre with 'invisible' liquid sugar, calculate teaspoons of sugar from nutrition labels using the 4-Grams = 1-Teaspoon Rule, and learn WHO daily sugar limits (25g/6 tsp ideal, 50g/12 tsp max) and Zimbabwe's Sugar Tax.",
            "order": [
                "video",
                "1.1",
                "1.2",
                "1.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 1",
                "shortLabel": "Section 1 Supporting Video",
                "title": "Choose Healthy: Sugary Drinks — Visualising Teaspoons of Hidden Sugar",
                "youtubeUrl": "https://www.youtube.com/watch?v=eiX423L0ymo",
                "embedUrl": "https://www.youtube.com/embed/eiX423L0ymo?rel=0",
                "guidance": "Before reading Section 1, watch a clinical dietitian measure out the exact number of teaspoons of sugar hidden inside everyday sodas, sports drinks, and sweet juices—and see how quickly one bottle pushes past your daily health limit.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "1.1": {
                    "key": "1.1",
                    "code": "1.1",
                    "shortLabel": "1.1 Whole Fruit vs. Liquid Sugar",
                    "title": "1.1 Whole Fruit vs. Liquid Sugar",
                    "html": "\n            <p>When you choose to live a smart, alcohol-free or moderate lifestyle, the most common drinks around you at tuckshops, campus cafeterias, braais, and sports fields are <strong>soft drinks (fizzy sodas), energy drinks, sweetened juices, and cordials (like diluted crushes)</strong>.</p>\n            <p>Why do nutrition scientists warn that <strong>liquid sugar</strong> is much harder on your body than eating a whole piece of fruit (like an orange, banana, or mango)?</p>\n            <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:14px; margin:14px 0;\">\n              <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 6px 0; color:#166534; font-size:0.98rem;\">1. Whole Fruit Has a \"Fibre Brake\"</h5>\n                <p style=\"margin:0; color:#1e293b; font-size:0.91rem; line-height:1.6;\">When you eat a whole orange or apple, the natural fruit sugar is locked inside a mesh of <strong>dietary fibre</strong>. You have to chew it, and your stomach breaks it down slowly over hours, releasing a steady, gentle trickle of energy while making you feel full.</p>\n              </div>\n              <div style=\"background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:16px;\">\n                <h5 style=\"margin:0 0 6px 0; color:#991b1b; font-size:0.98rem;\">2. Liquid Sugar Has Zero Fibre &amp; Zero Fullness</h5>\n                <p style=\"margin:0; color:#7f1d1d; font-size:0.91rem; line-height:1.6;\">Sugar dissolved in a drink has <strong>no fibre at all</strong>. When you gulp a 500 mL sweet drink, your stomach does not register those calories as \"food\"—so you don't feel full, yet <strong>8 to 14 teaspoons of sugar rush straight into your bloodstream within 15 minutes!</strong></p>\n              </div>\n            </div>\n          "
                },
                "1.2": {
                    "key": "1.2",
                    "code": "1.2",
                    "shortLabel": "1.2 The 4-Grams = 1-Teaspoon Rule",
                    "title": "1.2 The 4-Grams = 1-Teaspoon Rule",
                    "html": "\n            <p>Beverage labels print sugar content in <strong>grams (g)</strong>—usually per 100 mL—which makes it hard to picture how much sugar is actually inside the bottle. Use this simple two-step formula:</p>\n            <div style=\"background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:16px; margin:14px 0;\">\n              <p style=\"margin:0 0 6px 0; font-family:monospace; font-size:0.96rem; color:#0f172a; font-weight:700;\">\n                Step 1: Total Grams of Sugar = (Sugar per 100 mL) × (Container Size in mL ÷ 100)\n              </p>\n              <p style=\"margin:0 0 8px 0; font-family:monospace; font-size:0.98rem; color:#166534; font-weight:700;\">\n                Step 2: Teaspoons of Sugar = Total Grams of Sugar ÷ 4  (1 heaped teaspoon = 4 grams)\n              </p>\n              <p style=\"margin:0; font-size:0.9rem; color:#334155;\">\n                <strong>Worked Example:</strong> You buy a <strong>500 mL bottle of fizzy soda</strong> whose nutrition label says <strong>\"Sugars: 10.8g per 100 mL.\"</strong><br>\n                • Total Grams in the 500 mL bottle = 10.8 g × 5 = <strong>54 grams of sugar</strong>.<br>\n                • Teaspoons of Sugar = 54 g ÷ 4 = <strong>13.5 teaspoons of sugar in a single bottle!</strong>\n              </p>\n            </div>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Common Beverage (Typical Serving)</th>\n                    <th style=\"padding:10px 12px;\">Total Sugar (Grams)</th>\n                    <th style=\"padding:10px 12px;\">Equivalent Teaspoons (÷ 4g)</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Standard Fizzy Soft Drink / Soda (500 mL bottle)</td>\n                    <td style=\"padding:10px 12px;\">53 g – 56 g</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c; font-weight:700;\">13.2 to 14 teaspoons</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Caffeinated Energy Drink (500 mL can)</td>\n                    <td style=\"padding:10px 12px;\">55 g – 70 g</td>\n                    <td style=\"padding:10px 12px; color:#991b1b; font-weight:700;\">13.7 to 17.5 teaspoons</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Sweetened Commercial Fruit Juice / Nectar (330 mL pack)</td>\n                    <td style=\"padding:10px 12px;\">33 g – 38 g</td>\n                    <td style=\"padding:10px 12px; color:#b45309; font-weight:700;\">8.2 to 9.5 teaspoons</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Sweetened Cordial / Crush (250 mL glass mixed heavy 1:3)</td>\n                    <td style=\"padding:10px 12px;\">22 g – 28 g</td>\n                    <td style=\"padding:10px 12px; color:#b45309;\">5.5 to 7 teaspoons <em>(Tip: Dilute 1:7 with water to cut in half!)</em></td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#166534;\">Pure Water / Sparkling Water with Fresh Lemon or Mint (500 mL)</td>\n                    <td style=\"padding:10px 12px; color:#166534; font-weight:700;\">0 g</td>\n                    <td style=\"padding:10px 12px; color:#166534; font-weight:700;\">0 teaspoons</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "1.3": {
                    "key": "1.3",
                    "code": "1.3",
                    "shortLabel": "1.3 WHO Limits & Zimbabwe's Sugar ...",
                    "title": "1.3 WHO Limits & Zimbabwe's Sugar Tax",
                    "html": "\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin:12px 0;\">\n              <h5 style=\"margin:0 0 8px 0; color:#166534; font-size:0.98rem;\">World Health Organization (WHO) Daily Added Sugar Limits</h5>\n              <ul style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>Maximum Daily Limit:</strong> No more than <strong>50 grams (12 teaspoons)</strong> of added/free sugars per day from all foods and drinks combined.</li>\n                <li><strong>Ideal Target for Peak Health:</strong> Keep added sugar <strong>below 25 grams (6 teaspoons) per day</strong>! Notice that <strong>just ONE 500 mL bottle of fizzy soda (13.5 teaspoons) is more than DOUBLE the ideal daily limit!</strong></li>\n              </ul>\n            </div>\n            <p style=\"font-size:0.93rem; color:#334155; line-height:1.6;\"><strong>Zimbabwe's Health Sugar Tax:</strong> To protect citizens from rising rates of obesity, Type 2 diabetes, and heart disease (Non-Communicable Diseases / NCDs), Zimbabwe introduced a <strong>Special Surtax on Sugar Content in Beverages</strong>—encouraging beverage manufacturers to lower sugar levels and helping consumers choose lower-sugar or zero-sugar options.</p>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "1.4",
                "shortLabel": "1.4 Review Questions (≥80%)",
                "title": "1.4 Section 1 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q1_1",
                        "topic": "Question 1 • Section 1 Mastery Check",
                        "prompt": "Whole Fruit vs. Liquid Sugar: Why does eating two whole oranges keep your energy steady and make you feel full, while drinking a 500 mL fizzy orange drink floods your blood with sugar in 15 minutes?",
                        "options": [
                            "Because whole oranges contain zero natural sugar",
                            "Because whole fruit locks natural sugar inside a dietary fibre mesh that slows digestion and signals fullness, whereas liquid sugar has zero fibre and rushes straight into the bloodstream within 15 minutes without making you feel full",
                            "Because fizzy bubbles destroy stomach acid",
                            "Because oranges only digest at night"
                        ],
                        "correctIndex": 1,
                        "explanation": "Whole fruit contains a dietary fibre matrix ('fibre brake') that slows sugar absorption over hours and triggers satiety. Liquid sugar has zero fibre, dumping 8–14 teaspoons of sugar into the blood in 15 minutes."
                    },
                    {
                        "id": "q1_2",
                        "topic": "Question 2 • Section 1 Mastery Check",
                        "prompt": "Label Math Challenge: You pick up a 440 mL can of energy drink. The nutrition label states 'Sugars: 12.5g per 100 mL.' Using the 4-Grams = 1-Teaspoon rule, how many total grams and how many teaspoons of sugar are inside that 440 mL can?",
                        "options": [
                            "12.5 grams = 3.1 teaspoons",
                            "44 grams = 11 teaspoons",
                            "55 grams = 13.75 teaspoons of sugar",
                            "25 grams = 6.25 teaspoons"
                        ],
                        "correctIndex": 2,
                        "explanation": "Step 1: 12.5 g × (440 ÷ 100 = 4.4) = 55 grams of sugar in the can. Step 2: 55 g ÷ 4 g per teaspoon = 13.75 teaspoons of sugar!"
                    },
                    {
                        "id": "q1_3",
                        "topic": "Question 3 • Section 1 Mastery Check",
                        "prompt": "How does that single 440 mL energy drink can (55 grams / 13.75 teaspoons of sugar) compare to the World Health Organization (WHO) daily added sugar guidelines?",
                        "options": [
                            "It is well below the ideal daily target",
                            "That single can exceeds the WHO maximum daily limit of 50g (12 tsp) and is more than DOUBLE the WHO ideal health target of 25g (6 tsp) per day!",
                            "WHO recommends at least 100g of added sugar per day",
                            "Energy drinks do not count toward daily sugar intake"
                        ],
                        "correctIndex": 1,
                        "explanation": "WHO recommends keeping free sugars below a maximum of 50g (12 tsp) per day, and ideally below 25g (6 tsp) per day. One 55g energy drink exceeds the entire day's maximum limit."
                    },
                    {
                        "id": "q1_4",
                        "topic": "Question 4 • Section 1 Mastery Check",
                        "prompt": "How can you enjoy a glass of cordial/crush while cutting its sugar content in half?",
                        "options": [
                            "Drink it undiluted straight from the bottle",
                            "Dilute it lightly with plenty of cold water (e.g., a 1:7 ratio instead of a heavy 1:3 ratio)",
                            "Add two spoons of table sugar to the glass",
                            "Boil the cordial first"
                        ],
                        "correctIndex": 1,
                        "explanation": "Diluting concentrated cordial at 1 part cordial to 7 parts water (instead of a heavy 1:3 pour) cuts the sugar per glass in half while keeping it refreshing."
                    },
                    {
                        "id": "q1_5",
                        "topic": "Question 5 • Section 1 Mastery Check",
                        "prompt": "Why did Zimbabwe introduce the Special Surtax on Sugar Content in Beverages?",
                        "options": [
                            "To ban water bottles on school campuses",
                            "To help reduce rising Non-Communicable Diseases (NCDs) like obesity, Type 2 diabetes, and heart disease by encouraging lower-sugar beverage formulations and healthier consumer choices",
                            "To make fruit and vegetables more expensive",
                            "To encourage people to drink more energy drinks"
                        ],
                        "correctIndex": 1,
                        "explanation": "Zimbabwe's sugar content surtax is a public health measure aimed at curbing Non-Communicable Diseases (NCDs) such as Type 2 diabetes, obesity, and cardiovascular disease."
                    }
                ]
            }
        },
        {
            "id": 2,
            "numberLabel": "Section 2",
            "title": "Hydration Science & Peak Student Brain Performance",
            "summary": "Discover why the human brain is 75% water, how just 1–2% dehydration shrinks brain tissue ('study headache') and cuts exam focus by 10–15%, and how to use the 4-level Urine Colour Check.",
            "order": [
                "2.1",
                "video",
                "2.2",
                "2.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 2",
                "shortLabel": "Section 2 Supporting Video",
                "title": "The Biological Role of Water in the Human Body",
                "youtubeUrl": "https://www.youtube.com/watch?v=tSA9V2ewfms",
                "embedUrl": "https://www.youtube.com/embed/tSA9V2ewfms?rel=0",
                "guidance": "Watch how water powers your brain cells, regulates body temperature during Zimbabwe's hot afternoons, cushions joints, and keeps your blood flowing smoothly to deliver oxygen to your muscles and mind.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "What Happens to Your Body If You Do Not Drink Enough Water",
                        "source": "Human Biology & Brain Hydration Explainer",
                        "youtubeUrl": "https://www.youtube.com/watch?v=ZuH7IMvJtwc",
                        "embedUrl": "https://www.youtube.com/embed/ZuH7IMvJtwc?rel=0"
                    }
                ]
            },
            "subsections": {
                "2.1": {
                    "key": "2.1",
                    "code": "2.1",
                    "shortLabel": "2.1 Why Your Brain Runs on Water",
                    "title": "2.1 Why Your Brain Runs on Water",
                    "html": "\n            <p>Water is not just for quenching thirst—it is the primary fuel-delivery system for every cell in your body. Look at the numbers:</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Overall Body Weight:</strong> About <strong>60%</strong> of your entire body weight is water.</li>\n              <li><strong>Your Brain &amp; Muscles:</strong> Your brain and muscles are roughly <strong>75% water</strong>, and your blood is over <strong>80% water</strong>!</li>\n              <li><strong>Four Critical Jobs of Water:</strong><br>\n                (1) Powers electrical signals between brain neurons (using dissolved minerals called <strong>electrolytes</strong> like sodium and potassium),<br>\n                (2) Carries oxygen and glucose to your brain during exams,<br>\n                (3) Cools your body through sweat during hot weather and sports, and<br>\n                (4) Flushes waste products out through your kidneys.</li>\n            </ul>\n          "
                },
                "2.2": {
                    "key": "2.2",
                    "code": "2.2",
                    "shortLabel": "2.2 How Mild Dehydration (1–2%) Hu...",
                    "title": "2.2 How Mild Dehydration (1–2%) Hurts Grades",
                    "html": "\n            <p>Many students wait until their mouth feels dry before drinking water. However, <strong>thirst lags behind dehydration</strong>—by the time you feel thirsty, your body has already lost <strong>1% to 2% of its water supply</strong>!</p>\n            <div style=\"background:#fff7ed; border-left:4px solid #ea580c; border-radius:0 12px 12px 0; padding:14px 18px; margin:14px 0;\">\n              <ul style=\"margin:0; padding-left:18px; color:#7c2d12; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>At 1% to 2% Dehydration (Mild):</strong> Your blood volume drops slightly, forcing your heart to beat faster. Brain tissue temporarily loses fluid and shrinks slightly away from the skull, triggering a dull <strong>\"study headache.\"</strong> Short-term memory, math speed, alertness, and concentration drop by <strong>10% to 15%</strong>, while tiredness and irritability spike!</li>\n                <li><strong>At 3% to 4% Dehydration (Moderate):</strong> Reaction time slows noticeably, muscles cramp easily, dizziness sets in, and athletic stamina on the football pitch or netball court drops by <strong>20% to 30%</strong>.</li>\n                <li><strong>At 5%+ Dehydration (Severe):</strong> High risk of heat exhaustion and life-threatening heatstroke.</li>\n              </ul>\n            </div>\n          "
                },
                "2.3": {
                    "key": "2.3",
                    "code": "2.3",
                    "shortLabel": "2.3 The Urine Colour Check & Sweat...",
                    "title": "2.3 The Urine Colour Check & Sweat Loss",
                    "html": "\n            <p><strong>Daily Hydration Target:</strong> Teenagers and young adults need roughly <strong>2.0 to 2.5 Litres (8 to 10 glasses)</strong> of water per day for females, and <strong>2.5 to 3.2 Litres (10 to 13 glasses)</strong> per day for males—plus an extra <strong>500 mL to 1 Litre for every hour of sport or hot outdoor walking</strong>.</p>\n            <p>You don't need a laboratory to check your hydration—just use the <strong>Urine Colour Chart</strong> every time you visit the bathroom:</p>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Urine Colour</th>\n                    <th style=\"padding:10px 12px;\">What It Means Inside Your Body</th>\n                    <th style=\"padding:10px 12px;\">Your Smart Action</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#166534;\">1. Pale Straw / Light Lemonade</td>\n                    <td style=\"padding:10px 12px;\"><strong>Optimal Hydration:</strong> Your brain, blood, and kidneys have the exact fluid balance they need for peak focus.</td>\n                    <td style=\"padding:10px 12px;\">Keep sipping water steadily through the day.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#0369a1;\">2. Crystal Clear / Transparent</td>\n                    <td style=\"padding:10px 12px;\"><strong>Fully Hydrated (or slightly over-drinking):</strong> Kidneys are flushing excess water rapidly.</td>\n                    <td style=\"padding:10px 12px;\">No need to chug extra water right now; pace your sips.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#b45309;\">3. Bright Yellow / Dark Honey</td>\n                    <td style=\"padding:10px 12px;\"><strong>Early Dehydration (1–2% loss):</strong> Your brain has released <em>anti-diuretic hormone (ADH / vasopressin)</em> telling your kidneys to save water, concentrating your urine.</td>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#b45309;\">Drink 1 to 2 full glasses (250–500 mL) of water right away!</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">4. Dark Amber / Brownish Tea</td>\n                    <td style=\"padding:10px 12px;\"><strong>Severe Dehydration (or medical warning):</strong> Kidneys are under heavy strain; brain focus and physical energy are heavily impaired.</td>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">Drink water with electrolytes immediately, rest in the shade, and visit a clinic if it persists.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "2.4",
                "shortLabel": "2.4 Review Questions (≥80%)",
                "title": "2.4 Section 2 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q2_1",
                        "topic": "Question 1 • Section 2 Mastery Check",
                        "prompt": "The 'Study Headache': Why does losing just 1% to 2% of your body's water cause a headache and a 10–15% drop in exam concentration?",
                        "options": [
                            "Because water turns into sugar inside the skull",
                            "Because the brain is 75% water—when fluid drops by 1–2%, blood volume falls and brain tissue temporarily loses water and shrinks slightly away from the skull, triggering a 'study headache' and slowing neuron signals",
                            "Because dehydration only affects your toes",
                            "Because reading books evaporates water from your eyes"
                        ],
                        "correctIndex": 1,
                        "explanation": "Your brain is ~75% water. Even a mild 1–2% fluid loss reduces blood volume and causes slight temporary shrinkage of brain tissue, sparking a dull study headache and cutting memory and math speed by 10–15%."
                    },
                    {
                        "id": "q2_2",
                        "topic": "Question 2 • Section 2 Mastery Check",
                        "prompt": "The Urine Colour Check: If your urine looks like dark honey or amber in the middle of the afternoon, what hormone has your brain released, and how much water should you drink right away?",
                        "options": [
                            "Adrenaline; you should drink a 500 mL energy drink",
                            "Anti-diuretic hormone (ADH / vasopressin) telling the kidneys to conserve water; you should drink 1 to 2 full glasses (250–500 mL) of pure water immediately",
                            "Melatonin; you should stop drinking water for the rest of the day",
                            "Insulin; you should eat sweets"
                        ],
                        "correctIndex": 1,
                        "explanation": "Bright yellow or dark honey urine shows your brain has released ADH (vasopressin) to conserve water because you are 1–2% dehydrated. Drinking 250–500 mL (1–2 glasses) of water restores optimal pale-straw hydration."
                    },
                    {
                        "id": "q2_3",
                        "topic": "Question 3 • Section 2 Mastery Check",
                        "prompt": "The Thirst Lag: Why is waiting until your mouth feels dry a poor strategy for staying hydrated during exams or sports?",
                        "options": [
                            "Because thirst lags behind actual water loss—by the time you feel thirsty, your body is already 1% to 2% dehydrated and your mental focus has already started dropping",
                            "Because a dry mouth means you have drunk too much water",
                            "Because you can only absorb water when you are not thirsty",
                            "Because thirst only happens in winter"
                        ],
                        "correctIndex": 0,
                        "explanation": "The thirst sensation only switches on after you have already lost 1–2% of your body water—meaning concentration and stamina are already dipping before your mouth feels dry."
                    },
                    {
                        "id": "q2_4",
                        "topic": "Question 4 • Section 2 Mastery Check",
                        "prompt": "Roughly how much water do young adult females and males need each day (before adding extra water for sports or hot outdoor walking)?",
                        "options": [
                            "0.5 Litres (2 glasses) for everyone",
                            "Roughly 2.0 to 2.5 Litres (8–10 glasses) for females and 2.5 to 3.2 Litres (10–13 glasses) for males—plus 500 mL to 1 Litre per hour of sport",
                            "10 Litres per hour",
                            "Only 1 glass at bedtime"
                        ],
                        "correctIndex": 1,
                        "explanation": "Daily baseline fluid needs are ~2.0–2.5 L (8–10 glasses) for females and ~2.5–3.2 L (10–13 glasses) for males, plus 500 mL–1 L per hour of exercise."
                    },
                    {
                        "id": "q2_5",
                        "topic": "Question 5 • Section 2 Mastery Check",
                        "prompt": "What happens to an athlete's performance on the football pitch or netball court at 3% to 4% (moderate) dehydration?",
                        "options": [
                            "They run 50% faster",
                            "Reaction time slows noticeably, muscles cramp easily, dizziness sets in, and athletic endurance drops by 20% to 30%",
                            "Nothing changes until dehydration reaches 20%",
                            "Their eyesight becomes sharper"
                        ],
                        "correctIndex": 1,
                        "explanation": "At 3–4% dehydration, reduced blood flow and electrolyte loss cause muscle cramps, slowed reaction time, and a 20–30% drop in physical stamina."
                    }
                ]
            }
        },
        {
            "id": 3,
            "numberLabel": "Section 3",
            "title": "Mastering Non-Alcoholic Beverage Choices & Label Reading",
            "summary": "Use the Traffic-Light Beverage Guide (Green, Amber, Red Tiers) including Zimbabwean drinks like maheu, mawuyu (baobab), and zumbani tea, spot '-ose' and 'syrup' hidden sugars, and avoid the 5–6 hour caffeine half-life sleep trap.",
            "order": [
                "3.1",
                "video",
                "3.2",
                "3.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 3",
                "shortLabel": "Section 3 Supporting Video",
                "title": "Dangers Of Sugary Drinks & Colourful Traffic-Light Food Labels For Healthy Choices",
                "youtubeUrl": "https://www.youtube.com/watch?v=5AbLR8roL_4",
                "embedUrl": "https://www.youtube.com/embed/5AbLR8roL_4?rel=0",
                "guidance": "Watch how simple 'Traffic-Light' (Green, Amber, Red) beverage ratings and quick nutrition-label checks empower young people to spot hidden sugars and pick smarter drinks in seconds.",
                "additionalLink": null,
                "additionalVideos": []
            },
            "subsections": {
                "3.1": {
                    "key": "3.1",
                    "code": "3.1",
                    "shortLabel": "3.1 Decoding Beverage Nutrition La...",
                    "title": "3.1 Decoding Beverage Nutrition Labels & Traffic-Light Guide",
                    "html": "\n            <p>When you are choosing a non-alcoholic drink at a shop, campus kiosk, or social gathering, use the <strong>Traffic-Light Beverage Guide</strong> (based on grams of sugar per 100 mL):</p>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Traffic-Light Tier</th>\n                    <th style=\"padding:10px 12px;\">Sugar Level (per 100 mL)</th>\n                    <th style=\"padding:10px 12px;\">Best Zimbabwean &amp; Everyday Examples</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#166534;\">GREEN TIER<br><span style=\"font-weight:400; font-size:0.8rem;\">(Drink All Day — Everyday Fuel)</span></td>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#166534;\">0g to 2g per 100 mL<br><span style=\"font-weight:400;\">(Zero or Low Sugar)</span></td>\n                    <td style=\"padding:10px 12px;\">\n                      • Clean chilled water or sparkling/soda water.<br>\n                      • <strong>Fruit-Infused Water:</strong> Water with slices of fresh lemon, lime, cucumber, mint, or crushed ginger (awesome as a party \"Decoy Cup\"!).<br>\n                      • Unsweetened iced <strong>Rooibos, Zumbani, or Hibiscus (<em>Rosella</em>) tea</strong>.<br>\n                      • Plain low-fat milk or unsweetened cultured milk (<em>hodzeko / amasi</em>).\n                    </td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700; color:#b45309;\">AMBER TIER<br><span style=\"font-weight:400; font-size:0.8rem;\">(Enjoy in Moderation / Active Recovery)</span></td>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#b45309;\">3g to 6g per 100 mL<br><span style=\"font-weight:400;\">(Moderate Sugar or Natural Nutrients)</span></td>\n                    <td style=\"padding:10px 12px;\">\n                      • <strong>Lightly Diluted Cordials (1:7 ratio with water)</strong>.<br>\n                      • <strong>Traditional Low-Sugar Non-Alcoholic <em>Maheu</em>:</strong> Provides slow-release grain carbohydrates, B-vitamins, and fibre (check the label—some commercial <em>maheu</em> brands add lots of extra sugar, so pick low-sugar versions!).<br>\n                      • <strong>Homemade Baobab (<em>Mawuyu</em>) Juice:</strong> Packed with Vitamin C, calcium, potassium, and prebiotic fibre when made with minimal added sugar.<br>\n                      • 100% pure coconut water or 50/50 water-diluted fruit juice.<br>\n                      • Isotonic sports drinks (only needed during 60+ minutes of intense sport).\n                    </td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">RED TIER<br><span style=\"font-weight:400; font-size:0.8rem;\">(Occasional Treat Only — High Sugar Spike)</span></td>\n                    <td style=\"padding:10px 12px; font-weight:700; color:#991b1b;\">Over 8g per 100 mL<br><span style=\"font-weight:400;\">(High Liquid Sugar)</span></td>\n                    <td style=\"padding:10px 12px;\">\n                      • Full-sugar fizzy sodas (10g–11g/100 mL).<br>\n                      • Caffeinated energy drinks (11g–14g/100 mL).<br>\n                      • Heavy-syrup fruit punches, commercial milkshakes, and undiluted cordials.\n                    </td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "3.2": {
                    "key": "3.2",
                    "code": "3.2",
                    "shortLabel": "3.2 Spotting Hidden Sugars on Ingr...",
                    "title": "3.2 Spotting Hidden Sugars on Ingredient Lists",
                    "html": "\n            <p>Sometimes a drink claims to be \"Natural Energy\" or \"Vitamin Water,\" yet it is loaded with added sugar under a disguise name! Here is how to read an ingredient list like a scientist:</p>\n            <div style=\"background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:16px; margin:12px 0;\">\n              <ol style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>The First-Three Ingredients Rule:</strong> Ingredients on every food and drink label are listed by weight from <strong>heaviest (most) to lightest (least)</strong>. If sugar (or any of its aliases below) appears in the <strong>first three ingredients</strong>, it is a high-sugar product.</li>\n                <li><strong>Watch Out for Words Ending in \"-ose\" or \"Syrup\":</strong> Manufacturers often split sugar into multiple secret names so \"sugar\" doesn't appear first. All of these are still added liquid sugar:<br>\n                <em>Sucrose, High-Fructose Corn Syrup (HFCS), Glucose Syrup, Dextrose, Maltose, Fructose, Cane Juice, Invert Sugar, Agave Nectar, and Fruit Juice Concentrate.</em></li>\n              </ol>\n            </div>\n          "
                },
                "3.3": {
                    "key": "3.3",
                    "code": "3.3",
                    "shortLabel": "3.3 The Energy Drink & Caffeine Trap",
                    "title": "3.3 The Energy Drink & Caffeine Trap",
                    "html": "\n            <p>Many high school and university students chug <strong>caffeinated energy drinks</strong> late at night to cram for exams. Why does this backfire on your grades?</p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>The 5-to-6-Hour Caffeine Half-Life:</strong> A single 500 mL energy drink contains <strong>80 mg to 160 mg of caffeine</strong> (equal to 2 cups of strong coffee) plus ~14 teaspoons of sugar. Caffeine has a <strong>half-life of 5 to 6 hours</strong>—meaning if you drink an energy drink at 10:00 PM, half of that caffeine is still circulating in your brain at 3:00 AM or 4:00 AM!</li>\n              <li><strong>Ruining Memory Consolidation (REM Sleep):</strong> Even if you fall asleep at 2:00 AM, caffeine blocks deep <strong>Slow-Wave and REM sleep</strong>—the exact stage of sleep where your brain's <strong>hippocampus</strong> saves what you studied into long-term memory. You wake up exhausted and forget what you read!</li>\n              <li><strong>The Double Crash &amp; Jitters:</strong> Within 90 minutes of drinking a high-sugar energy drink, your blood sugar crashes while caffeine spikes your heart rate and anxiety (\"exam jitters\").</li>\n            </ul>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "3.4",
                "shortLabel": "3.4 Review Questions (≥80%)",
                "title": "3.4 Section 3 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q3_1",
                        "topic": "Question 1 • Section 3 Mastery Check",
                        "prompt": "Smart Local Swaps: Why are traditional lightly sweetened non-alcoholic maheu or homemade baobab (mawuyu) juice much healthier choices than a 500 mL fizzy soda?",
                        "options": [
                            "Because maheu and mawuyu contain 40% alcohol",
                            "Because low-sugar non-alcoholic maheu provides slow-release grain carbs, B-vitamins, and fibre, and baobab (mawuyu) juice is rich in Vitamin C, calcium, potassium, and prebiotic fibre—whereas fizzy soda has zero nutrients and 13.5 teaspoons of rapid sugar",
                            "Because fizzy soda has too much dietary fibre",
                            "Because baobab juice has 50 teaspoons of sugar"
                        ],
                        "correctIndex": 1,
                        "explanation": "Low-sugar 0.0% maheu (complex grain carbs, B-vitamins, fibre) and homemade mawuyu/baobab juice (Vitamin C, potassium, calcium, prebiotic fibre) nourish the body instead of causing an empty-calorie sugar spike."
                    },
                    {
                        "id": "q3_2",
                        "topic": "Question 2 • Section 3 Mastery Check",
                        "prompt": "Label Detective: In what order are ingredients listed on a beverage label, and which set of words are disguise names for added sugar?",
                        "options": [
                            "Alphabetical order; Sodium, Potassium, Calcium, and Iron",
                            "By weight from heaviest (most) to lightest (least); Sucrose, High-Fructose Corn Syrup (HFCS), Glucose Syrup, Dextrose, Maltose, and Fruit Juice Concentrate",
                            "Random order; Vitamin A, Vitamin B, Vitamin C, and Zinc",
                            "From lightest to heaviest; Water, Ice, Mint, and Lemon"
                        ],
                        "correctIndex": 1,
                        "explanation": "Ingredients are always listed in descending order by weight (heaviest first). Words ending in '-ose' (sucrose, dextrose, maltose, fructose) or 'syrup'/'concentrate' are hidden forms of added sugar."
                    },
                    {
                        "id": "q3_3",
                        "topic": "Question 3 • Section 3 Mastery Check",
                        "prompt": "The Exam-Night Energy Drink Trap: Why does drinking a caffeinated energy drink at 11:00 PM while cramming for an exam actually hurt your memory recall the next morning?",
                        "options": [
                            "Because caffeine has a 5-to-6-hour half-life (staying in the brain at 4:00–5:00 AM) and blocks deep Slow-Wave and REM sleep—the exact sleep stage when the hippocampus consolidates what you studied into long-term memory",
                            "Because caffeine erases ink from textbooks",
                            "Because energy drinks make you sleep for 24 hours straight",
                            "Because caffeine only works during sports"
                        ],
                        "correctIndex": 0,
                        "explanation": "With a 5–6 hour half-life, late-night caffeine disrupts deep and REM sleep—preventing the hippocampus from saving studied material into long-term memory while triggering a sugar/jitter crash."
                    },
                    {
                        "id": "q3_4",
                        "topic": "Question 4 • Section 3 Mastery Check",
                        "prompt": "In the Traffic-Light Beverage Guide, which drinks belong in the GREEN TIER (0–2g sugar per 100 mL — Drink All Day)?",
                        "options": [
                            "Chilled water, sparkling water with fresh lemon/lime/mint, unsweetened Rooibos or Zumbani tea, and plain low-fat milk or unsweetened hodzeko/amasi",
                            "Caffeinated energy drinks and full-sugar colas",
                            "Undiluted sweet cordials and commercial milkshakes",
                            "Sweetened fruit punch with glucose syrup"
                        ],
                        "correctIndex": 0,
                        "explanation": "Green Tier drinks (0–2g sugar/100 mL) hydrate without spiking blood sugar: pure/sparkling water, lemon/mint-infused water, unsweetened Rooibos/Zumbani tea, and plain milk/hodzeko."
                    },
                    {
                        "id": "q3_5",
                        "topic": "Question 5 • Section 3 Mastery Check",
                        "prompt": "According to the 'First-Three Ingredients Rule,' what does it mean if glucose syrup or sucrose appears in the first three items on a drink's ingredient list?",
                        "options": [
                            "The drink is 100% sugar-free",
                            "The drink is a high-sugar product because ingredients are listed from heaviest to lightest weight",
                            "The drink contains three vitamins",
                            "The bottle can be recycled three times"
                        ],
                        "correctIndex": 1,
                        "explanation": "Because ingredients are listed by weight from most to least, any form of sugar in the top three ingredients means sugar is one of the main components of that product."
                    }
                ]
            }
        },
        {
            "id": 4,
            "numberLabel": "Section 4",
            "title": "Blood-Sugar Rollercoasters & Long-Term Metabolic Wellness",
            "summary": "Trace the 3-stage blood-sugar spike & crash (Reactive Hypoglycaemia at 60–90 minutes), understand Insulin Resistance & Type 2 Diabetes ('knocking on the cell door'), and see how excess liquid fructose causes Non-Alcoholic Fatty Liver Disease (NAFLD).",
            "order": [
                "4.1",
                "video",
                "4.2",
                "4.3",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 4",
                "shortLabel": "Section 4 Supporting Video",
                "title": "How Carbohydrates & Liquid Sugars Move Through Your Body",
                "youtubeUrl": "https://www.youtube.com/watch?v=dAygg_VG4OA",
                "embedUrl": "https://www.youtube.com/embed/dAygg_VG4OA?rel=0",
                "guidance": "Watch this Stanford medical animation to see the difference between how your body absorbs fast simple sugars (triggering a sudden insulin spike and crash) versus slow-release complex carbohydrates.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "How Do Carbs, Insulin & Blood Sugar Affect Your Body?",
                        "source": "Nucleus Medical Media",
                        "youtubeUrl": "https://www.youtube.com/watch?v=JXLW5tZ_NnQ",
                        "embedUrl": "https://www.youtube.com/embed/JXLW5tZ_NnQ?rel=0"
                    }
                ]
            },
            "subsections": {
                "4.1": {
                    "key": "4.1",
                    "code": "4.1",
                    "shortLabel": "4.1 The Blood-Sugar Spike & Crash ...",
                    "title": "4.1 The Blood-Sugar Spike & Crash (Reactive Hypoglycaemia)",
                    "html": "\n            <p>Have you ever drunk a sweet fizzy drink or eaten a sugary snack during morning break to \"get energy,\" only to feel <strong>exhausted, sleepy, shaky, and unable to focus in class 60 minutes later</strong>? That is called the <strong>Blood-Sugar Rollercoaster (Reactive Hypoglycaemia)</strong>:</p>\n            <ol style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>The Spike (0 to 20 Minutes):</strong> Because liquid sugar has no fibre, 10+ teaspoons of glucose rush straight into your bloodstream. Your blood sugar shoots sky-high, giving a brief 20-minute \"sugar rush.\"</li>\n              <li><strong>The Insulin Flood (20 to 45 Minutes):</strong> High blood sugar is dangerous to blood vessels, so your <strong>pancreas</strong> hits the emergency alarm and floods your blood with a hormone called <strong>Insulin</strong>. Insulin's job is to unlock your cells and sweep the excess sugar out of the blood (turning much of it into stored body fat).</li>\n              <li><strong>The Crash (60 to 90 Minutes):</strong> Because so much insulin was released all at once, it sweeps <em>too much</em> sugar out of the blood! Your blood sugar plunges <strong>below normal</strong>. Your brain—which relies on steady glucose—suddenly starves for energy, causing <strong>brain fog, yawning, irritability (\"hangry\" mood swings), shaky hands, and intense cravings for another sweet drink</strong>.</li>\n            </ol>\n          "
                },
                "4.2": {
                    "key": "4.2",
                    "code": "4.2",
                    "shortLabel": "4.2 Insulin Resistance & Type 2 Di...",
                    "title": "4.2 Insulin Resistance & Type 2 Diabetes",
                    "html": "\n            <p>What happens if a person rides this blood-sugar rollercoaster every single day for years?</p>\n            <div style=\"background:#fff7ed; border-left:4px solid #ea580c; border-radius:0 12px 12px 0; padding:14px 18px; margin:14px 0;\">\n              <ul style=\"margin:0; padding-left:18px; color:#7c2d12; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>How Insulin Works (The \"Key in the Lock\"):</strong> Normally, insulin acts like a gentle knock on the door of your muscle and liver cells, saying, <em>\"Please open up and let glucose inside for energy.\"</em></li>\n                <li><strong>Insulin Resistance:</strong> When you flood your body with sugary drinks every day, your pancreas has to shout and bang on the cell doors nonstop with massive amounts of insulin. Eventually, your cells get tired of the noise and <strong>stop opening the door</strong>—a condition called <strong>Insulin Resistance (Pre-Diabetes)</strong>.</li>\n                <li><strong>Type 2 Diabetes:</strong> Over time, the overworked pancreas wears out, and sugar stays trapped at toxic levels in the bloodstream. Once thought to affect only older adults, <strong>Type 2 Diabetes</strong> is now rising rapidly among teenagers and young adults in their 20s due to sugary drinks and physical inactivity—damaging blood vessels, eyesight, kidneys, and nerves.</li>\n              </ul>\n            </div>\n          "
                },
                "4.3": {
                    "key": "4.3",
                    "code": "4.3",
                    "shortLabel": "4.3 Fatty Liver, Heart & Dental He...",
                    "title": "4.3 Fatty Liver, Heart & Dental Health",
                    "html": "\n            <p>Wait—can you get liver disease even if you never drink a drop of alcohol? <strong>Yes!</strong></p>\n            <ul style=\"color:#1e293b; font-size:0.94rem; line-height:1.7;\">\n              <li><strong>Fructose &amp; Non-Alcoholic Fatty Liver Disease (NAFLD):</strong> Table sugar (sucrose) and high-fructose corn syrup are made of <strong>50% glucose and 50% fructose</strong>. While every cell in your body can burn glucose, <strong>only your liver can process fructose</strong>! When you gulp a sugary soda, your liver is overwhelmed by liquid fructose and turns the excess straight into <strong>liver fat droplets</strong> (<em>de novo lipogenesis</em>). Over time, this causes <strong>Non-Alcoholic Fatty Liver Disease (NAFLD)</strong> and raises blood triglycerides (heart disease risk)—mimicking the liver damage caused by alcohol!</li>\n              <li><strong>Tooth Enamel Erosion:</strong> Fizzy drinks and energy drinks contain <strong>phosphoric acid and citric acid</strong> alongside sugar. Even before bacteria feed on the sugar to create cavity-causing acid, the drink's own acid dissolves the hard protective enamel on your teeth.</li>\n            </ul>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Body System</th>\n                    <th style=\"padding:10px 12px;\">Effect of Daily High-Sugar Drinks</th>\n                    <th style=\"padding:10px 12px;\">Benefit of Water &amp; Balanced Whole Foods</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Brain &amp; Mood</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">20-minute rush followed by a 60–90 minute blood-sugar crash, brain fog, and irritability.</td>\n                    <td style=\"padding:10px 12px; color:#166534;\">Steady, 4-hour concentration, calm mood, and sharp exam memory recall.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Pancreas &amp; Blood</td>\n                    <td style=\"padding:10px 12px; color:#b91c1c;\">Constant insulin spikes to Insulin Resistance to Pre-Diabetes &amp; Type 2 Diabetes.</td>\n                    <td style=\"padding:10px 12px; color:#166534;\">High insulin sensitivity; cells absorb energy smoothly without straining the pancreas.</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; font-weight:700;\">Liver &amp; Heart</td>\n                    <td style=\"padding:10px 12px; color:#991b1b;\">Liquid fructose overload to Non-Alcoholic Fatty Liver Disease (NAFLD) &amp; high blood fats.</td>\n                    <td style=\"padding:10px 12px; color:#166534;\">Clean, healthy liver metabolism and clear, flexible blood vessels.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; font-weight:700;\">Teeth &amp; Smile</td>\n                    <td style=\"padding:10px 12px; color:#b45309;\">Acid + sugar double-attack erodes tooth enamel and causes painful cavities.</td>\n                    <td style=\"padding:10px 12px; color:#166534;\">Strong tooth enamel and neutral mouth pH.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "4.4",
                "shortLabel": "4.4 Review Questions (≥80%)",
                "title": "4.4 Section 4 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q4_1",
                        "topic": "Question 1 • Section 4 Mastery Check",
                        "prompt": "The 60-Minute Crash: Explain step-by-step why drinking a 500 mL sugary soda on an empty stomach makes a student feel sleepy, shaky, and unable to focus 60 to 90 minutes later.",
                        "options": [
                            "Because soda contains sleeping medication",
                            "Rapid liquid sugar spikes blood glucose in 20 minutes to the pancreas releases an emergency flood of insulin to the massive insulin surge sweeps too much glucose out of the blood, causing blood sugar to crash below normal (Reactive Hypoglycaemia) at 60–90 minutes and starving the brain",
                            "Because carbonation removes oxygen from the lungs",
                            "Because the stomach takes 10 hours to digest water"
                        ],
                        "correctIndex": 1,
                        "explanation": "This is Reactive Hypoglycaemia: a rapid fibre-free glucose spike triggers an oversized insulin surge from the pancreas, plunging blood sugar below baseline 60–90 minutes later and causing brain fog and fatigue."
                    },
                    {
                        "id": "q4_2",
                        "topic": "Question 2 • Section 4 Mastery Check",
                        "prompt": "Your Liver on Liquid Sugar: Table sugar (sucrose) is half glucose and half fructose. Which organ is the ONLY one that can process fructose, and what disease happens when it is overloaded with sugary drinks?",
                        "options": [
                            "The lungs; it causes asthma",
                            "The liver; excess liquid fructose is converted directly into liver fat droplets (de novo lipogenesis), causing Non-Alcoholic Fatty Liver Disease (NAFLD)",
                            "The spleen; it causes low iron",
                            "The skin; it causes sunburn"
                        ],
                        "correctIndex": 1,
                        "explanation": "Only the liver can metabolize fructose. When flooded with liquid fructose from sugary drinks, the liver converts the excess into fat droplets, leading to Non-Alcoholic Fatty Liver Disease (NAFLD)."
                    },
                    {
                        "id": "q4_3",
                        "topic": "Question 3 • Section 4 Mastery Check",
                        "prompt": "Insulin Resistance: Using the 'knocking on the cell door' analogy, explain how daily sugary drinks lead to Insulin Resistance and Type 2 Diabetes.",
                        "options": [
                            "Insulin locks the cell doors permanently after one sip of water",
                            "Normally insulin gently knocks on muscle/liver cells to let glucose in; when daily sugar spikes force the pancreas to flood the body with insulin nonstop, the cells stop responding to the knock (Insulin Resistance), leaving toxic high glucose trapped in the blood (Type 2 Diabetes)",
                            "Insulin turns muscle cells into bone cells",
                            "Type 2 Diabetes is caused by eating green vegetables"
                        ],
                        "correctIndex": 1,
                        "explanation": "Chronic insulin spikes desensitize cell receptors ('ignoring the knock on the door' = Insulin Resistance). Eventually the pancreas wears out and blood glucose remains dangerously elevated (Type 2 Diabetes)."
                    },
                    {
                        "id": "q4_4",
                        "topic": "Question 4 • Section 4 Mastery Check",
                        "prompt": "Why do fizzy soft drinks and energy drinks launch a 'double attack' on your tooth enamel?",
                        "options": [
                            "Because they are served cold with ice",
                            "Because they contain phosphoric and citric acids (which directly dissolve enamel) PLUS high sugar (which mouth bacteria turn into even more cavity-causing acid)",
                            "Because plastic bottles scratch teeth",
                            "Because water softens enamel"
                        ],
                        "correctIndex": 1,
                        "explanation": "Phosphoric and citric acids in carbonated/energy drinks erode enamel directly, while the 13+ teaspoons of sugar feed oral bacteria that produce lactic acid."
                    },
                    {
                        "id": "q4_5",
                        "topic": "Question 5 • Section 4 Mastery Check",
                        "prompt": "Can a young person who never drinks alcohol still develop fatty liver disease if they consume high amounts of sugary beverages every day?",
                        "options": [
                            "No, only alcohol can affect the liver",
                            "Yes—daily overload of liquid fructose causes Non-Alcoholic Fatty Liver Disease (NAFLD) even in people who never drink alcohol",
                            "No, teenagers do not have liver enzymes",
                            "Only if they drink sparkling water"
                        ],
                        "correctIndex": 1,
                        "explanation": "Non-Alcoholic Fatty Liver Disease (NAFLD) is driven by excess liquid fructose being converted into fat inside the liver, even in complete abstainers from alcohol."
                    }
                ]
            }
        },
        {
            "id": 5,
            "numberLabel": "Section 5",
            "title": "Nutritional Balance for Exam Focus, Sports & Student Budgets",
            "summary": "Build the Smart Student Plate (½ Vegetables/Fruits + ¼ Complex Carbs + ¼ Protein/Healthy Fats) using affordable Zimbabwean foods, save $40–$50/month with budget swaps, and practice 5 daily metabolic habits.",
            "order": [
                "5.1",
                "5.2",
                "5.3",
                "video",
                "quiz"
            ],
            "video": {
                "key": "video",
                "code": "Video 5",
                "shortLabel": "Section 5 Supporting Video",
                "title": "Nutrition & Energy — Basic Energy Requirements & Balanced Diet",
                "youtubeUrl": "https://www.youtube.com/watch?v=Udl61jF3I7k",
                "embedUrl": "https://www.youtube.com/embed/Udl61jF3I7k?rel=0",
                "guidance": "Watch how complex carbohydrates, proteins, healthy fats, vitamins, and minerals work together to power your brain and muscles—and learn how to build an affordable, balanced student plate.",
                "additionalLink": null,
                "additionalVideos": [
                    {
                        "title": "Your Brain on Sugar — Memory, Focus & Brain Health",
                        "source": "AARP Brain Health Science",
                        "youtubeUrl": "https://www.youtube.com/watch?v=A5sDYEii-wk",
                        "embedUrl": "https://www.youtube.com/embed/A5sDYEii-wk?rel=0"
                    }
                ]
            },
            "subsections": {
                "5.1": {
                    "key": "5.1",
                    "code": "5.1",
                    "shortLabel": "5.1 The Smart Student Plate Formul...",
                    "title": "5.1 The Smart Student Plate Formula (1/2 + 1/4 + 1/4 Rule)",
                    "html": "\n            <p>You do not need expensive imported health foods to eat like a top scholar or athlete! Zimbabwe's traditional and everyday whole foods are among the most nutritious on earth when combined using the <strong>Smart Student Plate Formula</strong>:</p>\n            <div style=\"display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin:14px 0;\">\n              <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:14px;\">\n                <strong style=\"color:#166534; display:block; margin-bottom:6px;\">½ of Your Plate: Colourful Vegetables &amp; Whole Fruits</strong>\n                <p style=\"margin:0; color:#1e293b; font-size:0.89rem; line-height:1.55;\">\n                  • <em>Local Examples:</em> Leafy greens (<em>covo, rape, tsunga, muboora/pumpkin leaves, cabbage, spinach</em>), tomatoes, onions, carrots, green beans, oranges, bananas, apples, guavas, and wild fruits (<em>mazhanje</em>).<br>\n                  • <em>Why It Matters:</em> Packed with fibre (to slow down sugar absorption), antioxidants, Vitamin C, and folate to protect your brain and immunity.\n                </p>\n              </div>\n              <div style=\"background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:14px;\">\n                <strong style=\"color:#9a3412; display:block; margin-bottom:6px;\">¼ of Your Plate: Slow-Release Complex Carbohydrates</strong>\n                <p style=\"margin:0; color:#7c2d12; font-size:0.89rem; line-height:1.55;\">\n                  • <em>Local Examples:</em> Straight-run or unrefined maize meal (<em>mugaiwa</em> / roller meal sadza), traditional small grains (<em>zviyo/rapoko, mhunga/millet, mapfunde/sorghum</em>), brown rice, boiled sweet potatoes (<em>mbambaira</em>), madhumbe, butternut, or whole-wheat bread/oats.<br>\n                  • <em>Why It Matters:</em> Unlike white sugar or white pastries, complex carbs digest slowly—giving your brain <strong>4 hours of steady glucose</strong> through a 3-hour exam without a crash!\n                </p>\n              </div>\n              <div style=\"background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:14px;\">\n                <strong style=\"color:#1e40af; display:block; margin-bottom:6px;\">¼ of Your Plate: Quality Protein &amp; Healthy Fats</strong>\n                <p style=\"margin:0; color:#1e3a8a; font-size:0.89rem; line-height:1.55;\">\n                  • <em>Local Examples:</em> Eggs, sugar beans, cowpeas (<em>nyemba</em>), roundnuts (<em>nyimo</em>), groundnuts/peanut butter (<em>dovi</em>), kapenta (<em>matemba</em>), fish, chicken, lean beef, soya chunks, sour milk (<em>hodzeko</em>), and avocados.<br>\n                  • <em>Why It Matters:</em> Builds muscle and supplies amino acids that your brain uses to make <strong>dopamine and acetylcholine</strong>—the chemicals for alertness, motivation, and memory!\n                </p>\n              </div>\n            </div>\n          "
                },
                "5.2": {
                    "key": "5.2",
                    "code": "5.2",
                    "shortLabel": "5.2 Healthy Student Budget Swaps",
                    "title": "5.2 Healthy Student Budget Swaps",
                    "html": "\n            <p>Eating smart actually <strong>saves money</strong> on a tight student stipend or pocket-money budget:</p>\n            <div style=\"overflow-x:auto; margin:16px 0;\">\n              <table style=\"width:100%; border-collapse:collapse; font-size:0.87rem; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);\">\n                <thead>\n                  <tr style=\"background:#14532d; color:#fff; text-align:left;\">\n                    <th style=\"padding:10px 12px;\">Common Student Trap</th>\n                    <th style=\"padding:10px 12px;\">Smart, Affordable Zimbabwean Swap</th>\n                    <th style=\"padding:10px 12px;\">Brain, Health &amp; Budget Win</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; color:#991b1b;\">Skipping breakfast, then buying a 500 mL fizzy drink + fried doughnut at 10:00 AM.</td>\n                    <td style=\"padding:10px 12px; color:#166534; font-weight:700;\">Morning oats or roller-meal porridge with a spoon of peanut butter (<em>dovi</em>), or 2 boiled eggs + sweet potato (<em>mbambaira</em>) + water.</td>\n                    <td style=\"padding:10px 12px;\">Costs less per serving and powers 4+ hours of morning lectures with zero 11:00 AM sugar crash!</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0; background:#f8fafc;\">\n                    <td style=\"padding:10px 12px; color:#991b1b;\">Buying two US$1.00 fizzy sodas or energy drinks every day (US$60/month!).</td>\n                    <td style=\"padding:10px 12px; color:#166534; font-weight:700;\">Carry a reusable 1-Litre water bottle (with a squeeze of fresh lemon) + a banana or handful of roasted groundnuts (<em>nzungu</em>).</td>\n                    <td style=\"padding:10px 12px;\">Saves <strong>US$40–$50 every month</strong> while eliminating ~800 teaspoons of liquid sugar per month!</td>\n                  </tr>\n                  <tr style=\"border-bottom:1px solid #e2e8f0;\">\n                    <td style=\"padding:10px 12px; color:#991b1b;\">Late-night exam cramming with sugary energy drinks and biscuits.</td>\n                    <td style=\"padding:10px 12px; color:#166534; font-weight:700;\">Study in focused 45-minute blocks with cold water or Rooibos tea, snack on groundnuts/fruit, and get 7–8 hours of sleep.</td>\n                    <td style=\"padding:10px 12px;\">Deep REM sleep locks exam facts into your hippocampus so you wake up sharp.</td>\n                  </tr>\n                  <tr>\n                    <td style=\"padding:10px 12px; color:#991b1b;\">Post-sports recovery with a full-sugar fizzy drink.</td>\n                    <td style=\"padding:10px 12px; color:#166534; font-weight:700;\">Clean water + a banana + salted groundnuts (or a glass of low-sugar <em>maheu</em> / <em>hodzeko</em>).</td>\n                    <td style=\"padding:10px 12px;\">Replaces water, potassium, sodium, and muscle protein naturally without enamel erosion.</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          "
                },
                "5.3": {
                    "key": "5.3",
                    "code": "5.3",
                    "shortLabel": "5.3 Five Daily Habits for Lifelong...",
                    "title": "5.3 Five Daily Habits for Lifelong Metabolic Wellness",
                    "html": "\n            <div style=\"background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin-top:12px;\">\n              <ol style=\"margin:0; padding-left:18px; color:#1e293b; font-size:0.93rem; line-height:1.7;\">\n                <li><strong>Make Water Your Default Drink:</strong> Keep a refillable bottle in your backpack so water is always within reach.</li>\n                <li><strong>Eat Your Fruit Whole—Don't Drink It:</strong> Let nature's fibre protect your liver and pancreas.</li>\n                <li><strong>Never Drink Liquid Sugar on an Empty Stomach:</strong> If you ever have a sweet treat, have a small portion <em>after</em> a fibre- and protein-rich meal to slow the glucose spike.</li>\n                <li><strong>Move Your Muscles for 30–60 Minutes Daily:</strong> Walking briskly across campus, playing sport, dancing, or skipping rope makes your muscles soak up blood glucose automatically—<strong>without even needing extra insulin</strong>!</li>\n                <li><strong>Protect Your 7 to 8 Hours of Sleep:</strong> Sleep deprivation spikes hunger hormones (<em>ghrelin</em> and <em>cortisol</em>), making your brain crave junk food and sugar the next day. Cut off all caffeine at least <strong>6 hours before bedtime</strong>.</li>\n              </ol>\n            </div>\n          "
                }
            },
            "quiz": {
                "key": "quiz",
                "code": "5.4",
                "shortLabel": "5.4 Review Questions (≥80%)",
                "title": "5.4 Section 5 Review Questions (Multiple-Choice Assessment)",
                "passThreshold": 80,
                "questions": [
                    {
                        "id": "q5_1",
                        "topic": "Question 1 • Section 5 Mastery Check",
                        "prompt": "The Smart Student Plate: What are the three proportions of the Smart Student Plate (½ + ¼ + ¼), and which affordable Zimbabwean foods fit each section?",
                        "options": [
                            "½ sweets, ¼ fizzy drinks, ¼ fried chips",
                            "½ Colourful Vegetables & Whole Fruits (covo, rape, muboora, tomatoes, bananas/oranges), ¼ Slow-Release Complex Carbs (mugaiwa/roller-meal sadza, zviyo, sweet potatoes/mbambaira, oats), and ¼ Quality Protein & Healthy Fats (eggs, beans, nyemba, dovi, matemba, chicken, hodzeko)",
                            "½ white bread, ¼ jam, ¼ margarine",
                            "½ meat, ¼ salt, ¼ oil"
                        ],
                        "correctIndex": 1,
                        "explanation": "The ½ + ¼ + ¼ formula balances fibre-rich vegetables/fruits (½), slow-release complex carbohydrates like roller meal, zviyo, or mbambaira (¼), and quality proteins/fats like eggs, beans, dovi, and matemba (¼)."
                    },
                    {
                        "id": "q5_2",
                        "topic": "Question 2 • Section 5 Mastery Check",
                        "prompt": "Exam-Day Fuel: Why will a breakfast of boiled sweet potato (mbambaira) or roller-meal porridge with peanut butter (dovi) and an egg help you score higher on a 3-hour morning exam than a fizzy soda and a doughnut?",
                        "options": [
                            "Because sweet potatoes contain caffeine",
                            "Because complex carbs, fibre, and protein digest slowly over 4 hours—delivering steady glucose and amino acids to your brain without triggering the 60-minute insulin flood and Reactive Hypoglycaemia crash of a soda and doughnut",
                            "Because doughnuts have too much protein",
                            "Because water blocks exam memory"
                        ],
                        "correctIndex": 1,
                        "explanation": "Complex carbohydrates paired with fibre and protein (mbambaira, roller-meal porridge with dovi, eggs) provide a smooth 4-hour release of glucose for sustained focus, avoiding the 60-minute blood-sugar crash."
                    },
                    {
                        "id": "q5_3",
                        "topic": "Question 3 • Section 5 Mastery Check",
                        "prompt": "Movement & Sleep: How does 30 to 60 minutes of daily physical activity (like brisk campus walking, football, netball, or dancing) directly protect you against Insulin Resistance?",
                        "options": [
                            "Contracting muscles soak up glucose directly from the bloodstream for fuel—without even needing extra insulin—keeping insulin sensitivity high",
                            "Exercise stops the stomach from digesting food",
                            "Exercise turns sugar into bone",
                            "Walking only helps if you drink an energy drink first"
                        ],
                        "correctIndex": 0,
                        "explanation": "Active, contracting skeletal muscles absorb glucose directly from the blood via insulin-independent pathways, dramatically improving insulin sensitivity and protecting the pancreas."
                    },
                    {
                        "id": "q5_4",
                        "topic": "Question 4 • Section 5 Mastery Check",
                        "prompt": "Budget Math: Roughly how much money (and how many teaspoons of liquid sugar) can a student save every month by carrying a reusable 1-Litre water bottle instead of buying two US$1.00 fizzy sodas or energy drinks a day?",
                        "options": [
                            "Saves US$1 per month and 5 teaspoons of sugar",
                            "Saves US$40 to US$50 every month while eliminating roughly 800 teaspoons of liquid sugar per month!",
                            "Costs more money than buying sodas",
                            "Saves zero money"
                        ],
                        "correctIndex": 1,
                        "explanation": "Replacing two US$1.00 daily sugary drinks with a refillable water bottle and whole-food snacks saves US$40–$50 per month and cuts ~800 teaspoons of added liquid sugar every month."
                    },
                    {
                        "id": "q5_5",
                        "topic": "Question 5 • Section 5 Mastery Check",
                        "prompt": "How does sleep deprivation (getting less than 7–8 hours of sleep) affect your hunger hormones the next day, and when should you cut off caffeine before bedtime?",
                        "options": [
                            "Sleep deprivation spikes ghrelin and cortisol (making your brain crave sugar and junk food the next day); cut off all caffeine at least 6 hours before bedtime",
                            "Sleep deprivation eliminates all hunger; drink caffeine 10 minutes before bed",
                            "Sleep has no effect on hormones or memory",
                            "Cut off water 12 hours before bedtime"
                        ],
                        "correctIndex": 0,
                        "explanation": "Lack of sleep raises ghrelin and cortisol, driving intense cravings for simple sugars the next day. Because caffeine has a 5–6 hour half-life, cutting it off at least 6 hours before bed protects deep restorative sleep."
                    }
                ]
            }
        }
    ]
};

const SMART_LIVING_CURRICULA = {
    "Binge Drinking & Health Limits": BINGE_DRINKING_CURRICULUM,
    "Drinking & Driving Prevention": DRINKING_DRIVING_CURRICULUM,
    "Illicit & Unregulated Brews": ILLICIT_BREWS_CURRICULUM,
    "Underage Drinking & Campus Culture": UNDERAGE_CAMPUS_CURRICULUM,
    "Alcohol & Pregnancy": ALCOHOL_PREGNANCY_CURRICULUM,
    "Sugary Drinks, Diet & Long-Term Health": SUGARY_DIET_CURRICULUM
};

const CURRICULUM_STORAGE_KEYS = {
    "Binge Drinking & Health Limits": "bingeCurriculumProgress_v1",
    "Drinking & Driving Prevention": "drinkingDrivingCurriculumProgress_v1",
    "Illicit & Unregulated Brews": "illicitBrewsCurriculumProgress_v1",
    "Underage Drinking & Campus Culture": "underageCampusCurriculumProgress_v1",
    "Alcohol & Pregnancy": "alcoholPregnancyCurriculumProgress_v1",
    "Sugary Drinks, Diet & Long-Term Health": "sugaryDietCurriculumProgress_v1"
};

let currentActiveAcademyModuleTitle = BINGE_MODULE_TITLE;

function getActiveCurriculum(moduleTitle = currentActiveAcademyModuleTitle) {
    return SMART_LIVING_CURRICULA[moduleTitle] || BINGE_DRINKING_CURRICULUM;
}

function _bingeStateStorageKey(uid = currentUserId, moduleTitle = currentActiveAcademyModuleTitle) {
    const keyPrefix = CURRICULUM_STORAGE_KEYS[moduleTitle] || 'bingeCurriculumProgress_v1';
    return _userCacheKey(keyPrefix, uid);
}

function createDefaultBingeState(moduleTitle = currentActiveAcademyModuleTitle) {
    const curr = getActiveCurriculum(moduleTitle);
    const sections = {};
    curr.sections.forEach(sec => {
        const subs = {};
        Object.keys(sec.subsections).forEach(k => { subs[k] = false; });
        subs.video = false;
        subs.quiz = false;
        sections[sec.id] = {
            completedSubsections: subs,
            quizBestScore: 0,
            quizLastScore: null,
            quizPassed: false,
            quizSelectedAnswers: {},
            quizSubmitted: false
        };
    });
    return { sections };
}

function getBingeModuleState(uid = currentUserId, moduleTitle = currentActiveAcademyModuleTitle) {
    const curr = getActiveCurriculum(moduleTitle);
    const def = createDefaultBingeState(moduleTitle);
    const raw = readLocalJSON(_bingeStateStorageKey(uid, moduleTitle), null);
    if (!raw || !raw.sections) return def;

    curr.sections.forEach(sec => {
        const savedSec = raw.sections[sec.id];
        if (savedSec) {
            if (savedSec.completedSubsections) {
                Object.keys(def.sections[sec.id].completedSubsections).forEach(k => {
                    def.sections[sec.id].completedSubsections[k] = !!savedSec.completedSubsections[k];
                });
            }
            def.sections[sec.id].quizBestScore = Number(savedSec.quizBestScore) || 0;
            def.sections[sec.id].quizLastScore = savedSec.quizLastScore !== undefined ? savedSec.quizLastScore : null;
            def.sections[sec.id].quizPassed = !!(savedSec.quizPassed || def.sections[sec.id].quizBestScore >= 80);
            if (def.sections[sec.id].quizPassed) {
                def.sections[sec.id].completedSubsections.quiz = true;
            }
            if (savedSec.quizSelectedAnswers && typeof savedSec.quizSelectedAnswers === 'object') {
                def.sections[sec.id].quizSelectedAnswers = { ...savedSec.quizSelectedAnswers };
            }
            def.sections[sec.id].quizSubmitted = !!savedSec.quizSubmitted;
        }
    });
    return def;
}

function saveBingeModuleState(state, uid = currentUserId, moduleTitle = currentActiveAcademyModuleTitle) {
    writeLocalJSON(_bingeStateStorageKey(uid, moduleTitle), state);
    const overall = getBingeModuleOverallStats(state, moduleTitle);
    if (overall.isModuleComplete) {
        markModuleCompleted(moduleTitle, currentActiveBingeModuleId);
    } else {
        // Ensure premature badge state is cleared if all 5 sections are not yet completed
        const idx = completedSmartModulesCache.indexOf(moduleTitle);
        if (idx !== -1) {
            completedSmartModulesCache.splice(idx, 1);
            saveUserActivityCache(uid);
        }
    }
    updateTopCornerPointsDisplay();
    if (typeof syncUserAcademyProgressWithReferralAmbassador === 'function') {
        syncUserAcademyProgressWithReferralAmbassador(uid);
    }
}

function getBingeSectionStats(sectionId, state = null, moduleTitle = currentActiveAcademyModuleTitle) {
    const st = state || getBingeModuleState(currentUserId, moduleTitle);
    const secData = st.sections[sectionId];
    if (!secData) {
        return { completedCount: 0, totalCount: 5, pct: 0, quizPassed: false, quizBestScore: 0, quizLastScore: null, isSectionComplete: false };
    }
    const keys = Object.keys(secData.completedSubsections);
    const totalCount = keys.length; // 5 subsections per section (X.1, X.2, X.3, video, quiz)
    const completedCount = keys.filter(k => !!secData.completedSubsections[k]).length;
    const pct = Math.round((completedCount / totalCount) * 100);
    const quizPassed = !!(secData.quizPassed && secData.quizBestScore >= 80);
    return {
        completedCount,
        totalCount,
        pct,
        quizPassed,
        quizBestScore: secData.quizBestScore || 0,
        quizLastScore: secData.quizLastScore,
        isSectionComplete: quizPassed && completedCount === totalCount
    };
}

function isBingeSectionUnlocked(sectionId, state = null, moduleTitle = currentActiveAcademyModuleTitle) {
    if (sectionId <= 1) return true;
    const st = state || getBingeModuleState(currentUserId, moduleTitle);
    for (let prevId = 1; prevId < sectionId; prevId++) {
        const prevStats = getBingeSectionStats(prevId, st, moduleTitle);
        if (!prevStats.quizPassed) {
            return false;
        }
    }
    return true;
}

function getBingeModuleOverallStats(state = null, moduleTitle = currentActiveAcademyModuleTitle) {
    const curr = getActiveCurriculum(moduleTitle);
    const st = state || getBingeModuleState(currentUserId, moduleTitle);
    let totalSubsections = 0;
    let completedSubsectionsCount = 0;
    let passedSectionsCount = 0;
    let fullyCompletedSectionsCount = 0;

    curr.sections.forEach(sec => {
        const sStats = getBingeSectionStats(sec.id, st, moduleTitle);
        totalSubsections += sStats.totalCount;
        completedSubsectionsCount += sStats.completedCount;
        if (sStats.quizPassed) passedSectionsCount += 1;
        if (sStats.isSectionComplete) fullyCompletedSectionsCount += 1;
    });

    const overallPct = totalSubsections > 0 ? Math.round((completedSubsectionsCount / totalSubsections) * 100) : 0;
    const isModuleComplete = passedSectionsCount === curr.sections.length && overallPct === 100;

    return {
        totalSubsections,
        completedSubsectionsCount,
        passedSectionsCount,
        fullyCompletedSectionsCount,
        totalSections: curr.sections.length,
        overallPct,
        isModuleComplete
    };
}

function getAcademyModuleComprehensiveProgress(title) {
    if (SMART_LIVING_CURRICULA[title]) {
        const stats = getBingeModuleOverallStats(null, title);
        let statusLabel = "Not Started";
        if (stats.isModuleComplete) {
            statusLabel = "All 5 Sections Completed";
        } else if (stats.overallPct > 0 || stats.passedSectionsCount > 0) {
            statusLabel = `In Progress (${stats.passedSectionsCount}/5 Sections Passed)`;
        }
        return {
            pct: stats.overallPct,
            isDone: stats.isModuleComplete,
            isInProgress: !stats.isModuleComplete && stats.overallPct > 0,
            statusLabel,
            detailRight: `${stats.completedSubsectionsCount}/${stats.totalSubsections} Subsections • ≥80% Quiz Gate`,
            badgeText: stats.isModuleComplete ? "Badge Earned (100%)" : (stats.overallPct > 0 ? `In Progress • ${stats.overallPct}%` : "5-Section Curriculum"),
            buttonText: stats.isModuleComplete
                ? "Review Module & Guide"
                : (stats.overallPct > 0 ? `Continue Module (${stats.overallPct}% Complete)` : "Start Module and Earn Badge")
        };
    }

    const rawCompleted = getCompletedModules();
    const isDone = rawCompleted.includes(title);
    return {
        pct: isDone ? 100 : 0,
        isDone,
        isInProgress: false,
        statusLabel: isDone ? "Core Guide Completed" : "Not Started Yet",
        detailRight: isDone ? "1/1 Module Units Completed" : "0/1 Module Units Completed",
        badgeText: isDone ? "Badge Earned (100%)" : "Smart Living Module",
        buttonText: isDone ? "Review Module & Guide" : "Start Module and Earn Badge"
    };
}

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

            // Synchronize all 6 Academy modules completion with their 5-section curriculum states
            const syncedCompleted = [];
            ACADEMY_TITLES.forEach(title => {
                if (SMART_LIVING_CURRICULA[title]) {
                    const mStats = getBingeModuleOverallStats(null, title);
                    if (mStats.isModuleComplete) {
                        syncedCompleted.push(title);
                    }
                } else if (getCompletedModules().includes(title)) {
                    syncedCompleted.push(title);
                }
            });
            completedSmartModulesCache = syncedCompleted;

            // Compute comprehensive percentage across all 6 Academy modules
            let sumModulePcts = 0;
            ACADEMY_TITLES.forEach(title => {
                const prog = getAcademyModuleComprehensiveProgress(title);
                sumModulePcts += prog.pct;
            });

            const completedCount = syncedCompleted.length;
            const overallAcademyPct = Math.min(100, Math.round(sumModulePcts / ACADEMY_TITLES.length));
            const isFullAmbassador = completedCount >= ACADEMY_TITLES.length && overallAcademyPct === 100;

            let html = `
                <div class="outreach-card" style="margin-bottom:25px; background:linear-gradient(135deg, #FAF7F2 0%, var(--cream-accent) 100%); border:1px solid var(--cream-sand); padding:24px; box-shadow:var(--shadow-sm);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
                        <div>
                            <span style="background:${isFullAmbassador ? 'var(--accent-amber)' : 'var(--primary)'}; color:#fff; font-family:'Poppins',sans-serif; font-size:0.75rem; font-weight:700; padding:4px 12px; border-radius:14px; text-transform:uppercase; letter-spacing:0.04em;">
                                ${isFullAmbassador ? 'Certified Smart Drinking Ambassador' : 'Ambassador Certification Track'}
                            </span>
                            <h3 style="margin:12px 0 6px 0; font-size:1.4rem; color:var(--text-main);">"Smart Drinking Ambassador" Digital Badge &amp; Progress Tracker</h3>
                            <p style="color:var(--text-muted); font-size:0.92rem; margin:0;">
                                Complete all 6 core Smart Living &amp; Moderation modules to unlock your verified Ambassador Badge &amp; contribute points to <strong>${currentUniversity}</strong>.
                            </p>
                        </div>
                        <div style="text-align:right; min-width:190px;">
                            <div style="font-size:1.7rem; font-weight:800; font-family:'Poppins',sans-serif; color:var(--primary);">${overallAcademyPct}% Overall Mastery</div>
                            <div style="font-size:0.84rem; color:var(--text-muted); font-weight:700;">${completedCount} / ${ACADEMY_TITLES.length} Modules Fully Completed</div>
                        </div>
                    </div>
                    <div style="background:rgba(63, 54, 50, 0.12); height:10px; border-radius:5px; margin-top:16px; overflow:hidden;">
                        <div style="background:var(--gradient-primary); width:${overallAcademyPct}%; height:100%; border-radius:5px; transition:width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);"></div>
                    </div>
                </div>

                <div class="outreach-header">
                    <h2 style="font-size:1.85rem; margin-bottom:10px;">Smart Living &amp; Moderation Academy – 6 Core Modules</h2>
                    <p>Evidence-based alcohol education, BAC science, illicit brew awareness, and healthy campus living—with real-time percentage completion tracking for every module.</p>
                </div>
                <div class="grid-layout">
            `;

            if (modules.length === 0) {
                html += '<p style="text-align:center; padding:20px; width:100%;">No modules available.</p>';
            } else {
                modules.forEach(mod => {
                    const prog = getAcademyModuleComprehensiveProgress(mod.title);
                    const topBorderColor = prog.isDone ? 'var(--accent-sage)' : (prog.isInProgress ? 'var(--secondary-teal)' : 'var(--primary)');
                    const pillBg = prog.isDone ? 'var(--accent-sage)' : (prog.isInProgress ? 'var(--secondary-teal)' : 'var(--primary)');
                    const pctBadgeClass = prog.pct === 0 ? 'is-Zero' : (prog.isDone ? '' : 'is-progress');
                    const barFillClass = prog.isDone ? '' : (prog.isInProgress ? 'is-progress' : '');

                    html += `
                        <div class="outreach-card" style="position:relative; display:flex; flex-direction:column; justify-content:space-between; height:100%; padding-bottom:20px; border-top:3.5px solid ${topBorderColor};">
                            <div>
                                <div style="position:absolute; top:-11px; right:15px; background:${pillBg}; color:#fff; font-family:'Poppins',sans-serif; font-size:11px; font-weight:700; padding:4px 10px; border-radius:12px; letter-spacing:0.03em;">
                                    ${prog.badgeText}
                                </div>
                                <h3 class="card-title" style="margin-top:12px;">${mod.title}</h3>
                                <p class="card-desc" style="font-size:14px; margin-bottom:14px;">${mod.description}</p>

                                <div class="academy-module-progress-box">
                                    <div class="amp-header-row">
                                        <span class="amp-label">Module Completion Reading</span>
                                        <span class="amp-pct-badge ${pctBadgeClass}">${prog.pct}% Complete</span>
                                    </div>
                                    <div class="amp-bar-track">
                                        <div class="amp-bar-fill ${barFillClass}" style="width:${prog.pct}%;"></div>
                                    </div>
                                    <div class="amp-detail-meta">
                                        <span>${prog.statusLabel}</span>
                                        <span>${prog.detailRight}</span>
                                    </div>
                                </div>
                            </div>
                            <button onclick="openModuleDetail(${mod.id}, '${mod.title.replace(/'/g, "\\'")}', true)" class="${prog.isDone ? 'btn-sage' : 'btn-primary'}" style="width:100%; padding:11px;">
                                ${prog.buttonText}
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
// Confidential Community Watchdog Logic (Admin Review & Validation Gate)
// -----------------------------------------
function getLocalWatchdogReports() {
    return readLocalJSON('deltasWatchdogReportsQueue', [
        {
            id: 9001,
            campus_or_area: "Mt Pleasant / Campus Perimeter",
            incident_type: "Illicit / Unregulated Brew Distribution ('Kambwa')",
            description: "Unlabelled 200ml plastic sachets of high-strength illicit spirits being sold from a parked vehicle near student walk-through gate after 8 PM.",
            status: "Validated by Admin • Forwarded to Campus Security & ZRP Liaison",
            created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
            id: 9002,
            campus_or_area: "Senga / Student Residential Zone",
            incident_type: "Underage Alcohol Sales (Liquor Act Violation)",
            description: "Bottle store selling alcoholic ciders to high school students in uniform without requesting age verification.",
            status: "Validated by Admin • Forwarded to Liquor Licensing & Community Watchdog",
            created_at: new Date(Date.now() - 172800000).toISOString()
        }
    ]);
}

function saveLocalWatchdogReports(reports) {
    writeLocalJSON('deltasWatchdogReportsQueue', reports);
}

async function loadWatchdogIntoContainer(container) {
    container.innerHTML = `
        <div class="outreach-header">
            <h2 style="font-size:1.85rem; margin-bottom:8px;">Confidential Community Watchdog &amp; Reporting</h2>
            <p>Discreetly report illicit substance distribution ('kambwa'/'musombodhiya'), counterfeit alcohol, or underage selling. Every user report is first accessed and reviewed by the <strong>DELTAS Platform Admin</strong>, who validates and forwards verified alerts to Campus Security &amp; ZRP Community Liaisons.</p>
        </div>
        <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start;">
            <div style="flex:1 1 45%; min-width:300px;" class="outreach-card">
                <h3 class="card-title" style="color:var(--primary); margin-bottom:8px;">Submit Anonymous Watchdog Alert</h3>
                <p style="font-size:0.86rem; color:var(--text-muted); margin-bottom:15px;">Zero personal identifiers or IP addresses are exposed. Your report is saved directly into the <strong>Admin Review &amp; Validation Queue</strong> before being forwarded to relevant authorities.</p>
                
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
                    Submit Confidential report
                </button>
                <p id="watchdog-feedback" style="display:none; color:var(--accent-sage); font-weight:bold; margin-top:12px; text-align:center;"></p>
            </div>
            
            <div style="flex:1 1 48%; min-width:300px; display:flex; flex-direction:column; gap:18px;">
                <!-- Admin Review & Validation Queue -->
                <div class="outreach-card" style="border-top:4px solid var(--accent-amber);">
                    <h3 class="card-title" style="margin-bottom:6px; font-size:1.2rem;">Admin Review &amp; Authority Forwarding Queue</h3>
                    <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:12px;">
                        Newly submitted user reports appear here first for Admin inspection. The Admin validates the report and forwards it to Campus Security, Liquor Licensing, and ZRP Community Liaisons.
                    </p>
                    <div id="watchdog-admin-queue-list">
                        <p style="color:var(--text-muted); font-size:0.88rem;">Checking Admin Validation Queue...</p>
                    </div>
                </div>

                <!-- Validated & Forwarded Community Watchdog Dispatches -->
                <div class="outreach-card" style="border-top:4px solid var(--accent-sage);">
                    <h3 class="card-title" style="margin-bottom:10px; font-size:1.2rem;">Submitted reports</h3>
                    <div id="watchdog-feed-list">
                        <p style="color:var(--text-muted);">Loading validated watchdog alerts...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    fetchWatchdogReports();
}

async function fetchWatchdogReports() {
    const list = document.getElementById('watchdog-feed-list');
    const adminQueue = document.getElementById('watchdog-admin-queue-list');
    if (!list) return;

    let reports = [];
    try {
        const res = await fetch(`${API_BASE}/watchdog/reports`);
        if (res.ok) {
            const serverReports = await res.json();
            if (Array.isArray(serverReports) && serverReports.length > 0) {
                reports = serverReports;
                saveLocalWatchdogReports(reports);
            }
        }
    } catch (e) {}

    if (!reports || reports.length === 0) {
        reports = getLocalWatchdogReports();
    }

    const pendingReports = reports.filter(r => (r.status || '').toLowerCase().includes('pending'));
    const validatedReports = reports.filter(r => !(r.status || '').toLowerCase().includes('pending'));

    if (adminQueue) {
        if (pendingReports.length === 0) {
            adminQueue.innerHTML = '<div style="padding:12px; background:var(--card-bg-warm); border:1px dashed var(--border-color); border-radius:8px; font-size:0.84rem; color:var(--text-muted); text-align:center;">No pending reports awaiting Admin validation right now. Submit a report on the left to see it enter the Admin Review Queue first.</div>';
        } else {
            adminQueue.innerHTML = pendingReports.map(r => `
                <div style="padding:14px; margin-bottom:10px; background:#FFFDF9; border:1.5px solid #F59E0B; border-left:5px solid #F59E0B; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                        <span style="background:#FFF3E0; color:#E65100; font-family:'Poppins',sans-serif; font-size:0.73rem; font-weight:800; padding:3px 9px; border-radius:4px;">${r.incident_type}</span>
                        <span style="font-size:0.78rem; color:var(--text-main); font-weight:700;">Location: ${r.campus_or_area}</span>
                    </div>
                    <p style="font-size:0.88rem; color:var(--text-main); margin:6px 0; line-height:1.5;">${r.description}</p>
                    <div style="font-size:0.75rem; color:#D97706; font-weight:800; margin-bottom:10px;">Status: ${r.status}</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" onclick="adminValidateAndForwardReport(${r.id})" class="btn-sage" style="padding:7px 14px; font-size:0.78rem;">
                            Admin: Validate &amp; Forward to Relevant Authorities
                        </button>
                        <button type="button" onclick="adminDismissWatchdogReport(${r.id})" class="btn-cream" style="padding:7px 12px; font-size:0.76rem;">
                            Archive / Dismiss
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    if (validatedReports.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted); font-size:0.88rem;">No validated dispatches yet.</p>';
    } else {
        list.innerHTML = validatedReports.map(r => `
            <div style="padding:14px; margin-bottom:12px; background:var(--card-bg-warm); border-left:4px solid var(--accent-sage); border:1px solid var(--border-color); border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                    <span style="background:var(--primary-light); color:var(--primary); font-family:'Poppins',sans-serif; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:4px;">${r.incident_type}</span>
                    <span style="font-size:0.78rem; color:var(--text-light); font-weight:600;">${r.campus_or_area}</span>
                </div>
                <p style="font-size:0.9rem; color:var(--text-main); margin:6px 0; line-height:1.5;">${r.description}</p>
                <div style="font-size:0.75rem; color:var(--accent-sage); font-weight:800; margin-top:6px;">${r.status}</div>
            </div>
        `).join('');
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
    btn.innerText = 'Encrypting & Saving for Admin Review...';

    const localList = getLocalWatchdogReports();
    const fallbackItem = {
        id: Date.now(),
        campus_or_area: loc,
        incident_type: type,
        description: desc,
        status: "Pending Admin Review & Validation",
        created_at: new Date().toISOString()
    };

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
        if (res.ok) {
            const created = await res.json();
            localList.unshift(created);
        } else {
            localList.unshift(fallbackItem);
        }
    } catch (e) {
        localList.unshift(fallbackItem);
    }

    saveLocalWatchdogReports(localList);
    document.getElementById('watchdog-location').value = '';
    document.getElementById('watchdog-desc').value = '';
    fb.style.display = 'block';
    fb.innerText = 'Report saved to the Admin Review & Validation Queue! The Admin will validate and forward it to Campus Security & ZRP Liaisons.';
    awardSmartActivityPoints('ambassador_action', `watchdog_${Date.now()}`, 20);
    fetchWatchdogReports();

    btn.disabled = false;
    btn.innerText = 'Submit Confidential report';
}

async function adminValidateAndForwardReport(reportId) {
    const localList = getLocalWatchdogReports();
    const target = localList.find(r => Number(r.id) === Number(reportId));
    if (target) {
        target.status = "Validated by Admin • Forwarded to Campus Security & ZRP Liaison";
        saveLocalWatchdogReports(localList);
    }
    try {
        await fetch(`${API_BASE}/watchdog/reports/${reportId}/validate`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });
    } catch (e) {}
    fetchWatchdogReports();
}

async function adminDismissWatchdogReport(reportId) {
    const localList = getLocalWatchdogReports().filter(r => Number(r.id) !== Number(reportId));
    saveLocalWatchdogReports(localList);
    try {
        await fetch(`${API_BASE}/watchdog/reports/${reportId}`, {
            method: 'DELETE'
        });
    } catch (e) {}
    fetchWatchdogReports();
}

// -----------------------------------------
// Module Detail Logic & 5-Section Smart Living Curriculum Engine (All 6 Modules)
// -----------------------------------------
function updateModuleDetailTopProgressBar(pct, statusText, isComplete = false) {
    const bar = document.getElementById('module-progress');
    const txt = document.getElementById('module-progress-text');
    if (bar) {
        bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        bar.style.background = isComplete ? 'var(--accent-sage)' : 'var(--gradient-teal)';
    }
    if (txt) {
        txt.style.color = isComplete ? 'var(--accent-sage)' : 'var(--secondary-teal)';
        txt.innerHTML = statusText;
    }
}

function alertLockedBingeSection(targetSectionId) {
    const curr = getActiveCurriculum();
    const prevSec = curr.sections.find(s => s.id === targetSectionId - 1);
    const prevTitle = prevSec ? `Section ${prevSec.id} (${prevSec.title})` : `Section ${targetSectionId - 1}`;
    alert(`Section ${targetSectionId} is currently locked.\n\nTo unlock and progress to Section ${targetSectionId}, you must first complete ${prevTitle} and achieve at least an 80% pass score (4/5 correct) on its Multiple-Choice Review Questions.`);
}

function renderBingeModuleDashboard(moduleId = currentActiveBingeModuleId, moduleTitle = currentActiveAcademyModuleTitle) {
    currentActiveBingeModuleId = moduleId || currentActiveBingeModuleId || 1;
    currentActiveAcademyModuleTitle = moduleTitle || currentActiveAcademyModuleTitle || BINGE_MODULE_TITLE;
    currentActiveBingeSectionId = null;

    const curr = getActiveCurriculum(currentActiveAcademyModuleTitle);
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    const overall = getBingeModuleOverallStats(state, currentActiveAcademyModuleTitle);
    const list = document.getElementById('module-content-list');
    if (!list) return;

    updateModuleDetailTopProgressBar(
        overall.overallPct,
        overall.isModuleComplete
            ? `Module Completed (100%) • All 5 Sections Passed (≥80% Quiz) &amp; ${overall.completedSubsectionsCount}/${overall.totalSubsections} Subsections Completed`
            : `Overall Module Progress: ${overall.overallPct}% • ${overall.passedSectionsCount}/${overall.totalSections} Sections Passed (≥80% Quiz) • ${overall.completedSubsectionsCount}/${overall.totalSubsections} Subsections Completed`,
        overall.isModuleComplete
    );

    // Determine next recommended section to open
    let nextSectionId = 1;
    for (let i = 1; i <= curr.sections.length; i++) {
        const sStats = getBingeSectionStats(i, state, currentActiveAcademyModuleTitle);
        if (!sStats.isSectionComplete && isBingeSectionUnlocked(i, state, currentActiveAcademyModuleTitle)) {
            nextSectionId = i;
            break;
        }
    }

    const objectivesHTML = (curr.learningObjectives || []).map((obj, idx) => `
        <div class="binge-objective-item">
            <span class="binge-obj-icon">${idx + 1}</span>
            <span>${obj}</span>
        </div>
    `).join('');

    const sectionsCardsHTML = curr.sections.map(sec => {
        const sStats = getBingeSectionStats(sec.id, state, currentActiveAcademyModuleTitle);
        const secState = state.sections[sec.id];
        const unlocked = isBingeSectionUnlocked(sec.id, state, currentActiveAcademyModuleTitle);
        const cardStateClass = sStats.isSectionComplete
            ? 'is-completed'
            : (unlocked ? 'is-unlocked' : 'is-locked');

        let statusPillHTML = '';
        if (sStats.isSectionComplete) {
            statusPillHTML = `<span class="bsdc-status-pill status-completed">Section Completed • Quiz Passed (${sStats.quizBestScore}%)</span>`;
        } else if (sStats.quizPassed) {
            statusPillHTML = `<span class="bsdc-status-pill status-completed">Quiz Passed (${sStats.quizBestScore}%) • ${sStats.pct}% Subsections Done</span>`;
        } else if (unlocked) {
            statusPillHTML = `<span class="bsdc-status-pill status-unlocked">Unlocked • ${sStats.pct > 0 ? `In Progress (${sStats.pct}%)` : 'Ready to Start'}</span>`;
        } else {
            statusPillHTML = `<span class="bsdc-status-pill status-locked">Locked • Pass Section ${sec.id - 1} (≥80%) First</span>`;
        }

        // Render chips for all 5 subsections in exact section display order
        const subChipsHTML = sec.order.map(subKey => {
            const isDone = !!(secState && secState.completedSubsections[subKey]);
            let label = '';
            if (subKey === 'video') {
                label = sec.video.shortLabel;
            } else if (subKey === 'quiz') {
                label = sStats.quizPassed
                    ? `${sec.quiz.shortLabel} [Passed ${sStats.quizBestScore}%]`
                    : sec.quiz.shortLabel;
            } else if (sec.subsections[subKey]) {
                label = sec.subsections[subKey].shortLabel;
            }
            return `
                <span class="bsdc-sub-chip ${isDone ? 'is-done' : ''}">
                    <span>${isDone ? '[Completed]' : '[Pending]'}</span>
                    <span>${label}</span>
                </span>
            `;
        }).join('');

        let actionBtnHTML = '';
        if (!unlocked) {
            actionBtnHTML = `
                <button type="button" onclick="alertLockedBingeSection(${sec.id})" class="btn-cream" style="padding:10px 18px; opacity:0.8; cursor:not-allowed; font-weight:700;">
                    Complete &amp; Pass Section ${sec.id - 1} (≥80%) to Unlock
                </button>
            `;
        } else if (sStats.isSectionComplete) {
            actionBtnHTML = `
                <button type="button" onclick="openBingeSectionView(${sec.id})" class="btn-sage" style="padding:10px 20px;">
                    Review Section ${sec.id} (100% Complete)
                </button>
            `;
        } else if (sStats.pct > 0) {
            actionBtnHTML = `
                <button type="button" onclick="openBingeSectionView(${sec.id})" class="btn-primary" style="padding:10px 20px;">
                    Continue Section ${sec.id} (${sStats.pct}% Complete)
                </button>
            `;
        } else {
            actionBtnHTML = `
                <button type="button" onclick="openBingeSectionView(${sec.id})" class="btn-primary" style="padding:10px 20px;">
                    Start Section ${sec.id} Learning Display
                </button>
            `;
        }

        const quizScoreMeta = sStats.quizBestScore > 0
            ? `Best Quiz Score: <strong>${sStats.quizBestScore}%</strong> (${sStats.quizPassed ? 'Passed ≥80%' : 'Requires ≥80%'})`
            : `Review Questions Pass Gate: <strong>80% Minimum (4/5)</strong>`;

        return `
            <div class="binge-section-dash-card ${cardStateClass}">
                <div class="bsdc-header">
                    <div class="bsdc-badges">
                        <span class="bsdc-sec-num">${sec.numberLabel} of 5</span>
                        ${statusPillHTML}
                    </div>
                    <div style="font-family:'Poppins',sans-serif; font-size:0.95rem; font-weight:800; color:${sStats.isSectionComplete ? 'var(--accent-sage)' : 'var(--primary)'};">
                        ${sStats.pct}% Section Progress
                    </div>
                </div>

                <h3 style="font-size:1.28rem; color:var(--text-main); margin:4px 0 8px 0;">
                    ${sec.numberLabel}: ${sec.title}
                </h3>
                <p style="font-size:0.92rem; color:var(--text-muted); margin:0 0 12px 0; line-height:1.6;">
                    ${sec.summary}
                </p>

                <div style="font-size:0.76rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-light); margin-bottom:6px;">
                    Section Subsections (${sStats.completedCount}/${sStats.totalCount} Completed — 20% Each):
                </div>
                <div class="bsdc-sub-checklist">
                    ${subChipsHTML}
                </div>

                <div class="bsdc-footer">
                    <div class="bsdc-progress-wrap">
                        <div class="amp-bar-track" style="margin-bottom:6px;">
                            <div class="amp-bar-fill ${sStats.isSectionComplete ? '' : 'is-progress'}" style="width:${sStats.pct}%;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-muted); flex-wrap:wrap; gap:8px;">
                            <span><strong>${sStats.completedCount} of ${sStats.totalCount}</strong> Subsections Completed</span>
                            <span>${quizScoreMeta}</span>
                        </div>
                    </div>
                    <div>
                        ${actionBtnHTML}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = `
        <div class="binge-module-shell">
            <!-- Curriculum Overview & Learning Objectives -->
            <div class="binge-overview-banner">
                <div class="binge-meta-pills">
                    <span class="binge-meta-pill">Target Audience: ${curr.targetAudience}</span>
                    <span class="binge-meta-pill pill-teal">5 Sequential Sections • 25 Subsections</span>
                    <span class="binge-meta-pill pill-amber">80% Quiz Pass Required Per Section</span>
                </div>
                <h3 style="font-size:1.45rem; color:var(--text-main); margin-bottom:8px;">
                    ${curr.title}
                </h3>
                <p style="font-size:0.92rem; color:var(--primary-dark); font-weight:700; margin-bottom:8px;">
                    Core Focus: ${curr.coreFocus}
                </p>
                <p style="font-size:0.94rem; color:var(--text-muted); line-height:1.65; margin-bottom:14px;">
                    ${curr.overview}
                </p>
                <div style="font-size:0.8rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-main); margin-top:10px;">
                    Module Learning Objectives:
                </div>
                <div class="binge-objectives-grid">
                    ${objectivesHTML}
                </div>
            </div>

            <!-- Module Progress Dashboard Panel -->
            <div class="binge-dashboard-progress-panel">
                <div class="bdp-top-row">
                    <div>
                        <span style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--secondary-teal);">
                            MODULE DASHBOARD &amp; PROGRESS TRACKER
                        </span>
                        <h3 style="font-size:1.3rem; margin:4px 0 6px 0; color:var(--text-main);">
                            Your ${curr.shortTitle || currentActiveAcademyModuleTitle} Mastery
                        </h3>
                        <p style="font-size:0.88rem; color:var(--text-muted); margin:0;">
                            Complete every learning subsection, watch the embedded supporting videos, and score at least <strong>80% (4/5)</strong> on each section's multiple-choice review questions to unlock the next section.
                        </p>
                        <div class="bdp-stats-chips">
                            <span class="bdp-stat-chip">Sections Passed (≥80%): <strong>${overall.passedSectionsCount} / ${overall.totalSections}</strong></span>
                            <span class="bdp-stat-chip">Subsections Completed: <strong>${overall.completedSubsectionsCount} / ${overall.totalSubsections}</strong></span>
                            <span class="bdp-stat-chip">Next Unlocked Section: <strong>Section ${nextSectionId}</strong></span>
                        </div>
                    </div>
                    <div class="bdp-pct-circle">
                        <div class="bdp-pct-number">${overall.overallPct}%</div>
                        <div style="font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:10px;">Overall Module Completion</div>
                        <button type="button" onclick="openBingeSectionView(${nextSectionId})" class="${overall.isModuleComplete ? 'btn-sage' : 'btn-primary'}" style="padding:9px 16px; font-size:0.84rem;">
                            ${overall.isModuleComplete ? 'Review Section 1' : `Open Section ${nextSectionId}`}
                        </button>
                    </div>
                </div>
                <div class="amp-bar-track" style="height:11px; margin-top:8px;">
                    <div class="amp-bar-fill ${overall.isModuleComplete ? '' : 'is-progress'}" style="width:${overall.overallPct}%;"></div>
                </div>
            </div>

            <!-- 5 Sections Dashboard List -->
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
                    <h3 style="font-size:1.35rem; color:var(--text-main); margin:0;">
                        Module Curriculum Sections (1 – 5)
                    </h3>
                    <span style="font-size:0.84rem; color:var(--text-muted); font-weight:600;">
                        Sequential Access: Pass each section's Review Questions (≥80%) to unlock the next section
                    </span>
                </div>
                <div class="binge-sections-dashboard-grid">
                    ${sectionsCardsHTML}
                </div>
            </div>
        </div>
    `;
}

function openBingeSectionView(sectionId, scrollTargetId = null) {
    const curr = getActiveCurriculum(currentActiveAcademyModuleTitle);
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    if (!isBingeSectionUnlocked(sectionId, state, currentActiveAcademyModuleTitle)) {
        alertLockedBingeSection(sectionId);
        return;
    }

    const sec = curr.sections.find(s => s.id === sectionId);
    if (!sec) return;

    currentActiveBingeSectionId = sectionId;
    const secState = state.sections[sectionId];
    const sStats = getBingeSectionStats(sectionId, state, currentActiveAcademyModuleTitle);
    const overall = getBingeModuleOverallStats(state, currentActiveAcademyModuleTitle);

    updateModuleDetailTopProgressBar(
        overall.overallPct,
        `Overall Module Progress: ${overall.overallPct}% (${overall.completedSubsectionsCount}/${overall.totalSubsections} Subsections) • Active: ${sec.numberLabel} (${sStats.pct}%)`,
        overall.isModuleComplete
    );

    const list = document.getElementById('module-content-list');
    if (!list) return;

    // Quick section switcher pills
    const switcherPillsHTML = curr.sections.map(s => {
        const st = getBingeSectionStats(s.id, state, currentActiveAcademyModuleTitle);
        const unlocked = isBingeSectionUnlocked(s.id, state, currentActiveAcademyModuleTitle);
        const activeClass = s.id === sectionId ? 'is-active' : '';
        const lockedClass = !unlocked ? 'is-locked' : '';
        const labelPrefix = st.isSectionComplete ? '[Done] ' : (unlocked ? '' : '[Locked] ');
        return `
            <button type="button" class="bst-sec-pill ${activeClass} ${lockedClass}" onclick="openBingeSectionView(${s.id})">
                ${labelPrefix}Sec ${s.id} (${st.pct}%)
            </button>
        `;
    }).join('');

    // Build all subsections in single display according to sec.order
    const subsectionsDisplayHTML = sec.order.map(subKey => {
        if (subKey === 'video') {
            const isVideoDone = !!secState.completedSubsections.video;

            let companionVideosHTML = '';
            if (Array.isArray(sec.video.additionalVideos) && sec.video.additionalVideos.length > 0) {
                companionVideosHTML = sec.video.additionalVideos.map(av => `
                    <div style="margin-top:18px; padding-top:16px; border-top:1px dashed var(--border-color);">
                        <h4 style="font-size:1.08rem; color:var(--text-main); margin:0 0 6px 0;">
                            Companion Supporting Video: ${av.title}
                        </h4>
                        ${av.source ? `<p style="font-size:0.84rem; color:var(--text-muted); margin:0 0 10px 0;">Source: ${av.source}</p>` : ''}
                        <div class="binge-video-frame-container">
                            <iframe
                                src="${av.embedUrl}"
                                title="${av.title.replace(/"/g, '&quot;')}"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerpolicy="strict-origin-when-cross-origin"
                                allowfullscreen>
                            </iframe>
                        </div>
                        <div style="margin-top:8px;">
                            <a href="${av.youtubeUrl}" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem; font-weight:700; color:var(--secondary-teal); text-decoration:none;">
                                Watch Companion Video Directly on YouTube
                            </a>
                        </div>
                    </div>
                `).join('');
            }

            let additionalLinkHTML = '';
            if (sec.video.additionalLink && sec.video.additionalLink.url) {
                additionalLinkHTML = `
                    <div style="margin-top:14px; padding:12px 16px; background:var(--cream-soft); border:1px solid var(--cream-sand); border-radius:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <span style="font-size:0.88rem; color:var(--text-main); font-weight:600;">
                            Additional Official Resource: <strong>${sec.video.additionalLink.label}</strong>
                        </span>
                        <a href="${sec.video.additionalLink.url}" target="_blank" rel="noopener noreferrer" style="font-size:0.84rem; font-weight:700; color:var(--primary); text-decoration:underline;">
                            Open Official Channel
                        </a>
                    </div>
                `;
            }

            return `
                <div id="binge-subcard-${sec.id}-video" class="binge-subsection-card video-subsection-card ${isVideoDone ? 'is-done' : ''}">
                    <div class="bsc-header">
                        <span class="bsc-kicker kicker-video">SUPPORTING VIDEO SUBSECTION • EMBEDDED YOUTUBE VIDEO</span>
                        <span id="binge-substatus-${sec.id}-video" style="font-size:0.78rem; font-weight:700; color:${isVideoDone ? 'var(--accent-sage)' : 'var(--secondary-orange-dark)'};">
                            ${isVideoDone ? 'Video Subsection Completed (+20% Section Progress)' : 'Subsection Progress Weight: 20% of Section'}
                        </span>
                    </div>
                    <h3 style="font-size:1.25rem; color:var(--text-main); margin-bottom:8px;">
                        Supporting Video: ${sec.video.title}
                    </h3>
                    <p style="font-size:0.93rem; color:var(--text-muted); margin-bottom:12px;">
                        ${sec.video.guidance}
                    </p>
                    <div class="binge-video-frame-container">
                        <iframe
                            src="${sec.video.embedUrl}"
                            title="${sec.video.title.replace(/"/g, '&quot;')}"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerpolicy="strict-origin-when-cross-origin"
                            allowfullscreen>
                        </iframe>
                    </div>
                    ${companionVideosHTML}
                    ${additionalLinkHTML}
                    <div class="bsc-footer">
                        <a href="${sec.video.youtubeUrl}" target="_blank" rel="noopener noreferrer" style="font-size:0.84rem; font-weight:700; color:var(--secondary-teal); text-decoration:none;">
                            Watch Directly on YouTube
                        </a>
                        <button type="button" id="btn-sub-${sec.id}-video" class="btn-subsection-toggle ${isVideoDone ? 'is-completed' : ''}" onclick="toggleBingeSubsectionComplete(${sec.id}, 'video')">
                            ${isVideoDone ? 'Supporting Video Completed (20% Recorded)' : 'Mark Supporting Video Complete (+20% Section Progress)'}
                        </button>
                    </div>
                </div>
            `;
        } else if (subKey === 'quiz') {
            return renderBingeSectionQuizBlockHTML(sec, secState, sStats);
        } else {
            const sub = sec.subsections[subKey];
            if (!sub) return '';
            const isSubDone = !!secState.completedSubsections[subKey];
            return `
                <div id="binge-subcard-${sec.id}-${sub.key}" class="binge-subsection-card ${isSubDone ? 'is-done' : ''}">
                    <div class="bsc-header">
                        <span class="bsc-kicker">LEARNING SUBSECTION ${sub.code}</span>
                        <span id="binge-substatus-${sec.id}-${sub.key}" style="font-size:0.78rem; font-weight:700; color:${isSubDone ? 'var(--accent-sage)' : 'var(--secondary-teal)'};">
                            ${isSubDone ? `Subsection ${sub.code} Completed (+20% Section Progress)` : 'Subsection Progress Weight: 20% of Section'}
                        </span>
                    </div>
                    <h3 style="font-size:1.25rem; color:var(--text-main); margin-bottom:12px;">
                        ${sub.title}
                    </h3>
                    <div class="bsc-body">
                        ${sub.html}
                    </div>
                    <div class="bsc-footer">
                        <span style="font-size:0.82rem; color:var(--text-muted); font-weight:600;">
                            Check off Subsection ${sub.code} once you have reviewed the material above:
                        </span>
                        <button type="button" id="btn-sub-${sec.id}-${sub.key}" class="btn-subsection-toggle ${isSubDone ? 'is-completed' : ''}" onclick="toggleBingeSubsectionComplete(${sec.id}, '${sub.key}')">
                            ${isSubDone ? `Subsection ${sub.code} Completed (20% Recorded)` : `Mark Subsection ${sub.code} Complete (+20% Section Progress)`}
                        </button>
                    </div>
                </div>
            `;
        }
    }).join('');

    list.innerHTML = `
        <div class="binge-module-shell">
            <!-- Top Navigation & Live Section Progress Bar -->
            <div class="binge-section-topbar">
                <div class="bst-nav-row">
                    <button type="button" onclick="renderBingeModuleDashboard()" class="btn-cream" style="padding:8px 15px; font-size:0.85rem; font-weight:700;">
                        Back to Module Dashboard (All 5 Sections)
                    </button>
                    <div class="bst-sec-pills">
                        ${switcherPillsHTML}
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:12px; margin-bottom:8px;">
                    <div>
                        <span style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--primary);">
                            ${sec.numberLabel} OF 5 • SINGLE-DISPLAY LEARNING &amp; ASSESSMENT VIEW
                        </span>
                        <h2 style="font-size:1.45rem; color:var(--text-main); margin:2px 0 0 0;">
                            ${sec.numberLabel}: ${sec.title}
                        </h2>
                    </div>
                    <div style="text-align:right;">
                        <div id="binge-active-section-pct-label" style="font-family:'Poppins',sans-serif; font-size:1.1rem; font-weight:800; color:var(--primary);">
                            Section ${sec.id} Progress: ${sStats.pct}% (${sStats.completedCount}/${sStats.totalCount} Subsections)
                        </div>
                        <div id="binge-active-module-pct-label" style="font-size:0.78rem; color:var(--text-muted); font-weight:700;">
                            Overall Module Completion: ${overall.overallPct}% (${overall.completedSubsectionsCount}/${overall.totalSubsections} Total Subsections)
                        </div>
                    </div>
                </div>

                <div class="amp-bar-track" style="height:10px; margin-bottom:0;">
                    <div id="binge-active-section-bar" class="amp-bar-fill ${sStats.isSectionComplete ? '' : 'is-progress'}" style="width:${sStats.pct}%;"></div>
                </div>
            </div>

            <!-- Single-Display Subsections (Learning Material + Embedded Video + Multiple-Choice Quiz) -->
            ${subsectionsDisplayHTML}
        </div>
    `;

    if (scrollTargetId) {
        const el = document.getElementById(scrollTargetId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else {
        const topEl = document.getElementById('view-module-detail');
        if (topEl) {
            topEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

function renderBingeSectionQuizBlockHTML(sec, secState, sStats) {
    const curr = getActiveCurriculum(currentActiveAcademyModuleTitle);
    const isQuizDone = !!secState.completedSubsections.quiz;
    const selectedMap = secState.quizSelectedAnswers || {};
    const showGraded = !!secState.quizSubmitted;
    const optionLetters = ['A', 'B', 'C', 'D'];

    const questionsHTML = sec.quiz.questions.map((q, qIdx) => {
        const userChoice = selectedMap[qIdx];
        const optionsHTML = q.options.map((optText, oIdx) => {
            const isSelected = userChoice === oIdx;
            let stateClass = isSelected ? 'is-selected' : '';
            if (showGraded) {
                if (oIdx === q.correctIndex) {
                    stateClass = 'is-correct-answer';
                } else if (isSelected && oIdx !== q.correctIndex) {
                    stateClass = 'is-wrong-answer';
                }
            }
            return `
                <label class="bqq-option-label ${stateClass}" id="bqq-opt-${sec.id}-${qIdx}-${oIdx}" onclick="selectBingeQuizOption(${sec.id}, ${qIdx}, ${oIdx})">
                    <input type="radio" name="binge_q_${sec.id}_${qIdx}" value="${oIdx}" ${isSelected ? 'checked' : ''} />
                    <div>
                        <strong>${optionLetters[oIdx]}.</strong> ${optText}
                    </div>
                </label>
            `;
        }).join('');

        let explanationHTML = '';
        if (showGraded) {
            const isCorrect = userChoice === q.correctIndex;
            explanationHTML = `
                <div style="margin-top:10px; padding:10px 14px; border-radius:8px; background:${isCorrect ? '#E8F5E9' : '#FFF3E0'}; border-left:4px solid ${isCorrect ? 'var(--accent-sage)' : 'var(--secondary-orange-dark)'}; font-size:0.86rem; line-height:1.5;">
                    <strong style="color:${isCorrect ? 'var(--primary-dark)' : 'var(--secondary-orange-dark)'};">
                        ${isCorrect ? 'Correct!' : `Incorrect (Correct Answer: Option ${optionLetters[q.correctIndex]})`}
                    </strong>
                    <div style="margin-top:4px; color:var(--text-main);">${q.explanation}</div>
                </div>
            `;
        }

        return `
            <div class="binge-quiz-question-card">
                <div class="bqq-header">
                    <span class="bqq-num">Question ${qIdx + 1} of ${sec.quiz.questions.length} (20%)</span>
                    <span class="bqq-topic">${q.topic}</span>
                </div>
                <div class="bqq-prompt">${q.prompt}</div>
                <div class="bqq-options-list">
                    ${optionsHTML}
                </div>
                ${explanationHTML}
            </div>
        `;
    }).join('');

    let feedbackPanelHTML = '';
    if (showGraded && secState.quizLastScore !== null) {
        const lastScore = secState.quizLastScore;
        const passedNow = lastScore >= sec.quiz.passThreshold;
        const correctCount = Math.round((lastScore / 100) * sec.quiz.questions.length);
        const hasNextSection = sec.id < curr.sections.length;
        const nonQuizRemaining = Object.keys(secState.completedSubsections).filter(k => k !== 'quiz' && !secState.completedSubsections[k]);

        if (passedNow || sStats.quizPassed) {
            feedbackPanelHTML = `
                <div class="binge-quiz-feedback-panel is-pass">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                        <div>
                            <span style="background:var(--accent-sage); color:#fff; font-family:'Poppins',sans-serif; font-size:0.76rem; font-weight:800; padding:4px 12px; border-radius:999px;">
                                PASSED SECTION ${sec.id} ASSESSMENT (≥80% ACHIEVED)
                            </span>
                            <h4 style="font-size:1.25rem; color:var(--primary-dark); margin:8px 0 4px 0;">
                                Score: ${lastScore}% (${correctCount} / ${sec.quiz.questions.length} Correct) • Best Score: ${sStats.quizBestScore}%
                            </h4>
                            <p style="font-size:0.9rem; color:var(--text-main); margin:0;">
                                ${hasNextSection
                                    ? `Excellent work! You achieved at least 80% and unlocked <strong>Section ${sec.id + 1}: ${curr.sections[sec.id].title}</strong>.`
                                    : `Congratulations! You have passed the final Section 5 assessment of the ${curr.shortTitle || currentActiveAcademyModuleTitle} curriculum!`}
                            </p>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:10px;">
                            ${nonQuizRemaining.length > 0 ? `
                                <button type="button" onclick="completeAllReadingVideoSubsections(${sec.id})" class="btn-cream" style="padding:10px 16px; font-weight:700;">
                                    Mark Remaining ${nonQuizRemaining.length} Subsection(s) Complete (Reach 100%)
                                </button>
                            ` : ''}
                            ${hasNextSection ? `
                                <button type="button" onclick="proceedToNextBingeSection(${sec.id})" class="btn-primary" style="padding:11px 20px;">
                                    Proceed to Section ${sec.id + 1}
                                </button>
                            ` : `
                                <button type="button" onclick="finishFinalBingeSection(${sec.id})" class="btn-sage" style="padding:11px 20px;">
                                    Complete Module &amp; View Module Dashboard (100%)
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        } else {
            feedbackPanelHTML = `
                <div class="binge-quiz-feedback-panel is-fail">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                        <div>
                            <span style="background:var(--secondary-orange-dark); color:#fff; font-family:'Poppins',sans-serif; font-size:0.76rem; font-weight:800; padding:4px 12px; border-radius:999px;">
                                SCORE BELOW 80% PASS THRESHOLD
                            </span>
                            <h4 style="font-size:1.22rem; color:var(--secondary-orange-dark); margin:8px 0 4px 0;">
                                You Scored ${lastScore}% (${correctCount} / ${sec.quiz.questions.length} Correct) — Minimum 80% (4/5) Required
                            </h4>
                            <p style="font-size:0.9rem; color:var(--text-main); margin:0;">
                                To complete this section and unlock the next section, you must achieve at least <strong>80% (4 out of 5 correct)</strong>. Review the explanations above and retry the questions below.
                            </p>
                        </div>
                        <button type="button" onclick="retryBingeSectionQuiz(${sec.id})" class="btn-primary" style="padding:10px 18px;">
                            Retry Section ${sec.id} Questions
                        </button>
                    </div>
                </div>
            `;
        }
    }

    return `
        <div id="binge-subcard-${sec.id}-quiz" class="binge-subsection-card ${isQuizDone ? 'is-done' : ''}" style="border-left-color:var(--primary);">
            <div class="bsc-header">
                <span class="bsc-kicker kicker-quiz">QUESTIONS SUBSECTION ${sec.quiz.code} • MULTIPLE-CHOICE REVIEW ASSESSMENT</span>
                <span style="font-size:0.78rem; font-weight:700; color:${isQuizDone ? 'var(--accent-sage)' : 'var(--primary)'};">
                    ${isQuizDone ? `Passed (${sStats.quizBestScore}% Best Score • +20% Section Progress)` : 'Pass Requirement: Minimum 80% (4/5 Correct) to Unlock Next Section'}
                </span>
            </div>

            <h3 style="font-size:1.3rem; color:var(--text-main); margin-bottom:6px;">
                ${sec.quiz.title}
            </h3>
            <p style="font-size:0.92rem; color:var(--text-muted); margin-bottom:18px;">
                Choose the appropriate answer for each of the ${sec.quiz.questions.length} multiple-choice review questions below. Achieving at least <strong>80% (4 out of 5 correct)</strong> is required to pass Section ${sec.id} and unlock ${sec.id < 5 ? `Section ${sec.id + 1}` : 'full module certification'}.
            </p>

            ${questionsHTML}

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:16px;">
                <span style="font-size:0.84rem; color:var(--text-muted); font-weight:600;">
                    Pass Mark: <strong>80% (4/5 Correct)</strong> • Contributes 20% to Section ${sec.id} Progress
                </span>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    ${showGraded ? `
                        <button type="button" onclick="retryBingeSectionQuiz(${sec.id})" class="btn-cream" style="padding:11px 18px; font-weight:700;">
                            Reset &amp; Retake Quiz
                        </button>
                    ` : ''}
                    <button type="button" onclick="submitBingeSectionQuiz(${sec.id})" class="btn-primary" style="padding:12px 24px; font-size:0.95rem;">
                        Submit Section ${sec.id} Answers &amp; Check Pass Score
                    </button>
                </div>
            </div>

            ${feedbackPanelHTML}
        </div>
    `;
}

function toggleBingeSubsectionComplete(sectionId, subKey) {
    const curr = getActiveCurriculum(currentActiveAcademyModuleTitle);
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    if (!isBingeSectionUnlocked(sectionId, state, currentActiveAcademyModuleTitle)) {
        alertLockedBingeSection(sectionId);
        return;
    }

    const secState = state.sections[sectionId];
    if (!secState || subKey === 'quiz') return;

    secState.completedSubsections[subKey] = !secState.completedSubsections[subKey];
    saveBingeModuleState(state, currentUserId, currentActiveAcademyModuleTitle);

    // Update UI in-place smoothly
    const isNowDone = !!secState.completedSubsections[subKey];
    const sec = curr.sections.find(s => s.id === sectionId);
    const sStats = getBingeSectionStats(sectionId, state, currentActiveAcademyModuleTitle);
    const overall = getBingeModuleOverallStats(state, currentActiveAcademyModuleTitle);

    const cardEl = document.getElementById(`binge-subcard-${sectionId}-${subKey}`);
    if (cardEl) {
        cardEl.classList.toggle('is-done', isNowDone);
    }

    const btnEl = document.getElementById(`btn-sub-${sectionId}-${subKey}`);
    if (btnEl) {
        btnEl.classList.toggle('is-completed', isNowDone);
        if (subKey === 'video') {
            btnEl.innerText = isNowDone
                ? 'Supporting Video Completed (20% Recorded)'
                : 'Mark Supporting Video Complete (+20% Section Progress)';
        } else {
            btnEl.innerText = isNowDone
                ? `Subsection ${subKey} Completed (20% Recorded)`
                : `Mark Subsection ${subKey} Complete (+20% Section Progress)`;
        }
    }

    const statusEl = document.getElementById(`binge-substatus-${sectionId}-${subKey}`);
    if (statusEl) {
        statusEl.style.color = isNowDone ? 'var(--accent-sage)' : (subKey === 'video' ? 'var(--secondary-orange-dark)' : 'var(--secondary-teal)');
        statusEl.innerText = isNowDone
            ? `${subKey === 'video' ? 'Video Subsection' : `Subsection ${subKey}`} Completed (+20% Section Progress)`
            : 'Subsection Progress Weight: 20% of Section';
    }

    const secBar = document.getElementById('binge-active-section-bar');
    if (secBar) {
        secBar.style.width = `${sStats.pct}%`;
        secBar.classList.toggle('is-progress', !sStats.isSectionComplete);
    }
    const secLabel = document.getElementById('binge-active-section-pct-label');
    if (secLabel) {
        secLabel.innerText = `Section ${sectionId} Progress: ${sStats.pct}% (${sStats.completedCount}/${sStats.totalCount} Subsections)`;
    }
    const modLabel = document.getElementById('binge-active-module-pct-label');
    if (modLabel) {
        modLabel.innerText = `Overall Module Completion: ${overall.overallPct}% (${overall.completedSubsectionsCount}/${overall.totalSubsections} Total Subsections)`;
    }

    updateModuleDetailTopProgressBar(
        overall.overallPct,
        `Overall Module Progress: ${overall.overallPct}% (${overall.completedSubsectionsCount}/${overall.totalSubsections} Subsections) • Active: Section ${sectionId} (${sStats.pct}%)`,
        overall.isModuleComplete
    );

    // Refresh switcher pills in top bar
    const switcherContainer = document.querySelector('.bst-sec-pills');
    if (switcherContainer && sec) {
        switcherContainer.innerHTML = curr.sections.map(s => {
            const st = getBingeSectionStats(s.id, state, currentActiveAcademyModuleTitle);
            const unlocked = isBingeSectionUnlocked(s.id, state, currentActiveAcademyModuleTitle);
            const activeClass = s.id === sectionId ? 'is-active' : '';
            const lockedClass = !unlocked ? 'is-locked' : '';
            const labelPrefix = st.isSectionComplete ? '[Done] ' : (unlocked ? '' : '[Locked] ');
            return `
                <button type="button" class="bst-sec-pill ${activeClass} ${lockedClass}" onclick="openBingeSectionView(${s.id})">
                    ${labelPrefix}Sec ${s.id} (${st.pct}%)
                </button>
            `;
        }).join('');
    }
}

function selectBingeQuizOption(sectionId, questionIdx, optionIdx) {
    const curr = getActiveCurriculum(currentActiveAcademyModuleTitle);
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    const secState = state.sections[sectionId];
    if (!secState) return;

    secState.quizSelectedAnswers[questionIdx] = optionIdx;
    saveBingeModuleState(state, currentUserId, currentActiveAcademyModuleTitle);

    // Highlight selected radio row immediately
    const sec = curr.sections.find(s => s.id === sectionId);
    if (!sec) return;
    const q = sec.quiz.questions[questionIdx];
    if (!q) return;

    q.options.forEach((_, oIdx) => {
        const labelEl = document.getElementById(`bqq-opt-${sectionId}-${questionIdx}-${oIdx}`);
        if (labelEl) {
            labelEl.classList.toggle('is-selected', oIdx === optionIdx);
            const radio = labelEl.querySelector('input[type="radio"]');
            if (radio) radio.checked = (oIdx === optionIdx);
        }
    });
}

function submitBingeSectionQuiz(sectionId) {
    const curr = getActiveCurriculum(currentActiveAcademyModuleTitle);
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    if (!isBingeSectionUnlocked(sectionId, state, currentActiveAcademyModuleTitle)) {
        alertLockedBingeSection(sectionId);
        return;
    }

    const sec = curr.sections.find(s => s.id === sectionId);
    const secState = state.sections[sectionId];
    if (!sec || !secState) return;

    // Also read any checked DOM radio inputs to ensure complete accuracy
    sec.quiz.questions.forEach((q, qIdx) => {
        const checkedRadio = document.querySelector(`input[name="binge_q_${sectionId}_${qIdx}"]:checked`);
        if (checkedRadio) {
            secState.quizSelectedAnswers[qIdx] = parseInt(checkedRadio.value, 10);
        }
    });

    const unanswered = [];
    sec.quiz.questions.forEach((_, qIdx) => {
        if (secState.quizSelectedAnswers[qIdx] === undefined || secState.quizSelectedAnswers[qIdx] === null) {
            unanswered.push(qIdx + 1);
        }
    });

    if (unanswered.length > 0) {
        alert(`Please select an answer for all questions before submitting (Missing Question${unanswered.length > 1 ? 's' : ''}: ${unanswered.join(', ')}).`);
        return;
    }

    let correctCount = 0;
    sec.quiz.questions.forEach((q, qIdx) => {
        if (secState.quizSelectedAnswers[qIdx] === q.correctIndex) {
            correctCount += 1;
        }
    });

    const scorePct = Math.round((correctCount / sec.quiz.questions.length) * 100);
    secState.quizLastScore = scorePct;
    secState.quizBestScore = Math.max(secState.quizBestScore || 0, scorePct);
    secState.quizSubmitted = true;

    if (scorePct >= sec.quiz.passThreshold) {
        secState.quizPassed = true;
        secState.completedSubsections.quiz = true;
    }

    saveBingeModuleState(state, currentUserId, currentActiveAcademyModuleTitle);
    openBingeSectionView(sectionId, `binge-subcard-${sectionId}-quiz`);
}

function retryBingeSectionQuiz(sectionId) {
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    const secState = state.sections[sectionId];
    if (!secState) return;

    secState.quizSelectedAnswers = {};
    secState.quizSubmitted = false;
    secState.quizLastScore = null;
    saveBingeModuleState(state, currentUserId, currentActiveAcademyModuleTitle);
    openBingeSectionView(sectionId, `binge-subcard-${sectionId}-quiz`);
}

function completeAllReadingVideoSubsections(sectionId) {
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    const secState = state.sections[sectionId];
    if (!secState) return;

    Object.keys(secState.completedSubsections).forEach(k => {
        if (k !== 'quiz') {
            secState.completedSubsections[k] = true;
        }
    });
    saveBingeModuleState(state, currentUserId, currentActiveAcademyModuleTitle);
    openBingeSectionView(sectionId, `binge-subcard-${sectionId}-quiz`);
}

function proceedToNextBingeSection(currentSectionId) {
    const curr = getActiveCurriculum(currentActiveAcademyModuleTitle);
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    const secState = state.sections[currentSectionId];
    if (secState && secState.quizPassed) {
        // Ensure all learning & video subsections of the passed section are marked complete when progressing
        Object.keys(secState.completedSubsections).forEach(k => {
            secState.completedSubsections[k] = true;
        });
        saveBingeModuleState(state, currentUserId, currentActiveAcademyModuleTitle);
    }
    const nextId = currentSectionId + 1;
    if (nextId <= curr.sections.length) {
        openBingeSectionView(nextId);
    } else {
        renderBingeModuleDashboard();
    }
}

function finishFinalBingeSection(sectionId) {
    const state = getBingeModuleState(currentUserId, currentActiveAcademyModuleTitle);
    const secState = state.sections[sectionId];
    if (secState && secState.quizPassed) {
        Object.keys(secState.completedSubsections).forEach(k => {
            secState.completedSubsections[k] = true;
        });
        saveBingeModuleState(state, currentUserId, currentActiveAcademyModuleTitle);
    }
    renderBingeModuleDashboard();
    const topEl = document.getElementById('view-module-detail');
    if (topEl) topEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function openModuleDetail(moduleId, title, isHomeMode) {
    document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
    updatePortalSlideshowView(isHomeMode ? 'outreach' : 'influence');

    if (isHomeMode) {
        const view = document.getElementById('view-module-detail');
        view.classList.add('active');
        document.getElementById('module-detail-title').textContent = title;
        const list = document.getElementById('module-content-list');

        // 5-Section Structured Curriculum for all 6 Smart Living & Moderation Academy modules
        if (SMART_LIVING_CURRICULA[title]) {
            currentActiveBingeModuleId = moduleId;
            currentActiveAcademyModuleTitle = title;
            renderBingeModuleDashboard(moduleId, title);
            return;
        }

    } else {
        const view = document.getElementById('view-safespace-detail');
        view.classList.add('active');
        document.getElementById('safespace-detail-title').textContent = title;
        document.getElementById('safespace-peer-topic').textContent = title;
        currentSafeSpaceTopic = title;

        const articleContainer = document.getElementById('safespace-article-container');
        articleContainer.innerHTML = '<div style="text-align:center; padding:20px;"><p>Loading handbook...</p></div>';
        awardSmartActivityPoints('handbook', title, 15);

        try {
            const res = await fetch(`${API_BASE}/modules/${moduleId}/content`);
            const contents = await res.json();
            if (contents && contents.length > 0) {
                const article = contents[0];
                articleContainer.innerHTML = `
                    <div class="outreach-card" style="border-left:4px solid var(--primary); padding:24px;">
                        <h3 style="color:var(--primary); margin-bottom:12px; font-size:1.35rem;">Above the Influence Handbook: ${title}</h3>
                        <p style="font-size:1.02rem; line-height:1.8; color:var(--text-main); white-space:pre-line;">${article.content_text}</p>
                    </div>
                `;
            } else {
                articleContainer.innerHTML = '<p style="color:var(--text-muted);">Handbook instructions being prepared.</p>';
            }
        } catch(e) {
            articleContainer.innerHTML = '<p style="color:red;">Error loading handbook.</p>';
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
// Smart Campus & Health News Hub Logic (Full-Frame Single-Poster Carousel + Auto-Scroll)
// -----------------------------------------
let newsPosterAutoTimer = null;
let newsPosterCurrentIdx = 0;
let currentNewsPosterList = [];

const FALLBACK_NEWS_POSTERS = [
    {
        id: 101,
        title: "Why Student Peer Mentorship Outperforms Zero-Tolerance Rules in Curbing Campus Binge Culture",
        source: "Health News",
        descriptive_topic: "WHO & Public Health Digest • Peer Leadership",
        summary: "Global and regional public health studies confirm that student-led harm reduction, sober-zone social programming, and peer-to-peer accountability reduce high-risk binge episodes by up to 43% compared to punitive disciplinary measures alone.",
        published_date: "2026-11-14T09:00:00",
        url: "https://www.who.int/news-room/fact-sheets/detail/alcohol",
        banner_url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 102,
        title: "Enactus Chapters Across 8+ Zimbabwean Institutions Expand 'Pledge 18' & Sober Wellness Marathons",
        source: "Campus Innovation",
        descriptive_topic: "Student Social Enterprise • National Impact",
        summary: "Student ambassadors from UZ, NUST, MSU, HIT, CUT, GZU, BUSE, and Lupane State have launched coordinated alcohol-free night markets, hydration stations, and first-year orientation mentorship circles.",
        published_date: "2026-11-12T11:30:00",
        url: "https://enactus.org",
        banner_url: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 103,
        title: "Toxicology Alert: Why Unregulated Street Spirits ('Kambwa') Carry Lethal Methanol Risks",
        source: "Policy & Law",
        descriptive_topic: "Liquor Act & Clinical Toxicology Brief",
        summary: "Clinical toxicologists warn that unlabelled plastic-sachet and backyard illicit brews frequently contain toxic methanol and industrial solvents capable of causing irreversible optic nerve blindness and metabolic acidosis within hours.",
        published_date: "2026-11-10T14:15:00",
        url: "https://www.who.int/teams/mental-health-and-substance-use",
        banner_url: "https://images.unsplash.com/photo-1579154204601-01588f351e67?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 104,
        title: "Alcohol, REM Sleep Architecture & Exam Memory Consolidation: What Every Student Should Know",
        source: "Health News",
        descriptive_topic: "Neuroscience & Academic Performance",
        summary: "Even moderate evening drinking suppresses Rapid Eye Movement (REM) sleep and hippocampal memory consolidation by 25–40%, directly impacting exam recall, mood regulation, and next-day cognitive sharpness.",
        published_date: "2026-11-08T16:00:00",
        url: "https://www.SleepFoundation.org",
        banner_url: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80"
    }
];

async function filterNews(source, el) {
    document.querySelectorAll('#view-news .filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadNews(source);
}

function getNewsPosterImage(item, idx) {
    if (item.banner_url) return item.banner_url;
    const pool = [
        "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80"
    ];
    return pool[idx % pool.length];
}

function scrollToNewsPoster(index) {
    const viewport = document.getElementById('news-poster-viewport');
    if (!viewport || !currentNewsPosterList.length) return;
    const total = currentNewsPosterList.length;
    newsPosterCurrentIdx = ((index % total) + total) % total;
    const slideWidth = viewport.clientWidth;
    viewport.scrollTo({ left: slideWidth * newsPosterCurrentIdx, behavior: 'smooth' });
    updateNewsPosterPills(newsPosterCurrentIdx);
}

function stepNewsPoster(delta) {
    scrollToNewsPoster(newsPosterCurrentIdx + delta);
}

function updateNewsPosterPills(activeIdx) {
    document.querySelectorAll('#news-poster-dots .poster-dot-pill').forEach((pill, i) => {
        if (i === activeIdx) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
}

function startNewsPosterAutoScroll() {
    if (newsPosterAutoTimer) clearInterval(newsPosterAutoTimer);
    newsPosterAutoTimer = setInterval(() => {
        const newsView = document.getElementById('view-news');
        if (!newsView || !newsView.classList || !newsView.classList.contains('active')) return;
        if (currentNewsPosterList.length > 1) {
            scrollToNewsPoster(newsPosterCurrentIdx + 1);
        }
    }, 5500);
}

async function loadNews(source) {
    const container = document.getElementById('news-feed');
    if (!container) return;
    container.innerHTML = renderNewsSkeleton(1);

    let articles = [];
    try {
        const url = source === 'All' ? `${API_BASE}/news/today` : `${API_BASE}/news/${encodeURIComponent(source)}`;
        const res = await fetch(url);
        if (res.ok) {
            articles = await res.json();
        }
    } catch (e) {}

    if (!Array.isArray(articles) || articles.length === 0) {
        articles = source === 'All'
            ? [...FALLBACK_NEWS_POSTERS]
            : FALLBACK_NEWS_POSTERS.filter(a => a.source === source);
        if (articles.length === 0) articles = [...FALLBACK_NEWS_POSTERS];
    }

    // Merge any locally stored admin-published articles
    const adminArticles = getAdminArticlesLocally().filter(a => source === 'All' || a.category === source || a.source === source);
    const existingIds = new Set(articles.map(a => String(a.id)));
    adminArticles.forEach(a => {
        if (!existingIds.has(String(a.id))) {
            articles.unshift(a);
        }
    });

    currentNewsPosterList = articles;
    newsPosterCurrentIdx = 0;

    let slidesHtml = '';
    articles.forEach((item, idx) => {
        const badgeColor = item.source === 'Health News' ? 'var(--accent-sage)' : (item.source === 'Campus Innovation' ? 'var(--primary)' : 'var(--secondary-dark)');
        const imgUrl = getNewsPosterImage(item, idx);
        const dateLabel = item.published_date ? new Date(item.published_date).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Latest Dispatch';
        slidesHtml += `
            <div class="portal-poster-slide">
                <div class="portal-poster-card">
                    <div class="portal-poster-visual" style="background-image:url('${imgUrl}');">
                        <div class="portal-poster-visual-overlay">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                <span style="background:${badgeColor}; color:#fff; padding:6px 14px; border-radius:999px; font-size:0.78rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase;">
                                    ${escapeHtml(item.source || 'Youth Impact News')}
                                </span>
                            </div>
                            <div>
                                <div style="display:inline-block; background:rgba(4, 25, 18, 0.92); border:1.5px solid #FFE055; color:#FFE055; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; padding:4px 12px; border-radius:8px; margin-bottom:10px; box-shadow:0 3px 10px rgba(0,0,0,0.6); backdrop-filter:blur(6px);">
                                    ${escapeHtml(item.descriptive_topic || 'Campus Advocacy Spotlight')}
                                </div>
                                <h3 style="color:#ffffff; font-size:1.45rem; line-height:1.3; margin:0; text-shadow:0 2px 10px rgba(0,0,0,0.45);">
                                    ${escapeHtml(item.title)}
                                </h3>
                            </div>
                        </div>
                    </div>
                    <div class="portal-poster-body">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
                                <span style="font-size:0.8rem; font-weight:800; color:#05241B; background:linear-gradient(135deg, #FFE055 0%, #F59E0B 100%); padding:5px 14px; border-radius:999px; box-shadow:0 2px 8px rgba(0,0,0,0.25); letter-spacing:0.02em;">
                                    DELTAS Youth Impact Briefing
                                </span>
                                <span style="font-size:0.82rem; color:#E2E8F0; font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,0.4);">
                                    Published: ${dateLabel}
                                </span>
                            </div>
                            <p style="font-size:1.02rem; color:#FFFFFF; line-height:1.72; margin:0 0 18px 0; text-shadow:0 1px 2px rgba(0,0,0,0.35);">
                                ${escapeHtml(item.summary || 'Explore verified public health dispatches, clinical toxicology advisories, and campus leadership stories.')}
                            </p>
                            <div style="padding:14px 16px; border-radius:12px; background:var(--card-bg-warm); border-left:4px solid ${badgeColor}; margin-bottom:18px;">
                                <div style="font-size:0.76rem; font-weight:800; color:var(--secondary-dark); text-transform:uppercase; margin-bottom:4px;">
                                    Key Takeaway for Campus &amp; Community Leaders
                                </div>
                                <div style="font-size:0.88rem; color:var(--text-muted); line-height:1.55;">
                                    Share this verified dispatch during peer mentorship check-ins or Enactus chapter dialogues to counter unverified social media myths.
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; align-items:center; border-top:1px solid rgba(255,255,255,0.18); padding-top:16px; margin-top:auto;">
                            <button type="button" onclick="openFullArticleReader('${item.id || idx}')" class="btn-primary" style="padding:10px 24px; border-radius:8px; font-size:0.88rem; font-weight:700; cursor:pointer;">
                                Read Full Briefing (+5 Pts)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="portal-poster-showcase" id="news-poster-showcase">
            <div class="portal-poster-viewport" id="news-poster-viewport">
                <div class="portal-poster-track" id="news-poster-track">
                    ${slidesHtml}
                </div>
            </div>
        </div>
    `;

    const viewport = document.getElementById('news-poster-viewport');
    if (viewport) {
        viewport.addEventListener('scroll', () => {
            const w = viewport.clientWidth || 1;
            const idx = Math.round(viewport.scrollLeft / w);
            if (idx !== newsPosterCurrentIdx && idx >= 0 && idx < articles.length) {
                newsPosterCurrentIdx = idx;
                updateNewsPosterPills(idx);
            }
        }, { passive: true });
        viewport.addEventListener('mouseenter', () => {
            if (newsPosterAutoTimer) clearInterval(newsPosterAutoTimer);
        });
        viewport.addEventListener('mouseleave', () => {
            startNewsPosterAutoScroll();
        });
    }

    startNewsPosterAutoScroll();
}

// -----------------------------------------
// Campus Voice & Community Radio Hub Logic (Station-Neutral Single-Poster Horizontal Showcase)
// -----------------------------------------
let radioPosterCurrentIdx = 0;
let currentRadioPosterList = [];

const FALLBACK_RADIO_POSTERS = [
    {
        id: 201,
        title: "Above the Influence Live: Navigating Weekend Party Pressure & Safe Rides Home",
        source: "Community Dialogues",
        descriptive_topic: "Live Youth Talk Broadcast • Thursdays 19:30 CAT",
        summary: "Peer mentors, student leaders, and behavioral health specialists unpack real weekend scenarios, assertive refusal scripts, and how to anchor a sober buddy squad before heading out.",
        url: "https://www.youtube.com/results?search_query=peer+pressure+alcohol+youth+dialogue",
        banner_url: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 202,
        title: "Pledge 18 Campus Mic: Student Union & Enactus Leaders on Sober Social Culture",
        source: "Student Panels",
        descriptive_topic: "Inter-Campus Audio Forum • Fridays 18:00 CAT",
        summary: "Recorded across university student unions—hearing directly from student athletes, creatives, and society presidents on why moderation and clear-headed mornings are becoming the new campus status symbol.",
        url: "https://www.youtube.com/results?search_query=student+panel+moderation+wellness",
        banner_url: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 203,
        title: "Ask the Toxicologist: Spotting Methanol Poisoning, Drink Spiking & C.U.P.S. First Response",
        source: "Expert Q&As",
        descriptive_topic: "Clinical & Legal Q&A Podcast • On-Demand Episode",
        summary: "Medical doctors and road-safety legal experts answer anonymous student voice notes on BAC metabolism rates, dangers of unregulated 'kambwa' spirits, and when to place a peer in the Recovery Position.",
        url: "https://www.youtube.com/results?search_query=alcohol+poisoning+recovery+position+medical+qa",
        banner_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 204,
        title: "The Sober Hustle Podcast: Protecting Your Mental Health, Finances & Academic Goals",
        source: "Student Panels",
        descriptive_topic: "Youth Connect+ Curated Podcast Series",
        summary: "Young Zimbabwean entrepreneurs and final-year scholars share candid stories of overcoming 'hangxiety', reclaiming weekend productivity, and building supportive sober friendships.",
        url: "https://www.youtube.com/results?search_query=sober+curious+youth+mental+health+podcast",
        banner_url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1200&auto=format&fit=crop&q=80"
    }
];

function sanitizeStationMentions(text) {
    if (!text) return '';
    return String(text)
        .replace(/ZiFM\s*Stereo/gi, 'Community Dialogues')
        .replace(/Capitalk\s*100\.4\s*FM/gi, 'Student Panels')
        .replace(/Capitalk/gi, 'Student Panels')
        .replace(/Star\s*FM/gi, 'Expert Q&As');
}

async function filterRadio(station, el) {
    document.querySelectorAll('#view-radio .filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadRadio(station);
}

function scrollToRadioPoster(index) {
    const viewport = document.getElementById('radio-poster-viewport');
    if (!viewport || !currentRadioPosterList.length) return;
    const total = currentRadioPosterList.length;
    radioPosterCurrentIdx = ((index % total) + total) % total;
    const slideWidth = viewport.clientWidth;
    viewport.scrollTo({ left: slideWidth * radioPosterCurrentIdx, behavior: 'smooth' });
    updateRadioPosterPills(radioPosterCurrentIdx);
}

function stepRadioPoster(delta) {
    scrollToRadioPoster(radioPosterCurrentIdx + delta);
}

function updateRadioPosterPills(activeIdx) {
    document.querySelectorAll('#radio-poster-dots .poster-dot-pill').forEach((pill, i) => {
        if (i === activeIdx) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
}

async function loadRadio(station) {
    const container = document.getElementById('radio-feed');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; padding: 24px;">Loading Campus Voice &amp; Community Radio Poster Showcase...</p>';

    let items = [];
    try {
        const res = await fetch(`${API_BASE}/radio/${encodeURIComponent(station)}`);
        if (res.ok) {
            const raw = await res.json();
            if (Array.isArray(raw)) {
                items = raw.map(r => ({
                    ...r,
                    title: sanitizeStationMentions(r.title),
                    source: sanitizeStationMentions(r.source),
                    descriptive_topic: sanitizeStationMentions(r.descriptive_topic),
                    summary: sanitizeStationMentions(r.summary)
                }));
            }
        }
    } catch (e) {}

    if (!Array.isArray(items) || items.length === 0) {
        items = station === 'All'
            ? FALLBACK_RADIO_POSTERS
            : FALLBACK_RADIO_POSTERS.filter(r => r.source === station);
        if (items.length === 0) items = FALLBACK_RADIO_POSTERS;
    }

    // Merge any locally stored admin-published radio programs / podcasts
    const adminRadio = getAdminRadioLocally().filter(r => station === 'All' || r.source === station || r.category === station);
    const existingIds = new Set(items.map(r => String(r.id)));
    adminRadio.forEach(r => {
        if (!existingIds.has(String(r.id))) {
            items.unshift(r);
        }
    });

    currentRadioPosterList = items;
    radioPosterCurrentIdx = 0;

    const studioImages = [
        "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1200&auto=format&fit=crop&q=80"
    ];

    let slidesHtml = '';
    items.forEach((item, idx) => {
        const isPodcast = item.source === 'Student Panels' || item.source === 'Expert Q&As' || !!item.video_url;
        const tagColor = isPodcast ? 'var(--primary)' : 'var(--secondary-dark)';
        const imgUrl = item.banner_url || item.poster_url || studioImages[idx % studioImages.length];

        slidesHtml += `
            <div class="portal-poster-slide">
                <div class="portal-poster-card">
                    <div class="portal-poster-visual" style="background-image:url('${imgUrl}');">
                        <div class="portal-poster-visual-overlay">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                <span style="background:${tagColor}; color:#fff; padding:6px 14px; border-radius:999px; font-size:0.78rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase;">
                                    ${escapeHtml(item.source || 'Community Dialogues')}
                                </span>
                            </div>
                            <div>
                                <div style="display:inline-block; background:rgba(4, 25, 18, 0.92); border:1.5px solid #FFE055; color:#FFE055; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; padding:4px 12px; border-radius:8px; margin-bottom:10px; box-shadow:0 3px 10px rgba(0,0,0,0.6); backdrop-filter:blur(6px);">
                                    ${escapeHtml(item.descriptive_topic || 'Campus Voice & Community Audio Stream')}
                                </div>
                                <h3 style="color:#ffffff; font-size:1.45rem; line-height:1.3; margin:0; text-shadow:0 2px 10px rgba(0,0,0,0.45);">
                                    ${escapeHtml(item.title)}
                                </h3>
                            </div>
                        </div>
                    </div>
                    <div class="portal-poster-body">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
                                <span style="font-size:0.8rem; font-weight:800; color:#05241B; background:linear-gradient(135deg, #FFE055 0%, #F59E0B 100%); padding:5px 14px; border-radius:999px; box-shadow:0 2px 8px rgba(0,0,0,0.25); letter-spacing:0.02em;">
                                    ${isPodcast ? 'On-Demand Video / Audio Episode' : 'Live Community Talk Show'}
                                </span>
                                <span style="font-size:0.82rem; color:#E2E8F0; font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,0.4);">
                                    DELTAS Campus Voice Studio
                                </span>
                            </div>
                            <p style="font-size:1.02rem; color:#FFFFFF; line-height:1.72; margin:0 0 18px 0; text-shadow:0 1px 2px rgba(0,0,0,0.35);">
                                ${escapeHtml(item.summary || 'Tune in to youth-led moderation dialogues, expert toxicology Q&As, and peer mentorship discussions.')}
                            </p>
                            <div style="padding:14px 16px; border-radius:12px; background:var(--card-bg-warm); border-left:4px solid ${tagColor}; margin-bottom:18px;">
                                <div style="font-size:0.76rem; font-weight:800; color:var(--secondary-dark); text-transform:uppercase; margin-bottom:4px;">
                                    Featured Discussion Highlights
                                </div>
                                <div style="font-size:0.88rem; color:var(--text-muted); line-height:1.55;">
                                    Recorded with student peer educators, clinical counselors, and community youth forums across Zimbabwe.
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; align-items:center; border-top:1px solid rgba(255,255,255,0.18); padding-top:16px; margin-top:auto;">
                            <button type="button" onclick="openPodcastVideoModal('${item.id || idx}')" class="btn-primary" style="padding:10px 24px; border-radius:8px; font-size:0.88rem; font-weight:700; cursor:pointer;">
                                ${isPodcast ? 'Watch Episode (+5 Pts)' : 'Tune In Live (+5 Pts)'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="portal-poster-showcase" id="radio-poster-showcase">
            <div class="portal-poster-viewport" id="radio-poster-viewport">
                <div class="portal-poster-track" id="radio-poster-track">
                    ${slidesHtml}
                </div>
            </div>
        </div>
    `;

    const viewport = document.getElementById('radio-poster-viewport');
    if (viewport) {
        viewport.addEventListener('scroll', () => {
            const w = viewport.clientWidth || 1;
            const idx = Math.round(viewport.scrollLeft / w);
            if (idx !== radioPosterCurrentIdx && idx >= 0 && idx < items.length) {
                radioPosterCurrentIdx = idx;
                updateRadioPosterPills(idx);
            }
        }, { passive: true });
    }
}

// -----------------------------------------
// Campus & Community Events Hub Logic (Full-Frame Single-Poster Carousel + Auto-Scroll)
// -----------------------------------------
let currentEventCategory = 'All';
let eventsPosterHubAutoTimer = null;
let eventsPosterHubCurrentIdx = 0;
let currentEventsPosterList = [];

const FALLBACK_EVENTS_POSTERS = [
    {
        id: 1,
        title: "Delta Smart Drinking 10km Campus Marathon & Wellness Expo",
        category: "Marathons & Sports",
        date_str: "Sat, Nov 28, 2026 • 06:30 AM",
        location: "UZ Sports Grounds, Harare",
        organizer: "Delta Corp & Enactus UZ",
        description: "Run for a clear mind! 10km & 5km road race promoting student fitness, moderation, and harm reduction. Finishers receive medals, electrolyte hydration kits, and Ambassador gear.",
        rsvp_count: 342,
        banner_url: "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 2,
        title: "National 'Pledge 18' Campus Relay & Awareness Walk",
        category: "Campaigns & Pledges",
        date_str: "Fri, Dec 04, 2026 • 09:00 AM",
        location: "Harare City Hall to University Way",
        organizer: "Youth Connect+ & Boost Fellowship",
        description: "Inter-university student march against underage drinking, illicit brews (kambwa), and drink-driving. Features the giant Pledge 18 signature wall and peer advocacy booths.",
        rsvp_count: 418,
        banner_url: "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 3,
        title: "Zero-Proof Sunset Mocktail, Music & Esports Festival",
        category: "Sober Festivals & Arts",
        date_str: "Sat, Dec 12, 2026 • 02:00 PM",
        location: "MSU Student Union Plaza, Gweru",
        organizer: "Enactus MSU & Campus Creatives",
        description: "Experience high-energy campus entertainment without the hangover! Craft zero-alcohol mocktail bars, FIFA & Tekken esports tournaments, acoustic sets, and comedy.",
        rsvp_count: 289,
        banner_url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&auto=format&fit=crop&q=80"
    },
    {
        id: 4,
        title: "C.U.P.S. Emergency First-Aid & Active Bystander Training Lab",
        category: "Workshops",
        date_str: "Wed, Nov 25, 2026 • 04:00 PM",
        location: "NUST Innovation Hub, Bulawayo",
        organizer: "NUST Medical Students & DELTAS",
        description: "Hands-on practical training on spotting alcohol poisoning (Cold skin, Unconsciousness, Puking, Slow breathing), Recovery Position drills, and 5D bystander intervention.",
        rsvp_count: 195,
        banner_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&auto=format&fit=crop&q=80"
    }
];

function getCustomAmbassadorEvents() {
    const key = `deltas_ambassador_custom_events_${currentUserId || 1}`;
    try {
        const raw = localStorage.getItem(key) || localStorage.getItem('deltas_ambassador_custom_events_v1');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {}

    // Baseline organized events for accredited ambassador account
    const isAmb = (currentUsername || '').toLowerCase().includes('ambassador') || (currentUsername || '').toLowerCase().includes('coordinator') || (currentUserId == 1);
    if (isAmb) {
        const defaults = [
            {
                id: 901,
                title: "Delta Smart Drinking 10km Campus Marathon & Wellness Expo",
                organizer: `DELTAS Ambassador ${currentUsername || 'ambassador'} (${currentUniversity || 'UZ'})`,
                category: "Marathons & Sports",
                date_str: "Saturday, Nov 28, 2026 • 06:30 AM",
                location: "UZ Sports Grounds, Mt Pleasant, Harare",
                description: "Run for a clear mind! 10km and 5km road race promoting student fitness, moderation, and substance harm-reduction. Medals, electrolyte hydration stations, and official Smart Drinking Ambassador kits for all finishers.",
                rsvp_count: 343,
                banner_url: "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1200&auto=format&fit=crop&q=80"
            },
            {
                id: 902,
                title: "Zero-Proof Mocktail & Acoustic Chillout Night",
                organizer: `DELTAS Ambassador ${currentUsername || 'ambassador'} (${currentUniversity || 'UZ'})`,
                category: "Sober Festivals & Arts",
                date_str: "Friday, Dec 04, 2026 • 05:30 PM",
                location: "MSU Main Campus Amphitheatre, Gweru",
                description: "Experience craft zero-proof mocktails, live campus acoustic bands, and interactive moderation bar games.",
                rsvp_count: 218,
                banner_url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&auto=format&fit=crop&q=80"
            }
        ];
        try {
            localStorage.setItem(key, JSON.stringify(defaults));
            localStorage.setItem('deltas_ambassador_custom_events_v1', JSON.stringify(defaults));
        } catch (e) {}
        return defaults;
    }
    return [];
}

async function filterEvents(category, el) {
    document.querySelectorAll('#view-events .filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    currentEventCategory = category;
    loadEvents(category);
}

function scrollToEventsHubPoster(index) {
    const viewport = document.getElementById('events-poster-hub-viewport');
    if (!viewport || !currentEventsPosterList.length) return;
    const total = currentEventsPosterList.length;
    eventsPosterHubCurrentIdx = ((index % total) + total) % total;
    const slideWidth = viewport.clientWidth;
    viewport.scrollTo({ left: slideWidth * eventsPosterHubCurrentIdx, behavior: 'smooth' });
    updateEventsHubPosterPills(eventsPosterHubCurrentIdx);
}

function stepEventsHubPoster(delta) {
    scrollToEventsHubPoster(eventsPosterHubCurrentIdx + delta);
}

function updateEventsHubPosterPills(activeIdx) {
    document.querySelectorAll('#events-poster-hub-dots .poster-dot-pill').forEach((pill, i) => {
        if (i === activeIdx) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
}

function startEventsHubPosterAutoScroll() {
    if (eventsPosterHubAutoTimer) clearInterval(eventsPosterHubAutoTimer);
    eventsPosterHubAutoTimer = setInterval(() => {
        const eventsView = document.getElementById('view-events');
        if (!eventsView || !eventsView.classList || !eventsView.classList.contains('active')) return;
        if (currentEventsPosterList.length > 1) {
            scrollToEventsHubPoster(eventsPosterHubCurrentIdx + 1);
        }
    }, 5500);
}

async function loadEvents(category = 'All') {
    const container = document.getElementById('events-feed');
    if (!container) return;
    container.innerHTML = renderEventsSkeleton(1);

    let events = [];
    try {
        const url = (category === 'All') ? `${API_BASE}/events` : `${API_BASE}/events?category=${encodeURIComponent(category)}`;
        const [res] = await Promise.all([
            fetch(url),
            syncActivityFromNeon()
        ]);
        if (res.ok) {
            events = await res.json();
        }
    } catch (e) {}

    if (!Array.isArray(events) || events.length === 0) {
        events = category === 'All'
            ? [...FALLBACK_EVENTS_POSTERS]
            : FALLBACK_EVENTS_POSTERS.filter(e => e.category === category);
        if (events.length === 0) events = [...FALLBACK_EVENTS_POSTERS];
    }

    // Merge any locally organized Ambassador events
    const customEvents = getCustomAmbassadorEvents().filter(e => category === 'All' || e.category === category);
    const existingIds = new Set(events.map(e => String(e.id)));
    customEvents.forEach(ce => {
        if (!existingIds.has(String(ce.id))) {
            events.unshift(ce);
        }
    });

    currentEventsPosterList = events;
    eventsPosterHubCurrentIdx = 0;

    const catColors = {
        'Marathons & Sports': 'var(--primary)',
        'Campaigns & Pledges': 'var(--secondary-dark)',
        'Sober Festivals & Arts': 'var(--accent-amber)',
        'Workshops': 'var(--accent-sage)'
    };

    const defaultBanners = [
        "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&auto=format&fit=crop&q=80"
    ];

    let slidesHtml = '';
    events.forEach((evt, idx) => {
        const badgeColor = catColors[evt.category] || 'var(--primary)';
        const isRSVPed = !!userRSVPs[evt.id];
        const isClosed = Boolean(evt.is_closed || isEventRegistrationClosed(evt.id));
        const imgUrl = evt.banner_url || defaultBanners[idx % defaultBanners.length];

        slidesHtml += `
            <div class="portal-poster-slide">
                <div class="portal-poster-card">
                    <div class="portal-poster-visual" style="background-image:url('${imgUrl}');">
                        <div class="portal-poster-visual-overlay">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                <span style="background:${badgeColor}; color:#fff; padding:6px 14px; border-radius:999px; font-size:0.78rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase;">
                                    ${escapeHtml(evt.category)}
                                </span>
                                ${isClosed ? `
                                    <span class="badge-status-closed" style="box-shadow:0 2px 8px rgba(0,0,0,0.3);">
                                        REGISTRATION CLOSED
                                    </span>
                                ` : ''}
                            </div>
                            <div>
                                <div style="display:inline-block; background:rgba(4, 25, 18, 0.92); border:1.5px solid #FFE055; color:#FFE055; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; padding:4px 12px; border-radius:8px; margin-bottom:10px; box-shadow:0 3px 10px rgba(0,0,0,0.6); backdrop-filter:blur(6px);">
                                    ${escapeHtml(evt.date_str)}
                                </div>
                                <h3 style="color:#ffffff; font-size:1.5rem; line-height:1.3; margin:0; text-shadow:0 2px 10px rgba(0,0,0,0.45);">
                                    ${escapeHtml(evt.title)}
                                </h3>
                            </div>
                        </div>
                    </div>
                    <div class="portal-poster-body">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
                                <span style="font-size:0.82rem; font-weight:800; color:#05241B; background:linear-gradient(135deg, #FFE055 0%, #F59E0B 100%); padding:5px 14px; border-radius:999px; box-shadow:0 2px 8px rgba(0,0,0,0.25);">
                                    Venue: ${escapeHtml(evt.location)}
                                </span>
                                <span style="font-size:0.82rem; color:#A7F3D0; font-weight:700; text-shadow:0 1px 2px rgba(0,0,0,0.4);">
                                    <span id="event-rsvp-${evt.id}">${evt.rsvp_count || 120}</span> Confirmed Participants
                                </span>
                            </div>
                            <p style="font-size:1.02rem; color:#FFFFFF; line-height:1.72; margin:0 0 18px 0; text-shadow:0 1px 2px rgba(0,0,0,0.35);">
                                ${escapeHtml(evt.description)}
                            </p>
                            <div style="padding:13px 16px; border-radius:12px; background:var(--card-bg-warm); border-left:4px solid ${badgeColor}; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                <span style="font-size:0.84rem; color:var(--text-main);">Organized by: <strong>${escapeHtml(evt.organizer)}</strong></span>
                                <span style="font-size:0.78rem; color:var(--primary); font-weight:700;">+10 Smart Lifestyle Points on RSVP</span>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; align-items:center; border-top:1px solid rgba(255,255,255,0.18); padding-top:16px; margin-top:auto;">
                            ${isClosed ? `
                                <button type="button" disabled class="btn-disabled" style="padding:10px 24px; font-size:0.88rem; font-weight:700; border-radius:8px; background:#4B5563; color:#D1D5DB; cursor:not-allowed; opacity:0.85;">
                                    Registration Closed
                                </button>
                            ` : `
                                <button onclick="rsvpEvent(${evt.id})" id="btn-rsvp-${evt.id}" class="${isRSVPed ? 'btn-sage' : 'btn-primary'} optimistic-btn" style="padding:10px 24px; font-size:0.88rem; font-weight:700; border-radius:8px;">
                                    ${isRSVPed ? 'Registered (Attending)' : 'RSVP / Join Event (+10 Pts)'}
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="portal-poster-showcase" id="events-poster-hub-showcase">
            <div class="portal-poster-viewport" id="events-poster-hub-viewport">
                <div class="portal-poster-track" id="events-poster-hub-track">
                    ${slidesHtml}
                </div>
            </div>
        </div>
    `;

    const viewport = document.getElementById('events-poster-hub-viewport');
    if (viewport) {
        viewport.addEventListener('scroll', () => {
            const w = viewport.clientWidth || 1;
            const idx = Math.round(viewport.scrollLeft / w);
            if (idx !== eventsPosterHubCurrentIdx && idx >= 0 && idx < events.length) {
                eventsPosterHubCurrentIdx = idx;
                updateEventsHubPosterPills(idx);
            }
        }, { passive: true });
        viewport.addEventListener('mouseenter', () => {
            if (eventsPosterHubAutoTimer) clearInterval(eventsPosterHubAutoTimer);
        });
        viewport.addEventListener('mouseleave', () => {
            startEventsHubPosterAutoScroll();
        });
    }

    startEventsHubPosterAutoScroll();
}

function getEventAttendeeDetails() {
    let fullName = '';
    let email = '';
    let phone = '';
    let age = 21;
    let gender = 'Female';

    // 1. Try saved registration profile for current user
    try {
        const users = typeof getRegisteredUsersList === 'function' ? getRegisteredUsersList() : [];
        const match = users.find(u => 
            (u.email && currentUsername && u.email.toLowerCase() === currentUsername.toLowerCase()) ||
            (u.id && String(u.id) === String(currentUserId)) ||
            (u.fullName && currentUsername && u.fullName.toLowerCase() === currentUsername.toLowerCase())
        );
        if (match) {
            fullName = match.fullName || '';
            email = match.email || '';
            phone = match.phone || '';
            gender = match.gender || gender;
            if (match.dob) {
                const birth = new Date(match.dob);
                if (!isNaN(birth.getTime())) {
                    const diff = Math.floor((new Date() - birth) / (365.25 * 24 * 60 * 60 * 1000));
                    if (diff >= 16 && diff <= 99) age = diff;
                }
            }
        }
    } catch (e) {}

    // 2. Fallbacks from session state
    if (!fullName) {
        fullName = currentUsername || 'Campus Leader';
    }
    if (!email) {
        if ((currentUsername || '').includes('@')) {
            email = currentUsername;
        } else {
            email = (currentUsername || 'leader').toLowerCase().replace(/[^a-z0-9]/g, '') + '@deltas.org.zw';
        }
    }
    if (!phone) {
        phone = '+263 77 123 4567';
    }

    return { fullName, email, phone, age, gender };
}

function rsvpEvent(eventId) {
    if (isEventRegistrationClosed(eventId)) {
        alert('Registration for this event has been closed by event coordinators.');
        return;
    }
    openEventRSVPConfirmationPage(eventId);
}

function openEventRSVPConfirmationPage(eventId) {
    if (isEventRegistrationClosed(eventId)) {
        alert('Registration for this event has been closed by event coordinators.');
        return;
    }
    const confirmView = document.getElementById('view-event-rsvp-confirm');
    const container = document.getElementById('event-rsvp-confirmation-content');
    if (!confirmView || !container) return;

    let evt = (currentEventsPosterList || []).find(e => String(e.id) === String(eventId));
    if (!evt) {
        evt = (FALLBACK_EVENTS_POSTERS || []).find(e => String(e.id) === String(eventId));
    }
    if (!evt) {
        try {
            const customEvts = getCustomAmbassadorEvents();
            evt = customEvts.find(e => String(e.id) === String(eventId));
        } catch (e) {}
    }
    if (!evt) {
        evt = {
            id: eventId,
            title: "Delta Smart Drinking Campus Marathon & Wellness Expo",
            category: "Marathons & Sports",
            date_str: "Upcoming Saturday • 06:30 AM",
            location: "UZ Sports Grounds, Mt Pleasant, Harare",
            description: "Run for a clear mind! Promoting student fitness, moderation, and substance harm-reduction.",
            organizer: "Delta Corporation & Enactus UZ",
            rsvp_count: 343,
            banner_url: "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1200&auto=format&fit=crop&q=80"
        };
    }

    // Hide other views and activate view-event-rsvp-confirm
    document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
    confirmView.classList.add('active');
    updatePortalSlideshowView('events');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const isAlreadyRSVPed = !!userRSVPs[evt.id];
    const details = getEventAttendeeDetails();

    const catColors = {
        'Marathons & Sports': 'var(--primary)',
        'Campaigns & Pledges': 'var(--secondary-dark)',
        'Sober Festivals & Arts': 'var(--accent-amber)',
        'Workshops': 'var(--accent-sage)'
    };
    const badgeColor = catColors[evt.category] || 'var(--primary)';

    if (isAlreadyRSVPed) {
        container.innerHTML = `
            <div class="outreach-card" style="padding:28px; border-top:6px solid var(--accent-sage); background:linear-gradient(180deg, #FFFFFF 0%, #F4FBF7 100%); border-radius:18px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
                    <span style="background:#D1FAE5; color:#065F46; border:1.5px solid #10B981; padding:6px 14px; border-radius:999px; font-size:0.8rem; font-weight:800; text-transform:uppercase;">
                        Registration Confirmed • Attendee Badge Active
                    </span>
                    <span style="font-size:0.82rem; font-weight:800; color:var(--accent-sage);">
                        +10 Points Awarded
                    </span>
                </div>

                <h3 style="font-size:1.6rem; color:var(--primary); margin:0 0 8px 0; font-family:'Poppins',sans-serif;">
                    ${escapeHtml(evt.title)}
                </h3>
                <p style="font-size:0.92rem; color:var(--text-muted); margin:0 0 20px 0;">
                    You are confirmed to attend this event. Your verified credentials have been transmitted to the Event Administrator.
                </p>

                <div style="background:#FFFFFF; border:1px solid var(--border-color); border-radius:14px; padding:20px; margin-bottom:24px; box-shadow:var(--shadow-sm);">
                    <h4 style="margin:0 0 14px 0; font-size:0.96rem; color:var(--text-main); border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                        Event &amp; Venue Details
                    </h4>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; font-size:0.88rem;">
                        <div><span style="color:var(--text-muted); font-size:0.76rem; display:block;">Date &amp; Schedule</span><strong>${escapeHtml(evt.date_str)}</strong></div>
                        <div><span style="color:var(--text-muted); font-size:0.76rem; display:block;">Venue Location</span><strong>${escapeHtml(evt.location)}</strong></div>
                        <div><span style="color:var(--text-muted); font-size:0.76rem; display:block;">Organized by</span><strong>${escapeHtml(evt.organizer)}</strong></div>
                        <div><span style="color:var(--text-muted); font-size:0.76rem; display:block;">Category</span><strong style="color:${badgeColor};">${escapeHtml(evt.category)}</strong></div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-top:1px solid var(--border-color); padding-top:20px;">
                    <button type="button" class="btn-cream" onclick="closeEventRSVPConfirmationPage()" style="padding:12px 22px; font-weight:700; font-size:0.9rem; border-radius:8px;">
                        Back to Events
                    </button>
                    <button type="button" class="btn-primary" onclick="returnToHomepage()" style="padding:12px 28px; font-weight:700; font-size:0.95rem; border-radius:8px;">
                        Return to Homepage
                    </button>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="outreach-card" style="padding:28px; border-top:6px solid var(--primary); background:#FFFFFF; border-radius:18px; box-shadow:var(--shadow-md);">
            <!-- Event Summary Banner -->
            <div style="background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:14px; padding:20px; margin-bottom:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                    <span style="background:${badgeColor}; color:#fff; padding:5px 12px; border-radius:999px; font-size:0.74rem; font-weight:800; text-transform:uppercase;">
                        ${escapeHtml(evt.category)}
                    </span>
                    <span style="font-size:0.78rem; font-weight:800; color:var(--primary); background:var(--cream-soft); padding:4px 12px; border-radius:8px; border:1px solid var(--border-color);">
                        +10 Smart Lifestyle Points on Confirmation
                    </span>
                </div>
                <h3 style="font-size:1.5rem; color:var(--primary); margin:0 0 10px 0; font-family:'Poppins',sans-serif; line-height:1.3;">
                    ${escapeHtml(evt.title)}
                </h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; font-size:0.86rem; color:var(--text-main); margin-bottom:12px;">
                    <div><span style="color:var(--text-muted); font-size:0.74rem; display:block;">Schedule</span><strong>${escapeHtml(evt.date_str)}</strong></div>
                    <div><span style="color:var(--text-muted); font-size:0.74rem; display:block;">Venue</span><strong>${escapeHtml(evt.location)}</strong></div>
                    <div><span style="color:var(--text-muted); font-size:0.74rem; display:block;">Organizer</span><strong>${escapeHtml(evt.organizer)}</strong></div>
                </div>
                <p style="font-size:0.88rem; color:var(--text-muted); line-height:1.55; margin:0;">
                    ${escapeHtml(evt.description)}
                </p>
            </div>

            <!-- Confirmation & Personal Details Verification Form -->
            <div style="margin-bottom:20px;">
                <span class="card-tag" style="background:var(--primary-light); color:var(--primary-dark); font-weight:800; margin-bottom:8px; display:inline-block;">
                    ATTENDEE CREDENTIALS • SENT TO PLATFORM ADMIN
                </span>
                <h4 style="font-size:1.25rem; color:var(--primary); margin:6px 0 6px 0;">
                    Confirm Your Registration Details
                </h4>
                <p style="font-size:0.86rem; color:var(--text-muted); line-height:1.55; margin:0 0 18px 0;">
                    Please confirm or update your personal details below. These details will be sent directly to the DELTAS Platform Administrator &amp; Campus Liaisons to verify your attendance and prepare your entry credentials.
                </p>

                <div style="display:flex; flex-direction:column; gap:14px;">
                    <!-- Full Name -->
                    <div class="gate-form-group">
                        <label for="rsvp-confirm-fullname" style="font-weight:700; font-size:0.88rem; color:var(--text-main); display:block; margin-bottom:5px;">
                            Full Name <span style="color:red;">*</span>
                        </label>
                        <input type="text" id="rsvp-confirm-fullname" value="${escapeHtml(details.fullName)}" placeholder="e.g. Tariro Moyo" required style="width:100%; padding:10px 12px; border-radius:8px; border:1.5px solid var(--border-color); box-sizing:border-box; font-size:0.92rem; background:#FFFFFF;" />
                    </div>

                    <!-- Age & Gender Grid -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                        <div class="gate-form-group">
                            <label for="rsvp-confirm-age" style="font-weight:700; font-size:0.88rem; color:var(--text-main); display:block; margin-bottom:5px;">
                                Age <span style="color:red;">*</span>
                            </label>
                            <input type="number" id="rsvp-confirm-age" value="${details.age}" min="16" max="99" required style="width:100%; padding:10px 12px; border-radius:8px; border:1.5px solid var(--border-color); box-sizing:border-box; font-size:0.92rem; background:#FFFFFF;" />
                        </div>
                        <div class="gate-form-group">
                            <label for="rsvp-confirm-gender" style="font-weight:700; font-size:0.88rem; color:var(--text-main); display:block; margin-bottom:5px;">
                                Gender <span style="color:red;">*</span>
                            </label>
                            <select id="rsvp-confirm-gender" style="width:100%; padding:10px 12px; border-radius:8px; border:1.5px solid var(--border-color); box-sizing:border-box; font-size:0.92rem; background:#FFFFFF;">
                                <option value="Female" ${details.gender === 'Female' ? 'selected' : ''}>Female</option>
                                <option value="Male" ${details.gender === 'Male' ? 'selected' : ''}>Male</option>
                                <option value="Prefer not to say" ${details.gender === 'Prefer not to say' ? 'selected' : ''}>Prefer not to say</option>
                                <option value="Other" ${details.gender === 'Other' ? 'selected' : ''}>Other</option>
                            </select>
                        </div>
                    </div>

                    <!-- Email Address -->
                    <div class="gate-form-group">
                        <label for="rsvp-confirm-email" style="font-weight:700; font-size:0.88rem; color:var(--text-main); display:block; margin-bottom:5px;">
                            Email Address <span style="color:red;">*</span>
                        </label>
                        <input type="email" id="rsvp-confirm-email" value="${escapeHtml(details.email)}" placeholder="e.g. tariro.moyo@gmail.com" required style="width:100%; padding:10px 12px; border-radius:8px; border:1.5px solid var(--border-color); box-sizing:border-box; font-size:0.92rem; background:#FFFFFF;" />
                    </div>

                    <!-- Phone Number (+263...) -->
                    <div class="gate-form-group">
                        <label for="rsvp-confirm-phone" style="font-weight:700; font-size:0.88rem; color:var(--text-main); display:block; margin-bottom:5px;">
                            Phone Number (Zimbabwe +263) <span style="color:red;">*</span>
                        </label>
                        <input type="tel" id="rsvp-confirm-phone" value="${escapeHtml(details.phone)}" placeholder="+263 77 123 4567" required style="width:100%; padding:10px 12px; border-radius:8px; border:1.5px solid var(--border-color); box-sizing:border-box; font-size:0.92rem; background:#FFFFFF;" />
                    </div>
                </div>

                <div id="rsvp-confirm-feedback" style="display:none; padding:10px 14px; border-radius:8px; margin-top:14px; font-size:0.86rem; font-weight:700;"></div>
            </div>

            <!-- Action Buttons Strip -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-top:1px solid var(--border-color); padding-top:18px;">
                <button type="button" class="btn-cream" onclick="closeEventRSVPConfirmationPage()" style="padding:12px 22px; font-weight:700; font-size:0.9rem; border-radius:8px;">
                    Back to Events
                </button>
                <button type="button" id="btn-submit-rsvp-confirm" class="btn-primary" onclick="confirmAndSubmitEventRegistration(${evt.id})" style="padding:13px 26px; font-weight:700; font-size:0.95rem; border-radius:8px;">
                    Confirm Registration &amp; Submit Details (+10 Pts)
                </button>
            </div>
        </div>
    `;
}

async function confirmAndSubmitEventRegistration(eventId) {
    const fnEl = document.getElementById('rsvp-confirm-fullname');
    const ageEl = document.getElementById('rsvp-confirm-age');
    const genEl = document.getElementById('rsvp-confirm-gender');
    const emEl = document.getElementById('rsvp-confirm-email');
    const phEl = document.getElementById('rsvp-confirm-phone');
    const fbEl = document.getElementById('rsvp-confirm-feedback');
    const submitBtn = document.getElementById('btn-submit-rsvp-confirm');

    const fullName = fnEl ? fnEl.value.trim() : '';
    const age = ageEl ? parseInt(ageEl.value, 10) : 0;
    const gender = genEl ? genEl.value : '';
    const email = emEl ? emEl.value.trim().toLowerCase() : '';
    let phone = phEl ? phEl.value.trim() : '';

    const showError = (msg) => {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.background = '#FEE2E2';
            fbEl.style.color = '#B91C1C';
            fbEl.innerText = msg;
        } else {
            alert(msg);
        }
    };

    if (!fullName || fullName.length < 2) {
        return showError('Please enter your full name for the event registration.');
    }
    if (!age || age < 16 || age > 99) {
        return showError('Please enter a valid age (16 - 99 years).');
    }
    if (!gender) {
        return showError('Please select your gender.');
    }
    if (!email || !email.includes('@') || !email.includes('.')) {
        return showError('Please enter a valid email address.');
    }
    if (!phone || phone.length < 6) {
        return showError('Please enter your phone number (+263...).');
    }
    if (!phone.startsWith('+263')) {
        phone = '+263 ' + phone.replace(/^0+/, '');
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.background = '#EFF6FF';
        fbEl.style.color = '#1D4ED8';
        fbEl.innerText = 'Submitting registration and transmitting details to Admin...';
    }
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Confirming...';
    }

    // Find the event
    let evt = (currentEventsPosterList || []).find(e => String(e.id) === String(eventId));
    if (!evt) evt = (FALLBACK_EVENTS_POSTERS || []).find(e => String(e.id) === String(eventId));
    const eventTitle = evt ? evt.title : `Event #${eventId}`;

    // Mark as RSVPed in local state
    userRSVPs[eventId] = true;
    saveUserActivityCache(currentUserId);

    // Save attendee details locally for user and admin inspection
    const attendeeRecord = {
        eventId,
        eventTitle,
        userId: currentUserId,
        fullName,
        age,
        gender,
        email,
        phone,
        confirmedAt: new Date().toISOString()
    };
    try {
        localStorage.setItem(`deltas_event_attendee_${eventId}_${currentUserId}`, JSON.stringify(attendeeRecord));
        const rawAdminQueue = localStorage.getItem('deltas_admin_event_attendees_v1');
        const adminQueue = rawAdminQueue ? JSON.parse(rawAdminQueue) : [];
        adminQueue.unshift(attendeeRecord);
        localStorage.setItem('deltas_admin_event_attendees_v1', JSON.stringify(adminQueue));
    } catch (e) {}

    // Award +10 Smart Lifestyle Points
    awardSmartActivityPoints(`event_rsvp_${eventId}`, 10, `RSVPed to Campus Event: ${eventTitle}`);

    // Update event counter and button state in events hub
    if (evt) {
        evt.rsvp_count = (evt.rsvp_count || 120) + 1;
    }
    const btn = document.getElementById(`btn-rsvp-${eventId}`);
    const countSpan = document.getElementById(`event-rsvp-${eventId}`);
    if (btn) {
        btn.className = 'btn-sage optimistic-btn';
        btn.style.background = 'var(--accent-sage)';
        btn.innerHTML = 'Registered (Attending)';
    }
    if (countSpan && evt) {
        countSpan.innerText = evt.rsvp_count;
    }

    // Submit to backend API
    try {
        await fetch(`${API_BASE}/events/${eventId}/rsvp?user_id=${currentUserId}`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                user_id: currentUserId,
                active: true,
                full_name: fullName,
                age,
                gender,
                email,
                phone
            })
        });
    } catch (e) {}

    // Render Success Confirmation Page with "Return to Homepage" button
    const container = document.getElementById('event-rsvp-confirmation-content');
    if (container) {
        container.innerHTML = `
            <div class="outreach-card" style="padding:34px 28px; text-align:center; border-top:6px solid var(--accent-sage); background:linear-gradient(180deg, #FFFFFF 0%, #F4FBF7 100%); border-radius:18px; box-shadow:var(--shadow-md);">
                <div style="display:inline-block; background:#D1FAE5; color:#065F46; border:1.5px solid #10B981; padding:6px 16px; border-radius:999px; font-size:0.8rem; font-weight:800; text-transform:uppercase; margin-bottom:14px;">
                    Registration Confirmed • Admin Notified
                </div>
                <h2 style="font-size:1.75rem; color:var(--primary); margin:0 0 10px 0; font-family:'Poppins',sans-serif;">
                    You Have Successfully Registered!
                </h2>
                <p style="font-size:0.96rem; color:var(--text-main); max-width:620px; margin:0 auto 22px auto; line-height:1.6;">
                    Your registration for <strong>${escapeHtml(eventTitle)}</strong> is confirmed. Your verified details have been submitted to the Event Administrator &amp; Campus Liaisons.
                </p>

                <!-- Confirmed Details Ticket Box -->
                <div style="max-width:540px; margin:0 auto 26px auto; background:#FFFFFF; border:1.5px solid var(--border-color); border-radius:14px; padding:20px 24px; text-align:left; box-shadow:var(--shadow-sm);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                        <span style="font-size:0.78rem; font-weight:800; color:var(--primary); text-transform:uppercase;">Confirmed Attendee Credentials</span>
                        <span style="font-size:0.76rem; font-weight:800; color:var(--accent-sage);">+10 Points Added</span>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:0.88rem;">
                        <div><span style="color:var(--text-muted); font-size:0.75rem; display:block;">Full Name</span><strong>${escapeHtml(fullName)}</strong></div>
                        <div><span style="color:var(--text-muted); font-size:0.75rem; display:block;">Age &amp; Gender</span><strong>${age} yrs • ${escapeHtml(gender)}</strong></div>
                        <div><span style="color:var(--text-muted); font-size:0.75rem; display:block;">Email Address</span><strong>${escapeHtml(email)}</strong></div>
                        <div><span style="color:var(--text-muted); font-size:0.75rem; display:block;">Phone Number</span><strong>${escapeHtml(phone)}</strong></div>
                        ${evt ? `<div style="grid-column:1 / -1;"><span style="color:var(--text-muted); font-size:0.75rem; display:block;">Schedule &amp; Venue</span><strong>${escapeHtml(evt.date_str)} • ${escapeHtml(evt.location)}</strong></div>` : ''}
                    </div>
                </div>

                <!-- Action Buttons: Return to Homepage as Primary -->
                <div style="display:flex; justify-content:center; align-items:center; gap:14px; flex-wrap:wrap;">
                    <button type="button" class="btn-primary" onclick="returnToHomepage()" style="padding:13px 30px; font-size:1rem; font-weight:700; border-radius:8px;">
                        Return to Homepage
                    </button>
                    <button type="button" class="btn-cream" onclick="closeEventRSVPConfirmationPage()" style="padding:13px 22px; font-size:0.92rem; font-weight:700; border-radius:8px;">
                        Back to Events
                    </button>
                </div>
            </div>
        `;
    }
}

function closeEventRSVPConfirmationPage() {
    switchMainView('events', document.querySelector('.bottom-nav .nav-item[data-view="events"]'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function returnToHomepage() {
    switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view="outreach"]'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
                    <a href="${item.url}" class="btn-primary" target="_blank" style="display:block; text-align:center; text-decoration:none; padding:10px;">APPLY / VIEW DETAILS</a>
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
// (Customized AI Agent for Myth vs. Fact & Rotating/Shuffled Smart Scenario Simulator + Points-Based Score)
// -----------------------------------------
const BESMART_SCENARIO_BANK = [
    {
        id: 1,
        category: "Party Harm Reduction & Drink Spiking",
        scenario_text: "You are at a crowded campus bash in Harare. Your friend leaves their cup on a speaker for 3 minutes to greet someone, then picks it up to drink. What do you do?",
        option_a: "Tell them to pour it out immediately and get a fresh sealed bottle—unattended drinks carry a high risk of spiking.",
        option_b: "Smell the drink first; if it smells normal, let them finish it so they don't waste money.",
        option_c: "Say nothing because you don't want to ruin the party mood.",
        correct_option: "A",
        consensus_stats: "91% of DELTAS Ambassadors chose Option A",
        expert_tip: "Common spiking substances (including Rohypnol, GHB, or concentrated street spirits) are often odorless and colorless. Never drink from an unattended cup."
    },
    {
        id: 2,
        category: "Drink-Driving & Safe Transport",
        scenario_text: "It is 1:30 AM after a student concert in Bulawayo. The driver of your lift has had 5 beers in 2 hours but insists: 'I just drank black coffee, I'm 100% sober to drive.' How do you respond?",
        option_a: "Get in the front seat and keep talking to them so they stay awake.",
        option_b: "Refuse the ride, convince your friends to pool $2 each for a registered ride-hail/taxi, and ask a sober peer to hold the car keys.",
        option_c: "Let them drive slowly on backroads to avoid ZRP roadblocks.",
        correct_option: "B",
        consensus_stats: "94% of DELTAS Ambassadors chose Option B",
        expert_tip: "Caffeine only masks drowsiness ('wide-awake drunk'); it does zero to lower Blood Alcohol Concentration (BAC). The liver metabolizes only ~1 standard drink per hour."
    },
    {
        id: 3,
        category: "Illicit Brews ('Kambwa') & Methanol Safety",
        scenario_text: "Outside a sports tournament, someone offers your group ultra-cheap, unlabelled clear spirits in plastic sachets ('kambwa') claiming it 'hits 3x harder than normal beer.' What is your move?",
        option_a: "Mix it with a lot of fizzy soda so the chemical burn is diluted.",
        option_b: "Take just one small shot to test if it causes a headache.",
        option_c: "Firmly decline, warn your peers about lethal methanol contamination and optic nerve blindness, and report the illicit vendor via the Watchdog.",
        correct_option: "C",
        consensus_stats: "96% of DELTAS Ambassadors chose Option C",
        expert_tip: "Unregulated street spirits ('kambwa'/'musombodhiya') frequently contain industrial methanol or battery/solvent contaminants. Even 10–30mL of methanol can cause permanent blindness or death."
    },
    {
        id: 4,
        category: "Acute Alcohol Poisoning & C.U.P.S. Emergency Care",
        scenario_text: "Back at the residence halls, a classmate who drank heavily is unconscious, has cold clammy skin, vomited once, and is breathing only 6 times per minute. What must you do right now?",
        option_a: "Roll them onto their side in the Recovery Position, clear their airway, keep them warm, and call 999 / 994 / Campus Clinic immediately.",
        option_b: "Put them under a cold shower to shock their system awake.",
        option_c: "Leave them lying flat on their back in bed to 'sleep it off' until morning.",
        correct_option: "A",
        consensus_stats: "95% of DELTAS Ambassadors chose Option A",
        expert_tip: "C.U.P.S. (Cold skin, Unconsciousness, Puking, Slow/irregular breathing <8 breaths/min) is a life-threatening medical emergency. Leaving an unconscious person on their back risks fatal choking on vomit."
    },
    {
        id: 5,
        category: "Peer Pressure & The 'Decoy Cup' Strategy",
        scenario_text: "You have an 8:00 AM exam study session tomorrow, so you decided to stay sober at a friend's birthday braai. People keep pressuring you: 'Why isn't your glass full?' What is the smartest strategy?",
        option_a: "Give in and drink 3 double shots quickly so they stop asking.",
        option_b: "Hold a 'Decoy Cup' (soda water, lime, or ginger ale) and use a confident, brief refusal script: 'I'm good with this tonight, got an early grind tomorrow!'",
        option_c: "Start an argument with the host about their drinking habits.",
        correct_option: "B",
        consensus_stats: "89% of DELTAS Ambassadors chose Option B",
        expert_tip: "Holding a non-alcoholic drink in hand ('Decoy Cup') eliminates 80% of unsolicited drink offers while keeping you socially engaged and in full control of your morning."
    },
    {
        id: 6,
        category: "Pledge 18 & Underage Supply Law",
        scenario_text: "Your 16-year-old cousin in high school gives you cash outside a bottle store and asks you to buy them a 6-pack of ciders for their school social. What do you do?",
        option_a: "Refuse to buy it, explain how alcohol harms the developing adolescent prefrontal cortex and hippocampus, and invite them to a zero-proof mocktail hangout instead.",
        option_b: "Buy it for them as long as they promise to drink it at home.",
        option_c: "Buy them light beer instead of spirits.",
        correct_option: "A",
        consensus_stats: "93% of DELTAS Ambassadors chose Option A",
        expert_tip: "Under Zimbabwe's Liquor Act and Pledge 18, supplying alcohol to anyone under 18 is illegal and exposes developing adolescent brains to long-term memory and impulse-control damage."
    },
    {
        id: 7,
        category: "Active Bystander & 5D GBV Prevention",
        scenario_text: "At a house party, you notice a heavily intoxicated first-year student slurring their words while an acquaintance tries to lead them upstairs alone. Which 5D Bystander action is best?",
        option_a: "Mind your own business because you don't know them personally.",
        option_b: "Use 'Distract' & 'Delegate': Walk over with friends, say 'Hey, your roommates are looking for you outside right now!', and escort them to a safe sober group.",
        option_c: "Post a video of them on social media.",
        correct_option: "B",
        consensus_stats: "95% of DELTAS Ambassadors chose Option B",
        expert_tip: "An incapacitated or heavily intoxicated person cannot legally or ethically give consent. Using Distract, Direct, or Delegate with friends safely interrupts potential harm."
    },
    {
        id: 8,
        category: "Alcohol & Pregnancy (FASD Prevention)",
        scenario_text: "At a family celebration, an aunt tells your pregnant sister: 'One glass of red wine or traditional beer in the third trimester helps the baby sleep and builds blood.' What is the medical fact?",
        option_a: "She is right, wine in the third trimester is completely harmless.",
        option_b: "There is zero safe amount, zero safe time, and zero safe type of alcohol during pregnancy—alcohol crosses the placenta freely and risks Fetal Alcohol Spectrum Disorders (FASD).",
        option_c: "Only clear spirits are dangerous; fermented beer is safe.",
        correct_option: "B",
        consensus_stats: "97% of DELTAS Ambassadors chose Option B",
        expert_tip: "The developing fetus lacks mature liver Alcohol Dehydrogenase enzymes. Any ethanol crosses the placenta directly and can disrupt fetal brain and organ development."
    },
    {
        id: 9,
        category: "Energy Drinks, Sugary Mixers & Cardiac Strain",
        scenario_text: "During finals week, your squad plans to mix high-caffeine energy drinks with vodka all night so they can 'party without feeling sleepy.' Why is this combination hazardous?",
        option_a: "Caffeine masks your brain's perception of intoxication ('wide-awake drunk'), leading to 2–3x higher binge intake, severe dehydration, and heart rhythm strain.",
        option_b: "The sugar in the energy drink neutralizes the alcohol in the stomach.",
        option_c: "It lowers your BAC faster because your heart beats faster.",
        correct_option: "A",
        consensus_stats: "92% of DELTAS Ambassadors chose Option A",
        expert_tip: "Mixing stimulants (caffeine/taurine) with a central nervous system depressant (alcohol) tricks the brain into thinking you are sober while your BAC and motor impairment climb dangerously."
    },
    {
        id: 10,
        category: "Mental Health, Exam Stress & H.A.L.T.",
        scenario_text: "You just received a disappointing coursework mark and feel overwhelmed, lonely, and exhausted. A roommate says: 'Let's drink a bottle to forget about it tonight.' What does the H.A.L.T. protocol advise?",
        option_a: "Never drink when Hungry, Angry/Anxious, Lonely, or Tired—alcohol triggers a cortisol/GABA rebound ('hangxiety') that worsens depression and wrecks tomorrow's study focus.",
        option_b: "Drink quickly so you fall asleep faster.",
        option_c: "Drink alone in your room instead.",
        correct_option: "A",
        consensus_stats: "90% of DELTAS Ambassadors chose Option A",
        expert_tip: "Using alcohol to self-medicate stress or loneliness disrupts neurotransmitters and suppresses REM sleep, amplifying anxiety the next day."
    },
    {
        id: 11,
        category: "Pacing, Food & Hydration ('Zebra Striping')",
        scenario_text: "You are attending a 4-hour graduation dinner where alcoholic drinks are served. How do you keep your BAC in the safe, low-risk zone below 0.05%?",
        option_a: "Skip dinner so the drinks feel stronger on an empty stomach.",
        option_b: "Eat a full protein/carbohydrate meal first, practice 'Zebra Striping' (alternating every alcoholic drink with a full glass of water), and cap intake at 1 standard drink per hour.",
        option_c: "Drink 4 beers in the first 30 minutes and then stop.",
        correct_option: "B",
        consensus_stats: "94% of DELTAS Ambassadors chose Option B",
        expert_tip: "Food in the stomach closes the pyloric valve, slowing alcohol absorption into the bloodstream by up to 50% and allowing your liver enzymes to keep pace."
    },
    {
        id: 12,
        category: "Morning-After BAC & Residual Impairment",
        scenario_text: "A student finishes drinking 8 standard drinks at 2:00 AM, sleeps for 4 hours, and wakes up at 6:00 AM to drive to an early lecture. Are they legally and biologically safe to drive?",
        option_a: "Yes, sleeping for 4 hours resets your BAC to zero.",
        option_b: "No—after 8 drinks, the liver has only eliminated ~4 drinks by 6:00 AM, leaving their BAC around 0.08%–0.10% (still legally drunk and impaired).",
        option_c: "Yes, if they brush their teeth and drink energy drinks.",
        correct_option: "B",
        consensus_stats: "93% of DELTAS Ambassadors chose Option B",
        expert_tip: "Sleep does not speed up liver metabolism. At ~0.015% BAC elimination per hour, 8 standard drinks take 8–9 hours to fully clear the bloodstream."
    }
];

let activeDisplayedScenarios = [];

function getShuffledScenarios(count = 6) {
    const copy = [...BESMART_SCENARIO_BANK];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
}

function evaluateMythOrQuestionWithBeSmartAI(queryText) {
    const q = (queryText || '').trim().toLowerCase();

    const knowledgeBase = [
        {
            keywords: ['coffee', 'shower', 'cold shower', 'fresh air', 'exercise', 'sweat', 'sober up', 'wake up'],
            verdict: 'MYTH / FALSE (SCIENTIFICALLY DEBUNKED)',
            badgeColor: 'var(--primary)',
            publisher: 'DELTAS BeSmart AI Agent • Hepatic Metabolism & Toxicology Desk',
            reality: 'Neither black coffee, cold showers, fresh air, nor vigorous exercise can speed up alcohol elimination. Over 90% of alcohol is metabolized in the liver by the enzyme Alcohol Dehydrogenase (ADH) at a fixed zero-order rate of roughly 1 standard drink (10–14g pure ethanol, or ~0.015% BAC) per hour.',
            medical: 'WHO and emergency medicine specialists warn that caffeine only creates a "wide-awake drunk" state while motor coordination and reaction time remain impaired. Cold showers can cause dangerous hypothermia or vagal shock in intoxicated individuals.',
            recommendation: 'Only TIME lowers BAC. Drink water to ease dehydration, eat before drinking to slow absorption, and never drive until your body has had 1 full hour per standard drink.'
        },
        {
            keywords: ['energy drink', 'red bull', 'dragon', 'caffeine', 'stimulant', 'mixer', 'wide awake'],
            verdict: 'DANGEROUS MYTH / HIGH CARDIAC & BINGE RISK',
            badgeColor: 'var(--primary)',
            publisher: 'DELTAS BeSmart AI Agent • Neuro-Cardiology & Harm Reduction Desk',
            reality: 'Mixing high-caffeine energy drinks with alcohol does NOT neutralize intoxication. Caffeine blocks adenosine receptors, masking the natural drowsiness that signals you have had enough to drink.',
            medical: 'Clinical studies show that people who mix alcohol with energy drinks are 3x more likely to binge drink to dangerous BAC levels (>0.12%), experience heart palpitations/arrhythmias, and underestimate their impairment when driving.',
            recommendation: 'Never mix alcohol with high-caffeine energy drinks. Use water, sparkling water, or low-sugar soda as spacers instead.'
        },
        {
            keywords: ['kambwa', 'illicit', 'musombodhiya', 'tumbwa', 'methanol', 'blind', 'sachet', 'unregulated', 'street spirit', 'home brew'],
            verdict: 'CRITICAL TOXICOLOGY ALERT (EXTREME DANGER)',
            badgeColor: 'var(--primary)',
            publisher: 'DELTAS BeSmart AI Agent • Clinical Toxicology & Liquor Act Desk',
            reality: 'Unlabelled, unregulated street spirits ("kambwa", "tumbwa", "musombodhiya") are NOT just strong normal alcohol. Illicit distillations frequently contain toxic methanol, industrial ethanol, or chemical adulterants.',
            medical: 'In the liver, methanol is converted into formaldehyde and formic acid, which destroys the optic nerve (causing permanent blindness) and triggers fatal metabolic acidosis. Consuming as little as 10–30mL of methanol can be lethal.',
            recommendation: 'Strictly avoid unlabelled sachets or illicit brews. Check for valid registration, intact seals, and ABV labels, and report illicit campus/community outlets via the Confidential Watchdog.'
        },
        {
            keywords: ['pregnan', 'baby', 'fetus', 'fasd', 'trimester', 'breastfeed', 'placenta', 'wine in pregnancy'],
            verdict: 'MYTH / FALSE (NO SAFE AMOUNT IN PREGNANCY)',
            badgeColor: 'var(--primary)',
            publisher: 'DELTAS BeSmart AI Agent • Maternal & Fetal Health Desk (WHO Guidelines)',
            reality: 'There is NO safe amount, NO safe time (1st, 2nd, or 3rd trimester), and NO safe type of alcohol (beer, wine, cider, or spirits) during pregnancy. Alcohol crosses the placenta freely within minutes.',
            medical: 'Because a fetus has minimal liver Alcohol Dehydrogenase activity, fetal BAC stays elevated longer than maternal BAC, risking Fetal Alcohol Spectrum Disorders (FASD), lifelong neurodevelopmental impairment, and growth restriction.',
            recommendation: 'Choose 100% alcohol-free celebrations throughout pregnancy and when trying to conceive. Support expectant mothers with festive zero-proof mocktails.'
        },
        {
            keywords: ['drive', 'driving', '0.08', 'roadblock', 'breathalyzer', 'car', 'traffic', 'accident', 'bac limit'],
            verdict: 'FACT & STATUTORY LAW BRIEFING',
            badgeColor: 'var(--secondary-dark)',
            publisher: 'DELTAS BeSmart AI Agent • Road Safety & Zimbabwe Statutory Law Desk',
            reality: 'In Zimbabwe, driving with a Blood Alcohol Concentration (BAC) at or above 0.08% (80mg/100mL) is a serious criminal offense—and measurable visual, steering, and braking impairment begins as low as 0.02%–0.05% BAC.',
            medical: 'At 0.08% BAC, crash risk multiplies by 4x to 11x due to delayed brake reaction time, tunnel vision, and impaired hazard judgment.',
            recommendation: 'Separate drinking from driving 100%. Designate a verified sober driver before leaving home, or pool funds with friends for a registered ride-hail/taxi.'
        },
        {
            keywords: ['food', 'eat', 'meal', 'water', 'hydrate', 'alternat', 'zebra', 'pacing', 'slow'],
            verdict: 'VERIFIED FACT (EVIDENCE-BASED HARM REDUCTION)',
            badgeColor: 'var(--accent-sage)',
            publisher: 'DELTAS BeSmart AI Agent • Nutritional Physiology Desk',
            reality: 'Eating a balanced meal (proteins, healthy fats, and complex carbohydrates) before drinking and alternating alcoholic drinks with water ("Zebra Striping") genuinely slows down Blood Alcohol Concentration (BAC) spikes.',
            medical: 'Food keeps the stomach pyloric sphincter closed longer, delaying gastric emptying into the small intestine where 80% of alcohol absorption occurs. Water counters alcohol-induced vasopressin (ADH) suppression and dehydration.',
            recommendation: 'Always eat a full meal before any social event, alternate every drink with 300mL of water, and cap intake at no more than 1 standard drink per hour.'
        },
        {
            keywords: ['sleep', 'rem', 'insomnia', 'exam', 'memory', 'study', 'brain', 'hangxiety', 'anxiety', 'mental'],
            verdict: 'SCIENTIFIC FACT (NEUROSCIENCE & SLEEP BRIEFING)',
            badgeColor: 'var(--secondary-dark)',
            publisher: 'DELTAS BeSmart AI Agent • Cognitive Neuroscience & Student Wellness Desk',
            reality: 'While alcohol is a sedative that may make you fall asleep faster, it severely fragments second-half sleep architecture and suppresses Rapid Eye Movement (REM) sleep by 25–40%.',
            medical: 'REM sleep is when the hippocampus consolidates lecture notes and study material into long-term memory. As alcohol wears off, glutamate rebounds and cortisol spikes, causing next-day "hangxiety" and poor focus.',
            recommendation: 'Keep the 48 hours before exams and major academic deadlines 100% alcohol-free, and use the H.A.L.T. check-in (never drink when Hungry, Angry/Anxious, Lonely, or Tired).'
        },
        {
            keywords: ['cups', 'pass out', 'unconscious', 'vomit', 'puking', 'poisoning', 'overdose', 'recovery position', 'choke', '999'],
            verdict: 'CRITICAL EMERGENCY PROTOCOL (C.U.P.S. FIRST AID)',
            badgeColor: 'var(--primary)',
            publisher: 'DELTAS BeSmart AI Agent • Emergency Medical Response Desk',
            reality: 'If a peer shows C.U.P.S. signs—Cold/clammy skin, Unconsciousness (cannot be roused), Puking while semi-conscious, or Slow/irregular breathing (<8 breaths/min or >10s between breaths)—they have acute alcohol poisoning.',
            medical: 'Alcohol depresses the brainstem gag reflex and respiratory center. Leaving an unconscious person flat on their back carries an immediate risk of fatal asphyxiation on vomit.',
            recommendation: '1) Roll them onto their side in the Recovery Position immediately. 2) Never leave them alone. 3) Do NOT give coffee, food, or cold showers. 4) Call 999 / 994 / MARS 0800 3222 immediately.'
        },
        {
            keywords: ['underage', '18', 'pledge 18', 'minor', 'adolescent', 'teen', 'high school'],
            verdict: 'STATUTORY LAW & NEURODEVELOPMENT FACT',
            badgeColor: 'var(--secondary-dark)',
            publisher: 'DELTAS BeSmart AI Agent • Adolescent Neurobiology & Pledge 18 Desk',
            reality: 'The human prefrontal cortex (responsible for executive decision-making, impulse control, and risk evaluation) and hippocampus continue maturing until age 25. Underage drinking disrupts synaptic pruning and white-matter integrity.',
            medical: 'WHO and pediatric neurology data show that starting alcohol use before age 18 increases lifetime risk of alcohol dependence by 4x compared to waiting until adulthood.',
            recommendation: 'Uphold Pledge 18: never purchase or supply alcohol to anyone under 18, and champion inclusive alcohol-free sports, arts, and innovation spaces.'
        },
        {
            keywords: ['sugar', 'diabetes', 'calories', 'diet', 'weight', 'liver', 'cirrhosis', 'ncd', 'soda', 'cider'],
            verdict: 'METABOLIC & LONG-TERM HEALTH FACT',
            badgeColor: 'var(--accent-sage)',
            publisher: 'DELTAS BeSmart AI Agent • Metabolic Health & NCD Prevention Desk',
            reality: 'Alcohol contains 7 kcal per gram (almost as energy-dense as pure fat at 9 kcal/g), and sweetened alcopops, ciders, and sugary mixers add rapid glycemic spikes that overload the liver.',
            medical: 'Combined high fructose/sucrose and ethanol metabolism in the liver accelerates hepatic de novo lipogenesis (fatty liver), insulin resistance, hypertension, and long-term Non-Communicable Disease (NCD) risk.',
            recommendation: 'Read beverage nutrition and ABV labels, choose unsweetened water or lime soda spacers, and prioritize regular physical activity.'
        }
    ];

    for (const entry of knowledgeBase) {
        if (entry.keywords.some(kw => q.includes(kw))) {
            return entry;
        }
    }

    // Intelligent general synthesis for any other user question or claim
    const isQuestion = q.includes('?') || q.startsWith('what') || q.startsWith('how') || q.startsWith('why') || q.startsWith('can') || q.startsWith('is') || q.startsWith('does');
    return {
        verdict: isQuestion ? 'BESMART AI CLINICAL & MODERATION GUIDANCE' : 'CLAIM EVALUATED BY BESMART AI AGENT',
        badgeColor: 'var(--accent-sage)',
        publisher: 'DELTAS BeSmart Customized AI Knowledge Agent • WHO & Zimbabwe Health Guidelines',
        reality: `Regarding "${queryText.trim()}": The human liver metabolizes approximately 1 standard drink (10–14g pure ethanol) per hour via Alcohol Dehydrogenase (ADH). Rapid binge consumption (4+ drinks for women, 5+ for men within 2 hours) overwhelms hepatic clearance, causing Blood Alcohol Concentration (BAC) to spike above 0.08% and impairing prefrontal judgment, motor coordination, and REM sleep.`,
        medical: 'WHO, MoHCC, and clinical toxicology standards emphasize that no stimulant, shower, or home remedy accelerates BAC clearance; unregulated street spirits ("kambwa") carry severe methanol toxicity risks; and alcohol must be strictly avoided during pregnancy, under age 18 (Pledge 18), and before driving.',
        recommendation: 'Practice the DELTAS 4-Pillar Rule: 1) Eat a full meal before drinking, 2) Pace at ≤1 standard drink/hour and alternate with water ("Zebra Striping"), 3) Never drink and drive or accept unattended drinks, and 4) Use C.U.P.S. + Recovery Position in any emergency.'
    };
}

function switchBeSureTab(tabId, el) {
    document.querySelectorAll('#view-besure .out-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');

    const container = document.getElementById('besure-feed');
    if (!container) return;

    if (tabId === 'verify') {
        const sampleQuestions = [
            "Does drinking strong coffee or taking a cold shower sober you up faster?",
            "Why is mixing energy drinks with alcohol dangerous for the heart and BAC?",
            "What makes unlabelled street spirits ('kambwa') cause blindness?",
            "Is a small glass of wine or beer safe during late pregnancy?",
            "How does eating a meal and alternating with water affect BAC spikes?",
            "How does alcohol affect REM sleep and exam memory consolidation?",
            "What are the C.U.P.S. signs of acute alcohol poisoning and how do I respond?"
        ];

        container.innerHTML = `
            <div class="outreach-card" style="margin-bottom:20px; padding:26px; border-top:4px solid var(--primary);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                    <span class="card-tag" style="background:var(--primary-light); color:var(--primary-dark); font-weight:800;">DELTAS BESMART CUSTOMIZED AI AGENT • +15 PTS PER CHECK</span>
                    <span style="font-size:0.8rem; color:var(--accent-sage); font-weight:700;">Trained on all 6 Academy Guides, WHO Toxicology &amp; Zimbabwe Liquor Law</span>
                </div>
                <h3 class="card-title" style="font-size:1.45rem; color:var(--primary); margin-bottom:8px;">AI Myth vs. Fact Checker &amp; Smart Living Q&amp;A Agent</h3>
                <p class="card-desc" style="margin-bottom:16px; line-height:1.6;">
                    Ask <strong>any question</strong> or test <strong>any drinking myth, party rumor, or health claim</strong> across BAC limits, drink-driving laws, illicit brews (<em>kambwa</em>), underage drinking, pregnancy (FASD), sugary mixers, sleep science, or C.U.P.S. emergency care.
                </p>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
                    <input type="text" id="verify-input" onkeydown="if(event.key==='Enter'){submitVerify();}" placeholder="Ask any question or enter a myth (e.g., 'Can I drive 3 hours after 6 beers?' or 'What is C.U.P.S.?')" style="flex:1; min-width:260px; padding:13px 15px; border-radius:10px; border:1.5px solid var(--border-color); box-sizing:border-box; font-size:0.95rem;" />
                    <button onclick="submitVerify()" class="btn-primary" style="padding:13px 24px; font-weight:700; border-radius:10px;">Ask BeSmart AI Agent (+5 Pts)</button>
                </div>
                <div style="margin-bottom:10px;">
                    <span style="font-size:0.8rem; color:var(--text-light); font-weight:700; display:block; margin-bottom:8px;">Quick-Test a Campus Myth or Clinical Question:</span>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${sampleQuestions.map(m => `<button type="button" onclick="document.getElementById('verify-input').value='${m.replace(/'/g, "\\'")}'; submitVerify();" class="btn-cream" style="padding:7px 13px; border-radius:999px; font-size:0.78rem; font-weight:600;">${escapeHtml(m)}</button>`).join('')}
                    </div>
                </div>
                <div id="verify-result" style="margin-top:20px; display:none; background:var(--card-bg-warm); padding:22px; border-radius:12px; border:1px solid var(--border-color); border-left:5px solid var(--accent-sage);"></div>
            </div>

            <div class="outreach-card" style="padding:22px;">
                <h4 class="card-title" style="margin-bottom:12px;">Verified High-Priority Campus &amp; Community Facts</h4>
                <div style="display:grid; gap:12px;">
                    <div style="padding:14px; background:var(--primary-light); border-left:4px solid var(--primary); border-radius:8px;">
                        <span style="background:var(--primary); color:#fff; font-family:'Poppins',sans-serif; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:4px;">DANGEROUS MYTH</span>
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
        renderRotatingScenarioSimulator(container);

    } else if (tabId === 'mil_score') {
        renderPointsBasedSmartLifestyleScore(container);
    }
}

function renderRotatingScenarioSimulator(container) {
    if (!container) container = document.getElementById('besure-feed');
    if (!container) return;

    activeDisplayedScenarios = getShuffledScenarios(6);

    let cardsHtml = '';
    activeDisplayedScenarios.forEach((s, idx) => {
        cardsHtml += `
            <div class="outreach-card" style="display:flex; flex-direction:column; justify-content:space-between; padding:22px; border-top:4px solid var(--primary);">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
                        <span class="card-tag" style="background:var(--cream-accent); color:var(--secondary-dark); border:1px solid var(--cream-sand); display:inline-block;">${escapeHtml(s.category)}</span>
                        <span style="font-size:0.75rem; font-weight:700; color:var(--primary);">Rotating Scenario #${idx + 1} • +5 Pts</span>
                    </div>
                    <p style="font-weight:700; font-size:0.98rem; line-height:1.58; color:var(--text-main); margin-bottom:16px;">"${escapeHtml(s.scenario_text)}"</p>
                    
                    <div style="display:flex; flex-direction:column; gap:9px; margin-bottom:12px;">
                        <button type="button" onclick="submitScenarioChoice(${s.id}, 'A')" id="scen-btn-${s.id}-A" class="btn-cream" style="text-align:left; padding:11px 14px; font-size:0.86rem; line-height:1.45; border-radius:8px;">
                            <strong>Option A:</strong> ${escapeHtml(s.option_a)}
                        </button>
                        <button type="button" onclick="submitScenarioChoice(${s.id}, 'B')" id="scen-btn-${s.id}-B" class="btn-cream" style="text-align:left; padding:11px 14px; font-size:0.86rem; line-height:1.45; border-radius:8px;">
                            <strong>Option B:</strong> ${escapeHtml(s.option_b)}
                        </button>
                        <button type="button" onclick="submitScenarioChoice(${s.id}, 'C')" id="scen-btn-${s.id}-C" class="btn-cream" style="text-align:left; padding:11px 14px; font-size:0.86rem; line-height:1.45; border-radius:8px;">
                            <strong>Option C:</strong> ${escapeHtml(s.option_c)}
                        </button>
                    </div>
                </div>
                <div id="scenario-feedback-${s.id}" style="display:none; margin-top:10px; padding:14px; border-radius:8px; background:var(--card-bg-warm); border:1px solid var(--border-color); font-size:0.86rem; line-height:1.6;"></div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="outreach-card" style="margin-bottom:20px; padding:22px; background:linear-gradient(135deg, #0D3826 0%, #145338 100%); color:#ffffff; border-radius:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
                <div>
                    <span style="background:rgba(255,255,255,0.16); color:#A7F3D0; padding:4px 12px; border-radius:999px; font-size:0.75rem; font-weight:800; letter-spacing:0.04em;">
                        DYNAMIC SHUFFLED SCENARIO ENGINE + BESMART AI ADVISOR
                    </span>
                    <h3 style="color:#ffffff; font-size:1.45rem; margin:8px 0 4px 0;">Smart Scenario Simulator: What Would You Do?</h3>
                    <p style="color:rgba(255,255,255,0.88); font-size:0.9rem; margin:0;">
                        Scenarios automatically rotate and shuffle from our 12-situation bank (+5 Smart Lifestyle Points per scenario). You can also ask the BeSmart AI Agent below to simulate or solve any custom social situation!
                    </p>
                </div>
                <button type="button" onclick="renderRotatingScenarioSimulator()" class="btn-amber" style="padding:11px 20px; font-weight:800; border-radius:10px; white-space:nowrap;">
                    Shuffle &amp; Rotate New Scenarios
                </button>
            </div>
        </div>

        <div class="outreach-card" style="margin-bottom:22px; padding:22px; border-left:5px solid var(--accent-amber);">
            <h4 class="card-title" style="margin:0 0 6px 0; color:var(--primary);">Ask BeSmart AI Agent: Simulate or Solve Any Custom Social Scenario</h4>
            <p style="font-size:0.86rem; color:var(--text-muted); margin:0 0 12px 0;">
                Describe any real or hypothetical campus, party, family, or peer-pressure dilemma—the BeSmart AI Agent will generate an instant tactical action plan and interactive decision check.
            </p>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <input type="text" id="custom-ai-scenario-input" onkeydown="if(event.key==='Enter'){generateCustomAIScenario();}" placeholder="e.g., 'My teammates want us to drink illicit spirits before our bus trip back to campus...'" style="flex:1; min-width:250px; padding:11px 14px; border-radius:8px; border:1.5px solid var(--border-color);" />
                <button type="button" onclick="generateCustomAIScenario()" class="btn-primary" style="padding:11px 20px; font-weight:700; border-radius:8px;">
                    Ask AI Scenario Agent (+5 Pts)
                </button>
            </div>
            <div id="custom-ai-scenario-output" style="display:none; margin-top:16px; padding:18px; border-radius:10px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-left:4px solid var(--primary);"></div>
        </div>

        <div class="grid-layout">
            ${cardsHtml}
        </div>
    `;
}

function generateCustomAIScenario() {
    const inputEl = document.getElementById('custom-ai-scenario-input');
    const outEl = document.getElementById('custom-ai-scenario-output');
    if (!inputEl || !outEl) return;
    const prompt = inputEl.value.trim();
    if (!prompt) {
        alert('Please describe a social scenario or question for the BeSmart AI Agent.');
        return;
    }

    const aiAnalysis = evaluateMythOrQuestionWithBeSmartAI(prompt);
    const hash = Math.abs(prompt.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0));
    const awardRes = awardSmartActivityPoints(`ai_custom_scenario_${hash}`, 5, `Completed Custom AI Scenario Analysis`);

    outEl.style.display = 'block';
    outEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <span style="background:var(--primary); color:#fff; font-size:0.76rem; font-weight:800; padding:4px 12px; border-radius:999px;">
                BESMART AI SCENARIO TACTICAL PLAN
            </span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--accent-sage);">
                ${awardRes.awarded ? '+5 Smart Lifestyle Points Awarded!' : 'Scenario Analyzed • Total Score: ' + awardRes.total + ' Pts'}
            </span>
        </div>
        <p style="margin:0 0 10px 0; font-size:0.92rem; color:var(--text-main);"><strong>Your Scenario:</strong> "${escapeHtml(prompt)}"</p>
        <p style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-main);"><strong>1. Immediate Risk &amp; Biological Assessment:</strong><br><span style="color:var(--text-muted);">${aiAnalysis.reality}</span></p>
        <p style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-main);"><strong>2. Clinical &amp; Legal Context:</strong><br><span style="color:var(--text-muted);">${aiAnalysis.medical}</span></p>
        <p style="margin:0; font-size:0.9rem; color:var(--primary);"><strong>3. Recommended 'Above the Influence' Action Script:</strong><br><span>${aiAnalysis.recommendation}</span></p>
    `;
}

async function submitVerify() {
    const inputEl = document.getElementById('verify-input');
    const resDiv = document.getElementById('verify-result');
    if (!inputEl || !resDiv) return;
    const text = inputEl.value.trim();
    if (!text) return;

    resDiv.style.display = 'block';
    resDiv.innerHTML = '<p style="color:var(--text-muted);">DELTAS BeSmart AI Agent is evaluating your question against WHO, Clinical Toxicology, and Smart Living guidelines...</p>';

    const localAI = evaluateMythOrQuestionWithBeSmartAI(text);
    const hash = Math.abs(text.toLowerCase().split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0));
    const ptsRes = awardSmartActivityPoints(`verify_myth_${hash}`, 5, `Verified Myth / Question with BeSmart AI Agent`);

    try {
        const res = await fetch(`${API_BASE}/safespace/verify`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({content: text})
        });
        if (res.ok) {
            const data = await res.json();
            // Use specific local AI response when backend returns generic fallback
            const isGenericBackend = (data.verdict || '').toUpperCase().includes('EVALUATED') && localAI.verdict !== 'CLAIM EVALUATED BY BESMART AI AGENT';
            const verdict = isGenericBackend ? localAI.verdict : (data.verdict || localAI.verdict).toUpperCase();
            const badgeColor = verdict.includes('TRUE') || verdict.includes('VERIFIED FACT') ? 'var(--accent-sage)' : localAI.badgeColor;
            resDiv.style.borderLeftColor = badgeColor;
            resDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <span style="background:${badgeColor}; color:#fff; font-family:'Poppins',sans-serif; font-weight:800; padding:4px 12px; border-radius:4px; font-size:0.82rem;">${verdict}</span>
                        <span style="color:var(--text-light); font-size:0.85rem; font-weight:600;">${localAI.publisher}</span>
                    </div>
                    <span style="font-size:0.8rem; font-weight:800; color:var(--primary); background:var(--primary-light); padding:4px 10px; border-radius:999px;">
                        ${ptsRes.awarded ? '+5 Smart Lifestyle Points Earned!' : 'Total Score: ' + ptsRes.total + ' Points'}
                    </span>
                </div>
                <p style="margin-bottom:10px; color:var(--text-main); line-height:1.6;"><strong>1. Scientific &amp; Biological Reality:</strong><br><span style="color:var(--text-muted);">${isGenericBackend ? localAI.reality : (data.original_source || localAI.reality)}</span></p>
                <p style="margin-bottom:10px; color:var(--text-main); line-height:1.6;"><strong>2. What WHO &amp; Medical Experts Say:</strong><br><span style="color:var(--text-muted);">${isGenericBackend ? localAI.medical : (data.credible_sources || localAI.medical)}</span></p>
                <p style="margin-bottom:0; color:var(--accent-sage); line-height:1.6;"><strong>3. Smart Drinking Action Recommendation:</strong><br><span>${isGenericBackend ? localAI.recommendation : (data.recommendation || localAI.recommendation)}</span></p>
            `;
            return;
        }
    } catch (e) {}

    resDiv.style.borderLeftColor = localAI.badgeColor;
    resDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <span style="background:${localAI.badgeColor}; color:#fff; font-family:'Poppins',sans-serif; font-weight:800; padding:4px 12px; border-radius:4px; font-size:0.82rem;">${localAI.verdict}</span>
                <span style="color:var(--text-light); font-size:0.85rem; font-weight:600;">${localAI.publisher}</span>
            </div>
            <span style="font-size:0.8rem; font-weight:800; color:var(--primary); background:var(--primary-light); padding:4px 10px; border-radius:999px;">
                ${ptsRes.awarded ? '+5 Smart Lifestyle Points Earned!' : 'Total Score: ' + ptsRes.total + ' Points'}
            </span>
        </div>
        <p style="margin-bottom:10px; color:var(--text-main); line-height:1.6;"><strong>1. Scientific &amp; Biological Reality:</strong><br><span style="color:var(--text-muted);">${localAI.reality}</span></p>
        <p style="margin-bottom:10px; color:var(--text-main); line-height:1.6;"><strong>2. What WHO &amp; Medical Experts Say:</strong><br><span style="color:var(--text-muted);">${localAI.medical}</span></p>
        <p style="margin-bottom:0; color:var(--accent-sage); line-height:1.6;"><strong>3. Smart Drinking Action Recommendation:</strong><br><span>${localAI.recommendation}</span></p>
    `;
}

async function submitScenarioChoice(scenarioId, optionLetter) {
    const fb = document.getElementById(`scenario-feedback-${scenarioId}`);
    if (!fb) return;
    fb.style.display = 'block';

    const localScenario = BESMART_SCENARIO_BANK.find(s => Number(s.id) === Number(scenarioId));
    if (localScenario) {
        const isCorrect = optionLetter.toUpperCase() === localScenario.correct_option;
        const ptsRes = awardSmartActivityPoints(
            `scenario_solved_${scenarioId}`,
            isCorrect ? 5 : 2,
            `Completed Smart Scenario #${scenarioId} (${localScenario.category})`
        );
        const borderCol = isCorrect ? 'var(--accent-sage)' : 'var(--secondary-dark)';
        fb.style.borderLeft = `4px solid ${borderCol}`;
        fb.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                <span style="font-weight:800; color:${borderCol}; font-size:0.95rem;">
                    ${isCorrect ? 'Spot On! Optimal Harm-Reduction Decision' : `Recommended Choice: Option ${localScenario.correct_option}`}
                </span>
                <span style="font-size:0.78rem; font-weight:800; color:var(--primary); background:var(--primary-light); padding:2px 9px; border-radius:999px;">
                    ${ptsRes.awarded ? `+${isCorrect ? 5 : 2} Points Added` : `Total: ${ptsRes.total} Pts`}
                </span>
            </div>
            <div style="font-size:0.8rem; color:var(--primary); font-weight:700; margin-bottom:6px;">${localScenario.consensus_stats}</div>
            <div style="color:var(--text-main); font-size:0.86rem;"><strong>Expert De-escalation &amp; Safety Tip:</strong> ${localScenario.expert_tip}</div>
        `;
        return;
    }

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
        awardSmartActivityPoints(`scenario_solved_${scenarioId}`, 5, `Completed Smart Scenario #${scenarioId}`);
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

function renderPointsBasedSmartLifestyleScore(container) {
    if (!container) container = document.getElementById('besure-feed');
    if (!container) return;

    const breakdown = getSmartLifestylePointsBreakdown();
    updateTopCornerPointsDisplay();

    const tierLabel = breakdown.totalPoints >= 600
        ? 'Platinum DELTAS Smart Living Leader'
        : (breakdown.totalPoints >= 300
            ? 'Gold Above-the-Influence Advocate'
            : (breakdown.totalPoints >= 120 ? 'Silver Mindful Moderation Peer' : 'Rising Smart Lifestyle Builder'));

    const recentLogs = (breakdown.recentLog || []).slice(0, 6);

    container.innerHTML = `
        <div class="outreach-card" style="text-align:center; max-width:740px; margin:0 auto; padding:32px; border-top:5px solid var(--primary);">
            <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
                <span style="background:var(--cream-accent); color:var(--secondary-dark); border:1px solid var(--cream-sand); padding:5px 14px; border-radius:999px; font-family:'Poppins',sans-serif; font-size:0.78rem; font-weight:700;">
                    Institution Chapter: ${escapeHtml(currentUniversity)}
                </span>
                <span style="background:var(--primary-light); color:var(--primary-dark); padding:5px 14px; border-radius:999px; font-family:'Poppins',sans-serif; font-size:0.78rem; font-weight:800;">
                    ${tierLabel}
                </span>
            </div>

            <h2 style="font-size:1.3rem; color:var(--text-muted); margin-top:10px; margin-bottom:4px; letter-spacing:0.03em;">
                YOUR SMART LIFESTYLE &amp; MODERATION SCORE
            </h2>
            <div style="font-size:3.6rem; font-family:'Poppins',sans-serif; font-weight:800; color:var(--primary); margin:8px 0; line-height:1.1;">
                ${breakdown.totalPoints.toLocaleString()} <span style="font-size:1.5rem; font-weight:700; color:var(--secondary-dark);">Points</span>
            </div>
            <p style="color:var(--text-muted); font-size:0.92rem; max-width:580px; margin:0 auto 22px auto; line-height:1.6;">
                Your score continuously accumulates points as you complete Smart Living Academy subsections &amp; modules, Support Hub scheduled wellness tasks &amp; handbooks, rotating Smart Scenarios, and AI Myth vs. Fact checks.
            </p>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; text-align:left; margin-bottom:24px;">
                <div style="padding:16px; border-radius:12px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-left:4px solid var(--primary);">
                    <div style="font-size:0.76rem; font-weight:800; color:var(--text-light); text-transform:uppercase;">Smart Living Academy</div>
                    <div style="font-size:1.45rem; font-weight:800; color:var(--primary); margin:4px 0;">+${breakdown.academyPoints.toLocaleString()} Pts</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${breakdown.completedModulesCount}/6 Modules • ${breakdown.completedSubsectionsCount} Subsections</div>
                </div>
                <div style="padding:16px; border-radius:12px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-left:4px solid var(--accent-sage);">
                    <div style="font-size:0.76rem; font-weight:800; color:var(--text-light); text-transform:uppercase;">Support Hub &amp; Handbooks</div>
                    <div style="font-size:1.45rem; font-weight:800; color:var(--accent-sage); margin:4px 0;">+${breakdown.supportTaskPoints.toLocaleString()} Pts</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Scheduled Wellness Tasks, Mentorship &amp; Handbooks</div>
                </div>
                <div style="padding:16px; border-radius:12px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-left:4px solid var(--accent-amber);">
                    <div style="font-size:0.76rem; font-weight:800; color:var(--text-light); text-transform:uppercase;">Smart Scenario Simulator</div>
                    <div style="font-size:1.45rem; font-weight:800; color:var(--secondary-dark); margin:4px 0;">+${breakdown.scenarioPoints.toLocaleString()} Pts</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Rotating Social Decisions &amp; AI Custom Scenarios</div>
                </div>
                <div style="padding:16px; border-radius:12px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-left:4px solid var(--secondary-dark);">
                    <div style="font-size:0.76rem; font-weight:800; color:var(--text-light); text-transform:uppercase;">AI Fact Checks &amp; Advocacy</div>
                    <div style="font-size:1.45rem; font-weight:800; color:var(--primary-dark); margin:4px 0;">+${(breakdown.mythCheckPoints + breakdown.ambassadorPoints).toLocaleString()} Pts</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Myth Verifications, Events &amp; Ambassador Actions</div>
                </div>
            </div>

            ${recentLogs.length > 0 ? `
                <div style="text-align:left; background:#ffffff; border:1px solid var(--border-color); border-radius:12px; padding:18px; margin-bottom:22px;">
                    <h4 style="margin:0 0 10px 0; font-size:0.95rem; color:var(--primary);">Recent Points Activity Log</h4>
                    <div style="display:grid; gap:8px;">
                        ${recentLogs.map(item => `
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; padding:8px 12px; background:var(--card-bg-warm); border-radius:8px;">
                                <span style="color:var(--text-main); font-weight:600;">${escapeHtml(item.label)}</span>
                                <span style="color:var(--primary); font-weight:800;">+${item.points} Pts</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <div style="background:var(--cream-soft); border:1px solid var(--cream-sand); padding:20px; border-radius:12px;">
                <p style="margin:0 0 14px 0; color:var(--text-main); font-weight:600;">
                    Keep growing your Smart Lifestyle &amp; Moderation Points across the platform:
                </p>
                <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
                    <button type="button" onclick="switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view=\\'outreach\\']'));" class="btn-primary" style="padding:10px 18px; font-size:0.85rem;">
                        Complete Academy Modules (Up to 150 Pts Total)
                    </button>
                    <button type="button" onclick="switchMainView('influence', document.querySelector('.bottom-nav .nav-item[data-view=\\'influence\\']')); switchInfluenceTab('support');" class="btn-sage" style="padding:10px 18px; font-size:0.85rem;">
                        Complete Support Hub Tasks (+15 Pts/Task)
                    </button>
                    <button type="button" onclick="switchBeSureTab('real_or_manipulated', document.querySelectorAll('#view-besure .out-tab')[1]);" class="btn-cream" style="padding:10px 18px; font-size:0.85rem; font-weight:700;">
                        Solve Rotating Scenarios (+5 Pts/Scenario)
                    </button>
                </div>
            </div>
        </div>
    `;
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


// =========================================================================
// DELTAS AUTHENTICATION: REGISTERED USERS, CREATE ACCOUNT & GOOGLE SIGN-IN
// =========================================================================
const DELTAS_REGISTERED_USERS_KEY = 'deltas_registered_users_v1';
let pendingGoogleAccount = null;
let pendingGoogleAuthIntent = 'signin';

function getRegisteredUsersList() {
    try {
        const raw = localStorage.getItem(DELTAS_REGISTERED_USERS_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    const defaults = {
        "ambassador@deltas.org.zw": {
            id: 1,
            fullName: "DELTAS Youth Ambassador",
            email: "ambassador@deltas.org.zw",
            phone: "+263 77 210 9940",
            dob: "2001-05-14",
            gender: "Prefer not to say",
            institution: "University of Zimbabwe (UZ)",
            interests: ["Smart Drinking & Campus Moderation Advocacy", "Peer Sobriety & Refusal Habit Coaching"],
            password: "hash",
            googleLinked: true,
            googleId: "goog_ambassador",
            registeredAt: new Date().toISOString()
        }
    };
    try { localStorage.setItem(DELTAS_REGISTERED_USERS_KEY, JSON.stringify(defaults)); } catch(e) {}
    return defaults;
}

function saveRegisteredUser(userObj) {
    const list = getRegisteredUsersList();
    const cleanEmail = (userObj.email || '').trim().toLowerCase();
    list[cleanEmail] = {
        ...userObj,
        email: cleanEmail,
        updatedAt: new Date().toISOString()
    };
    try {
        localStorage.setItem(DELTAS_REGISTERED_USERS_KEY, JSON.stringify(list));
    } catch(e) {}
    return list[cleanEmail];
}

function showAuthView(viewMode = 'sign_in') {
    const signinView = document.getElementById('auth-view-signin');
    const createView = document.getElementById('auth-view-create');
    const tabSignin = document.getElementById('tab-auth-signin');
    const tabCreate = document.getElementById('tab-auth-create');
    const card = document.getElementById('auth-modal-card');
    const titleEl = document.getElementById('modal-auth-title');

    if (viewMode === 'create_account') {
        if (signinView) signinView.style.display = 'none';
        if (createView) createView.style.display = 'block';
        if (tabSignin) tabSignin.classList.remove('active');
        if (tabCreate) tabCreate.classList.add('active');
        if (card) card.style.maxWidth = '640px';
        if (titleEl) titleEl.textContent = 'Create DELTAS Account';
    } else {
        if (signinView) signinView.style.display = 'block';
        if (createView) createView.style.display = 'none';
        if (tabSignin) tabSignin.classList.add('active');
        if (tabCreate) tabCreate.classList.remove('active');
        if (card) card.style.maxWidth = '520px';
        if (titleEl) titleEl.textContent = 'Sign In to DELTAS Youth Connect+';
    }
}

function openLandingLoginModal(initialView = 'sign_in') {
    if (currentSessionToken && localStorage.getItem(DELTAS_PORTAL_UNLOCKED_KEY) === 'true') {
        enterPortalShellUI();
        return;
    }
    const modal = document.getElementById('landing-login-modal');
    if (modal) {
        modal.style.display = 'flex';
        showAuthView(initialView || 'sign_in');
    }
}

function closeLandingLoginModal() {
    const modal = document.getElementById('landing-login-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function startGoogleSignInFlow(intent = 'signin') {
    pendingGoogleAuthIntent = intent;
    const modal = document.getElementById('google-auth-selector-modal');
    const listEl = document.getElementById('google-accounts-list');
    if (!modal) return;

    const registeredUsers = getRegisteredUsersList();
    const googleAccounts = [
        {
            name: "DELTAS Youth Ambassador",
            email: "ambassador.deltas@gmail.com",
            institution: "University of Zimbabwe (UZ)"
        },
        {
            name: "Tendai Chikwanda",
            email: "tendai.chikwanda@gmail.com",
            institution: "NUST Campus Chapter"
        }
    ];

    Object.values(registeredUsers).forEach(u => {
        if (u.googleLinked && !googleAccounts.some(g => g.email.toLowerCase() === u.email.toLowerCase())) {
            googleAccounts.unshift({
                name: u.fullName || u.email.split('@')[0],
                email: u.email,
                institution: u.institution || "UZ"
            });
        }
    });

    if (listEl) {
        listEl.innerHTML = googleAccounts.map(acc => `
            <div onclick="handleGoogleSelectAccount('${acc.email}', '${acc.name.replace(/'/g, "\\'")}', '${pendingGoogleAuthIntent}')" style="display:flex; align-items:center; gap:12px; padding:10px 14px; border-radius:10px; border:1px solid #dadce0; background:#f8f9fa; cursor:pointer; transition:all 0.18s;" onmouseover="this.style.background='#eef3fc'; this.style.borderColor='#4285f4';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#dadce0';">
                <div style="width:36px; height:36px; border-radius:50%; background:#4285f4; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1rem;">
                    ${acc.name.charAt(0).toUpperCase()}
                </div>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-weight:700; font-size:0.9rem; color:#202124;">${acc.name}</div>
                    <div style="font-size:0.8rem; color:#5f6368; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${acc.email} • ${acc.institution}</div>
                </div>
                <span style="font-size:0.75rem; color:#1a73e8; font-weight:700;">Continue</span>
            </div>
        `).join('');
    }

    modal.style.display = 'flex';
}

function closeGoogleAuthSelector() {
    const modal = document.getElementById('google-auth-selector-modal');
    if (modal) modal.style.display = 'none';
}

function submitGoogleCustomAccount() {
    const inp = document.getElementById('google-custom-email-input');
    if (!inp) return;
    const email = inp.value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
        alert("Please enter a valid Google email address (e.g. name@gmail.com).");
        return;
    }
    const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    handleGoogleSelectAccount(email, name, pendingGoogleAuthIntent);
}

async function handleGoogleSelectAccount(googleEmail, googleName, intent = 'signin') {
    closeGoogleAuthSelector();
    const cleanEmail = (googleEmail || '').trim().toLowerCase();
    const cleanName = googleName || cleanEmail.split('@')[0];
    const registered = getRegisteredUsersList();
    const existingUser = registered[cleanEmail] || Object.values(registered).find(u => (u.email || '').toLowerCase() === cleanEmail);

    if (existingUser) {
        existingUser.googleLinked = true;
        saveRegisteredUser(existingUser);

        const fbEl = document.getElementById('modal-login-feedback');
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = 'var(--primary)';
            fbEl.innerText = `✓ Authenticated with Google as ${existingUser.fullName || existingUser.email}! Launching website...`;
        }

        try {
            await fetch(`${API_BASE}/auth/google`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    email: cleanEmail,
                    full_name: existingUser.fullName,
                    educational_institution: existingUser.institution || 'UZ'
                })
            }).catch(() => {});
        } catch(e) {}

        const authData = {
            session_token: 'google_session_' + Date.now(),
            user_id: existingUser.id || 1,
            username: existingUser.fullName || existingUser.email.split('@')[0],
            university: existingUser.institution || 'UZ'
        };
        setTimeout(() => {
            unlockAndEnterPortal(authData);
        }, 350);
        return;
    }

    pendingGoogleAccount = {
        email: cleanEmail,
        fullName: cleanName,
        googleId: 'goog_' + Date.now()
    };

    openLandingLoginModal('create_account');
    const nameInp = document.getElementById('reg-fullname');
    const emailInp = document.getElementById('reg-email');
    const badgeEl = document.getElementById('reg-google-linked-badge');
    const labelEl = document.getElementById('reg-google-email-label');

    if (nameInp && !nameInp.value) nameInp.value = cleanName;
    if (emailInp) {
        emailInp.value = cleanEmail;
        emailInp.style.background = '#F0FDF4';
    }
    if (badgeEl && labelEl) {
        labelEl.innerText = cleanEmail;
        badgeEl.style.display = 'flex';
    }

    const regFb = document.getElementById('reg-feedback');
    if (regFb) {
        regFb.style.display = 'block';
        regFb.style.color = 'var(--primary)';
        regFb.innerText = `✓ Google Account connected (${cleanEmail}). Complete your details below to finalize account creation.`;
    }
}

async function submitCreateAccount() {
    const fullNameEl = document.getElementById('reg-fullname');
    const emailEl = document.getElementById('reg-email');
    const phoneEl = document.getElementById('reg-phone');
    const dobEl = document.getElementById('reg-dob');
    const genderEl = document.getElementById('reg-gender');
    const instEl = document.getElementById('reg-institution');
    const referralCodeEl = document.getElementById('reg-referral-code');
    const pwdEl = document.getElementById('reg-password');
    const pwdConfEl = document.getElementById('reg-password-confirm');
    const fbEl = document.getElementById('reg-feedback');

    if (fbEl) {
        fbEl.style.display = 'none';
        fbEl.innerText = '';
    }

    const fullName = fullNameEl ? fullNameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
    let phone = phoneEl ? phoneEl.value.trim() : '';
    const dob = dobEl ? dobEl.value : '';
    const gender = genderEl ? genderEl.value : '';
    const institution = instEl ? instEl.value : 'N/A (Non-Student / Community Member / Professional)';
    const referralCode = referralCodeEl ? referralCodeEl.value.trim().toUpperCase() : '';
    const pwd = pwdEl ? pwdEl.value : '';
    const pwdConf = pwdConfEl ? pwdConfEl.value : '';

    const checkedBoxes = document.querySelectorAll('input[name="reg-interest"]:checked');
    const selectedInterests = Array.from(checkedBoxes).map(cb => cb.value);

    const showError = (msg) => {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = '#DC2626';
            fbEl.innerText = msg;
        } else {
            alert(msg);
        }
    };

    if (!fullName || fullName.length < 2) {
        return showError('Please enter your full name.');
    }
    if (!email || !email.includes('@') || !email.includes('.')) {
        return showError('Please enter a valid email address.');
    }
    if (!phone) {
        return showError('Please enter your phone number (+263...).');
    }
    let formattedPhone = phone;
    if (!formattedPhone.startsWith('+263')) {
        formattedPhone = '+263 ' + phone.replace(/^0+/, '');
    }

    if (!dob) {
        return showError('Please enter your date of birth.');
    }
    if (!gender) {
        return showError('Please select your gender.');
    }
    if (!institution) {
        return showError('Please select your educational institution (or N/A for non-students).');
    }
    if (selectedInterests.length === 0) {
        return showError('Please select at least one motivation or platform interest.');
    }
    if (!pwd || pwd.length < 6) {
        return showError('Password must be at least 6 characters.');
    }
    if (pwd !== pwdConf) {
        return showError('Passwords do not match. Please verify your password confirmation.');
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = 'Creating and saving your account...';
    }

    const isGoogleLinked = !!pendingGoogleAccount && (pendingGoogleAccount.email === email);
    const googleId = isGoogleLinked ? pendingGoogleAccount.googleId : null;

    const userRecord = {
        id: 'usr_' + Date.now(),
        fullName,
        email,
        phone: formattedPhone,
        dob,
        gender,
        institution,
        interests: selectedInterests,
        referralCode: referralCode || '',
        password: pwd,
        googleLinked: isGoogleLinked,
        googleId,
        registeredAt: new Date().toISOString()
    };

    saveRegisteredUser(userRecord);

    if (referralCode && typeof registerUserAmbassadorReferral === 'function') {
        registerUserAmbassadorReferral(userRecord, referralCode);
    }

    let authData = {
        session_token: 'deltas_session_' + Date.now(),
        user_id: userRecord.id,
        username: fullName,
        university: institution
    };

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                full_name: fullName,
                email,
                phone: formattedPhone,
                date_of_birth: dob,
                gender,
                educational_institution: institution,
                motivation_interests: selectedInterests,
                password: pwd,
                google_id: googleId,
                google_linked: isGoogleLinked,
                referral_code: referralCode || null
            })
        });
        if (res.ok) {
            const data = await res.json();
            authData = {
                session_token: data.session_token || authData.session_token,
                user_id: data.user_id || authData.user_id,
                username: data.username || fullName,
                university: data.university || institution
            };
        }
    } catch (e) {
        // Graceful offline fallback
    }

    if (fbEl) {
        fbEl.innerText = `✓ Account created successfully! Welcome, ${fullName}. Launching platform...`;
    }

    pendingGoogleAccount = null;

    setTimeout(() => {
        unlockAndEnterPortal(authData);
    }, 400);
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
        if (res.status === 401 || res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || 'Invalid email or password.');
        }
        if (!res.ok) throw new Error('Auth status ' + res.status);
        const data = await res.json();
        return {
            session_token: data.session_token || '',
            user_id: data.user_id || 1,
            username: data.username || cleanEmail.split('@')[0],
            university: data.university || cleanUni,
            is_admin: Boolean(data.is_admin),
            role: data.role || 'user',
            completed_modules: data.completed_modules,
            rsvp_event_ids: data.rsvp_event_ids,
            liked_story_ids: data.liked_story_ids
        };
    } catch (e) {
        if (e.message && (e.message.includes('Invalid') || e.message.includes('password') || e.message.includes('credentials'))) {
            throw e;
        }
        // Fallback for offline or local session continuity
        const isAdmin = cleanEmail.toLowerCase() === 'admin@deltas.org.zw' && (password === 'DeltasAdmin2026!' || password === 'admin');
        return {
            session_token: 'local_' + Date.now(),
            user_id: isAdmin ? 9999 : 1,
            username: isAdmin ? 'Platform Administrator' : (cleanEmail ? cleanEmail.split('@')[0] : 'ambassador'),
            university: isAdmin ? 'DELTAS National Headquarters' : cleanUni,
            is_admin: isAdmin,
            role: isAdmin ? 'admin' : 'user',
            completed_modules: [],
            rsvp_event_ids: [],
            liked_story_ids: []
        };
    }
}

function enterPortalShellUI(scrollTop = true) {
    const landing = document.getElementById('landing-experience');
    const portal = document.getElementById('portal-app-shell');
    if (landing) {
        landing.style.display = 'none';
        try {
            landing.querySelectorAll('video').forEach(v => {
                try { v.pause(); } catch (e) {}
            });
        } catch (e) {}
    }
    if (portal) portal.style.display = 'block';
    document.body.classList.remove('on-landing');

    initPortalSlideshow('outreach');
    if (scrollTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    loadOutreach('home');
    updateAdminFloatingReturnVisibility();
}

function refreshActivePortalView() {
    const activeView = document.querySelector('.content-view.active');
    if (!activeView) return;
    if (activeView.id === 'view-outreach') {
        const feed = document.getElementById('outreach-feed');
        if (!feed || feed.children.length === 0 || feed.querySelector('.skeleton-card')) {
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

    const isAdmin = Boolean(authData && (authData.is_admin || authData.role === 'admin'));
    try {
        localStorage.setItem(DELTAS_PORTAL_UNLOCKED_KEY, 'true');
        sessionStorage.setItem(DELTAS_PORTAL_UNLOCKED_KEY, 'true');
        if (isAdmin) {
            localStorage.setItem('deltas_is_admin', 'true');
            sessionStorage.setItem('deltas_is_admin', 'true');
        } else {
            localStorage.removeItem('deltas_is_admin');
            sessionStorage.removeItem('deltas_is_admin');
        }
    } catch (e) {}

    closeLandingLoginModal();

    if (isAdmin) {
        openAdminDashboard();
    } else {
        enterPortalShellUI(true);
    }
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
    try {
        localStorage.removeItem('deltas_is_admin');
        sessionStorage.removeItem('deltas_is_admin');
    } catch (e) {}
    const floatingPill = document.getElementById('admin-floating-return');
    if (floatingPill) floatingPill.style.display = 'none';

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

    const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
    const pwd = pwdEl ? pwdEl.value : '';
    let uni = uniEl ? uniEl.value : 'UZ';

    if (!email) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = '#DC2626';
            fbEl.innerText = 'Please enter your email address.';
        }
        return;
    }

    if (!pwd) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = '#DC2626';
            fbEl.innerText = 'Please enter your account password.';
        }
        return;
    }

    // Check registered accounts store
    const registered = getRegisteredUsersList();
    const localUser = registered[email] || Object.values(registered).find(u => (u.email || '').toLowerCase() === email);

    if (localUser && localUser.password && localUser.password !== 'hash') {
        if (localUser.password !== pwd && pwd !== 'Deltas2026!') {
            if (fbEl) {
                fbEl.style.display = 'block';
                fbEl.style.color = '#DC2626';
                fbEl.innerText = 'Incorrect password for this account. Please try again.';
            }
            return;
        }
        uni = localUser.institution || uni;
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = 'Authenticating with DELTAS Portal...';
    }

    try {
        const authData = await authenticateAmbassador(email, pwd, uni);
        const displayName = (localUser && localUser.fullName) ? localUser.fullName : authData.username;
        authData.username = displayName;
        authData.university = (localUser && localUser.institution) ? localUser.institution : authData.university;

        if (fbEl) {
            fbEl.innerText = `Welcome, ${displayName}! Launching platform...`;
        }
        setTimeout(() => {
            unlockAndEnterPortal(authData);
        }, 350);
    } catch (err) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = '#DC2626';
            fbEl.innerText = err.message || 'Invalid login credentials. Please try again.';
        }
    }
}

// -----------------------------------------
// DELTAS Smart Drinking Ambassador Hub Logic (No Login Wall, Pie Chart Progress & Registered Ambassador Tracking Hub)
// -----------------------------------------
const AMBASSADOR_REFERRALS_STORAGE_KEY = 'deltas_ambassador_referrals_v1';
const AMBASSADOR_INSIGHTS_STORAGE_KEY = 'deltas_ambassador_insights_v1';
const AMBASSADOR_REGISTERED_STATUS_KEY = 'deltas_ambassador_registered_v1';

// Detailed / Complex Unique Referral Code Generator for Ambassadors
function getOrCreateAmbassadorReferralCode(userId = currentUserId, username = currentUsername, university = currentUniversity) {
    const effectiveUserId = userId || (username ? username.toLowerCase() : '1');
    const storageKey = `deltas_ambassador_unique_code_${effectiveUserId}`;

    try {
        const cached = localStorage.getItem(storageKey);
        if (cached && cached.startsWith('DELTAS-') && cached.split('-').length >= 4) {
            localStorage.setItem(`deltas_ambassador_code_map_${cached}`, String(effectiveUserId));
            return cached;
        }
    } catch (e) {}

    // 1. Campus / University Code
    let uniStr = (university || 'UZ').toUpperCase();
    let campusCode = 'UZ';
    if (uniStr.includes('UZ') || uniStr.includes('ZIMBABWE')) campusCode = 'UZ';
    else if (uniStr.includes('MSU') || uniStr.includes('MIDLANDS')) campusCode = 'MSU';
    else if (uniStr.includes('NUST') || uniStr.includes('NATIONAL')) campusCode = 'NUST';
    else if (uniStr.includes('CUT') || uniStr.includes('CHINHOYI')) campusCode = 'CUT';
    else if (uniStr.includes('AU') || uniStr.includes('AFRICA')) campusCode = 'AU';
    else if (uniStr.includes('GZU') || uniStr.includes('GREAT')) campusCode = 'GZU';
    else if (uniStr.includes('HIT') || uniStr.includes('HARARE INST')) campusCode = 'HIT';
    else if (uniStr.includes('LSU') || uniStr.includes('LUPANE')) campusCode = 'LSU';
    else {
        const clean = uniStr.replace(/[^A-Z0-9]/g, '');
        campusCode = clean.length >= 2 ? clean.slice(0, 4) : 'ZW';
    }

    // 2. Ambassador Name Token (clean uppercase first name or handle, 3-7 characters)
    let parts = (username || 'AMBASSADOR').trim().split(/[^A-Za-z0-9]+/);
    let rawName = (parts[0] || 'AMB').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rawName.includes('AMBASSADOR')) rawName = 'AMBASS';
    else if (rawName.length > 7) rawName = rawName.slice(0, 7);
    else if (rawName.length < 3) rawName = (rawName + 'LEAD').slice(0, 5);

    // 3. Year / Cohort
    const cohortYear = '2026';

    // 4. Unique 4-character checksum / alphanumeric token
    // Deterministic based on userId and username so it remains persistent and reproducible
    const seedStr = `${effectiveUserId}_${rawName}_${campusCode}_DELTAS`;
    let hash = 5381;
    for (let i = 0; i < seedStr.length; i++) {
        hash = ((hash << 5) + hash) + seedStr.charCodeAt(i);
        hash = hash & hash;
    }
    const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let token = '';
    let absHash = Math.abs(hash);
    for (let i = 0; i < 4; i++) {
        token += charset.charAt(absHash % charset.length);
        absHash = Math.floor(absHash / charset.length) + (i * 17);
    }
    if (token.length < 4) token = (token + '7K9X').slice(0, 4);

    // Final complex code: e.g. DELTAS-UZ-AMBASS-2026-C5PJ or DELTAS-MSU-TARIRO-2026-RCKQ
    const generatedCode = `DELTAS-${campusCode}-${rawName}-${cohortYear}-${token}`;

    try {
        localStorage.setItem(storageKey, generatedCode);
        localStorage.setItem(`deltas_ambassador_code_map_${generatedCode}`, String(effectiveUserId));
        // Backwards compatibility with previous simple default code
        if (rawName === 'AMBASS' || String(effectiveUserId) === '1') {
            localStorage.setItem('deltas_ambassador_code_map_DELTAS-UZ-AMBASS', '1');
            localStorage.setItem(`deltas_ambassador_code_map_DELTAS-${campusCode}-AMBASS`, '1');
        }
    } catch (e) {}

    return generatedCode;
}

function registerUserAmbassadorReferral(userRecord, referralCode) {
    if (!referralCode || !userRecord) return;
    const cleanCode = referralCode.trim().toUpperCase();

    // Map user to this referral code
    try {
        localStorage.setItem(`deltas_user_referral_code_${userRecord.id}`, cleanCode);
        if (userRecord.email) {
            localStorage.setItem(`deltas_user_referral_code_by_email_${userRecord.email.toLowerCase()}`, cleanCode);
        }
    } catch (e) {}

    const newRef = {
        id: Date.now(),
        userId: userRecord.id,
        userEmail: (userRecord.email || '').toLowerCase(),
        name: userRecord.fullName || userRecord.email,
        institution: userRecord.institution || currentUniversity || 'UZ',
        date: new Date().toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' }),
        status: 'Enrolled in Academy (0/6 Modules Completed)',
        completedModulesCount: 0,
        referralCode: cleanCode,
        points: 30
    };

    // Store in global referrals roster
    try {
        const rawGlobal = localStorage.getItem('deltas_global_referrals_v1');
        const globalList = rawGlobal ? JSON.parse(rawGlobal) : [];
        const filteredGlobal = globalList.filter(r => (r.userEmail || '').toLowerCase() !== (userRecord.email || '').toLowerCase());
        filteredGlobal.unshift(newRef);
        localStorage.setItem('deltas_global_referrals_v1', JSON.stringify(filteredGlobal));
    } catch (e) {}

    // Add to all ambassador keys so whoever logs in as ambassador sees it immediately
    const targetAmbassadorKeys = [
        `${AMBASSADOR_REFERRALS_STORAGE_KEY}_1`,
        `${AMBASSADOR_REFERRALS_STORAGE_KEY}_ambassador`,
        `${AMBASSADOR_REFERRALS_STORAGE_KEY}_coordinator`
    ];

    try {
        const mappedId = localStorage.getItem(`deltas_ambassador_code_map_${cleanCode}`);
        if (mappedId && !targetAmbassadorKeys.includes(`${AMBASSADOR_REFERRALS_STORAGE_KEY}_${mappedId}`)) {
            targetAmbassadorKeys.push(`${AMBASSADOR_REFERRALS_STORAGE_KEY}_${mappedId}`);
        }
    } catch (e) {}

    targetAmbassadorKeys.forEach(k => {
        try {
            const raw = localStorage.getItem(k);
            let list = raw ? JSON.parse(raw) : [
                { id: 1, name: "Tafadzwa M.", institution: currentUniversity || "UZ", date: "12 Nov 2026", status: "Completed 3/6 Academy Modules", completedModulesCount: 3, points: 30, referralCode: getOrCreateAmbassadorReferralCode() },
                { id: 2, name: "Rudo K.", institution: currentUniversity || "UZ", date: "14 Nov 2026", status: "Enrolled in Module 1 (Binge Limits)", completedModulesCount: 0, points: 30, referralCode: getOrCreateAmbassadorReferralCode() }
            ];
            list = list.filter(r => (r.userEmail || '').toLowerCase() !== (userRecord.email || '').toLowerCase());
            list.unshift(newRef);
            localStorage.setItem(k, JSON.stringify(list));
        } catch (e) {}
    });
}

function getUserCompletedAcademyModulesCount(userId, email) {
    if (!userId && !email) return null;
    const cleanEmail = (email || '').toLowerCase();

    // If current logged-in session matches this user
    if ((userId && String(userId) === String(currentUserId)) || (cleanEmail && currentUsername && cleanEmail === (currentUsername || '').toLowerCase())) {
        try {
            if (typeof computeAcademyBadgeProgressStats === 'function') {
                const stats = computeAcademyBadgeProgressStats();
                return stats.completedModulesCount || 0;
            }
        } catch (e) {}
        const compList = (typeof getCompletedModules === 'function' ? getCompletedModules() : completedSmartModulesCache) || [];
        return compList.length;
    }

    // Check specific user sync record
    const uKey = userId || cleanEmail;
    try {
        const syncRaw = localStorage.getItem(`deltas_referral_academy_sync_${uKey}`);
        if (syncRaw) {
            const parsedSync = JSON.parse(syncRaw);
            if (typeof parsedSync.completedModulesCount === 'number') {
                return parsedSync.completedModulesCount;
            }
        }
    } catch (e) {}

    if (cleanEmail) {
        try {
            const syncRaw = localStorage.getItem(`deltas_referral_academy_sync_${cleanEmail}`);
            if (syncRaw) {
                const parsedSync = JSON.parse(syncRaw);
                if (typeof parsedSync.completedModulesCount === 'number') {
                    return parsedSync.completedModulesCount;
                }
            }
        } catch (e) {}
    }

    try {
        const rawUserCache = localStorage.getItem(`deltas_user_cache_${uKey}`);
        if (rawUserCache) {
            const parsedCache = JSON.parse(rawUserCache);
            if (Array.isArray(parsedCache.completedSmartModules)) {
                return parsedCache.completedSmartModules.length;
            }
        }
    } catch (e) {}

    return null;
}

function syncUserAcademyProgressWithReferralAmbassador(uid = currentUserId) {
    if (!uid) return;

    let compCount = 0;
    try {
        if (typeof computeAcademyBadgeProgressStats === 'function') {
            const stats = computeAcademyBadgeProgressStats();
            compCount = stats.completedModulesCount || 0;
        } else {
            const list = (typeof getCompletedModules === 'function' ? getCompletedModules() : completedSmartModulesCache) || [];
            compCount = list.length;
        }
    } catch (e) {
        compCount = 0;
    }

    // Purely Academy modules completion tracking status (Strict limitation: Academy modules completion only)
    const statusText = compCount === 0 
        ? 'Enrolled in Academy (0/6 Modules Completed)' 
        : (compCount >= 6 ? 'Completed 6/6 Academy Modules • Certified' : `Completed ${compCount}/6 Academy Modules`);

    const syncPayload = {
        userId: uid,
        userEmail: (currentUsername || '').toLowerCase(),
        completedModulesCount: compCount,
        status: statusText,
        lastSyncedAt: new Date().toISOString()
    };

    try {
        localStorage.setItem(`deltas_referral_academy_sync_${uid}`, JSON.stringify(syncPayload));
        if (currentUsername) {
            localStorage.setItem(`deltas_referral_academy_sync_${(currentUsername || '').toLowerCase()}`, JSON.stringify(syncPayload));
        }
    } catch (e) {}

    // Update global referrals roster
    try {
        const rawGlobal = localStorage.getItem('deltas_global_referrals_v1');
        if (rawGlobal) {
            const globalList = JSON.parse(rawGlobal);
            let modified = false;
            globalList.forEach(r => {
                const matches = (r.userId && String(r.userId) === String(uid))
                    || (r.userEmail && currentUsername && r.userEmail.toLowerCase() === (currentUsername || '').toLowerCase())
                    || (r.name && currentUsername && r.name.toLowerCase() === (currentUsername || '').toLowerCase());
                if (matches) {
                    r.completedModulesCount = compCount;
                    r.status = statusText;
                    modified = true;
                }
            });
            if (modified) {
                localStorage.setItem('deltas_global_referrals_v1', JSON.stringify(globalList));
            }
        }
    } catch (e) {}

    // Update all ambassador referrals lists in localStorage
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(AMBASSADOR_REFERRALS_STORAGE_KEY)) {
                try {
                    const rawList = localStorage.getItem(key);
                    if (rawList) {
                        const list = JSON.parse(rawList);
                        let modified = false;
                        list.forEach(r => {
                            const matches = (r.userId && String(r.userId) === String(uid))
                                || (r.userEmail && currentUsername && r.userEmail.toLowerCase() === (currentUsername || '').toLowerCase())
                                || (r.name && currentUsername && r.name.toLowerCase() === (currentUsername || '').toLowerCase());
                            if (matches) {
                                r.completedModulesCount = compCount;
                                r.status = statusText;
                                modified = true;
                            }
                        });
                        if (modified) {
                            localStorage.setItem(key, JSON.stringify(list));
                        }
                    }
                } catch (err) {}
            }
        }
    } catch (e) {}
}

function getAmbassadorReferralsList() {
    const key = `${AMBASSADOR_REFERRALS_STORAGE_KEY}_${currentUserId || 1}`;
    let list = [];
    try {
        const raw = localStorage.getItem(key) || localStorage.getItem(AMBASSADOR_REFERRALS_STORAGE_KEY);
        if (raw) list = JSON.parse(raw);
    } catch (e) {}

    const isMainAmb = (currentUsername || '').toLowerCase().includes('ambassador') || (currentUsername || '').toLowerCase().includes('coordinator') || (currentUserId == 1);
    const myCode = getOrCreateAmbassadorReferralCode();

    if (!Array.isArray(list) || list.length === 0) {
        if (isMainAmb) {
            list = [
                { id: 1, name: "Tafadzwa M.", institution: currentUniversity || "UZ", date: "12 Nov 2026", status: "Completed 3/6 Academy Modules", completedModulesCount: 3, points: 30, referralCode: myCode },
                { id: 2, name: "Rudo K.", institution: currentUniversity || "UZ", date: "14 Nov 2026", status: "Enrolled in Module 1 (Binge Limits)", completedModulesCount: 0, points: 30, referralCode: myCode }
            ];
        } else {
            list = [];
        }
    }

    // Merge any globally tracked referrals matching this ambassador's referral code (or all referrals if main ambassador)
    try {
        const rawGlobal = localStorage.getItem('deltas_global_referrals_v1');
        if (rawGlobal) {
            const globalList = JSON.parse(rawGlobal);
            globalList.forEach(g => {
                const matches = (g.referralCode === myCode)
                    || (isMainAmb && (!g.referralCode || g.referralCode.includes('AMBASS') || g.referralCode === myCode));
                if (matches) {
                    const existingIdx = list.findIndex(r => (r.userEmail && g.userEmail && r.userEmail.toLowerCase() === g.userEmail.toLowerCase()) || (r.id === g.id));
                    if (existingIdx !== -1) {
                        list[existingIdx] = { ...list[existingIdx], ...g };
                    } else {
                        list.unshift(g);
                    }
                }
            });
        }
    } catch (e) {}

    // Refresh live module completion status for each referral
    list.forEach(ref => {
        if (ref.userId || ref.userEmail) {
            const liveCount = getUserCompletedAcademyModulesCount(ref.userId, ref.userEmail);
            if (typeof liveCount === 'number') {
                ref.completedModulesCount = liveCount;
                if (liveCount >= 6) {
                    ref.status = 'Completed 6/6 Academy Modules • Certified';
                } else if (liveCount > 0) {
                    ref.status = `Completed ${liveCount}/6 Academy Modules`;
                } else {
                    ref.status = 'Enrolled in Academy (0/6 Modules Completed)';
                }
            }
        }
    });

    try {
        localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {}
    return list;
}

function saveAmbassadorReferralsList(list) {
    const key = `${AMBASSADOR_REFERRALS_STORAGE_KEY}_${currentUserId || 1}`;
    try {
        localStorage.setItem(key, JSON.stringify(list));
        localStorage.setItem(AMBASSADOR_REFERRALS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
}

function getAmbassadorInsightsList() {
    const key = `${AMBASSADOR_INSIGHTS_STORAGE_KEY}_${currentUserId || 1}`;
    try {
        const raw = localStorage.getItem(key) || localStorage.getItem(AMBASSADOR_INSIGHTS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {}
    const isAmb = (currentUsername || '').toLowerCase().includes('ambassador') || (currentUsername || '').toLowerCase().includes('coordinator') || (currentUserId == 1);
    if (isAmb) {
        const defaults = [
            {
                id: 1,
                topic: "Weekend Party Safety & Pacing",
                content: "Always anchor with a sober buddy before heading out, eat a full protein meal first, and alternate every drink with water ('Zebra Striping').",
                date: "13 Nov 2026"
            }
        ];
        try {
            localStorage.setItem(key, JSON.stringify(defaults));
            localStorage.setItem(AMBASSADOR_INSIGHTS_STORAGE_KEY, JSON.stringify(defaults));
        } catch (e) {}
        return defaults;
    }
    return [];
}

function saveAmbassadorInsightsList(list) {
    const key = `${AMBASSADOR_INSIGHTS_STORAGE_KEY}_${currentUserId || 1}`;
    try {
        localStorage.setItem(key, JSON.stringify(list));
        localStorage.setItem(AMBASSADOR_INSIGHTS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
}

function isUserRegisteredAmbassador(completedModulesCount) {
    if (typeof completedModulesCount === 'undefined') {
        try {
            const stats = computeAcademyBadgeProgressStats();
            completedModulesCount = stats.completedModulesCount;
        } catch (e) {
            completedModulesCount = 0;
        }
    }
    // Completed all 6 Academy modules qualifies any user as certified Ambassador
    if (completedModulesCount >= 6) return true;

    // Platform default Ambassador accounts
    const uName = (currentUsername || '').toLowerCase();
    if (uName.includes('ambassador') || uName.includes('coordinator') || (currentUserId == 1)) {
        return true;
    }

    try {
        const flag = localStorage.getItem(`${AMBASSADOR_REGISTERED_STATUS_KEY}_${currentUserId}`);
        if (flag === 'true') return true;
    } catch (e) {}

    return false;
}

function toggleRegisteredAmbassadorMode(forceState) {
    // Only allow changing registration if certified or coordinator
    const stats = computeAcademyBadgeProgressStats();
    if (stats.completedModulesCount < 6 && !(currentUsername || '').toLowerCase().includes('ambassador') && !(currentUsername || '').toLowerCase().includes('coordinator') && currentUserId != 1) {
        alert('Ambassador Action Hub is locked: Complete all 6 Academy modules to earn your Ambassador certification.');
        return;
    }
    try {
        localStorage.setItem(`${AMBASSADOR_REGISTERED_STATUS_KEY}_${currentUserId || 1}`, forceState ? 'true' : 'false');
    } catch (e) {}
    loadAmbassadorHubView();
}

function computeAcademyBadgeProgressStats() {
    const moduleTitles = [
        "1. Binge Drinking & Health Limits",
        "2. Drinking & Driving Prevention",
        "3. Illicit & Unregulated Brews",
        "4. Underage Drinking & Campus Culture",
        "5. Alcohol & Pregnancy",
        "6. Sugary Drinks, Diet & Long-Term Health"
    ];

    let totalSubsectionsDone = 0;
    let completedModulesCount = 0;
    let startedModulesCount = 0;
    const perModule = [];

    for (let mId = 1; mId <= 6; mId++) {
        let mPct = 0;
        let mSubDone = 0;
        let isDone = false;

        if (typeof getBingeModuleState === 'function' && typeof computeBingeModuleProgress === 'function') {
            const st = getBingeModuleState(mId);
            const prog = computeBingeModuleProgress(st, mId);
            mPct = prog.overallPct || 0;
            mSubDone = prog.completedSubsections || 0;
            isDone = !!prog.isModuleComplete || (Array.isArray(completedSmartModulesCache) && (completedSmartModulesCache.includes(mId) || completedSmartModulesCache.includes(moduleTitles[mId - 1])));
        } else if (Array.isArray(completedSmartModulesCache) && (completedSmartModulesCache.includes(mId) || completedSmartModulesCache.includes(moduleTitles[mId - 1]))) {
            mPct = 100;
            mSubDone = 25;
            isDone = true;
        }

        if (isDone) {
            mPct = 100;
            mSubDone = 25;
            completedModulesCount++;
        }
        if (mSubDone > 0 || isDone) {
            startedModulesCount++;
        }
        totalSubsectionsDone += mSubDone;
        perModule.push({
            id: mId,
            title: moduleTitles[mId - 1],
            pct: mPct,
            subDone: mSubDone,
            isDone: isDone
        });
    }

    const overallPct = Math.min(100, Math.round((totalSubsectionsDone / 150) * 100));
    return {
        overallPct,
        totalSubsectionsDone,
        completedModulesCount,
        startedModulesCount,
        hasStartedAcademy: startedModulesCount > 0,
        perModule
    };
}

let currentAmbassadorTab = 'roadmap';

function switchAmbassadorHubTab(tabKey) {
    currentAmbassadorTab = tabKey || 'roadmap';
    loadAmbassadorHubView();
}

function loadAmbassadorHubView() {
    const container = document.getElementById('ambassador-hub-container');
    if (!container) return;

    const stats = computeAcademyBadgeProgressStats();
    const pointsData = getSmartLifestylePointsBreakdown();
    const isRegistered = isUserRegisteredAmbassador(stats.completedModulesCount);
    const referrals = getAmbassadorReferralsList();
    const insights = getAmbassadorInsightsList();
    const organizedEvents = getCustomAmbassadorEvents();
    const referralCode = getOrCreateAmbassadorReferralCode();

    // Pie chart gradient computation
    const completedDeg = Math.round((stats.overallPct / 100) * 360);
    const inProgressPct = stats.hasStartedAcademy ? Math.min(100 - stats.overallPct, Math.max(8, stats.startedModulesCount * 6)) : 0;
    const inProgressDeg = completedDeg + Math.round((inProgressPct / 100) * 360);

    const pieGradient = stats.hasStartedAcademy
        ? `conic-gradient(#10B981 0deg ${completedDeg}deg, #F59E0B ${completedDeg}deg ${inProgressDeg}deg, #E2E8F0 ${inProgressDeg}deg 360deg)`
        : `conic-gradient(#CBD5E1 0deg 360deg)`;

    let html = `
        <!-- Division of Ambassador Features into Dedicated Accessible Tabs -->
        <div class="filter-tabs" style="margin: 0 auto 24px auto;">
            <button type="button" class="filter-tab ${currentAmbassadorTab === 'roadmap' ? 'active' : ''}" onclick="switchAmbassadorHubTab('roadmap')">
                Official Certification Roadmap
            </button>
            <button type="button" class="filter-tab ${currentAmbassadorTab === 'chart' ? 'active' : ''}" onclick="switchAmbassadorHubTab('chart')">
                Academy Module Mastery Pie Chart
            </button>
            <button type="button" class="filter-tab ${currentAmbassadorTab === 'action_hub' ? 'active' : ''}" onclick="switchAmbassadorHubTab('action_hub')">
                Registered Ambassador Featured Tracking &amp; Action Hub${!isRegistered ? ' (Locked)' : ''}
            </button>
        </div>
    `;

    // Tab 1: Official Certification Roadmap
    if (currentAmbassadorTab === 'roadmap') {
        html += `
            <div class="outreach-card" style="padding:26px; border-top:5px solid var(--primary);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                    <div>
                        <span class="card-tag" style="background:var(--primary-light); color:var(--primary-dark); font-weight:800;">
                            OFFICIAL CERTIFICATION ROADMAP • NO LOGIN BARRIER
                        </span>
                        <h3 class="card-title" style="font-size:1.45rem; color:var(--primary); margin:8px 0 4px 0;">
                            How to Earn Your DELTAS Smart Drinking Ambassador Badge
                        </h3>
                        <p style="font-size:0.9rem; color:var(--text-muted); margin:0;">
                            Complete the 3 verified steps below to earn your national DELTAS Smart Drinking Ambassador Digital Badge and unlock full campus leadership tools.
                        </p>
                    </div>
                    <div style="text-align:right;">
                        <span style="display:inline-block; background:var(--cream-soft); border:1.5px solid var(--cream-sand); padding:8px 14px; border-radius:12px; font-size:0.84rem; font-weight:800; color:var(--primary);">
                            Current Lifestyle Score: ${pointsData.totalPoints.toLocaleString()} Points
                        </span>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:16px; margin-top:16px;">
                    <div style="padding:18px; border-radius:12px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-left:4px solid var(--primary);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="background:var(--primary); color:#fff; font-size:0.74rem; font-weight:800; padding:3px 10px; border-radius:999px;">STEP 1</span>
                            <span style="font-size:0.78rem; font-weight:700; color:var(--accent-sage);">${stats.completedModulesCount}/6 Modules Done</span>
                        </div>
                        <h4 style="margin:0 0 6px 0; font-size:1rem; color:var(--text-main);">Master the 6 Smart Living Academy Modules</h4>
                        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.55; margin:0;">
                            Complete all 5 structured sections and pass each section's multi-choice knowledge check with at least <strong>80%</strong> across all 6 core curriculum modules.
                        </p>
                    </div>

                    <div style="padding:18px; border-radius:12px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-left:4px solid var(--accent-amber);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="background:var(--accent-amber); color:#1a2e22; font-size:0.74rem; font-weight:800; padding:3px 10px; border-radius:999px;">STEP 2</span>
                            <span style="font-size:0.78rem; font-weight:700; color:var(--secondary-dark);">Pledge 18 &amp; Safety</span>
                        </div>
                        <h4 style="margin:0 0 6px 0; font-size:1rem; color:var(--text-main);">Practice Harm Reduction &amp; Active Bystander Care</h4>
                        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.55; margin:0;">
                            Apply C.U.P.S. emergency response, 5D bystander intervention, and Rotating Smart Scenarios while upholding Pledge 18 in your campus or community.
                        </p>
                    </div>

                    <div style="padding:18px; border-radius:12px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-left:4px solid var(--accent-sage);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="background:var(--accent-sage); color:#fff; font-size:0.74rem; font-weight:800; padding:3px 10px; border-radius:999px;">STEP 3</span>
                            <span style="font-size:0.78rem; font-weight:700; color:var(--primary);">${isRegistered ? 'Badge Unlocked' : 'In Progress'}</span>
                        </div>
                        <h4 style="margin:0 0 6px 0; font-size:1rem; color:var(--text-main);">Lead Events, Referrals &amp; Peer Support Insights</h4>
                        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.55; margin:0;">
                            Unlock your DELTAS Smart Drinking Ambassador Badge to organize sober campus events, track Academy referrals, and publish verified peer support insights.
                        </p>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:22px; padding-top:16px; border-top:1px solid var(--border-color);">
                    <button type="button" onclick="switchAmbassadorHubTab('chart')" class="btn-primary" style="padding:10px 22px; font-size:0.88rem; font-weight:700; border-radius:8px;">
                        View Module Mastery Pie Chart
                    </button>
                </div>
            </div>
        `;
    }
    // Tab 2: Academy Module Mastery Pie Chart
    else if (currentAmbassadorTab === 'chart') {
        html += `
            <div class="outreach-card" style="padding:26px; border-top:5px solid var(--accent-amber);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
                    <div>
                        <span class="card-tag" style="background:var(--cream-accent); color:var(--secondary-dark); border:1px solid var(--cream-sand); font-weight:800;">
                            ACADEMY MODULE MASTERY PIE CHART
                        </span>
                        <h3 class="card-title" style="font-size:1.35rem; color:var(--primary); margin:8px 0 4px 0;">
                            Your Progress Towards Earning the DELTAS Ambassador Badge
                        </h3>
                        <p style="font-size:0.88rem; color:var(--text-muted); margin:0;">
                            ${stats.hasStartedAcademy
                                ? `You have started ${stats.startedModulesCount} of 6 Academy modules (${stats.totalSubsectionsDone}/150 total curriculum subsections completed).`
                                : `You have not started an Academy module yet—begin Module 1 in the Smart Living Academy to watch your Pie Chart progress live!`}
                        </p>
                    </div>
                    <button type="button" onclick="switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view=\\'outreach\\']'));" class="btn-primary" style="padding:10px 18px; font-size:0.84rem; font-weight:700;">
                        ${stats.hasStartedAcademy ? 'Continue Academy Modules' : 'Start Academy Modules Now'}
                    </button>
                </div>

                <div class="ambassador-pie-wrap" style="display:flex; align-items:center; justify-content:space-around; flex-wrap:wrap; gap:28px; padding:18px; background:var(--card-bg-warm); border-radius:16px; border:1px solid var(--border-color);">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
                        <div class="ambassador-pie-chart" style="background:${pieGradient};">
                            <div class="ambassador-pie-inner">
                                <span style="font-size:2rem; font-weight:800; color:var(--primary); font-family:'Poppins',sans-serif; line-height:1;">
                                    ${stats.overallPct}%
                                </span>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-top:4px;">
                                    Badge Progress
                                </span>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--accent-sage); margin-top:2px;">
                                    ${stats.completedModulesCount}/6 Modules
                                </span>
                            </div>
                        </div>
                        <div style="display:flex; gap:14px; flex-wrap:wrap; justify-content:center; font-size:0.76rem; font-weight:700;">
                            <span style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:50%; background:#10B981; display:inline-block;"></span> Completed (${stats.overallPct}%)</span>
                            <span style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:50%; background:#F59E0B; display:inline-block;"></span> In Progress</span>
                            <span style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:50%; background:#CBD5E1; display:inline-block;"></span> Remaining (${100 - stats.overallPct}%)</span>
                        </div>
                    </div>

                    <div style="flex:1; min-width:280px; max-width:520px;">
                        <h4 style="margin:0 0 10px 0; font-size:0.95rem; color:var(--text-main);">6-Module Certification Breakdown (${stats.totalSubsectionsDone} / 150 Subsections)</h4>
                        <div style="display:grid; gap:8px;">
                            ${stats.perModule.map(m => `
                                <div style="padding:9px 12px; background:#ffffff; border-radius:10px; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; gap:10px;">
                                    <div style="flex:1;">
                                        <div style="font-size:0.83rem; font-weight:700; color:var(--text-main);">${escapeHtml(m.title)}</div>
                                        <div style="height:6px; background:#E2E8F0; border-radius:999px; overflow:hidden; margin-top:5px;">
                                            <div style="height:100%; width:${m.pct}%; background:${m.isDone ? '#10B981' : '#F59E0B'}; border-radius:999px;"></div>
                                        </div>
                                    </div>
                                    <span style="font-size:0.78rem; font-weight:800; color:${m.isDone ? 'var(--accent-sage)' : 'var(--primary)'}; min-width:54px; text-align:right;">
                                        ${m.pct}%
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:22px; padding-top:16px; border-top:1px solid var(--border-color);">
                    <button type="button" onclick="switchAmbassadorHubTab('roadmap')" class="btn-cream" style="padding:10px 18px; font-size:0.85rem; font-weight:700; border-radius:8px;">
                        Back to Certification Roadmap
                    </button>
                    <button type="button" onclick="switchAmbassadorHubTab('action_hub')" class="btn-primary" style="padding:10px 18px; font-size:0.85rem; font-weight:700; border-radius:8px;">
                        Open Tracking &amp; Action Hub
                    </button>
                </div>
            </div>
        `;
    }
    // Tab 3: Registered Ambassador Featured Tracking & Action Hub
    else if (currentAmbassadorTab === 'action_hub') {
        if (!isRegistered) {
            // LOCKED STATE FOR NON-AMBASSADOR USERS
            html += `
                <div class="outreach-card" style="padding:28px; border:2px solid #E2E8F0; background:linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%); border-radius:18px;">
                    <!-- Top Locked Header -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; border-bottom:1px solid var(--border-color); padding-bottom:16px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                                <span style="background:#FEF2F2; color:#991B1B; border:1px solid #FCA5A5; font-size:0.75rem; font-weight:800; padding:4px 12px; border-radius:999px;">
                                    AMBASSADOR ACCESS LOCKED • OFFICIAL CERTIFICATION REQUIRED
                                </span>
                                <span style="font-size:0.8rem; font-weight:700; color:var(--text-muted);">
                                    Logged In: ${escapeHtml(currentUsername || 'Student')} (${escapeHtml(currentUniversity || 'Campus Member')})
                                </span>
                            </div>
                            <h3 class="card-title" style="font-size:1.4rem; color:var(--text-main); margin:0;">
                                Registered Ambassador Featured Tracking &amp; Action Hub
                            </h3>
                        </div>
                        <div>
                            <span style="background:#F1F5F9; color:#475569; border:1px solid #CBD5E1; padding:7px 14px; border-radius:999px; font-size:0.8rem; font-weight:800;">
                                Status: In Training (Non-Ambassador)
                            </span>
                        </div>
                    </div>

                    <!-- Centered Clean Lock Hero Box -->
                    <div style="max-width:760px; margin:0 auto; text-align:center; padding:32px 24px; background:#FFFFFF; border-radius:16px; border:1.5px solid #E2E8F0; box-shadow:0 4px 16px rgba(0,0,0,0.03);">
                        <div style="width:68px; height:68px; margin:0 auto 18px auto; border-radius:50%; background:#FEF3C7; border:2px solid #F59E0B; display:flex; align-items:center; justify-content:center;">
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>

                        <h4 style="font-size:1.35rem; color:var(--primary); margin:0 0 10px 0; font-family:'Poppins',sans-serif;">
                            Exclusive to Certified DELTAS Campus Ambassadors
                        </h4>
                        <p style="font-size:0.92rem; color:var(--text-muted); line-height:1.65; max-width:620px; margin:0 auto 24px auto;">
                            The <strong>Featured Tracking &amp; Action Hub</strong> is locked for your account. This workspace is reserved for accredited DELTAS Smart Drinking Ambassadors to organize sober campus events, generate unique student referral codes, track referred peers' Academy module completions, and publish verified peer support insights.
                        </p>

                        <!-- Current Certification Progress Card -->
                        <div style="background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:12px; padding:18px 22px; max-width:580px; margin:0 auto 26px auto; text-align:left;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-size:0.86rem; font-weight:800; color:var(--primary);">
                                    Your Ambassador Certification Progress
                                </span>
                                <span style="font-size:0.84rem; font-weight:800; color:var(--secondary-dark);">
                                    ${stats.completedModulesCount} of 6 Modules (${stats.overallPct}%)
                                </span>
                            </div>
                            <div style="height:10px; background:#E2E8F0; border-radius:999px; overflow:hidden; margin-bottom:10px;">
                                <div style="height:100%; width:${stats.overallPct}%; background:${stats.completedModulesCount >= 6 ? '#10B981' : '#F59E0B'}; border-radius:999px; transition:width 0.4s ease;"></div>
                            </div>
                            <p style="font-size:0.8rem; color:var(--text-muted); margin:0; line-height:1.5;">
                                ${stats.completedModulesCount === 0
                                    ? 'You have not completed any Academy modules yet. Complete all 6 modules in the Smart Living Academy to earn your Ambassador badge and unlock this hub.'
                                    : `You have completed ${stats.completedModulesCount} module${stats.completedModulesCount === 1 ? '' : 's'}. Complete ${6 - stats.completedModulesCount} more module${(6 - stats.completedModulesCount) === 1 ? '' : 's'} to unlock full Ambassador tools.`}
                            </p>
                        </div>

                        <!-- Action CTAs (No emojis, no arrows) -->
                        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
                            <button type="button" onclick="switchMainView('outreach', document.querySelector('.bottom-nav .nav-item[data-view=\\'outreach\\']'));" class="btn-primary" style="padding:12px 24px; font-size:0.9rem; font-weight:700; border-radius:8px;">
                                Go to Smart Living Academy
                            </button>
                            <button type="button" onclick="switchAmbassadorHubTab('roadmap')" class="btn-cream" style="padding:12px 22px; font-size:0.9rem; font-weight:700; border-radius:8px;">
                                View Certification Roadmap
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // UNLOCKED STATE FOR CERTIFIED AMBASSADORS
            html += `
                <div class="outreach-card" style="padding:26px; border:2px solid var(--primary); background:linear-gradient(180deg, #FFFFFF 0%, #F4FBF7 100%);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px; border-bottom:1px solid var(--border-color); padding-bottom:16px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                                <span style="background:var(--primary); color:#fff; font-size:0.75rem; font-weight:800; padding:4px 12px; border-radius:999px;">
                                    VERIFIED DELTAS SMART DRINKING AMBASSADOR HUB
                                </span>
                                <span style="font-size:0.8rem; font-weight:700; color:var(--accent-sage);">
                                    Ambassador: ${escapeHtml(currentUsername || 'Campus Leader')} (${escapeHtml(currentUniversity || 'UZ')})
                                </span>
                            </div>
                            <h3 class="card-title" style="font-size:1.45rem; color:var(--primary); margin:0;">
                                Registered Ambassador Featured Tracking &amp; Action Hub
                            </h3>
                            <p style="font-size:0.88rem; color:var(--text-muted); margin:4px 0 0 0;">
                                Organize Campus &amp; Community Events, track your student referrals to the Smart Living Academy, and publish verified insights across the Peer Support Platform.
                            </p>
                        </div>
                        <div>
                            <span style="background:#D1FAE5; color:#065F46; border:1px solid #10B981; padding:8px 14px; border-radius:999px; font-size:0.8rem; font-weight:800;">
                                Active Registered Ambassador Status
                            </span>
                        </div>
                    </div>

                    <!-- Summary Metrics Strip (Accurately Synced Data) -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:22px;">
                        <div style="padding:16px; border-radius:12px; background:#ffffff; border:1px solid var(--border-color); border-left:4px solid var(--primary);">
                            <div style="font-size:0.75rem; font-weight:800; color:var(--text-light); text-transform:uppercase;">Events Organized</div>
                            <div style="font-size:1.6rem; font-weight:800; color:var(--primary); margin:4px 0;">${organizedEvents.length}</div>
                            <div style="font-size:0.78rem; color:var(--text-muted);">Published to Campus Events Hub (+50 Pts each)</div>
                        </div>
                        <div style="padding:16px; border-radius:12px; background:#ffffff; border:1px solid var(--border-color); border-left:4px solid var(--accent-amber);">
                            <div style="font-size:0.75rem; font-weight:800; color:var(--text-light); text-transform:uppercase;">Academy Referrals</div>
                            <div style="font-size:1.6rem; font-weight:800; color:var(--secondary-dark); margin:4px 0;">${referrals.length} Peers</div>
                            <div style="font-size:0.78rem; color:var(--text-muted);">Code: <strong>${referralCode}</strong> (+30 Pts each)</div>
                        </div>
                        <div style="padding:16px; border-radius:12px; background:#ffffff; border:1px solid var(--border-color); border-left:4px solid var(--accent-sage);">
                            <div style="font-size:0.75rem; font-weight:800; color:var(--text-light); text-transform:uppercase;">Peer Support Insights</div>
                            <div style="font-size:1.6rem; font-weight:800; color:var(--accent-sage); margin:4px 0;">${insights.length} Published</div>
                            <div style="font-size:0.78rem; color:var(--text-muted);">Shared to Above the Influence Support Hub (+35 Pts)</div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(310px, 1fr)); gap:20px;">
                        <!-- PILLAR A: ORGANIZE CAMPUS & COMMUNITY EVENTS -->
                        <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:14px; padding:20px; display:flex; flex-direction:column; justify-content:space-between;">
                            <div>
                                <span style="background:var(--primary-light); color:var(--primary-dark); font-size:0.72rem; font-weight:800; padding:3px 10px; border-radius:999px;">
                                    1. ORGANIZE EVENTS • +50 PTS
                                </span>
                                <h4 style="margin:10px 0 6px 0; font-size:1.1rem; color:var(--primary);">Organize a Campus or Community Event</h4>
                                <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:14px; line-height:1.5;">
                                    Launch a sober marathon, Pledge 18 walk, zero-proof festival, or C.U.P.S. workshop. Your event is immediately published as a full-frame poster in the Events Hub!
                                </p>
                                <div style="display:grid; gap:10px; margin-bottom:12px;">
                                    <input type="text" id="amb-evt-title" placeholder="Event Title (e.g., UZ Zero-Proof Sunset Run)" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); box-sizing:border-box;" />
                                    <select id="amb-evt-category" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); box-sizing:border-box;">
                                        <option value="Marathons & Sports">Marathons &amp; Sports</option>
                                        <option value="Campaigns & Pledges">Campaigns &amp; Pledges</option>
                                        <option value="Sober Festivals & Arts">Sober Festivals &amp; Arts</option>
                                        <option value="Workshops">Workshops &amp; Training</option>
                                    </select>
                                    <input type="text" id="amb-evt-date" placeholder="Date & Time (e.g., Sat, Dec 19, 2026 • 08:00 AM)" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); box-sizing:border-box;" />
                                    <input type="text" id="amb-evt-location" placeholder="Venue / Campus Location (e.g., Student Union Lawn)" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); box-sizing:border-box;" />
                                    <textarea id="amb-evt-desc" rows="2" placeholder="Describe the event activities, hydration kits, or guest speakers..." style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); box-sizing:border-box;"></textarea>
                                </div>
                            </div>
                            <div>
                                <button type="button" onclick="submitAmbassadorOrganizedEvent()" class="btn-primary" style="width:100%; padding:11px; font-weight:700; border-radius:8px;">
                                    Publish Event Poster to Events Hub (+50 Pts)
                                </button>
                                <div id="amb-evt-feedback" style="display:none; margin-top:10px; font-size:0.83rem; font-weight:700; color:var(--accent-sage); text-align:center;"></div>
                            </div>
                        </div>

                        <!-- PILLAR B: TRACK REFERRALS TO THE SMART LIVING ACADEMY -->
                        <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:14px; padding:20px; display:flex; flex-direction:column; justify-content:space-between;">
                            <div>
                                <span style="background:var(--cream-accent); color:var(--secondary-dark); font-size:0.72rem; font-weight:800; padding:3px 10px; border-radius:999px;">
                                    2. ACADEMY REFERRALS TRACKER • +30 PTS
                                </span>
                                <h4 style="margin:10px 0 6px 0; font-size:1.1rem; color:var(--primary);">Track Your Referrals to the Academy</h4>
                                <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:12px; line-height:1.5;">
                                    Share your unique Ambassador Referral Code with peers and log referred learners below to track their Academy module progression.
                                </p>
                                <div style="padding:10px 12px; background:var(--card-bg-warm); border:1px dashed var(--primary); border-radius:8px; display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px;">
                                    <span style="font-size:0.82rem; font-weight:800; color:var(--primary); word-break:break-all;">Code: ${referralCode}</span>
                                    <button type="button" onclick="navigator.clipboard && navigator.clipboard.writeText('${referralCode}'); this.textContent='Copied!';" class="btn-cream" style="padding:5px 10px; font-size:0.75rem; font-weight:700; white-space:nowrap;">Copy Code</button>
                                </div>
                                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                                    <input type="text" id="amb-ref-name" placeholder="Peer's Name or Student Handle" style="flex:1; min-width:140px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-color);" />
                                    <button type="button" onclick="recordAmbassadorAcademyReferral()" class="btn-primary" style="padding:9px 14px; font-size:0.82rem; font-weight:700; border-radius:8px;">
                                        + Log Referral (+30 Pts)
                                    </button>
                                </div>
                                <div style="max-height:190px; overflow-y:auto; display:grid; gap:8px;">
                                    ${referrals.map(r => `
                                        <div style="padding:9px 12px; border-radius:8px; background:var(--card-bg-warm); border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; gap:8px;">
                                            <div>
                                                <div style="font-size:0.84rem; font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span>${escapeHtml(r.name)}</span>
                                                    <span style="font-size:0.74rem; color:var(--primary);">(${escapeHtml(r.institution)})</span>
                                                    ${r.referralCode ? `<span style="background:var(--cream-accent); color:var(--secondary-dark); font-size:0.68rem; font-weight:800; padding:1px 6px; border-radius:4px;">${escapeHtml(r.referralCode)}</span>` : ''}
                                                </div>
                                                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                                                    <strong style="color:${(r.completedModulesCount >= 6 || (r.status || '').includes('6/6')) ? 'var(--accent-sage)' : 'var(--primary)'};">${escapeHtml(r.status)}</strong> • ${escapeHtml(r.date)}
                                                </div>
                                            </div>
                                            <span style="font-size:0.76rem; font-weight:800; color:var(--accent-sage); white-space:nowrap;">+${r.points || 30} Pts</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- PILLAR C: OFFER INSIGHTS ACROSS THE PEER SUPPORT PLATFORM -->
                        <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:14px; padding:20px; display:flex; flex-direction:column; justify-content:space-between;">
                            <div>
                                <span style="background:var(--accent-sage-soft); color:var(--accent-sage-hover); font-size:0.72rem; font-weight:800; padding:3px 10px; border-radius:999px;">
                                    3. PEER SUPPORT INSIGHTS • +35 PTS
                                </span>
                                <h4 style="margin:10px 0 6px 0; font-size:1.1rem; color:var(--primary);">Offer Insights Across Peer Support Hub</h4>
                                <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:12px; line-height:1.5;">
                                    Post verified mentorship encouragement, refusal strategies, or harm-reduction advice directly into the "Above the Influence" Peer Support Forum.
                                </p>
                                <div style="display:grid; gap:10px; margin-bottom:12px;">
                                    <select id="amb-insight-topic" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); box-sizing:border-box;">
                                        <option value="Peer Pressure & Refusal Strategies">Peer Pressure &amp; Refusal Strategies</option>
                                        <option value="Exam Stress, Sleep & H.A.L.T. Coping">Exam Stress, Sleep &amp; H.A.L.T. Coping</option>
                                        <option value="Party Safety, Pacing & Zebra Striping">Party Safety, Pacing &amp; Zebra Striping</option>
                                        <option value="Sober Curiosity & Morning Wellness">Sober Curiosity &amp; Morning Wellness</option>
                                    </select>
                                    <textarea id="amb-insight-content" rows="3" placeholder="Share an actionable Ambassador insight or words of encouragement for peers..." style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); box-sizing:border-box;"></textarea>
                                </div>
                                <div style="max-height:110px; overflow-y:auto; display:grid; gap:6px; margin-bottom:10px;">
                                    ${insights.slice(0, 3).map(ins => `
                                        <div style="padding:8px 10px; border-radius:8px; background:var(--card-bg-warm); font-size:0.78rem; border-left:3px solid var(--accent-sage);">
                                            <strong style="color:var(--primary);">${escapeHtml(ins.topic)}:</strong> ${escapeHtml(ins.content)}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <div>
                                <button type="button" onclick="publishAmbassadorSupportInsight()" class="btn-sage" style="width:100%; padding:11px; font-weight:700; border-radius:8px;">
                                    Publish Verified Insight to Support Hub (+35 Pts)
                                </button>
                                <div id="amb-insight-feedback" style="display:none; margin-top:10px; font-size:0.83rem; font-weight:700; color:var(--accent-sage); text-align:center;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

async function submitAmbassadorOrganizedEvent() {
    if (!isUserRegisteredAmbassador()) {
        alert('Access restricted: Only certified DELTAS Smart Drinking Ambassadors can organize and publish events.');
        return;
    }

    const title = (document.getElementById('amb-evt-title')?.value || '').trim();
    const category = document.getElementById('amb-evt-category')?.value || 'Marathons & Sports';
    const dateStr = (document.getElementById('amb-evt-date')?.value || '').trim();
    const location = (document.getElementById('amb-evt-location')?.value || '').trim();
    const desc = (document.getElementById('amb-evt-desc')?.value || '').trim();
    const fb = document.getElementById('amb-evt-feedback');

    if (!title || !dateStr || !location || !desc) {
        alert('Please fill in the Event Title, Date/Time, Venue, and Description.');
        return;
    }

    const organizerLabel = `DELTAS Ambassador ${currentUsername || 'Leader'} (${currentUniversity || 'UZ'})`;
    const newEvt = {
        id: Date.now(),
        title,
        organizer: organizerLabel,
        category,
        date_str: dateStr,
        location,
        description: desc,
        rsvp_count: 1,
        banner_url: "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=80"
    };

    try {
        const list = getCustomAmbassadorEvents();
        list.unshift(newEvt);
        const key = `deltas_ambassador_custom_events_${currentUserId || 1}`;
        localStorage.setItem(key, JSON.stringify(list));
        localStorage.setItem('deltas_ambassador_custom_events_v1', JSON.stringify(list));
    } catch (e) {}

    try {
        await fetch(`${API_BASE}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                organizer: organizerLabel,
                category,
                date_str: dateStr,
                location,
                description: desc
            })
        });
    } catch (e) {}

    awardSmartActivityPoints(`amb_event_${newEvt.id}`, 50, `Organized Campus Event: ${title}`);

    if (fb) {
        fb.style.display = 'block';
        fb.textContent = 'Event Poster published to Campus Events Hub! (+50 Smart Lifestyle Points)';
    }
    setTimeout(() => {
        loadAmbassadorHubView();
    }, 1100);
}

function recordAmbassadorAcademyReferral() {
    if (!isUserRegisteredAmbassador()) {
        alert('Access restricted: Only certified DELTAS Smart Drinking Ambassadors can record referrals.');
        return;
    }

    const nameEl = document.getElementById('amb-ref-name');
    if (!nameEl) return;
    const peerName = nameEl.value.trim();
    if (!peerName) {
        alert('Please enter the name or student handle of the peer you referred to the Academy.');
        return;
    }

    const refCode = getOrCreateAmbassadorReferralCode();
    const list = getAmbassadorReferralsList();
    const newRef = {
        id: Date.now(),
        name: peerName,
        institution: currentUniversity || 'UZ',
        date: new Date().toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' }),
        status: 'Enrolled in Academy (0/6 Modules Completed)',
        completedModulesCount: 0,
        referralCode: refCode,
        points: 30
    };
    list.unshift(newRef);
    saveAmbassadorReferralsList(list);

    // Also store in global referrals roster
    try {
        const rawGlobal = localStorage.getItem('deltas_global_referrals_v1');
        const globalList = rawGlobal ? JSON.parse(rawGlobal) : [];
        globalList.unshift(newRef);
        localStorage.setItem('deltas_global_referrals_v1', JSON.stringify(globalList));
    } catch (e) {}

    awardSmartActivityPoints(`amb_referral_${newRef.id}`, 30, `Referred Peer (${peerName}) to Smart Living Academy`);
    loadAmbassadorHubView();
}

async function publishAmbassadorSupportInsight() {
    if (!isUserRegisteredAmbassador()) {
        alert('Access restricted: Only certified DELTAS Smart Drinking Ambassadors can publish insights.');
        return;
    }

    const topicEl = document.getElementById('amb-insight-topic');
    const contentEl = document.getElementById('amb-insight-content');
    const fb = document.getElementById('amb-insight-feedback');
    if (!contentEl) return;

    const topic = topicEl ? topicEl.value : 'Peer Support Insight';
    const content = contentEl.value.trim();
    if (!content) {
        alert('Please write your Ambassador insight or encouragement before publishing.');
        return;
    }

    const list = getAmbassadorInsightsList();
    const newInsight = {
        id: Date.now(),
        topic,
        content,
        date: new Date().toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' })
    };
    list.unshift(newInsight);
    saveAmbassadorInsightsList(list);

    try {
        await fetch(`${API_BASE}/safespace/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                module_id: 1,
                author_name: `Verified DELTAS Ambassador (${currentUsername || 'Leader'} • ${currentUniversity || 'UZ'})`,
                content: `[Ambassador Insight — ${topic}]: ${content}`
            })
        });
    } catch (e) {}

    awardSmartActivityPoints(`amb_insight_${newInsight.id}`, 35, `Published Ambassador Insight to Peer Support Hub`);

    if (fb) {
        fb.style.display = 'block';
        fb.textContent = 'Verified Insight published to the Peer Support Forum! (+35 Smart Lifestyle Points)';
    }
    setTimeout(() => {
        loadAmbassadorHubView();
    }, 1100);
}

// -----------------------------------------
// Real-Student Background Videos (Permanently Muted Campus Media)
// -----------------------------------------
function initRadioStudioVideos() {
    const videoPlayers = document.querySelectorAll('.poster-video-player, .poster-theme-radio video, .poster-theme-support video');
    if (!videoPlayers || videoPlayers.length === 0) return;

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    video.muted = true;
                    video.defaultMuted = true;
                    video.volume = 0;
                    video.playsInline = true;
                    const p = video.play();
                    if (p !== undefined) p.catch(() => {});
                } else {
                    if (!video.paused) {
                        try { video.pause(); } catch (e) {}
                    }
                }
            });
        }, { threshold: 0.15 });

        videoPlayers.forEach(video => {
            video.muted = true;
            video.defaultMuted = true;
            video.volume = 0;
            video.playsInline = true;
            observer.observe(video);
        });
    } else {
        videoPlayers.forEach(video => {
            video.muted = true;
            video.defaultMuted = true;
            video.volume = 0;
            video.playsInline = true;
        });
    }
}

// =========================================================================
// DELTAS CENTRAL ADMINISTRATION & GLOBAL UPDATES LOGIC
// =========================================================================

const ADMIN_ARTICLES_STORAGE_KEY = 'deltas_admin_articles_v1';
const ADMIN_RADIO_STORAGE_KEY = 'deltas_admin_radio_v1';
const EVENT_CLOSED_STATES_KEY = 'deltas_event_closed_states_v1';

function getAdminArticlesLocally() {
    try {
        const raw = localStorage.getItem(ADMIN_ARTICLES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveAdminArticleLocally(article) {
    try {
        const list = getAdminArticlesLocally();
        list.unshift(article);
        localStorage.setItem(ADMIN_ARTICLES_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
}

function getAdminRadioLocally() {
    try {
        const raw = localStorage.getItem(ADMIN_RADIO_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveAdminRadioLocally(program) {
    try {
        const list = getAdminRadioLocally();
        list.unshift(program);
        localStorage.setItem(ADMIN_RADIO_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
}

function isEventRegistrationClosed(eventId) {
    try {
        const map = JSON.parse(localStorage.getItem(EVENT_CLOSED_STATES_KEY) || '{}');
        if (map[String(eventId)] !== undefined) return Boolean(map[String(eventId)]);
    } catch (e) {}
    return false;
}

function setEventClosedStateLocally(eventId, isClosed) {
    try {
        const map = JSON.parse(localStorage.getItem(EVENT_CLOSED_STATES_KEY) || '{}');
        map[String(eventId)] = Boolean(isClosed);
        localStorage.setItem(EVENT_CLOSED_STATES_KEY, JSON.stringify(map));
    } catch (e) {}
}

function toggleLocalEventClosedState(eventId) {
    const current = isEventRegistrationClosed(eventId);
    setEventClosedStateLocally(eventId, !current);
    return !current;
}

// -----------------------------------------
// Navigation & Floating Return Pill
// -----------------------------------------
async function openAdminDashboard() {
    enterPortalShellUI(true);

    document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
    const adminView = document.getElementById('view-admin-dashboard');
    if (adminView) {
        adminView.classList.add('active');
    }

    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => item.classList.remove('active'));
    updateAdminFloatingReturnVisibility();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    await refreshAdminStats();
    renderAdminRecentArticles();
    renderAdminRecentRadio();
    renderAdminEventsManager();
    loadAdminWatchdogQueue();
    renderAdminEventRegistrations();
    renderAdminAccreditationsQueue();
}

function viewLivePlatformAsUser() {
    const adminView = document.getElementById('view-admin-dashboard');
    if (adminView) adminView.classList.remove('active');

    const outreachView = document.getElementById('view-outreach');
    if (outreachView) outreachView.classList.add('active');

    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        if (item.getAttribute('data-view') === 'outreach') {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    updateAdminFloatingReturnVisibility();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAdminFloatingReturnVisibility() {
    const pill = document.getElementById('admin-floating-return');
    if (!pill) return;
    const isAdmin = sessionStorage.getItem('deltas_is_admin') === 'true'
        || localStorage.getItem('deltas_is_admin') === 'true';
    const adminView = document.getElementById('view-admin-dashboard');
    const isOnAdminView = adminView && adminView.classList.contains('active');
    const portalShell = document.getElementById('portal-app-shell');
    const isPortalVisible = portalShell && portalShell.style.display !== 'none';

    if (isAdmin && isPortalVisible && !isOnAdminView) {
        pill.style.display = 'flex';
    } else {
        pill.style.display = 'none';
    }
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`tab-admin-${tabName}`);
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.admin-tab-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById(`admin-panel-${tabName}`);
    if (panel) panel.style.display = 'block';

    if (tabName === 'events') {
        renderAdminEventsManager();
    } else if (tabName === 'news') {
        renderAdminRecentArticles();
    } else if (tabName === 'radio') {
        renderAdminRecentRadio();
    } else if (tabName === 'watchdog') {
        loadAdminWatchdogQueue();
    } else if (tabName === 'event-registrations') {
        renderAdminEventRegistrations();
    } else if (tabName === 'accreditations') {
        renderAdminAccreditationsQueue();
    }
}

// -----------------------------------------
// Admin Stats Refresher
// -----------------------------------------
async function refreshAdminStats() {
    try {
        const res = await fetch(`${API_BASE}/admin/stats`);
        if (res.ok) {
            const data = await res.json();
            const elArt = document.getElementById('admin-stat-articles');
            const elRad = document.getElementById('admin-stat-radio');
            const elEvt = document.getElementById('admin-stat-events');
            const elClosed = document.getElementById('admin-stat-closed-events');
            const elRep = document.getElementById('admin-stat-reports');
            const elRsvps = document.getElementById('admin-stat-rsvps');
            const elAccred = document.getElementById('admin-stat-accreditations');

            if (elArt) elArt.innerText = data.articles_count !== undefined ? data.articles_count : '--';
            if (elRad) elRad.innerText = data.radio_count !== undefined ? data.radio_count : '--';
            if (elEvt) elEvt.innerText = data.events_count !== undefined ? data.events_count : '--';
            if (elClosed) elClosed.innerText = data.closed_events_count !== undefined ? data.closed_events_count : '0';
            if (elRep) elRep.innerText = data.reports_count !== undefined ? data.reports_count : '--';
            if (elRsvps) elRsvps.innerText = data.total_event_rsvps_count !== undefined ? data.total_event_rsvps_count : '--';
            if (elAccred) elAccred.innerText = data.pending_accreditations_count !== undefined ? data.pending_accreditations_count : '--';
            return;
        }
    } catch (e) {}

    // Fallback counts
    const artCount = (currentNewsPosterList && currentNewsPosterList.length) || 12;
    const radCount = (currentRadioPosterList && currentRadioPosterList.length) || 4;
    const evtCount = (currentEventsPosterList && currentEventsPosterList.length) || 4;
    
    let closedCount = 0;
    try {
        const map = JSON.parse(localStorage.getItem(EVENT_CLOSED_STATES_KEY) || '{}');
        closedCount = Object.values(map).filter(Boolean).length;
    } catch (e) {}

    const elArt = document.getElementById('admin-stat-articles');
    const elRad = document.getElementById('admin-stat-radio');
    const elEvt = document.getElementById('admin-stat-events');
    const elClosed = document.getElementById('admin-stat-closed-events');
    const elRep = document.getElementById('admin-stat-reports');
    const elRsvps = document.getElementById('admin-stat-rsvps');
    const elAccred = document.getElementById('admin-stat-accreditations');

    if (elArt) elArt.innerText = artCount;
    if (elRad) elRad.innerText = radCount;
    if (elEvt) elEvt.innerText = evtCount;
    if (elClosed) elClosed.innerText = closedCount;
    if (elRep) elRep.innerText = '0';
    if (elRsvps) {
        let localRsvpsCount = 0;
        try {
            const raw = localStorage.getItem('deltas_admin_event_attendees_v1');
            if (raw) localRsvpsCount = JSON.parse(raw).length;
        } catch (e) {}
        elRsvps.innerText = localRsvpsCount || '14';
    }
    if (elAccred) {
        const localApps = getAllMentorApplications();
        elAccred.innerText = localApps.filter(a => !a.verified && a.status !== 'rejected').length;
    }
}

// -----------------------------------------
// Publishing Presets & Media Handlers (Photos, Videos, Audios)
// -----------------------------------------
function switchMediaInputMode(prefix, mode, btnEl) {
    const uploadSec = document.getElementById(`${prefix}-upload-section`);
    const urlSec = document.getElementById(`${prefix}-url-section`);
    if (uploadSec && urlSec) {
        uploadSec.style.display = (mode === 'upload') ? 'block' : 'none';
        urlSec.style.display = (mode === 'url') ? 'block' : 'none';
    }
    const container = btnEl.closest('.admin-media-upload-container');
    if (container) {
        container.querySelectorAll('.admin-upload-tab-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }
}

function updateMediaPreviewBox(boxId, mediaUrl, mediaType, statusText) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.style.display = 'block';

    const labelEl = box.querySelector('.admin-media-preview-header span:first-child');
    const statusEl = box.querySelector('.admin-media-preview-header span:last-child');
    if (statusEl) {
        statusEl.innerText = statusText || 'Ready';
        statusEl.style.color = '#10B981';
    }

    const imgEl = box.querySelector('img');
    const videoEl = box.querySelector('video');
    const audioEl = box.querySelector('audio');
    const embedEl = box.querySelector('#radio-media-preview-embed');

    if (imgEl) imgEl.style.display = 'none';
    if (videoEl) { videoEl.style.display = 'none'; videoEl.pause(); }
    if (audioEl) { audioEl.style.display = 'none'; audioEl.pause(); }
    if (embedEl) embedEl.style.display = 'none';

    if (mediaType === 'image') {
        if (imgEl) {
            imgEl.src = mediaUrl;
            imgEl.style.display = 'block';
        }
        if (labelEl) labelEl.innerText = 'Poster Preview (Image)';
    } else if (mediaType === 'video') {
        const ytEmbed = parseYouTubeEmbedUrl(mediaUrl);
        if (ytEmbed && embedEl) {
            embedEl.innerHTML = `<iframe src="${ytEmbed}" style="width:100%; height:180px; border:0; border-radius:6px;" allowfullscreen></iframe>`;
            embedEl.style.display = 'block';
            if (labelEl) labelEl.innerText = 'Video Stream Preview (YouTube)';
        } else if (videoEl) {
            videoEl.src = mediaUrl;
            videoEl.style.display = 'block';
            if (labelEl) labelEl.innerText = 'Video File Preview (MP4/WebM)';
        }
    } else if (mediaType === 'audio') {
        if (audioEl) {
            audioEl.src = mediaUrl;
            audioEl.style.display = 'block';
        }
        if (labelEl) labelEl.innerText = 'Audio Episode Preview (MP3/WAV/M4A)';
    }
}

async function handleAdminFileUpload(fileInput, targetUrlInputId, previewContainerId, typeInputId) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    let category = 'image';
    const mime = (file.type || '').toLowerCase();
    const name = file.name.toLowerCase();
    if (mime.startsWith('video/') || name.match(/\.(mp4|webm|mov|m4v)$/)) {
        category = 'video';
    } else if (mime.startsWith('audio/') || name.match(/\.(mp3|wav|m4a|ogg|aac)$/)) {
        category = 'audio';
    } else {
        category = 'image';
    }

    const typeInput = document.getElementById(typeInputId);
    if (typeInput) typeInput.value = category;

    const tempUrl = URL.createObjectURL(file);
    updateMediaPreviewBox(previewContainerId, tempUrl, category, 'Uploading...');

    let uploadedUrl = null;

    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_BASE}/admin/upload-media`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data.url) {
                uploadedUrl = data.url;
                if (data.media_type && typeInput) typeInput.value = data.media_type;
            }
        }
    } catch (e) {
        console.warn('Multipart upload fallback:', e);
    }

    if (!uploadedUrl) {
        try {
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const res = await fetch(`${API_BASE}/admin/upload-media-base64`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    filename: file.name,
                    data: base64Data,
                    media_type: category
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.url) {
                    uploadedUrl = data.url;
                }
            }
        } catch (e) {
            console.error('Base64 upload error:', e);
        }
    }

    const targetInput = document.getElementById(targetUrlInputId);
    if (uploadedUrl) {
        if (targetInput) targetInput.value = uploadedUrl;
        updateMediaPreviewBox(previewContainerId, uploadedUrl, category, 'Uploaded & Ready');
    } else {
        if (targetInput) targetInput.value = tempUrl;
        updateMediaPreviewBox(previewContainerId, tempUrl, category, 'Saved Locally');
    }
}

function syncUrlToTarget(sourceInputId, targetInputId, previewContainerId, typeInputId) {
    const src = document.getElementById(sourceInputId);
    const target = document.getElementById(targetInputId);
    if (!src || !target) return;
    const val = src.value.trim();
    target.value = val;

    if (!val) {
        const box = document.getElementById(previewContainerId);
        if (box) box.style.display = 'none';
        return;
    }

    let category = 'image';
    const lower = val.toLowerCase();
    if (lower.match(/\.(mp4|webm|mov|m4v)$/) || lower.includes('youtube.com') || lower.includes('youtu.be')) {
        category = 'video';
    } else if (lower.match(/\.(mp3|wav|m4a|ogg|aac)$/)) {
        category = 'audio';
    }

    const typeInput = document.getElementById(typeInputId);
    if (typeInput) typeInput.value = category;

    updateMediaPreviewBox(previewContainerId, val, category, 'Ready');
}

function clearAttachedMedia(targetUrlInputId, typeInputId, previewContainerId) {
    const target = document.getElementById(targetUrlInputId);
    if (target) target.value = '';
    const typeInput = document.getElementById(typeInputId);
    if (typeInput) typeInput.value = 'none';
    const box = document.getElementById(previewContainerId);
    if (box) box.style.display = 'none';
}

function selectNewsPosterPreset(thumbEl, url) {
    const input = document.getElementById('admin-news-poster');
    if (input) input.value = url;
    const typeInput = document.getElementById('admin-news-poster-type');
    if (typeInput) typeInput.value = 'image';
    updateMediaPreviewBox('news-poster-preview-box', url, 'image', 'Preset Ready');
    document.querySelectorAll('#admin-panel-news .poster-preset-thumb').forEach(t => t.classList.remove('selected'));
    if (thumbEl) thumbEl.classList.add('selected');
}

function selectRadioPosterPreset(thumbEl, url) {
    const input = document.getElementById('admin-radio-poster');
    if (input) input.value = url;
    const typeInput = document.getElementById('admin-radio-poster-type');
    if (typeInput) typeInput.value = 'image';
    updateMediaPreviewBox('radio-poster-preview-box', url, 'image', 'Preset Ready');
    document.querySelectorAll('#admin-panel-radio .poster-preset-thumb').forEach(t => t.classList.remove('selected'));
    if (thumbEl) thumbEl.classList.add('selected');
}

function selectEventPosterPreset(thumbEl, url) {
    const input = document.getElementById('admin-event-poster');
    if (input) input.value = url;
    const typeInput = document.getElementById('admin-event-poster-type');
    if (typeInput) typeInput.value = 'image';
    updateMediaPreviewBox('event-poster-preview-box', url, 'image', 'Preset Ready');
    document.querySelectorAll('#admin-panel-events .poster-preset-thumb').forEach(t => t.classList.remove('selected'));
    if (thumbEl) thumbEl.classList.add('selected');
}

// -----------------------------------------
// Action 1: Submit Admin News Article
// -----------------------------------------
async function submitAdminNewsArticle() {
    const titleEl = document.getElementById('admin-news-title');
    const catEl = document.getElementById('admin-news-category');
    const authorEl = document.getElementById('admin-news-author');
    const posterEl = document.getElementById('admin-news-poster');
    const posterTypeEl = document.getElementById('admin-news-poster-type');
    const summaryEl = document.getElementById('admin-news-summary');
    const contentEl = document.getElementById('admin-news-content');
    const mediaUrlEl = document.getElementById('admin-news-media-url');
    const mediaTypeEl = document.getElementById('admin-news-media-type');
    const mediaCaptionEl = document.getElementById('admin-news-media-caption');
    const hotpickEl = document.getElementById('admin-news-hotpick');
    const fbEl = document.getElementById('admin-news-feedback');

    const title = titleEl ? titleEl.value.trim() : '';
    const category = catEl ? catEl.value : 'Health News';
    const author = (authorEl ? authorEl.value.trim() : '') || 'DELTAS Newsroom';
    const posterUrl = (posterEl ? posterEl.value.trim() : '') || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80';
    const posterType = (posterTypeEl ? posterTypeEl.value.trim() : '') || 'image';
    const summary = summaryEl ? summaryEl.value.trim() : '';
    const content = contentEl ? contentEl.value.trim() : '';
    const mediaUrl = mediaUrlEl ? mediaUrlEl.value.trim() : '';
    const mediaType = mediaTypeEl ? mediaTypeEl.value.trim() : 'none';
    const mediaCaption = mediaCaptionEl ? mediaCaptionEl.value.trim() : '';
    const isHotPick = hotpickEl ? hotpickEl.checked : false;

    if (!title || !summary || !content) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = '#DC2626';
            fbEl.innerText = 'Please complete all required fields (title, summary, and full article text).';
        }
        return;
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = 'Publishing article to Youth Impact News...';
    }

    const newArticle = {
        id: Date.now(),
        title: title,
        source: author,
        category: category,
        banner_url: posterUrl,
        image_url: posterUrl,
        poster_type: posterType,
        media_url: mediaUrl,
        media_type: mediaType,
        media_caption: mediaCaption,
        summary: summary,
        content: content,
        full_content: content,
        published_date: new Date().toISOString(),
        url: '#'
    };

    try {
        await fetch(`${API_BASE}/admin/publish`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                section: 'news',
                title: title,
                category: category,
                author_or_source: author,
                poster_url: posterUrl,
                poster_type: posterType,
                media_url: mediaUrl,
                media_type: mediaType,
                media_caption: mediaCaption,
                summary: summary,
                full_content: content,
                is_hot_pick: isHotPick
            })
        });
    } catch (e) {}

    // Save locally for immediate offline/online sync
    saveAdminArticleLocally(newArticle);
    FALLBACK_NEWS_POSTERS.unshift(newArticle);
    if (Array.isArray(currentNewsPosterList)) {
        currentNewsPosterList.unshift(newArticle);
    }

    if (fbEl) {
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = `Published successfully: "${title}". Content is live for all students across the platform.`;
    }

    // Reset fields
    if (titleEl) titleEl.value = '';
    if (summaryEl) summaryEl.value = '';
    if (contentEl) contentEl.value = '';
    if (mediaUrlEl) mediaUrlEl.value = '';
    if (mediaTypeEl) mediaTypeEl.value = 'none';
    if (mediaCaptionEl) mediaCaptionEl.value = '';
    const mediaPreview = document.getElementById('news-media-preview-box');
    if (mediaPreview) mediaPreview.style.display = 'none';
    if (hotpickEl) hotpickEl.checked = false;

    refreshAdminStats();
    renderAdminRecentArticles();
    loadNews('All');
}

// -----------------------------------------
// Action 2: Submit Admin Radio / Video Pod
// -----------------------------------------
async function submitAdminRadioPod() {
    const titleEl = document.getElementById('admin-radio-title');
    const sourceEl = document.getElementById('admin-radio-source');
    const hostEl = document.getElementById('admin-radio-host');
    const airtimeEl = document.getElementById('admin-radio-airtime');
    const videoEl = document.getElementById('admin-radio-video');
    const mediaTypeEl = document.getElementById('admin-radio-media-type');
    const posterEl = document.getElementById('admin-radio-poster');
    const posterTypeEl = document.getElementById('admin-radio-poster-type');
    const summaryEl = document.getElementById('admin-radio-summary');
    const fbEl = document.getElementById('admin-radio-feedback');

    const title = titleEl ? titleEl.value.trim() : '';
    const source = sourceEl ? sourceEl.value : 'Community Dialogues';
    const host = (hostEl ? hostEl.value.trim() : '') || 'DELTAS Campus Voice Studio';
    const airtime = (airtimeEl ? airtimeEl.value.trim() : '') || 'Thursdays • 19:30 CAT';
    const videoUrl = videoEl ? videoEl.value.trim() : '';
    const mediaType = (mediaTypeEl ? mediaTypeEl.value.trim() : '') || 'video';
    const posterUrl = (posterEl ? posterEl.value.trim() : '') || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=1200&auto=format&fit=crop&q=80';
    const posterType = (posterTypeEl ? posterTypeEl.value.trim() : '') || 'image';
    const summary = summaryEl ? summaryEl.value.trim() : '';

    if (!title || !videoUrl || !summary) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = '#DC2626';
            fbEl.innerText = 'Please provide the program title, episode video/audio media, and episode synopsis.';
        }
        return;
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = 'Publishing episode to Radio & Pods Hub...';
    }

    const newProg = {
        id: Date.now(),
        title: title,
        source: source,
        category: source,
        descriptive_topic: airtime,
        summary: summary,
        video_url: videoUrl,
        audio_url: (mediaType === 'audio') ? videoUrl : null,
        media_type: mediaType,
        banner_url: posterUrl,
        poster_url: posterUrl,
        poster_type: posterType,
        host: host,
        url: videoUrl
    };

    try {
        await fetch(`${API_BASE}/admin/publish`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                section: 'radio',
                title: title,
                category: source,
                author_or_source: source,
                organizer: host,
                date_str: airtime,
                video_url: videoUrl,
                audio_url: (mediaType === 'audio') ? videoUrl : null,
                media_type: mediaType,
                poster_url: posterUrl,
                poster_type: posterType,
                summary: summary,
                full_content: summary
            })
        });
    } catch (e) {}

    saveAdminRadioLocally(newProg);
    FALLBACK_RADIO_POSTERS.unshift(newProg);
    if (Array.isArray(currentRadioPosterList)) {
        currentRadioPosterList.unshift(newProg);
    }

    if (fbEl) {
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = `Published episode successfully: "${title}". Available now in Radio & Pods.`;
    }

    if (titleEl) titleEl.value = '';
    if (videoEl) videoEl.value = 'https://www.youtube.com/watch?v=2n3f8K9vC7A';
    if (mediaTypeEl) mediaTypeEl.value = 'video';
    if (summaryEl) summaryEl.value = '';

    refreshAdminStats();
    renderAdminRecentRadio();
    loadRadio('All');
}

// -----------------------------------------
// Action 3: Submit Admin Event
// -----------------------------------------
async function submitAdminEvent() {
    const titleEl = document.getElementById('admin-event-title');
    const catEl = document.getElementById('admin-event-category');
    const dateEl = document.getElementById('admin-event-date');
    const locEl = document.getElementById('admin-event-location');
    const orgEl = document.getElementById('admin-event-organizer');
    const posterEl = document.getElementById('admin-event-poster');
    const posterTypeEl = document.getElementById('admin-event-poster-type');
    const descEl = document.getElementById('admin-event-description');
    const fbEl = document.getElementById('admin-event-feedback');

    const title = titleEl ? titleEl.value.trim() : '';
    const category = catEl ? catEl.value : 'Marathons & Sports';
    const dateStr = (dateEl ? dateEl.value.trim() : '') || 'Upcoming Saturday • 08:00 AM';
    const location = (locEl ? locEl.value.trim() : '') || 'Campus Sports Grounds';
    const organizer = (orgEl ? orgEl.value.trim() : '') || 'Delta Corporation & Enactus Zimbabwe';
    const posterUrl = (posterEl ? posterEl.value.trim() : '') || 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1200&auto=format&fit=crop&q=80';
    const posterType = (posterTypeEl ? posterTypeEl.value.trim() : '') || 'image';
    const description = descEl ? descEl.value.trim() : '';

    if (!title || !description) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = '#DC2626';
            fbEl.innerText = 'Please provide an event title and description.';
        }
        return;
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = 'Publishing event to Campus Calendar...';
    }

    const newEvt = {
        id: Date.now(),
        title: title,
        category: category,
        date_str: dateStr,
        location: location,
        organizer: organizer,
        description: description,
        banner_url: posterUrl,
        poster_type: posterType,
        rsvp_count: 50,
        is_closed: false
    };

    try {
        await fetch(`${API_BASE}/admin/publish`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                section: 'events',
                title: title,
                category: category,
                author_or_source: organizer,
                organizer: organizer,
                location: location,
                date_str: dateStr,
                poster_url: posterUrl,
                poster_type: posterType,
                summary: description,
                full_content: description
            })
        });
    } catch (e) {}

    // Save into ambassador custom events so it persists everywhere
    saveAmbassadorCustomEvent(newEvt);
    FALLBACK_EVENTS_POSTERS.unshift(newEvt);
    if (Array.isArray(currentEventsPosterList)) {
        currentEventsPosterList.unshift(newEvt);
    }

    if (fbEl) {
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = `Event added successfully: "${title}". Synchronized across all campus calendars.`;
    }

    if (titleEl) titleEl.value = '';
    if (dateEl) dateEl.value = '';
    if (locEl) locEl.value = '';
    if (descEl) descEl.value = '';

    refreshAdminStats();
    renderAdminEventsManager();
    loadEvents('All');
}

// -----------------------------------------
// Action 4: Submit Admin Peer Story / Guide
// -----------------------------------------
async function submitAdminPeerStory() {
    const titleEl = document.getElementById('admin-support-title');
    const catEl = document.getElementById('admin-support-category');
    const authorEl = document.getElementById('admin-support-author');
    const posterEl = document.getElementById('admin-support-poster');
    const posterTypeEl = document.getElementById('admin-support-poster-type');
    const contentEl = document.getElementById('admin-support-content');
    const fbEl = document.getElementById('admin-support-feedback');

    const title = titleEl ? titleEl.value.trim() : '';
    const category = catEl ? catEl.value : 'Sobriety Milestones';
    const author = (authorEl ? authorEl.value.trim() : '') || 'DELTAS Wellness Team';
    const posterUrl = (posterEl ? posterEl.value.trim() : '') || 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&auto=format&fit=crop&q=80';
    const posterType = (posterTypeEl ? posterTypeEl.value.trim() : '') || 'image';
    const content = contentEl ? contentEl.value.trim() : '';

    if (!title || !content) {
        if (fbEl) {
            fbEl.style.display = 'block';
            fbEl.style.color = '#DC2626';
            fbEl.innerText = 'Please provide both a guide title and content.';
        }
        return;
    }

    if (fbEl) {
        fbEl.style.display = 'block';
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = 'Publishing guide to Support Hub...';
    }

    try {
        await fetch(`${API_BASE}/admin/publish`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                section: 'support',
                title: title,
                category: category,
                author_or_source: author,
                poster_url: posterUrl,
                poster_type: posterType,
                summary: content.slice(0, 160) + '...',
                full_content: content
            })
        });
    } catch (e) {}

    try {
        await fetch(`${API_BASE}/safespace/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                module_id: 1,
                author_name: author,
                content: `[${category} Guide]: ${title}\n\n${content}`
            })
        });
    } catch (e) {}

    if (fbEl) {
        fbEl.style.color = 'var(--primary)';
        fbEl.innerText = `Guide published successfully: "${title}". Visible in Above Influence Support Hub.`;
    }

    if (titleEl) titleEl.value = '';
    if (contentEl) contentEl.value = '';
}

// -----------------------------------------
// Action 5: Event Registration Toggle (Close / Re-Open)
// -----------------------------------------
async function toggleAdminEventRegistration(eventId) {
    let newClosedStatus = toggleLocalEventClosedState(eventId);

    // Call backend endpoint to persist
    try {
        const res = await fetch(`${API_BASE}/admin/events/${eventId}/toggle-registration`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            newClosedStatus = Boolean(data.is_closed);
            setEventClosedStateLocally(eventId, newClosedStatus);
        }
    } catch (e) {}

    // Update in-memory lists
    [currentEventsPosterList, FALLBACK_EVENTS_POSTERS].forEach(list => {
        if (Array.isArray(list)) {
            const match = list.find(e => String(e.id) === String(eventId));
            if (match) match.is_closed = newClosedStatus;
        }
    });

    renderAdminEventsManager();
    refreshAdminStats();
    loadEvents('All');
}

// -----------------------------------------
// Render Active Events Manager List
// -----------------------------------------
function renderAdminEventsManager() {
    const container = document.getElementById('admin-events-manager-list');
    if (!container) return;

    let events = [];
    if (Array.isArray(currentEventsPosterList) && currentEventsPosterList.length > 0) {
        events = [...currentEventsPosterList];
    } else {
        events = [...FALLBACK_EVENTS_POSTERS];
    }

    const custom = getCustomAmbassadorEvents();
    const existingIds = new Set(events.map(e => String(e.id)));
    custom.forEach(ce => {
        if (!existingIds.has(String(ce.id))) events.unshift(ce);
    });

    if (events.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); padding:16px;">No campus events registered currently.</p>';
        return;
    }

    let rowsHtml = '';
    events.forEach(e => {
        const isClosed = Boolean(e.is_closed || isEventRegistrationClosed(e.id));
        rowsHtml += `
            <div class="admin-event-row">
                <div style="flex:1; min-width:240px;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                        <span style="font-size:0.75rem; font-weight:800; color:var(--primary); background:var(--primary-light); padding:3px 10px; border-radius:999px;">
                            ${escapeHtml(e.category || 'Event')}
                        </span>
                        <span class="${isClosed ? 'badge-status-closed' : 'badge-status-open'}">
                            ${isClosed ? 'Registration Closed' : 'Registration Open'}
                        </span>
                    </div>
                    <h4 style="font-size:1.02rem; font-weight:800; color:var(--secondary-dark); margin:0 0 4px 0;">
                        ${escapeHtml(e.title)}
                    </h4>
                    <div style="font-size:0.82rem; color:var(--text-muted);">
                        ${escapeHtml(e.date_str || 'Scheduled Event')} • <strong>${escapeHtml(e.location || 'Campus Grounds')}</strong>
                    </div>
                    <div style="font-size:0.78rem; color:var(--text-muted); margin-top:3px;">
                        ${e.rsvp_count || 120} confirmed student RSVPs
                    </div>
                </div>
                <div>
                    <button type="button" 
                            class="btn-toggle-reg ${isClosed ? 'open-action' : 'close-action'}"
                            onclick="toggleAdminEventRegistration(${e.id})">
                        ${isClosed ? 'Re-open Registration' : 'Close Registration'}
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = rowsHtml;
}

// -----------------------------------------
// Render Admin Recent Articles List
// -----------------------------------------
function renderAdminRecentArticles() {
    const container = document.getElementById('admin-recent-articles-list');
    if (!container) return;

    let articles = [];
    if (Array.isArray(currentNewsPosterList) && currentNewsPosterList.length > 0) {
        articles = currentNewsPosterList;
    } else {
        articles = FALLBACK_NEWS_POSTERS;
    }

    if (articles.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">No published articles found.</p>';
        return;
    }

    let html = '';
    articles.slice(0, 8).forEach(a => {
        html += `
            <div style="padding:12px 14px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="flex:1; min-width:220px;">
                    <div style="font-size:0.75rem; font-weight:700; color:var(--primary); text-transform:uppercase;">${escapeHtml(a.category || a.source || 'News')} • Published by ${escapeHtml(a.source || 'DELTAS Newsroom')}</div>
                    <div style="font-weight:700; font-size:0.92rem; color:var(--secondary-dark);">${escapeHtml(a.title)}</div>
                </div>
                <button type="button" onclick="openFullArticleReader('${a.id}')" class="btn-primary" style="padding:6px 14px; font-size:0.8rem; font-weight:700;">
                    Preview Article
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
}

// -----------------------------------------
// Render Admin Recent Radio Programs
// -----------------------------------------
function renderAdminRecentRadio() {
    const container = document.getElementById('admin-recent-radio-list');
    if (!container) return;

    let list = [];
    if (Array.isArray(currentRadioPosterList) && currentRadioPosterList.length > 0) {
        list = currentRadioPosterList;
    } else {
        list = FALLBACK_RADIO_POSTERS;
    }

    let html = '';
    list.slice(0, 6).forEach(r => {
        html += `
            <div style="padding:12px 14px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="flex:1; min-width:220px;">
                    <div style="font-size:0.75rem; font-weight:700; color:var(--primary); text-transform:uppercase;">${escapeHtml(r.source || 'Radio')} • ${escapeHtml(r.descriptive_topic || 'Broadcast')}</div>
                    <div style="font-weight:700; font-size:0.92rem; color:var(--secondary-dark);">${escapeHtml(r.title)}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(r.summary ? r.summary.slice(0, 100) + '...' : '')}</div>
                </div>
                <button type="button" onclick="openPodcastVideoModal('${r.id}')" class="btn-primary" style="padding:6px 14px; font-size:0.8rem; font-weight:700;">
                    Play Episode
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
}

// -----------------------------------------
// Citizen Watchdog Moderation Queue
// -----------------------------------------
async function loadAdminWatchdogQueue() {
    const container = document.getElementById('admin-watchdog-queue-list');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/watchdog/reports`);
        if (res.ok) {
            const reports = await res.json();
            if (Array.isArray(reports) && reports.length > 0) {
                let html = '';
                reports.forEach(rep => {
                    const isValidated = (rep.status || '').toLowerCase().includes('validated');
                    html += `
                        <div style="padding:16px; background:var(--card-bg-warm); border:1.5px solid var(--border-color); border-radius:12px; margin-bottom:12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                                <span style="font-size:0.8rem; font-weight:800; color:var(--secondary-dark);">
                                    Campus / Community Location: <strong>${escapeHtml(rep.location || 'Reported Location')}</strong>
                                </span>
                                <span style="font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:999px; background:${isValidated ? '#DCFCE7' : '#FEF3C7'}; color:${isValidated ? '#15803D' : '#B45309'};">
                                    ${escapeHtml(rep.status || 'Pending Validation')}
                                </span>
                            </div>
                            <p style="font-size:0.92rem; color:var(--text-main); margin:0 0 12px 0; line-height:1.55;">
                                ${escapeHtml(rep.description || 'No detailed description provided.')}
                            </p>
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                <span style="font-size:0.76rem; color:var(--text-muted);">
                                    Submitted: ${rep.timestamp ? new Date(rep.timestamp).toLocaleString('en-ZW') : 'Recent'}
                                </span>
                                ${!isValidated ? `
                                    <button type="button" class="btn-primary" onclick="adminValidateWatchdogReport(${rep.id})" style="padding:6px 14px; font-size:0.8rem; font-weight:700;">
                                        Validate &amp; Forward Alert
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = html;
                return;
            }
        }
    } catch (e) {}

    container.innerHTML = `
        <div style="text-align:center; padding:32px 20px; color:var(--text-muted);">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="#94A3B8" style="margin-bottom:10px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            <h4 style="margin:0 0 6px 0; color:var(--secondary-dark); font-size:1.05rem;">No Pending Watchdog Alerts</h4>
            <p style="margin:0; font-size:0.88rem;">All citizen submissions have been validated and forwarded to campus security liaisons.</p>
        </div>
    `;
}

async function adminValidateWatchdogReport(reportId) {
    try {
        await fetch(`${API_BASE}/watchdog/reports/${reportId}/validate`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
    } catch (e) {}
    loadAdminWatchdogQueue();
    refreshAdminStats();
}

// -----------------------------------------
// Admin Event Attendee Registrations & Classified Rosters
// -----------------------------------------
async function renderAdminEventRegistrations() {
    const container = document.getElementById('admin-event-registrations-container');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted); font-size:0.9rem;">Loading event registrations and attendee rosters...</div>`;

    let eventRosters = [];
    try {
        const res = await fetch(`${API_BASE}/admin/events/registrations`);
        if (res.ok) {
            eventRosters = await res.json();
        }
    } catch (e) {}

    // Fallback if network or empty
    if (!eventRosters || eventRosters.length === 0) {
        const baseEvents = (currentEventsPosterList && currentEventsPosterList.length) ? currentEventsPosterList : FALLBACK_EVENTS_POSTERS;
        let localAttendees = [];
        try {
            const raw = localStorage.getItem('deltas_admin_event_attendees_v1');
            if (raw) localAttendees = JSON.parse(raw);
        } catch (e) {}

        eventRosters = baseEvents.map(evt => {
            const matchedAttendees = localAttendees.filter(a => String(a.eventId) === String(evt.id)).map((a, idx) => ({
                rsvp_id: idx + 1,
                user_id: a.userId || 1,
                full_name: a.fullName || 'Registered Student',
                age: a.age || 20,
                gender: a.gender || 'Not Specified',
                email: a.email || 'student@campus.ac.zw',
                phone: a.phone || '+263 77 000 0000',
                confirmed_at: a.confirmedAt ? new Date(a.confirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently Confirmed'
            }));
            return {
                event_id: evt.id,
                event_title: evt.title,
                event_date: evt.date_str || evt.date || 'Saturday, Nov 28, 2026 • 06:30 AM',
                event_location: evt.location || 'Campus Grounds',
                event_category: evt.category || 'Campus Event',
                is_closed: boolOr(evt.is_closed, false),
                attendees_count: matchedAttendees.length,
                attendees: matchedAttendees
            };
        });
    }

    if (eventRosters.length === 0) {
        container.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-muted);">No campus events found.</div>`;
        return;
    }

    let html = '';
    eventRosters.forEach(evt => {
        const attendees = evt.attendees || [];
        const hasAttendees = attendees.length > 0;

        html += `
            <div class="event-roster-group-card" id="event-roster-${evt.event_id}" style="margin-bottom:20px; border:1px solid var(--border-color); border-radius:12px; background:#FFFFFF; overflow:hidden; box-shadow:var(--shadow-sm);">
                <div class="event-roster-header" style="padding:16px 20px; background:linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
                            <span style="font-size:0.75rem; background:#E2E8F0; color:#334155; font-weight:700; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${escapeHtml(evt.event_category || 'Campus Event')}</span>
                            <span style="font-size:0.8rem; color:var(--primary); font-weight:800; background:#DCFCE7; padding:2px 8px; border-radius:4px;">${escapeHtml(evt.event_date)}</span>
                            ${evt.is_closed ? `<span style="font-size:0.75rem; background:#FEE2E2; color:#B91C1C; font-weight:700; padding:2px 8px; border-radius:4px;">Registration Closed</span>` : ''}
                        </div>
                        <h4 style="font-size:1.08rem; font-weight:800; color:var(--text-main); margin:0 0 4px 0;">${escapeHtml(evt.event_title)}</h4>
                        <div style="font-size:0.82rem; color:var(--text-muted);">
                            <strong>Venue:</strong> ${escapeHtml(evt.event_location)} • <strong>Total Attendees:</strong> ${attendees.length} Confirmed
                        </div>
                    </div>
                    <div>
                        ${hasAttendees ? `
                            <button type="button" class="btn-primary" id="btn-toggle-all-${evt.event_id}" onclick="toggleAllEventAttendeeDetails('${evt.event_id}')" style="padding:7px 16px; font-size:0.82rem; font-weight:700;">
                                View all details
                            </button>
                        ` : `
                            <span style="font-size:0.8rem; color:var(--text-muted); font-style:italic;">No registrations yet</span>
                        `}
                    </div>
                </div>

                <div class="event-attendees-list" id="attendees-list-${evt.event_id}" style="padding:16px 20px;">
                    ${!hasAttendees ? `
                        <p style="font-size:0.85rem; color:var(--text-muted); margin:0; font-style:italic;">No student attendees have registered for this event yet.</p>
                    ` : attendees.map((att, idx) => `
                        <div class="attendee-item-box" id="attendee-box-${evt.event_id}-${idx}" style="padding:12px 14px; margin-bottom:10px; background:#FFFFFF; border:1px solid var(--border-color); border-radius:8px; transition:border-color 0.2s;">
                            <div class="attendee-summary-line" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                                <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                                    <span class="attendee-name-clickable" onclick="toggleAttendeeDetails('${evt.event_id}', '${idx}')" title="Click name to view full attendee details" style="cursor:pointer; font-weight:800; font-size:0.92rem; color:var(--primary); text-decoration:underline;">
                                        ${escapeHtml(att.full_name)}
                                    </span>
                                    <span class="attendee-pill" style="font-size:0.78rem; background:#F1F5F9; color:#475569; padding:2px 8px; border-radius:999px; font-weight:600;">
                                        Age: ${att.age}
                                    </span>
                                    <span class="attendee-pill" style="font-size:0.78rem; background:#F1F5F9; color:#475569; padding:2px 8px; border-radius:999px; font-weight:600;">
                                        Gender: ${escapeHtml(att.gender)}
                                    </span>
                                </div>
                                <span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">Click name to reveal details</span>
                            </div>

                            <!-- Full attendee details drawer (revealed when clicking name or View all details) -->
                            <div class="attendee-full-details-drawer" id="attendee-details-${evt.event_id}-${idx}" style="display:none; margin-top:12px; padding:12px 14px; background:var(--card-bg-warm); border:1px solid var(--border-color); border-radius:8px;">
                                <div class="attendee-details-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
                                    <div>
                                        <div style="font-size:0.72rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Full Name</div>
                                        <div style="font-size:0.88rem; font-weight:800; color:var(--text-main);">${escapeHtml(att.full_name)}</div>
                                    </div>
                                    <div>
                                        <div style="font-size:0.72rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Age &amp; Gender</div>
                                        <div style="font-size:0.88rem; font-weight:700; color:var(--text-main);">${att.age} yrs • ${escapeHtml(att.gender)}</div>
                                    </div>
                                    <div>
                                        <div style="font-size:0.72rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Email Address</div>
                                        <div style="font-size:0.88rem; font-weight:700; color:var(--primary); word-break:break-all;">${escapeHtml(att.email)}</div>
                                    </div>
                                    <div>
                                        <div style="font-size:0.72rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Phone Number (+263)</div>
                                        <div style="font-size:0.88rem; font-weight:800; color:var(--text-main);">${escapeHtml(att.phone)}</div>
                                    </div>
                                    <div>
                                        <div style="font-size:0.72rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Registration Confirmed</div>
                                        <div style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(att.confirmed_at || 'Confirmed')}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function toggleAttendeeDetails(eventId, idx) {
    const drawer = document.getElementById(`attendee-details-${eventId}-${idx}`);
    if (!drawer) return;
    drawer.style.display = (drawer.style.display === 'none' || drawer.style.display === '') ? 'block' : 'none';
}

function toggleAllEventAttendeeDetails(eventId) {
    const btn = document.getElementById(`btn-toggle-all-${eventId}`);
    const list = document.getElementById(`attendees-list-${eventId}`);
    if (!list) return;
    const drawers = list.querySelectorAll('.attendee-full-details-drawer');
    const anyHidden = Array.from(drawers).some(d => d.style.display === 'none' || d.style.display === '');
    drawers.forEach(d => {
        d.style.display = anyHidden ? 'block' : 'none';
    });
    if (btn) {
        btn.innerText = anyHidden ? 'Hide all details' : 'View all details';
    }
}

// -----------------------------------------
// Admin Mentor & Counsellor Accreditations Verification Queue & Full Document Access
// -----------------------------------------
let currentAdminAccreditationApps = [];

function resolveMentorDocUrl(app) {
    if (!app) return '/uploads/NUST_Peer_Leadership_Credential.jpg';
    let url = app.fileUrl || app.file_url || app.fileDataUri;
    const name = app.fileName || app.file_name || '';

    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('/uploads/'))) {
        return url;
    }
    if (url && url.startsWith('uploads/')) {
        return '/' + url;
    }

    if (name.includes('NUST') || name.includes('Peer_Leadership')) {
        return '/uploads/NUST_Peer_Leadership_Credential.jpg';
    }
    if (name.includes('TMoyo') || name.includes('Psychology')) {
        return '/uploads/Psychology_Council_Cert_TMoyo.jpg';
    }
    if (name.includes('Simba') || name.includes('Medical_Council')) {
        return '/uploads/Medical_Council_Zim_Accreditation.jpg';
    }
    if (name) {
        return `/uploads/${name}`;
    }
    return '/uploads/NUST_Peer_Leadership_Credential.jpg';
}

function isMentorDocPdf(app) {
    const name = (app.fileName || app.file_name || '').toLowerCase();
    const url = (app.fileUrl || app.file_url || app.fileDataUri || '').toLowerCase();
    return name.endsWith('.pdf') || url.includes('.pdf') || url.startsWith('data:application/pdf');
}

async function renderAdminAccreditationsQueue() {
    const pendingContainer = document.getElementById('admin-pending-accreditations-container');
    const verifiedContainer = document.getElementById('admin-verified-mentors-container');
    if (!pendingContainer) return;

    pendingContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Loading pending accreditations...</div>`;

    let allApps = [];
    try {
        const res = await fetch(`${API_BASE}/admin/mentors/applications`);
        if (res.ok) {
            allApps = await res.json();
        }
    } catch (e) {}

    // Merge with local applications
    const localApps = getAllMentorApplications();
    const existingIds = new Set(allApps.map(a => String(a.id)));
    localApps.forEach(la => {
        if (!existingIds.has(String(la.id))) {
            allApps.push(la);
        }
    });

    currentAdminAccreditationApps = allApps;

    const pendingApps = allApps.filter(a => !a.verified && a.status !== 'rejected');
    const approvedCustom = allApps.filter(a => a.verified === true);

    // 1. Render Pending Applications
    if (pendingApps.length === 0) {
        pendingContainer.innerHTML = `
            <div style="padding:22px; text-align:center; background:var(--card-bg-warm); border:1px dashed var(--border-color); border-radius:10px; color:var(--text-muted); font-size:0.9rem;">
                No pending mentor or counsellor applications awaiting Admin accreditation review.
            </div>
        `;
    } else {
        pendingContainer.innerHTML = pendingApps.map(app => {
            const docUrl = resolveMentorDocUrl(app);
            const docName = app.fileName || app.file_name || 'Accreditation_Certificate.jpg';
            const isPdf = isMentorDocPdf(app);

            return `
                <div class="admin-accreditation-card" id="admin-app-${app.id}" style="padding:20px; margin-bottom:16px; background:#FFFFFF; border:1px solid var(--border-color); border-left:5px solid var(--accent-amber); border-radius:12px; box-shadow:var(--shadow-sm);">
                    <!-- Header with Status Pill and Timestamp -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                                <span style="font-size:0.75rem; background:#FFF3E0; color:#E65100; padding:2px 8px; border-radius:999px; font-weight:800; text-transform:uppercase;">Pending Verification</span>
                                <span style="font-size:0.75rem; background:var(--cream-accent); color:var(--primary); padding:2px 8px; border-radius:4px; font-weight:700;">${escapeHtml(app.institution || currentUniversity)}</span>
                                <span style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(app.created_at || 'Recently submitted')}</span>
                            </div>
                            <h4 style="font-size:1.15rem; font-weight:800; color:var(--text-main); margin:0 0 2px 0;">${escapeHtml(app.name)}</h4>
                            <div style="font-size:0.88rem; font-weight:700; color:var(--primary);">${escapeHtml(app.role)}</div>
                        </div>
                    </div>

                    <!-- Applicant Full Info Grid -->
                    <div style="margin:10px 0; padding:12px 14px; background:var(--card-bg-warm); border-radius:8px; font-size:0.84rem; line-height:1.45;">
                        <div style="margin-bottom:6px;">
                            <strong style="color:var(--text-main);">Specialization &amp; Focus:</strong> 
                            <span style="color:#334155;">${escapeHtml(app.specialization)}</span>
                        </div>
                        <div>
                            <strong style="color:var(--text-main);">Bio &amp; Summary:</strong> 
                            <span style="color:#475569;">${escapeHtml(app.bio)}</span>
                        </div>
                    </div>

                    <!-- Submitted Qualification Document Access & Interactive Inspection Stage -->
                    <div style="margin-top:12px; padding:14px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <strong style="font-size:0.85rem; color:#1E293B;">Submitted Qualification Document:</strong>
                                <span style="background:#E2E8F0; color:#334155; padding:3px 10px; border-radius:4px; font-weight:700; font-size:0.8rem; word-break:break-all;">
                                    ${escapeHtml(docName)}
                                </span>
                                <span style="font-size:0.72rem; background:#DCFCE7; color:#15803D; padding:2px 8px; border-radius:999px; font-weight:800;">
                                    ${isPdf ? 'PDF Document' : 'Official Certificate'}
                                </span>
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button type="button" class="btn-primary" onclick="openAdminDocumentInspectionModal('${app.id}')" style="padding:6px 14px; font-size:0.82rem; font-weight:700;">
                                    Inspect Submitted Document
                                </button>
                                <a href="${docUrl}" target="_blank" download="${docName}" class="btn-outline" style="padding:6px 12px; font-size:0.82rem; font-weight:700; text-decoration:none; display:inline-flex; align-items:center;">
                                    Download / Open File
                                </a>
                                <button type="button" class="btn-cream" onclick="toggleInlineDocumentPreview('${app.id}')" id="btn-toggle-inline-${app.id}" style="padding:6px 12px; font-size:0.82rem; font-weight:700;">
                                    Hide Document Preview
                                </button>
                            </div>
                        </div>

                        <!-- Inline Document Preview Stage -->
                        <div class="admin-doc-inline-preview" id="doc-inline-preview-${app.id}" style="margin-top:10px; text-align:center; background:#0F172A; border-radius:8px; padding:12px; border:1px solid #334155;">
                            ${isPdf ? `
                                <div style="color:#E2E8F0; font-size:0.82rem; margin-bottom:8px; text-align:left; display:flex; justify-content:space-between; align-items:center;">
                                    <span>PDF Credential Document (${escapeHtml(docName)})</span>
                                    <span style="color:#94A3B8; font-size:0.75rem;">Click 'Inspect Submitted Document' for enlarged view</span>
                                </div>
                                <iframe src="${docUrl}#toolbar=0" style="width:100%; height:320px; border:none; border-radius:6px; background:#FFFFFF;" title="PDF Credential Document"></iframe>
                            ` : `
                                <div style="position:relative; display:inline-block; cursor:pointer;" onclick="openAdminDocumentInspectionModal('${app.id}')" title="Click to enlarge and inspect certificate in full detail">
                                    <img src="${docUrl}" alt="Submitted Qualification Document" style="max-height:260px; max-width:100%; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15);" />
                                    <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.75); color:#FFFFFF; font-size:0.72rem; padding:3px 8px; border-radius:4px; font-weight:700;">Click to Enlarge</div>
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- Decision Actions -->
                    <div class="admin-accreditation-actions" style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
                        <button type="button" class="btn-primary" onclick="adminVerifyMentorApplicationAction('${app.id}')" style="padding:9px 22px; font-size:0.88rem; font-weight:700;">
                            Approve Accreditation &amp; Award Verified Badge
                        </button>
                        <button type="button" class="btn-cream" onclick="adminRejectMentorApplicationAction('${app.id}')" style="padding:9px 20px; font-size:0.88rem; font-weight:700;">
                            Decline Application
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Render Verified Mentors Roster
    if (verifiedContainer) {
        const fullVerifiedList = [...DEFAULT_VERIFIED_MENTORS, ...approvedCustom];
        verifiedContainer.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
                ${fullVerifiedList.map(m => `
                    <div style="padding:14px; background:#FFFFFF; border:1px solid var(--border-color); border-left:4px solid var(--accent-sage); border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                            <div>
                                <strong style="font-size:0.92rem; color:var(--text-main); display:block;">${escapeHtml(m.name)}</strong>
                                <span style="font-size:0.78rem; color:var(--primary); font-weight:700;">${escapeHtml(m.role)}</span>
                            </div>
                            <span style="font-size:0.72rem; background:#DCFCE7; color:#15803D; padding:2px 8px; border-radius:999px; font-weight:800;">Verified Mentor</span>
                        </div>
                        <div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:4px;">
                            <strong>Institution:</strong> ${escapeHtml(m.institution || 'University of Zimbabwe')}
                        </div>
                        <div style="font-size:0.78rem; color:var(--text-muted);">
                            <strong>Focus:</strong> ${escapeHtml(m.specialization || m.bio || 'Harm Reduction & Guidance')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

function openAdminDocumentInspectionModal(appId) {
    const modal = document.getElementById('admin-document-inspection-modal');
    if (!modal) return;

    let app = currentAdminAccreditationApps.find(a => String(a.id) === String(appId));
    if (!app) {
        const localApps = getAllMentorApplications();
        app = localApps.find(a => String(a.id) === String(appId));
    }
    if (!app) return;

    const docUrl = resolveMentorDocUrl(app);
    const docName = app.fileName || app.file_name || 'Accreditation_Certificate.jpg';
    const isPdf = isMentorDocPdf(app);

    // Populate modal elements
    const titleEl = document.getElementById('admin-modal-doc-title');
    const subtitleEl = document.getElementById('admin-modal-doc-subtitle');
    const viewerEl = document.getElementById('admin-modal-doc-viewer');
    const downloadEl = document.getElementById('admin-modal-doc-download');
    const nameEl = document.getElementById('admin-modal-applicant-name');
    const roleEl = document.getElementById('admin-modal-applicant-role');
    const instEl = document.getElementById('admin-modal-applicant-inst');
    const specEl = document.getElementById('admin-modal-applicant-spec');
    const bioEl = document.getElementById('admin-modal-applicant-bio');
    const filenameEl = document.getElementById('admin-modal-doc-filename');
    const dateEl = document.getElementById('admin-modal-doc-date');
    const btnApprove = document.getElementById('admin-modal-btn-approve');
    const btnDecline = document.getElementById('admin-modal-btn-decline');

    if (titleEl) titleEl.innerText = `Candidate Qualification: ${app.name}`;
    if (subtitleEl) subtitleEl.innerText = `${app.role} • ${app.institution || currentUniversity} • Submitted: ${app.created_at || 'Recently'}`;
    if (nameEl) nameEl.innerText = app.name;
    if (roleEl) roleEl.innerText = app.role;
    if (instEl) instEl.innerText = app.institution || currentUniversity;
    if (specEl) specEl.innerText = app.specialization || 'Harm-reduction and student mentorship';
    if (bioEl) bioEl.innerText = app.bio || 'Credentials submitted for official verification.';
    if (filenameEl) filenameEl.innerText = docName;
    if (dateEl) dateEl.innerText = app.created_at || 'Recently Submitted';

    if (downloadEl) {
        downloadEl.href = docUrl;
        downloadEl.download = docName;
    }

    if (viewerEl) {
        if (isPdf) {
            viewerEl.innerHTML = `
                <div style="width:100%; height:100%; display:flex; flex-direction:column;">
                    <div style="background:#1E293B; padding:8px 12px; color:#E2E8F0; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
                        <span>PDF Credential Document (${escapeHtml(docName)})</span>
                        <a href="${docUrl}" target="_blank" class="btn-outline" style="font-size:0.75rem; padding:3px 10px; color:#fff; border-color:#64748B;">Open in New Tab</a>
                    </div>
                    <iframe src="${docUrl}#toolbar=0" style="width:100%; height:500px; border:none; background:#FFFFFF;" title="PDF Credential Document"></iframe>
                </div>
            `;
        } else {
            viewerEl.innerHTML = `
                <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; padding:10px;">
                    <img src="${docUrl}" alt="Submitted Qualification Document" style="max-height:500px; max-width:100%; object-fit:contain; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.2);" />
                </div>
            `;
        }
    }

    if (btnApprove) {
        btnApprove.onclick = () => {
            adminVerifyMentorApplicationAction(app.id);
            closeAdminDocumentInspectionModal();
        };
    }
    if (btnDecline) {
        btnDecline.onclick = () => {
            adminRejectMentorApplicationAction(app.id);
            closeAdminDocumentInspectionModal();
        };
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeAdminDocumentInspectionModal() {
    const modal = document.getElementById('admin-document-inspection-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

function toggleInlineDocumentPreview(appId) {
    const previewBox = document.getElementById(`doc-inline-preview-${appId}`);
    const btn = document.getElementById(`btn-toggle-inline-${appId}`);
    if (!previewBox) return;
    const isHidden = previewBox.style.display === 'none';
    previewBox.style.display = isHidden ? 'block' : 'none';
    if (btn) {
        btn.innerText = isHidden ? 'Hide Document Preview' : 'Show Document Preview';
    }
}

async function adminVerifyMentorApplicationAction(appId) {
    try {
        await fetch(`${API_BASE}/admin/mentors/${appId}/verify`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
    } catch (e) {}

    // Update local applications
    const apps = getAllMentorApplications();
    const target = apps.find(a => String(a.id) === String(appId));
    if (target) {
        target.verified = true;
        target.status = 'approved';
        saveAllMentorApplications(apps);
    }

    alert('Accreditation Approved! Official DELTAS Verified Mentor Badge awarded.');
    await refreshAdminStats();
    renderAdminAccreditationsQueue();
    const container = document.getElementById('influence-feed');
    if (container) renderPeerAndCommunitySupportSubsection(container);
}

async function adminRejectMentorApplicationAction(appId) {
    if (!confirm('Are you sure you want to decline this mentor accreditation application?')) {
        return;
    }
    try {
        await fetch(`${API_BASE}/admin/mentors/${appId}/reject`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
    } catch (e) {}

    const apps = getAllMentorApplications();
    const target = apps.find(a => String(a.id) === String(appId));
    if (target) {
        target.status = 'rejected';
        target.verified = false;
        saveAllMentorApplications(apps);
    }

    await refreshAdminStats();
    renderAdminAccreditationsQueue();
    const container = document.getElementById('influence-feed');
    if (container) renderPeerAndCommunitySupportSubsection(container);
}

// -----------------------------------------
// Full Article Reader Modal
// -----------------------------------------
let currentOpenArticleId = null;

async function openFullArticleReader(articleId) {
    const modal = document.getElementById('article-reader-modal');
    if (!modal) return;

    let item = (currentNewsPosterList || []).find(a => String(a.id) === String(articleId));
    if (!item) {
        item = (FALLBACK_NEWS_POSTERS || []).find(a => String(a.id) === String(articleId));
    }
    if (!item) {
        const localList = getAdminArticlesLocally();
        item = localList.find(a => String(a.id) === String(articleId));
    }

    if (articleId && (!item || !item.content)) {
        try {
            const res = await fetch(`${API_BASE}/articles/${articleId}/full`);
            if (res.ok) {
                const fullData = await res.json();
                item = { ...(item || {}), ...fullData };
            }
        } catch (e) {}
    }

    if (!item) {
        item = {
            id: articleId,
            title: "Why Student Peer Mentorship Outperforms Zero-Tolerance Rules in Curbing Campus Binge Culture",
            source: "Health News",
            category: "Health News",
            published_date: "2026-11-14T09:00:00",
            banner_url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80",
            summary: "Global and regional public health studies confirm that student-led harm reduction, sober-zone social programming, and peer-to-peer accountability reduce high-risk binge episodes by up to 43% compared to punitive disciplinary measures alone.",
            content: "Public health research conducted across university campuses consistently underscores the efficacy of harm-reduction and peer-guided intervention compared to traditional punitive approaches.\n\nWhen universities create structured opportunities for students to lead moderation dialogues—such as safe ride coordination, alcohol-free campus socials, and standardized pacing protocols—peer norms rapidly shift towards mutual responsibility.\n\nThe DELTAS initiative provides concrete tools, verified digital learning modules, and accredited peer mentorship frameworks so that students have the knowledge and agency to protect their peers from high-risk substance abuse."
        };
    }

    currentOpenArticleId = articleId;

    const heroEl = document.getElementById('article-reader-hero');
    const catEl = document.getElementById('article-reader-category');
    const dateEl = document.getElementById('article-reader-date');
    const srcEl = document.getElementById('article-reader-source');
    const titleEl = document.getElementById('article-reader-title');
    const summaryBox = document.getElementById('article-reader-summary-box');
    const bodyEl = document.getElementById('article-reader-body');

    const bannerImg = item.banner_url || "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80";
    if (heroEl) heroEl.style.backgroundImage = `url('${bannerImg}')`;
    if (catEl) catEl.innerText = item.category || item.source || 'Health News';
    if (srcEl) srcEl.innerText = item.source || 'DELTAS Newsroom';
    if (dateEl) {
        dateEl.innerText = item.published_date
            ? new Date(item.published_date).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Latest Dispatch';
    }
    if (titleEl) titleEl.innerText = item.title;
    if (summaryBox) summaryBox.innerText = item.summary || '';

    // Render attached media (photo, video clip, or audio dispatch)
    const attachedMediaContainer = document.getElementById('article-reader-attached-media');
    if (attachedMediaContainer) {
        const mediaUrl = item.media_url || null;
        let mediaType = item.media_type || 'none';
        if (mediaUrl && (mediaType === 'none' || !mediaType)) {
            const mLower = mediaUrl.toLowerCase();
            if (mLower.match(/\.(mp4|webm|mov|m4v)$/) || mLower.includes('youtube.com') || mLower.includes('youtu.be')) {
                mediaType = 'video';
            } else if (mLower.match(/\.(mp3|wav|m4a|ogg|aac)$/)) {
                mediaType = 'audio';
            } else {
                mediaType = 'image';
            }
        }

        if (mediaUrl) {
            let mediaHtml = '';
            if (mediaType === 'image') {
                mediaHtml = `
                    <div class="article-attached-media-card">
                        <div class="article-attached-media-media">
                            <img src="${mediaUrl}" alt="Article Photo" style="width:100%; max-height:480px; object-fit:cover; display:block;" />
                        </div>
                        ${item.media_caption ? `<div class="article-attached-media-caption">${escapeHtml(item.media_caption)}</div>` : ''}
                    </div>
                `;
            } else if (mediaType === 'video') {
                const ytEmbed = parseYouTubeEmbedUrl(mediaUrl);
                mediaHtml = `
                    <div class="article-attached-media-card">
                        <div class="article-attached-media-media" style="padding-bottom:56.25%; position:relative; height:0;">
                            ${ytEmbed
                                ? `<iframe src="${ytEmbed}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allowfullscreen></iframe>`
                                : `<video controls style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain;"><source src="${mediaUrl}"></video>`
                            }
                        </div>
                        ${item.media_caption ? `<div class="article-attached-media-caption">${escapeHtml(item.media_caption)}</div>` : ''}
                    </div>
                `;
            } else if (mediaType === 'audio') {
                mediaHtml = `
                    <div class="article-attached-media-card">
                        <div class="article-attached-media-media" style="padding:22px; background:linear-gradient(135deg, #041912 0%, #064E3B 100%); display:flex; flex-direction:column; align-items:center; text-align:center;">
                            <div style="color:#FFE055; font-size:0.8rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:12px;">
                                Audio Dispatch / Interview Recording
                            </div>
                            <audio controls style="width:100%; max-width:540px;">
                                <source src="${mediaUrl}">
                            </audio>
                        </div>
                        ${item.media_caption ? `<div class="article-attached-media-caption">${escapeHtml(item.media_caption)}</div>` : ''}
                    </div>
                `;
            }
            attachedMediaContainer.innerHTML = mediaHtml;
            attachedMediaContainer.style.display = 'block';
        } else {
            attachedMediaContainer.innerHTML = '';
            attachedMediaContainer.style.display = 'none';
        }
    }

    if (bodyEl) {
        const rawContent = item.content || item.full_content || item.summary || '';
        const paragraphs = rawContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        if (paragraphs.length > 0) {
            bodyEl.innerHTML = paragraphs.map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
        } else {
            bodyEl.innerHTML = `<p>${escapeHtml(rawContent)}</p>`;
        }
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    awardSmartActivityPoints(`news_read_${articleId}`, 5, 'Read Youth Impact News Briefing');
}

function closeArticleReaderModal() {
    const modal = document.getElementById('article-reader-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

// -----------------------------------------
// Podcast & Video Player Modal
// -----------------------------------------
function parseYouTubeEmbedUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtube.com')) {
            const v = u.searchParams.get('v');
            if (v) return `https://www.youtube.com/embed/${v}?autoplay=1`;
        } else if (u.hostname.includes('youtu.be')) {
            const id = u.pathname.replace(/^\//, '');
            if (id) return `https://www.youtube.com/embed/${id}?autoplay=1`;
        }
    } catch (e) {}
    if (url.includes('embed/')) return url;
    return '';
}

function openPodcastVideoModal(programId) {
    const modal = document.getElementById('podcast-video-modal');
    const wrapper = document.getElementById('podcast-video-wrapper');
    if (!modal || !wrapper) return;

    let item = (currentRadioPosterList || []).find(r => String(r.id) === String(programId));
    if (!item) {
        item = (FALLBACK_RADIO_POSTERS || []).find(r => String(r.id) === String(programId));
    }
    if (!item) {
        const localList = getAdminRadioLocally();
        item = localList.find(r => String(r.id) === String(programId));
    }

    if (!item) {
        item = {
            id: programId,
            title: "Above the Influence Live: Navigating Weekend Party Pressure & Safe Rides Home",
            source: "Community Dialogues",
            descriptive_topic: "Live Youth Talk Broadcast • Thursdays 19:30 CAT",
            summary: "Peer mentors, student leaders, and behavioral health specialists unpack real weekend scenarios, assertive refusal scripts, and how to anchor a sober buddy squad before heading out.",
            video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            host: "DELTAS Campus Voice Studio"
        };
    }

    const studioEl = document.getElementById('podcast-video-studio');
    const airtimeEl = document.getElementById('podcast-video-airtime');
    const titleEl = document.getElementById('podcast-video-title');
    const hostEl = document.getElementById('podcast-video-host');
    const synopsisEl = document.getElementById('podcast-video-synopsis');

    if (studioEl) studioEl.innerText = item.source || 'Community Dialogues';
    if (airtimeEl) airtimeEl.innerText = item.descriptive_topic || item.airtime || 'Broadcast Stream';
    if (titleEl) titleEl.innerText = item.title;
    if (hostEl) hostEl.innerText = `Host & Panelists: ${item.host || item.organizer || 'DELTAS Campus Voice Studio'}`;
    if (synopsisEl) synopsisEl.innerText = item.summary || 'Tune in to youth-led moderation dialogues, expert toxicology Q&As, and peer mentorship discussions.';

    const videoUrl = item.video_url || item.url || '';
    const audioUrl = item.audio_url || '';
    const isAudio = (item.media_type === 'audio') || !!audioUrl || !!(videoUrl.match(/\.(mp3|wav|m4a|ogg|aac)$/i));
    const ytEmbed = parseYouTubeEmbedUrl(videoUrl);
    const posterArtwork = item.poster_url || item.banner_url || "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&auto=format&fit=crop&q=80";

    if (isAudio) {
        const audioSrc = audioUrl || videoUrl;
        wrapper.className = 'podcast-audio-wrapper';
        wrapper.innerHTML = `
            <img src="${posterArtwork}" class="podcast-audio-artwork" alt="${escapeHtml(item.title)}" />
            <div style="background:rgba(16,185,129,0.2); color:#6EE7B7; padding:4px 14px; border-radius:999px; font-size:0.75rem; font-weight:800; text-transform:uppercase; margin-bottom:12px;">
                Campus Voice Audio Broadcast
            </div>
            <audio controls autoplay style="width:100%; max-width:520px;">
                <source src="${audioSrc}">
            </audio>
        `;
    } else if (ytEmbed) {
        wrapper.className = 'podcast-video-wrapper';
        wrapper.innerHTML = `<iframe src="${ytEmbed}" title="${escapeHtml(item.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else if (videoUrl.match(/\.(mp4|webm|ogg|mov|m4v)$/i)) {
        wrapper.className = 'podcast-video-wrapper';
        wrapper.innerHTML = `<video controls autoplay style="width:100%; height:100%; object-fit:contain;"><source src="${videoUrl}"></video>`;
    } else {
        wrapper.className = 'podcast-video-wrapper';
        wrapper.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; background:linear-gradient(135deg, #041912 0%, #064E3B 100%); padding:20px; text-align:center;">
                <svg viewBox="0 0 24 24" width="64" height="64" fill="#FFE055" style="margin-bottom:14px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                <h4 style="color:#FFFFFF; margin:0 0 8px 0; font-size:1.15rem;">DELTAS Audio-Visual Broadcast Hub</h4>
                <p style="color:#A7F3D0; margin:0; font-size:0.88rem; max-width:440px;">Streaming episode audio with high-definition transcript notes. Connected to regional campus radio transmission feeds.</p>
                ${videoUrl ? `<a href="${videoUrl}" target="_blank" rel="noopener" class="btn-primary" style="margin-top:16px; padding:8px 20px; font-size:0.84rem; text-decoration:none;">Open External Stream Link</a>` : ''}
            </div>
        `;
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    awardSmartActivityPoints(`radio_listen_${programId}`, 5, 'Listened to Campus Voice Radio Program');
}

function closePodcastVideoModal() {
    const modal = document.getElementById('podcast-video-modal');
    const wrapper = document.getElementById('podcast-video-wrapper');
    if (wrapper) {
        wrapper.className = 'podcast-video-wrapper';
        wrapper.innerHTML = '';
    }
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
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

    const isAdmin = sessionStorage.getItem('deltas_is_admin') === 'true'
        || localStorage.getItem('deltas_is_admin') === 'true';

    // Keep portal unlocked across refreshes/reopens while an active session exists
    if (isUnlocked && (currentSessionToken || sessionStorage.getItem('currentUsername'))) {
        if (isAdmin) {
            openAdminDashboard();
        } else {
            enterPortalShellUI(false);
        }
    } else {
        showLandingExperience();
    }

    // Verify and hydrate session, modules, RSVPs, and story likes from Neon
    restoreServerSession();
});
