from __future__ import annotations

import json
import secrets
import shutil
import sqlite3
import string
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "pb_data" / "data.db"
BACKUP_DIR = ROOT / "backups"
REPORT_PATH = ROOT / "logs" / "catalog_sync_report.json"
ASSET_DIR = ROOT / "logs" / "catalog_sync_assets"
PEDRO_PDF = ROOT / "catalogo Pedro.pdf"
MEDEL_PDF = ROOT / "catalogo medel.pdf"
ESPACIOS_STORAGE = ROOT / "pb_data" / "storage" / "pbc_2322288521"

PEDRO_CROP = {"top": 0.0, "left": 0.0, "right": 1.0, "bottom": 0.69}
MEDEL_CROP = {"top": 0.0, "left": 0.0, "right": 0.42, "bottom": 1.0}

PENDING_MEASURE = {"width": 0, "height": 0, "unit": ""}


def slugify(value: str) -> str:
    raw = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    cleaned = []
    for ch in raw.lower():
        cleaned.append(ch if ch.isalnum() else "_")
    slug = "".join(cleaned)
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug.strip("_") or "espacio"


def now_pb_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + "Z"


def backup_database() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = BACKUP_DIR / f"data_before_catalog_sync_{stamp}.db"
    shutil.copy2(DB_PATH, backup)
    return backup


def render_page(doc: fitz.Document, page_number: int, scale: float = 2.0) -> Image.Image:
    page = doc.load_page(page_number - 1)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def crop_page(img: Image.Image, crop: dict[str, float]) -> Image.Image:
    left = int(img.width * crop["left"])
    top = int(img.height * crop["top"])
    right = int(img.width * crop["right"])
    bottom = int(img.height * crop["bottom"])
    return img.crop((left, top, right, bottom))


def save_crop(doc: fitz.Document, pdf_label: str, page_number: int, crop: dict[str, float], label: str) -> Path:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    image = crop_page(render_page(doc, page_number), crop)
    out = ASSET_DIR / f"{pdf_label}_p{page_number:02d}_{slugify(label)[:50]}.webp"
    image.save(out, format="WEBP", quality=88, method=6)
    return out


def generate_record_id(existing_ids: set[str]) -> str:
    alphabet = string.ascii_lowercase + string.digits
    while True:
        rid = "".join(secrets.choice(alphabet) for _ in range(15))
        if rid not in existing_ids:
            existing_ids.add(rid)
            return rid


def attach_image(record: dict, image_path: Path) -> tuple[str | None, str | None]:
    storage_dir = ESPACIOS_STORAGE / record["id"]
    storage_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{slugify(record['nombre'])[:42]}_{secrets.token_hex(5)}.webp"
    shutil.copy2(image_path, storage_dir / filename)
    for field in ("imagen", "imagen2", "imagen3", "imagen4", "imagen5"):
        if not str(record.get(field) or "").strip():
            record[field] = filename
            return field, filename
    return None, None


def update_space(cur: sqlite3.Cursor, payload: dict) -> None:
    cur.execute(
        """
        UPDATE espacios
        SET clave = :clave,
            nombre = :nombre,
            descripcion = :descripcion,
            material = :material,
            medida_ancho = :medida_ancho,
            medida_alto = :medida_alto,
            medida_unidad = :medida_unidad,
            imagen = :imagen,
            imagen2 = :imagen2,
            imagen3 = :imagen3,
            imagen4 = :imagen4,
            imagen5 = :imagen5
        WHERE id = :id
        """,
        payload,
    )


def insert_space(cur: sqlite3.Cursor, payload: dict) -> None:
    cur.execute(
        """
        INSERT INTO espacios (
            activa, activo, ajuste_porcentaje, ajuste_tipo, clave, color, config_b2b,
            created_at, descripcion, dias_bloqueados, etiquetas, id, imagen_url,
            impuestos_ids, legacy_id, nombre, precio_base, precios_por_dia, requisitos,
            tenant, tipo, imagen2, imagen3, imagen4, imagen5, imagen, material,
            medida_ancho, medida_alto, medida_unidad
        ) VALUES (
            :activa, :activo, :ajuste_porcentaje, :ajuste_tipo, :clave, :color, :config_b2b,
            :created_at, :descripcion, :dias_bloqueados, :etiquetas, :id, :imagen_url,
            :impuestos_ids, :legacy_id, :nombre, :precio_base, :precios_por_dia, :requisitos,
            :tenant, :tipo, :imagen2, :imagen3, :imagen4, :imagen5, :imagen, :material,
            :medida_ancho, :medida_alto, :medida_unidad
        )
        """,
        payload,
    )


def build_description(location: str, material: str, measures: str) -> str:
    return f"Ubicación: {location}\nMaterial: {material}\nMedidas: {measures}"


CURRENT_UPDATES = [
    {
        "id": "bg039kf9bixh3ui",
        "clave": "Z1-1",
        "nombre": "Puente entre Banamex y Sanborn's",
        "descripcion": build_description(
            "Entre Banamex y Sanborns, de cara al pórtico 1.",
            "Lona",
            "Pendiente por confirmar en catálogo técnico.",
        ),
        "material": "Lona",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 6, "puente_banamex_sanborns"),
    },
    {
        "id": "8k578in4vqc6ygb",
        "clave": "Z1-2",
        "nombre": "Muro a un lado de Coloso y Zara",
        "descripcion": build_description(
            "En Zona 1, en el acceso a Zona 3, a un costado de Coloso y Zara.",
            "Lona sobre bastidor",
            "2.20 m x 2.82 m.",
        ),
        "material": "Lona sobre bastidor",
        "measure": {"width": 2.20, "height": 2.82, "unit": "M"},
        "image": ("pedro", 7, "muro_coloso_zara"),
    },
    {
        "id": "zq4iwlluy0lg2zk",
        "clave": "Z1-3",
        "nombre": "Ave en Domo Suburbia",
        "descripcion": build_description(
            "Debajo del domo principal en Zona 1.",
            "Lona sobre bastidor",
            "Pendiente por confirmar en catálogo técnico.",
        ),
        "material": "Lona sobre bastidor",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 8, "ave_domo_suburbia"),
    },
    {
        "id": "abgoaewiumxxmda",
        "clave": "Z1-9",
        "nombre": "Muro espectacular entre Zara y Massimo Dutti",
        "descripcion": build_description(
            "En Zona 3, frente a Sears, de cara al domo principal.",
            "Lona 13 oz mate sobre bastidor metálico",
            "13.00 m x 3.00 m.",
        ),
        "material": "Lona 13 oz mate sobre bastidor metálico",
        "measure": {"width": 13.0, "height": 3.0, "unit": "M"},
        "image": ("pedro", 9, "muro_espectacular_zara_massimo"),
    },
    {
        "id": "77cli6xotme16kp",
        "clave": "Z2-1",
        "nombre": "Antepecho pasillo a C&A",
        "descripcion": build_description(
            "En el pasillo de salida de Zona 2 y entrada a Zona 1 por la pista de hielo.",
            "Vinil",
            "Pendiente por confirmar en catálogo técnico.",
        ),
        "material": "Vinil",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 10, "antepecho_pasillo_ca"),
    },
    {
        "id": "gcdnjzqpibhv6xq",
        "clave": "Z3-5",
        "nombre": "Escaleras del domo principal (2 caras)",
        "descripcion": build_description(
            "En Zona 3, frente a Sears, Zara, Liverpool y la isla de Starbucks.",
            "Vinil mate reverso gris o negro con protección UV",
            "9.60 m x 0.57 m (2 caras).",
        ),
        "material": "Vinil mate reverso gris o negro con protección UV",
        "measure": {"width": 9.60, "height": 0.57, "unit": "M"},
        "image": ("pedro", 11, "escaleras_domo_principal"),
    },
    {
        "id": "nfjezu0sxh63ybp",
        "clave": "Z3-6",
        "nombre": "Paquete de 10 pendones interiores",
        "descripcion": build_description(
            "En los principales pasillos de Zona 3, visibles desde primer y segundo piso.",
            "Lona blockout frente y vuelta",
            "0.70 m x 5.00 m por pendón (paquete de 10).",
        ),
        "material": "Lona blockout frente y vuelta",
        "measure": {"width": 0.70, "height": 5.00, "unit": "M"},
        "image": ("pedro", 12, "paquete_pendones_interiores"),
    },
    {
        "id": "1gfbe9plpnr5hfm",
        "clave": "Z3-8",
        "nombre": "Puente en pasillo principal",
        "descripcion": build_description(
            "En el pasillo principal de Zona 3, visible desde primer y segundo piso.",
            "Lona sobre bastidor",
            "7.28 m x 1.19 m.",
        ),
        "material": "Lona sobre bastidor",
        "measure": {"width": 7.28, "height": 1.19, "unit": "M"},
        "image": ("pedro", 13, "puente_pasillo_principal"),
    },
    {
        "id": "vefi36na4nzaefj",
        "clave": "Z3-12",
        "nombre": "Espectacular sobre balcón Sears",
        "descripcion": build_description(
            "En Zona 1, entre Zara y Massimo Dutti, con vista al pórtico 1.",
            "Lona sobre bastidor",
            "Pendiente por confirmar en catálogo técnico.",
        ),
        "material": "Lona sobre bastidor",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 14, "espectacular_balcon_sears"),
    },
    {
        "id": "bcn7fit4l3xtw7m",
        "clave": "Z3-21",
        "nombre": "Ave en domo principal",
        "descripcion": build_description(
            "Debajo del domo principal en Zona 3.",
            "Lona sobre bastidor",
            "Pendiente por confirmar en catálogo técnico.",
        ),
        "material": "Lona sobre bastidor",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 15, "ave_domo_principal"),
    },
    {
        "id": "ea2wt9pgmsdthpi",
        "clave": "Z4-1",
        "nombre": "Cristales interiores de escaleras eléctricas",
        "descripcion": build_description(
            "En Zona 4, frente al acceso del pórtico 4 y al acceso a segunda planta hacia Cinemex.",
            "Vinil autoadherible con protección UV",
            "2.66 m x 3.30 m.",
        ),
        "material": "Vinil autoadherible con protección UV",
        "measure": {"width": 2.66, "height": 3.30, "unit": "M"},
        "image": ("pedro", 16, "cristales_interiores_escaleras"),
    },
    {
        "id": "mkalj7bsvzrrx9t",
        "clave": "Z4-2",
        "nombre": "Cristales exteriores de escaleras eléctricas (Cinemex)",
        "descripcion": build_description(
            "En Zona 4, frente al acceso del pórtico 4 y al acceso a segunda planta hacia Cinemex.",
            "Vinil autoadherible",
            "2.77 m x 3.65 m.",
        ),
        "material": "Vinil autoadherible",
        "measure": {"width": 2.77, "height": 3.65, "unit": "M"},
        "image": ("pedro", 17, "cristales_exteriores_cinemex"),
    },
    {
        "id": "tj3vy2mph97qpet",
        "clave": "Z4-2 VAR 2",
        "nombre": "Cristales exteriores de escaleras eléctricas (Zara Home)",
        "descripcion": build_description(
            "En Zona 4, frente a Zara Home, en el acceso a Zona Moda.",
            "Vinil autoadherible",
            "2.77 m x 3.65 m.",
        ),
        "material": "Vinil autoadherible",
        "measure": {"width": 2.77, "height": 3.65, "unit": "M"},
        "image": ("pedro", 21, "cristales_exteriores_zarahome"),
    },
    {
        "id": "ix7ivvnp0aedut6",
        "clave": "Z4-2 VAR 3",
        "nombre": "Cristal exterior de escaleras eléctricas (H&M / Zona Moda)",
        "descripcion": build_description(
            "En Zona 4, frente a H&M, en el acceso a Zona Moda.",
            "Vinil autoadherible",
            "Variable (solo 1 cristal).",
        ),
        "material": "Vinil autoadherible",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 22, "cristal_exterior_hm_zonamoda"),
    },
    {
        "id": "sh9t7vtwx6er63r",
        "clave": "Z4-3",
        "nombre": "Cristal superior zona de cajeros",
        "descripcion": build_description(
            "En Zona 6, frente a H&M, de cara a la explanada de la fuente y diversas islas.",
            "Vinil normal mate",
            "4.80 m x 1.00 m.",
        ),
        "material": "Vinil normal mate",
        "measure": {"width": 4.80, "height": 1.00, "unit": "M"},
        "image": ("pedro", 18, "cristal_superior_cajeros"),
    },
    {
        "id": "nt1unoh98nznl6q",
        "clave": "Z5-2",
        "nombre": "Elevador panorámico",
        "descripcion": build_description(
            "En Zona 5, frente al acceso del pórtico 4 y al acceso a segunda planta hacia Cinemex.",
            "Vinil autoadherible",
            "2.14 m x 9.77 m.",
        ),
        "material": "Vinil autoadherible",
        "measure": {"width": 2.14, "height": 9.77, "unit": "M"},
        "image": ("pedro", 19, "elevador_panoramico"),
    },
    {
        "id": "5quh30ozvya5x68",
        "clave": "Z6-1",
        "nombre": "Cristales laterales de escaleras Banana Republic",
        "descripcion": build_description(
            "En Zona 6, de cara al pasillo principal frente a Banana Republic, Stradivarius y locales cercanos.",
            "Vinil autoadherible",
            "Pendiente por confirmar en catálogo técnico.",
        ),
        "material": "Vinil autoadherible",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 20, "cristales_banana_republic"),
    },
    {
        "id": "wm171q36no0vcfu",
        "clave": "Z7-12",
        "nombre": "Puente central de pasillo (cara a zona de cajeros)",
        "descripcion": build_description(
            "En Zona 6, frente a H&M y Vans, de cara a Zona de Cajeros. Referencia técnica: Puente Zona Moda sobre Chilim Balam.",
            "Vinil normal mate con protección UV",
            "12.00 m x 1.00 m.",
        ),
        "material": "Vinil normal mate con protección UV",
        "measure": {"width": 12.0, "height": 1.0, "unit": "M"},
        "image": ("pedro", 23, "puente_central_cajeros"),
    },
    {
        "id": "pmzi3yx7bs23jf2",
        "clave": "Z7-12 VAR 2",
        "nombre": "Puente central de pasillo (cara a escaleras eléctricas)",
        "descripcion": build_description(
            "En Zona 6, frente a H&M y Vans, de cara a escaleras eléctricas. Referencia técnica: Puente Foro Moda sobre Haagen-Dazs.",
            "Vinil normal mate con protección UV",
            "24.00 m x 1.00 m.",
        ),
        "material": "Vinil normal mate con protección UV",
        "measure": {"width": 24.0, "height": 1.0, "unit": "M"},
        "image": ("pedro", 24, "puente_central_escaleras"),
    },
    {
        "id": "yhs2svw356lbcqo",
        "clave": "Z6-4",
        "nombre": "Dorso de elevador zona 6",
        "descripcion": build_description(
            "En Zona 6, a la salida del subterráneo, de cara al pasillo principal.",
            "Vinil autoadherible",
            "Pendiente por confirmar en catálogo técnico.",
        ),
        "material": "Vinil autoadherible",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 25, "dorso_elevador_zona6"),
    },
    {
        "id": "gn4s2t8k7w9hr8j",
        "clave": "Z6-1 VAR 2",
        "nombre": "Escaleras eléctricas subterráneo Liverpool (2 caras)",
        "descripcion": build_description(
            "En Zona 7, a la salida del subterráneo que da a Liverpool, Hills y al foro de ZM (incluye ambas caras laterales).",
            "Vinil autoadherible",
            "Pendiente por confirmar en catálogo técnico.",
        ),
        "material": "Vinil autoadherible",
        "measure": PENDING_MEASURE,
        "image": ("pedro", 26, "subterraneo_liverpool"),
    },
    {
        "id": "rxf3dfh4akkf1xt",
        "clave": "EST 253 E-F",
        "nombre": "Paquete de 5 pendones de estacionamiento",
        "descripcion": build_description(
            "Variedad de zonas en estacionamiento.",
            "Lona en bastidor",
            "1.20 m x 3.10 m por pendón (paquete de 5).",
        ),
        "material": "Lona en bastidor",
        "measure": {"width": 1.20, "height": 3.10, "unit": "M"},
        "image": ("pedro", 27, "pendones_estacionamiento"),
    },
    {
        "id": "2kfryzhbcd0xa28",
        "clave": "EST 254 E-G",
        "nombre": "Paquete de 10 plumas de estacionamiento",
        "descripcion": build_description(
            "Variedad de zonas en estacionamiento.",
            "Coroplast 3 mm con impresión directa",
            "1.30 m x 0.30 m por pluma (paquete de 10).",
        ),
        "material": "Coroplast 3 mm con impresión directa",
        "measure": {"width": 1.30, "height": 0.30, "unit": "M"},
        "image": ("pedro", 28, "plumas_estacionamiento"),
    },
    {
        "id": "h2g6y3aodqecsrw",
        "clave": "PENDIENTE 2",
        "nombre": "Cristales módulo de información frente a Telcel",
        "descripcion": build_description(
            "Frente a Telcel, en el módulo de información.",
            "Vinil normal mate",
            "4.95 m x 0.85 m.",
        ),
        "material": "Vinil normal mate",
        "measure": {"width": 4.95, "height": 0.85, "unit": "M"},
        "image": ("medel", 6, "modulo_informacion_telcel"),
    },
]


NEW_SPACES = [
    {
        "clave": "pen-1",
        "legacy_id": 29,
        "nombre": "Pantallas en cajeros estacionamiento",
        "descripcion": build_description(
            "19 pantallas en cajeros de estacionamiento, variedad de zonas.",
            'Imagen fija JPG',
            "3342 px x 2507 px.",
        ),
        "material": "Imagen fija JPG",
        "measure": PENDING_MEASURE,
        "tipo": "digital",
        "etiquetas": ["Pantallas", "Estacionamiento", "Digital"],
        "requisitos": "Especificaciones: imagen fija en formato JPG.",
        "image": ("pedro", 29, "pantallas_cajeros_estacionamiento"),
    },
    {
        "clave": "pen-2",
        "legacy_id": 30,
        "nombre": "Puertas elevadores varias zonas",
        "descripcion": build_description(
            "Varias zonas.",
            "Vinil normal mate panelado en 2 partes",
            "0.90 m x 2.10 m (ancho total de las dos puertas).",
        ),
        "material": "Vinil normal mate panelado en 2 partes",
        "measure": {"width": 0.90, "height": 2.10, "unit": "M"},
        "tipo": "publicidad",
        "etiquetas": ["Elevador", "Puertas", "Vinil"],
        "requisitos": "",
        "image": ("medel", 7, "puertas_elevadores"),
    },
    {
        "clave": "pen-3",
        "legacy_id": 31,
        "nombre": "Cubo escaleras eléctricas hacia Fast Food",
        "descripcion": build_description(
            "Hacia Fast Food.",
            "Vinil normal mate con protección UV",
            "2 caras: 1.90 m x 3.70 m y 2.80 m x 3.70 m.",
        ),
        "material": "Vinil normal mate con protección UV",
        "measure": PENDING_MEASURE,
        "tipo": "publicidad",
        "etiquetas": ["Escaleras", "Fast Food", "Vinil"],
        "requisitos": "",
        "image": ("medel", 11, "cubo_escaleras_fast_food"),
    },
    {
        "clave": "pen-4",
        "legacy_id": 32,
        "nombre": "Cristal elevador Italian Coffee",
        "descripcion": build_description(
            "Elevador en zona Italian Coffee.",
            "Vinil microperforado con protección UV",
            "2.20 m x 9.50 m.",
        ),
        "material": "Vinil microperforado con protección UV",
        "measure": {"width": 2.20, "height": 9.50, "unit": "M"},
        "tipo": "publicidad",
        "etiquetas": ["Elevador", "Italian Coffee", "Vinil"],
        "requisitos": "",
        "image": ("medel", 13, "cristal_elevador_italian_coffee"),
    },
    {
        "clave": "pen-5",
        "legacy_id": 33,
        "nombre": "Cristal elevador frente a Fast Food",
        "descripcion": build_description(
            "Elevador frente a Fast Food.",
            "Vinil microperforado con protección UV",
            "2.35 m x 9.80 m.",
        ),
        "material": "Vinil microperforado con protección UV",
        "measure": {"width": 2.35, "height": 9.80, "unit": "M"},
        "tipo": "publicidad",
        "etiquetas": ["Elevador", "Fast Food", "Vinil"],
        "requisitos": "",
        "image": ("medel", 14, "cristal_elevador_fast_food"),
    },
    {
        "clave": "pen-6",
        "legacy_id": 34,
        "nombre": "Cristal elevador Zona Moda",
        "descripcion": build_description(
            "Elevador en Zona Moda.",
            "Vinil microperforado con protección UV",
            "2.75 m x 10.50 m.",
        ),
        "material": "Vinil microperforado con protección UV",
        "measure": {"width": 2.75, "height": 10.50, "unit": "M"},
        "tipo": "publicidad",
        "etiquetas": ["Elevador", "Zona Moda", "Vinil"],
        "requisitos": "",
        "image": ("medel", 15, "cristal_elevador_zona_moda"),
    },
]


def main() -> None:
    backup_path = backup_database()
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(DB_PATH) as conn, fitz.open(PEDRO_PDF) as pedro_doc, fitz.open(MEDEL_PDF) as medel_doc:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        rows = cur.execute("SELECT * FROM espacios WHERE tenant = 'plaza_mayor'").fetchall()
        spaces_by_id = {row["id"]: dict(row) for row in rows}
        existing_ids = {row["id"] for row in rows}
        report = {
            "backup": str(backup_path.relative_to(ROOT)),
            "updated": [],
            "inserted": [],
            "skipped_images": [],
        }

        for item in CURRENT_UPDATES:
            record = spaces_by_id[item["id"]]
            record["clave"] = item["clave"]
            record["nombre"] = item["nombre"]
            record["descripcion"] = item["descripcion"]
            record["material"] = item["material"]
            record["medida_ancho"] = item["measure"]["width"]
            record["medida_alto"] = item["measure"]["height"]
            record["medida_unidad"] = item["measure"]["unit"]

            pdf_key, page_number, label = item["image"]
            source_doc = pedro_doc if pdf_key == "pedro" else medel_doc
            source_crop = PEDRO_CROP if pdf_key == "pedro" else MEDEL_CROP
            crop_path = save_crop(source_doc, pdf_key, page_number, source_crop, label)
            field, filename = attach_image(record, crop_path)
            if field is None:
                report["skipped_images"].append({"id": record["id"], "nombre": record["nombre"], "reason": "sin campos disponibles"})

            update_space(cur, record)
            report["updated"].append(
                {
                    "id": record["id"],
                    "clave": record["clave"],
                    "nombre": record["nombre"],
                    "image_field": field,
                    "image_file": filename,
                }
            )

        for idx, item in enumerate(NEW_SPACES):
            record_id = generate_record_id(existing_ids)
            created_at = now_pb_timestamp()
            payload = {
                "activa": 1,
                "activo": 1,
                "ajuste_porcentaje": 0,
                "ajuste_tipo": "ninguno",
                "clave": item["clave"],
                "color": ["#d32f2f", "#c1621e", "#1f3db2", "#0760ed", "#02d911", "#5b21b6"][idx % 6],
                "config_b2b": None,
                "created_at": created_at,
                "descripcion": item["descripcion"],
                "dias_bloqueados": None,
                "etiquetas": json.dumps(item["etiquetas"], ensure_ascii=False),
                "id": record_id,
                "imagen_url": "",
                "impuestos_ids": json.dumps([1]),
                "legacy_id": item["legacy_id"],
                "nombre": item["nombre"],
                "precio_base": 0,
                "precios_por_dia": None,
                "requisitos": item["requisitos"],
                "tenant": "plaza_mayor",
                "tipo": item["tipo"],
                "imagen": "",
                "imagen2": "",
                "imagen3": "",
                "imagen4": "",
                "imagen5": "",
                "material": item["material"],
                "medida_ancho": item["measure"]["width"],
                "medida_alto": item["measure"]["height"],
                "medida_unidad": item["measure"]["unit"],
            }
            pdf_key, page_number, label = item["image"]
            source_doc = pedro_doc if pdf_key == "pedro" else medel_doc
            source_crop = PEDRO_CROP if pdf_key == "pedro" else MEDEL_CROP
            crop_path = save_crop(source_doc, pdf_key, page_number, source_crop, label)
            field, filename = attach_image(payload, crop_path)
            if field is None:
                raise RuntimeError(f"No se pudo adjuntar imagen para {payload['nombre']}")

            insert_space(cur, payload)
            report["inserted"].append(
                {
                    "id": payload["id"],
                    "clave": payload["clave"],
                    "nombre": payload["nombre"],
                    "image_field": field,
                    "image_file": filename,
                }
            )

        conn.commit()
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
