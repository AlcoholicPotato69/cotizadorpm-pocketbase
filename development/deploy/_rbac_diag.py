import sqlite3, json
con = sqlite3.connect(r"backend/pb_data/data.db")
con.row_factory = sqlite3.Row
cur = con.cursor()
print("=== USERS is_admin/role ===")
for r in cur.execute("SELECT email, role, is_admin, app_metadata FROM app_users"):
    d = dict(r)
    try:
        m = json.loads(d.get("app_metadata") or "{}")
        d["role_ids"] = m.get("rbac", {}).get("role_ids")
        d["roles"] = m.get("roles")
    except Exception:
        pass
    d.pop("app_metadata", None)
    print(d)
print()
print("=== ROLES grants_admin ===")
for r in cur.execute("SELECT slug, system_role, grants_admin FROM app_roles"):
    print(dict(r))
print()
print("=== app_users listRule ===")
r = cur.execute("SELECT listRule FROM _collections WHERE name='app_users'").fetchone()
print(r[0] if r else "N/A")
con.close()
