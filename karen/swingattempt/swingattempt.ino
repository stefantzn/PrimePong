#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_MPU6050.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

// Wi-Fi credentials
const char* ssid = "uwontop";
const char* password = "password";

// Create a web server on port 80
ESP8266WebServer server(80);

// Initialize MPU6050
Adafruit_MPU6050 mpu;

void handleRoot() {
  int forceVal = analogRead(A0);  // Read force sensor value
  server.send(200, "text/plain", String(forceVal)); // Send as plain text
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  pinMode(D3, OUTPUT);
  pinMode(D4, OUTPUT);

  // Initialize I2C communication
  Wire.begin(D2, D1);

  // Initialize MPU6050
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) {
      delay(10);
    }
  }
  Serial.println("MPU6050 Found!");

  // Configure MPU6050
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  Serial.println("Connected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Define route for HTTP GET request
  server.on("/", handleRoot);
  server.begin();
}

void loop() {
  server.handleClient();  // Handle incoming HTTP requests

  int forceVal = analogRead(A0);
  bool hit = (forceVal > 15);
  
  // Get accelerometer readings
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float accelMagnitude = sqrt(a.acceleration.x * a.acceleration.x + 
                              a.acceleration.y * a.acceleration.y + 
                              a.acceleration.z * a.acceleration.z);

  String movement;
  bool swing = false;
  if (accelMagnitude > 20) {
    movement = "Very Fast (Swing)";
    swing = true;
  } else if (accelMagnitude > 15) {
    movement = "swing";
  } else if (accelMagnitude > 5) {
    movement = "Slow";
  } else {
    movement = "Still";
  }

  // LED control based on force sensor value
  if (hit || swing) {
    digitalWrite(D3, HIGH);
    digitalWrite(D4, LOW);
  } else {
    digitalWrite(D3, LOW);
    digitalWrite(D4, HIGH);
  }

  // Print status to Serial Monitor
  Serial.print("Force Value: "); Serial.print(forceVal);
  Serial.print(" | Movement: "); Serial.print(movement);
  Serial.print(" | Hit: "); Serial.print(hit ? "Yes" : "No");
  Serial.print(" | Swing: "); Serial.println(swing ? "Yes" : "No");

  delay(100); // Small delay for stability
}

