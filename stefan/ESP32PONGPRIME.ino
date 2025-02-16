#include <Wire.h>
#include <MPU6050_light.h>
#include <Adafruit_SSD1306.h>
#include <math.h>
#include <WiFi.h>
#include <WebServer.h>

// WiFi credentials
const char* ssid = "uwontop";
const char* password = "password";

// Create MPU6050 object using Wire
MPU6050 mpu(Wire);

// Create OLED display object (128x64) on I2C address 0x3C
Adafruit_SSD1306 display(128, 64, &Wire);

// Create HTTP server on port 80
WebServer server(80);

// Timer for updating display every second
unsigned long timer = 0;

// Thresholds for movement detection (adjust as needed)
const float ACC_THRESHOLD = 0.01;  // Acceleration deviation from 1g that indicates movement
const float GYRO_THRESHOLD = 50;   // Gyro threshold in deg/s

// Force sensor configuration
const int FORCE_SENSOR_PIN = 25;  // Digital pin connected to the force sensor

// Variables to hold sensor status for HTTP output
bool forceActive = false;
bool movingFast = false;
float accMag = 0.0;
float gyroX = 0.0, gyroY = 0.0, gyroZ = 0.0;

// Variable to hold the last time force sensor was activated
unsigned long forceActivatedTimestamp = 0;

// HTTP endpoint to return sensor data in JSON format.
void handleData() {
  String json = "{";
  json += "\"forceActive\":" + String(forceActive ? "1" : "0") + ",";
  json += "\"movingFast\":" + String(movingFast ? "1" : "0") + ",";
  json += "\"accMag\":" + String(accMag, 2) + ",";
  json += "\"gyroX\":" + String(gyroX, 2) + ",";
  json += "\"gyroY\":" + String(gyroY, 2) + ",";
  json += "\"gyroZ\":" + String(gyroZ, 2);
  json += "}";
  
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  delay(500); // Wait for Serial to initialize
  Wire.begin();

  // Connect to WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.println("\nConnecting to WiFi");
  while(WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(100);
  }
  Serial.println("\nConnected to the WiFi network");
  Serial.print("Local ESP32 IP: ");
  Serial.println(WiFi.localIP());
  delay(1000);

  Serial.print("HTTP server running on port: ");
  Serial.println(80);
  delay(1000);

  // Set up the force sensor input (assuming active HIGH)
  pinMode(FORCE_SENSOR_PIN, INPUT);

  // Initialize MPU6050
  byte status = mpu.begin();
  Serial.print(F("MPU6050 status: "));
  Serial.println(status);
  while (status != 0) {
    // If MPU6050 is not connected, halt here.
  }
  
  Serial.println(F("Calculating offsets, please do not move the MPU6050"));
  delay(1000);
  mpu.calcOffsets(true, true); // Calculate offsets for both gyro and accelerometer
  Serial.println(F("Offsets calculated!\n"));
  delay(1000);
  
  // Initialize the OLED display
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { // 0x3C is the I2C address for the display
    Serial.println(F("SSD1306 allocation failed"));
    while (true); // Stay here if display initialization fails.
  }
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  // Rotate display sideways (90° clockwise)
  display.setRotation(1);
  display.display();
  
  // Set up HTTP server routes
  server.on("/data", HTTP_GET, handleData);
  server.begin();
  Serial.println("HTTP server started");
  delay(1000);
}

void loop() {
  // Always update the HTTP server to handle incoming requests
  server.handleClient();

  // Update sensor values every loop
  mpu.update();

  // Get raw force sensor reading (true if activated)
  bool rawForce = (digitalRead(FORCE_SENSOR_PIN) == HIGH);
  
  // If the sensor is activated, store the current time.
  if (rawForce) {
    forceActivatedTimestamp = millis();
    forceActive = true;
  } else {
    // If less than 2 seconds have passed since the last activation, continue reporting true.
    if (millis() - forceActivatedTimestamp < 2000) {
      forceActive = true;
    } else {
      forceActive = false;
    }
  }

  // Read accelerometer values (in multiples of g)
  float ax = mpu.getAccX();
  float ay = mpu.getAccY();
  float az = mpu.getAccZ();
  
  // Calculate acceleration magnitude
  accMag = sqrt(ax * ax + ay * ay + az * az);
  
  // Check if the acceleration magnitude deviates from 1g by more than the threshold.
  bool accelMoving = fabs(accMag - 1.0) > ACC_THRESHOLD;
  
  // Get gyro values
  gyroX = mpu.getGyroX();
  gyroY = mpu.getGyroY();
  gyroZ = mpu.getGyroZ();
  
  // Check if any of the gyro readings exceed the threshold
  bool gyroMoving = (fabs(gyroX) > GYRO_THRESHOLD ||
                     fabs(gyroY) > GYRO_THRESHOLD ||
                     fabs(gyroZ) > GYRO_THRESHOLD);
  
  // Determine if the sensor is moving fast
  movingFast = accelMoving || gyroMoving;

  // Update OLED display every 1 second
  if (millis() - timer > 1000) {
    display.clearDisplay();
    display.setCursor(0, 20);
    if (forceActive) {
      display.println("Force Active");
    } else if (movingFast) {
      display.println("Moving Fast");
    } else {
      display.println("Not Moving");
    }
    display.display();
    
    timer = millis();
  }
}
