// ====== STRUCT TYPES (HARUS PALING ATAS, SEBELUM #include) ======
struct MuTemp { float rendah, sedang, tinggi, sangatTinggi; };
struct MuHum  { float kering, ideal, basah; };
struct MuPH   { float asam, netral, basa; };
struct MuGas  { float sangatRendah, rendah, sedang, tinggi; };
struct RuleHit { const char* text; float w; };


#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <RTClib.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <EEPROM.h>
#include <time.h>


// ===================== DEVICE / WIFI / BACKEND =====================

const int   DEVICE_ID_NUM = 101;        // Ganti sesuai ID alatmu
const char* PAIR_CODE     = "482193";


const char* WIFI_SSID = "Bali2025";
const char* WIFI_PASS = "Fourhome10";


const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 8 * 3600; // WITA (UTC+8)
const int   daylightOffset_sec = 0;


// --- DUA ALAMAT SERVER ---
const char* BACKEND_SKRIPSI = "https://api.composter.my.id";
const char* BACKEND_PAMERAN = "http://192.168.1.70:8000";


// ===================== TIMING & INTERVAL =====================
const uint32_t SENSOR_INTERVAL_MS = 2000UL;   // 2 detik
const uint32_t POST_INTERVAL_MS   = 30UL * 60UL * 1000UL;   //  30Menit


// ===================== PIN =====================
#define DS18B20_PIN 4
#define SOIL_PIN    32
#define PH_PIN      34
#define GAS_PIN     35
#define RELAY_FAN_PIN 26
#define BTS_RPWM 25
#define BTS_LPWM 33
#define BTS_REN  27
#define BTS_LEN  14
#define PUMP_PIN 18
#define RESET_BTN_PIN 5 // --- PIN TOMBOL RESET FISIK ---
const bool FAN_ACTIVE_HIGH  = true;
const bool PUMP_ACTIVE_HIGH = false;


// ===================== LCD + SENSOR =====================
LiquidCrystal_I2C lcd(0x27, 20, 4);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
RTC_DS3231 rtc;


// ===================== PWM =====================
const uint32_t PWM_FREQ = 1000;
const uint8_t  PWM_RES  = 8;
const uint8_t  MOTOR_DUTY = 255;


// ===================== KALIBRASI =====================
const int SOIL_DRY_RAW = 3200;
const int SOIL_WET_RAW = 1300;


const float PH_BUF_1 = 7.00;
const int   PH_RAW_1 = 1000;
const float PH_BUF_2 = 4.00;
const int   PH_RAW_2 = 1600;


const int GAS_RAW_LOW  = 0;
const int GAS_RAW_HIGH = 1000;
const float GAS_ALARM_INDEX = 80.0;


// ===================== EEPROM ADDRESS ===================
#define ADDR_PUMP_DONE 0
#define ADDR_MOTOR_FIRST_DONE 1


// ===================== FUZZY HELPERS =====================
static inline float fmin2(float a, float b){ return a < b ? a : b; }
static inline float fmax2(float a, float b){ return a > b ? a : b; }
static inline float fmin3(float a, float b, float c){ return fmin2(a, fmin2(b,c)); }

float trimf(float x, float a, float b, float c){
  if (x <= a || x >= c) return 0.0f;
  if (x == b) return 1.0f;
  if (x < b)  return (x - a) / (b - a);
  return (c - x) / (c - b);
}
float trapmf(float x, float a, float b, float c, float d){
  if (x < a || x > d) return 0.0f;  
  if (x >= b && x <= c) return 1.0f;
  if (x < b) return (x - a) / (b - a);
  return (d - x) / (d - c);
}

// ===================== MEMBERSHIP FUNCTIONS =====================
MuTemp fuzzTemp(float t){
  MuTemp m;
  m.rendah       = trapmf(t, 0, 0, 28, 31);
  m.sedang       = trimf(t, 29, 32, 35);        
  m.tinggi       = trapmf(t, 33, 37, 100, 100);
  m.sangatTinggi = trapmf(t, 45, 50, 100, 100);
  return m;
}

MuHum fuzzHum(float h){
  MuHum m;
  m.kering = trapmf(h, 0, 0, 40, 50);
  m.ideal  = trimf(h, 45, 55, 65);
  m.basah  = trapmf(h, 60, 70, 100, 100);
  return m;
}

MuPH fuzzPH(float ph){
  MuPH m;
  m.asam   = trapmf(ph, 0, 0, 5.5, 6.5);
  m.netral = trimf(ph, 6.0, 7.0, 8.0);
  m.basa   = trapmf(ph, 7.5, 8.2, 14, 14);
  return m;
}

MuGas fuzzGas(float g){
  MuGas m;
  m.sangatRendah = trapmf(g, 0, 0, 5, 15);
  m.rendah       = trimf(g, 10, 25, 40);
  m.sedang       = trimf(g, 35, 55, 70);
  m.tinggi       = trapmf(g, 65, 80, 100, 100);
  return m;
}

const char* statusLabelFull(float z){
  if (z < 35) return "Belum Matang";
  if (z < 62) return "Setgh Matang";
  if (z < 88) return "Hmpr Matang";
  return "Matang";
}

// ===================== ADC HELPERS =====================
int readAdcAvg(int pin, int samples=10){
  long sum=0;
  for(int i=0;i<samples;i++){
    sum += analogRead(pin);
    delayMicroseconds(300);
  }
  return (int)(sum/samples);
}

int soilToPercent(int raw){
  long pct = map(raw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (int)pct;
}

float calcPHfromRaw(int raw){
  float m = (PH_BUF_2 - PH_BUF_1) / (float)(PH_RAW_2 - PH_RAW_1);
  float b = PH_BUF_1 - (m * PH_RAW_1);
  float ph = (m * raw) + b;
  if (ph < 0) ph = 0;
  if (ph > 14) ph = 14;
  return ph;
}

float gasRawToIndex(int raw){
  float idx = (float)(raw - GAS_RAW_LOW) * 100.0f / (float)(GAS_RAW_HIGH - GAS_RAW_LOW);
  if (idx < 0) idx = 0;
  if (idx > 100) idx = 100;
  return idx;
}

// ===================== JSON HELPERS =====================
String escJson(String s){
  s.replace("\\", "\\\\"); s.replace("\"", "\\\""); s.replace("\n", "\\n"); s.replace("\r", ""); return s;
}

String muSuhuJson(float t){ MuTemp m = fuzzTemp(t); return "{\"rendah\":" + String(m.rendah,3) + ",\"sedang\":" + String(m.sedang,3) + ",\"tinggi\":" + String(m.tinggi,3) + ",\"sangatTinggi\":" + String(m.sangatTinggi,3) + "}"; }
String muKelembabanJson(float h){ MuHum m = fuzzHum(h); return "{\"kering\":" + String(m.kering,3) + ",\"ideal\":" + String(m.ideal,3) + ",\"basah\":" + String(m.basah,3) + "}"; }
String muPhJson(float p){ MuPH m = fuzzPH(p); return "{\"asam\":" + String(m.asam,3) + ",\"netral\":" + String(m.netral,3) + ",\"basa\":" + String(m.basa,3) + "}"; }
String muGasJson(float g){ MuGas m = fuzzGas(g); return "{\"sangatRendah\":" + String(m.sangatRendah,3) + ",\"rendah\":" + String(m.rendah,3) + ",\"sedang\":" + String(m.sedang,3) + ",\"tinggi\":" + String(m.tinggi,3) + "}"; }

// ===================== RULE ACTIVE BUILDER =====================

void addRuleHit(RuleHit* hits, int &n, const char* text, float w){
  if (w <= 0.0001f) return;
  if (n >= 24) return;
  hits[n].text = text; hits[n].w = w; n++;
}

void sortRuleHits(RuleHit* hits, int n){
  for (int i=0; i<n-1; i++){
    for (int j=i+1; j<n; j++){
      if (hits[j].w > hits[i].w){
        RuleHit tmp = hits[i]; hits[i] = hits[j]; hits[j] = tmp;
      }
    }
  }
}

String buildActiveRulesText(float t, float hum, float ph, float gasIdx){
  MuTemp mt = fuzzTemp(t); MuHum mh = fuzzHum(hum);
  MuPH mp = fuzzPH(ph);
  RuleHit hits[30]; int n = 0;
  addRuleHit(hits, n, "R1: IF Suhu Rndh AND pH Asam THEN Blm Matang", fmin2(mt.rendah, mp.asam));
  addRuleHit(hits, n, "R2: IF Suhu Sdg AND pH Asam THEN Blm Matang", fmin2(mt.sedang, mp.asam));
  addRuleHit(hits, n, "R3: IF Hum Kering THEN Blm Matang", mh.kering);
  addRuleHit(hits, n, "R12: IF Hum Basah THEN Blm Matang", mh.basah);
  addRuleHit(hits, n, "R4: IF Suhu Tnggi AND pH Asam THEN Stgh Matang", fmin2(mt.tinggi, mp.asam));
  addRuleHit(hits, n, "R5: IF Suhu Tnggi AND pH Netral THEN Stgh Matang", fmin2(mt.tinggi, mp.netral));
  addRuleHit(hits, n, "R6: IF Suhu Tnggi AND Hum Basah THEN Stgh Matang", fmin2(mt.tinggi, mh.basah));
  addRuleHit(hits, n, "R7: IF Suhu Tnggi AND Hum Ideal THEN Stgh Matang", fmin2(mt.tinggi, mh.ideal));
  addRuleHit(hits, n, "R8: IF Suhu Sdg AND pH Netral AND Hum Ideal THEN Hmpr Matang", fmin3(mt.sedang, mp.netral, mh.ideal));
  addRuleHit(hits, n, "R9: IF Suhu Sdg AND pH Basa AND Hum Ideal THEN Hmpr Matang", fmin3(mt.sedang, mp.basa, mh.ideal));
  addRuleHit(hits, n, "R10: IF Suhu Rndh AND pH Netral AND Hum Ideal THEN Matang", fmin3(mt.rendah, mp.netral, mh.ideal));
  addRuleHit(hits, n, "R11: IF Suhu Rndh AND pH Basa AND Hum Ideal THEN Matang", fmin3(mt.rendah, mp.basa, mh.ideal));
  if (n == 0) return "Tidak ada rule aktif";
  sortRuleHits(hits, n);
  String out = "";
  int maxShow = n < 3 ? n : 3;
  for (int i=0; i<maxShow; i++){
    if (i > 0) out += "\n";
    out += String(hits[i].text) + " (w=" + String(hits[i].w, 3) + ")";
  }
  return out;
}

// ===================== SUGENO =====================
float sugenoStatus(float t, float hum, float ph, float gasIdx){
  MuTemp mt = fuzzTemp(t); MuHum mh = fuzzHum(hum);
  MuPH mp = fuzzPH(ph);    

  float sumW=0, sumWZ=0;
  auto rule = [&](float w, float z){ if(w<=0) return; sumW+=w; sumWZ+=w*z; };

  rule(fmin2(mt.rendah, mp.asam), 20);   // R1
  rule(fmin2(mt.sedang, mp.asam), 20);   // R2
  rule(mh.kering, 20);                   // R3
  rule(mh.basah, 20);                    // R4
  rule(fmin2(mt.tinggi, mp.asam), 50);   // R5
  rule(fmin2(mt.tinggi, mp.netral), 50); // R6
  rule(fmin2(mt.tinggi, mh.basah), 50);  // R7
  rule(fmin2(mt.tinggi, mh.ideal), 50);  // R8
  rule(fmin3(mt.sedang, mp.netral, mh.ideal), 75); // R8
  rule(fmin3(mt.sedang, mp.basa, mh.ideal), 75);           // R9
  rule(fmin3(mt.rendah, mp.netral, mh.ideal), 100); // R10
  rule(fmin3(mt.rendah, mp.basa, mh.ideal), 100);   // R11

  if (sumW < 1e-6) return 20;
  return sumWZ / sumW;
}

float sugenoFan(float t, float hum, float ph, float gasIdx){
  MuTemp mt = fuzzTemp(t); MuHum mh = fuzzHum(hum); MuGas mg = fuzzGas(gasIdx);
  float sumW=0, sumWZ=0;
  auto rule = [&](float w, float z){ if(w<=0) return; sumW+=w; sumWZ+=w*z; };

  rule(mg.tinggi, 100);          // F1:
  rule(mg.sedang, 70);           // F2:
  rule(mg.rendah, 0);            // F3:
  rule(mg.sangatRendah, 0);      //F4

  if (sumW < 1e-6) return 0;
  return sumWZ / sumW;
}

// ===================== LCD HELPER =====================
void lcdPrintLine(uint8_t row, String text){
  if (text.length() < 20) while(text.length() < 20) text += " ";
  if (text.length() > 20) text = text.substring(0,20);
  lcd.setCursor(0,row);
  lcd.print(text);
}

// ===================== ACTUATOR =====================
bool motorOn=false, fanOnState=false, pumpOnState=false;
uint32_t motorStopAt=0, fanStopAt=0, pumpStopAt=0;
void motorStop(){
  ledcWrite(BTS_RPWM, 0); ledcWrite(BTS_LPWM, 0);
  digitalWrite(BTS_REN, LOW); digitalWrite(BTS_LEN, LOW);
  motorOn=false;
}

void motorForward(uint8_t duty){
  digitalWrite(BTS_REN, HIGH); digitalWrite(BTS_LEN, HIGH);
  ledcWrite(BTS_LPWM, 0);
  for(int speed = 50; speed <= duty; speed += 5) {
    ledcWrite(BTS_RPWM, speed);
    delay(40);
  }
  motorOn=true;
}

void setFan(bool on){
  digitalWrite(RELAY_FAN_PIN, FAN_ACTIVE_HIGH ? (on?HIGH:LOW) : (on?LOW:HIGH));
  fanOnState = on;
}

void setPump(bool on){
  digitalWrite(PUMP_PIN, PUMP_ACTIVE_HIGH ? (on?HIGH:LOW) : (on?LOW:HIGH));
  pumpOnState = on;
}

// ===================== DUAL BACKEND API COMM =====================
// ===================== DUAL BACKEND COMM (HTTP & HTTPS MIX) =====================
String two(int v){ return (v<10) ? "0"+String(v) : String(v); }
bool rtcOk = false;
String nowTsString(){
  if (!rtcOk) return "1970-01-01 00:00:00";
  DateTime n = rtc.now();
  return String(n.year()) + "-" + two(n.month()) + "-" + two(n.day()) + " " +
         two(n.hour()) + ":" + two(n.minute()) + ":" + two(n.second());
}

bool apiRegisterDevice(){
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  WiFiClient clientHttp;          // Client untuk HTTP Lokal
  WiFiClientSecure clientHttps;   // Client untuk HTTPS Online
  clientHttps.setInsecure();      // Abaikan SSL certificate agar tidak Core Panic
  String body = "{\"device_id\":" + String(DEVICE_ID_NUM) + ",\"pair_code\":\"" + String(PAIR_CODE) + "\"}";
  bool success = false;

  // 1. Register ke Web Skripsi (HTTPS Online)
  http.begin(clientHttps, String(BACKEND_SKRIPSI) + "/api/iot/devices/register");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500);
  if(http.POST(body) > 0) success = true;
  http.end();

  // 2. Register ke Web Pameran (HTTP Lokal)
  http.begin(clientHttp, String(BACKEND_PAMERAN) + "/api/iot/devices/register");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500);
  if(http.POST(body) > 0) success = true;
  http.end();
  return success;
}

bool apiPostMonitoring(float suhu, int kelembaban, float ph, int gas,
                       int pengaduk, int pompa, int fan, const char* status,
                       const String& muSuhu, const String& muHum,
                       const String& muPh, const String& muGas,
                       const String& ruleText, float fuzzyOutput) {
  if (WiFi.status() != WL_CONNECTED) return false;
  String body = "{";
  body += "\"ts\":\"" + nowTsString() + "\",";
  body += "\"suhu\":" + String(suhu,1) + ",";
  body += "\"kelembaban\":" + String(kelembaban) + ",";
  body += "\"ph\":" + String(ph,2) + ",";
  body += "\"gas\":" + String(gas) + ",";
  body += "\"pengaduk\":" + String(pengaduk) + ",";
  body += "\"pompa\":" + String(pompa) + ",";
  body += "\"fan\":" + String(fan) + ",";
  body += "\"status\":\"" + String(status) + "\",";
  body += "\"mu_suhu_json\":\"" + escJson(muSuhu) + "\",";
  body += "\"mu_kelembaban_json\":\"" + escJson(muHum) + "\",";
  body += "\"mu_ph_json\":\"" + escJson(muPh) + "\",";
  body += "\"mu_gas_json\":\"" + escJson(muGas) + "\",";
  body += "\"rule_aktif_text\":\"" + escJson(ruleText) + "\",";
  body += "\"fuzzy_output\":" + String(fuzzyOutput,2);
  body += "}";
  HTTPClient http;
  WiFiClient clientHttp;          // Handler lokal
  WiFiClientSecure clientHttps;   // Handler online
  clientHttps.setInsecure();
  bool success = false;

  // 1. Tembak ke Web Skripsi (HTTPS Online)
  http.begin(clientHttps, String(BACKEND_SKRIPSI) + "/api/iot/devices/" + String(DEVICE_ID_NUM) + "/monitoring");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500);
  int code1 = http.POST(body);
  if (code1 > 0) { Serial.printf("[HTTPS] Web Skripsi OK (%d)\n", code1); success = true; }
  else { Serial.printf("[HTTPS] Web Skripsi GAGAL (%d)\n", code1); }
  http.end();

  // 2. Tembak ke Web Pameran (HTTP Lokal)
  http.begin(clientHttp, String(BACKEND_PAMERAN) + "/api/iot/devices/" + String(DEVICE_ID_NUM) + "/monitoring");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500);
  int code2 = http.POST(body);
  if (code2 > 0) { Serial.printf("[HTTP] Web Pameran OK (%d)\n", code2); success = true; }
  else { Serial.printf("[HTTP] Web Pameran GAGAL (%d)\n", code2); }
  http.end();
  return success;
}

void apiResetBatch() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  WiFiClient clientHttp;
  WiFiClientSecure clientHttps;
  clientHttps.setInsecure();

  // 1. Reset Web Skripsi (HTTPS Online)
  http.begin(clientHttps, String(BACKEND_SKRIPSI) + "/api/iot/devices/" + String(DEVICE_ID_NUM) + "/reset");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500);
  http.POST("{}");
  http.end();

  // 2. Reset Web Pameran (HTTP Lokal)
  http.begin(clientHttp, String(BACKEND_PAMERAN) + "/api/iot/devices/" + String(DEVICE_ID_NUM) + "/reset");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500);
  http.POST("{}");
  http.end();
}

// ===================== GLOBAL STATE =====================
float tempC=0, phVal=7.0, gasIdx=0;
int soilPct=0;
float statusZ=20, fanZ=0;
bool gasAlarm=false;
uint32_t lastSensorMs = 0;
uint32_t lastPostMs = 0;
uint32_t lastLcdUpdate = 0;
bool deviceRegistered = false;
bool pumpDone = false;
bool motorFirstDayDone = false;
uint32_t bootTime = 0;
uint32_t motorFirstDayTriggerTime = 0;
uint32_t lastStirRun = 0;
uint32_t lastFanCheck = 0;
const uint32_t PUMP_WAIT_BOOT_MS  = 5UL * 60UL * 1000UL;      
const uint32_t MOTOR_WAIT_PUMP_MS = 2UL * 60UL * 1000UL;      
const int TARGET_STIR_HOUR = 20;
const int TARGET_STIR_MINUTE = 30;
int lastStirDay = -1;

void forceSendMonitoring() {
  Serial.println("Mengirim data instan ke DUA server..."); 
  ds18b20.requestTemperatures();
  tempC = ds18b20.getTempCByIndex(0);
  soilPct = soilToPercent(readAdcAvg(SOIL_PIN));
 int phRawAsli = readAdcAvg(PH_PIN);
  Serial.print(">>> RAW PH SEKARANG: ");
  Serial.println(phRawAsli);
  phVal = calcPHfromRaw(phRawAsli);
  gasIdx = gasRawToIndex(readAdcAvg(GAS_PIN));
  statusZ = sugenoStatus(tempC, (float)soilPct, phVal, gasIdx);
  String muSuhu = muSuhuJson(tempC);
  String muHum  = muKelembabanJson((float)soilPct);
  String muPh   = muPhJson(phVal);
  String muGas  = muGasJson(gasIdx);
  String ruleText = buildActiveRulesText(tempC, (float)soilPct, phVal, gasIdx);
  apiPostMonitoring(tempC, soilPct, phVal, (int)gasIdx,
                    motorOn ? 1 : 0,
                    pumpOnState ? 1 : 0,
                    fanOnState ? 1 : 0,
                    statusLabelFull(statusZ),
                    muSuhu, muHum, muPh, muGas, ruleText, statusZ);
}

// ===================== SETUP =====================
void setup(){
  Serial.begin(115200);
  delay(2000);
  EEPROM.begin(32);
  pumpDone = (EEPROM.read(ADDR_PUMP_DONE) == 1);
  motorFirstDayDone = (EEPROM.read(ADDR_MOTOR_FIRST_DONE) == 1);
  pinMode(RESET_BTN_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(PH_PIN,   ADC_11db);
  analogSetPinAttenuation(GAS_PIN,  ADC_11db);
  Wire.begin(21,22);
  lcd.init(); lcd.backlight();
  lcdPrintLine(0, "Sauber Composter");
  lcdPrintLine(1, "Memulai Sistem...");

  if(pumpDone) lcdPrintLine(2, "Status: Melanjutkan");
  else lcdPrintLine(2, "Status: Batch Baru");
  ds18b20.begin();
  rtcOk = rtc.begin();
  pinMode(RELAY_FAN_PIN, OUTPUT);
  pinMode(BTS_REN, OUTPUT);
  pinMode(BTS_LEN, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);
  setFan(false);
  setPump(false);
  ledcAttach(BTS_RPWM, PWM_FREQ, PWM_RES);
  ledcAttach(BTS_LPWM, PWM_FREQ, PWM_RES);
  motorStop();

  bootTime = millis();
  lastSensorMs = bootTime - SENSOR_INTERVAL_MS;
  lastFanCheck = bootTime - 120000UL;
  lastPostMs = bootTime - POST_INTERVAL_MS;

  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  // 👇👇👇 TAMBAHAN 2: TUNGGU WIFI & SETEL RTC 👇👇👇
  Serial.print("Menunggu WiFi");
  int wifiTries = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTries < 20) { // Tunggu maksimal 10 detik
    delay(500);
    Serial.print(".");
    wifiTries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Berhasil Terhubung!");
    Serial.println("Mengambil waktu dari satelit (WITA)...");
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 10000)) { // Tunggu balasan internet maksimal 10 detik
      // Berhasil dapat jam! Langsung suntikkan ke otak modul RTC DS3231
      rtc.adjust(DateTime(timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday, timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec));
      Serial.println("[RTC] BERHASIL! Jam RTC sudah disetel sesuai waktu nyata.");
    } else {
      Serial.println("[RTC] Gagal mengambil waktu dari Internet.");
    }
  } else {
    Serial.println("\n[WIFI] Gagal terhubung ke router. Jam tidak terupdate.");
  }
}

// ===================== LOOP =====================
void loop(){
  uint32_t now = millis();
  // 0. RESET LOGIC (TOMBOL FISIK)
  if (digitalRead(RESET_BTN_PIN) == LOW) {
    delay(50);
    if (digitalRead(RESET_BTN_PIN) == LOW) {
      lcdPrintLine(0, "MERESET ALAT...");
      apiResetBatch();
      EEPROM.write(ADDR_PUMP_DONE, 0);
      EEPROM.write(ADDR_MOTOR_FIRST_DONE, 0);
      EEPROM.commit();
      delay(2000);
      ESP.restart();
    }
  }

  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "RESET") {
      apiResetBatch();
      EEPROM.write(ADDR_PUMP_DONE, 0); EEPROM.write(ADDR_MOTOR_FIRST_DONE, 0); EEPROM.commit();
      ESP.restart();
    }
  }

  // 1. ACTUATOR TIMEOUT
  if (motorOn && now >= motorStopAt) motorStop();
  if (fanOnState && now >= fanStopAt) {
    setFan(false);
    lastSensorMs = 0;
    Serial.println("Kipas mati otomatis, memicu pembacaan sensor ulang...");
  }
  if (pumpOnState && now >= pumpStopAt) setPump(false);
  // 2. BACA SENSOR
  if (now - lastSensorMs >= SENSOR_INTERVAL_MS || lastSensorMs == 0){
    if (!motorOn && !pumpOnState) {
      ds18b20.requestTemperatures();
      float bacaSuhu = ds18b20.getTempCByIndex(0);
      if (bacaSuhu <= -127.0) {
        Serial.println("Sensor Suhu Error (-127), mengulang 2 detik lagi...");
        lastSensorMs = now - SENSOR_INTERVAL_MS + 2000UL;
      } else {
        tempC = bacaSuhu;
        lastSensorMs = now;
        soilPct = soilToPercent(readAdcAvg(SOIL_PIN));
        phVal = calcPHfromRaw(readAdcAvg(PH_PIN));
        gasIdx = gasRawToIndex(readAdcAvg(GAS_PIN));
        gasAlarm = (gasIdx >= GAS_ALARM_INDEX);
        statusZ = sugenoStatus(tempC, (float)soilPct, phVal, gasIdx);
        fanZ = sugenoFan(tempC, (float)soilPct, phVal, gasIdx);
        Serial.println("Sensor dibaca: Kondisi aman");
      }
    } else {
      lastSensorMs = now - SENSOR_INTERVAL_MS + 10000UL;
      Serial.println("Sensor ditunda: Menunggu motor berhenti...");
    }
  }

  // 3. LCD UPDATE
  if (now - lastLcdUpdate >= 1000) {
    lastLcdUpdate = now;
    lcdPrintLine(0, "T:" + String(tempC,1) + "C H:" + String(soilPct) + "%");
    lcdPrintLine(1, "pH:" + String(phVal,1) + " G:" + String((int)gasIdx));
    String labelSt = statusLabelFull(statusZ);
    if (labelSt == "Belum Matang") labelSt = "Mentah";
    lcdPrintLine(2, "St:" + labelSt + " Fz:" + String((int)fanZ));
    lcdPrintLine(3, "M:" + String(motorOn?"ON":"--") + " P:" + String(pumpOnState?"ON":"--") + " F:" + String(fanOnState?"ON":"--") + (WiFi.status()==WL_CONNECTED?" W:ON":" W:--"));
  }

  // 4. LOGIKA OTOMATISASI
  if (statusZ < 88.0) {

    // A. POMPA EM4
    if (!pumpDone && !pumpOnState) {
      if (statusZ < 35.0) {
        if (now - bootTime >= PUMP_WAIT_BOOT_MS) {
          setPump(true);
          pumpStopAt = now + 10000UL;
          delay(1500);
          forceSendMonitoring();
          pumpDone = true;
          EEPROM.write(ADDR_PUMP_DONE, 1);
          EEPROM.commit();
          motorFirstDayTriggerTime = pumpStopAt + MOTOR_WAIT_PUMP_MS;
        }
      } else {
        pumpDone = true;
        EEPROM.write(ADDR_PUMP_DONE, 1);
        EEPROM.commit();
        motorFirstDayTriggerTime = now + 10000UL;
        Serial.println("Bypass Pompa EM4: Kompos sudah lewat fase mentah!");
      }
    }

    // B. MOTOR PENGADUK
    if (pumpDone && !pumpOnState) {
     
      // --- 1. PENGADUKAN PERTAMA (Awal Batch) ---
      if (!motorFirstDayDone && !motorOn && motorFirstDayTriggerTime > 0 && now >= motorFirstDayTriggerTime) {
        motorOn = true;               // 1. Ubah status untuk dikirim ke we
        forceSendMonitoring();        // 2. Tembak data web SEBELUM dinamo nyedot arus
        delay(1500);                  // 3. Jeda pengaman
        motorForward(MOTOR_DUTY);     // 4. BARU aliran listrik disalurkan ke motor
        motorStopAt = now + 30000UL;  // Nyala 30 detik
        motorFirstDayDone = true;
        EEPROM.write(ADDR_MOTOR_FIRST_DONE, 1);
        EEPROM.commit();
        Serial.println("Motor ON: Pengadukan Pertama Awal Batch!");
      }

      // --- 2. PENGADUKAN RUTIN (Alarm Jam Nyata / RTC) ---
      else if (motorFirstDayDone && !motorOn) {
        DateTime timeNow = rtc.now(); // Ambil waktu asli saat ini dari modul RTC
        // Jika jam dan menit sama persis dengan jadwal, DAN hari ini belum pernah mengaduk
        if (timeNow.hour() == TARGET_STIR_HOUR && timeNow.minute() == TARGET_STIR_MINUTE && lastStirDay != timeNow.day()) {
          motorOn = true;
          forceSendMonitoring();
          delay(1500);
          motorForward(MOTOR_DUTY);
          motorStopAt = now + 30000UL; // Nyala 30 detik
          lastStirDay = timeNow.day(); // Kunci tanggal hari ini agar tidak mengaduk dua kali di hari yang sama
          Serial.println("Motor ON: Pengadukan Harian Terjadwal via RTC!");
        }
      }
    }

    // C. KIPAS
    if (!fanOnState) {
      if (gasAlarm || fanZ > 20.0) {
        if (now - lastFanCheck >= 180000UL) {
          setFan(true);
          if (fanZ >= 80.0 || gasAlarm) {
            fanStopAt = now + 120000UL;
            Serial.println("Kipas ON: Mode TINGGI (2 Menit)");
          }
          else if (fanZ >= 50.0) {
            fanStopAt = now + 60000UL; 
            Serial.println("Kipas ON: Mode SEDANG (1 Menit)");
          }
          else {
            fanStopAt = now + 30000UL;  
            Serial.println("Kipas ON: Mode RENDAH (30 Detik)");
          }
          forceSendMonitoring();
          lastFanCheck = now;
        }
      }
    } else {
      if (!gasAlarm && fanZ <= 10.0) {
        setFan(false);
        lastSensorMs = 0;
        Serial.println("Kipas dimatikan lebih awal karena kondisi kompos sudah aman.");
      }
    }
  } else {
    // Mode Matang
    if (motorOn) motorStop();
    if (fanOnState) setFan(false);
    if (pumpOnState) setPump(false);
  }

  // 5. POST DATA RUTIN KE DUA WEB
  if (WiFi.status() == WL_CONNECTED){
    if (!deviceRegistered) deviceRegistered = apiRegisterDevice();
    if (deviceRegistered && (now - lastPostMs >= POST_INTERVAL_MS)) {
      lastPostMs = now;
      forceSendMonitoring();
    }
  }
}// <--- SELESAI