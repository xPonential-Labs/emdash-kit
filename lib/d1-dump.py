"""Dump a SQLite database as SQL that D1 accepts, in an order D1 can apply.

D1 enforces foreign keys statement by statement, so every table is created
before any row goes in. Indexes and triggers come last, so no trigger fires
on the copy. No transaction wrapper, no PRAGMA, no sqlite_sequence.
"""
import sqlite3, sys

db = sqlite3.connect(sys.argv[1])
db.text_factory = bytes


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, bytes):
        try:
            return "'" + v.decode("utf-8").replace("'", "''") + "'"
        except UnicodeDecodeError:
            return "X'" + v.hex() + "'"
    return "'" + str(v).replace("'", "''") + "'"


objs = db.execute(
    "select type, name, sql from sqlite_master where sql is not null "
    "and name not like 'sqlite_%' and name not like '_cf_%' order by rowid"
).fetchall()
objs = [(t.decode(), n.decode(), s.decode()) for t, n, s in objs]
out = sys.stdout
tables = [(n, s) for t, n, s in objs if t == "table"]
for n, s in tables:
    out.write(s + ";\n")
for n, s in tables:
    if s.upper().startswith("CREATE VIRTUAL"):
        continue
    for row in db.execute(f'select * from "{n}"'):
        out.write(f'INSERT INTO "{n}" VALUES(' + ",".join(lit(v) for v in row) + ");\n")
for t, n, s in objs:
    if t in ("index", "trigger", "view"):
        out.write(s + ";\n")
