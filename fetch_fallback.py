import requests
headers = {'User-Agent': 'Mozilla/5.0'}

fails = {
    'ZBC News': 'zbcnews.co.zw',
    'New Zimbabwe': 'newzimbabwe.com',
    'Power FM': 'powerfm.co.zw',
    'Radio Zimbabwe': 'radiozimbabwe.co.zw',
    'Classic 247': 'classic247.co.zw',
    'Khulumani FM': 'khulumanifm.co.zw'
}

for name, domain in fails.items():
    filename = f"frontend/assets/logos/{name.replace(' ', '_')}.png"
    try:
        r = requests.get(f'https://icon.horse/icon/{domain}', headers=headers, timeout=10)
        if r.status_code == 200:
            with open(filename, 'wb') as f:
                f.write(r.content)
            print(f'Saved {name} via icon.horse')
    except Exception as e:
        print(e)
