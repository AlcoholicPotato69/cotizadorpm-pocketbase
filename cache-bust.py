import os, re

version_str = '?v=20260426-v3-digital-calendar'
count = 0

for base_dir in ['frontend/pb_public', 'frontend/client', 'frontend']:
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if not file.endswith('.html'):
                continue
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            script_pattern = re.compile(r'(src=[\'"])([^?\'"]+\.js)(\?v=[a-zA-Z0-9_-]+)?([\'"])')
            style_pattern = re.compile(r'(href=[\'"])([^?\'"]+\.css)(\?v=[a-zA-Z0-9_-]+)?([\'"])')
            
            def repl(m):
                url = m.group(2)
                if url.startswith('http') or url.startswith('//'):
                    return m.group(0)
                return m.group(1) + url + version_str + m.group(4)

            new_content = script_pattern.sub(repl, content)
            new_content = style_pattern.sub(repl, new_content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                count += 1

print(f'Total HTML files updated: {count}')
