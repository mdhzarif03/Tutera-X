#!/usr/bin/env python3
"""
Generates prisma/migrations/<timestamp>_init/migration.sql from prisma/schema.prisma.

Covers the subset of Prisma syntax this project uses and follows Prisma's DDL naming:
  tables and columns use model and field names, primary keys are Model_pkey,
  unique indexes Model_field_key, plain indexes Model_cols_idx, foreign keys Model_field_fkey.

It also self-checks the output: every referenced table, column, and foreign-key target must exist.
This does not replace running `npx prisma migrate diff` on a machine with Prisma installed.

Usage: python3 scripts/generate-initial-migration.py [--stdout] [--stamp 20261122180000] [--force]
  --stdout prints the DDL without writing anything (use it to compare with the schema).
  Without --force it refuses to overwrite an existing migration folder, because applied migrations must not change.
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "prisma" / "schema.prisma"
SCALARS = {
    "String": "TEXT",
    "Int": "INTEGER",
    "Boolean": "BOOLEAN",
    "DateTime": "TIMESTAMP(3)",
    "Decimal": "DECIMAL(65,30)",
    "Json": "JSONB",
}
ONDELETE = {"Restrict": "RESTRICT", "Cascade": "CASCADE", "SetNull": "SET NULL", "NoAction": "NO ACTION"}
ATTR_RE = re.compile(r"@@?\w+(?:\.\w+)?(?:\([^()]*(?:\([^()]*\)[^()]*)*\))?")


def strip_comment(line: str) -> str:
    out, quoted, i = [], False, 0
    while i < len(line):
        c = line[i]
        if c == '"':
            quoted = not quoted
        if not quoted and line.startswith("//", i):
            break
        out.append(c)
        i += 1
    return "".join(out).rstrip()


def parse_schema(text: str):
    models, enums, order = {}, {}, []
    cur = None
    for raw in text.splitlines():
        line = strip_comment(raw).strip()
        if cur is None:
            m = re.match(r"^(model|enum|datasource|generator)\s+(\w+)\s*\{$", line)
            if m:
                cur = {"kind": m.group(1), "name": m.group(2), "body": []}
            continue
        if line == "}":
            if cur["kind"] == "model":
                models[cur["name"]] = cur["body"]
                order.append(cur["name"])
            elif cur["kind"] == "enum":
                enums[cur["name"]] = [v for v in cur["body"] if v]
            cur = None
            continue
        if line:
            cur["body"].append(line)
    return models, enums, order


def parse_model(body, models, enums):
    fields, pk, uniques, indexes = [], None, [], []
    for line in body:
        if line.startswith("@@"):
            m = re.match(r"@@(\w+)\((.*)\)$", line)
            if not m:
                raise SystemExit(f"Unsupported block attribute: {line}")
            cols = [c.strip() for c in re.search(r"\[(.*?)\]", m.group(2)).group(1).split(",")]
            if m.group(1) == "id":
                pk = cols
            elif m.group(1) == "unique":
                uniques.append(cols)
            elif m.group(1) == "index":
                indexes.append(cols)
            else:
                raise SystemExit(f"Unsupported block attribute: {line}")
            continue
        m = re.match(r"^(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$", line)
        if not m:
            raise SystemExit(f"Cannot parse field: {line}")
        rest = m.group(4)
        fields.append({
            "name": m.group(1),
            "type": m.group(2),
            "optional": m.group(3) == "?",
            "list": m.group(3) == "[]",
            "attrs": ATTR_RE.findall(rest),
        })
    return fields, pk, uniques, indexes


def attr(field, prefix):
    for a in field["attrs"]:
        if a.startswith(prefix):
            return a
    return None


def sql_type(field, enums):
    if field["type"] in enums:
        return f'"{field["type"]}"'
    t = SCALARS[field["type"]]
    db = next((a for a in field["attrs"] if a.startswith("@db.")), None)
    if db:
        if db.startswith("@db.Date"):
            t = "DATE"
        m = re.match(r"@db\.Decimal\((\d+),\s*(\d+)\)", db)
        if m:
            t = f"DECIMAL({m.group(1)},{m.group(2)})"
    return t


def default_sql(field, enums):
    d = attr(field, "@default(")
    if not d:
        return ""
    v = d[len("@default("):-1]
    if v == "now()":
        return " DEFAULT CURRENT_TIMESTAMP"
    if v.startswith("cuid") or v.startswith("uuid"):
        return ""
    if v in ("true", "false"):
        return f" DEFAULT {v}"
    if re.fullmatch(r"-?\d+(\.\d+)?", v):
        return f" DEFAULT {v}"
    if v.startswith('"'):
        return f" DEFAULT '{v.strip(chr(34))}'"
    if field["type"] in enums and v in enums[field["type"]]:
        return f" DEFAULT '{v}'"
    raise SystemExit(f"Unsupported default for {field['name']}: {v}")


def quote_cols(cols):
    return ", ".join(f'"{c}"' for c in cols)


def main():
    stamp = "20261122180000"
    if "--stamp" in sys.argv:
        stamp = sys.argv[sys.argv.index("--stamp") + 1]

    models_raw, enums, order = parse_schema(SCHEMA.read_text(encoding="utf-8"))
    enum_values = {k: v for k, v in enums.items()}

    parsed = {}
    for name in order:
        fields, pk, uniques, indexes = parse_model(models_raw[name], models_raw, enum_values)
        parsed[name] = {"fields": fields, "pk": pk, "uniques": uniques, "indexes": indexes}

    # Map each model's scalar columns, skipping relation-only fields.
    def is_relation(f):
        return f["type"] in parsed

    stmts_types, stmts_tables, stmts_unique, stmts_index, stmts_fk = [], [], [], [], []
    checks_columns = {}

    for ename, values in enums.items():
        stmts_types.append(f'CREATE TYPE "{ename}" AS ENUM ({", ".join(repr_sql(v) for v in values)});')

    for name in order:
        m = parsed[name]
        cols, col_names, pk_cols = [], [], m["pk"]
        for f in m["fields"]:
            if f["list"] or is_relation(f):
                continue
            col_names.append(f["name"])
            null = "" if (f["optional"]) else " NOT NULL"
            cols.append(f'    "{f["name"]}" {sql_type(f, enums)}{null}{default_sql(f, enums)}')
        checks_columns[name] = set(col_names)

        pk = pk_cols or [f["name"] for f in m["fields"] if attr(f, "@id")]
        if not pk:
            raise SystemExit(f"Model {name} has no primary key")
        cols.append(f'    CONSTRAINT "{name}_pkey" PRIMARY KEY ({quote_cols(pk)})')
        stmts_tables.append(f'CREATE TABLE "{name}" (\n' + ",\n".join(cols) + "\n);")

        for f in m["fields"]:
            if not f["list"] and not is_relation(f) and attr(f, "@unique"):
                stmts_unique.append(f'CREATE UNIQUE INDEX "{name}_{f["name"]}_key" ON "{name}"({quote_cols([f["name"]])});')
        for cols_u in m["uniques"]:
            stmts_unique.append(f'CREATE UNIQUE INDEX "{name}_{"_".join(cols_u)}_key" ON "{name}"({quote_cols(cols_u)});')
        for cols_i in m["indexes"]:
            stmts_index.append(f'CREATE INDEX "{name}_{"_".join(cols_i)}_idx" ON "{name}"({quote_cols(cols_i)});')

    # Foreign keys and their indexes from relation fields.
    for name in order:
        for f in parsed[name]["fields"]:
            if f["list"] or not is_relation(f):
                continue
            rel = attr(f, "@relation(")
            if not rel:
                continue  # back-reference side, no column
            fields_ = re.search(r"fields:\s*\[(.*?)\]", rel)
            refs_ = re.search(r"references:\s*\[(.*?)\]", rel)
            if not fields_ or not refs_:
                raise SystemExit(f"Relation {name}.{f['name']} needs fields and references")
            local = [c.strip() for c in fields_.group(1).split(",")]
            remote = [c.strip() for c in refs_.group(1).split(",")]
            od = re.search(r"onDelete:\s*(\w+)", rel)
            on_delete = ONDELETE[od.group(1)] if od else ("SET NULL" if f["optional"] else "RESTRICT")
            target = f["type"]
            stmts_fk.append(
                f'ALTER TABLE "{name}" ADD CONSTRAINT "{name}_{"_".join(local)}_fkey" '
                f'FOREIGN KEY ({quote_cols(local)}) REFERENCES "{target}"({quote_cols(remote)}) '
                f"ON DELETE {on_delete} ON UPDATE CASCADE;"
            )
            # Self-check: referenced table and columns exist.
            if target not in checks_columns and target not in parsed:
                raise SystemExit(f"FK target table missing: {target}")
            for c in local:
                if c not in checks_columns.get(name, set()):
                    raise SystemExit(f"FK column missing: {name}.{c}")
            for c in remote:
                if c not in checks_columns.get(target, set()) | set(parsed[target]["pk"] or []):
                    raise SystemExit(f"FK target column missing: {target}.{c}")

    # Self-check: index columns exist.
    for name in order:
        for cols_u in parsed[name]["uniques"] + parsed[name]["indexes"]:
            for c in cols_u:
                if c not in checks_columns[name]:
                    raise SystemExit(f"Index column missing: {name}.{c}")

    out = "\n\n".join(
        ["\n".join(stmts_types), "\n\n".join(stmts_tables), "\n".join(stmts_unique), "\n".join(stmts_index), "\n".join(stmts_fk)]
    )
    if "--stdout" in sys.argv:
        # Print the DDL for comparison only. Never writes a migration.
        print(out.strip())
        return

    out_dir = ROOT / "prisma" / "migrations" / f"{stamp}_init"
    if out_dir.exists() and "--force" not in sys.argv:
        # An applied migration must never change: Prisma checksums it. Create a new migration instead.
        raise SystemExit(f"{out_dir} already exists. Refusing to overwrite an applied migration. Use a new migration for schema changes.")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "migration.sql").write_text(out.strip() + "\n", encoding="utf-8")
    (ROOT / "prisma" / "migrations" / "migration_lock.toml").write_text(
        '# Please do not edit this file manually\n# It should be added in your version-control system (e.g., Git)\nprovider = "postgresql"\n',
        encoding="utf-8",
    )
    print(f"wrote {out_dir / 'migration.sql'}: {len(order)} tables, {len(enums)} enums, {len(stmts_fk)} foreign keys")


def repr_sql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


if __name__ == "__main__":
    main()
