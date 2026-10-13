

void controllaComandiSeriali();
void controllaPulsanti();
float calcolaPotenzaAttuale();

// --- MAPPATURA PIN ---
const int NUM_PRESE = 3;

const int pinPot[NUM_PRESE]  = {A6, A3, A0}; // Ingressi Analogici Potenziometri
const int pinRele[NUM_PRESE] = {2, 6, 10};    // Uscite Digitali Relè
const int pinBtn[NUM_PRESE]  = {35, 39, 43};     // Pin digitali dei pulsanti di reset

// Array per tracciare lo stato logico di ogni presa (true = ALIMENTATA, false = STACCATA)
bool statoPrese[NUM_PRESE]   = {true, true, true}; 

// Array per memorizzare l'ultimo consumo noto prima che la presa venga staccata
float ultimoConsumo[NUM_PRESE] = {0.0, 0.0, 0.0}; 

// SOGLIA DI SICUREZZA HARDWARE
const float SOGLIA_MAX_WATT  = 3000.0; 

void setup() {
  Serial.begin(115200);

  // Inizializza i pin dei relè
  for (int i = 0; i < NUM_PRESE; i++) {
    pinMode(pinRele[i], OUTPUT);
    digitalWrite(pinRele[i], LOW); // LOW = Relè a riposo -> Presa Alimentata
  }

  // Inizializza i pin dei pulsanti con resistenza di Pull-Up interna
  // Significa che a riposo leggono HIGH, mentre quando li premi leggono LOW (collegati a GND)
  for (int i = 0; i < NUM_PRESE; i++) {
    pinMode(pinBtn[i], INPUT_PULLUP);
  }
}

void loop() {
  // 1. ASCOLTO COMANDI SERIALI DAL BRIDGE PYTHON
  controllaComandiSeriali();

  // 2. ASCOLTO PRESSIONE PULSANTI FISICI (RESET MEMORIA CARICO)
  controllaPulsanti();

  // 3. LETTURA POTENZE DAI POTENZIOMETRI
  float totalPower = 0;
  float potenze[NUM_PRESE];

  for (int i = 0; i < NUM_PRESE; i++) {
    if (statoPrese[i] == true) {
      int raw = analogRead(pinPot[i]);
      float p = map(raw, 0, 1023, 0, 2000); 
      if (p < 15) p = 0;

      potenze[i] = p;
      ultimoConsumo[i] = p; // Aggiorna costantemente la memoria finché è acceso
    } 
    else {
      potenze[i] = 0.0;
    }

    totalPower += potenze[i];
  }

  // 4. INVIO TELEMETRIA JSON AL BRIDGE PYTHON
  Serial.print("{");
  for (int i = 0; i < NUM_PRESE; i++) {
    Serial.print("\"carico_");
    Serial.print(i + 1);
    Serial.print("\": ");
    Serial.print(potenze[i], 0);
    Serial.print(", ");
  }
  Serial.print("\"totale_w\": ");
  Serial.print(totalPower, 0);
  Serial.println("}");

  delay(1000);
}

// Funzione per la gestione dei pulsanti fisici di reset
void controllaPulsanti() {
  for (int i = 0; i < NUM_PRESE; i++) {
    // Legge il pulsante (LOW = premuto, grazie a INPUT_PULLUP)
    if (digitalRead(pinBtn[i]) == LOW) {
      
      // Azzera la memoria del consumo per permettere il riattacco con un nuovo apparecchio
      ultimoConsumo[i] = 0.0; 

      // Notifica opzionale via seriale utile per il debug
      Serial.print("{\"info\": \"MEMORIA_RESETTATA\", \"carico\": ");
      Serial.print(i + 1);
      Serial.println("}");

      // Piccolo ritardo antirimbalzo (debounce) hardware/software grossolano ma efficace
      delay(300); 
    }
  }
}

// Restituisce la somma istantanea della potenza assorbita dai soli carichi attualmente attivi
float calcolaPotenzaAttuale() {
  float somma = 0;
  for (int i = 0; i < NUM_PRESE; i++) {
    if (statoPrese[i] == true) {
      int raw = analogRead(pinPot[i]);
      float p = map(raw, 0, 1023, 0, 2000);
      if (p >= 15) somma += p;
    }
  }
  return somma;
}

void controllaComandiSeriali() {
  if (Serial.available() > 0) {
    String comando = Serial.readStringUntil('\n');
    comando.trim();

    if (comando.startsWith("CMD:")) {
      int primoDuePunti = comando.indexOf(':');
      int secondoDuePunti = comando.indexOf(':', primoDuePunti + 1);

      String idCarico = comando.substring(primoDuePunti + 1, secondoDuePunti); 
      String azione   = comando.substring(secondoDuePunti + 1); 

      int indiceCarico = idCarico.substring(7).toInt() - 1;

      if (indiceCarico >= 0 && indiceCarico < NUM_PRESE) {
        
        // --- SPEGNIMENTO (OFF) ---
        if (azione == "OFF") {
          statoPrese[indiceCarico] = false;          
          digitalWrite(pinRele[indiceCarico], HIGH); 
        } 
        
        // --- RIATTIVAZIONE SICURA (ON) ---
        else if (azione == "ON") {
          float potenzaAttuale = calcolaPotenzaAttuale();
          float potenzaCarico = ultimoConsumo[indiceCarico]; // Usa il valore in memoria (o 0 se hai premuto il pulsante)
          float potenzaPrevista = potenzaAttuale + potenzaCarico;

          if (potenzaPrevista <= SOGLIA_MAX_WATT) {
            statoPrese[indiceCarico] = true;           
            digitalWrite(pinRele[indiceCarico], LOW);  

            Serial.print("{\"info\": \"RIATTACCO_ESEGUITO\", \"carico\": ");
            Serial.print(indiceCarico + 1);
            Serial.println("}");
          } 
          else {
            Serial.print("{\"warning\": \"RIATTACCO_RIFIUTATO_SOVRACCARICO\", \"carico\": ");
            Serial.print(indiceCarico + 1);
            Serial.print(", \"potenza_prevista\": ");
            Serial.print(potenzaPrevista, 0);
            Serial.println("}");
          }
        }
      }
    }
  }
}