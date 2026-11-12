from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import relationship
import datetime
from database import Base

class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    source = Column(String)  # e.g., Campus Innovation, Health News, Enactus Updates
    url = Column(String, unique=True, index=True)
    published_date = Column(DateTime, default=datetime.datetime.utcnow)
    author = Column(String, nullable=True)
    category = Column(String, index=True)  # e.g., Health News, Campus Innovation, Radio
    descriptive_topic = Column(String, index=True, nullable=True)
    summary = Column(Text, nullable=True)
    full_content = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    deep_overview = Column(Text, nullable=True)
    deep_facts = Column(Text, nullable=True) # JSON list of strings
    deep_verdict = Column(Text, nullable=True)
    is_hot_pick = Column(Boolean, default=False)

class RadioProgram(Base):
    __tablename__ = "radio_programs"

    id = Column(Integer, primary_key=True, index=True)
    station = Column(String, index=True)
    title = Column(String)
    description = Column(Text, nullable=True)
    schedule = Column(String, nullable=True)
    presenter = Column(String, nullable=True)
    url = Column(String)

class Opportunity(Base):
    __tablename__ = "opportunities"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    source = Column(String)
    url = Column(String)
    description = Column(Text, nullable=True)
    criteria = Column(String, nullable=True)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=True)
    university = Column(String, default="University of Zimbabwe (UZ)", nullable=True)
    age = Column(Integer, nullable=True)
    interests = Column(String, nullable=True)
    
class UserActivity(Base):
    __tablename__ = "user_activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")
    article = relationship("Article")
    opportunity = relationship("Opportunity")

class AutomatedEmail(Base):
    __tablename__ = "automated_emails"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String, index=True)
    content = Column(Text)

class MILModule(Base):
    __tablename__ = "mil_modules"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, unique=True, index=True)
    description = Column(Text)

class ModuleContent(Base):
    __tablename__ = "module_contents"

    id = Column(Integer, primary_key=True, index=True)
    module_id = Column(Integer, ForeignKey("mil_modules.id"))
    content_type = Column(String) # "video", "reading", "quiz"
    title = Column(String)
    content_url = Column(String, nullable=True)
    content_text = Column(Text, nullable=True)
    published_date = Column(DateTime, default=datetime.datetime.utcnow)

    module = relationship("MILModule")

class UserProgress(Base):
    __tablename__ = "user_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content_id = Column(Integer, ForeignKey("module_contents.id"))
    completed_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")
    content = relationship("ModuleContent")

class MILScore(Base):
    __tablename__ = "mil_scores"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    info_verification = Column(Integer, default=72)   # BAC & Health Limits Knowledge
    ai_awareness = Column(Integer, default=68)        # Peer Pressure & Refusal Skills
    digital_safety = Column(Integer, default=80)      # Harm Reduction & Party Safety
    source_evaluation = Column(Integer, default=75)   # Safe Decision-Making & Law
    
    user = relationship("User")

class SafeSpaceExperience(Base):
    __tablename__ = "safespace_experiences"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String, index=True)
    content = Column(Text)
    image_url = Column(String, nullable=True)
    author_name = Column(String, default="Anonymous Peer")
    likes_count = Column(Integer, default=5)

class ImageChallenge(Base):
    __tablename__ = "image_challenges"

    id = Column(Integer, primary_key=True, index=True)
    image_url = Column(String, nullable=True)
    category = Column(String)
    is_real = Column(Boolean)
    explanation = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class ScenarioCard(Base):
    __tablename__ = "scenario_cards"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, index=True)
    scenario_text = Column(Text)
    image_url = Column(String, nullable=True)
    option_a = Column(String)
    option_b = Column(String)
    option_c = Column(String)
    best_option = Column(String) # "A", "B", or "C"
    consensus_stats = Column(String)
    expert_tip = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class WatchdogReport(Base):
    __tablename__ = "watchdog_reports"

    id = Column(Integer, primary_key=True, index=True)
    campus_or_area = Column(String, index=True)
    incident_type = Column(String, index=True)
    description = Column(Text)
    status = Column(String, default="Forwarded to Campus Security & ZRP Liaison")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class UniversityLeaderboard(Base):
    __tablename__ = "university_leaderboard"

    id = Column(Integer, primary_key=True, index=True)
    university_name = Column(String, unique=True, index=True)
    short_code = Column(String)
    ambassadors_count = Column(Integer, default=0)
    points = Column(Integer, default=0)
    pledge_18_signed = Column(Integer, default=0)

class CampusEvent(Base):
    __tablename__ = "campus_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    organizer = Column(String)
    category = Column(String, index=True)  # Marathons & Sports, Campaigns & Pledges, Sober Festivals, Workshops
    date_str = Column(String)
    location = Column(String)
    description = Column(Text)
    banner_url = Column(String, nullable=True)
    rsvp_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_token = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    university = Column(String, default="UZ", nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User")


class UserModuleProgress(Base):
    __tablename__ = "user_module_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "module_title", name="uq_user_module_title"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    module_id = Column(Integer, ForeignKey("mil_modules.id"), nullable=True, index=True)
    module_title = Column(String, index=True)
    completed_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")
    module = relationship("MILModule")


class UserEventRSVP(Base):
    __tablename__ = "user_event_rsvps"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_user_event_rsvp"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    event_id = Column(Integer, ForeignKey("campus_events.id"), index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")
    event = relationship("CampusEvent")


class UserStoryLike(Base):
    __tablename__ = "user_story_likes"
    __table_args__ = (
        UniqueConstraint("user_id", "experience_id", name="uq_user_story_like"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    experience_id = Column(Integer, ForeignKey("safespace_experiences.id"), index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")
    experience = relationship("SafeSpaceExperience")
