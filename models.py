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
