from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
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
if os.path.exists("tuned_in_zw_website"):
    app.mount("/website", StaticFiles(directory="tuned_in_zw_website", html=True), name="website")

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
