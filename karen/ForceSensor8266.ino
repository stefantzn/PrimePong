
// for the esp8266
void setup() {
  // Set the serial monitor baudrate to 9600
  Serial.begin(9600);
  
  // Output LED Level 1 (D3 = GPIO 0)
  pinMode(D3, OUTPUT);
  // Output LED Level 2 (D4 = GPIO 2)
  pinMode(D4, OUTPUT);
}

void loop() {
  
  // Variable to store ADC value ( 0 to 1023 )
  int level;
  // analogRead function returns the integer 10 bit integer (0 to 1023)
  level = analogRead(A0);
  
  // Print "Analog value:" in serial monitor
  Serial.println("Analog value:");
  // Print output voltage in serial monitor
  Serial.println(level);
  
  // Turn off both LEDs initially
  digitalWrite(D3, LOW);
  digitalWrite(D4, LOW);

  // Splitting 1023 into 5 levels => 200, 400, 600, 800, 1023
  // Based on the ADC output, LED indicates the level (1 to 5)
  
  if (level < 20) {
    // LEVEL 1 LED (D3)
    digitalWrite(D4, HIGH);
  // } else if (level < 400) {
    // LEVEL 2 LED (D4)
  //   digitalWrite(D4, HIGH);
  // } else if (level < 600) {
  //   // LEVEL 3 LED (D3)
  //   digitalWrite(D3, HIGH);
  // } else if (level < 800) {
  //   // LEVEL 4 LED (D4)
  //   digitalWrite(D4, HIGH);
  } else {
    // LEVEL 5 LED (D3)
    digitalWrite(D3, HIGH);
  }
} 
