import cv2
import numpy as np

# ADDED TABLE PADDING

# Adjust this value based on your calibration: e.g., 5 cm ~ MIN_DISTANCE_PIXELS in your setup.
MIN_DISTANCE_PIXELS = 50

def adjust_lighting(frame):
    """
    Adjusts lighting by performing histogram equalization on the Y channel
    of the YCrCb color space.
    """
    ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
    y, cr, cb = cv2.split(ycrcb)
    y_eq = cv2.equalizeHist(y)
    ycrcb_eq = cv2.merge((y_eq, cr, cb))
    adjusted = cv2.cvtColor(ycrcb_eq, cv2.COLOR_YCrCb2BGR)
    return adjusted

class TableDetector:
    def __init__(self):
        self.tracked_markers = None

    def order_points(self, pts):
        """
        Orders an array of 4 points in the order:
        top-left, top-right, bottom-right, bottom-left.
        """
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        
        return rect

    def remove_close_points(self, points, min_distance):
        """
        Remove points that are too close to one another.
        If multiple points are within min_distance, only one is kept.
        """
        if len(points) == 0:
            return points
        filtered = []
        for pt in points:
            if any(np.linalg.norm(pt - np.array(existing)) < min_distance for existing in filtered):
                continue
            filtered.append(pt)
        return np.array(filtered, dtype="float32")

    def detect_blue_markers(self, frame):
        """
        Detect blue blobs in the frame using HSV thresholding.
        Returns an array of centroid points (N x 2) if found; otherwise, returns None.
        Also removes any centroids that are too close (within MIN_DISTANCE_PIXELS).
        """
        frame_adjusted = adjust_lighting(frame)
        hsv = cv2.cvtColor(frame_adjusted, cv2.COLOR_BGR2HSV)
        lower_blue = np.array([100, 150, 50])
        upper_blue = np.array([140, 255, 255])
        mask = cv2.inRange(hsv, lower_blue, upper_blue)
        
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        contours, _ = cv2.findContours(mask.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        centroids = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 50:
                M = cv2.moments(cnt)
                if M["m00"] != 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                    centroids.append([cx, cy])
        if len(centroids) == 0:
            return None
        centroids = np.array(centroids, dtype="float32")
        centroids = self.remove_close_points(centroids, MIN_DISTANCE_PIXELS)
        return centroids

    def update_tracked_markers(self, tracked, detected, threshold=50, alpha=0.3):
        """
        For each of the 4 tracked markers, find the nearest detected marker
        (if within a threshold distance) and update its position with a smoothing factor.
        """
        updated = tracked.copy()
        used = np.zeros(len(detected), dtype=bool)
        for i in range(4):
            best_idx = -1
            best_dist = float('inf')
            for j in range(len(detected)):
                if used[j]:
                    continue
                dist = np.linalg.norm(tracked[i] - detected[j])
                if dist < best_dist:
                    best_dist = dist
                    best_idx = j
            if best_idx != -1 and best_dist < threshold:
                used[best_idx] = True
                updated[i] = alpha * detected[best_idx] + (1 - alpha) * tracked[i]
        return updated

    def process_frame(self, frame):
        """
        Processes a given frame, updates marker tracking, and if 4 markers are reliably tracked,
        returns the coordinates of the table's vertexes as a list of 4 [x, y] pairs.
        If not, returns None.
        """
        detected = self.detect_blue_markers(frame)
        if detected is not None:
            if self.tracked_markers is None:
                if detected.shape[0] == 4:
                    ordered = self.order_points(detected)
                    self.tracked_markers = ordered
            else:
                self.tracked_markers = self.update_tracked_markers(self.tracked_markers, detected)
        if self.tracked_markers is not None:
            return self.tracked_markers.astype(int).tolist()
        return None

def detect_orange_ball(frame):
    """
    Detects an orange ball in the frame using HSV thresholding.
    Returns the center (x, y) and radius of the ball if found; otherwise, returns (None, None).
    Adjusts thresholds to account for less-saturated (washed out) orange due to lighting.
    """
    frame_adjusted = adjust_lighting(frame)
    hsv = cv2.cvtColor(frame_adjusted, cv2.COLOR_BGR2HSV)
    # Broadened HSV range to account for the ball not being as saturated orange.
    lower_orange = np.array([0, 80, 80])
    upper_orange = np.array([25, 255, 255])
    mask = cv2.inRange(hsv, lower_orange, upper_orange)
    
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if len(contours) == 0:
        return None, None

    largest_contour = max(contours, key=cv2.contourArea)
    ((x, y), radius) = cv2.minEnclosingCircle(largest_contour)
    # Accept even a small ball if radius is at least 2 pixels.
    if radius < 2:
        return None, None
    return (int(x), int(y)), int(radius)

def check_ball_bounds_status(ball_center, table_contour, padded_bounds):
    """
    Returns 0 if the ball is in bounds (inside the table polygon) or off table (outside the
    table polygon but within the padded bounds), and returns 1 if the ball is out of bounds (i.e.,
    outside the padded bounds).

    Parameters:
      - ball_center: (x, y) tuple of the ball's center.
      - table_contour: numpy array of the table vertices (polygon).
      - padded_bounds: tuple (padded_min_x, padded_min_y, padded_max_x, padded_max_y).

    Returns:
      0 if ball is in bounds or off table; 1 if ball is completely out of bounds.
    """
    # Check position relative to the table polygon.
    result = cv2.pointPolygonTest(table_contour, ball_center, False)
    # Unpack padded bounds.
    padded_min_x, padded_min_y, padded_max_x, padded_max_y = padded_bounds
    # Check if the ball is inside the padded rectangle.
    in_padded = (padded_min_x <= ball_center[0] <= padded_max_x and 
                 padded_min_y <= ball_center[1] <= padded_max_y)
    if result >= 0 or in_padded:
        return 0
    else:
        return 1

def determine_ball_side(ball_center, table_vertices):
    """
    Determines if the ball is on the left or right side of the table based on the centroid of the table.
    
    Parameters:
      - ball_center: (x, y) tuple of the ball's center.
      - table_vertices: list of 4 [x, y] pairs defining the table polygon.
    
    Returns:
      "Left" if the ball is to the left of the table's centroid,
      "Right" if it is to the right.
    """
    table_arr = np.array(table_vertices, dtype="float32")
    centroid = table_arr.mean(axis=0)
    if ball_center[0] < centroid[0]:
        return "Left"
    else:
        return "Right"

def main():
    cap = cv2.VideoCapture(2)
    detector = TableDetector()
    
    if not cap.isOpened():
        print("Could not open webcam.")
        return
    
    # Conversion factor: adjust this value based on your calibration.
    PIXELS_PER_CM = 10  # Example: 10 pixels ~ 1 cm.
    # Purple padded area: 5 cm padding.
    purple_padding_pixels = int(5 * PIXELS_PER_CM)
    # Green table rectangle padding: 1 cm padding.
    green_padding_pixels = int(1 * PIXELS_PER_CM)
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_adjusted = adjust_lighting(frame)

        table_vertices = detector.process_frame(frame_adjusted)
        ball_center, ball_radius = detect_orange_ball(frame_adjusted)
        
        padded_bounds = None

        if table_vertices is not None:
            pts = np.array(table_vertices, dtype="int32")
            # Instead of drawing the exact polygon, we compute the bounding box of the table vertices.
            xs = pts[:, 0]
            ys = pts[:, 1]
            min_x = xs.min()
            max_x = xs.max()
            min_y = ys.min()
            max_y = ys.max()

            # Compute a green table rectangle with 1 cm padding.
            green_min_x = max(min_x - green_padding_pixels, 0)
            green_min_y = max(min_y - green_padding_pixels, 0)
            green_max_x = min(max_x + green_padding_pixels, frame.shape[1])
            green_max_y = min(max_y + green_padding_pixels, frame.shape[0])
            
            # Draw the green table rectangle.
            cv2.rectangle(frame, (green_min_x, green_min_y), (green_max_x, green_max_y), (0, 255, 0), 3)
            
            # Compute the purple padded rectangle (5 cm padding).
            padded_min_x = max(min_x - purple_padding_pixels, 0)
            padded_min_y = max(min_y - purple_padding_pixels, 0)
            padded_max_x = min(max_x + purple_padding_pixels, frame.shape[1])
            padded_max_y = min(max_y + purple_padding_pixels, frame.shape[0])
            padded_bounds = (padded_min_x, padded_min_y, padded_max_x, padded_max_y)
            
            # Draw the purple padded rectangle.
            cv2.rectangle(frame, (padded_min_x, padded_min_y), (padded_max_x, padded_max_y), (128, 0, 128), 2)
            
            # Optionally, draw the original detected table vertices.
            for vertex in table_vertices:
                cv2.circle(frame, tuple(vertex), 5, (0, 0, 255), -1)
        
        if ball_center is not None:
            cv2.circle(frame, ball_center, ball_radius, (0, 165, 255), 2)
            if table_vertices is not None and padded_bounds is not None:
                table_contour = np.array(table_vertices, dtype=np.int32)
                # Test ball position relative to the table polygon.
                result = cv2.pointPolygonTest(table_contour, ball_center, False)
                
                # Determine ball status based on its position.
                if result >= 0:
                    status_text = "Ball In Bounds"
                    text_color = (0, 255, 0)
                else:
                    in_padded = (padded_bounds[0] <= ball_center[0] <= padded_bounds[2] and 
                                 padded_bounds[1] <= ball_center[1] <= padded_bounds[3])
                    if in_padded:
                        status_text = "Ball Off Table"
                        text_color = (0, 255, 255)  # Yellow-ish.
                    else:
                        status_text = "Ball Out of Bounds"
                        text_color = (0, 0, 255)
                
                # Get binary status using the additional function.
                binary_status = check_ball_bounds_status(ball_center, table_contour, padded_bounds)
                # Determine left/right side of table.
                side_text = determine_ball_side(ball_center, table_vertices)
                
                # Display status texts.
                cv2.putText(frame, status_text, (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, text_color, 2)
                cv2.putText(frame, f"Side: {side_text}", (50, 90), cv2.FONT_HERSHEY_SIMPLEX, 1, text_color, 2)
                cv2.putText(frame, f"Binary: {binary_status}", (50, 130), cv2.FONT_HERSHEY_SIMPLEX, 1, text_color, 2)
        
        cv2.imshow("Table & Orange Ball Tracking", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
