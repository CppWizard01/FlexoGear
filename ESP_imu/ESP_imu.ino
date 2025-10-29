#include <Wire.h>
#include <Adafruit_BNO08x.h>

// ========================================
// Configuration
// ========================================
#define MUX_ADDRESS 0x70
#define BNO08X_I2CADDR 0x4B
#define IMU1_RESET_PIN 25
#define IMU2_RESET_PIN 26
#define SAMPLE_RATE_MS 50  // 20Hz (adjust as needed: 20ms=50Hz, 10ms=100Hz)

// ========================================
// Global Objects
// ========================================
Adafruit_BNO08x bno08x;
bool imu1_ready = false;
bool imu2_ready = false;

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

IMU_Data imu1_data = {0};
IMU_Data imu2_data = {0};

// ========================================
// Helper Functions
// ========================================
void tcaselect(uint8_t channel) {
  if (channel > 7) return;
  Wire.beginTransmission(MUX_ADDRESS);
  Wire.write(1 << channel);
  Wire.endTransmission();
  delay(20);
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

// Read IMU data with retries
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

// Convert quaternion to Euler angles (roll, pitch, yaw in degrees)
void quaternionToEuler(IMU_Data &data, float &roll, float &pitch, float &yaw) {
  float qr = data.quat_real;
  float qi = data.quat_i;
  float qj = data.quat_j;
  float qk = data.quat_k;
  
  // Roll (x-axis rotation)
  float sinr_cosp = 2 * (qr * qi + qj * qk);
  float cosr_cosp = 1 - 2 * (qi * qi + qj * qj);
  roll = atan2(sinr_cosp, cosr_cosp) * 180.0 / PI;
  
  // Pitch (y-axis rotation)
  float sinp = 2 * (qr * qj - qk * qi);
  if (abs(sinp) >= 1)
    pitch = copysign(90.0, sinp); // Use 90 degrees if out of range
  else
    pitch = asin(sinp) * 180.0 / PI;
  
  // Yaw (z-axis rotation)
  float siny_cosp = 2 * (qr * qk + qi * qj);
  float cosy_cosp = 1 - 2 * (qj * qj + qk * qk);
  yaw = atan2(siny_cosp, cosy_cosp) * 180.0 / PI;
}

// Print data in different formats
void printQuaternions() {
  if (imu1_data.valid) {
    Serial.print("IMU1["); Serial.print(imu1_data.calibration); Serial.print("] Q(");
    Serial.print(imu1_data.quat_real, 4); Serial.print(", ");
    Serial.print(imu1_data.quat_i, 4); Serial.print(", ");
    Serial.print(imu1_data.quat_j, 4); Serial.print(", ");
    Serial.print(imu1_data.quat_k, 4); Serial.print(")");
  } else {
    Serial.print("IMU1[X] No data");
  }
  
  Serial.print(" | ");
  
  if (imu2_data.valid) {
    Serial.print("IMU2["); Serial.print(imu2_data.calibration); Serial.print("] Q(");
    Serial.print(imu2_data.quat_real, 4); Serial.print(", ");
    Serial.print(imu2_data.quat_i, 4); Serial.print(", ");
    Serial.print(imu2_data.quat_j, 4); Serial.print(", ");
    Serial.print(imu2_data.quat_k, 4); Serial.print(")");
  } else {
    Serial.print("IMU2[X] No data");
  }
  
  Serial.println();
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


// ========================================
// Setup
// ========================================
void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);
  delay(2000);
  
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║   Dual BNO08x IMU - Production Code   ║");
  Serial.println("╚════════════════════════════════════════╝\n");

  Wire.begin();
  Wire.setClock(100000);
  Serial.println("✓ I2C initialized @ 100kHz");
  
  // Check MUX
  Wire.beginTransmission(MUX_ADDRESS);
  if (Wire.endTransmission() != 0) {
    Serial.println("✗ MUX not found - HALTING");
    while(1) delay(1000);
  }
  Serial.println("✓ I2C Multiplexer found");
  
  // Reset both IMUs
  Serial.println("⟳ Resetting both IMUs...");
  resetBothIMUs();
  tcaDisableAll();
  delay(200);
  
  // Verify presence
  Serial.print("  Checking IMU_1... ");
  imu1_ready = checkIMU(0);
  Serial.println(imu1_ready ? "FOUND" : "NOT FOUND");
  
  Serial.print("  Checking IMU_2... ");
  imu2_ready = checkIMU(1);
  Serial.println(imu2_ready ? "FOUND" : "NOT FOUND");
  
  if (!imu1_ready && !imu2_ready) {
    Serial.println("\n✗ No IMUs detected - check wiring");
    while(1) delay(1000);
  }
  
  // Initialize library on channel 0
  Serial.println("\n⚙ Initializing BNO08x library...");
  tcaselect(0);
  delay(200);
  
  if (!bno08x.begin_I2C(BNO08X_I2CADDR, &Wire)) {
    Serial.println("✗ Library init failed");
    imu1_ready = false;
    imu2_ready = false;
  } else {
    Serial.println("✓ Library initialized");
    
    // Enable reports for IMU_1
    if (imu1_ready) {
      if (bno08x.enableReport(SH2_ARVR_STABILIZED_RV, SAMPLE_RATE_MS * 1000)) {
        Serial.println("✓ IMU_1 reports enabled");
      } else {
        Serial.println("✗ IMU_1 reports failed");
        imu1_ready = false;
      }
    }
    
    delay(200);
    
    // Enable reports for IMU_2
    if (imu2_ready) {
      tcaselect(1);
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
  Serial.print("║ IMU_1: ");
  Serial.print(imu1_ready ? "✓ READY " : "✗ FAILED");
  Serial.print("  IMU_2: ");
  Serial.print(imu2_ready ? "✓ READY " : "✗ FAILED");
  Serial.println(" ║");
  Serial.println("╚════════════════════════════════════════╝\n");
  
  Serial.println("Starting data stream...");
  Serial.println("Commands: 'q' = quaternions, 'e' = euler angles\n");
}

// ========================================
// Main Loop
// ========================================
char displayMode = 'q'; // 'q' for quaternions, 'e' for euler

void loop() {
  static unsigned long lastRead = 0;
  unsigned long now = millis();
  
  // Check for serial commands
  if (Serial.available()) {
    char cmd = Serial.read();
    if (cmd == 'q' || cmd == 'Q') {
      displayMode = 'q';
      Serial.println("\n>>> Displaying Quaternions <<<\n");
    } else if (cmd == 'e' || cmd == 'E') {
      displayMode = 'e';
      Serial.println("\n>>> Displaying Euler Angles <<<\n");
    }
  }
  
  // Rate limiting
  if (now - lastRead < SAMPLE_RATE_MS) {
    return;
  }
  lastRead = now;
  
  // Read both IMUs
  if (imu1_ready) readIMU(0, imu1_data);
  if (imu2_ready) readIMU(1, imu2_data);
  
  // Display data
  if (displayMode == 'q') {
    printQuaternions();
  } else {
    printEulerAngles();
  }
}