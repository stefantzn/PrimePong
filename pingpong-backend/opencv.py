import cv2
import numpy as np
import time
import requests  # Optional: for sending HTTP requests to your game server

# --- CONFIGURATION --- #
MIN_DISTANCE_PIXELS = 50  # Adjust based on your calibration
PIXELS_PER_CM = 10         # Example: 10 pixels ~ 1 cm.
PURPLE_PADDING_CM = 5      # Purple padded rectangle: 5 cm padding.
GREEN_PADDING_CM = 1       # Green table rectangle: 1 cm padding.
DELAY_SECONDS = 3          # Delay before scoring after ball is undetectable

# --- UTILITY FUNCTIONS --- #
def adjust_lighting(frame):
    """Adjust lighting using histogram equalization on the Y channel of YCrCb."""
    ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
    y, cr, cb = cv2.split(ycrcb)
    y_eq = cv2.equalizeHist(y)
    ycrcb_eq = cv2.merge((y_eq, cr, cb))
    return cv2.cvtColor(ycrcb_eq, cv2.COLOR_YCrCb2BGR)

# --- TABLE DETECTOR CLASS --- #
class TableDetector:
    def __init__(self):
        self.tracked_markers = None

    def order_points(self, pts):
        """Order an array of 4 points in the order: top-left, top-right, bottom-right, bottom-left."""
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        return rect

    def remove_close_points(self, points, min_distance):
        """Remove points that are too close together."""
        if len(points) == 0:
            return points
        filtered = []
        for pt in points:
            if any(np.linalg.norm(pt - np.array(existing)) < min_distance for existing in filtered):
                continue
            filtered.append(pt)
        return np.array(filtered, dtype="float32")

    def detect_blue_markers(self, frame):
        """Detect blue markers in the frame and return their centroids."""
        frame_adj = adjust_lighting(frame)
        hsv = cv2.cvtColor(frame_adj, cv2.COLOR_BGR2HSV)
        lower_blue = np.array([100, 150, 50])
        upper_blue = np.array([140, 255, 255])
        mask = cv2.inRange(hsv, lower_blue, upper_blue)
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(mask.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        centroids = []
        for cnt in contours:
            if cv2.contourArea(cnt) > 50:
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
        """Smoothly update tracked marker positions using newly detected markers."""
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
        Processes a frame, updates marker tracking, and if 4 markers are reliably tracked,
        returns the table's vertices as a list of 4 [x, y] pairs.
        """
        detected = self.detect_blue_markers(frame)
        if detected is not None:
            if self.tracked_markers is None:
                if detected.shape[0] == 4:
                    self.tracked_markers = self.order_points(detected)
            else:
                self.tracked_markers = self.update_tracked_markers(self.tracked_markers, detected)
        if self.tracked_markers is not None:
            return self.tracked_markers.astype(int).tolist()
        return None

# --- BALL DETECTION --- #
def detect_orange_ball(frame):
    """Detects the orange ball and returns its center and radius."""
    frame_adj = adjust_lighting(frame)
    hsv = cv2.cvtColor(frame_adj, cv2.COLOR_BGR2HSV)
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
    if radius < 2:
        return None, None
    return (int(x), int(y)), int(radius)

def determine_ball_side(ball_center, table_vertices):
    """Determine if the ball is on the left or right side of the table (based on table centroid)."""
    table_arr = np.array(table_vertices, dtype="float32")
    centroid = table_arr.mean(axis=0)
    return "Left" if ball_center[0] < centroid[0] else "Right"

# --- SCORING LOGIC --- #
# These variables track whether the ball was in bounds and the last detected side.
ball_in_bounds = False
last_detected_side = None
undetectable_start_time = None  # Timestamp when the ball first went undetectable

def trigger_score_event(winner):
    """
    Called when a score event occurs. Replace the print with an HTTP request
    or other integration with your front end.
    """
    print(f"Score event! Player {winner} scores.")
    # Example to send a score update to your game server:
    # url = "http://your-game-server/updateScore"
    # data = {"winner": winner}
    # try:
    #     response = requests.post(url, json=data)
    #     print("Server response:", response.text)
    # except Exception as e:
    #     print("Error sending score event:", e)

# --- MAIN FUNCTION --- #
def main():
    global ball_in_bounds, last_detected_side, undetectable_start_time

    cap = cv2.VideoCapture(2)
    detector = TableDetector()

    if not cap.isOpened():
        print("Could not open webcam.")
        return

    # Pre-calculate padding values in pixels.
    purple_padding_pixels = int(PURPLE_PADDING_CM * PIXELS_PER_CM)
    green_padding_pixels = int(GREEN_PADDING_CM * PIXELS_PER_CM)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_adjusted = adjust_lighting(frame)
        table_vertices = detector.process_frame(frame_adjusted)
        ball_center, ball_radius = detect_orange_ball(frame_adjusted)
        padded_bounds = None

        # Draw table boundaries if table is detected.
        if table_vertices is not None:
            pts = np.array(table_vertices, dtype="int32")
            xs = pts[:, 0]
            ys = pts[:, 1]
            min_x, max_x = xs.min(), xs.max()
            min_y, max_y = ys.min(), ys.max()

            # Draw green table rectangle with 1 cm padding.
            green_min_x = max(min_x - green_padding_pixels, 0)
            green_min_y = max(min_y - green_padding_pixels, 0)
            green_max_x = min(max_x + green_padding_pixels, frame.shape[1])
            green_max_y = min(max_y + green_padding_pixels, frame.shape[0])
            cv2.rectangle(frame, (green_min_x, green_min_y), (green_max_x, green_max_y), (0, 255, 0), 3)

            # Compute and draw purple padded rectangle with 5 cm padding.
            padded_min_x = max(min_x - purple_padding_pixels, 0)
            padded_min_y = max(min_y - purple_padding_pixels, 0)
            padded_max_x = min(max_x + purple_padding_pixels, frame.shape[1])
            padded_max_y = min(max_y + purple_padding_pixels, frame.shape[0])
            padded_bounds = (padded_min_x, padded_min_y, padded_max_x, padded_max_y)
            cv2.rectangle(frame, (padded_min_x, padded_min_y), (padded_max_x, padded_max_y), (128, 0, 128), 2)

            # Optionally, draw the detected table vertices.
            for vertex in table_vertices:
                cv2.circle(frame, tuple(vertex), 5, (0, 0, 255), -1)

        # --- BALL DETECTION & SCORING --- #
        if ball_center is not None:
            # Reset undetectable timer if ball is detected.
            undetectable_start_time = None
            cv2.circle(frame, ball_center, ball_radius, (0, 165, 255), 2)
            if table_vertices is not None and padded_bounds is not None:
                # Determine which side the ball is on.
                side_text = determine_ball_side(ball_center, table_vertices)
                cv2.putText(frame, f"Side: {side_text}", (50, 90),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                # Mark that the ball is detected and update last known side.
                ball_in_bounds = True
                last_detected_side = side_text
                cv2.putText(frame, "Ball Detected", (50, 50),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        else:
            # When the ball is not detected:
            if ball_in_bounds and last_detected_side is not None:
                if undetectable_start_time is None:
                    # Start the timer when ball goes undetectable.
                    undetectable_start_time = time.time()
                else:
                    elapsed = time.time() - undetectable_start_time
                    cv2.putText(frame, f"Undetected: {elapsed:.1f}s", (50, 130),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    if elapsed >= DELAY_SECONDS:
                        # Award point to the opposing team.
                        # If the ball was last seen on the Left, then Player B scores.
                        if last_detected_side == "Left":
                            trigger_score_event("B")
                        else:
                            trigger_score_event("A")
                        # Reset state after scoring.
                        ball_in_bounds = False
                        last_detected_side = None
                        undetectable_start_time = None
            else:
                # Reset the timer if ball_in_bounds is False.
                undetectable_start_time = None

        cv2.imshow("Table & Orange Ball Tracking", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
