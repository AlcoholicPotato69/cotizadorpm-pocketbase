#!/usr/bin/env python3
import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

TARGETS = {
    "public.profiles": ("app_users", None),
    "finanzas.clientes": ("clientes", "plaza_mayor"),
    "finanzas.conceptos_catalogo": ("conceptos_catalogo", "plaza_mayor"),
    "finanzas.configuracion": ("configuracion", "plaza_mayor"),
    "finanzas.impuestos": ("impuestos", "plaza_mayor"),
    "finanzas.espacios": ("espacios", "plaza_mayor"),
    "finanzas.cotizaciones": ("cotizaciones", "plaza_mayor"),
    "finanzas_casadepiedra.clientes": ("clientes", "casa_de_piedra"),
    "finanzas_casadepiedra.conceptos_catalogo": ("conceptos_catalogo", "casa_de_piedra"),
    "finanzas_casadepiedra.configuracion": ("configuracion", "casa_de_piedra"),
    "finanzas_casadepiedra.impuestos": ("impuestos", "casa_de_piedra"),
    "finanzas_casadepiedra.espacios": ("espacios", "casa_de_piedra"),
    "finanzas_casadepiedra.cotizaciones": ("cotizaciones", "casa_de_piedra"),
}

PB_HEADERS = {"Content-Type": "application/json"}


@dataclass
class InsertStmt:
    table: str
    columns: List[str]
    values: List[str]


def scan_insert_statements(sql: str, table: str) -> Iterable[InsertStmt]:
    needle = f"INSERT INTO {table} ("
    start = 0
    while True:
        idx = sql.find(needle, start)
        if idx == -1:
            return
        cols_start = idx + len(needle)
        cols_end = sql.find(") VALUES (", cols_start)
        if cols_end == -1:
            return
        cols_raw = sql[cols_start:cols_end]
        vals_start = cols_end + len(") VALUES (")
        i = vals_start
        in_quote = False
        while i < len(sql):
            ch = sql[i]
            if ch == "'":
                if in_quote and i + 1 < len(sql) and sql[i + 1] == "'":
                    i += 2
                    continue
                in_quote = not in_quote
            elif ch == ")" and not in_quote:
                if i + 1 < len(sql) and sql[i + 1] == ";":
                    vals_raw = sql[vals_start:i]
                    columns = [c.strip() for c in cols_raw.split(",")]
                    yield InsertStmt(table=table, columns=columns, values=split_top_level(vals_raw))
                    start = i + 2
                    break
            i += 1
        else:
            return


def split_top_level(raw: str) -> List[str]:
    parts: List[str] = []
    buf: List[str] = []
    in_quote = False
    i = 0
    while i < len(raw):
        ch = raw[i]
        if ch == "'":
            buf.append(ch)
            if in_quote and i + 1 < len(raw) and raw[i + 1] == "'":
                buf.append(raw[i + 1])
                i += 2
                continue
            in_quote = not in_quote
            i += 1
            continue
        if ch == "," and not in_quote:
            parts.append("".join(buf).strip())
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    if buf:
        parts.append("".join(buf).strip())
    return parts


def parse_pg_array(text: str) -> List[str]:
    text = text.strip()
    if not (text.startswith("{") and text.endswith("}")):
        return []
    inner = text[1:-1].strip()
    if not inner:
        return []
    items = []
    buf = []
    in_quote = False
    i = 0
    while i < len(inner):
        ch = inner[i]
        if ch == '"':
            in_quote = not in_quote
            i += 1
            continue
        if ch == "," and not in_quote:
            items.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    if buf:
        items.append("".join(buf))
    return [x.replace('\\"', '"').strip() for x in items if x.strip()]


def parse_literal(token: str) -> Any:
    token = token.strip()
    if token == "NULL":
        return None
    if token == "true":
        return True
    if token == "false":
        return False
    if token.startswith("'") and token.endswith("'"):
        val = token[1:-1].replace("''", "'")
        if (val.startswith("{") or val.startswith("[")):
            try:
                return json.loads(val)
            except Exception:
                pass
        if val.startswith("{") and val.endswith("}"):
            return parse_pg_array(val)
        return val
    if re.fullmatch(r"-?\d+", token):
        return int(token)
    if re.fullmatch(r"-?\d+\.\d+", token):
        return float(token)
    return token


def to_iso_datetime(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    s = s.replace(" ", "T")
    if s.endswith("+00"):
        s = s[:-3] + "Z"
    return s


def map_profile(row: Dict[str, Any], temp_password: str) -> Dict[str, Any]:
    allowed = row.get("allowed_tenants") or []
    if isinstance(allowed, str):
        allowed = parse_pg_array(allowed)
    return {
        "legacy_profile_id": str(row.get("id") or ""),
        "email": row.get("email") or "",
        "password": temp_password,
        "passwordConfirm": temp_password,
        "verified": True,
        "login_username": row.get("username") or (row.get("email") or "user"),
        "role": row.get("role") or "user",
        "tenant_default": row.get("tenant") or "plaza_mayor",
        "allowed_tenants": allowed or ["plaza_mayor"],
        "app_metadata": row.get("app_metadata") or {},
        "created_at": to_iso_datetime(row.get("created_at")),
        "updated_at": to_iso_datetime(row.get("updated_at")),
    }


def map_generic(table: str, row: Dict[str, Any], tenant: str) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"tenant": tenant}
    for key, val in row.items():
        if key == "id":
            payload["legacy_id"] = str(val) if val is not None else None
            continue
        if key == "creado_por":
            payload["creado_por_legacy"] = str(val) if val is not None else None
            continue
        if key == "cliente_id":
            payload["cliente_legacy_id"] = str(val) if val is not None else None
            continue
        if key in {"created_at", "updated_at", "fecha_orden_compra", "fecha_inicio", "fecha_fin"}:
            payload[key] = to_iso_datetime(val)
            continue
        payload[key] = convert_jsonish(val)
    return payload


def convert_jsonish(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    return value


class PocketBaseClient:
    def __init__(self, base_url: str, email: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(PB_HEADERS)
        self.auth_superuser(email, password)

    def auth_superuser(self, email: str, password: str) -> None:
        url = f"{self.base_url}/api/collections/_superusers/auth-with-password"
        resp = self.session.post(url, json={"identity": email, "password": password}, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        token = data["token"]
        self.session.headers["Authorization"] = token

    def find_existing(self, collection: str, field: str, value: str) -> Optional[Dict[str, Any]]:
        filt = f'{field} = "{value.replace(chr(34), chr(92)+chr(34))}"'
        url = f"{self.base_url}/api/collections/{collection}/records"
        resp = self.session.get(url, params={"page": 1, "perPage": 1, "filter": filt}, timeout=30)
        resp.raise_for_status()
        items = resp.json().get("items", [])
        return items[0] if items else None

    def upsert_by_legacy(self, collection: str, payload: Dict[str, Any], field: str = "legacy_id") -> None:
        legacy = payload.get(field)
        if not legacy:
            self.create_record(collection, payload)
            return
        existing = self.find_existing(collection, field, str(legacy))
        if existing:
            rid = existing["id"]
            self.update_record(collection, rid, payload)
        else:
            self.create_record(collection, payload)

    def create_record(self, collection: str, payload: Dict[str, Any]) -> None:
        url = f"{self.base_url}/api/collections/{collection}/records"
        clean = strip_nones(payload)
        resp = self.session.post(url, json=clean, timeout=30)
        if resp.status_code >= 400:
            legacy = clean.get("legacy_id") or clean.get("legacy_profile_id") or "(sin legacy_id)"
            raise RuntimeError(f"Error creando {collection} legacy={legacy}: {resp.status_code} {resp.text}\nPayload: {json.dumps(clean, ensure_ascii=False)[:2500]}")

    def update_record(self, collection: str, record_id: str, payload: Dict[str, Any]) -> None:
        url = f"{self.base_url}/api/collections/{collection}/records/{record_id}"
        clean = strip_nones(payload)
        resp = self.session.patch(url, json=clean, timeout=30)
        if resp.status_code >= 400:
            legacy = clean.get("legacy_id") or clean.get("legacy_profile_id") or "(sin legacy_id)"
            raise RuntimeError(f"Error actualizando {collection}/{record_id} legacy={legacy}: {resp.status_code} {resp.text}\nPayload: {json.dumps(clean, ensure_ascii=False)[:2500]}")


def strip_nones(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in payload.items() if v is not None}


def parse_rows(sql_text: str, table: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for stmt in scan_insert_statements(sql_text, table):
        parsed = [parse_literal(v) for v in stmt.values]
        out.append(dict(zip(stmt.columns, parsed)))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa datos de Supabase SQL a PocketBase")
    parser.add_argument("--sql", required=True, help="Ruta a datos_produccion.sql")
    parser.add_argument("--base-url", required=True, help="URL base PocketBase, ej. http://127.0.0.1:8090")
    parser.add_argument("--superuser-email", required=True)
    parser.add_argument("--superuser-password", required=True)
    parser.add_argument("--temp-user-password", required=True, help="Password temporal para usuarios importados")
    args = parser.parse_args()

    sql_text = Path(args.sql).read_text(encoding="utf-8", errors="ignore")
    client = PocketBaseClient(args.base_url, args.superuser_email, args.superuser_password)

    order = [
        "public.profiles",
        "finanzas.clientes",
        "finanzas_casadepiedra.clientes",
        "finanzas.conceptos_catalogo",
        "finanzas_casadepiedra.conceptos_catalogo",
        "finanzas.configuracion",
        "finanzas_casadepiedra.configuracion",
        "finanzas.impuestos",
        "finanzas_casadepiedra.impuestos",
        "finanzas.espacios",
        "finanzas_casadepiedra.espacios",
        "finanzas.cotizaciones",
        "finanzas_casadepiedra.cotizaciones",
    ]

    summary: List[Tuple[str, int]] = []

    for table in order:
        collection, tenant = TARGETS[table]
        rows = parse_rows(sql_text, table)
        count = 0
        for row in rows:
            if table == "public.profiles":
                payload = map_profile(row, args.temp_user_password)
                client.upsert_by_legacy(collection, payload, field="legacy_profile_id")
            else:
                payload = map_generic(table, row, tenant=tenant or "")
                client.upsert_by_legacy(collection, payload)
            count += 1
        summary.append((table, count))

    print("Importación completada")
    for table, count in summary:
        print(f"- {table}: {count}")


if __name__ == "__main__":
    main()
