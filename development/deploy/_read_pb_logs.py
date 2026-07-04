# Lee logs de error del auxiliary.db de una instancia PocketBase (temporal)
import sqlite3, json, sys

path = sys.argv[1]
con = sqlite3.connect(path)
con.row_factory = sqlite3.Row
cur = con.cursor()
tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print("tables:", tables)
for t in ("_logs", "logs"):
    if t in tables:
        for r in cur.execute(f"SELECT * FROM {t} ORDER BY rowid DESC LIMIT 25"):
            d = dict(r)
            print(json.dumps(d, ensure_ascii=False)[:1200])
con.close()
