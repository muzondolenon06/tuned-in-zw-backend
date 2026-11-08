import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, engine
import models
from main import ensure_data_seeded

# Ensure all tables exist
models.Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    ensure_data_seeded(db)
    mod_count = db.query(models.MILModule).count()
    scen_count = db.query(models.ScenarioCard).count()
    exp_count = db.query(models.SafeSpaceExperience).count()
    art_count = db.query(models.Article).count()
    uni_count = db.query(models.UniversityLeaderboard).count()
    evt_count = db.query(models.CampusEvent).count()
    print(f"Youth Connect+: Above the Influence DB Seed Complete!")
    print(f" -> Modules & Playbooks: {mod_count}")
    print(f" -> Smart Scenarios: {scen_count}")
    print(f" -> Peer Stories: {exp_count}")
    print(f" -> News & Radio Broadcasts: {art_count}")
    print(f" -> University Chapters: {uni_count}")
    print(f" -> Campus Events & Marathons: {evt_count}")
finally:
    db.close()
