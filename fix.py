import sys, re

def fix_file(path, is_cp=False):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if not is_cp:
        # 1. Fix SyntaxError
        content = content.replace('    const sid = String(spaceId || \'\');\n    if (!sid) return [];', '    if (!sid) return [];')
        
        # 2. Fix Badge placement PM
        old_html = '''                        ${editBtn}${badgeHTML}
                        <div class="carousel-container absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                            ${imgsHtml}
                        </div>'''
        new_html = '''                        <div class="carousel-container absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                            ${imgsHtml}
                        </div>
                        ${editBtn}${badgeHTML}'''
        content = content.replace(old_html, new_html)
    else:
        # 3. Fix Badge placement CP
        old_html_cp = '''                    ${editBtn}
                    ${digitalBadgeHtml}
                    <div class="carousel-container absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                        ${imgsHtml}
                    </div>'''
        new_html_cp = '''                    <div class="carousel-container absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                        ${imgsHtml}
                    </div>
                    ${editBtn}
                    ${digitalBadgeHtml}'''
        content = content.replace(old_html_cp, new_html_cp)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('frontend/pb_public/cotizador/catalog.js', False)
fix_file('frontend/pb_public/client/cotizador/catalog.js', False)
fix_file('frontend/pb_public/cotizadorcp/catalog.js', True)
fix_file('frontend/pb_public/client/cotizadorcp/catalog.js', True)
