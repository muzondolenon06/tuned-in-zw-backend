from database import SessionLocal
import models
import datetime

db = SessionLocal()

# clear existing
db.query(models.Article).delete()
db.query(models.UserActivity).delete()

# add some articles
a1 = models.Article(
    title="New Lithium Mining Regulations Announced",
    summary="The government has announced sweeping new regulations regarding lithium mining.",
    full_content="The government has announced sweeping new regulations regarding lithium mining. According to ZIMSTAT, lithium exports grew by 20% last year.",
    url="https://example.com/lithium",
    source="NewsDay",
    category="legislation",
    descriptive_topic="Mining Policy",
    image_url="https://via.placeholder.com/300x200.png?text=Lithium+Mining",
    is_hot_pick=True,
    published_date=datetime.datetime.now()
)

a2 = models.Article(
    title="Warriors Win AFCON Qualifier",
    summary="The national team secured a crucial victory yesterday.",
    full_content="The Zimbabwe Warriors won their match 2-1.",
    url="https://example.com/sports",
    source="Chronicle",
    category="sports",
    descriptive_topic="National Soccer",
    image_url="https://via.placeholder.com/300x200.png?text=Warriors+Win",
    is_hot_pick=False,
    published_date=datetime.datetime.now()
)

a3 = models.Article(
    title="Education Policy Update for 2027",
    summary="Ministry of Education outlines new curriculum goals.",
    full_content="Ministry of Education outlines new curriculum goals focusing on STEM. ZIMSTAT reports a 5% increase in STEM enrollments.",
    url="https://example.com/education",
    source="NewsDay",
    category="policy",
    descriptive_topic="STEM Education",
    image_url="https://via.placeholder.com/300x200.png?text=Education",
    is_hot_pick=True,
    published_date=datetime.datetime.now()
)

db.add_all([a1, a2, a3])
db.commit()

# add user activity
u1 = models.UserActivity(user_id=1, article_id=a1.id, timestamp=datetime.datetime.now())
u2 = models.UserActivity(user_id=1, article_id=a2.id, timestamp=datetime.datetime.now())
db.add_all([u1, u2])
db.commit()

print("Database seeded!")
