#include <Wire.h>
#include <Adafruit_PWMServoDriver.h> // For Servos
#include <Adafruit_BNO08x.h>        // For IMU
#include <ArduinoJson.h>            // For BLE JSON

// --- BLE Includes ---
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ========================================
// Configuration
// ========================================

// --- I2C ---
#define MUX_ADDRESS 0x70
#define BNO08X_I2CADDR 0x4B
#define PCA9685_I2CADDR 0x40 // Default PCA9685 address

// --- Pins ---
#define IMU1_RESET_PIN 19
#define IMU2_RESET_PIN 18
// I2C Bus 0 (Mux/IMUs)
#define I2C_SDA_BUS0 21
#define I2C_SCL_BUS0 22
// I2C Bus 1 (Servo Driver)
#define I2C_SDA_BUS1 32
#define I2C_SCL_BUS1 33


// --- Timers ---
#define SAMPLE_RATE_MS 20    // Read sensors at 50Hz
#define SEND_INTERVAL_MS 100 // Send BLE data at 10Hz

// --- Servo ---
#define SERVOMIN 150 // min pulse length
#define SERVOMAX 600 // max pulse length
#define SERVO_FREQ 50 // 50 Hz for analog servos

// ========================================
// Global Objects
// ========================================

// --- I2C Bus Definitions ---
// Wire (Bus 0) is default for Mux/IMUs
// Wire1 (Bus 1) is pre-defined by the ESP32 core

// Tell the servo driver to use the new bus (Wire1)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(PCA9685_I2CADDR, Wire1);

// BNO08x will use the default 'Wire' bus
Adafruit_BNO08x bno08x; 

bool imu1_ready = false;
bool imu2_ready = false;

// --- BLUETOOTH SETUP ---
BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristicTX = NULL; // For Sending (Notify)
BLECharacteristic *pCharacteristicRX = NULL; // For Receiving (Write)
bool deviceConnected = false;
#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID_TX "beb5483e-36e1-4688-b7f5-ea07361b26a8" // TX (Notify)
#define CHARACTERISTIC_UUID_RX "beb5483e-36e1-4688-b7f5-ea07361b26a9" // RX (Write)

// --- NON-BLOCKING TIMER SETUP ---
unsigned long lastSendTime = 0;

// Data structures for storing latest readings
struct IMU_Data
{
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
// Helper Functions - I2C Mux (Uses default 'Wire' bus 0)
// ========================================
void tcaselect(uint8_t channel)
{
    if (channel > 7) return;
    Wire.beginTransmission(MUX_ADDRESS);
    Wire.write(1 << channel);
    Wire.endTransmission();
    delay(2); // Was 10ms
}

void tcaDisableAll()
{
    Wire.beginTransmission(MUX_ADDRESS);
    Wire.write(0);
    Wire.endTransmission();
    delay(2); // Also reduced this one for consistency
}

// ========================================
// Helper Functions - IMU (Uses default 'Wire' bus 0)
// ========================================
void resetBothIMUs()
{
    pinMode(IMU1_RESET_PIN, OUTPUT);
    pinMode(IMU2_RESET_PIN, OUTPUT);

    digitalWrite(IMU1_RESET_PIN, LOW);
    digitalWrite(IMU2_RESET_PIN, LOW);
    delay(200);

    digitalWrite(IMU1_RESET_PIN, HIGH);
    digitalWrite(IMU2_RESET_PIN, HIGH);
    delay(1000);
}

bool checkIMU(uint8_t channel)
{
    tcaselect(channel);
    delay(50); // This delay is fine, only runs once in setup
    Wire.beginTransmission(BNO08X_I2CADDR);
    return (Wire.endTransmission() == 0);
}

bool readIMU(uint8_t channel, IMU_Data &data)
{
    tcaselect(channel);
    // delay(15); // Removed this blocking delay

    sh2_SensorValue_t sensorValue;

    for (int attempt = 0; attempt < 3; attempt++)
    {
        if (bno08x.getSensorEvent(&sensorValue))
        {
            if (sensorValue.sensorId == SH2_ARVR_STABILIZED_RV)
            {
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
        delay(1); // Small delay between failed attempts
    }

    data.valid = false;
    return false;
}

// ========================================
// Helper Functions - Math
// ========================================
void calculateRelativeQuaternion(IMU_Data &q_hand, IMU_Data &q_arm, IMU_Data &q_relative)
{
    float w_arm_conj = q_arm.quat_real;
    float i_arm_conj = -q_arm.quat_i;
    float j_arm_conj = -q_arm.quat_j;
    float k_arm_conj = -q_arm.quat_k;

    float w_hand = q_hand.quat_real;
    float i_hand = q_hand.quat_i;
    float j_hand = q_hand.quat_j;
    float k_hand = q_hand.quat_k;

    q_relative.quat_real = w_arm_conj * w_hand - i_arm_conj * i_hand - j_arm_conj * j_hand - k_arm_conj * k_hand;
    q_relative.quat_i = w_arm_conj * i_hand + i_arm_conj * w_hand + j_arm_conj * k_hand - k_arm_conj * j_hand;
    q_relative.quat_j = w_arm_conj * j_hand - i_arm_conj * k_hand + j_arm_conj * w_hand + k_arm_conj * i_hand;
    q_relative.quat_k = w_arm_conj * k_hand + i_arm_conj * j_hand - j_arm_conj * i_hand + k_arm_conj * w_hand;

    q_relative.valid = true;
}

void quaternionToEuler(IMU_Data &data, float &roll, float &pitch, float &yaw)
{
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

// ========================================
// Helper Functions - Servo (Uses 'pwm' object on 'Wire1' bus 1)
// ========================================
void setServoAngle(uint8_t channel, int angle)
{
    // Ensure angle is within 0-180
    int safe_angle = constrain(angle, 0, 180);
    int pulseLength = map(safe_angle, 0, 180, SERVOMIN, SERVOMAX);
    
    // pwm object is tied to Wire1, so this uses Bus 1 (pins 32, 33)
    pwm.setPWM(channel, 0, pulseLength);
}

// ========================================
// Helper Functions - BLE Callbacks
// ========================================
class MyServerCallbacks : public BLEServerCallbacks
{
    void onConnect(BLEServer *pServer)
    {
        deviceConnected = true;
        Serial.println("Device Connected");
    };
    void onDisconnect(BLEServer *pServer)
    {
        deviceConnected = false;
        Serial.println("Device Disconnected");
        BLEDevice::startAdvertising();
    }
};

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks
{
    void onWrite(BLECharacteristic *pCharacteristic)
    {
        // Changed std::string to String
        String rxValue = pCharacteristic->getValue();

        if (rxValue.length() > 0)
        {
            Serial.print("Received JSON: ");
            Serial.println(rxValue.c_str());

            // Increased buffer size for safety
            StaticJsonDocument<128> doc;
            DeserializationError error = deserializeJson(doc, rxValue);

            if (error)
            {
                Serial.print("deserializeJson() failed: ");
                Serial.println(error.c_str());
                return;
            }

            if (doc.containsKey("a1"))
            {
                int angle = doc["a1"];
                Serial.print("Setting A1 (Ch 0) to: "); Serial.println(angle);
                setServoAngle(0, angle); // Assumes a1 maps to servo 0
            }

            if (doc.containsKey("a2"))
            {
                int angle = doc["a2"];
                Serial.print("Setting A2 (Ch 1) to: "); Serial.println(angle);
                setServoAngle(1, angle); // Assumes a2 maps to servo 1
            }

            if (doc.containsKey("a3"))
            {
                int angle = doc["a3"];
                Serial.print("Setting A3 (Ch 2) to: "); Serial.println(angle);
                setServoAngle(2, angle); // Assumes a3 maps to servo 2
            }
            // Add more keys (a4, a5, etc.) here if needed
        }
    }
};

// ========================================
// Setup
// ========================================
void setup()
{
    Serial.begin(115200);
    while (!Serial) delay(10);
    delay(2000);

    Serial.println("\n╔════════════════════════════════════════╗");
    Serial.println("║   Dual I2C BLE Controller   ║");
    Serial.println("╚════════════════════════════════════════╝\n");

    // --- Initialize BOTH I2C Buses ---
    // Bus 0 for Mux/IMUs
    Wire.begin(I2C_SDA_BUS0, I2C_SCL_BUS0); // (SDA, SCL)
    Wire.setClock(100000);
    Serial.println("✓ I2C Bus 0 (Mux/IMU) initialized on pins 21, 22");

    // Bus 1 for Motor Driver
    Wire1.begin(I2C_SDA_BUS1, I2C_SCL_BUS1); // (SDA, SCL)
    Wire1.setClock(100000); 
    Serial.println("✓ I2C Bus 1 (PCA9685) initialized on pins 32, 33");
    // ------------------------------------

    // Check Mux (uses 'Wire' Bus 0)
    Wire.beginTransmission(MUX_ADDRESS);
    if (Wire.endTransmission() != 0)
    {
        Serial.println("✗ MUX not found on Bus 0 - HALTING");
        while (1) delay(1000);
    }
    Serial.println("✓ I2C Multiplexer found on Bus 0");

    // --- Servo Setup ---
    tcaDisableAll(); // Disables Mux channels (uses 'Wire' Bus 0)
    
    // pwm.begin() will automatically use Bus 1 ('Wire1') now
    pwm.begin(); 
    pwm.setPWMFreq(SERVO_FREQ);
    Serial.println("✓ PCA9685 Servo Driver initialized on Bus 1");
    delay(1000);
    // -------------------

    Serial.println("⟳ Resetting both IMUs...");
    resetBothIMUs();
    tcaDisableAll(); // Uses 'Wire' Bus 0
    delay(200);

    Serial.print("  Checking IMU_1 (Hand)... ");
    imu1_ready = checkIMU(7); // Uses 'Wire' Bus 0
    Serial.println(imu1_ready ? "FOUND" : "NOT FOUND");

    Serial.print("  Checking IMU_2 (Arm)... ");
    imu2_ready = checkIMU(2); // Uses 'Wire' Bus 0
    Serial.println(imu2_ready ? "FOUND" : "NOT FOUND");

    if (!imu1_ready && !imu2_ready)
    {
        Serial.println("\n✗ No IMUs detected on Bus 0 - check wiring");
        // We don't halt, as servo control might still be desired
    }

    // =================================================================
    // =========== CORRECTED IMU INIT LOGIC STARTS HERE ================
    // =================================================================
    Serial.println("\n⚙ Initializing BNO08x library...");
    
    // We must initialize the library on ONE of the sensors.
    // Let's use IMU1 (ch 7) as the primary.
    tcaselect(7);
    delay(200);

    if (!bno08x.begin_I2C(BNO08X_I2CADDR, &Wire))
    {
        Serial.println("✗ BNO08x Library init failed on IMU1. Disabling both IMUs.");
        imu1_ready = false;
        imu2_ready = false;
    }
    else
    {
        Serial.println("✓ BNO08x Library initialized via IMU1");

        // Now that library is up, enable reports for IMU1
        if (imu1_ready)
        {
            if (bno08x.enableReport(SH2_ARVR_STABILIZED_RV, SAMPLE_RATE_MS * 1000))
            {
                Serial.println("✓ IMU_1 reports enabled");
            } else {
                Serial.println("✗ IMU_1 reports failed");
                imu1_ready = false;
            }
        }
        
        delay(200); // Wait before switching Mux

        // Now, JUST enable reports for IMU2 (if it was found)
        // DO NOT call begin_I2C() again!
        if (imu2_ready)
        {
            tcaselect(2); // Select IMU 2 on Bus 0
            delay(200);
            
            if (bno08x.enableReport(SH2_ARVR_STABILIZED_RV, SAMPLE_RATE_MS * 1000))
            {
                Serial.println("✓ IMU_2 reports enabled");
            } else {
                Serial.println("✗ IMU_2 reports failed");
                imu2_ready = false;
            }
        }
    }
    // =================================================================
    // ============= CORRECTED IMU INIT LOGIC ENDS HERE ================
    // =================================================================


    Serial.println("\n╔════════════════════════════════════════╗");
    Serial.print("║ IMU_1 (Hand): ");
    Serial.print(imu1_ready ? "✓ READY " : "✗ FAILED");
    Serial.print("  IMU_2 (Arm): ");
    Serial.print(imu2_ready ? "✓ READY " : "✗ FAILED");
    Serial.println(" ║");
    Serial.println("╚════════════════════════════════════════╝\n");

    // --- BLE Setup ---
    Serial.println("--- FlexoGear BLE Server ---");
    BLEDevice::init("FlexoGear");
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());
    BLEService *pService = pServer->createService(SERVICE_UUID);

    // Create TX Characteristic (Notify)
    pCharacteristicTX = pService->createCharacteristic(
        CHARACTERISTIC_UUID_TX,
        BLECharacteristic::PROPERTY_READ |
        BLECharacteristic::PROPERTY_NOTIFY);
    pCharacteristicTX->addDescriptor(new BLE2902());

    // Create RX Characteristic (Write)
    pCharacteristicRX = pService->createCharacteristic(
        CHARACTERISTIC_UUID_RX,
        BLECharacteristic::PROPERTY_WRITE |
        BLECharacteristic::PROPERTY_WRITE_NR // No Response for faster writes
        );
    pCharacteristicRX->setCallbacks(new MyCharacteristicCallbacks());

    pService->start();

    BLEDevice::startAdvertising();
    Serial.println("Waiting for a client connection...");
}

// ========================================
// Main Loop
// ========================================
void loop()
{
    static unsigned long lastRead = 0;
    unsigned long now = millis();

    // --- Task 1: Read IMUs (at 50Hz) ---
    if (now - lastRead >= SAMPLE_RATE_MS)
    {
        lastRead = now;

        if (imu1_ready) readIMU(7, imu1_data);
        if (imu2_ready) readIMU(2, imu2_data);
    }

    // --- Task 2: Calculate & Send BLE Data (at 10Hz) ---
    if (deviceConnected && (now - lastSendTime >= SEND_INTERVAL_MS))
    {
        lastSendTime = now;

        if (imu1_data.valid && imu2_data.valid)
        {
            // 1. Calculate relative quaternion
            calculateRelativeQuaternion(imu1_data, imu2_data, relative_imu_data);

            // 2. Format relative quaternion as a string (i, j, k, real)
            char quatString[60];
            sprintf(quatString, "%.4f,%.4f,%.4f,%.4f",
                    relative_imu_data.quat_i,
                    relative_imu_data.quat_j,
                    relative_imu_data.quat_k,
                    relative_imu_data.quat_real);

            // 3. Send over BLE
            pCharacteristicTX->setValue(quatString);
            pCharacteristicTX->notify();

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