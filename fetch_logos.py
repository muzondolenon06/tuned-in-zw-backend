import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

os.makedirs('frontend/assets/logos', exist_ok=True)

sources = {
    'NewsDay': 'https://www.newsday.co.zw',
    'DailyNews': 'https://dailynews.co.zw',
    'Independent': 'https://www.theindependent.co.zw',
    'Standard': 'https://www.thestandard.co.zw',
    'FinGaz': 'https://fingaz.co.zw',
    'Herald': 'https://www.herald.co.zw',
    'Chronicle': 'https://www.chronicle.co.zw',
    'Sunday Mail': 'https://www.sundaymail.co.zw',
    'ZBC News': 'https://www.zbcnews.co.zw',
    'H-Metro': 'https://www.hmetro.co.zw',
    'Kwayedza': 'https://www.kwayedza.co.zw',
    'New Zimbabwe': 'https://www.newzimbabwe.com',
    'ZimLive': 'https://www.zimlive.com',
    'Bulawayo24': 'https://bulawayo24.com',
    'NewsHawks': 'https://thenewshawks.com',
    'ZimEye': 'https://www.zimeye.net',
    'iHarare': 'https://iharare.com',
    'Star FM': 'https://www.starfm.co.zw',
    'ZiFM Stereo': 'https://www.zifmstereo.co.zw',
    'Power FM': 'https://www.powerfm.co.zw',
    'Radio Zimbabwe': 'https://radiozimbabwe.co.zw',
    'National FM': 'https://nationalfm.co.zw',
    'Classic 247': 'https://classic247.co.zw',
    'Khulumani FM': 'https://khulumanifm.co.zw',
    '98.4 Midlands': 'https://984fm.co.zw',
    'Hevoi FM': 'https://hevoifm.co.zw',
    'Capitalk 100.4FM': 'https://www.capitalkfm.com',
    'Diamond FM': 'https://www.diamondfm.co.zw',
    'Nyaminyami FM': 'https://nyaminyamifm.co.zw'
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

for name, url in sources.items():
    filename = f"frontend/assets/logos/{name.replace(' ', '_')}.png"
    print(f'Fetching logo for {name}...')
    if os.path.exists(filename):
        print(f'Already exists: {filename}')
        continue
    try:
        r = requests.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(r.content, 'html.parser')
        
        # Try to find a logo image
        img_url = None
        for img in soup.find_all('img'):
            src = img.get('src', '')
            alt = img.get('alt', '').lower()
            classes = img.get('class', [])
            if 'logo' in src.lower() or 'logo' in alt or any('logo' in str(c).lower() for c in classes):
                img_url = urljoin(url, src)
                break
        
        if img_url:
            print(f'Found logo: {img_url}')
            img_r = requests.get(img_url, headers=headers, timeout=10)
            with open(filename, 'wb') as f:
                f.write(img_r.content)
        else:
            print(f'No logo found for {name}, trying icon.horse')
            domain = url.split('://')[-1].replace('www.', '').split('/')[0]
            img_r = requests.get(f'https://icon.horse/icon/{domain}', timeout=10)
            with open(filename, 'wb') as f:
                f.write(img_r.content)
    except Exception as e:
        print(f'Failed {name}: {e}')
