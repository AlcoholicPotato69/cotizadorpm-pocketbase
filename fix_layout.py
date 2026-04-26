import re

path = 'frontend/pb_public/js/layout.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the keydown reload blocker with a simple allow
old_block = """        document.addEventListener('keydown', (event) => {
            const key = String(event.key || '').toLowerCase();
            const wantsReload = key === 'f5' || ((event.ctrlKey || event.metaKey) && key === 'r');
            if (!wantsReload) return;
            if (window.__HUB_ALLOW_MANUAL_RELOAD === true) return;
            event.preventDefault();
            pushDiag('reload_key_blocked', {
                key: safeSlice(key, 16),
                ctrl: !!event.ctrlKey,
                meta: !!event.metaKey,
                interaction: lastInteraction
            });
            if (typeof window.showToast === 'function') {
                window.showToast('Recarga bloqueada para evitar perder cambios en progreso.', 'info');
            }
        }, true);"""

new_block = """        // Recarga manual por teclado (F5 / Ctrl+R) siempre permitida.
        window.__HUB_ALLOW_MANUAL_RELOAD = true;"""

if old_block in content:
    content = content.replace(old_block, new_block)
    print('Replaced keydown reload blocker')
else:
    print('WARNING: keydown reload blocker not found (already applied or whitespace mismatch)')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
