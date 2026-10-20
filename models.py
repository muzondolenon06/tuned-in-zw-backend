from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship
import datetime
from database import Base

class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    source = Column(String)  # e.g., Herald, NewsDay
    url = Column(String, unique=True, index=True)
    published_date = Column(DateTime, default=datetime.datetime.utcnow)
    author = Column(String, nullable=True)
    category = Column(String, index=True)  # e.g., sports, governance
    descriptive_topic = Column(String, index=True, nullable=True)  # e.g., CAB3
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
    criteria = Column(String, nullable=True) # e.g. age, education

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    age = Column(Integer, nullable=True)
    interests = Column(String, nullable=True)  # comma separated interests
    
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
    content_url = Column(String, nullable=True) # for video or quiz link
    content_text = Column(Text, nullable=True) # for reading material
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
    info_verification = Column(Integer, default=0)
    ai_awareness = Column(Integer, default=0)
    digital_safety = Column(Integer, default=0)
    source_evaluation = Column(Integer, default=0)
    
    user = relationship("User")

class SafeSpaceExperience(Base):
    __tablename__ = "safespace_experiences"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String, index=True)
    content = Column(Text)
    image_url = Column(String, nullable=True)
    author_name = Column(String, default="Anonymous Peer")

class ImageChallenge(Base):
    __tablename__ = "image_challenges"

    id = Column(Integer, primary_key=True, index=True)
    image_url = Column(String, nullable=True) # URL or Base64
    category = Column(String) # e.g. "AI-generated image", "real photograph", "manipulated headline"
    is_real = Column(Boolean)
    explanation = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
