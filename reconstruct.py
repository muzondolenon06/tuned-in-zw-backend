import json
import sys

transcript_path = r"C:\Users\DELL\.gemini\antigravity\brain\8b061304-36e1-4fbc-8b0b-7404cf4ae553\.system_generated\logs\transcript.jsonl"
files = {}

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            step = json.loads(line)
            if 'tool_calls' in step:
                for call in step['tool_calls']:
                    if call['name'] == 'write_to_file':
                        target = call['args'].get('TargetFile', '')
                        if 'main.py' in target:
                            files['main.py'] = call['args']['CodeContent']
                        if 'scrapers.py' in target:
                            files['scrapers.py'] = call['args']['CodeContent']
                    elif call['name'] in ['replace_file_content', 'multi_replace_file_content']:
                        target = call['args'].get('TargetFile', '')
                        fname = None
                        if 'main.py' in target: fname = 'main.py'
                        if 'scrapers.py' in target: fname = 'scrapers.py'
                        if fname and fname in files:
                            content = files[fname]
                            if call['name'] == 'replace_file_content':
                                tgt = call['args']['TargetContent']
                                repl = call['args']['ReplacementContent']
                                if tgt in content:
                                    files[fname] = content.replace(tgt, repl)
                            elif call['name'] == 'multi_replace_file_content':
                                chunks = call['args']['ReplacementChunks']
                                if isinstance(chunks, str):
                                    chunks = json.loads(chunks)
                                for c in chunks:
                                    tgt = c['TargetContent']
                                    repl = c['ReplacementContent']
                                    if tgt in content:
                                        content = content.replace(tgt, repl)
                                    else:
                                        print(f"Target not found in {fname}")
                                files[fname] = content
        except Exception as e:
            print(f"Error processing line: {e}")

for k, v in files.items():
    with open(f"C:\\Users\\DELL\\.gemini\\antigravity\\scratch\\tuned_in_zw\\recovered_{k}", 'w', encoding='utf-8') as out:
        out.write(v)
print("Recovered bases.")
