#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();  // default I2C address 0x40

// Typical servo pulse range (in microseconds)
#define SERVOMIN  150  // min pulse length
#define SERVOMAX  600  // max pulse length

void setup() {
  Serial.begin(115200);
  Serial.println("PCA9685 Servo Test");

  pwm.begin();
  pwm.setPWMFreq(50);  // 50 Hz for servo motors

  delay(1000);
}

void loop() {
  // Sweep servo connected to channel 0 from 0° to 180°
  for (int i=0; i<=8; i+=4){
    for (int angle = 0; angle <= 180; angle += 5) {
      setServoAngle(i, angle);
      delay(100);
    }

    // Sweep back
    for (int angle = 180; angle >= 0; angle -= 5) {
      setServoAngle(i, angle);
      delay(100);
    }
  }
}

void setServoAngle(uint8_t channel, int angle) {
  int pulseLength = map(angle, 0, 180, SERVOMIN, SERVOMAX);
  pwm.setPWM(channel, 0, pulseLength);
}
