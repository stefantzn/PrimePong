// for esp8266 IP Address: 172.20.10.12

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

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
  Serial.begin(9600);
  
  pinMode(D3, OUTPUT);
  pinMode(D4, OUTPUT);

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

  delay(100); // Small delay for stability
}

