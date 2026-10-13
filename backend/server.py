import json
import time
from typing import Any, Dict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt
from pydantic import BaseModel, Field
import uvicorn
from db.database import init_db, log_telemetria_completa, carica_configurazione_iniziale, salva_limite_condominio_db, salva_contratto_appartamento_db, salva_config_carico_db
import os
import joblib
from datetime import datetime
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

# ==========================================
# 1. PARAMETRI DI RETE E BROKER MQTT
# ==========================================
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883

# Topic Wildcard (+ rappresenta qualsiasi appartamento)
TOPIC_TELEMETRY_WILDCARD = "progetto_iot_luca_mattia/+/telemetria"

# ==========================================
# 2. INIZIALIZZAZIONE FASTAPI E CORS
# ==========================================
app = FastAPI(
    title="IoT Smart Condominium Cloud Engine",
    description="Server Cloud Multi-Tenant per N Appartamenti con Machine Learning Predittivo",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 3. DIGITAL TWIN (MEMORIA DINAMICA)
# ==========================================
digital_twin: Dict[str, Any] = {
    "limite_condominio_w": 8000.0,
    "appartamenti": {}
}

DEFAULT_CARICHI_CONFIG = {
    "carico_1": {"nome": "Presa_1", "priorita": 1},
}

# ==========================================
# 3.1 CONFIGURAZIONE MACHINE LEARNING
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ML_DIR = os.path.join(BASE_DIR, "ml")

# Caricamento Modello Globale Condominio
try:
    path_modello_condo = os.path.join(ML_DIR, "modello_condominio.pkl")
    modello_condo = joblib.load(path_modello_condo)
    print("🧠 [ML CONDOMINIO] Modello globale caricato con successo!")
except Exception:
    modello_condo = None
    print("⚠️ [ML CONDOMINIO] Modello globale non trovato. Verrà usata solo la logica standard.")

modelli_appartamenti: Dict[str, Any] = {}
potenza_passata_condominio = 0.0
potenze_passate_app: Dict[str, float] = {}


# ==========================================
# 4. ENGINE LOGICA DI CONTROLLO E SGANCIO (ML + REATTIVA)
# ==========================================
def processa_telemetria_appartamento(app_id: str, payload_data: dict):
    # ------------------------------------------------------------------
    # 0. GESTIONE EVENTO PULSANTE FISICO (RESET MEMORIA HARDWARE)
    # ------------------------------------------------------------------
    if payload_data.get("info") == "MEMORIA_RESETTATA":
        carico_num = payload_data.get("carico")
        if carico_num:
            key_carico = f"carico_{carico_num}"
            topic_comando = f"progetto_iot_luca_mattia/{app_id}/comandi"
            comando_msg = f"CMD:{key_carico}:ON"

            if (
                app_id in digital_twin["appartamenti"]
                and key_carico in digital_twin["appartamenti"][app_id]["carichi"]
            ):
                carico_ref = digital_twin["appartamenti"][app_id]["carichi"][key_carico]
                carico_ref["sganciato_da_cloud"] = False
                carico_ref["stato"] = True

            mqtt_client.publish(topic_comando, comando_msg)
            print(
                f"[PULSANTE PREMUTO] Reset manuale per Carico {carico_num}. Inviato: {comando_msg}"
            )
        return

    # ------------------------------------------------------------------
    # A. REGISTRAZIONE DINAMICA APPARTAMENTO
    # ------------------------------------------------------------------
    if app_id not in digital_twin["appartamenti"]:
        print(f"[NUOVO APPARTAMENTO] Registrato automaticamente: {app_id.upper()}")
        digital_twin["appartamenti"][app_id] = {
            "contratto_w": 3000.0,
            "potenza_totale_w": 0.0,
            "stato_allarme": False,
            "ultimo_riattacco": 0,
            "carichi": {
                k: {
                    "nome": v.get("nome", k),
                    "priorita": v.get("priorita", 3),
                    "potenza_w": 0.0,
                    "stato": True,
                    "sganciato_da_cloud": False,
                }
                for k, v in DEFAULT_CARICHI_CONFIG.items()
            },
        }

    app_data = digital_twin["appartamenti"][app_id]
    totale_w = float(payload_data.get("totale_w", 0.0))
    app_data["potenza_totale_w"] = totale_w

    # ------------------------------------------------------------------
    # B. GESTIONE DINAMICA DI N CARICHI E CONFERMA DA TELEMETRIA
    # ------------------------------------------------------------------
    for key, valore in payload_data.items():
        if key.startswith("carico_"):
            valore_w = float(valore)

            if key not in app_data["carichi"]:
                num_carichi = len(app_data["carichi"])
                priorita_default = min(num_carichi + 1, 3)

                app_data["carichi"][key] = {
                    "nome": f"Presa_{num_carichi + 1}",
                    "priorita": priorita_default,
                    "potenza_w": 0.0,
                    "stato": True,
                    "sganciato_da_cloud": False,
                }

            carico_obj = app_data["carichi"][key]
            carico_obj["potenza_w"] = valore_w

            if valore_w > 0:
                carico_obj["stato"] = True
                carico_obj["sganciato_da_cloud"] = False

    limite_app = app_data["contratto_w"]

    # ------------------------------------------------------------------
    # C1. PREDIZIONE MACHINE LEARNING (PROATTIVA)
    # ------------------------------------------------------------------
    ora_attuale = datetime.now()

    # 1. Caricamento dinamico modello locale appartamento se non presente in RAM
    if app_id not in modelli_appartamenti:
        try:
            path_app = os.path.join(ML_DIR, f"modello_{app_id}.pkl")
            modelli_appartamenti[app_id] = joblib.load(path_app)
            print(f"🧠 [ML LOCALE] Caricato modello per {app_id}")
        except Exception:
            modelli_appartamenti[app_id] = None

    previsione_locale = totale_w
    modello_app = modelli_appartamenti[app_id]
    if modello_app is not None:
        p_passata_app = potenze_passate_app.get(app_id, totale_w)
        dati_locali = [[ora_attuale.hour, ora_attuale.minute, ora_attuale.weekday(), totale_w, p_passata_app]]
        try:
            previsione_locale = modello_app.predict(dati_locali)[0]
            print(f"🔮 [{app_id.upper()} PREVISIONE] Tra 5 min: {previsione_locale:.1f}W (Contratto: {limite_app}W)")
        except Exception as e:
            print(f"⚠️ Errore predizione ML locale per {app_id}: {e}")

    potenze_passate_app[app_id] = totale_w

    # Calcolo totale condominio attuale
    totale_condominio = sum(a["potenza_totale_w"] for a in digital_twin["appartamenti"].values())
    limite_condominio = digital_twin["limite_condominio_w"]

    # 2. Predizione Globale Condominio
    global potenza_passata_condominio
    previsione_condo = totale_condominio
    if modello_condo is not None:
        dati_condo = [[ora_attuale.hour, ora_attuale.minute, ora_attuale.weekday(), totale_condominio, potenza_passata_condominio]]
        try:
            previsione_condo = modello_condo.predict(dati_condo)[0]
            print(f"🔮 [CONDOMINIO PREVISIONE] Totale palazzo tra 5 min: {previsione_condo:.1f}W (Limite: {limite_condominio}W)")
        except Exception as e:
            print(f"⚠️ Errore predizione ML condominio: {e}")

    potenza_passata_condominio = totale_condominio

    # ------------------------------------------------------------------
    # C2. GESTIONE STATO ALLARME (REATTIVO + PREDITTIVO ML)
    # ------------------------------------------------------------------
    if totale_condominio > limite_condominio or previsione_condo > limite_condominio:
        stato_allarme = 2  # 🔴 ROSSO: Emergenza Reattiva o Predittiva Globale
    elif totale_condominio > limite_condominio * 0.90 or previsione_condo > limite_condominio * 0.90:
        stato_allarme = 1  # 🟡 GIALLO: Pre-Allarme Predittivo (Soft Rule)
    else:
        stato_allarme = 0  # 🟢 VERDE: Tutto nella norma

    log_telemetria_completa(
        app_id=app_id,
        app_data=digital_twin["appartamenti"][app_id],
        potenza_condo=totale_condominio,
        limite_condo=limite_condominio,
        stato_allarme=stato_allarme
    )

    margine_sicurezza_condominio = limite_condominio * 0.95
    margine_sicurezza_appartamento = limite_app * 0.9

    # ------------------------------------------------------------------
    # C3. LOGICA DI SGANCIO APPARTAMENTO (ATTUALE O PREVISTO DA ML)
    # ------------------------------------------------------------------
    if totale_w > limite_app or previsione_locale > limite_app:
        app_data["stato_allarme"] = True
        motivo = "sovraccarico attuale" if totale_w > limite_app else "previsione ML di sovraccarico"
        print(f"⚠️ [ALLARME] {app_id.upper()} ({motivo}) -> Consumo: {totale_w}W, Previsto: {previsione_locale:.1f}W (Limite: {limite_app}W)")

        carichi_attivi = [
            k
            for k, v in app_data["carichi"].items()
            if (v["stato"] or v["potenza_w"] > 0) and not v["sganciato_da_cloud"]
        ]

        if carichi_attivi:
            carico_da_staccare = max(
                carichi_attivi, key=lambda x: app_data["carichi"][x]["priorita"]
            )

            carico_obj = app_data["carichi"][carico_da_staccare]
            carico_obj["potenza_ultima_nota"] = carico_obj["potenza_w"]
            carico_obj["sganciato_da_cloud"] = True
            carico_obj["stato"] = False

            topic_comando = f"progetto_iot_luca_mattia/{app_id}/comandi"
            comando_msg = f"CMD:{carico_da_staccare}:OFF"

            mqtt_client.publish(topic_comando, comando_msg)
            print(f"🔴 [CLOUD -> {app_id.upper()}] Sgancio inviato: {comando_msg}")

    # ------------------------------------------------------------------
    # D. LOGICA DI RIATTACCO AUTOMATICO APPARTAMENTO
    # ------------------------------------------------------------------
    else:
        app_data["stato_allarme"] = False

        carichi_sganciati = [
            k for k, v in app_data["carichi"].items() if v["sganciato_da_cloud"]
        ]

        if carichi_sganciati:
            tempo_attuale = time.time()
            ultimo_tentativo = app_data.get("ultimo_riattacco", 0)

            if tempo_attuale - ultimo_tentativo >= 3.0:
                carico_da_riattaccare = min(
                    carichi_sganciati,
                    key=lambda x: app_data["carichi"][x]["priorita"],
                )

                c_obj = app_data["carichi"][carico_da_riattaccare]
                potenza_stimata_carico = c_obj.get("potenza_ultima_nota", 500.0)

                if (totale_w + potenza_stimata_carico <= margine_sicurezza_appartamento) and \
                   (totale_condominio + potenza_stimata_carico <= margine_sicurezza_condominio):
                    
                    topic_comando = f"progetto_iot_luca_mattia/{app_id}/comandi"
                    comando_msg = f"CMD:{carico_da_riattaccare}:ON"

                    mqtt_client.publish(topic_comando, comando_msg)
                    
                    c_obj["sganciato_da_cloud"] = False
                    c_obj["stato"] = True
                    app_data["ultimo_riattacco"] = tempo_attuale

                    print(f"🟢 [RIATTACCO CONSENTITO] Inviato comando: {comando_msg}")
                else:
                    print(f"⏳ [RIATTACCO RIMANDATO] L'appartamento o il palazzo non hanno abbastanza margine per {potenza_stimata_carico}W")
                    app_data["ultimo_riattacco"] = tempo_attuale

    # ------------------------------------------------------------------
    # E. MONITORAGGIO E LOGICA GLOBALE CONDOMINIO (ATTUALE O PREVISTO DA ML)
    # ------------------------------------------------------------------
    if totale_condominio > limite_condominio or previsione_condo > limite_condominio:
        motivo_condo = "consumo attuale" if totale_condominio > limite_condominio else "previsione ML globale"
        print(f"🚨 [ALLARME PALAZZO] ({motivo_condo}) -> Totale: {totale_condominio}W, Previsto: {previsione_condo:.1f}W (Limite: {limite_condominio}W)")
        
        appartamenti_attivi = list(digital_twin["appartamenti"].items())
        if appartamenti_attivi:
            appartamento_peggiore_id, appartamento_peggiore_data = max(
                appartamenti_attivi, key=lambda x: x[1]["potenza_totale_w"]
            )

            carichi_appartamento = [
                (car_id, car_data) for car_id, car_data in appartamento_peggiore_data["carichi"].items()
                if (car_data["stato"] or car_data["potenza_w"] > 0) and not car_data["sganciato_da_cloud"]
            ]

            if carichi_appartamento:
                carico_da_staccare_id, c_data = max(carichi_appartamento, key=lambda x: x[1]["priorita"])

                c_data["potenza_ultima_nota"] = c_data["potenza_w"]
                c_data["sganciato_da_cloud"] = True
                c_data["stato"] = False
                
                topic = f"progetto_iot_luca_mattia/{appartamento_peggiore_id}/comandi"
                comando = f"CMD:{carico_da_staccare_id}:OFF"
                mqtt_client.publish(topic, comando)
                
                print(f"🏢 [PALAZZO -> {appartamento_peggiore_id.upper()}] Sgancio equo: spento '{carico_da_staccare_id}'")
                
    elif totale_condominio <= margine_sicurezza_condominio:
        carichi_da_riattaccare = []
        for a_id, a_data in digital_twin["appartamenti"].items():
            for car_id, car_data in a_data["carichi"].items():
                if car_data.get("sganciato_da_cloud"):
                    carichi_da_riattaccare.append({
                        "app_id": a_id,
                        "car_id": car_id,
                        "priorita": car_data["priorita"],
                        "potenza_stimata": car_data.get("potenza_ultima_nota", 500.0),
                        "app_data": a_data
                    })

        if carichi_da_riattaccare:
            tempo_attuale = time.time()
            ultimo_tentativo_globale = digital_twin.get("ultimo_riattacco_globale", 0)

            if tempo_attuale - ultimo_tentativo_globale >= 5.0:
                migliore = min(carichi_da_riattaccare, key=lambda x: x["priorita"])
                
                app_target = migliore["app_id"]
                car_target = migliore["car_id"]
                potenza_stimata = migliore["potenza_stimata"]
                app_data_target = migliore["app_data"]
                
                limite_app_target = app_data_target["contratto_w"]
                
                if (totale_condominio + potenza_stimata <= margine_sicurezza_condominio) and \
                   (app_data_target["potenza_totale_w"] + potenza_stimata <= limite_app_target * 0.9):
                    
                    topic = f"progetto_iot_luca_mattia/{app_target}/comandi"
                    comando = f"CMD:{car_target}:ON"
                    mqtt_client.publish(topic, comando)
                    
                    app_data_target["carichi"][car_target]["sganciato_da_cloud"] = False
                    app_data_target["carichi"][car_target]["stato"] = True
                    
                    print(f"🟢 [PALAZZO -> {app_target.upper()}] Riattacco automatico globale: riacceso '{car_target}'")
                
                digital_twin["ultimo_riattacco_globale"] = tempo_attuale


# ==========================================
# 5. CALLBACKS MQTT
# ==========================================
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("✅ Server Cloud connesso al Broker MQTT!")
        client.subscribe(TOPIC_TELEMETRY_WILDCARD)
        print(f"In ascolto su: '{TOPIC_TELEMETRY_WILDCARD}'\n")


def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload_str = msg.payload.decode("utf-8").strip()
        data = json.loads(payload_str)

        parts = topic.split("/")
        app_id = parts[1]

        processa_telemetria_appartamento(app_id, data)

    except Exception as e:
        print(f"Errore nella lettura del messaggio MQTT: {e}")


mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message


# ==========================================
# 6. MODELLI PYDANTIC E API REST
# ==========================================
class ImpostaLimiteCondominioRequest(BaseModel):
    nuovo_limite_w: float = Field(..., gt=0)

class ComandoRequest(BaseModel):
    appartamento_id: str
    carico_id: str
    azione: str

class ConfiguraCaricoRequest(BaseModel):
    appartamento_id: str
    carico_id: str
    nuovo_nome: str
    nuova_priorita: int = Field(..., ge=1, le=3)

class ImpostaContrattoRequest(BaseModel):
    appartamento_id: str
    nuovo_limite_w: float = Field(..., gt=0)


@app.get("/api/digital_twin")
def get_digital_twin():
    return digital_twin


@app.get("/api/lista_appartamenti")
def get_lista_appartamenti():
    return list(digital_twin["appartamenti"].keys())


@app.get("/api/appartamento/{app_id}")
def get_stato_appartamento(app_id: str):
    if app_id not in digital_twin["appartamenti"]:
        raise HTTPException(status_code=404, detail="Appartamento non trovato")
    return digital_twin["appartamenti"][app_id]


@app.post("/api/comando")
def invia_comando_manuale(req: ComandoRequest):
    app_id = req.appartamento_id
    carico_id = req.carico_id
    azione = req.azione.upper()

    if azione not in ["ON", "OFF"]:
        raise HTTPException(status_code=400, detail="L'azione deve essere 'ON' o 'OFF'")

    if app_id not in digital_twin["appartamenti"]:
        raise HTTPException(status_code=404, detail="Appartamento non trovato")

    carichi_app = digital_twin["appartamenti"][app_id]["carichi"]
    if carico_id not in carichi_app:
        raise HTTPException(status_code=404, detail="Carico non trovato")

    topic_comando = f"progetto_iot_luca_mattia/{app_id}/comandi"
    comando_msg = f"CMD:{carico_id}:{azione}"
    mqtt_client.publish(topic_comando, comando_msg)

    carichi_app[carico_id]["sganciato_da_cloud"] = False
    carichi_app[carico_id]["stato"] = azione == "ON"

    return {"status": "success", "message": f"Comando {comando_msg} inviato"}


@app.put("/api/configura_carico")
def configura_carico(req: ConfiguraCaricoRequest):
    app_id = req.appartamento_id
    carico_id = req.carico_id
    nuova_priorita = req.nuova_priorita

    digital_twin["appartamenti"][app_id]["carichi"][carico_id]["priorita"] = nuova_priorita
    salva_config_carico_db(app_id, carico_id, nuova_priorita)
    
    return {"status": "success"}


@app.put("/api/imposta_contratto")
def imposta_contratto(req: ImpostaContrattoRequest):
    app_id = req.appartamento_id
    nuovo_limite_w = req.nuovo_limite_w

    digital_twin["appartamenti"][app_id]["contratto_w"] = nuovo_limite_w    
    salva_contratto_appartamento_db(app_id, nuovo_limite_w)
    
    print(f"📝 [{app_id.upper()}] Nuovo contratto salvato: {nuovo_limite_w}W")
    return {"status": "success", "nuovo_limite_w": nuovo_limite_w}


@app.put("/api/imposta_limite_condominio")
def imposta_limite_condominio(req: ImpostaLimiteCondominioRequest):
    nuovo_limite_w = req.nuovo_limite_w
    salva_limite_condominio_db(nuovo_limite_w)
    digital_twin["limite_condominio_w"] = nuovo_limite_w
    
    print(f"🏢 [CONDOMINIO] Limite generale aggiornato a: {nuovo_limite_w}W")

    return {
        "status": "success",
        "message": "Limite generale del condominio aggiornato con successo",
        "nuovo_limite_w": req.nuovo_limite_w,
    }


# ==========================================
# 7. MAIN EXECUTION
# ==========================================
if __name__ == "__main__":
    init_db()
    
    config = carica_configurazione_iniziale()

    digital_twin["limite_condominio_w"] = config["limite_condominio_w"]
    
    for app_id, contratto_w in config["contratti_appartamenti"].items():
        app_id = str(app_id).strip()

        if app_id not in digital_twin["appartamenti"]:
            digital_twin["appartamenti"][app_id] = {
                "contratto_w": contratto_w,
                "potenza_totale_w": 0.0,
                "stato_allarme": False,
                "ultimo_riattacco": 0,
                "carichi": {}
            }
        else:
            digital_twin["appartamenti"][app_id]["contratto_w"] = contratto_w

    for app_id, carichi in config["carichi_config"].items():
        app_id = str(app_id).strip()

        if app_id not in digital_twin["appartamenti"]:
            digital_twin["appartamenti"][app_id] = {
                "contratto_w": 3000.0,  
                "potenza_totale_w": 0.0,
                "stato_allarme": False,
                "ultimo_riattacco": 0,
                "carichi": {}
            }

        for car_id, info in carichi.items():
            car_id = str(car_id).strip()
            
            if car_id not in digital_twin["appartamenti"][app_id]["carichi"]:
                digital_twin["appartamenti"][app_id]["carichi"][car_id] = {
                    "priorita": info["priorita"],
                    "potenza_w": 0.0,
                    "stato": False,
                    "sganciato_da_cloud": False
                }
            else:
                digital_twin["appartamenti"][app_id]["carichi"][car_id]["priorita"] = info["priorita"]

    print(f"⚙️ [CONFIG] Limite Condominio ripristinato dal DB: {digital_twin['limite_condominio_w']} W")
    print(f"⚙️ [CONFIG] Appartamenti caricati dal DB: {list(digital_twin['appartamenti'].keys())}")

    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()

    print("🚀 Server Cloud avviato su http://0.0.0.0:8000!")
    uvicorn.run(app, host="0.0.0.0", port=8000)