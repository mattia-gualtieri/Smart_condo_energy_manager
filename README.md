# Smart Condo Energy Management System

An end-to-end IoT platform designed for real-time energy monitoring, status aggregation, and automated/predictive load shedding in residential environments. The system integrates edge hardware, messaging brokers, an in-memory Digital Twin, Machine Learning analytics, and a modern web frontend.

---

## 🏗️ System Architecture

The project is structured as a full-stack monorepo consisting of four primary layers:

```text
smart-condo-energy-manager/
├── arduino/     # Edge Firmware (C++ / Microcontroller)
├── bridge/      # Communication Gateway (Python & MQTT)
├── backend/     # Core Platform (FastAPI, Digital Twin & ML Engine)
└── frontend/    # Web Interface (Next.js / React / TypeScript)
```

### Layer Breakdown

1. **`arduino/` (Edge Firmware)**
   * C++ firmware running on microcontrollers to measure electrical telemetry (voltage, current, active power) and actuate relays for device control.

2. **`bridge/` (Edge Communication Gateway)**
   * A Python gateway script bridging serial communication from hardware devices to the MQTT broker, ensuring reliable low-latency message streaming.

3. **`backend/` (Core Application & Analytics)**
   * **FastAPI Service**: Provides high-performance RESTful APIs for real-time status and telemetry retrieval.
   * **In-Memory Digital Twin**: Maintains live device state in memory for zero-latency lookups and updates.
   * **Persistence**: Uses SQLite configured with Write-Ahead Logging (WAL) for safe concurrent reads/writes.
   * **Machine Learning Engine**: Integrated Random Forest Regressor designed to evaluate real-time load shedding triggers based on appliance priorities.

4. **`frontend/` (User Dashboard)**
   * Next.js & React web dashboard built with TypeScript and Tailwind CSS, featuring interactive telemetry graphs, live status indicators, and manual device overrides.

---

## ⚠️ Machine Learning Module Note

> **Status:** *Proof of Concept (PoC) / Pipeline Ready*

The backend includes a fully integrated **Random Forest Regressor** pipeline designed to forecast energy spikes and recommend load-shedding actions. 

Please note that while the data preprocessing and inference pipelines are fully functional, the current model has been trained on initial synthetic/placeholder data. As a result, model inference is intended as a structural demonstration rather than a production-accurate predictive system. Training on a feature-rich, real-world residential load dataset is planned for future iterations.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18 or higher
- **Python**: v3.10 or higher
- **MQTT Broker**: e.g., Eclipse Mosquitto
- **Arduino IDE / PlatformIO**: For flashing the microcontroller firmware

### Setup & Run

#### 1. Arduino Firmware (`arduino/`)
1. Open the `arduino/` folder using **Arduino IDE** or **PlatformIO**.
2. Connect your microcontroller via USB, select the correct Board and Port, and upload (`flash`) the firmware to the device.

#### 2. Bridge Gateway (`bridge/`)
*The bridge reads serial telemetry from the microcontroller and forwards it to the MQTT broker.*
```bash
cd bridge
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python bridge.py
```

#### 3. Backend Service (`backend/`)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python server.py
```
*API endpoints available at `http://localhost:8000`*

#### 4. Frontend Application (`frontend/`)
```bash
cd frontend
npm install
npm run dev
```
*Dashboard available at `http://localhost:3001`*

---

## 👥 Authors & Collaboration

This project was developed collaboratively:

- [**Mattia Gualtieri**](https://github.com/mattia-gualtieri) : Developer of backend server and co-developer of web application.
- [**Luca Ferraro**](https://github.com/ferraro-luca) : Handler of physical hardware implementation, wiring/cabling, Arduino firmware code, communication bridge, and co-developer of web application.

---

## 🛠️ Tech Stack

- **Hardware / Firmware**: C++, Arduino, Serial
- **Gateway & Messaging**: Python, MQTT (paho-mqtt)
- **Backend Core**: Python, FastAPI, SQLite, Scikit-Learn (Random Forest)
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
