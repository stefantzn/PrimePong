void setup() {
  // Set the serial monitor baudrate to 9600
  Serial.begin(9600);
  
  // Output LED Level 1
  pinMode(13,OUTPUT);
  // Output LED Level 2
  pinMode(12,OUTPUT);
  // Output LED Level 3
  pinMode(11,OUTPUT);
  // Output LED Level 4
  pinMode(10,OUTPUT);
  // Output LED Level 5
  pinMode(9,OUTPUT);
  
}

void loop() {
  
  // Variable to store ADC value ( 0 to 1023 )
  int level;
  // analogRead function returns the integer 10 bit integer (0 to 1023)
  level = analogRead(0);
  
  // Print "Analog value:" in serial monitor
  Serial.println("Analog value:");
  // Print output voltage in serial monitor
  Serial.println(level);
  
  // Turn off all the led initially
  digitalWrite(13,LOW);
  digitalWrite(12,LOW);
  digitalWrite(11,LOW);
  digitalWrite(10,LOW);
  digitalWrite(9,LOW);

  
    // Splitting 1023 into 5 level => 200, 400, 600, 800, 1023
    // Based on the ADC output, LED indicates the level (1 to 5)
  
  if (level<200)
  {
    // LEVEL 1 LED
    digitalWrite(13,HIGH);
  }
  else if(level<400)
  {
    // LEVEL 2 LED
    digitalWrite(12,HIGH);
  }
  else if(level<600)
  {
    // LEVEL 3 LED
    digitalWrite(11,HIGH);
  }
  else if(level<800)
  {
    // LEVEL 4 LED
    digitalWrite(10,HIGH);
  }
  else if(level<1023)
  {
    // LEVEL 5 LED
    digitalWrite(9,HIGH);
  }
  
}
