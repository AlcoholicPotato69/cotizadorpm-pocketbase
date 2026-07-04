import sqlite3
con = sqlite3.connect(r"backend/pb_data/data.db")
cur = con.cursor()
cols = [r[1] for r in cur.execute("PRAGMA table_info(cotizaciones)")]
print("live cotizaciones tiene flujo_estado:", "flujo_estado" in cols)
ucols = [r[1] for r in cur.execute("PRAGMA table_info(app_users)")]
print("live app_users cols:", ucols)
rcols = [r[1] for r in cur.execute("PRAGMA table_info(app_roles)")]
print("live app_roles cols:", rcols)
con.close()
