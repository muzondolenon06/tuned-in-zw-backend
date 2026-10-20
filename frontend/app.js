const API_BASE = (window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : 'http://127.0.0.1:8006';

// -----------------------------------------
// Global State
// -----------------------------------------
let currentUserId = sessionStorage.getItem('currentUserId') ? parseInt(sessionStorage.getItem('currentUserId')) : 1;
let currentUsername = sessionStorage.getItem('currentUsername') || 'YoungVanguard';
let currentSafeSpaceTopic = 'Scams';

// -----------------------------------------
// Navigation Logic
// -----------------------------------------
function switchMainView(viewId, el) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');

    document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    // Trigger loads based on view
    if (viewId === 'outreach') {
        loadOutreach('home');
    } else if (viewId === 'news') {
        loadNews('All');
    } else if (viewId === 'radio') {
        loadRadio('All');
    } else if (viewId === 'besure') {
        switchBeSureTab('verify', document.querySelector('#view-besure .out-tab'));
    }
}

function closeDetailView() {
    switchMainView('outreach', document.querySelectorAll('.nav-item')[0]);
    switchOutreachTab('home', document.querySelectorAll('.out-tab')[0]);
}

function closeSafeSpaceDetailView() {
    switchMainView('outreach', document.querySelectorAll('.nav-item')[0]);
    switchOutreachTab('safespace', document.querySelectorAll('.out-tab')[1]);
}

// -----------------------------------------
// Youth Connect+ (Outreach) Logic
// -----------------------------------------
function switchOutreachTab(tabId, el) {
    document.querySelectorAll('#view-outreach .out-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadOutreach(tabId);
}

async function loadOutreach(tabId) {
    const container = document.getElementById('outreach-feed');
    container.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading Youth Connect+ content...</p></div>';

    try {
        const res = await fetch(`${API_BASE}/modules`);
        const allModules = await res.json();
            
        if (tabId === 'home') {
            const homeTitles = ["Understanding News", "Fact Checking", "AI & Misinformation", "Social Media Literacy", "Digital Safety", "Understanding Radio & Podcasts", "Critical Thinking", "Spotting Scams", "Freedom of Expression & Responsible Sharing"];
            const modules = allModules.filter(m => homeTitles.includes(m.title));
            
            let html = '<div class="outreach-header"><h2 style="font-size:1.8rem; margin-bottom:10px;">Youth Connect+ MIL Academy – Modules</h2><p style="color:#aaa;">Study official academy guides and earn verified media literacy badges.</p></div>';
            html += '<div class="grid-layout">';
            
            if (modules.length === 0) {
                html += '<p style="text-align:center; padding:20px; width:100%;">No modules available.</p>';
            } else {
                modules.forEach(mod => {
                    html += `
                        <div class="outreach-card" style="position:relative; display:flex; flex-direction:column; justify-content:space-between; height: 100%; padding-bottom: 20px;">
                            <div>
                                <div style="position:absolute; top:-10px; right:15px; background:#3498db; color:#fff; font-size:12px; font-weight:bold; padding:4px 10px; border-radius:15px;">Academy Verified</div>
                                <h3 class="card-title" style="margin-top:10px;">${mod.title}</h3>
                                <p class="card-desc" style="color:#aaa; font-size:14px; margin-bottom:20px;">${mod.description}</p>
                            </div>
                            <button onclick="openModuleDetail(${mod.id}, '${mod.title.replace(/'/g, "\\'")}', true)" style="width:100%; background:#3498db; border:none; color:#fff; padding:12px; border-radius:5px; font-weight:bold; cursor:pointer; transition: 0.2s;">Open Module & Guide →</button>
                        </div>
                    `;
                });
            }
            html += '</div>';
            container.innerHTML = html;
            
        } else if (tabId === 'safespace') {
            const safeSpaceTitles = ["Cyberbullying", "Online harassment", "Scams", "Privacy", "Password security", "Phishing", "Doxxing", "Online exploitation", "Reporting harmful content", "Protecting personal information"];
            const modules = allModules.filter(m => safeSpaceTitles.includes(m.title));
            
            let html = '<div class="outreach-header"><h2 style="font-size:1.8rem; margin-bottom:10px;">Monsters of the Internet: What should I do if this happens to me?</h2><p style="color:#aaa;">Practical survival playbooks and community support against digital threats.</p></div>';
            
            html += '<div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start;">';
            
            // Left Column (Threat Playbooks)
            html += '<div style="flex: 1 1 65%; min-width:300px;"><div class="grid-layout" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">';
            if (modules.length === 0) {
                html += '<p style="text-align:center; padding:20px; width:100%;">No topics available.</p>';
            } else {
                modules.forEach(mod => {
                    html += `
                        <div class="outreach-card" style="display:flex; flex-direction:column; justify-content:space-between; height: 100%;">
                            <div>
                                <h3 class="card-title">🛡️ ${mod.title}</h3>
                                <p class="card-desc" style="color:#aaa; font-size:14px; margin-bottom:15px;">${mod.description}</p>
                            </div>
                            <button onclick="openModuleDetail(${mod.id}, '${mod.title.replace(/'/g, "\\'")}', false)" style="width:100%; background:#2ecc71; color:#fff; border:none; padding:10px; border-radius:5px; font-weight:bold; cursor:pointer;">View Playbook & Peer Stories →</button>
                        </div>
                    `;
                });
            }
            html += '</div></div>';
            
            // Right Column (Peer Experiences)
            html += `
                <div style="flex: 1 1 30%; min-width:280px;" class="outreach-card">
                    <h3 class="card-title" style="margin-bottom:10px;">📢 Your Peer's Experiences</h3>
                    <p style="font-size:0.85rem; color:#aaa; margin-bottom:15px;">Read real incidents shared by Zimbabwean youth or report what happened to you.</p>
                    <button onclick="document.getElementById('global-share-form').style.display='block'; this.style.display='none';" id="global-share-btn" style="width:100%; background:#3498db; color:#fff; border:none; padding:10px; border-radius:5px; font-weight:bold; cursor:pointer; margin-bottom:15px;">+ Share Your Experience</button>
                    
                    <div id="global-share-form" style="display:none; margin-bottom:20px; background:rgba(0,0,0,0.25); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);">
                        <label style="font-size:0.8rem; color:#aaa;">Threat Category:</label>
                        <select id="global-share-topic" style="width:100%; margin-bottom:10px; padding:8px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid #555; border-radius:5px;">
                            ${safeSpaceTitles.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                        <textarea id="global-share-text" placeholder="Explain what happened or advice for peers..." style="width:100%; height:80px; margin-bottom:10px; padding:10px; border-radius:5px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white; box-sizing:border-box;"></textarea>
                        <input type="file" id="global-share-image" accept="image/*" style="margin-bottom:10px; width:100%; color:#aaa; font-size:0.8rem;" />
                        <button onclick="submitGlobalExperience()" id="global-submit-btn" style="background:#2ecc71; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer; font-weight:bold; width:100%;">Post to Safe Space</button>
                    </div>
                    
                    <div id="global-peer-feed" style="max-height: 550px; overflow-y: auto; padding-right:5px;">
                        <p style="text-align:center;">Loading experiences...</p>
                    </div>
                </div>
            `;
            html += '</div>';
            container.innerHTML = html;
            
            fetchGlobalPeerFeed();

        } else if (tabId === 'opportunities') {
            loadOpportunitiesIntoContainer(container);

        } else if (tabId === 'contact') {
            container.innerHTML = `
                <div class="outreach-card" style="text-align:center; max-width:600px; margin:0 auto; padding:30px;">
                    <h2 class="card-title" style="font-size:1.8rem; margin-bottom:15px;">📞 Digital Support & Hotlines</h2>
                    <p class="card-desc" style="font-size:1rem; margin-bottom:25px; line-height:1.7;">
                        If you are facing severe cyber extortion, child exploitation, harassment, or banking fraud, contact these official helplines immediately:
                    </p>
                    <div style="text-align:left; background:rgba(255,255,255,0.05); padding:20px; border-radius:10px; line-height:2;">
                        <p><strong>🚨 Toll-Free Child & Youth Helpline:</strong> <span style="color:#2ecc71;">0800 4321 / 116</span></p>
                        <p><strong>💬 WhatsApp Youth Defense Chat:</strong> <span style="color:#3498db;">+263 77 123 4567</span></p>
                        <p><strong>✉️ Direct Support Email:</strong> <span style="color:#3498db;">help@tunedin.zw</span></p>
                        <p><strong>⚖️ Cyber Crime Division:</strong> Contact nearest ZRP Station or POTRAZ Consumer Affairs.</p>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red;">Failed to load data. Ensure backend is running.</p>';
    }
}

// -----------------------------------------
// Module Detail Logic
// -----------------------------------------
async function openModuleDetail(moduleId, title, isHomeMode) {
    document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));

    if (isHomeMode) {
        const view = document.getElementById('view-module-detail');
        view.classList.add('active');
        document.getElementById('module-detail-title').textContent = title;
        const list = document.getElementById('module-content-list');
        list.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading module content...</p></div>';

        try {
            const res = await fetch(`${API_BASE}/modules/${moduleId}/content`);
            const contents = await res.json();
            if (contents && contents.length > 0) {
                let html = '';
                contents.forEach(c => {
                    html += `
                        <div class="outreach-card" style="padding:25px; margin-bottom:20px; border-left:4px solid #3498db;">
                            <h3 style="color:#3498db; margin-bottom:15px; font-size:1.4rem;">📘 ${c.title}</h3>
                            <p style="font-size:1.05rem; line-height:1.8; color:#eee; white-space:pre-line;">${c.content_text || 'Reading material pending.'}</p>
                            ${c.content_url ? `<a href="${c.content_url}" target="_blank" style="display:inline-block; margin-top:15px; color:#2ecc71; font-weight:bold;">External Resource / Video →</a>` : ''}
                        </div>
                    `;
                });
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
                    <div class="outreach-card" style="border-left:4px solid #2ecc71; padding:20px;">
                        <h3 style="color:#2ecc71; margin-bottom:10px;">🛡️ Safe Space Playbook: ${title}</h3>
                        <p style="font-size:1rem; line-height:1.7; color:#eee;">${article.content_text}</p>
                    </div>
                `;
            } else {
                articleContainer.innerHTML = '<p style="color:#aaa;">Playbook instructions being prepared.</p>';
            }
        } catch(e) {
            articleContainer.innerHTML = '<p style="color:red;">Error loading playbook.</p>';
        }

        fetchPeerPosts();
    }
}

// -----------------------------------------
// Peer Posts Logic (Safe Space Specific)
// -----------------------------------------
function fetchPeerPosts() {
    const list = document.getElementById('safespace-comments-list');
    list.innerHTML = '<p style="text-align:center; color:#aaa;">Loading peer posts...</p>';

    fetch(`${API_BASE}/safespace/experiences?topic=${encodeURIComponent(currentSafeSpaceTopic)}`)
        .then(res => res.json())
        .then(posts => {
            if (!posts || posts.length === 0) {
                list.innerHTML = '<p style="color:#aaa; text-align:center; padding:15px;">No peer experiences shared for this topic yet. Be the first to share your experience!</p>';
                return;
            }
            let html = '';
            posts.forEach(post => {
                const initial = post.author_name ? post.author_name.charAt(0).toUpperCase() : 'A';
                html += `
                    <div class="outreach-card" style="margin-bottom:12px; background:rgba(255,255,255,0.04); border-left:3px solid #3498db; padding:15px;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                            <div style="width:32px; height:32px; background:#3498db; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#fff;">${initial}</div>
                            <div>
                                <span style="font-weight:bold; font-size:0.95rem;">${post.author_name || 'Anonymous Peer'}</span>
                            </div>
                        </div>
                        <p style="font-size:0.95rem; line-height:1.6; color:#ddd;">${post.content}</p>
                        ${post.image_url ? `<img src="${post.image_url}" style="max-width:100%; border-radius:8px; margin-top:10px; max-height:250px; object-fit:cover;" />` : ''}
                    </div>
                `;
            });
            list.innerHTML = html;
        })
        .catch(err => {
            list.innerHTML = '<p style="color:red; text-align:center;">Failed to load peer experiences.</p>';
        });
}

async function submitSafeSpaceComment() {
    const text = document.getElementById('safespace-post-text').value;
    const fileInput = document.getElementById('safespace-post-image');
    const imageFile = fileInput.files[0];
    
    if (!text.trim() && !imageFile) {
        alert("Please write something or upload an image.");
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
    
    fetch(`${API_BASE}/safespace/experiences`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            topic: currentSafeSpaceTopic,
            content: text,
            image_url: image_base64,
            author_name: currentUsername || "Anonymous Peer"
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
        btn.innerText = 'Post Experience';
        btn.disabled = false;
        fetchPeerPosts();
    })
    .catch(err => {
        alert("Error posting your experience.");
        btn.innerText = 'Post Experience';
        btn.disabled = false;
    });
}

function fetchGlobalPeerFeed() {
    const feed = document.getElementById('global-peer-feed');
    if (!feed) return;
    
    fetch(`${API_BASE}/safespace/experiences`)
    .then(res => res.json())
    .then(posts => {
        if (!posts || posts.length === 0) {
            feed.innerHTML = '<p style="color:#aaa; font-size:0.9rem;">No peer experiences shared yet. Be the first!</p>';
            return;
        }
        let html = '';
        posts.forEach(post => {
            const initial = post.author_name ? post.author_name.charAt(0).toUpperCase() : 'A';
            html += `
                <div style="padding:12px; margin-bottom:12px; background:rgba(255,255,255,0.05); border-radius:8px; border-left:3px solid #3498db;">
                    <div style="font-size:0.75rem; color:#3498db; margin-bottom:4px; font-weight:bold;">Re: ${post.topic}</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <div style="width:24px; height:24px; background:#555; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; color:#fff;">${initial}</div>
                        <span style="font-size:0.85rem; font-weight:bold;">${post.author_name}</span>
                    </div>
                    <p style="font-size:0.88rem; color:#ccc; margin:0; line-height:1.5;">${post.content}</p>
                    ${post.image_url ? `<img src="${post.image_url}" style="max-width:100%; border-radius:5px; margin-top:8px; max-height:150px; object-fit:cover;" />` : ''}
                </div>
            `;
        });
        feed.innerHTML = html;
    })
    .catch(err => {
        if (feed) feed.innerHTML = '<p style="color:red; font-size:0.9rem;">Failed to load experiences.</p>';
    });
}

async function submitGlobalExperience() {
    const topic = document.getElementById('global-share-topic').value;
    const text = document.getElementById('global-share-text').value;
    const fileInput = document.getElementById('global-share-image');
    const imageFile = fileInput.files[0];
    
    if (!text.trim() && !imageFile) {
        alert("Please write something or upload an image.");
        return;
    }
    
    const btn = document.getElementById('global-submit-btn');
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
    
    fetch(`${API_BASE}/safespace/experiences`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            topic: topic,
            content: text,
            image_url: image_base64,
            author_name: currentUsername || "Anonymous Peer"
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
        btn.innerText = 'Post to Safe Space';
        btn.disabled = false;
        fetchGlobalPeerFeed();
    })
    .catch(err => {
        alert("Error posting your experience.");
        btn.innerText = 'Post to Safe Space';
        btn.disabled = false;
    });
}

// -----------------------------------------
// News Logic
// -----------------------------------------
async function filterNews(source, el) {
    document.querySelectorAll('#view-news .filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadNews(source);
}

async function loadNews(source) {
    const container = document.getElementById('news-feed');
    container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; padding: 20px;">Loading news...</p>';
    
    try {
        const url = source === 'All' ? `${API_BASE}/news/today` : `${API_BASE}/news/${encodeURIComponent(source)}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; padding:20px;">No articles found for this selection.</p>';
            return;
        }

        let html = '';
        data.forEach(item => {
            html += `
                <div class="article-card" style="display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <span class="card-tag">${item.source}</span>
                        <h3 class="card-title" style="margin-top:8px;">${item.title}</h3>
                        <p class="card-desc" style="color:#aaa; font-size:0.9rem; margin-bottom:15px;">${item.summary || 'Click below to read article...'}</p>
                    </div>
                    <div class="card-meta" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">
                        <span style="font-size:0.8rem; color:#777;">${new Date(item.published_date).toLocaleDateString()}</span>
                        <a href="${item.url}" class="card-action" target="_blank" style="color:#3498db; font-weight:bold; font-size:0.85rem; text-decoration:none;">READ SOURCE ↗</a>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red; grid-column: 1/-1;">Error loading news.</p>';
    }
}

// -----------------------------------------
// Radio Logic
// -----------------------------------------
async function filterRadio(station, el) {
    document.querySelectorAll('#view-radio .filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadRadio(station);
}

async function loadRadio(station) {
    const container = document.getElementById('radio-feed');
    container.innerHTML = '<p style="text-align:center; padding: 20px;">Loading radio programmes...</p>';
    
    try {
        const res = await fetch(`${API_BASE}/radio/${encodeURIComponent(station)}`);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center;">No broadcasts found.</p>';
            return;
        }

        let html = '';
        data.forEach(item => {
            html += `
                <div class="radio-card" style="background:var(--card-bg); padding:15px; border-radius:10px; margin-bottom:15px; border:1px solid var(--border-color);">
                    <span class="card-tag" style="background:#e67e22; color:#fff; font-size:0.75rem; padding:3px 8px; border-radius:4px; font-weight:bold;">📻 ${item.source}</span>
                    <h3 class="card-title" style="margin:10px 0 5px 0;">${item.title}</h3>
                    <p class="card-desc" style="color:#aaa; font-size:0.9rem; margin-bottom:12px;">${item.summary || 'Live Zimbabwean broadcast stream'}</p>
                    <div class="card-meta" style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.8rem; color:#777;">Broadcast Schedule</span>
                        <a href="${item.url}" class="card-action" target="_blank" style="background:#3498db; color:#fff; padding:6px 14px; border-radius:5px; font-size:0.85rem; text-decoration:none; font-weight:bold;">TUNE IN 🔊</a>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:red;">Error loading radio data.</p>';
    }
}

// -----------------------------------------
// Opportunities Logic
// -----------------------------------------
async function loadOpportunitiesIntoContainer(container) {
    container.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading youth opportunities...</p></div>';
    
    try {
        const res = await fetch(`${API_BASE}/opportunities`);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:30px;">No opportunities found.</p>';
            return;
        }
        
        let html = '<div class="outreach-header"><h2 style="font-size:1.8rem; margin-bottom:10px;">💼 Youth Opportunities & Scholarships</h2><p style="color:#aaa;">Curated funding, fellowships, and tech development challenges.</p></div>';
        html += '<div class="grid-layout">';
        data.forEach(item => {
            html += `
                <div class="outreach-card" style="display:flex; flex-direction:column; justify-content:space-between; height: 100%;">
                    <div>
                        <span class="card-tag" style="background:#9b59b6; color:#fff; font-size:0.75rem; padding:3px 8px; border-radius:4px; font-weight:bold;">${item.source}</span>
                        <h3 class="card-title" style="margin-top:10px;">${item.title}</h3>
                        <p class="card-desc" style="color:#aaa; font-size:0.9rem; margin-bottom:15px;">${item.description || item.summary || 'Click below to review eligibility criteria.'}</p>
                    </div>
                    <a href="${item.url}" class="card-action" target="_blank" style="display:block; text-align:center; background:#3498db; color:#fff; padding:10px; border-radius:5px; text-decoration:none; font-weight:bold;">APPLY / VIEW CRITERIA ↗</a>
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
// BeSure Suite Logic
// -----------------------------------------
function switchBeSureTab(tabId, el) {
    document.querySelectorAll('#view-besure .out-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');

    const container = document.getElementById('besure-feed');
    
    if (tabId === 'verify') {
        container.innerHTML = `
            <div class="outreach-card" style="margin-bottom:20px; padding:25px;">
                <h3 class="card-title" style="font-size:1.4rem; color:#3498db;">🔎 4-Question Fact-Checking Engine</h3>
                <p class="card-desc" style="margin-bottom:15px; color:#aaa;">Submit viral rumors, forwarded WhatsApp messages, or dubious links to run against our verification protocol.</p>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <input type="text" id="verify-input" placeholder="Paste claim, rumor text, or link here..." style="flex:1; min-width:250px; padding:12px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.2); color:#fff; border-radius:5px;" />
                    <button onclick="submitVerify()" style="background:#3498db; color:#fff; border:none; padding:12px 24px; border-radius:5px; font-weight:bold; cursor:pointer;">Analyze Claim</button>
                </div>
                <div id="verify-result" style="margin-top:20px; display:none; background:rgba(255,255,255,0.05); padding:20px; border-radius:8px; border-left:4px solid #2ecc71;"></div>
            </div>
            
            <div class="outreach-card" style="padding:20px;">
                <h4 class="card-title">💡 How BeSure Verification Works</h4>
                <p style="color:#aaa; font-size:0.95rem; line-height:1.7;">
                    Our engine cross-checks claims against Zimbabwe Government Gazettes, ZIMSTAT indicators, and verified Zimbabwean newsrooms answering: 
                    <strong>1) Who published it? 2) Is there an original source? 3) What do credible sources say? 4) What should you do?</strong>
                </p>
            </div>
        `;
    } else if (tabId === 'real_or_manipulated') {
        container.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading visual challenges...</p></div>';
        fetch(`${API_BASE}/besure/challenges`)
            .then(res => res.json())
            .then(data => {
                if (!data || data.length === 0) {
                    container.innerHTML = '<p style="text-align:center; padding:20px;">No challenge tests available.</p>';
                    return;
                }
                let html = '<div class="grid-layout">';
                data.forEach(test => {
                    html += `
                        <div class="outreach-card" style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:20px;">
                            <span class="card-tag" style="background:#e74c3c; color:#fff; margin-bottom:10px;">${test.category}</span>
                            ${test.image_url ? `<img src="${test.image_url}" alt="Test item" style="width:100%; max-height:220px; object-fit:cover; border-radius:8px; margin-bottom:15px;"/>` : ''}
                            <p style="font-weight:bold; margin-bottom:15px;">Is this item real or manipulated?</p>
                            
                            <div style="display:flex; gap:10px; margin-bottom:15px; width:100%; justify-content:center;">
                                <button onclick="selectBeSureAnswer(${test.id}, true)" style="flex:1; background:#2ecc71; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer; font-weight:bold;">✓ Real</button>
                                <button onclick="selectBeSureAnswer(${test.id}, false)" style="flex:1; background:#e74c3c; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer; font-weight:bold;">✗ Manipulated</button>
                            </div>
                            
                            <div id="besure-input-area-${test.id}" style="display:none; width:100%; flex-direction:column; align-items:center; margin-top:10px;">
                                <label style="font-size:0.85rem; color:#aaa; margin-bottom:5px;">How did you notice?</label>
                                <textarea id="besure-reason-${test.id}" placeholder="Explain the visual clues or reasoning..." style="width:100%; height:60px; margin-bottom:10px; padding:8px; border-radius:5px; border:1px solid #555; background:rgba(255,255,255,0.1); color:white; box-sizing:border-box;"></textarea>
                                <button onclick="submitBeSureTest(${test.id})" style="width:100%; background:#3498db; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer; font-weight:bold;">Submit Evaluation</button>
                            </div>
                            <div id="besure-feedback-${test.id}" style="margin-top:12px; font-weight:bold; font-size:0.95rem; line-height:1.6;"></div>
                        </div>
                    `;
                });
                html += '</div>';
                container.innerHTML = html;
            })
            .catch(err => {
                container.innerHTML = '<p style="text-align:center; color:red;">Failed to load challenges.</p>';
            });

    } else if (tabId === 'mil_challenge') {
        container.innerHTML = `
            <div class="outreach-card" style="margin-bottom:20px; padding:25px; text-align:center;">
                <h3 class="card-title" style="font-size:1.6rem; color:#3498db; margin-bottom:10px;">🏆 Weekly MIL Vanguard Challenge</h3>
                <p class="card-desc" style="margin-bottom:20px; color:#aaa;">Test your skills against fellow youth across Zimbabwe on spotting algorithmic bias and deceptive headlines.</p>
                <button onclick="switchMainView('outreach', document.querySelectorAll('.nav-item')[0]); setTimeout(() => openModuleDetail(1, 'Fact Checking', true), 300);" style="background:#2ecc71; color:#fff; border:none; padding:14px 28px; border-radius:5px; font-weight:bold; cursor:pointer; font-size:1rem;">Start This Week's Challenge 🚀</button>
            </div>
            
            <div class="outreach-card" style="padding:20px;">
                <h3 class="card-title" style="margin-bottom:15px;">🌟 Leaderboard Top Performers</h3>
                <div style="line-height:2.2; font-size:0.95rem;">
                    <p>🥇 <strong>Chipo M. (Bulawayo)</strong> — 96% Accuracy</p>
                    <p>🥈 <strong>Farai T. (Harare)</strong> — 94% Accuracy</p>
                    <p>🥉 <strong>Tatenda N. (Mutare)</strong> — 91% Accuracy</p>
                </div>
            </div>
        `;

    } else if (tabId === 'mil_score') {
        container.innerHTML = '<div style="text-align:center; padding:30px;"><p>Loading your MIL competency score...</p></div>';
        fetch(`${API_BASE}/mil/score/${currentUserId}`)
            .then(res => res.json())
            .then(data => {
                const avg = Math.floor((data.info_verification + data.ai_awareness + data.digital_safety + data.source_evaluation) / 4);
                let html = `
                    <div class="outreach-card" style="text-align:center; max-width:550px; margin:0 auto; padding:30px;">
                        <h2 style="font-size:1.4rem; color:#aaa; margin-bottom:5px;">YOUR MEDIA LITERACY (MIL) SCORE</h2>
                        <h1 style="font-size:56px; color:#2ecc71; margin:10px 0;">${avg}/100</h1>
                        
                        <div style="text-align:left; max-width:350px; margin:20px auto; background:rgba(255,255,255,0.03); padding:20px; border-radius:10px;">
                            <p style="margin-bottom:12px;">🟢 <strong>Information Verification:</strong> ${data.info_verification}%</p>
                            <p style="margin-bottom:12px;">🟡 <strong>AI Awareness:</strong> ${data.ai_awareness}%</p>
                            <p style="margin-bottom:12px;">🟢 <strong>Digital Safety:</strong> ${data.digital_safety}%</p>
                            <p style="margin-bottom:12px;">🟡 <strong>Source Evaluation:</strong> ${data.source_evaluation}%</p>
                        </div>
                        
                        <div style="background:rgba(52, 152, 219, 0.1); border:1px solid rgba(52, 152, 219, 0.3); padding:15px; border-radius:10px; margin-top:20px;">
                            <p style="margin-bottom:8px;">Target Area: <strong>Source Evaluation</strong></p>
                            <button onclick="switchMainView('outreach', document.querySelectorAll('.nav-item')[0]); setTimeout(() => openModuleDetail(2, 'Fact Checking', true), 300);" style="background:#3498db; color:#fff; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-weight:bold;">Start Recommended Lesson →</button>
                        </div>
                    </div>
                `;
                container.innerHTML = html;
            })
            .catch(err => {
                container.innerHTML = '<p style="text-align:center; color:red;">Failed to load MIL Score.</p>';
            });
    }
}

async function submitVerify() {
    const text = document.getElementById('verify-input').value;
    const resDiv = document.getElementById('verify-result');
    if (!text.trim()) return;
    
    resDiv.style.display = 'block';
    resDiv.innerHTML = '<p style="color:#aaa;">Running automated journalistic verification...</p>';
    
    try {
        const res = await fetch(`${API_BASE}/safespace/verify`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({content: text})
        });
        const data = await res.json();
        resDiv.innerHTML = `
            <h4 style="color:#2ecc71; margin-bottom:12px; font-size:1.1rem;">✓ Verification Findings</h4>
            <p style="margin-bottom:8px;"><strong>1. Who published it?</strong><br><span style="color:#ddd;">${data.publisher}</span></p>
            <p style="margin-bottom:8px;"><strong>2. Is there an original source?</strong><br><span style="color:#ddd;">${data.original_source}</span></p>
            <p style="margin-bottom:8px;"><strong>3. What do credible sources say?</strong><br><span style="color:#ddd;">${data.credible_sources}</span></p>
            <p style="margin-bottom:0; color:#2ecc71;"><strong>4. What should you do?</strong><br><span>${data.recommendation}</span></p>
        `;
    } catch(e) {
        resDiv.innerHTML = '<p style="color:red;">Verification failed. Please check connection.</p>';
    }
}

let currentBeSureSelection = {};
function selectBeSureAnswer(testId, isReal) {
    currentBeSureSelection[testId] = isReal;
    const inputArea = document.getElementById(`besure-input-area-${testId}`);
    inputArea.style.display = 'flex';
}

function submitBeSureTest(testId) {
    const isReal = currentBeSureSelection[testId];
    const reason = document.getElementById(`besure-reason-${testId}`).value;
    
    if (!reason.trim()) {
        alert("Please provide a reason explaining how you noticed.");
        return;
    }
    
    const feedback = document.getElementById(`besure-feedback-${testId}`);
    feedback.innerHTML = '<p style="color:#aaa;">Evaluating observation...</p>';
    
    fetch(`${API_BASE}/besure/challenges/${testId}/answer`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            user_id: currentUserId,
            is_real: isReal,
            notice_text: reason
        })
    })
    .then(res => res.json())
    .then(data => {
        feedback.style.color = data.correct ? '#2ecc71' : '#e74c3c';
        feedback.innerHTML = `${data.message} ${data.ai_feedback}`;
        document.getElementById(`besure-input-area-${testId}`).style.display = 'none';
    })
    .catch(err => {
        feedback.style.color = 'red';
        feedback.innerHTML = 'Error evaluating answer.';
    });
}

// -----------------------------------------
// Login / Auto-Register Logic
// -----------------------------------------
async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-password').value;
    const msg = document.getElementById('login-message');
    
    if (!email) {
        msg.innerText = "Please enter an email address.";
        msg.style.display = 'block';
        msg.style.color = 'red';
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email: email, password: pwd || 'password123'})
        });
        const data = await res.json();
        
        currentUserId = data.user_id;
        currentUsername = data.username;
        sessionStorage.setItem('currentUserId', data.user_id);
        sessionStorage.setItem('currentUsername', data.username);
        
        msg.style.color = '#2ecc71';
        msg.innerText = "Welcome, " + data.username + "! Redirecting...";
        msg.style.display = 'block';
        
        document.getElementById('nav-login-text').innerText = data.username;
        
        setTimeout(() => {
            switchMainView('outreach', document.querySelectorAll('.nav-item')[0]);
        }, 1200);
    } catch(e) {
        msg.style.color = 'red';
        msg.innerText = "Login connection failed.";
        msg.style.display = 'block';
    }
}

// Initialize default view
document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('currentUsername')) {
        document.getElementById('nav-login-text').innerText = sessionStorage.getItem('currentUsername');
    }
    loadOutreach('home');
});
