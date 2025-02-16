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

// Timer for updating display
unsigned long timer = 0;

// New baseline and thresholds (in g's)
const float BASELINE = 1.0;             // Expected magnitude at rest (~1g)
const float THRESHOLD_NOT_MOVING = 0.05;  // Within 0.05g -> "not moving"
const float THRESHOLD_SLOW = 0.1;         // Within 0.1g -> "slow"
const float THRESHOLD_FAST = 0.2;         // Within 0.2g -> "fast"
// Above that -> "very fast"

// Force sensor configuration (digital sensor on pin 25)
const int FORCE_SENSOR_PIN = 25;

// Variables to hold sensor status
int forceValue = 0;    // 1 if force sensor is active, 0 otherwise.
bool forceActive = false;
float accMag = 0.0;
float gyroX = 0.0, gyroY = 0.0, gyroZ = 0.0;
float swingValue = 0.0; // Always 0 in this example

// For force sensor latching: last activation time
unsigned long forceActivatedTimestamp = 0;

// --- HTTP Handler ---
// Returns JSON with sensor data matching your sample
void handleRoot() {
  // Get accelerometer readings
  float ax = mpu.getAccX();
  float ay = mpu.getAccY();
  float az = mpu.getAccZ();
  accMag = sqrt(ax * ax + ay * ay + az * az);

  // Compute difference from baseline
  float diff = fabs(accMag - BASELINE);
  String movement;
  if (diff < THRESHOLD_NOT_MOVING) {
    movement = "not moving";
  } else if (diff < THRESHOLD_SLOW) {
    movement = "slow";
  } else if (diff < THRESHOLD_FAST) {
    movement = "fast";
  } else {
    movement = "very fast";
  }

  // Build JSON string
  String json = "{";
  json += "\"force_value\": " + String(forceValue) + ", ";
  json += "\"accel_x\": " + String(ax, 2) + ", ";
  json += "\"accel_y\": " + String(ay, 2) + ", ";
  json += "\"accel_z\": " + String(az, 2) + ", ";
  json += "\"movement\": \"" + movement + "\", ";
  json += "\"hit\": " + String(forceActive ? 1 : 0) + ", ";
  json += "\"swing\": " + String(swingValue, 2);
  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin();

  // Connect to WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.println("\nConnecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(100);
  }
  Serial.println("\nConnected to the WiFi network");
  Serial.print("Local ESP32 IP: ");
  Serial.println(WiFi.localIP());
  delay(1000);

  // Set up the force sensor input (active HIGH)
  pinMode(FORCE_SENSOR_PIN, INPUT);

  // Initialize MPU6050
  byte status = mpu.begin();
  Serial.print("MPU6050 status: ");
  Serial.println(status);
  while (status != 0) {
    delay(10);
  }
  Serial.println("Calculating offsets, please do not move the MPU6050");
  delay(1000);
  mpu.calcOffsets(true, true);
  Serial.println("Offsets calculated!\n");
  delay(1000);
  
  // Initialize OLED display and rotate 90°
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
    while (true);
  }
  display.setRotation(1);  // Rotate 90° clockwise
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.display();
  
  // Set up HTTP server route
  server.on("/", HTTP_GET, handleRoot);
  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();  // Process incoming HTTP requests

  mpu.update();  // Update sensor readings

  // Read force sensor (digital)
  bool rawForce = (digitalRead(FORCE_SENSOR_PIN) == HIGH);
  if (rawForce) {
    forceActivatedTimestamp = millis();
  }
  // Latch force sensor: active if raw reading is high or within 2 seconds of last trigger.
  forceActive = rawForce || (millis() - forceActivatedTimestamp < 2000);
  forceValue = forceActive ? 1 : 0;
  
  // Get accelerometer readings and compute magnitude
  float ax = mpu.getAccX();
  float ay = mpu.getAccY();
  float az = mpu.getAccZ();
  accMag = sqrt(ax * ax + ay * ay + az * az);

  // Determine movement status based on deviation from baseline
  float diff = fabs(accMag - BASELINE);
  String movement;
  if (diff < THRESHOLD_NOT_MOVING) {
    movement = "not moving";
  } else if (diff < THRESHOLD_SLOW) {
    movement = "slow";
  } else if (diff < THRESHOLD_FAST) {
    movement = "fast";
  } else {
    movement = "very fast";
  }

  // Update OLED display every second:
  // If force sensor is active, display "force active"; otherwise, display the movement status.
  if (millis() - timer > 1000) {
    display.clearDisplay();
    display.setCursor(0, 0);
    if (forceActive) {
      display.println("force active");
    } else {
      display.println(movement);
    }
    display.display();
    timer = millis();
  }
  
  delay(100);
}
