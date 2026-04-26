import os, re

# Files to process - ALL copies across the project
files_to_fix = []
for root, dirs, files in os.walk('frontend'):
    for f in files:
        if f == 'catalog.js':
            files_to_fix.append(os.path.join(root, f))

count = 0
for path in files_to_fix:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix z-index on digital badge: z-10 -> z-30
    new_content = content.replace(
        'rounded shadow-md z-10 flex items-center gap-1"><i class="fa-solid fa-desktop"></i> Digital</div>',
        'rounded shadow-md z-30 flex items-center gap-1"><i class="fa-solid fa-desktop"></i> Digital</div>'
    )
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        count += 1
        print(f'Fixed z-index in: {path}')

print(f'\nTotal files fixed: {count}')
