import os, re

# ─────────────────────────────────────────────────────────
# FIX: Digital media spaces must bypass ALL reservation /
# blocked-date logic in Casa de Piedra's cotizacion.js
# AND in Plaza Mayor's catalog.js fetchBlockedRangesForSpace.
# ─────────────────────────────────────────────────────────

# Helper to check if a space is digital
CP_DIGITAL_HELPER = """
function __cpIsDigitalMediaSpace(spaceOrId) {
    const space = typeof spaceOrId === 'string' ? allSpaces.find(s => String(s.id) === spaceOrId) : spaceOrId;
    if (!space) return false;
    const b2b = getCpSpaceB2bConfig(space);
    return normalizeCpDigitalMediaConfig(b2b.digital_media || b2b.digitalMedia || b2b.medio_digital || {}).enabled;
}
"""

def fix_cp_cotizacion(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    changes = 0
    
    # 1. Add helper function if not already present
    if '__cpIsDigitalMediaSpace' not in content:
        # Insert after normalizeCpDigitalMediaConfig function
        anchor = 'function normalizeCpDigitalMediaConfig(value = {}) {'
        idx = content.find(anchor)
        if idx >= 0:
            # Find end of function block
            func_end = content.find('\n}', idx)
            if func_end >= 0:
                insert_at = func_end + 2
                content = content[:insert_at] + '\n' + CP_DIGITAL_HELPER + content[insert_at:]
                changes += 1
                print(f'  + Added __cpIsDigitalMediaSpace helper')
    
    # 2. Fix __cpBuildReservationsMap to skip digital spaces
    old_build = '    (rows || []).forEach(order => {\n        const orderBlocksIndefinitely = __cpQuoteBlocksIndefinitely(order);'
    new_build = '''    (rows || []).forEach(order => {
        // DIGITAL MEDIA: skip reservation tracking for digital spaces
        const primarySid = order.espacio_id || '';
        if (primarySid && __cpIsDigitalMediaSpace(primarySid)) return;
        const orderBlocksIndefinitely = __cpQuoteBlocksIndefinitely(order);'''
    
    if old_build in content:
        content = content.replace(old_build, new_build)
        changes += 1
        print(f'  + Fixed __cpBuildReservationsMap to skip digital spaces')
    
    # Also handle detail items within __cpBuildReservationsMap
    old_detail = '            details.forEach(item => {\n                const sid = item.espacio_id || item.space_id;'
    new_detail = '''            details.forEach(item => {
                const sid = item.espacio_id || item.space_id;
                // DIGITAL MEDIA: skip reservation tracking for digital spaces
                if (sid && __cpIsDigitalMediaSpace(sid)) return;'''
    
    if old_detail in content:
        content = content.replace(old_detail, new_detail)
        changes += 1
        print(f'  + Fixed detail items in __cpBuildReservationsMap')
    
    # 3. Fix __cpEvalAvailability to always mark digital spaces as available
    old_eval = '        const reserved = map.get(sid) || new Set();'
    new_eval = '''        const reserved = map.get(sid) || new Set();
        // DIGITAL MEDIA: always available for digital spaces
        if (__cpIsDigitalMediaSpace(sid)) { bySpace[sid] = { available: true, conflicts: [] }; return; }'''
    
    if old_eval in content and content.count(old_eval) == 1:
        content = content.replace(old_eval, new_eval)
        changes += 1
        print(f'  + Fixed __cpEvalAvailability for digital spaces')
    
    # 4. Fix pickQuoteDate reserved check - skip for digital
    old_pick = "if (__CP_DATE_PICKER_STATE.reserved?.has(ds)) return window.showToast(`La fecha ${window.safeFormatDate(ds)} ya está ocupada para este espacio.`, 'error');"
    new_pick = "if (__CP_DATE_PICKER_STATE.reserved?.has(ds) && !__cpIsDigitalMediaSpace(cfg?.spaceId)) return window.showToast(`La fecha ${window.safeFormatDate(ds)} ya está ocupada para este espacio.`, 'error');"
    
    if old_pick in content:
        content = content.replace(old_pick, new_pick)
        changes += 1
        print(f'  + Fixed pickQuoteDate reserved check for digital')
    
    # 5. Fix the range clash check in pickQuoteDate
    old_clash = "const clash = range.find(d => __CP_DATE_PICKER_STATE.reserved?.has(d));\n        if (clash) return window.showToast(`El periodo automático incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, 'error');"
    new_clash = "const clash = __cpIsDigitalMediaSpace(cfg?.spaceId) ? null : range.find(d => __CP_DATE_PICKER_STATE.reserved?.has(d));\n        if (clash) return window.showToast(`El periodo automático incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, 'error');"
    
    if old_clash in content:
        content = content.replace(old_clash, new_clash)
        changes += 1
        print(f'  + Fixed auto-period clash check for digital')
    
    # 6. Fix the manual range clash in pickQuoteDate
    old_manual_clash = "const clash = range.find(d => __CP_DATE_PICKER_STATE.reserved?.has(d));\n        if (clash) return window.showToast(`El rango incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, 'error');"
    new_manual_clash = "const clash = __cpIsDigitalMediaSpace(cfg?.spaceId) ? null : range.find(d => __CP_DATE_PICKER_STATE.reserved?.has(d));\n        if (clash) return window.showToast(`El rango incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, 'error');"
    
    if old_manual_clash in content:
        content = content.replace(old_manual_clash, new_manual_clash)
        changes += 1
        print(f'  + Fixed manual range clash check for digital')

    # 7. Fix __cpCfgHasBlockedDates - skip for digital  
    old_cfgblocked = 'function __cpCfgHasBlockedDates(cfg) {'
    new_cfgblocked = '''function __cpCfgHasBlockedDates(cfg) {
    // DIGITAL MEDIA: never has blocked dates
    if (cfg?.spaceId && __cpIsDigitalMediaSpace(cfg.spaceId)) return false;'''
    
    if old_cfgblocked in content and 'DIGITAL MEDIA: never has blocked dates' not in content:
        content = content.replace(old_cfgblocked, new_cfgblocked)
        changes += 1
        print(f'  + Fixed __cpCfgHasBlockedDates for digital')
    
    if changes > 0:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'  => {changes} changes applied to {path}')
    else:
        print(f'  => No changes needed in {path}')
    
    return changes


# Find all cotizacion.js files
total = 0
for root, dirs, files in os.walk('frontend'):
    for f in files:
        if f == 'cotizacion.js' and 'cotizadorcp' in root:
            path = os.path.join(root, f)
            print(f'\nProcessing: {path}')
            total += fix_cp_cotizacion(path)

print(f'\n=== Total changes: {total} ===')
