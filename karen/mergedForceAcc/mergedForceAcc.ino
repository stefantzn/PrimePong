// for esp8266 IP Address: 172.20.10.12

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_MPU6050.h>

Adafruit_MPU6050 mpu;

// Wi-Fi credentials
const char* ssid = "uwontop";     
const char* password = "password"; 

// Create a web server on port 80
ESP8266WebServer server(80);

void handleRoot() {
  int level = analogRead(A0);  // Read force sensor value
  server.send(200, "text/plain", String(level)); // Send as plain text
}

void setup() {
  // Serial.begin(9600);
  
  pinMode(D3, OUTPUT);
  pinMode(D4, OUTPUT);


  Serial.begin(115200);
  while (!Serial) delay(10);

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






  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }

  Serial.println("Connected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Define route for HTTP GET request
  server.on("/", handleRoot);
  
  // Start the server
  server.begin();
}

void loop() {
  server.handleClient();  // Handle incoming HTTP requests

  int level = analogRead(A0);

  // LED control based on force sensor value
  digitalWrite(D3, level < 20 ? LOW : HIGH);
  digitalWrite(D4, level < 20 ? HIGH : LOW);

    // Get new sensor events
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // // Print accelerometer data
  // Serial.print("Accel X: "); Serial.print(a.acceleration.x); Serial.print(" m/s^2, ");
  // Serial.print("Y: "); Serial.print(a.acceleration.y); Serial.print(" m/s^2, ");
  // Serial.print("Z: "); Serial.print(a.acceleration.z); Serial.println(" m/s^2");

  // // Print gyroscope data
  // Serial.print("Gyro X: "); Serial.print(g.gyro.x); Serial.print(" rad/s, ");
  // Serial.print("Y: "); Serial.print(g.gyro.y); Serial.print(" rad/s, ");
  // Serial.print("Z: "); Serial.print(g.gyro.z); Serial.println(" rad/s");

  // // Print temperature data
  // Serial.print("Temp: "); Serial.print(temp.temperature); Serial.println(" C");

  Serial.println();

  delay(100); // Small delay for stability
}

