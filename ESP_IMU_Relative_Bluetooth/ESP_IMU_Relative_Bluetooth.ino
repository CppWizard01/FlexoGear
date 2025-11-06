#include <Wire.h>
#include <Adafruit_BNO08x.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ========================================
// Configuration
// ========================================
#define MUX_ADDRESS 0x70
#define BNO08X_I2CADDR 0x4B
#define IMU1_RESET_PIN 19
#define IMU2_RESET_PIN 18
#define SAMPLE_RATE_MS 20  // Read sensors at 50Hz
#define SEND_INTERVAL_MS 100 // Send BLE data at 10Hz

// ========================================
// Global Objects
// ========================================
Adafruit_BNO08x bno08x;
bool imu1_ready = false;
bool imu2_ready = false;

// --- BLUETOOTH SETUP ---
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// --- NON-BLOCKING TIMER SETUP ---
unsigned long lastSendTime = 0;

// Data structures for storing latest readings
struct IMU_Data {
  float quat_real;
  float quat_i;
  float quat_j;
  float quat_k;
  uint8_t calibration;
  unsigned long timestamp;
  bool valid;
};

IMU_Data imu1_data = {0}; // Hand
IMU_Data imu2_data = {0}; // Arm
IMU_Data relative_imu_data = {0}; // Hand relative to Arm

// ========================================
// Helper Functions
// ========================================
void tcaselect(uint8_t channel) {
  if (channel > 7) return;
  Wire.beginTransmission(MUX_ADDRESS);
  Wire.write(1 << channel);
  Wire.endTransmission();
  delay(10);
}

void tcaDisableAll() {
  Wire.beginTransmission(MUX_ADDRESS);
  Wire.write(0);
  Wire.endTransmission();
  delay(10);
}

void resetBothIMUs() {
  pinMode(IMU1_RESET_PIN, OUTPUT);
  pinMode(IMU2_RESET_PIN, OUTPUT);
  
  digitalWrite(IMU1_RESET_PIN, LOW);
  digitalWrite(IMU2_RESET_PIN, LOW);
  delay(200);
  
  digitalWrite(IMU1_RESET_PIN, HIGH);
  digitalWrite(IMU2_RESET_PIN, HIGH);
  delay(1000);
}

bool checkIMU(uint8_t channel) {
  tcaselect(channel);
  delay(50);
  Wire.beginTransmission(BNO08X_I2CADDR);
  return (Wire.endTransmission() == 0);
}

bool readIMU(uint8_t channel, IMU_Data &data) {
  tcaselect(channel);
  delay(15);
  
  sh2_SensorValue_t sensorValue;
  
  // Try up to 3 times to get valid data
  for (int attempt = 0; attempt < 3; attempt++) {
    if (bno08x.getSensorEvent(&sensorValue)) {
      if (sensorValue.sensorId == SH2_ARVR_STABILIZED_RV) {
        data.quat_real = sensorValue.un.arvrStabilizedRV.real;
        data.quat_i = sensorValue.un.arvrStabilizedRV.i;
        data.quat_j = sensorValue.un.arvrStabilizedRV.j;
        data.quat_k = sensorValue.un.arvrStabilizedRV.k;
        data.calibration = sensorValue.status;
        data.timestamp = millis();
        data.valid = true;
        return true;
      }
    }
    delay(5);
  }
  
  data.valid = false;
  return false;
}

// Calculate relative orientation: q_r = q_arm_conjugate * q_hand
void calculateRelativeQuaternion(IMU_Data &q_hand, IMU_Data &q_arm, IMU_Data &q_relative) {
  // q_hand is data1 (IMU1)
  // q_arm is data2 (IMU2)

  // Conjugate of q_arm
  float w_arm_conj = q_arm.quat_real;
  float i_arm_conj = -q_arm.quat_i;
  float j_arm_conj = -q_arm.quat_j;
  float k_arm_conj = -q_arm.quat_k;

  float w_hand = q_hand.quat_real;
  float i_hand = q_hand.quat_i;
  float j_hand = q_hand.quat_j;
  float k_hand = q_hand.quat_k;

  // Quaternion multiplication: q_r = (w_arm_conj, i_arm_conj, j_arm_conj, k_arm_conj) * (w_hand, i_hand, j_hand, k_hand)
  q_relative.quat_real = w_arm_conj * w_hand - i_arm_conj * i_hand - j_arm_conj * j_hand - k_arm_conj * k_hand;
  q_relative.quat_i    = w_arm_conj * i_hand + i_arm_conj * w_hand + j_arm_conj * k_hand - k_arm_conj * j_hand;
  q_relative.quat_j    = w_arm_conj * j_hand - i_arm_conj * k_hand + j_arm_conj * w_hand + k_arm_conj * i_hand;
  q_relative.quat_k    = w_arm_conj * k_hand + i_arm_conj * j_hand - j_arm_conj * i_hand + k_arm_conj * w_hand;
  
  q_relative.valid = true;
}

void quaternionToEuler(IMU_Data &data, float &roll, float &pitch, float &yaw) {
  float qr = data.quat_real;
  float qi = data.quat_i;
  float qj = data.quat_j;
  float qk = data.quat_k;
  
  float sinr_cosp = 2 * (qr * qi + qj * qk);
  float cosr_cosp = 1 - 2 * (qi * qi + qj * qj);
  roll = atan2(sinr_cosp, cosr_cosp) * 180.0 / PI;
  
  float sinp = 2 * (qr * qj - qk * qi);
  if (abs(sinp) >= 1)
    pitch = copysign(90.0, sinp);
  else
    pitch = asin(sinp) * 180.0 / PI;
  
  float siny_cosp = 2 * (qr * qk + qi * qj);
  float cosy_cosp = 1 - 2 * (qj * qj + qk * qk);
  yaw = atan2(siny_cosp, cosy_cosp) * 180.0 / PI;
}

void printEulerAngles() {
  float roll1, pitch1, yaw1;
  float roll2, pitch2, yaw2;
  
  if (imu1_data.valid) {
    quaternionToEuler(imu1_data, roll1, pitch1, yaw1);
    Serial.print("IMU1["); Serial.print(imu1_data.calibration); Serial.print("] ");
    Serial.print("R:"); Serial.print(roll1, 1);
    Serial.print(" P:"); Serial.print(pitch1, 1);
    Serial.print(" Y:"); Serial.print(yaw1, 1);
  } else {
    Serial.print("IMU1[X] ---");
  }
  
  Serial.print(" | ");
  
  if (imu2_data.valid) {
    quaternionToEuler(imu2_data, roll2, pitch2, yaw2);
    Serial.print("IMU2["); Serial.print(imu2_data.calibration); Serial.print("] ");
    Serial.print("R:"); Serial.print(roll2, 1);
    Serial.print(" P:"); Serial.print(pitch2, 1);
    Serial.print(" Y:"); Serial.print(yaw2, 1);
  } else {
    Serial.print("IMU2[X] ---");
  }
  
  Serial.println();
}

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Device Connected");
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Device Disconnected");
      BLEDevice::startAdvertising();
    }
};

// ========================================
// Setup
// ========================================
void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);
  delay(2000);
  
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║   Dual BNO08x - Relative BLE Sender   ║");
  Serial.println("╚════════════════════════════════════════╝\n");

  Wire.begin();
  Wire.setClock(100000);
  Serial.println("✓ I2C initialized @ 100kHz");
  
  Wire.beginTransmission(MUX_ADDRESS);
  if (Wire.endTransmission() != 0) {
    Serial.println("✗ MUX not found - HALTING");
    while(1) delay(1000);
  }
  Serial.println("✓ I2C Multiplexer found");
  
  Serial.println("⟳ Resetting both IMUs...");
  resetBothIMUs();
  tcaDisableAll();
  delay(200);
  
  Serial.print("  Checking IMU_1 (Hand)... ");
  imu1_ready = checkIMU(7);
  Serial.println(imu1_ready ? "FOUND" : "NOT FOUND");
  
  Serial.print("  Checking IMU_2 (Arm)... ");
  imu2_ready = checkIMU(2);
  Serial.println(imu2_ready ? "FOUND" : "NOT FOUND");
  
  if (!imu1_ready && !imu2_ready) {
    Serial.println("\n✗ No IMUs detected - check wiring");
    while(1) delay(1000);
  }
  
  Serial.println("\n⚙ Initializing BNO08x library...");
  tcaselect(7);
  delay(200);
  
  if (!bno08x.begin_I2C(BNO08X_I2CADDR, &Wire)) {
    Serial.println("✗ Library init failed");
    imu1_ready = false;
    imu2_ready = false;
  } else {
    Serial.println("✓ Library initialized");
    
    if (imu1_ready) {
      if (bno08x.enableReport(SH2_ARVR_STABILIZED_RV, SAMPLE_RATE_MS * 1000)) {
        Serial.println("✓ IMU_1 reports enabled");
      } else {
        Serial.println("✗ IMU_1 reports failed");
        imu1_ready = false;
      }
    }
    
    delay(200);
    
    if (imu2_ready) {
      tcaselect(2);
      delay(200);
      if (bno08x.enableReport(SH2_ARVR_STABILIZED_RV, SAMPLE_RATE_MS * 1000)) {
        Serial.println("✓ IMU_2 reports enabled");
      } else {
        Serial.println("✗ IMU_2 reports failed");
        imu2_ready = false;
      }
    }
  }
  
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.print("║ IMU_1 (Hand): ");
  Serial.print(imu1_ready ? "✓ READY " : "✗ FAILED");
  Serial.print("  IMU_2 (Arm): ");
  Serial.print(imu2_ready ? "✓ READY " : "✗ FAILED");
  Serial.println(" ║");
  Serial.println("╚════════════════════════════════════════╝\n");
  
  Serial.println("--- FlexoGear BLE Server ---");
  BLEDevice::init("FlexoGear");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  pCharacteristic = pService->createCharacteristic(
                       CHARACTERISTIC_UUID,
                       BLECharacteristic::PROPERTY_READ |
                       BLECharacteristic::PROPERTY_NOTIFY
                     );
  
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();
  
  BLEDevice::startAdvertising();
  Serial.println("Waiting for a client connection...");
}

// ========================================
// Main Loop
// ========================================
char displayMode = 'e'; // 'e' for euler

void loop() {
  static unsigned long lastRead = 0;
  unsigned long now = millis();
  
  // Check for serial commands
  if (Serial.available()) {
    char cmd = Serial.read();
    if (cmd == 'e' || cmd == 'E') {
      displayMode = 'e';
      Serial.println("\n>>> Displaying Euler Angles <<<\n");
    }
  }
  
  // --- Task 1: Read IMUs (at 50Hz) ---
  if (now - lastRead >= SAMPLE_RATE_MS) {
    lastRead = now;
    
    if (imu1_ready) readIMU(7, imu1_data);
    if (imu2_ready) readIMU(2, imu2_data);
    
    if (displayMode == 'e') {
      //printEulerAngles();
    }
  }

  // --- Task 2: Calculate & Send BLE Data (at 10Hz) ---
  if (deviceConnected && (now - lastSendTime >= SEND_INTERVAL_MS)) {
    lastSendTime = now;

    if (imu1_data.valid && imu2_data.valid) {
      
      // 1. Calculate relative quaternion
      calculateRelativeQuaternion(imu1_data, imu2_data, relative_imu_data);

      // 2. Format relative quaternion as a string (i, j, k, real)
      char quatString[60];
      sprintf(quatString, "%.4f,%.4f,%.4f,%.4f", 
        relative_imu_data.quat_i,
        relative_imu_data.quat_j,
        relative_imu_data.quat_k,
        relative_imu_data.quat_real
      );
      
      // 3. Send over BLE
      pCharacteristic->setValue(quatString);
      pCharacteristic->notify();
      
      // 4. Also print relative Euler angles to Serial for debugging
      float roll, pitch, yaw;
      quaternionToEuler(relative_imu_data, roll, pitch, yaw);
      Serial.print("BLE Sent: ");
      Serial.print(" R:"); Serial.print(roll, 1);
      Serial.print(" P:"); Serial.print(pitch, 1);
      Serial.print(" Y:"); Serial.println(yaw, 1);
    }
  }
}