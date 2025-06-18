"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  FaPlay,
  FaStop,
  FaMapMarkerAlt,
  FaStopwatch,
  FaSun,
  FaMoon,
  FaWalking,
  FaBug,
} from "react-icons/fa";

interface Position {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface Lap {
  lapNumber: number;
  time: string;
  distance: number;
  lapTime: string;
  lapDistance: number;
}

const calculateDistance = (pos1: Position, pos2: Position): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (pos1.latitude * Math.PI) / 180;
  const φ2 = (pos2.latitude * Math.PI) / 180;
  const Δφ = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
  const Δλ = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const formatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters.toFixed(0)} m`;
};

export default function Home() {
  const [isTracking, setIsTracking] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [lastGpsUpdate, setLastGpsUpdate] = useState<number>(0);
  const [isTabVisible, setIsTabVisible] = useState(true);

  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<Position | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLapDistanceRef = useRef(0);
  const lastLapTimeRef = useRef(0);

  useEffect(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem("odom-theme");
    if (savedTheme === "dark") {
      setIsDarkMode(true);
      document.documentElement.setAttribute("data-theme", "dark");
    }

    // Track tab visibility for GPS debugging
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (isTracking && startTimeRef.current) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current!) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTracking]);

  const requestLocationPermission = async () => {
    setIsLoading(true);
    setError("");

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      setIsLoading(false);
      return;
    }

    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      setHasLocationPermission(true);
      setIsLoading(false);
    } catch (err) {
      const error = err as GeolocationPositionError;
      let errorMessage = "Unable to access location.";

      switch (error.code) {
        case 1:
          errorMessage =
            "Location access denied. Please enable location permissions.";
          break;
        case 2:
          errorMessage = "Location unavailable. Please try again.";
          break;
        case 3:
          errorMessage = "Location request timed out. Please try again.";
          break;
      }

      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const startTracking = async () => {
    if (!hasLocationPermission) {
      await requestLocationPermission();
      return;
    }

    setIsTracking(true);
    setElapsedTime(0);
    setTotalDistance(0);
    setLaps([]);
    lastPositionRef.current = null;
    startTimeRef.current = Date.now();
    lastLapDistanceRef.current = 0;
    lastLapTimeRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newPosition: Position = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now(), // Use current time for more accurate updates
        };

        setCurrentPosition(newPosition);
        setLastGpsUpdate(Date.now());

        if (lastPositionRef.current) {
          const distance = calculateDistance(
            lastPositionRef.current,
            newPosition
          );
          if (distance > 5) {
            // Only update if moved more than 5 meters
            setTotalDistance((prev) => prev + distance);
          }
        }

        lastPositionRef.current = newPosition;
      },
      (error) => {
        console.error("Location error:", error);
        setError("GPS tracking error. Please check your location settings.");
      },
      {
        enableHighAccuracy: true,
        timeout: 1000,
        maximumAge: 0,
      }
    );
  };

  const stopTracking = () => {
    // Add final lap before stopping
    if (isTracking && startTimeRef.current) {
      recordLap();
    }

    setIsTracking(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    startTimeRef.current = null;
    lastPositionRef.current = null;
    setCurrentPosition(null);
  };

  const recordLap = () => {
    if (!isTracking || !startTimeRef.current) return;

    const currentTime = elapsedTime;
    const currentDistance = totalDistance;
    const lapTime = currentTime - lastLapTimeRef.current;
    const lapDistance = currentDistance - lastLapDistanceRef.current;

    const newLap: Lap = {
      lapNumber: laps.length + 1,
      time: formatTime(currentTime),
      distance: currentDistance,
      lapTime: formatTime(lapTime),
      lapDistance: lapDistance,
    };

    setLaps((prev) => [...prev, newLap]);
    lastLapDistanceRef.current = currentDistance;
    lastLapTimeRef.current = currentTime;
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    const theme = newTheme ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("odom-theme", theme);
  };

  const toggleDebugMode = () => {
    setDebugMode(!debugMode);
  };

  return (
    <div className="h-screen flex flex-col bg-base-100">
      {/* Fixed Header */}
      <header className="navbar bg-base-200 border-b border-base-300 px-4 shrink-0">
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2 text-base-content">
            <FaWalking className="text-primary" />
            Odom
          </h1>
        </div>
        <div className="flex-none gap-2">
          <button
            className={`btn btn-ghost btn-circle ${
              debugMode ? "btn-active" : ""
            }`}
            onClick={toggleDebugMode}
            aria-label="Toggle debug mode"
          >
            <FaBug
              className={`h-4 w-4 ${
                debugMode ? "text-warning" : "text-base-content"
              }`}
            />
          </button>
          <button
            className="btn btn-ghost btn-circle"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {isDarkMode ? (
              <FaSun className="h-5 w-5 text-base-content" />
            ) : (
              <FaMoon className="h-5 w-5 text-base-content" />
            )}
          </button>
        </div>
      </header>

      {/* Debug Info */}
      {debugMode && currentPosition && (
        <div className="bg-info text-info-content p-3 text-sm">
          <div className="max-w-md mx-auto">
            <div className="font-semibold mb-2">🐛 GPS Debug Info:</div>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Latitude:</strong> {currentPosition.latitude.toFixed(6)}
              </li>
              <li>
                <strong>Longitude:</strong>{" "}
                {currentPosition.longitude.toFixed(6)}
              </li>
              <li>
                <strong>Updated At:</strong>{" "}
                {format(new Date(currentPosition.timestamp), "HH:mm:ss.SSS")}
              </li>
              <li>
                <strong>Status:</strong> GPS tracking active
              </li>
              <li>
                <strong>GPS Lag:</strong>{" "}
                {lastGpsUpdate > 0
                  ? `${Math.round((Date.now() - lastGpsUpdate) / 1000)}s ago`
                  : "Waiting..."}
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
          {!hasLocationPermission ? (
            <div className="text-center space-y-6">
              <div className="text-6xl mb-4 flex justify-center">
                <FaMapMarkerAlt className="text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-base-content">
                Location Required
              </h2>
              <p className="text-base-content/70 mb-6">
                Odom needs access to your location to track distance accurately.
              </p>
              <button
                className={`btn btn-primary btn-lg w-full text-primary-content ${
                  isLoading ? "loading" : ""
                }`}
                onClick={requestLocationPermission}
                disabled={isLoading}
              >
                {isLoading ? "Requesting Access..." : "Enable GPS"}
              </button>
              {error && (
                <div className="alert alert-error">
                  <span className="text-error-content">{error}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex-1 flex flex-col space-y-6 overflow-y-hidden">
              {/* Stats Display */}
              <div className="text-center space-y-4 shrink-0">
                <div className="stats shadow bg-base-200">
                  <div className="stat">
                    <div className="stat-title text-base-content/70">Time</div>
                    <div className="stat-value text-3xl font-mono text-primary">
                      {formatTime(elapsedTime)}
                    </div>
                  </div>
                </div>

                <div className="stats shadow bg-base-200">
                  <div className="stat">
                    <div className="stat-title text-base-content/70">
                      Distance
                    </div>
                    <div className="stat-value text-3xl text-secondary">
                      {formatDistance(totalDistance)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="space-y-4 shrink-0">
                {!isTracking ? (
                  <button
                    className="btn btn-success btn-lg w-full text-xl h-20 flex items-center justify-center gap-3 text-success-content"
                    onClick={startTracking}
                  >
                    <FaPlay className="h-6 w-6" />
                    Start
                  </button>
                ) : (
                  <div className="space-y-3">
                    <button
                      className="btn btn-info btn-lg w-full text-xl h-16 flex items-center justify-center gap-3 text-info-content"
                      onClick={recordLap}
                    >
                      <FaStopwatch className="h-5 w-5" />
                      Lap
                    </button>
                    <button
                      className="btn btn-error btn-lg w-full text-xl h-16 flex items-center justify-center gap-3 text-error-content"
                      onClick={stopTracking}
                    >
                      <FaStop className="h-5 w-5" />
                      Stop
                    </button>
                  </div>
                )}
              </div>

              {/* Laps List - Scrollable */}
              {laps.length > 0 && (
                <div className="flex-1 flex flex-col min-h-0">
                  <h3 className="text-lg font-semibold mb-3 text-base-content shrink-0">
                    Laps
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {[...laps].reverse().map((lap) => (
                      <div
                        key={lap.lapNumber}
                        className="card bg-base-200 compact shadow shrink-0"
                      >
                        <div className="card-body">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-base-content">
                              Lap {lap.lapNumber}
                            </span>
                            <span className="text-sm text-base-content/70">
                              {lap.time}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm mt-1">
                            <span className="text-accent">
                              +{formatDistance(lap.lapDistance)}
                            </span>
                            <span className="text-neutral">+{lap.lapTime}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="alert alert-error shrink-0">
                  <span className="text-error-content">{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
