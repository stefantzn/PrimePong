import cv2
import numpy as np
import time
import threading
from flask import Flask, Response, jsonify

# --- CONFIGURATION --- #
MIN_DISTANCE_PIXELS = 50  # Adjust based on your calibration
PIXELS_PER_CM = 10         # Example: 10 pixels ~ 1 cm.
PURPLE_PADDING_CM = 5      # Purple padded rectangle: 5 cm padding.
GREEN_PADDING_CM = 1       # Green table rectangle: 1 cm padding.
DELAY_SECONDS = 3          # Delay before scoring after ball is undetectable

# --- GAME TRACKER CLASS --- #
class GameTracker:
    def __init__(self):
        # State variables
        self.latest_frame = None          # Latest JPEG-encoded frame (annotated)
        self.latest_score_event = None      # Latest score event (dict: e.g. {"winner": "A", "timestamp": ...})
        self.ball_in_bounds = False
        self.last_detected_side = None
        self.undetectable_start_time = None  # When the ball went undetectable

        # Initialize camera
        self.cap = cv2.VideoCapture(2)
        if not self.cap.isOpened():
            raise RuntimeError("Could not open webcam.")

        # Create our table detector instance
        self.detector = self.TableDetector()

        # Pre-calculate padding values in pixels.
        self.purple_padding_pixels = int(PURPLE_PADDING_CM * PIXELS_PER_CM)
        self.green_padding_pixels = int(GREEN_PADDING_CM * PIXELS_PER_CM)

        # Start the detection loop in a background thread.
        self._start_detection_thread()

    def _start_detection_thread(self):
        thread = threading.Thread(target=self._detection_loop, daemon=True)
        thread.start()

    # --- UTILITY FUNCTIONS --- #
    def adjust_lighting(self, frame):
        """Adjust lighting using histogram equalization on the Y channel of YCrCb."""
        ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
        y, cr, cb = cv2.split(ycrcb)
        y_eq = cv2.equalizeHist(y)
        ycrcb_eq = cv2.merge((y_eq, cr, cb))
        return cv2.cvtColor(ycrcb_eq, cv2.COLOR_YCrCb2BGR)

    # --- INNER TABLE DETECTOR CLASS --- #
    class TableDetector:
        def __init__(self):
            self.tracked_markers = None

        def order_points(self, pts):
            """Order 4 points as top-left, top-right, bottom-right, bottom-left."""
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

        def detect_blue_markers(self, frame, adjust_func):
            """Detect blue markers and return centroids."""
            frame_adj = adjust_func(frame)
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
            """Update tracked marker positions smoothly."""
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

        def process_frame(self, frame, adjust_func):
            """
            Processes the frame and, if 4 markers are detected,
            returns the table's vertices as a list of 4 [x, y] pairs.
            """
            detected = self.detect_blue_markers(frame, adjust_func)
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
    def detect_orange_ball(self, frame):
        """Detects the orange ball and returns its center and radius."""
        frame_adj = self.adjust_lighting(frame)
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

    def determine_ball_side(self, ball_center, table_vertices):
        """
        Determines if the ball is on the left or right side of the table based on its centroid.
        """
        table_arr = np.array(table_vertices, dtype="float32")
        centroid = table_arr.mean(axis=0)
        return "Left" if ball_center[0] < centroid[0] else "Right"

    def trigger_score_event(self, winner):
        """
        Called when a score event occurs.
        Updates latest_score_event.
        """
        self.latest_score_event = {"winner": winner, "timestamp": time.time()}
        print(f"Score event! Player {winner} scores.")

    # --- DETECTION LOOP (Background Thread) --- #
    def _detection_loop(self):
        while True:
            ret, frame = self.cap.read()
            if not ret:
                continue

            frame_adjusted = self.adjust_lighting(frame)
            table_vertices = self.detector.process_frame(frame_adjusted, self.adjust_lighting)
            ball_center, ball_radius = self.detect_orange_ball(frame_adjusted)
            padded_bounds = None

            # Draw table boundaries if detected.
            if table_vertices is not None:
                pts = np.array(table_vertices, dtype="int32")
                xs = pts[:, 0]
                ys = pts[:, 1]
                min_x, max_x = xs.min(), xs.max()
                min_y, max_y = ys.min(), ys.max()

                # Draw green table rectangle with 1 cm padding.
                green_min_x = max(min_x - self.green_padding_pixels, 0)
                green_min_y = max(min_y - self.green_padding_pixels, 0)
                green_max_x = min(max_x + self.green_padding_pixels, frame.shape[1])
                green_max_y = min(max_y + self.green_padding_pixels, frame.shape[0])
                cv2.rectangle(frame, (green_min_x, green_min_y), (green_max_x, green_max_y), (0, 255, 0), 3)

                # Compute and draw purple padded rectangle with 5 cm padding.
                padded_min_x = max(min_x - self.purple_padding_pixels, 0)
                padded_min_y = max(min_y - self.purple_padding_pixels, 0)
                padded_max_x = min(max_x + self.purple_padding_pixels, frame.shape[1])
                padded_max_y = min(max_y + self.purple_padding_pixels, frame.shape[0])
                padded_bounds = (padded_min_x, padded_min_y, padded_max_x, padded_max_y)
                cv2.rectangle(frame, (padded_min_x, padded_min_y), (padded_max_x, padded_max_y), (128, 0, 128), 2)

                # Draw table vertices.
                for vertex in table_vertices:
                    cv2.circle(frame, tuple(vertex), 5, (0, 0, 255), -1)

            # --- BALL DETECTION & SCORING --- #
            if ball_center is not None:
                self.undetectable_start_time = None  # Reset timer.
                cv2.circle(frame, ball_center, ball_radius, (0, 165, 255), 2)
                if table_vertices is not None and padded_bounds is not None:
                    side_text = self.determine_ball_side(ball_center, table_vertices)
                    cv2.putText(frame, f"Side: {side_text}", (50, 90),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                    self.ball_in_bounds = True
                    self.last_detected_side = side_text
                    cv2.putText(frame, "Ball Detected", (50, 50),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            else:
                if self.ball_in_bounds and self.last_detected_side is not None:
                    if self.undetectable_start_time is None:
                        self.undetectable_start_time = time.time()
                    else:
                        elapsed = time.time() - self.undetectable_start_time
                        cv2.putText(frame, f"Undetected: {elapsed:.1f}s", (50, 130),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                        if elapsed >= DELAY_SECONDS:
                            if self.last_detected_side == "Left":
                                self.trigger_score_event("B")
                            else:
                                self.trigger_score_event("A")
                            self.ball_in_bounds = False
                            self.last_detected_side = None
                            self.undetectable_start_time = None
                else:
                    self.undetectable_start_time = None

            # Encode frame as JPEG.
            ret2, jpeg = cv2.imencode('.jpg', frame)
            if ret2:
                self.latest_frame = jpeg.tobytes()

    # --- PUBLIC METHODS --- #
    def get_live_footage(self):
        """
        Returns the latest processed frame (JPEG bytes).
        """
        return self.latest_frame

    def get_score_event(self):
        """
        Returns the latest score event as a dict and resets it.
        """
        event = self.latest_score_event
        self.latest_score_event = None
        return event

# --- FLASK APP SETUP --- #
from flask import Flask, Response, jsonify

app = Flask(__name__)
game_tracker = GameTracker()  # Instantiate our game tracker.

def generate_frames():
    """Generator that yields MJPEG frames from the game tracker."""
    while True:
        frame = game_tracker.get_live_footage()
        if frame is None:
            continue
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/video_feed')
def video_feed():
    """Endpoint for streaming live annotated video."""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/score_event')
def score_event():
    """Endpoint to get the latest score event as JSON."""
    event = game_tracker.get_score_event()
    return jsonify({"score_event": event})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

