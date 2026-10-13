import sqlite3
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
import joblib
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def prepara_features(df, colonna_potenza):
    """
    Funzione di supporto per creare le 'features' (input) e il 'target' (futuro a 5 min)
    uguale sia per il condominio che per i singoli appartamenti.
    """
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    
    # Variabili temporali
    df["ora"] = df["timestamp"].dt.hour
    df["minuto"] = df["timestamp"].dt.minute
    df["giorno_settimana"] = df["timestamp"].dt.dayofweek

    # Trend: potenza precedente (1 scatto fa)
    df["potenza_passata"] = df[colonna_potenza].shift(1)

    # Target: Potenza futura tra 5 scatti (~5 minuti)
    df["potenza_futura_5m"] = df[colonna_potenza].shift(-5)

    # Pulizia righe vuote derivanti dallo shift
    df = df.dropna()

    X = df[["ora", "minuto", "giorno_settimana", colonna_potenza, "potenza_passata"]]
    y = df["potenza_futura_5m"]
    
    return X, y

def addestra_tutti_i_modelli():
    print("📥 Connessione al database SQLite...")
    # Percorso corretto: da cloud/ml/ risaliamo in cloud/db/condominio.db
    db_path = os.path.join(BASE_DIR, "..", "db", "condominio.db")
    
    if not os.path.exists(db_path):
        print(f"⚠️ Database non trovato in {db_path}! Avvia prima il server FastAPI per popolare il DB.")
        return

    conn = sqlite3.connect(db_path)
    
    # Lettura dalla tabella corretta storico_appartamenti
    query = "SELECT timestamp, app_id, potenza_totale_app_w FROM storico_appartamenti ORDER BY timestamp ASC"
    df = pd.read_sql_query(query, conn)
    conn.close()

    if len(df) < 50:
        print("⚠️ Troppo pochi dati nel database per addestrare l'IA. Fai girare il sistema per raccogliere più dati!")
        return

    print(f"\n--------------------------------------------------")
    print("🧠 1. ADDESTRAMENTO MODELLO GLOBALE (CONDOMINIO)")
    print("--------------------------------------------------")
    
    # Raggruppamento dati condominio dalla tabella corretta
    df_condominio = df.groupby("timestamp")["potenza_totale_app_w"].sum().reset_index()
    df_condominio.rename(columns={"potenza_totale_app_w": "potenza_totale_condo"}, inplace=True)
    
    X_condo, y_condo = prepara_features(df_condominio, "potenza_totale_condo")
    
    if len(X_condo) > 20:
        modello_condo = RandomForestRegressor(n_estimators=100, random_state=42)
        modello_condo.fit(X_condo, y_condo)
        
        # Salvataggio diretto in BASE_DIR (che è già cloud/ml/)
        path_modello = os.path.join(BASE_DIR, "modello_condominio.pkl")
        joblib.dump(modello_condo, path_modello)
        print(f"✅ Modello Globale salvato in: {path_modello}")
    else:
        print("⚠️ Dati insufficienti per il modello globale.")

    print("\n--------------------------------------------------")
    print("🧠 2. ADDESTRAMENTO MODELLI LOCALI (SINGOLI APPARTAMENTI)")
    print("--------------------------------------------------")
    
    app_ids = df["app_id"].unique()
    print(f"Trovati {len(app_ids)} appartamenti nel DB: {list(app_ids)}")

    for app_id in app_ids:
        print(f"\n-> Elaborazione per l'appartamento: {app_id}")
        
        df_app = df[df["app_id"] == app_id].copy()
        
        if len(df_app) < 30:
            print(f"   ⚠️ Saltato: pochi dati storici per {app_id}.")
            continue
            
        X_app, y_app = prepara_features(df_app, "potenza_totale_app_w")
        
        if len(X_app) > 15:
            modello_app = RandomForestRegressor(n_estimators=50, random_state=42)
            modello_app.fit(X_app, y_app)
            
            # Salvataggio diretto in BASE_DIR (cloud/ml/)
            nome_file = f"modello_{app_id}.pkl"
            path_app = os.path.join(BASE_DIR, nome_file)
            joblib.dump(modello_app, path_app)
            print(f"   ✅ Modello locale salvato in: {path_app}")
        else:
            print(f"   ⚠️ Dati insufficienti dopo la preparazione per {app_id}.")

    print("\n🎉 Processo di addestramento completato con successo!")

if __name__ == "__main__":
    addestra_tutti_i_modelli()