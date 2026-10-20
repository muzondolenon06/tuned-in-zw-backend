from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models, database
from database import get_db, engine
from pydantic import BaseModel
from typing import List, Optional
import datetime
import os
import json
from rss_aggregator import run_rss_aggregator
from ai_service import AIService

ai_service = AIService()

# In-memory admin post store (persisted in DB via Article model)
ADMIN_SOURCE = "Admin"

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Tuned_in_zw API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.path.exists("frontend"):
    app.mount("/app", StaticFiles(directory="frontend", html=True), name="frontend")
    app.mount("/website", StaticFiles(directory="frontend", html=True), name="website")

class ArticleSchema(BaseModel):
    id: int
    title: str
    source: str
    url: str
    published_date: datetime.datetime
    category: Optional[str] = "General"
    descriptive_topic: Optional[str] = None
    summary: Optional[str] = None
    image_url: Optional[str] = None
    is_hot_pick: bool = False

    class Config:
        from_attributes = True

class RadioProgramSchema(BaseModel):
    id: int
    station: str
    title: str
    description: Optional[str] = None
    schedule: Optional[str] = None
    presenter: Optional[str] = None
    url: str

    class Config:
        from_attributes = True

class OpportunitySchema(BaseModel):
    id: int
    title: str
    source: str
    url: str
    description: Optional[str] = None
    criteria: Optional[str] = None

    class Config:
        from_attributes = True

class AutomatedEmailBase(BaseModel):
    topic: str
    content: str

class AutomatedEmailCreate(AutomatedEmailBase):
    pass

class AutomatedEmailSchema(AutomatedEmailBase):
    id: int

    class Config:
        from_attributes = True

# ─── NEWS ENDPOINTS ────────────────────────────────────────────────────────────

@app.get("/news/today", response_model=List[ArticleSchema])
def get_todays_news(db: Session = Depends(get_db)):
    """Return all articles sorted by newest first."""
    articles = db.query(models.Article).order_by(models.Article.published_date.desc()).all()
    return articles

@app.get("/news/{newspaper}", response_model=List[ArticleSchema])
def get_newspaper_news(newspaper: str, date: Optional[str] = None, db: Session = Depends(get_db)):
    """Return articles for a specific newspaper source. 'All' returns everything."""
    if newspaper.lower() == "all":
        query = db.query(models.Article)
    else:
        query = db.query(models.Article).filter(models.Article.source.ilike(f"%{newspaper}%"))
    return query.order_by(models.Article.published_date.desc()).all()

@app.get("/news/{newspaper}/search")
def search_newspaper(newspaper: str, query: str, db: Session = Depends(get_db)):
    """Search articles by keyword within a newspaper source."""
    if newspaper.lower() == "all":
        db_articles = db.query(models.Article).filter(
            (models.Article.title.ilike(f"%{query}%")) |
            (models.Article.summary.ilike(f"%{query}%"))
        ).all()
    else:
        db_articles = db.query(models.Article).filter(
            models.Article.source.ilike(f"%{newspaper}%"),
            (models.Article.title.ilike(f"%{query}%")) |
            (models.Article.summary.ilike(f"%{query}%"))
        ).all()
    return {"target_date": db_articles, "other_dates": []}

# ─── RECOMMENDATION & RECENTS ENDPOINTS ────────────────────────────────────────

@app.get("/recommended", response_model=List[ArticleSchema])
def get_recommendations(user_id: int, db: Session = Depends(get_db)):
    """Return top 5 recommended (hot pick) articles. Falls back to latest."""
    articles = db.query(models.Article).filter(models.Article.is_hot_pick == True).limit(5).all()
    if not articles:
        articles = db.query(models.Article).order_by(models.Article.published_date.desc()).limit(5).all()
    return articles

@app.get("/recents", response_model=List[ArticleSchema])
def get_recents(user_id: int, db: Session = Depends(get_db)):
    """Return most recently published 5 articles."""
    return db.query(models.Article).order_by(models.Article.published_date.desc()).limit(5).all()

# ─── RADIO ENDPOINTS ────────────────────────────────────────────────────────────

@app.get("/radio/{station}", response_model=List[ArticleSchema])
def get_radio_programs(station: str, db: Session = Depends(get_db)):
    """
    Return articles tagged as Radio content.
    """
    # Check if any radio articles exist at all
    radio_count = db.query(models.Article).filter(models.Article.category == "Radio").count()
    if radio_count == 0:
        # Seed default radio programs if none exist
        sample_radio = [
            models.Article(title="The Ignition", summary="Start your morning with the latest hits and news on ZiFM Stereo.", url="#zifm", source="ZiFM", category="Radio", published_date=datetime.datetime.now()),
            models.Article(title="The Breeze", summary="Smooth sounds and deep discussions on StarFM.", url="#starfm", source="StarFM", category="Radio", published_date=datetime.datetime.now()),
            models.Article(title="Capitalk Drive", summary="Navigating Harare's traffic with the best conversations.", url="#capitalk", source="Capitalk", category="Radio", published_date=datetime.datetime.now())
        ]
        try:
            db.add_all(sample_radio)
            db.commit()
        except Exception as e:
            db.rollback()

    query = db.query(models.Article).filter(models.Article.category == "Radio")
    
    if station.lower() != "all":
        query = query.filter(
            (models.Article.source.ilike(f"%{station}%")) |
            (models.Article.title.ilike(f"%{station}%"))
        )
        
    return query.order_by(models.Article.published_date.desc()).all()

@app.get("/radio/{station}/search")
def search_radio(station: str, query: str, db: Session = Depends(get_db)):
    """Search articles/broadcasts by keyword."""
    db_articles = db.query(models.Article).filter(
        (models.Article.title.ilike(f"%{query}%")) |
        (models.Article.summary.ilike(f"%{query}%"))
    ).all()
    return db_articles

# ─── DISCOVER ENDPOINTS ─────────────────────────────────────────────────────────

@app.get("/discover")
def get_discovery_topics(db: Session = Depends(get_db)):
    """Return articles in discovery-oriented categories."""
    discovery_cats = ["governance", "policy", "legislation", "rights", "development", "General"]
    articles = db.query(models.Article).order_by(models.Article.published_date.desc()).all()
    return articles

@app.get("/discover/categories")
def get_discovery_categories(db: Session = Depends(get_db)):
    """Return articles grouped by category for the discovery hub."""
    articles = db.query(models.Article).order_by(models.Article.published_date.desc()).all()
    categories = {}
    for a in articles:
        cat = a.category or "General"
        if cat not in categories:
            categories[cat] = []
        categories[cat].append({
            "id": a.id,
            "title": a.title,
            "descriptive_topic": a.descriptive_topic,
            "summary": a.summary,
            "image_url": a.image_url
        })
    return categories

@app.get("/discover/search")
def search_discovery(query: str, db: Session = Depends(get_db)):
    """Search the discovery database. Returns AI suggestions if empty."""
    results = db.query(models.Article).filter(
        (models.Article.title.ilike(f"%{query}%")) |
        (models.Article.summary.ilike(f"%{query}%")) |
        (models.Article.descriptive_topic.ilike(f"%{query}%"))
    ).all()
    if results:
        return {"source": "database", "results": results}
    else:
        # AI suggestion fallback
        suggestions = [
            f"{query} Policy Update 2026",
            f"Zimbabwe {query} Developments",
            f"{query} Youth Forum",
            f"National {query} Strategy",
            f"{query} Reform Agenda"
        ]
        return {"source": "ai", "results": suggestions}

@app.get("/discover/topic/{article_id}")
def get_discovery_topic(article_id: int, db: Session = Depends(get_db)):
    """Fetch a single article for the deep-dive discover view."""
    article = db.query(models.Article).filter(models.Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return {
        "id": article.id,
        "title": article.title,
        "deep_overview": article.deep_overview or article.summary or "Deep overview pending AI processing.",
        "deep_facts": article.deep_facts or "[]",
        "deep_verdict": article.deep_verdict or "AI verdict pending.",
        "image_url": article.image_url,
        "source": article.source,
        "url": article.url,
        "category": article.category,
    }

# ─── HOT PICKS ENDPOINT ─────────────────────────────────────────────────────────

@app.get("/hot_picks/mixed")
def get_hot_picks_mixed(user_id: int, db: Session = Depends(get_db)):
    """Return a curated mixed feed of news + discovery articles for Hot Picks."""
    news_articles = db.query(models.Article).order_by(models.Article.published_date.desc()).limit(6).all()
    results = []
    for i, a in enumerate(news_articles):
        item = {
            "id": a.id,
            "title": a.title,
            "source": a.source,
            "summary": a.summary,
            "image_url": a.image_url,
            "url": a.url,
            "category": a.category,
            "content_type": "news" if i % 3 != 2 else "discovery"
        }
        results.append(item)
    return results

# ─── OPPORTUNITIES ENDPOINT ─────────────────────────────────────────────────────

@app.get("/opportunities", response_model=List[OpportunitySchema])
def get_opportunities(db: Session = Depends(get_db)):
    """Return all youth opportunities including admin posts."""
    opps = db.query(models.Opportunity).all()
    
    # Fetch admin posts that were categorized as opportunities
    admin_opps = db.query(models.Article).filter(
        models.Article.category == "Opportunities"
    ).all()
    
    # Prepend admin opportunities to the top
    for a in admin_opps:
        opp_obj = models.Opportunity(
            id=a.id + 100000, # offset ID to avoid collision
            title=a.title,
            source=a.source,
            url=a.url,
            description=a.summary or a.full_content,
            criteria="Admin update"
        )
        opps.insert(0, opp_obj)
        
    if not opps:
        # Seed with sample data if empty
        sample_opps = [
            models.Opportunity(title="Google Africa Developer Scholarship 2026", source="Google", url="https://developers.google.com/", description="Apply for Google scholarships for developers across Africa."),
            models.Opportunity(title="African Union Youth Volunteer Corps", source="African Union", url="https://au.int/", description="Join the AU Youth Volunteer Corps and serve across Africa."),
            models.Opportunity(title="ZITF Business Innovation Challenge", source="ZITF", url="https://zitf.co.zw/", description="Compete in Zimbabwe's top innovation challenge."),
            models.Opportunity(title="UNESCO Youth Forum 2026", source="UNESCO", url="https://en.unesco.org/", description="Participate in global youth forums to shape the future."),
            models.Opportunity(title="Startup Zimbabwe Accelerator Program", source="StartupZW", url="https://startupzimbabwe.org/", description="Mentorship and funding for Zimbabwean tech startups."),
        ]
        db.add_all(sample_opps)
        db.commit()
        opps = db.query(models.Opportunity).all()
    return opps

# ─── ADMIN & MISC ENDPOINTS ─────────────────────────────────────────────────────

@app.get("/")
def root():
    if os.path.exists("frontend/index.html"):
        return FileResponse("frontend/index.html")
    return {"message": "Tuned_in_zw API is running."}

@app.get("/emails/", response_model=List[AutomatedEmailSchema])
def get_emails(db: Session = Depends(get_db)):
    return db.query(models.AutomatedEmail).all()

@app.post("/emails/", response_model=AutomatedEmailSchema)
def create_email(email: AutomatedEmailCreate, db: Session = Depends(get_db)):
    db_email = models.AutomatedEmail(topic=email.topic, content=email.content)
    db.add(db_email)
    db.commit()
    db.refresh(db_email)
    return db_email

@app.put("/emails/{email_id}", response_model=AutomatedEmailSchema)
def update_email(email_id: int, email: AutomatedEmailCreate, db: Session = Depends(get_db)):
    db_email = db.query(models.AutomatedEmail).filter(models.AutomatedEmail.id == email_id).first()
    if not db_email:
        raise HTTPException(status_code=404, detail="Email not found")
    db_email.topic = email.topic
    db_email.content = email.content
    db.commit()
    db.refresh(db_email)
    return db_email

@app.post("/admin/sync-feeds")
def sync_feeds(background_tasks: BackgroundTasks):
    """Trigger RSS aggregation as a background task (non-blocking)."""
    background_tasks.add_task(run_rss_aggregator)
    return {"message": "RSS Aggregation started in background"}

# ─── ADMIN POST ENDPOINTS ───────────────────────────────────────────────────────

class AdminPostCreate(BaseModel):
    title: str
    content: str
    section: Optional[str] = "general"  # news, radio, opportunities, hotpicks, discovery, general
    image_url: Optional[str] = None
    is_hot_pick: Optional[bool] = False

@app.post("/admin/post", response_model=ArticleSchema)
def create_admin_post(post: AdminPostCreate, db: Session = Depends(get_db)):
    """Admin creates a universal post that appears in the user feed."""
    # Map section to category
    section_to_category = {
        "news": "News",
        "radio": "Radio",
        "opportunities": "Opportunities",
        "hotpicks": "Hot Picks",
        "discovery": "Discovery",
        "general": "General",
        "connect": "Community",
    }
    category = section_to_category.get(post.section.lower(), "General")
    
    new_article = models.Article(
        title=post.title,
        summary=post.content,
        full_content=post.content,
        url=f"#admin-post-{datetime.datetime.now().timestamp()}",
        source=ADMIN_SOURCE,
        category=category,
        descriptive_topic=f"Admin | {post.section.title()}",
        image_url=post.image_url,
        is_hot_pick=post.is_hot_pick or post.section == "hotpicks",
        published_date=datetime.datetime.now()
    )
    db.add(new_article)
    db.commit()
    db.refresh(new_article)
    return new_article

@app.get("/admin/posts", response_model=List[ArticleSchema])
def get_admin_posts(db: Session = Depends(get_db)):
    """Retrieve all posts made by admin."""
    return db.query(models.Article).filter(
        models.Article.source == ADMIN_SOURCE
    ).order_by(models.Article.published_date.desc()).all()

@app.delete("/admin/posts/{post_id}")
def delete_admin_post(post_id: int, db: Session = Depends(get_db)):
    """Delete a specific admin post."""
    post = db.query(models.Article).filter(
        models.Article.id == post_id,
        models.Article.source == ADMIN_SOURCE
    ).first()
    if not post:
        raise HTTPException(status_code=404, detail="Admin post not found")
    db.delete(post)
    db.commit()
    return {"message": "Post deleted successfully"}


# --- NEW SCHEMAS ---

class UserSchema(BaseModel):
    id: int
    username: str
    email: str
    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    email: str
    password: str

class MILScoreSchema(BaseModel):
    id: int
    user_id: int
    info_verification: int
    ai_awareness: int
    digital_safety: int
    source_evaluation: int
    class Config:
        from_attributes = True

class ImageChallengeSchema(BaseModel):
    id: int
    image_url: Optional[str] = None
    category: Optional[str] = None
    is_real: bool
    explanation: Optional[str] = None
    created_at: datetime.datetime
    class Config:
        from_attributes = True

class ChallengeAnswer(BaseModel):
    user_id: int
    is_real: bool
    notice_text: str

class VerifyRequest(BaseModel):
    content: str

class VerifyResponse(BaseModel):
    publisher: str
    original_source: str
    credible_sources: str
    recommendation: str

# --- NEW ENDPOINTS ---

@app.post("/auth/login")
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    # Very basic placeholder auth
    user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if not user:
        # Auto-register for prototype purposes
        user = models.User(username=user_data.email.split("@")[0], email=user_data.email, password_hash="hash")
        db.add(user)
        db.commit()
        db.refresh(user)
        # Create initial MILScore
        mil = models.MILScore(user_id=user.id)
        db.add(mil)
        db.commit()
    return {"message": "Login successful", "user_id": user.id, "username": user.username}

@app.get("/mil/score/{user_id}", response_model=MILScoreSchema)
def get_mil_score(user_id: int, db: Session = Depends(get_db)):
    score = db.query(models.MILScore).filter(models.MILScore.user_id == user_id).first()
    if not score:
        score = models.MILScore(user_id=user_id)
        db.add(score)
        db.commit()
        db.refresh(score)
    return score

@app.post("/safespace/verify", response_model=VerifyResponse)
def verify_content(request: VerifyRequest, db: Session = Depends(get_db)):
    # AI implementation for verifying content with heuristic fallback
    text = request.content.strip()
    
    # Try calling AI service if available
    try:
        if hasattr(ai_service, 'client') and ai_service.client:
            prompt = f"""Analyze this claim/content circulating in Zimbabwe: '{text}'
Answer these 4 questions:
1. Who published it? (originating account/source)
2. Is there an original source? (government gazette, verified media, none)
3. What do credible sources say? (debunking or confirming details)
4. What should you do? (guidance on sharing/reporting)
Respond in strict JSON format:
{{"publisher": "...", "original_source": "...", "credible_sources": "...", "recommendation": "..."}}"""
            res_json = ai_service._call_api(prompt, json_mode=True)
            res_json = res_json.replace('```json', '').replace('```', '').strip()
            data = json.loads(res_json)
            return VerifyResponse(
                publisher=data.get("publisher", "Unverified social media broadcast"),
                original_source=data.get("original_source", "No matching official gazette or press release found."),
                credible_sources=data.get("credible_sources", "Major Zimbabwean news outlets have not confirmed this report."),
                recommendation=data.get("recommendation", "Pause before sharing. Confirm with official department channels.")
            )
    except Exception as e:
        print(f"Verify AI processing error: {e}")
        
    # Heuristic verification fallback
    lower = text.lower()
    if any(k in lower for k in ["ecocash", "won", "prize", "airtime", "voucher", "click here", "claim your"]):
        return VerifyResponse(
            publisher="Likely fraudulent WhatsApp / SMS sender",
            original_source="No verified promotion registered with official telecoms or merchants.",
            credible_sources="Consumer protection bodies and police frequently warn against upfront payment or code-dialing schemes.",
            recommendation="Do not dial any USSD codes or share PINs. Block and report the sender immediately."
        )
    elif any(k in lower for k in ["gazette", "curriculum", "zimsec", "minister", "parliament", "zimstat", "rbz"]):
        return VerifyResponse(
            publisher="Civic / Policy claim referencing Zimbabwean authorities",
            original_source="Pending cross-check against recent Government Gazettes and Ministerial press briefings.",
            credible_sources="Check official government portals (e.g. Zimstat, Ministry of Information) or Tuned_in_zw News Hub.",
            recommendation="Verify the exact gazette statutory instrument number before treating as law."
        )
    else:
        return VerifyResponse(
            publisher="Unverified online source / forwarded chain message",
            original_source="No primary document or official citation accompanied this text.",
            credible_sources="No corroborating reports on mainstream Zimbabwean platforms (NewsDay, Herald, etc.).",
            recommendation="Hold and verify. Search the Tuned_in_zw News Hub to see if verified journalists have investigated."
        )


def ensure_data_seeded(db: Session):
    try:
        if db.query(models.MILModule).count() == 0:
            home_modules = [
                ("Understanding News", "Learn the foundations of news reporting, editorial standards, and media ethics in Zimbabwe.", "News literacy empowers citizens to discern factual reporting from propaganda. Always check the byline, date of publication, and whether multiple sources are cited."),
                ("Fact Checking", "Tools and techniques to verify claims, reverse-image search, and spot fake news.", "Cross-reference breaking claims against credible Zimbabwean institutions, verified wire reports, and reputable press agencies before sharing on social media."),
                ("AI & Misinformation", "Understand how AI is used to create deepfakes, clone voices, and spread synthetic media.", "Generative AI can create hyper-realistic images and audio. Look for visual inconsistencies such as unnatural hands, blurry text, mismatched shadows, and unnatural speech cadences."),
                ("Social Media Literacy", "Navigate social algorithms, echo chambers, and algorithmic bias.", "Social platforms prioritize engagement over truth. Sensational headlines are amplified. Learn how to audit your feed and diversify your news diet."),
                ("Digital Safety", "Protect your online identity, device security, and personal data from surveillance and theft.", "Enable two-factor authentication (2FA), use strong unique passphrases, and audit app permissions on your mobile devices."),
                ("Understanding Radio & Podcasts", "Analyzing audio media, broadcast licenses, and civic commentary across Zimbabwe.", "Radio remains one of the most accessible information channels in Zimbabwe. Distinguish between news reports, sponsor broadcasts, and listener call-in opinions."),
                ("Critical Thinking", "Developing cognitive skills to evaluate claims, arguments, and logical fallacies.", "Question assertions that appeal purely to emotion, fear, or outrage. Check the underlying evidentiary basis and primary documents."),
                ("Spotting Scams", "Identify common online financial, scholarship, phishing, and mobile money scams.", "Be alert to unsolicited WhatsApp offers, fake job placements asking for application fees, and unverified investment schemes promising guaranteed high returns."),
                ("Freedom of Expression & Responsible Sharing", "Balancing constitutional free speech with responsible civic behavior online.", "Understand Zimbabwe's cyber and data protection legislative framework, avoiding defamation, and defending digital rights responsibly.")
            ]
            for title, desc, guide in home_modules:
                mod = models.MILModule(title=title, description=desc)
                db.add(mod)
                db.commit()
                db.refresh(mod)
                article = models.ModuleContent(
                    module_id=mod.id,
                    content_type="reading",
                    title=f"Academy Guide: {title}",
                    content_text=guide
                )
                db.add(article)
                db.commit()

            safespace_modules = [
                ("Cyberbullying", "What to do when targeted with abusive or intimidatory messages online.", "Do not retaliate. Take screenshots with timestamps, block the offender, and report the behavior to platform safety teams and youth trusted hotlines."),
                ("Online harassment", "Handling persistent trolling, stalking, and gender-based digital violence.", "Document all communications, adjust privacy settings to restrict direct messaging, and reach out to local digital rights defense groups."),
                ("Scams", "Recognizing fake jobs, grant scams, and mobile money pyramid schemes.", "Legitimate organizations never ask for money or airtime upfront. Verify official domain addresses and register via verified portals."),
                ("Privacy", "Keeping your private life, location, and metadata protected.", "Turn off location tagging on photos and social posts. Regularly review app privacy settings and limit public visibility."),
                ("Password security", "Building unbreakable credentials and managing credentials securely.", "Use passphrases with 14+ characters combining words, numbers, and symbols. Never reuse passwords across email and social networks."),
                ("Phishing", "Catching deceptive emails and SMS links designed to steal accounts.", "Inspect sender URLs carefully. Look for spoofed characters (e.g. paypa1.com). Never enter your credentials via an unsolicited link."),
                ("Doxxing", "Responding when your private contact or residential info is leaked.", "Immediately secure all associated online accounts, contact platform moderators to demand immediate takedown, and seek legal guidance."),
                ("Online exploitation", "Protecting against coercion, extortion, and sextortion schemes.", "Stop communication immediately. Do not pay extortionists. Reach out to trusted helplines and youth counseling services."),
                ("Reporting harmful content", "How to submit takedown notices and flag hate speech or disinformation.", "Use in-app reporting tools, cite terms of service violations, and report to civic watchdog bodies if illegal content persists."),
                ("Protecting personal information", "Guarding your national ID, banking PINs, and home details.", "Never post pictures of your ID, boarding passes, or utility bills. Shred physical documents with sensitive details before disposal.")
            ]
            for title, desc, guide in safespace_modules:
                mod = models.MILModule(title=title, description=desc)
                db.add(mod)
                db.commit()
                db.refresh(mod)
                article = models.ModuleContent(
                    module_id=mod.id,
                    content_type="reading",
                    title=f"Safe Space Playbook: {title}",
                    content_text=guide
                )
                db.add(article)
                db.commit()

        if db.query(models.ImageChallenge).count() == 0:
            challenges = [
                models.ImageChallenge(
                    category="AI-Generated Political Rally Image",
                    image_url="https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=600&auto=format&fit=crop&q=80",
                    is_real=False,
                    explanation="Notice the distorted crowd faces in the background and unnatural lighting artifacts on hands and signs. AI image generators often struggle with realistic crowd fingers and coherent typography."
                ),
                models.ImageChallenge(
                    category="Real Photograph: Harare Skyline at Sunset",
                    image_url="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop&q=80",
                    is_real=True,
                    explanation="Natural lens flare, consistent shadows matching the sun's angle, and authentic architectural details confirm this is an unaltered photograph."
                ),
                models.ImageChallenge(
                    category="Manipulated Viral Headline Screenshot",
                    image_url="https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&auto=format&fit=crop&q=80",
                    is_real=False,
                    explanation="The font kerning and resolution on the headline text do not match the surrounding webpage banner, indicating a local browser Inspect Element manipulation."
                )
            ]
            db.add_all(challenges)
            db.commit()

        if db.query(models.SafeSpaceExperience).count() == 0:
            experiences = [
                models.SafeSpaceExperience(
                    topic="Scams",
                    content="Received a WhatsApp message claiming I won $500 in an EcoCash promotion, asking me to dial an approval code. I remembered our fact-checking guide, called EcoCash support directly, and avoided having my wallet drained!",
                    author_name="Tinashe M."
                ),
                models.SafeSpaceExperience(
                    topic="Cyberbullying",
                    content="Someone created a parody account with my photos on Facebook. I documented the profile link, reported it under impersonation with friends helping flag it, and it was removed in under 24 hours.",
                    author_name="Ruvimbo K."
                ),
                models.SafeSpaceExperience(
                    topic="Phishing",
                    content="Got a fake university scholarship email asking for my national ID scan and $20 processing fee. Checked the official university website and found they never charge fees for scholarship applications.",
                    author_name="Anonymous Peer"
                )
            ]
            db.add_all(experiences)
            db.commit()
    except Exception as e:
        print(f"Auto-seed error: {e}")
        db.rollback()

@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        ensure_data_seeded(db)
    finally:
        db.close()

@app.get("/besure/challenges", response_model=List[ImageChallengeSchema])
def get_challenges(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    return db.query(models.ImageChallenge).all()

@app.post("/besure/challenges/{id}/answer")
def answer_challenge(id: int, answer: ChallengeAnswer, db: Session = Depends(get_db)):
    challenge = db.query(models.ImageChallenge).filter(models.ImageChallenge.id == id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    
    # Check correctness
    expected_is_real = challenge.is_real
    is_correct = (answer.is_real == expected_is_real)
    
    # Prompt AI to categorize notice_text into one of the 4 areas and evaluate
    evaluation = ai_service.categorize_article(f"Evaluate this response: {answer.notice_text}", "MIL Evaluation")
    
    # Update MIL Score (Placeholder logic)
    score = db.query(models.MILScore).filter(models.MILScore.user_id == answer.user_id).first()
    if score:
        if is_correct:
            score.ai_awareness += 5
        db.commit()
        
    return {
        "correct": is_correct,
        "message": "Correct!" if is_correct else "Incorrect.",
        "ai_feedback": f"Your reasoning was evaluated."
    }



class SafeSpaceExperienceBase(BaseModel):
    topic: str
    content: str
    image_url: Optional[str] = None
    author_name: Optional[str] = "Anonymous Peer"

class SafeSpaceExperienceCreate(SafeSpaceExperienceBase):
    pass

class SafeSpaceExperienceSchema(SafeSpaceExperienceBase):
    id: int
    class Config:
        from_attributes = True

@app.get("/safespace/experiences", response_model=List[SafeSpaceExperienceSchema])
def get_safespace_experiences(topic: Optional[str] = None, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    query = db.query(models.SafeSpaceExperience)
    if topic:
        query = query.filter(models.SafeSpaceExperience.topic == topic)
    return query.order_by(models.SafeSpaceExperience.id.desc()).all()

@app.post("/safespace/experiences", response_model=SafeSpaceExperienceSchema)
def create_safespace_experience(exp: SafeSpaceExperienceCreate, db: Session = Depends(get_db)):
    new_exp = models.SafeSpaceExperience(
        topic=exp.topic,
        content=exp.content,
        image_url=exp.image_url,
        author_name=exp.author_name or "Anonymous Peer"
    )
    db.add(new_exp)
    db.commit()
    db.refresh(new_exp)
    return new_exp

# --- MODULE SCHEMAS & ENDPOINTS ---

class ModuleContentSchema(BaseModel):
    id: int
    module_id: int
    content_type: str
    title: str
    content_url: Optional[str] = None
    content_text: Optional[str] = None
    published_date: datetime.datetime
    class Config:
        from_attributes = True

class MILModuleSchema(BaseModel):
    id: int
    title: str
    description: str
    contents: List[ModuleContentSchema] = []
    class Config:
        from_attributes = True

@app.get("/modules", response_model=List[MILModuleSchema])
def get_mil_modules(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    modules = db.query(models.MILModule).all()
    result = []
    for m in modules:
        contents = db.query(models.ModuleContent).filter(models.ModuleContent.module_id == m.id).all()
        mod_dict = {
            "id": m.id,
            "title": m.title,
            "description": m.description,
            "contents": contents
        }
        result.append(mod_dict)
    return result

@app.get("/modules/{id}/content", response_model=List[ModuleContentSchema])
def get_module_content(id: int, db: Session = Depends(get_db)):
    return db.query(models.ModuleContent).filter(models.ModuleContent.module_id == id).all()

# Mount site root for direct browser access
if os.path.exists("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="site_root")
