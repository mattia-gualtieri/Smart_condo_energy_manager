import json
import serial
import serial.tools.list_ports
import time
import paho.mqtt.client as mqtt

# ==========================================
# CONFIGURAZIONE HARDWARE LOCALE
# ==========================================
SERIAL_PORT = 'COM3'# Porta seriale fisica di Arduino
BAUD_RATE = 115200

# ==========================================
# MQTT CLOUD CONFIGURATION (CONDOMINIUM)
# ==========================================
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883

APARTMENT_ID = "appartamento_01"

# MQTT topics dedicated to the apartment
TOPIC_TELEMETRY = f"progetto_iot_luca_mattia/{APARTMENT_ID}/telemetria"
TOPIC_COMMANDS = f"progetto_iot_luca_mattia/{APARTMENT_ID}/comandi"

serial_conn = None

# ==========================================
# 1. CALLBACK MQTT (DOWNLINK: CLOUD -> ARDUINO)
# ==========================================
def on_mqtt_message(client, userdata, msg):
    """
    Riceve i comandi inviati dal Cloud sul topic 'progetto_iot_luca_mattia/appartamento_01/comandi'
    e li invia ad Arduino tramite Seriale.
    """
    global serial_conn
    try:
        command = msg.payload.decode('utf-8').strip()
        print(f"\n[CLOUD -> GATEWAY] Received MQTT command: {command}")
        
        if serial_conn and serial_conn.is_open:
            serial_conn.write(f"{command}\n".encode('utf-8'))
            print(f"[GATEWAY -> ARDUINO] Sent on Serial ({SERIAL_PORT}): {command}")

        else:
            print("ERROR: Serial port not open.")
            
    except Exception as e:
        print(f"Errore durante l'inoltro del comando ad Arduino: {e}")

def on_mqtt_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("Connected to MQTT Cloud Broker!")
        # Subscribe ONLY to the commands topic for this apartment
        client.subscribe(TOPIC_COMMANDS)
        print(f"Listening on: '{TOPIC_COMMANDS}'\n")
    else:
        print(f"MQTT Broker connection error (Code: {rc})")

# ==========================================
# 2. SETUP CLIENT MQTT
# ==========================================
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.on_connect = on_mqtt_connect
mqtt_client.on_message = on_mqtt_message

# ==========================================
# 3.(UPLINK: ARDUINO -> CLOUD)
# ==========================================
def start_gateway():
    global serial_conn

    print("=" * 65)
    print(f" GATEWAY IOT CLOUD - [{APARTMENT_ID.upper()}]")
    print("=" * 65)

    # Connessione Seriale ad Arduino
    try:
        serial_conn = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
        time.sleep(2)  # Wait for Arduino hardware reset
        print(f"Connected to Arduino on {SERIAL_PORT}!")
    except serial.SerialException:
        print(f"\nERROR: Unable to open port {SERIAL_PORT}!")
        print("Available serial ports:")
        for p in serial.tools.list_ports.comports():
            print(f"   • {p.device} - {p.description}")
        return

    # Connessione MQTT Broker Cloud
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
    except Exception as e:
        print(f"Impossibile connettersi al Broker MQTT: {e}")
        return

    print("Gateway in ascolto... Inoltro telemetria al Cloud.\n")

    
    # Ciclo di lettura continuativo dalla Seriale
    try:
        while True:
            raw_line = serial_conn.readline().decode('utf-8', errors='ignore').strip()
            
            if raw_line and raw_line.startswith("{"):
                try:
                    data = json.loads(raw_line)

                    # 1. Pubblica TUTTI i messaggi JSON validi al Cloud (Telemetria + Eventi Pulsante)
                    mqtt_client.publish(TOPIC_TELEMETRY, raw_line)

                    # 2. Log di controllo a schermo
                    if "info" in data:
                        print(f"[EVENTO ARDUINO -> CLOUD] {data.get('info')} su Carico {data.get('carico')}")
                    elif "warning" in data:
                        print(f"[WARNING ARDUINO -> CLOUD] {data.get('warning')} su Carico {data.get('carico')}")
                    elif "totale_w" in data:
                        print(f"[TELEMETRIA -> CLOUD] {raw_line}")

                except json.JSONDecodeError:
                    pass

    except KeyboardInterrupt:
        print("\nArresto Gateway...")   

    except KeyboardInterrupt:
        print("\nArresto Gateway...")
    finally:
        if serial_conn and serial_conn.is_open:
            serial_conn.close()
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
        print("Gateway chiuso.")

if __name__ == "__main__":
    start_gateway()