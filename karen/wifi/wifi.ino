#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

// Replace with your network credentials
const char *ssid = "uwontop";      // Wi-Fi network name
const char *password = "password"; // Wi-Fi password

// // Define server on port 80
// ESP8266WebServer server(80);

void setup()
{

  // Output LED Level 1 (D3 = GPIO 0)
  pinMode(D3, OUTPUT);
  // Output LED Level 2 (D4 = GPIO 2)
  pinMode(D4, OUTPUT);

  // Connect to Wi-Fi network
  WiFi.begin(ssid, password);

  // Wait for the connection to complete
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(1000); // Wait 1 second
    Serial.println("Connecting to WiFi...");
  }

  // Once connected, print the IP address
  Serial.println("Connected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Set the serial monitor baudrate to 9600
  Serial.begin(9600);
}

void loop()
{
  Serial.println("Connected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Variable to store ADC value ( 0 to 1023 )
  int level;
  // analogRead function returns the integer 10 bit integer (0 to 1023)
  level = analogRead(A0);

  // Print "Analog value:" in serial monitor
  // Serial.println("Analog value:");
  // Print output voltage in serial monitor
  // Serial.println(level);

  // Turn off both LEDs initially
  digitalWrite(D3, LOW);
  digitalWrite(D4, LOW);

  // Splitting 1023 into 5 levels => 200, 400, 600, 800, 1023
  // Based on the ADC output, LED indicates the level (1 to 5)

  if (level < 20)
  {
    // LEVEL 1 LED (D4)
    digitalWrite(D4, HIGH);
  }
  else
  {
    // LEVEL 5 LED (D3)
    digitalWrite(D3, HIGH);
  }
}