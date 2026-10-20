import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, engine
import models
import datetime

# Ensure all tables exist
models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

# 1. Seed HOME Tab MIL Modules (9 modules)
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
    mod = db.query(models.MILModule).filter(models.MILModule.title == title).first()
    if not mod:
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

# 2. Seed Y.D.V.I SAFE SPACE Modules (10 threat topics)
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
    mod = db.query(models.MILModule).filter(models.MILModule.title == title).first()
    if not mod:
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

# 3. Seed Sample Image Challenges (Real or Manipulated)
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

# 4. Seed Sample Peer Safe Space Experiences
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

db.close()
print("Website DB Seed V2 Complete with Modules, Challenges, and Peer Stories!")
