import feedparser
import requests
from bs4 import BeautifulSoup
import datetime
import models
from database import SessionLocal
from ai_service import AIService

RSS_FEEDS = [
    {"source": "The Zimbabwean", "url": "https://www.thezimbabwean.co/feed/"},
]

def fetch_og_image(url: str) -> str:
    try:
        headers = {'User-Agent': 'Tunedin-News-Bot/1.0'}
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            og_img = soup.find('meta', property='og:image')
            if og_img and og_img.get('content'):
                return og_img['content']
    except Exception as e:
        print(f"Error fetching og:image for {url}: {e}")
    return "https://via.placeholder.com/300x200.png?text=News"

def run_rss_aggregator():
    db = SessionLocal()
    ai = AIService()
    print("Starting RSS Aggregation...")
    
    for feed in RSS_FEEDS:
        print(f"Parsing feed: {feed['url']}")
        try:
            parsed = feedparser.parse(feed['url'])
            for entry in parsed.entries[:10]: # Process top 10 articles per feed
                url = entry.get('link', '')
                if not url:
                    continue
                
                if db.query(models.Article).filter(models.Article.url == url).first():
                    continue
                    
                title = entry.get('title', 'No Title')
                summary_text = entry.get('summary', '') or entry.get('description', '')
                
                # Cleanup summary slightly
                summary_soup = BeautifulSoup(summary_text, 'html.parser')
                clean_summary = summary_soup.get_text(strip=True)
                
                print(f"New article found: {title}")
                image_url = fetch_og_image(url)
                
                # Use AI Service
                cat_info = ai.categorize_article(title, clean_summary)
                category = cat_info.get("category", "General")
                topic = cat_info.get("descriptive_topic", "General News")
                
                article = models.Article(
                    title=title,
                    summary=clean_summary[:500] if clean_summary else "No summary available",
                    full_content=clean_summary,
                    url=url,
                    source=feed["source"],
                    category=category,
                    descriptive_topic=topic,
                    image_url=image_url,
                    is_hot_pick=False,
                    published_date=datetime.datetime.now()
                )
                db.add(article)
                db.commit()
                print(f"Saved: {title}")
                
        except Exception as e:
            print(f"Error processing feed {feed['url']}: {e}")
            
    db.close()
    print("RSS Aggregation completed.")

if __name__ == "__main__":
    run_rss_aggregator()
