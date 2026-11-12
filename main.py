from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
import models, database
from database import get_db, engine, SessionLocal
from pydantic import BaseModel
from typing import List, Optional
import datetime
import os
import json
from rss_aggregator import run_rss_aggregator
from ai_service import AIService

ai_service = AIService()

ADMIN_SOURCE = "Admin"

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Youth Connect+: Above the Influence API")

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

# ─── SCHEMAS ───────────────────────────────────────────────────────────────────

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

class UserSchema(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    university: Optional[str] = "University of Zimbabwe (UZ)"
    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    email: str
    password: str
    university: Optional[str] = "University of Zimbabwe (UZ)"

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

class ScenarioCardSchema(BaseModel):
    id: int
    category: str
    scenario_text: str
    image_url: Optional[str] = None
    option_a: str
    option_b: str
    option_c: str
    best_option: str
    consensus_stats: str
    expert_tip: str
    created_at: datetime.datetime
    class Config:
        from_attributes = True

class ScenarioAnswerRequest(BaseModel):
    user_id: int = 1
    selected_option: str # "A", "B", or "C"
    reasoning: Optional[str] = ""

class WatchdogReportCreate(BaseModel):
    campus_or_area: str
    incident_type: str
    description: str

class WatchdogReportSchema(BaseModel):
    id: int
    campus_or_area: str
    incident_type: str
    description: str
    status: str
    created_at: datetime.datetime
    class Config:
        from_attributes = True

class UniversityLeaderboardSchema(BaseModel):
    id: int
    university_name: str
    short_code: str
    ambassadors_count: int
    points: int
    pledge_18_signed: int
    class Config:
        from_attributes = True

class CampusEventSchema(BaseModel):
    id: int
    title: str
    organizer: str
    category: str
    date_str: str
    location: str
    description: str
    banner_url: Optional[str] = None
    rsvp_count: int = 0
    created_at: datetime.datetime
    class Config:
        from_attributes = True

class CampusEventCreate(BaseModel):
    title: str
    organizer: str
    category: Optional[str] = "Campaigns & Pledges"
    date_str: str
    location: str
    description: str
    banner_url: Optional[str] = None

class PledgeRequest(BaseModel):
    user_id: Optional[int] = 1
    university_code: str = "UZ"
    points_earned: int = 25

class VerifyRequest(BaseModel):
    content: str

class VerifyResponse(BaseModel):
    verdict: Optional[str] = "FALSE"
    publisher: str
    original_source: str
    credible_sources: str
    recommendation: str

class SafeSpaceExperienceBase(BaseModel):
    topic: str
    content: str
    image_url: Optional[str] = None
    author_name: Optional[str] = "Anonymous Peer"
    likes_count: Optional[int] = 5

class SafeSpaceExperienceCreate(SafeSpaceExperienceBase):
    pass

class SafeSpaceExperienceSchema(SafeSpaceExperienceBase):
    id: int
    class Config:
        from_attributes = True

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


# ─── AUTO-SEEDING & MIGRATION LOGIC ────────────────────────────────────────────

def ensure_schema_columns(db: Session):
    """Safely add new columns to existing SQLite/Postgres tables if upgrading."""
    alter_statements = [
        "ALTER TABLE users ADD COLUMN email VARCHAR",
        "ALTER TABLE users ADD COLUMN password_hash VARCHAR",
        "ALTER TABLE users ADD COLUMN university VARCHAR DEFAULT 'University of Zimbabwe (UZ)'",
        "ALTER TABLE safespace_experiences ADD COLUMN likes_count INTEGER DEFAULT 5",
    ]
    for stmt in alter_statements:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception:
            db.rollback()

def ensure_data_seeded(db: Session):
    try:
        ensure_schema_columns(db)
        models.Base.metadata.create_all(bind=engine)

        # Check if the complete "Above the Influence" dataset is already seeded
        has_smart_drinking = db.query(models.MILModule).filter(
            models.MILModule.title == "Binge Drinking & Health Limits"
        ).first()
        has_scenarios = db.query(models.ScenarioCard).count() > 0

        if not has_smart_drinking or not has_scenarios:
            # Clear legacy MIL modules & contents so the new Smart Drinking curriculum takes over cleanly
            db.query(models.UserProgress).delete()
            db.query(models.ModuleContent).delete()
            db.query(models.MILModule).delete()
            db.query(models.SafeSpaceExperience).delete()
            db.query(models.ImageChallenge).delete()
            db.query(models.Article).delete()
            db.query(models.Opportunity).delete()
            db.commit()

            # 1. Seed 6 Smart Living & Moderation Academy Modules
            academy_modules = [
                (
                    "Binge Drinking & Health Limits",
                    "Understand Blood Alcohol Concentration (BAC), standard drink sizes, liver metabolism rates, and the acute health impacts of binge drinking.",
                    """1. WHAT IS A STANDARD DRINK?
In Zimbabwe, many young people underestimate how much alcohol they consume because drinks come in different sizes and strengths (ABV - Alcohol by Volume). One Standard Drink equals approximately 10–14 grams of pure alcohol:
• 340ml (1 bottle/can) of regular lager beer at 5% ABV
• 150ml glass of wine at 12% ABV
• 44ml (1 single tot/shot) of distilled spirits at 40% ABV

2. DEFINING BINGE DRINKING & BAC
The World Health Organization (WHO) and health authorities define binge drinking as consuming 5 or more standard drinks (for men) or 4 or more standard drinks (for women) within a 2-hour period, bringing Blood Alcohol Concentration (BAC) to 0.08% or higher.
Your liver can only metabolize roughly ONE standard drink per hour. Drinking faster than your liver can process causes alcohol to saturate your bloodstream and brain tissue.

3. SMART MODERATION RULES ("ABOVE THE INFLUENCE")
• The 1-for-1 Water Pacing Rule: Alternate every alcoholic beverage with a full glass of water.
• Never Drink on an Empty Stomach: Eating high-protein and complex-carbohydrate meals before socializing slows gastric absorption so BAC rises gradually rather than spiking.
• Set a Hard Limit Before You Go Out: Decide your drink cap (e.g., max 2 drinks) before arriving at the venue and track every serving."""
                ),
                (
                    "Drinking & Driving Prevention",
                    "Explore the physics of reaction-time impairment, statutory BAC limits in Zimbabwe, designated driver protocols, and safe campus transport.",
                    """1. THE SCIENCE OF IMPAIRMENT BEHIND THE WHEEL
Even at a BAC of 0.05%, visual tracking of moving objects drops, steering accuracy degrades, and emergency braking reaction time slows by 20–35%. At 60 km/h, a 1.5-second delay means your vehicle travels an extra 25 meters before your foot even touches the brake pedal.

2. ZIMBABWE ROAD TRAFFIC LAW & ENFORCEMENT
Under Zimbabwean road safety legislation, driving under the influence (exceeding 80mg of alcohol per 100ml of blood / 0.08% BAC) is a serious criminal offense carrying heavy fines, license suspension, and imprisonment if injury or fatal accidents occur.

3. THE "ZERO COMPROMISE" TRANSPORT PROTOCOL
• Appoint the Designated Driver ("The Captain") Before the Event: The designated driver commits to 0.00% alcohol for the entire night—not "just one or two."
• Pool Ride-Share Funds Upfront: Before heading out from campus halls, contribute to a shared transport wallet (inDrive, Bolt, or trusted local taxi) so nobody is tempted to drive to save money at midnight.
• Key Intervention Duty: True friends confiscate keys. Taking a peer's car keys when they have been drinking is an act of leadership, not betrayal."""
                ),
                (
                    "Illicit & Unregulated Brews",
                    "Identify the lethal chemical risks of unlabelled, counterfeit, and illicitly distilled alcohol ('kambwa' / 'musombodhiya') and substance mixing.",
                    """1. THE LETHAL DANGER OF ILLICIT BREWS
Across Zimbabwean communities and around campus perimeters, cheap unregulated alcohol—often sold in unlabelled plastic bottles or sachets (colloquially known as 'kambwa', 'musombodhiya', or counterfeit spirits)—poses an immediate threat to life.
Unlike regulated beverages produced under strict food-safety standards, illicit brews have zero quality control and frequently contain:
• Methanol (Wood Alcohol): Even 10ml can cause permanent blindness by destroying the optic nerve; 30ml can be fatal.
• Industrial Solvents & Battery Acid: Sometimes added by illicit brewers to artificially increase "kick" or speed up fermentation.
• Extreme, Unmeasured ABV: Causing rapid respiratory depression and coma within minutes.

2. DANGEROUS SUBSTANCE MIXING
Mixing alcohol with caffeinated energy drinks masks the central nervous system depressant effects of alcohol ("wide-awake drunkenness"), leading to severe dehydration, heart arrhythmias, and over-consumption. Mixing alcohol with prescription sedatives, painkillers, or cough syrups (codeine) can fatally stop breathing.

3. THE SMART CONSUMER CHECKLIST
• Check the Seal, Label, and Standards Mark: Never consume alcohol from unsealed bottles, unlabelled containers, or unauthorized street vendors.
• Report Illicit Suppliers: Use the Youth Connect+ Confidential Community Watchdog to report illicit alcohol distribution near campuses."""
                ),
                (
                    "Underage Drinking & Campus Culture",
                    "Navigate first-year orientation peer pressure, champion the 'Pledge 18' movement, and build vibrant substance-free university events.",
                    """1. REDEFINING CAMPUS CULTURE & "FRESHERS" WEEK
Transitioning to university or college brings sudden independence and intense social pressure to "fit in." However, survey data across Zimbabwean campuses shows that the majority of students respect peers who stand firm on their personal values and academic goals.

2. ZIMBABWE LIQUOR ACT & THE "PLEDGE 18" CAMPAIGN
Selling or supplying alcohol to anyone under the age of 18 is strictly prohibited under Zimbabwe's Liquor Act. Early-onset drinking before age 21 disrupts ongoing development of the prefrontal cortex—the brain region responsible for executive decision-making, impulse control, and memory consolidation.
By signing **Pledge 18**, Youth Connect+ Ambassadors commit to:
• Never purchasing or supplying alcohol to minors or high-school students.
• Championing age-verification compliance at campus and community events.

3. HOSTING HIGH-ENERGY SOBER EVENTS
Enactus chapters are proving that the best campus events don't require alcohol: night-time 5-a-side football tournaments, outdoor cinema nights, gaming esports leagues, acoustic poetry slams, and mocktail innovation bars."""
                ),
                (
                    "Alcohol & Pregnancy",
                    "Understand Fetal Alcohol Spectrum Disorders (FASD), maternal health science, and why zero alcohol is the only safe standard during pregnancy.",
                    """1. WHAT IS FETAL ALCOHOL SPECTRUM DISORDER (FASD)?
When a pregnant woman consumes alcohol, it crosses the placenta freely into the developing fetus's bloodstream. Because a fetus lacks a fully developed liver, it cannot metabolize alcohol effectively—meaning the baby's Blood Alcohol Concentration remains elevated far longer than the mother's.
FASD causes lifelong, irreversible physical, behavioral, and neurodevelopmental disabilities, including:
• Growth deficiencies and distinctive facial anomalies
• Congenital heart and kidney defects
• Severe learning, memory, attention, and impulse-control challenges

2. DEBUNKING PREGNANCY MYTHS
• Myth: "A small glass of wine or traditional brew in the third trimester helps the baby relax or builds blood."
• Scientific Fact: There is NO safe amount of alcohol, NO safe type of alcoholic drink, and NO safe trimester during pregnancy. Even a single binge episode during the first 3–6 weeks—often before a woman realizes she is pregnant—can damage embryonic organ and neural tube formation.

3. COMMUNITY & PARTNER RESPONSIBILITY
Protecting maternal health is a shared responsibility. Partners, friends, and campus communities must actively support pregnant peers by providing celebratory non-alcoholic alternatives and zero-pressure social spaces."""
                ),
                (
                    "Sugary Drinks, Diet & Long-Term Health",
                    "Master nutritional balance, hydration science, non-alcoholic beverage choices, and long-term metabolic wellness for peak student performance.",
                    """1. BEVERAGES, CALORIES & METABOLIC HEALTH
Both alcoholic drinks and high-sugar mixers pack "empty calories" that spike blood glucose and insulin without providing essential micronutrients. Excessive intake of sugary beverages and alcohol contributes to chronic inflammation, poor sleep architecture, fatty liver disease, and long-term metabolic syndrome.

2. ALCOHOL, SLEEP QUALITY & ACADEMIC PERFORMANCE
While alcohol may make you feel drowsy, it severely fragments Rapid Eye Movement (REM) sleep—the exact phase required by university students to consolidate lecture memories and problem-solving skills. A single night of heavy drinking can reduce next-day cognitive retention by up to 40%.

3. SMART HYDRATION & LIFESTYLE STRATEGIES
• Read the Nutrition Label: Compare sugar content per 100ml and opt for low-sugar or zero-sugar mixers, sparkling water with fresh citrus, or natural infusions.
• Electrolyte Recovery: Prioritize water, whole fruits, and balanced electrolytes during sports, study marathons, and social gatherings."""
                )
            ]

            for title, desc, guide in academy_modules:
                mod = models.MILModule(title=title, description=desc)
                db.add(mod)
                db.commit()
                db.refresh(mod)
                article = models.ModuleContent(
                    module_id=mod.id,
                    content_type="reading",
                    title=f"Smart Living Academy Guide: {title}",
                    content_text=guide
                )
                db.add(article)
                db.commit()

            # 2. Seed 4 "Above the Influence" Community Support Hub Guides ("Monsters of Addiction & Abuse")
            support_hub_modules = [
                (
                    "Peer Pressure & Social Isolation",
                    "Practical scripts to decline drinks confidently without social friction, hold boundaries, and stay connected on campus.",
                    """WHAT TO DO WHEN PRESSURED TO DRINK:
1. Use Ready-Made Low-Friction Scripts:
   • "I'm on medication / antibiotics this week, so I'm sticking to ginger ale."
   • "I have an early morning lab/training session tomorrow—keeping a clear head tonight."
   • "I'm the designated driver tonight, my squad is counting on me."
   • Simple & Firm: "I'm good with this right now, thanks!" (No long apology needed).
2. The 'Decoy Cup' Strategy:
   Keep a non-alcoholic drink (soda water with lime, juice, or zero-alcohol malt) in your hand. People rarely offer or force a drink on someone already holding a glass.
3. Anchor with an Ally:
   Before attending a party, pair up with at least one friend who shares your moderation boundary so you back each other up immediately."""
                ),
                (
                    "Gender-Based Violence (GBV) & Alcohol",
                    "Safety protocols at parties, drink-spiking prevention, understanding consent, and immediate confidential GBV reporting pathways.",
                    """SAFETY, CONSENT & GBV PREVENTION PROTOCOL:
1. Alcohol Never Excuses GBV:
   Intoxication is never an excuse for harassment, coercion, or sexual assault. Under the law and ethical standards, someone who is incapacitated by alcohol CANNOT give valid consent.
2. Party Safety & Anti-Spiking Rules:
   • Never leave your drink unattended, even to go to the restroom.
   • Never accept an already-opened bottle or cup from someone you don't deeply trust—watch the bartender or host pour or uncap it.
   • Cover your glass with your palm when moving through crowded dance floors.
3. The Squad Check-In Rule ("Arrive Together, Leave Together"):
   Establish a mandatory 45-minute check-in with your group. If a friend appears unusually dizzy, slurred, or disoriented after only one drink, move them to a safe area immediately and seek medical help.
4. Immediate Zimbabwean GBV Helplines:
   • Musasa Project Toll-Free Helpline: 0800 4321 / +263 773 843 139
   • Adult Rape Clinic (Parirenyatwa Hospital): +263 242 703 823 / 0775 672 770
   • ZRP Victim Friendly Unit (VFU): Available at your nearest police station."""
                ),
                (
                    "Mental Health & Coping",
                    "Healthy, evidence-based alternatives to self-medication for academic stress, financial anxiety, and relationship challenges.",
                    """BREAKING THE SELF-MEDICATION CYCLE:
1. Why Alcohol Worsens Stress & Depression:
   Alcohol is a Central Nervous System (CNS) depressant. While it temporarily numbs anxiety by boosting GABA, the rebound effect ("hangxiety") floods your brain with cortisol and depletes serotonin the next day—making exam stress and low mood significantly worse.
2. The H.A.L.T. Check:
   Never reach for a drink when you are **H**ungry, **A**ngry, **L**onely, or **T**ired. Pause and address the root physical or emotional need first.
3. Healthy Campus Coping Replacements:
   • 20-Minute Endorphin Reset: Brisk walk, campus gym session, or 5-a-side sport.
   • Structured Study Sprints: Use 45-minute Pomodoro blocks with peer study groups rather than isolating in your room.
   • Free Confidential Counseling: Reach out to The Friendship Bench Zimbabwe, your university's Dean of Students Wellness Clinic, or call the Youth Helpline (116)."""
                ),
                (
                    "Overdose & Alcohol Poisoning Protocol",
                    "Recognizing acute alcohol poisoning (CUPS signs), executing the Recovery Position, and calling emergency medical help.",
                    """EMERGENCY LIFE-SAVING PROTOCOL (DO NOT LET THEM 'SLEEP IT OFF'):
1. Recognize the C.U.P.S. Danger Signs of Alcohol Poisoning:
   • **C**old, clammy, pale, or bluish skin (hypothermia)
   • **U**nconsciousness or inability to be woken up by shouting/pinching
   • **P**uking (vomiting) repeatedly or while unconscious
   • **S**low or irregular breathing (fewer than 8 breaths per minute, or 10+ seconds between breaths)
2. What to Do IMMEDIATELY:
   • STEP 1 — Call Emergency Medical Services (999 / 994 / MARS 0800 3222 / Campus Clinic) immediately.
   • STEP 2 — Place the person in the **Recovery Position** (roll them onto their side with their top knee bent forward for stability and head tilted slightly to keep the airway open so they cannot choke on vomit).
   • STEP 3 — Keep them warm with a jacket or blanket. Stay right beside them until paramedics arrive.
3. What NEVER to Do:
   • NEVER leave an unconscious person alone to "sleep it off" (BAC continues to rise even after they pass out as alcohol in the stomach still absorbs).
   • NEVER put them in a cold shower (risk of shock and fatal falls).
   • NEVER force them to drink coffee or walk around."""
                )
            ]

            for title, desc, guide in support_hub_modules:
                mod = models.MILModule(title=title, description=desc)
                db.add(mod)
                db.commit()
                db.refresh(mod)
                article = models.ModuleContent(
                    module_id=mod.id,
                    content_type="reading",
                    title=f"Above the Influence Playbook: {title}",
                    content_text=guide
                )
                db.add(article)
                db.commit()

            # 3. Seed Peer Stories Forum (SafeSpaceExperience)
            experiences = [
                models.SafeSpaceExperience(
                    topic="How I Navigated Peer Pressure",
                    content="During Freshers' week at UZ, older students kept pushing shots of an unlabelled spirit at our hall party. I used the Decoy Cup strategy from Youth Connect+—kept a ginger beer with lime in my hand all night and offered to DJ. Had the best night out and woke up fresh for my 8 AM lecture!",
                    author_name="Kudzai M. (UZ)"
                ),
                models.SafeSpaceExperience(
                    topic="Overcoming Addiction",
                    content="I started drinking heavily in my second year to cope with financial pressure and exam anxiety. My grades tanked and I almost dropped out. Connecting with our campus peer support group and switching to evening football helped me hit 6 months sober this month.",
                    author_name="Anonymous Peer"
                ),
                models.SafeSpaceExperience(
                    topic="Hosting Sober Events",
                    content="Our Enactus chapter hosted an 'Above the Influence' Sundowner & Acoustic Night with zero-alcohol mocktails and live FIFA tournaments. Over 240 students showed up and signed Pledge 18!",
                    author_name="Tariro N. (NUST)"
                ),
                models.SafeSpaceExperience(
                    topic="Campus Stories",
                    content="At a weekend braai, a friend had 5 beers and tried to drive 3 km back to Senga. Three of us stepped in, took his keys kindly, and split a $3 ride home with him. He thanked us the next morning.",
                    author_name="Simba C. (MSU)"
                )
            ]
            db.add_all(experiences)
            db.commit()

            # 4. Seed Smart Campus & Health News Hub (Articles)
            now = datetime.datetime.utcnow()
            news_articles = [
                models.Article(
                    title="Delta Corporation & Boost Fellowship Launch Smart Drinking Innovation Challenge Across Campuses",
                    source="Enactus Updates",
                    category="Enactus Updates",
                    descriptive_topic="Campus Advocacy Spotlight",
                    summary="University teams nationwide unite under the 'Above the Influence' banner to pioneer digital behavioral-change tools, Pledge 18 drives, and responsible moderation education.",
                    full_content="Delta Corporation and The Boost Fellowship have partnered with university youth innovators to tackle underage drinking, binge drinking, illicit brews, and drinking and driving through scalable digital and peer-led solutions.",
                    url="https://boostfellowship.org",
                    published_date=now - datetime.timedelta(hours=2),
                    is_hot_pick=True
                ),
                models.Article(
                    title="WHO Global Status Report: Why Youth Harm-Reduction & Standard Drink Literacy Saves Lives",
                    source="Health News",
                    category="Health News",
                    descriptive_topic="National & WHO Research",
                    summary="New public health findings highlight that teaching young adults Blood Alcohol Concentration (BAC) pacing and identifying methanol-tainted illicit brews cuts alcohol emergencies by over 38%.",
                    full_content="World Health Organization data underscores the importance of targeted youth interventions focused on standard drink awareness, hydration pacing, and strict enforcement against unregulated alcohol.",
                    url="https://www.who.int/health-topics/alcohol",
                    published_date=now - datetime.timedelta(hours=6),
                    is_hot_pick=True
                ),
                models.Article(
                    title="Campus Advocacy Spotlight: Over 1,500 Students Sign 'Pledge 18' Against Underage Drinking",
                    source="Campus Innovation",
                    category="Campus Innovation",
                    descriptive_topic="Campus Advocacy Spotlight",
                    summary="Led by student ambassadors across UZ, NUST, MSU, and ZEGU, the Pledge 18 campaign is transforming Freshers' orientation week with alcohol-free sports and creative festivals.",
                    full_content="Student leaders are reshaping university social culture by creating welcoming, high-energy substance-free social spaces for first-year students.",
                    url="#campus-pledge-18",
                    published_date=now - datetime.timedelta(hours=12),
                    is_hot_pick=True
                ),
                models.Article(
                    title="Public Health Alert: Ministry & ZRP Warn Against Unlabelled 'Kambwa' and Illicit Spirits",
                    source="Health News",
                    category="Health News",
                    descriptive_topic="Policy & Law Updates",
                    summary="Law enforcement and toxicologists warn youth to avoid cheap unsealed plastic-bottle spirits following laboratory detections of toxic methanol and industrial ethanol.",
                    full_content="Community police liaisons urge students and community members to report illicit alcohol production and underage sales via confidential watchdog channels.",
                    url="#illicit-brews-alert",
                    published_date=now - datetime.timedelta(days=1)
                ),
                models.Article(
                    title="Policy & Law Update: Zimbabwe Liquor Act Compliance and Road Breathalyzer Operations Expanded",
                    source="Enactus Updates",
                    category="Enactus Updates",
                    descriptive_topic="Policy & Law Updates",
                    summary="Authorities step up weekend breathalyzer checkpoints around entertainment hubs and enforce strict penalties on outlets selling alcohol to persons under 18.",
                    full_content="The statutory BAC limit of 0.08% is being strictly enforced alongside liquor license audits to curb underage access and road traffic accidents.",
                    url="#liquor-act-update",
                    published_date=now - datetime.timedelta(days=2)
                ),
                models.Article(
                    title="Smart Hydration & Brain Performance: How Sleep Quality Impacts University Exam Results",
                    source="Campus Innovation",
                    category="Campus Innovation",
                    descriptive_topic="National & WHO Research",
                    summary="Neuroscience researchers explain why alcohol disrupts REM memory consolidation after studying and share smart non-alcoholic hydration alternatives for students.",
                    full_content="Replacing alcohol with electrolyte-rich hydration and maintaining uninterrupted REM sleep improves exam recall by up to 40%.",
                    url="#brain-hydration-study",
                    published_date=now - datetime.timedelta(days=3)
                )
            ]
            db.add_all(news_articles)
            db.commit()

            # 5. Seed Campus Voice & Community Radio Hub (Articles with category="Radio")
            radio_items = [
                models.Article(
                    title="Pledge 18 Student Panel: Navigating Freshers' Week & Peer Pressure",
                    source="Student Panels",
                    category="Radio",
                    descriptive_topic="Curated Podcast • Episode 1 (24 mins)",
                    summary="Honest panel discussion with student leaders from UZ, NUST, and MSU on declining drinks without losing friends and hosting lit sober campus events.",
                    url="https://open.spotify.com/#pledge18-panel-ep1",
                    published_date=now - datetime.timedelta(hours=3)
                ),
                models.Article(
                    title="Expert Q&A: Sergeant Muringwa & Medical Specialists on Illicit Brews & Road Safety",
                    source="Expert Q&As",
                    category="Radio",
                    descriptive_topic="Curated Podcast • Episode 2 (31 mins)",
                    summary="Law enforcement liaison Sergeant Muringwa and clinical toxicologists break down the dangers of 'kambwa', drink-driving laws, and community watchdog reporting.",
                    url="https://open.spotify.com/#expert-qa-ep2",
                    published_date=now - datetime.timedelta(hours=8)
                ),
                models.Article(
                    title="StarFM Youth Desk: Above the Influence Live Call-In Show",
                    source="StarFM",
                    category="Radio",
                    descriptive_topic="Live Stream • Thursdays 19:00 CAT",
                    summary="Tune in to StarFM as Smart Drinking Ambassadors debate campus lifestyle trends, mental health coping strategies, and responsible celebration.",
                    url="https://starfm.co.zw",
                    published_date=now - datetime.timedelta(hours=14)
                ),
                models.Article(
                    title="ZiFM Stereo: Campus Takeover – Smart Choices & Music Mix",
                    source="ZiFM",
                    category="Radio",
                    descriptive_topic="Live Stream • Fridays 18:00 CAT",
                    summary="Weekend pre-game safety tips, designated driver shoutouts, and Zimbabwe's biggest youth radio mixes on ZiFM Stereo.",
                    url="https://zifmstereo.co.zw",
                    published_date=now - datetime.timedelta(days=1)
                ),
                models.Article(
                    title="Capitalk 100.4FM: Harare Youth Wellness, Nutrition & FASD Awareness",
                    source="Capitalk",
                    category="Radio",
                    descriptive_topic="Live Stream • Tuesdays 17:30 CAT",
                    summary="Deep-dive conversations with public health advocates on Fetal Alcohol Spectrum Disorders (FASD), sugary beverage moderation, and youth wellness.",
                    url="https://capitalkfm.co.zw",
                    published_date=now - datetime.timedelta(days=2)
                )
            ]
            db.add_all(radio_items)
            db.commit()

            # 6. Seed Legacy ImageChallenges (kept for backward compatibility if called)
            challenges = [
                models.ImageChallenge(
                    category="Illicit vs. Regulated Beverage Label Check",
                    image_url="https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=600&auto=format&fit=crop&q=80",
                    is_real=False,
                    explanation="Unlabelled or broken-seal bottles sold outside licensed outlets pose lethal methanol poisoning risks."
                )
            ]
            db.add_all(challenges)
            db.commit()

            # 7. Seed Smart Drinking Opportunities
            opps = [
                models.Opportunity(
                    title="Smart Drinking & Moderation Innovation Challenge Grant 2026",
                    source="Delta Corporation & Boost Fellowship",
                    url="https://boostfellowship.org",
                    description="Seed funding, mentorship, and national recognition for university Enactus teams building scalable smart drinking and harm-reduction initiatives."
                ),
                models.Opportunity(
                    title="Youth Connect+ 'Smart Drinking Ambassador' Campus Fellowship",
                    source="Youth Connect+ / Enactus",
                    url="#ambassador-fellowship",
                    description="Complete all 6 Smart Living Academy modules to earn your verified Digital Ambassador Badge and lead Pledge 18 chapters on your campus."
                ),
                models.Opportunity(
                    title="WHO African Region Youth Health & Wellness Changemakers",
                    source="World Health Organization",
                    url="https://www.afro.who.int/",
                    description="Youth leadership training and micro-grants for non-communicable disease (NCD) prevention and substance harm-reduction advocacy."
                ),
                models.Opportunity(
                    title="Enactus Zimbabwe National Exposition & Innovation Pitch",
                    source="Enactus Zimbabwe",
                    url="https://enactus.org",
                    description="Showcase your campus social impact metrics, community watchdog outreach, and behavior-change results before corporate judges."
                )
            ]
            db.add_all(opps)
            db.commit()

        # Ensure Scenario Cards are seeded
        if db.query(models.ScenarioCard).count() == 0:
            scenarios = [
                models.ScenarioCard(
                    category="Drinking & Driving Prevention",
                    scenario_text="A friend has had 4 beers in an hour at a campus braai and insists on driving 2 km back to the halls of residence, saying: 'It's just down the road, I know every pothole.' What do you do?",
                    image_url="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=600&auto=format&fit=crop&q=80",
                    option_a="Let them drive slowly with hazard lights on since it's only 2 km.",
                    option_b="Firmly team up with friends to take the keys, order a $3 ride-share together, and pick up the car tomorrow morning.",
                    option_c="Give them a cup of strong black coffee and wait 15 minutes before letting them drive.",
                    best_option="B",
                    consensus_stats="89% of Smart Drinking Ambassadors chose Option B",
                    expert_tip="4 standard drinks in 1 hour pushes BAC near or above 0.08%, cutting emergency braking reaction time by over 30%. Most campus road accidents happen within 3 km of the venue! Coffee only masks drowsiness—only liver metabolism (1 drink/hour) lowers BAC."
                ),
                models.ScenarioCard(
                    category="Illicit Brews & Party Safety",
                    scenario_text="At an off-campus house party, someone passes around an unlabelled plastic bottle of cheap 'high-potency' spirit mixed with energy drink. Everyone in your circle is taking a shot. How do you respond?",
                    image_url="https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80",
                    option_a="Take a small sip so you don't look awkward in front of the group.",
                    option_b="Decline confidently ('I'm sticking to my sealed drink tonight'), warn your close friend quietly, and log the illicit supplier on the Watchdog tab.",
                    option_c="Mix it with extra water so the chemicals are diluted.",
                    best_option="B",
                    consensus_stats="92% of Smart Drinking Ambassadors chose Option B",
                    expert_tip="Unlabelled illicit brews ('kambwa'/'musombodhiya') frequently contain toxic methanol. Diluting methanol with water does NOT make it safe—as little as 10ml can cause permanent blindness. Holding your own sealed beverage makes declining effortless."
                ),
                models.ScenarioCard(
                    category="Overdose & Alcohol Poisoning Emergency",
                    scenario_text="Your roommate returns from a night out, vomits while half-asleep, has cold clammy skin, and is breathing very slowly (under 8 breaths/min). Friends say: 'Put him in a cold shower or let him sleep it off.' What is your move?",
                    image_url="https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?w=600&auto=format&fit=crop&q=80",
                    option_a="Roll them onto their side in the Recovery Position, keep them warm, and call Campus Clinic / Ambulance (999/994) immediately.",
                    option_b="Put them under a cold shower to wake them up quickly.",
                    option_c="Leave them on their back in bed with a bucket next to them to sleep it off.",
                    best_option="A",
                    consensus_stats="95% of Smart Drinking Ambassadors chose Option A",
                    expert_tip="These are classic C.U.P.S. signs of life-threatening Alcohol Poisoning. Leaving someone on their back risks fatal choking on vomit, and a cold shower can trigger hypothermia shock. Always use the side Recovery Position and call medical help immediately."
                ),
                models.ScenarioCard(
                    category="Underage Drinking & Pledge 18",
                    scenario_text="Your 16-year-old cousin in high school visits you on campus for a sports weekend and asks you to buy them a 6-pack of ciders from the bottle store since you have an 18+ ID. What do you do?",
                    image_url="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop&q=80",
                    option_a="Buy it for them as long as they promise to drink it inside your room.",
                    option_b="Refuse clearly, grab non-alcoholic malt/soft drinks and snacks instead, and explain the Pledge 18 boundary.",
                    option_c="Buy them light beer instead of ciders.",
                    best_option="B",
                    consensus_stats="91% of Smart Drinking Ambassadors chose Option B",
                    expert_tip="Supplying alcohol to minors violates Zimbabwe's Liquor Act and harms developing adolescent brains. Leading 'Above the Influence' means protecting younger peers and siblings while still showing them a great time on campus."
                )
            ]
            db.add_all(scenarios)
            db.commit()

        # Ensure Watchdog Reports are seeded
        if db.query(models.WatchdogReport).count() == 0:
            reports = [
                models.WatchdogReport(
                    campus_or_area="Mt Pleasant / Campus Perimeter",
                    incident_type="Illicit / Unregulated Brew Distribution",
                    description="Unlabelled 200ml plastic sachets of high-strength illicit spirits being sold from a parked vehicle near student walk-through gate after 8 PM.",
                    status="Verified & Forwarded to Campus Security & ZRP Liaison"
                ),
                models.WatchdogReport(
                    campus_or_area="Senga / Student Residential Zone",
                    incident_type="Underage Alcohol Sales",
                    description="Bottle store selling alcoholic ciders to high school students in uniform without requesting age verification.",
                    status="Logged with Liquor Licensing & Community Watchdog"
                )
            ]
            db.add_all(reports)
            db.commit()

        # Ensure Inter-University Leaderboard is seeded
        if db.query(models.UniversityLeaderboard).count() == 0:
            universities = [
                models.UniversityLeaderboard(university_name="University of Zimbabwe", short_code="UZ", ambassadors_count=142, points=3850, pledge_18_signed=410),
                models.UniversityLeaderboard(university_name="National University of Science & Technology", short_code="NUST", ambassadors_count=128, points=3620, pledge_18_signed=385),
                models.UniversityLeaderboard(university_name="Midlands State University", short_code="MSU", ambassadors_count=135, points=3490, pledge_18_signed=390),
                models.UniversityLeaderboard(university_name="Chinhoyi University of Technology", short_code="CUT", ambassadors_count=96, points=2840, pledge_18_signed=275),
                models.UniversityLeaderboard(university_name="Zimbabwe Ezekiel Guti University", short_code="ZEGU", ambassadors_count=88, points=2710, pledge_18_signed=260),
                models.UniversityLeaderboard(university_name="Harare Institute of Technology", short_code="HIT", ambassadors_count=82, points=2590, pledge_18_signed=230),
                models.UniversityLeaderboard(university_name="Bindura University of Science Education", short_code="BUSE", ambassadors_count=74, points=2310, pledge_18_signed=210),
                models.UniversityLeaderboard(university_name="Africa University", short_code="AU", ambassadors_count=69, points=2180, pledge_18_signed=195),
            ]
            db.add_all(universities)
            db.commit()

        # Ensure Campus Events are seeded
        if db.query(models.CampusEvent).count() == 0:
            sample_events = [
                models.CampusEvent(
                    title="Delta Smart Drinking 10km Campus Marathon & Wellness Expo",
                    organizer="Delta Corporation & Enactus UZ",
                    category="Marathons & Sports",
                    date_str="Saturday, Nov 28, 2026 • 06:30 AM",
                    location="UZ Sports Grounds, Mt Pleasant, Harare",
                    description="Run for a clear mind! 10km and 5km road race promoting student fitness, moderation, and substance harm-reduction. Medals, electrolyte hydration stations, and official Smart Drinking Ambassador kits for all finishers.",
                    banner_url="https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=700&auto=format&fit=crop&q=80",
                    rsvp_count=342
                ),
                models.CampusEvent(
                    title="National 'Pledge 18' Campus Relay & Awareness Walk",
                    organizer="Youth Connect+ & Boost Fellowship",
                    category="Campaigns & Pledges",
                    date_str="Friday, Dec 04, 2026 • 09:00 AM",
                    location="From Harare City Hall to University Way",
                    description="Join university ambassadors marching against underage drinking, illicit brews ('kambwa'), and drinking and driving. Sign the Pledge 18 giant campus banner and participate in peer advocacy drives.",
                    banner_url="https://images.unsplash.com/photo-1511578314322-379afb476865?w=700&auto=format&fit=crop&q=80",
                    rsvp_count=418
                ),
                models.CampusEvent(
                    title="Enactus Zero-Alcohol Mocktail & Live FIFA Esports Fest",
                    organizer="Enactus Midlands State University (MSU)",
                    category="Sober Festivals & Arts",
                    date_str="Saturday, Dec 12, 2026 • 02:00 PM - 09:00 PM",
                    location="MSU Student Union Plaza, Gweru",
                    description="Redefining campus nightlife! High-energy gaming tournaments, live acoustic music, poetry slams, and an artisan mocktail tasting bar proving unforgettable nights don't need alcohol.",
                    banner_url="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=700&auto=format&fit=crop&q=80",
                    rsvp_count=285
                ),
                models.CampusEvent(
                    title="Harare Youth 5km 'Run for Sobriety' Morning Fun Run",
                    organizer="Rotaract & Zimbabwe Youth Wellness Alliance",
                    category="Marathons & Sports",
                    date_str="Sunday, Dec 06, 2026 • 07:00 AM",
                    location="Old Hararians Sports Club, Harare",
                    description="A scenic 5km community fun run and walk open to all students, faculty, and youth. T-shirts and fruit breakfast provided to all registered runners.",
                    banner_url="https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=700&auto=format&fit=crop&q=80",
                    rsvp_count=194
                ),
                models.CampusEvent(
                    title="Smart Drinking Peer Ambassador Training & De-escalation Workshop",
                    organizer="Boost Fellowship & Dean of Students",
                    category="Workshops",
                    date_str="Wednesday, Nov 25, 2026 • 04:00 PM",
                    location="NUST Innovation Hub / Hybrid Zoom",
                    description="Interactive practical certification workshop covering C.U.P.S. alcohol poisoning first response, de-escalating drunk peer drivers, and confidential watchdog reporting protocols.",
                    banner_url="https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=700&auto=format&fit=crop&q=80",
                    rsvp_count=160
                )
            ]
            db.add_all(sample_events)
            db.commit()

        # Ensure Default Testing Ambassador Accounts are seeded
        default_accounts = [
            ("ambassador", "ambassador@deltas.org.zw", "Deltas2026!", "UZ", 88, 84, 92, 86),
            ("coordinator", "coordinator@nust.ac.zw", "Deltas2026!", "NUST", 94, 90, 95, 92),
        ]
        for uname, uemail, upwd, uuni, s1, s2, s3, s4 in default_accounts:
            existing_u = db.query(models.User).filter(models.User.username == uname).first()
            if not existing_u:
                new_u = models.User(
                    username=uname,
                    email=uemail,
                    password_hash=upwd,
                    university=uuni
                )
                db.add(new_u)
                db.commit()
                db.refresh(new_u)
                db.add(models.MILScore(
                    user_id=new_u.id,
                    info_verification=s1,
                    ai_awareness=s2,
                    digital_safety=s3,
                    source_evaluation=s4
                ))
                db.commit()

    except Exception as e:
        print(f"Auto-seed error: {e}")
        db.rollback()

@app.on_event("startup")
def on_startup():
    try:
        db = SessionLocal()
        try:
            ensure_data_seeded(db)
        finally:
            db.close()
    except Exception as e:
        print(f"Startup auto-seed error (non-fatal): {e}")


# ─── NEWS ENDPOINTS ────────────────────────────────────────────────────────────

@app.get("/news/today", response_model=List[ArticleSchema])
def get_todays_news(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    articles = db.query(models.Article).filter(
        models.Article.category != "Radio"
    ).order_by(models.Article.published_date.desc()).all()
    return articles

@app.get("/news/{newspaper}", response_model=List[ArticleSchema])
def get_newspaper_news(newspaper: str, date: Optional[str] = None, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    base_query = db.query(models.Article).filter(models.Article.category != "Radio")
    if newspaper.lower() == "all":
        query = base_query
    else:
        query = base_query.filter(
            (models.Article.source.ilike(f"%{newspaper}%")) |
            (models.Article.category.ilike(f"%{newspaper}%")) |
            (models.Article.descriptive_topic.ilike(f"%{newspaper}%"))
        )
    return query.order_by(models.Article.published_date.desc()).all()

@app.get("/news/{newspaper}/search")
def search_newspaper(newspaper: str, query: str, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    base_query = db.query(models.Article).filter(models.Article.category != "Radio")
    if newspaper.lower() == "all":
        db_articles = base_query.filter(
            (models.Article.title.ilike(f"%{query}%")) |
            (models.Article.summary.ilike(f"%{query}%"))
        ).all()
    else:
        db_articles = base_query.filter(
            models.Article.source.ilike(f"%{newspaper}%"),
            (models.Article.title.ilike(f"%{query}%")) |
            (models.Article.summary.ilike(f"%{query}%"))
        ).all()
    return {"target_date": db_articles, "other_dates": []}


# ─── RECOMMENDATION & RECENTS ENDPOINTS ────────────────────────────────────────

@app.get("/recommended", response_model=List[ArticleSchema])
def get_recommendations(user_id: int = 1, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    articles = db.query(models.Article).filter(models.Article.is_hot_pick == True).limit(5).all()
    if not articles:
        articles = db.query(models.Article).order_by(models.Article.published_date.desc()).limit(5).all()
    return articles

@app.get("/recents", response_model=List[ArticleSchema])
def get_recents(user_id: int = 1, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    return db.query(models.Article).order_by(models.Article.published_date.desc()).limit(5).all()


# ─── RADIO & PODCAST ENDPOINTS ─────────────────────────────────────────────────

@app.get("/radio/{station}", response_model=List[ArticleSchema])
def get_radio_programs(station: str, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    query = db.query(models.Article).filter(models.Article.category == "Radio")
    if station.lower() != "all":
        query = query.filter(
            (models.Article.source.ilike(f"%{station}%")) |
            (models.Article.title.ilike(f"%{station}%")) |
            (models.Article.descriptive_topic.ilike(f"%{station}%"))
        )
    return query.order_by(models.Article.published_date.desc()).all()

@app.get("/radio/{station}/search")
def search_radio(station: str, query: str, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    db_articles = db.query(models.Article).filter(
        models.Article.category == "Radio",
        (models.Article.title.ilike(f"%{query}%")) |
        (models.Article.summary.ilike(f"%{query}%"))
    ).all()
    return db_articles


# ─── DISCOVER & HOT PICKS ENDPOINTS ────────────────────────────────────────────

@app.get("/discover")
def get_discovery_topics(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    return db.query(models.Article).order_by(models.Article.published_date.desc()).all()

@app.get("/discover/categories")
def get_discovery_categories(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
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
    ensure_data_seeded(db)
    results = db.query(models.Article).filter(
        (models.Article.title.ilike(f"%{query}%")) |
        (models.Article.summary.ilike(f"%{query}%")) |
        (models.Article.descriptive_topic.ilike(f"%{query}%"))
    ).all()
    if results:
        return {"source": "database", "results": results}
    return {
        "source": "ai",
        "results": [
            f"{query} Smart Drinking Guidelines",
            f"Zimbabwe Campus {query} Initiative",
            f"WHO Report on {query}",
            f"Pledge 18 & {query}"
        ]
    }

@app.get("/discover/topic/{article_id}")
def get_discovery_topic(article_id: int, db: Session = Depends(get_db)):
    article = db.query(models.Article).filter(models.Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return {
        "id": article.id,
        "title": article.title,
        "deep_overview": article.deep_overview or article.summary or "Overview available.",
        "deep_facts": article.deep_facts or "[]",
        "deep_verdict": article.deep_verdict or "Verified by Youth Connect+.",
        "image_url": article.image_url,
        "source": article.source,
        "url": article.url,
        "category": article.category,
    }

@app.get("/hot_picks/mixed")
def get_hot_picks_mixed(user_id: int = 1, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    news_articles = db.query(models.Article).order_by(models.Article.published_date.desc()).limit(6).all()
    results = []
    for i, a in enumerate(news_articles):
        results.append({
            "id": a.id,
            "title": a.title,
            "source": a.source,
            "summary": a.summary,
            "image_url": a.image_url,
            "url": a.url,
            "category": a.category,
            "content_type": "news" if i % 3 != 2 else "discovery"
        })
    return results


# ─── OPPORTUNITIES ENDPOINT ────────────────────────────────────────────────────

@app.get("/opportunities", response_model=List[OpportunitySchema])
def get_opportunities(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    opps = db.query(models.Opportunity).all()
    admin_opps = db.query(models.Article).filter(models.Article.category == "Opportunities").all()
    for a in admin_opps:
        opps.insert(0, models.Opportunity(
            id=a.id + 100000,
            title=a.title,
            source=a.source,
            url=a.url,
            description=a.summary or a.full_content,
            criteria="Admin update"
        ))
    return opps


# ─── ADMIN & ROOT ENDPOINTS ────────────────────────────────────────────────────

@app.get("/")
def root():
    if os.path.exists("frontend/index.html"):
        return FileResponse("frontend/index.html")
    return {"message": "Youth Connect+: Above the Influence API is running."}

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
    background_tasks.add_task(run_rss_aggregator)
    return {"message": "RSS Aggregation started in background"}

class AdminPostCreate(BaseModel):
    title: str
    content: str
    section: Optional[str] = "general"
    image_url: Optional[str] = None
    is_hot_pick: Optional[bool] = False

@app.post("/admin/post", response_model=ArticleSchema)
def create_admin_post(post: AdminPostCreate, db: Session = Depends(get_db)):
    section_to_category = {
        "news": "Health News",
        "radio": "Radio",
        "opportunities": "Opportunities",
        "hotpicks": "Campus Innovation",
        "discovery": "Enactus Updates",
        "general": "Campus Innovation",
        "connect": "Community",
    }
    category = section_to_category.get(post.section.lower(), "Campus Innovation")
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
    return db.query(models.Article).filter(
        models.Article.source == ADMIN_SOURCE
    ).order_by(models.Article.published_date.desc()).all()

@app.delete("/admin/posts/{post_id}")
def delete_admin_post(post_id: int, db: Session = Depends(get_db)):
    post = db.query(models.Article).filter(
        models.Article.id == post_id,
        models.Article.source == ADMIN_SOURCE
    ).first()
    if not post:
        raise HTTPException(status_code=404, detail="Admin post not found")
    db.delete(post)
    db.commit()
    return {"message": "Post deleted successfully"}


# ─── AUTH & SMART LIFESTYLE SCORE ENDPOINTS ────────────────────────────────────

@app.post("/auth/login")
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    username_clean = user_data.email.split("@")[0] if "@" in user_data.email else user_data.email
    user = db.query(models.User).filter(models.User.username == username_clean).first()
    if not user:
        user = models.User(
            username=username_clean,
            email=user_data.email,
            password_hash="hash",
            university=user_data.university or "University of Zimbabwe (UZ)"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        mil = models.MILScore(
            user_id=user.id,
            info_verification=76,
            ai_awareness=72,
            digital_safety=84,
            source_evaluation=78
        )
        db.add(mil)
        db.commit()
    return {
        "message": "Login successful",
        "user_id": user.id,
        "username": user.username,
        "university": getattr(user, "university", "University of Zimbabwe (UZ)")
    }

@app.get("/mil/score/{user_id}", response_model=MILScoreSchema)
def get_mil_score(user_id: int, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    score = db.query(models.MILScore).filter(models.MILScore.user_id == user_id).first()
    if not score:
        score = models.MILScore(
            user_id=user_id,
            info_verification=76,
            ai_awareness=72,
            digital_safety=84,
            source_evaluation=78
        )
        db.add(score)
        db.commit()
        db.refresh(score)
    return score


# ─── BESMART: MYTH VS. FACT CHECKER ENDPOINT ───────────────────────────────────

@app.post("/safespace/verify", response_model=VerifyResponse)
def verify_content(request: VerifyRequest, db: Session = Depends(get_db)):
    text_claim = request.content.strip()
    lower = text_claim.lower()

    # Check common alcohol & health myths first for instant, rock-solid scientific responses
    if any(k in lower for k in ["coffee", "cold shower", "fresh air", "sober up", "hangover"]):
        return VerifyResponse(
            verdict="FALSE",
            publisher="Widespread Campus Drinking Myth",
            original_source="Physiological Fact: Only your liver can metabolize alcohol (via Alcohol Dehydrogenase enzymes) at a fixed rate of roughly 1 standard drink per hour.",
            credible_sources="WHO & Clinical Toxicology Guidelines confirm that caffeine only creates a 'wide-awake drunk' state without lowering Blood Alcohol Concentration (BAC), and cold showers can induce dangerous hypothermia shock in intoxicated persons.",
            recommendation="Give it time, hydrate with water and electrolytes, and never allow someone who drank heavily to drive just because they had coffee."
        )
    elif any(k in lower for k in ["energy drink", "red bull", "dragon", "stamina", "neutralize", "crash"]):
        return VerifyResponse(
            verdict="DANGEROUS",
            publisher="High-Risk Party Mixing Myth",
            original_source="Pharmacological Reality: Mixing stimulants (high-dose caffeine) with a central nervous system depressant (alcohol) masks your brain's natural sedation warning signals.",
            credible_sources="Centers for Disease Control (CDC) & Cardiovascular Health Studies show mixing energy drinks with alcohol triples the risk of binge drinking, severe dehydration, heart palpitations, and risky driving decisions.",
            recommendation="Avoid mixing alcohol with energy drinks or unlabelled stimulants. Alternate drinks with plain water or soda water instead."
        )
    elif any(k in lower for k in ["kambwa", "musombodhiya", "illicit", "plastic", "sachet", "homemade", "methyl", "methanol"]):
        return VerifyResponse(
            verdict="DANGEROUS",
            publisher="Lethal Street / Unregulated Brew Claim",
            original_source="Toxicological Alert: Unregulated illicit brews lack distillation temperature controls and frequently contain lethal Methanol (wood alcohol) or industrial solvents.",
            credible_sources="Ministry of Health & Child Care and WHO advisories warn that as little as 10ml of methanol destroys the optic nerve (causing blindness) and 30ml is fatal.",
            recommendation="Never consume unsealed, unlabelled, or illicitly brewed alcohol. Report suppliers anonymously using the Community Watchdog tool."
        )
    elif any(k in lower for k in ["pregnant", "pregnancy", "trimester", "baby", "fasd", "breastfeed"]):
        return VerifyResponse(
            verdict="DANGEROUS",
            publisher="Maternal Health Misconception",
            original_source="Embryological Fact: Alcohol crosses the placenta freely, and a developing fetus lacks the liver enzymes to break it down.",
            credible_sources="WHO & Pediatric Medical Associations state unequivocally that there is NO safe amount, NO safe type of alcohol, and NO safe trimester during pregnancy due to Fetal Alcohol Spectrum Disorders (FASD).",
            recommendation="Choose 100% alcohol-free beverages throughout pregnancy and when trying to conceive."
        )
    elif any(k in lower for k in ["beer before liquor", "mixing drinks", "grape or grain", "type of alcohol"]):
        return VerifyResponse(
            verdict="FALSE",
            publisher="Traditional Drinking Folk Myth",
            original_source="Biochemical Fact: Intoxication and hangover severity depend on total ethanol grams consumed and how fast your BAC rises—not the order of beverages.",
            credible_sources="Medical studies show that switching to spirits later in the night only causes worse outcomes because people consume higher ABV shots much faster when already disinhibited.",
            recommendation="Track your total Standard Drinks (1 beer = 1 glass wine = 1 shot spirit) and pace yourself with water."
        )
    elif any(k in lower for k in ["sleep", "exam", "study", "nightcap", "nerves", "relax"]):
        return VerifyResponse(
            verdict="FALSE",
            publisher="Academic Stress / Sleep Myth",
            original_source="Neuroscience Fact: While alcohol is a sedative that may make you fall asleep faster, it blocks Rapid Eye Movement (REM) sleep and causes second-half night awakenings.",
            credible_sources="University sleep laboratories confirm that drinking after studying reduces next-day memory consolidation and recall by up to 40%.",
            recommendation="Protect your REM sleep during semester and exam weeks—use exercise, herbal tea, or structured breaks to unwind."
        )
    elif any(k in lower for k in ["eat", "food", "stomach", "water", "alternate", "hydrate"]):
        return VerifyResponse(
            verdict="TRUE",
            publisher="Verified Harm-Reduction Practice",
            original_source="Physiological Fact: Food in the stomach closes the pyloric valve, slowing the rate at which alcohol enters the small intestine and bloodstream.",
            credible_sources="Smart Drinking & Moderation guidelines confirm that eating a full meal beforehand and alternating every alcoholic drink with water prevents sudden BAC spikes.",
            recommendation="Keep practicing this! Always eat before social events and maintain the 1-for-1 water pacing rule."
        )

    # Try AI service if configured
    try:
        if hasattr(ai_service, 'client') and ai_service.client:
            prompt = f"""Analyze this alcohol, health, or campus lifestyle claim/myth: '{text_claim}'
Respond in strict JSON format:
{{"verdict": "TRUE or FALSE or DANGEROUS", "publisher": "Type of myth/claim", "original_source": "Scientific/Biological reality", "credible_sources": "What WHO and medical experts say", "recommendation": "Smart Drinking actionable advice"}}"""
            res_json = ai_service._call_api(prompt, json_mode=True)
            res_json = res_json.replace('```json', '').replace('```', '').strip()
            data = json.loads(res_json)
            return VerifyResponse(
                verdict=data.get("verdict", "FALSE").upper(),
                publisher=data.get("publisher", "Campus Social Claim"),
                original_source=data.get("original_source", "Biological metabolism depends on total ethanol volume and liver clearance rate."),
                credible_sources=data.get("credible_sources", "WHO & Ministry of Health recommend strict adherence to standard drink limits."),
                recommendation=data.get("recommendation", "Pace with water, verify beverage seals, and never drink and drive.")
            )
    except Exception as e:
        print(f"Verify AI processing error: {e}")

    return VerifyResponse(
        verdict="FALSE / UNVERIFIED",
        publisher="Unverified Campus Myth / Social Rumor",
        original_source="Scientific Reality: The human liver metabolizes approximately 1 standard drink (10–14g pure alcohol) per hour regardless of folk remedies.",
        credible_sources="World Health Organization (WHO) and Smart Drinking guidelines emphasize eating before drinking, pacing with water, and avoiding unregulated brews.",
        recommendation="Do not rely on unverified party myths. Check our 6 Smart Living Academy modules for evidence-based health facts."
    )


# ─── BESMART: SMART SCENARIO SIMULATOR ENDPOINTS ───────────────────────────────

@app.get("/besmart/scenarios", response_model=List[ScenarioCardSchema])
def get_scenarios(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    return db.query(models.ScenarioCard).all()

@app.post("/besmart/scenarios/{scenario_id}/answer")
def answer_scenario(scenario_id: int, req: ScenarioAnswerRequest, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    scenario = db.query(models.ScenarioCard).filter(models.ScenarioCard.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    is_safest = req.selected_option.upper() == scenario.best_option.upper()

    # Reward user's Smart Lifestyle Score
    score = db.query(models.MILScore).filter(models.MILScore.user_id == req.user_id).first()
    if score:
        if is_safest:
            score.ai_awareness = min(100, score.ai_awareness + 4)
            score.digital_safety = min(100, score.digital_safety + 3)
            score.source_evaluation = min(100, score.source_evaluation + 3)
            db.commit()

    return {
        "correct": is_safest,
        "best_option": scenario.best_option,
        "consensus_stats": scenario.consensus_stats,
        "expert_tip": scenario.expert_tip,
        "message": "✓ Smart & Safe Choice! (+10 Moderation Points)" if is_safest else f"Warning: High-Risk Choice. The safest action is Option {scenario.best_option}."
    }

# Legacy endpoints kept so nothing breaks
@app.get("/besure/challenges", response_model=List[ImageChallengeSchema])
def get_challenges(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    return db.query(models.ImageChallenge).all()

@app.post("/besure/challenges/{id}/answer")
def answer_challenge(id: int, answer: ChallengeAnswer, db: Session = Depends(get_db)):
    challenge = db.query(models.ImageChallenge).filter(models.ImageChallenge.id == id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    is_correct = (answer.is_real == challenge.is_real)
    return {
        "correct": is_correct,
        "message": "Correct!" if is_correct else "Incorrect.",
        "ai_feedback": challenge.explanation
    }


# ─── BESMART: INTER-UNIVERSITY LEADERBOARD & PLEDGE 18 ─────────────────────────

@app.get("/besmart/leaderboard", response_model=List[UniversityLeaderboardSchema])
def get_leaderboard(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    return db.query(models.UniversityLeaderboard).order_by(models.UniversityLeaderboard.points.desc()).all()

@app.post("/besmart/pledge")
def submit_pledge_or_quiz_points(req: PledgeRequest, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    uni = db.query(models.UniversityLeaderboard).filter(
        models.UniversityLeaderboard.short_code.ilike(req.university_code)
    ).first()
    if not uni:
        uni = db.query(models.UniversityLeaderboard).first()
    if uni:
        uni.points += req.points_earned
        uni.pledge_18_signed += 1
        uni.ambassadors_count += 1
        db.commit()
        db.refresh(uni)
    score = db.query(models.MILScore).filter(models.MILScore.user_id == (req.user_id or 1)).first()
    if score:
        score.info_verification = min(100, score.info_verification + 5)
        score.source_evaluation = min(100, score.source_evaluation + 5)
        db.commit()
    return {
        "message": f"Awesome! +{req.points_earned} points added to {uni.university_name if uni else 'your university'}!",
        "university": uni.university_name if uni else "University Chapter",
        "new_points": uni.points if uni else 0
    }


# ─── COMMUNITY SUPPORT HUB: PEER STORIES & WATCHDOG ────────────────────────────

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
        author_name=exp.author_name or "Anonymous Peer",
        likes_count=1
    )
    db.add(new_exp)
    db.commit()
    db.refresh(new_exp)
    return new_exp

@app.post("/safespace/experiences/{exp_id}/like")
def like_safespace_experience(exp_id: int, user_id: int = 1, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    exp = db.query(models.SafeSpaceExperience).filter(models.SafeSpaceExperience.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experience not found")
    if getattr(exp, "likes_count", None) is None:
        exp.likes_count = 5
    exp.likes_count += 1
    db.commit()
    db.refresh(exp)
    return {
        "message": "Liked!",
        "new_likes_count": exp.likes_count
    }


@app.get("/watchdog/reports", response_model=List[WatchdogReportSchema])
def get_watchdog_reports(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    return db.query(models.WatchdogReport).order_by(models.WatchdogReport.created_at.desc()).all()

@app.post("/watchdog/reports", response_model=WatchdogReportSchema)
def create_watchdog_report(report: WatchdogReportCreate, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    new_report = models.WatchdogReport(
        campus_or_area=report.campus_or_area,
        incident_type=report.incident_type,
        description=report.description,
        status="Confidential Alert Logged • Forwarded to Campus Security & ZRP Liaison"
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    return new_report


# ─── CAMPUS & COMMUNITY EVENTS ENDPOINTS ──────────────────────────────────────

@app.get("/events", response_model=List[CampusEventSchema])
def get_campus_events(category: Optional[str] = None, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    query = db.query(models.CampusEvent)
    if category and category.lower() != "all":
        query = query.filter(models.CampusEvent.category.ilike(f"%{category}%"))
    return query.order_by(models.CampusEvent.id.asc()).all()

@app.post("/events", response_model=CampusEventSchema)
def create_campus_event(event: CampusEventCreate, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    new_event = models.CampusEvent(
        title=event.title,
        organizer=event.organizer,
        category=event.category or "Campaigns & Pledges",
        date_str=event.date_str,
        location=event.location,
        description=event.description,
        banner_url=event.banner_url or "https://images.unsplash.com/photo-1511578314322-379afb476865?w=700&auto=format&fit=crop&q=80",
        rsvp_count=1
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event

@app.post("/events/{event_id}/rsvp")
def rsvp_campus_event(event_id: int, user_id: int = 1, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    event = db.query(models.CampusEvent).filter(models.CampusEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event.rsvp_count += 1
    
    # Also reward user with Smart Lifestyle / University points
    score = db.query(models.MILScore).filter(models.MILScore.user_id == user_id).first()
    if score:
        score.digital_safety = min(100, score.digital_safety + 2)
        score.source_evaluation = min(100, score.source_evaluation + 2)
    
    db.commit()
    db.refresh(event)
    return {
        "message": f"You're registered for {event.title}! (+15 Ambassador Points)",
        "new_rsvp_count": event.rsvp_count
    }


# ─── MODULES ENDPOINTS ─────────────────────────────────────────────────────────

@app.get("/modules", response_model=List[MILModuleSchema])
def get_mil_modules(db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    modules = db.query(models.MILModule).all()
    result = []
    for m in modules:
        contents = db.query(models.ModuleContent).filter(models.ModuleContent.module_id == m.id).all()
        result.append({
            "id": m.id,
            "title": m.title,
            "description": m.description,
            "contents": contents
        })
    return result

@app.get("/modules/{id}/content", response_model=List[ModuleContentSchema])
def get_module_content(id: int, db: Session = Depends(get_db)):
    ensure_data_seeded(db)
    return db.query(models.ModuleContent).filter(models.ModuleContent.module_id == id).all()

# Mount site root for direct browser access
if os.path.exists("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="site_root")
