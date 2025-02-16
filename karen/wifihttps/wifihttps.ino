#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>

// Replace with your network credentials
const char* ssid = "uwontop";
const char* password = "password";

// Replace with your server details
const char* host = "example.com"; // Example domain or IP address
const int httpsPort = 443;         // HTTPS port

// Root CA Certificate (Optional, but recommended for secure connection)
// Obtain this by visiting your server URL in a browser, viewing the certificate, and copying the root certificate
const char* root_ca = \
"-----BEGIN CERTIFICATE-----\n" \
"...your certificate here...\n" \
"-----END CERTIFICATE-----\n";

void setup() {
  // Set the serial monitor baud rate to 9600
  Serial.begin(9600);

  // Output LED Level 1 (D3 = GPIO 0)
  pinMode(D3, OUTPUT);
  // Output LED Level 2 (D4 = GPIO 2)
  pinMode(D4, OUTPUT);

  // Connect to Wi-Fi network
  WiFi.begin(ssid, password);
  
  // Wait for the connection to complete
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }

  // Once connected, print the IP address
  Serial.println("Connected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Variable to store ADC value (0 to 1023)
  int level;
  level = analogRead(A0);

  // Print analog value in serial monitor
  Serial.print("Analog value: ");
  Serial.println(level);
  
  // Turn off both LEDs initially
  digitalWrite(D3, LOW);
  digitalWrite(D4, LOW);

  // Indicator logic for LEDs
  if (level < 20) {
    digitalWrite(D4, HIGH); // LEVEL 1 LED (D4)
  } else {
    digitalWrite(D3, HIGH); // LEVEL 5 LED (D3)
  }

  // HTTPS request
  WiFiClientSecure client;
  client.setInsecure();  // Bypass SSL verification (not recommended for production)
  // Uncomment the next line and comment the above for secure connection
  // client.setTrustAnchors(new X509List(root_ca));

  Serial.print("Connecting to ");
  Serial.println(host);

  if (!client.connect(host, httpsPort)) {
    Serial.println("Connection failed!");
    return;
  }

  // Create a URL for the request
  String url = "/update_sensor";
  String data = "?level=" + String(level); // Sending the level data as query parameter
  url += data;

  Serial.print("Requesting URL: ");
  Serial.println(url);

  // Send the request to the server
  client.print(String("GET ") + url + " HTTP/1.1\r\n" +
               "Host: " + host + "\r\n" + 
               "Connection: close\r\n\r\n");

  // Check and print the response from the server
  while (client.connected()) {
    String line = client.readStringUntil('\n');
    if (line == "\r") {
      break;
    }
  }
  
  // Print the response payload
  String response = client.readString();
  Serial.println("Response:");
  Serial.println(response);

  // Close the connection
  client.stop();

  // Send the data every 10 seconds
  delay(10000);
}

