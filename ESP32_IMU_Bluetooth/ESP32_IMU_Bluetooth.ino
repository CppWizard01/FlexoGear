#include <Wire.h>
#include <Adafruit_BNO08x.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- SENSOR SETUP ---
Adafruit_BNO08x bno08x;
sh2_SensorValue_t sensorValue;

// --- BLUETOOTH SETUP ---
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// --- NON-BLOCKING TIMER SETUP ---
unsigned long lastSendTime = 0;
const int sendInterval = 100; // 100ms = send data 10 times per second

// Callback class for connection status
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Device Connected");
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Device Disconnected");
      // Restart advertising so a new client can connect
      BLEDevice::startAdvertising();
    }
};

void setup() {
  Serial.begin(115200);
  Serial.println("--- FlexoGear BLE Server ---");

  // --- Initialize IMU ---
  if (!bno08x.begin_I2C(0x4B)) {
    Serial.println("Failed to find BNO08x chip");
    while (1) { delay(10); }
  }
  Serial.println("BNO08x Found!");
  // Use the report type that we know works well
  if (!bno08x.enableReport(SH2_ARVR_STABILIZED_RV)) {
    Serial.println("Could not enable stabilized rotation vector");
  }

  // --- Initialize BLE ---
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

void loop() {
  // Check for new sensor data
  if (bno08x.getSensorEvent(&sensorValue)) {
    // Check if the data is the type we requested
    if (sensorValue.sensorId == SH2_ARVR_STABILIZED_RV) {
      
      // Check if a device is connected AND if it's time to send new data
      if (deviceConnected && (millis() - lastSendTime > sendInterval)) {
        
        // Use the correct data structure: arvrStabilizedRV
        char quatString[50];
        sprintf(quatString, "%.4f,%.4f,%.4f,%.4f", 
          sensorValue.un.arvrStabilizedRV.i,
          sensorValue.un.arvrStabilizedRV.j,
          sensorValue.un.arvrStabilizedRV.k,
          sensorValue.un.arvrStabilizedRV.real
        );
        
        pCharacteristic->setValue(quatString);
        pCharacteristic->notify(); // Send the data
        
        Serial.print("Sent: ");
        Serial.println(quatString);
        
        lastSendTime = millis(); // Update the last send time
      }
    }
  }
  
  // Notice there is NO delay() here. The loop runs as fast as possible.
}