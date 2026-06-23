# ♻️ Sauber Composter: Automated IoT Waste Management System

![Hardware](https://img.shields.io/badge/Hardware-Arduino_Uno-00979D?style=for-the-badge&logo=arduino&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-React.js-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Backend](https://img.shields.io/badge/Backend-Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Fuzzy Logic](https://img.shields.io/badge/Fuzzy_Logic-4B0082?style=for-the-badge&logo=logic&logoColor=white)

Sauber Composter adalah sistem pengolahan sampah organik otomatis berbasis Internet of Things (IoT). Proyek ini menggabungkan integrasi perangkat keras presisi untuk otomatisasi lingkungan komposter dengan *web dashboard* yang dirancang khusus untuk efisiensi pemantauan administratif internal.

## 🏗️ Arsitektur Sistem

Sistem ini beroperasi dalam dua layer utama:
1.  **Hardware Layer (Firmware):** Mengumpulkan data lingkungan secara *real-time* dan mengeksekusi logika otomatisasi untuk aktuator (pompa dan kipas).
2.  **Application Layer (Dashboard):** Menerima transmisi data untuk keperluan *monitoring* operasional oleh administrator, memastikan siklus kompos berjalan optimal tanpa intervensi manual di lapangan.

---

## 🔌 Hardware Specifications (Bill of Materials)

Sistem ini digerakkan oleh **Arduino Uno** sebagai mikrokontroler utama, yang diintegrasikan dengan sensor dan driver kelas industri:

*   **Microcontroller:** Arduino Uno
*   **Sensors:** 
    *   DHT22 (Suhu & Kelembaban Udara)
    *   BMP280 (Tekanan Udara & Temperatur Sekitar)
    *   pH Sensor (Tingkat keasaman kompos)
    *   Soil Moisture / ADMS (Tingkat kelembaban material organik)
*   **Actuators & Drivers:** 
    *   BTS7960 Motor Driver (Pengendalian daya tinggi untuk aktuator)
    *   Water Pump (Injeksi cairan/kelembaban)
    *   Cooling Fan (Sirkulasi udara)

### ⚙️ Logika Kalibrasi & Otomatisasi
Untuk mencapai efisiensi daya maksimal dan menjaga kondisi biologis kompos tetap ideal, firmware telah dikalibrasi dengan siklus operasional berikut:
*   **Cooling Fan:** Dipertahankan menyala selama **2 menit** untuk memastikan sirkulasi udara (aerasi) yang cukup.
*   **Water Pump:** Dibatasi durasi aktifnya menjadi **20 detik** untuk mencegah kondisi *over-watering* yang dapat merusak kualitas kompos organik.

---

## 💻 Web Dashboard (Admin Monitoring)

Antarmuka web dibangun menggunakan ekosistem React dan Node.js. Desain UI/UX difokuskan secara ketat pada pemantauan administratif (Admin-Centric), bukan untuk *customer-facing*. Fitur utama meliputi:
*   Pemantauan *real-time* metrik sensor (pH, Suhu, Kelembaban).
*   Indikator status aktuator (Pompa & Kipas).
*   Visualisasi data historis operasional mesin.

---

## 📂 Struktur Direktori Proyek

```text
sauber-composter/
├── firmware/                 # Kode sumber C++ untuk Arduino Uno
│   ├── sauber_main.ino       # Main logic & sensor reading
│   └── config.h              # Pin mapping & calibration settings
│
├── dashboard/                # Kode sumber untuk Admin Web App
│   ├── src/                  # React Frontend
│   ├── server/               # Node.js/Express Backend API
│   └── package.json
│
└── README.md
