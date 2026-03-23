import os
import re

TARGET_DIR = r"c:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase\client"
ASSET_ABS = r"c:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase\assets\libs\css\animate.min.css"

def get_relative_path(html_file):
    html_dir = os.path.dirname(html_file)
    rel_path = os.path.relpath(ASSET_ABS, html_dir)
    return rel_path.replace(os.sep, '/')

def optimize_html(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    rel_anim = get_relative_path(filepath)

    # Clean out CDN traces
    content = re.sub(r'\s*<!-- Optimizations & Animations -->\s*', '\n    ', content)
    content = re.sub(r'\s*<link rel="preconnect" href="https://cdnjs\.cloudflare\.com">\s*', '', content)
    content = re.sub(r'\s*<link rel="preload"[^>]*href="https://cdnjs\.cloudflare\.com[^>]*>\s*', '', content)
    content = re.sub(r'\s*<link rel="stylesheet"[^>]*href="https://cdnjs\.cloudflare\.com[^>]*>\s*', '', content)
    
    # Remove any existing local animations block if present to avoid duplication during tests
    content = re.sub(r'\s*<!-- Local Animations -->\s*<link rel="preload"[^>]*animate\.min\.css">\s*<link rel="stylesheet"[^>]*animate\.min\.css">\s*', '\n', content)

    # Inject relative local animation link
    if "animate.min.css" not in content:
        injection = f'\n    <!-- Local Animations -->\n    <link rel="preload" as="style" href="{rel_anim}">\n    <link rel="stylesheet" href="{rel_anim}">\n</head>'
        content = re.sub(r'</head>', injection, content, flags=re.IGNORECASE)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Localized: {filepath}")

def main():
    count = 0
    for root, dirs, files in os.walk(TARGET_DIR):
        for file in files:
            if file.endswith('.html'):
                filepath = os.path.join(root, file)
                optimize_html(filepath)
                count += 1
    print(f"Finished localizing {count} HTML files in {TARGET_DIR}.")

if __name__ == "__main__":
    main()
