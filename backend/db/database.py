import sqlite3
from datetime import datetime, timezone
import os

DB_NAME = "condominio.db"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, DB_NAME)

def get_db_connection():
    """
    Crea una connessione a SQLite con:
    1. Timeout di 30 secondi (attende se il DB è occupato anziché fallire subito).
    2. Modalità WAL (Write-Ahead Logging) per consentire letture e scritture contemporanee (ottimale per Grafana).
    """
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_db():
    """
    Inizializza il database creando le tabelle necessarie.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Tabella Totali (Vista Condominiale / ML Globale / Grafana)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS storico_appartamenti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            app_id TEXT,
            potenza_totale_app_w REAL,
            potenza_totale_condo_w REAL,
            limite_condominio_w REAL,
            stato_allarme_condominio INTEGER  -- 0: OK, 1: Pre-allarme ML, 2: Sgancio Reattivo
        )
    """)
    
    # 2. Tabella Dettaglio Prese
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS storico_carichi (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            app_id TEXT,
            carico_id TEXT,
            nome_carico TEXT,
            potenza_w REAL,
            priorita INTEGER,
            stato INTEGER,
            sganciato_da_cloud INTEGER
        )
    """)
    
    # 3. Tabella Configurazione Generale
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS configurazione_generale (
            chiave TEXT PRIMARY KEY,
            valore REAL
        )
    """)
    
    cursor.execute("""
        INSERT OR IGNORE INTO configurazione_generale (chiave, valore)
        VALUES ('limite_condominio_w', 12000.0)
    """)

    # 4. Tabella Contratti Appartamenti
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS configurazione_appartamenti (
            app_id TEXT PRIMARY KEY,
            contratto_w REAL
        )
    """)

    # 5. Tabella Personalizzazione Carichi
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS configurazione_carichi (
            app_id TEXT,
            carico_id TEXT,
            priorita INTEGER,
            PRIMARY KEY (app_id, carico_id)
        )
    """)
    
    conn.commit()
    conn.close()
    print("🗄️ [DATABASE] SQLite inizializzato in modalità WAL ad alta concorrenza.")


# ==========================================
# FUNZIONI PER TELEMETRIA E STORICO (GRAFANA)
# ==========================================

def log_telemetria_completa(app_id: str, app_data: dict, potenza_condo: float, limite_condo: float, stato_allarme: int = 0):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    timestamp_attuale = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    potenza_app = app_data.get("potenza_totale_w", 0.0)
    
    cursor.execute("""
        INSERT INTO storico_appartamenti 
        (timestamp, app_id, potenza_totale_app_w, potenza_totale_condo_w, limite_condominio_w, stato_allarme_condominio)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (timestamp_attuale, app_id, potenza_app, potenza_condo, limite_condo, stato_allarme))
    
    for car_id, car_info in app_data.get("carichi", {}).items():
        cursor.execute("""
            INSERT INTO storico_carichi 
            (timestamp, app_id, carico_id, nome_carico, potenza_w, priorita, stato, sganciato_da_cloud)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            timestamp_attuale,
            app_id,
            car_id,
            car_info.get("nome", car_id),
            car_info.get("potenza_w", 0.0),
            car_info.get("priorita", 3),
            1 if car_info.get("stato") else 0,
            1 if car_info.get("sganciato_da_cloud") else 0
        ))
        
    conn.commit()
    conn.close()


# ==========================================
# FUNZIONI PER PERSISTENZA CONFIGURAZIONI
# ==========================================

def salva_limite_condominio_db(limite_w: float):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO configurazione_generale (chiave, valore)
        VALUES ('limite_condominio_w', ?)
    """, (limite_w,))
    conn.commit()
    conn.close()


def salva_contratto_appartamento_db(app_id: str, contratto_w: float):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO configurazione_appartamenti (app_id, contratto_w)
        VALUES (?, ?)
    """, (app_id, contratto_w))
    conn.commit()
    conn.close()


def salva_config_carico_db(app_id: str, carico_id: str, priorita: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO configurazione_carichi (app_id, carico_id, priorita)
        VALUES (?, ?, ?)
    """, (app_id, carico_id, priorita))
    conn.commit()
    conn.close()


def carica_configurazione_iniziale():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT valore FROM configurazione_generale WHERE chiave = 'limite_condominio_w'")
    row = cursor.fetchone()
    limite_condominio = row[0] if row else 12000.0

    cursor.execute("SELECT app_id, contratto_w FROM configurazione_appartamenti")
    contratti_app = {r[0]: r[1] for r in cursor.fetchall()}

    cursor.execute("SELECT app_id, carico_id, priorita FROM configurazione_carichi")
    carichi_config = {}
    for app_id, carico_id, priorita in cursor.fetchall():
        if app_id not in carichi_config:
            carichi_config[app_id] = {}
        carichi_config[app_id][carico_id] = {"priorita": priorita}

    conn.close()

    return {
        "limite_condominio_w": limite_condominio,
        "contratti_appartamenti": contratti_app,
        "carichi_config": carichi_config
    }