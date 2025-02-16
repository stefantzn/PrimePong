import cv2
import numpy as np
import time

cap = cv2.VideoCapture(0)
tracked_blob = None
tracking_start_time = None
tracking_duration = 5  # Time in seconds to confirm tracking

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    # Convert frame to HSV color space
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    
    # Define a less strict color range in HSV centered around #8692ac
    lower_color = np.array([100, 30, 80])  # Adjusted lower bound
    upper_color = np.array([130, 80, 180])  # Adjusted upper bound
    
    # Create mask for detecting the specified color
    mask = cv2.inRange(hsv, lower_color, upper_color)
    
    # Find contours of the detected blob
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if contours:
        # Find the largest contour by area
        largest_contour = max(contours, key=cv2.contourArea)
        
        if cv2.contourArea(largest_contour) > 500:  # Filter small noises
            # Get the rotated rectangle that encloses the blob
            rect = cv2.minAreaRect(largest_contour)
            box = cv2.boxPoints(rect)
            box = box.astype(int)  # Fix for numpy int0 issue
            
            # If not tracking yet, start tracking countdown
            if tracked_blob is None:
                if tracking_start_time is None:
                    tracking_start_time = time.time()
                elif time.time() - tracking_start_time >= tracking_duration:
                    tracked_blob = box
            
            # If tracking, use tracked blob position
            if tracked_blob is not None:
                box = tracked_blob
            
            # Draw the rotated rectangle around the detected blob
            cv2.drawContours(frame, [box], 0, (0, 255, 0), 2)
    else:
        tracking_start_time = None  # Reset tracking countdown if no blob is detected
    
    # Display the result
    cv2.imshow("Color Blob Detection", frame)
    
    # Exit on 'q' key press
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
