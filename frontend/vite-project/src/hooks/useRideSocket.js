// src/hooks/useRideSocket.js
import { useEffect, useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import socket, { connectSocketWithToken } from "../utils/socket";

export const useRideSocket = () => {
    const { user, token } = useSelector((state) => state.auth);

    const [rideStatus, setRideStatus] = useState("IDLE");
    const [currentRide, setCurrentRide] = useState(null);
    const [driverLocation, setDriverLocation] = useState(null);
    const [eta, setEta] = useState(null);                              // NEW: ETA minutes
    const [distanceToPickup, setDistanceToPickup] = useState(null);   // NEW: Distance km
    const [isTracking, setIsTracking] = useState(false);                // NEW: Tracking state
    const [newRequests, setNewRequests] = useState([]);
    const [availablePartners, setAvailablePartners] = useState([]);
    const [error, setError] = useState(null);
    const [isConnected, setIsConnected] = useState(false);            // NEW: Connection status
    const [isArrivedLoading, setIsArrivedLoading] = useState(false);  // NEW: "I Arrived" loading
    const watchIdRef = useRef(null);                                  // NEW: GPS watch
    const locationIntervalRef = useRef(null);                           // NEW: Location interval

    // =================================================================
    // CONNECTION HANDLER (FIXED: with reconnection & status tracking)
    // =================================================================
    useEffect(() => {
        if (token && !socket.connected) {
            console.log("🔌 useRideSocket connecting with token...");
            connectSocketWithToken(token);
        }

        const handleConnect = () => {
            console.log("✅ useRideSocket connected! Socket ID:", socket.id);
            setIsConnected(true);
            setError(null);
            if (user?._id) {
                socket.emit("join", user._id);
            }
            // Reconnect: request rejoin of active rides
            socket.emit("reconnect:request", {}, (response) => {
                if (response?.success && response.rejoinedRides?.length > 0) {
                    console.log("🔄 Rejoined rides:", response.rejoinedRides);
                }
            });
        };

        const handleDisconnect = (reason) => {
            console.log("🔌 Socket disconnected:", reason);
            setIsConnected(false);
        };

        const handleConnectError = (err) => {
            console.error("❌ Socket connect error:", err.message);
            setError("Connection failed: " + err.message);
            setIsConnected(false);
        };

        if (socket.connected) {
            setIsConnected(true);
            handleConnect();
        }

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("connect_error", handleConnectError);

        // Heartbeat to detect stale connections
        const heartbeat = setInterval(() => {
            if (socket.connected) {
                socket.emit("ping", (response) => {
                    if (!response?.success) {
                        console.warn("⚠️ Heartbeat failed");
                    }
                });
            }
        }, 20000);

        return () => {
            clearInterval(heartbeat);
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off("connect_error", handleConnectError);
        };
    }, [token, user?._id]);

    // =================================================================
    // CORE LISTENERS (Your existing + NEW tracking listeners)
    // =================================================================
    useEffect(() => {
        console.log("📡 Frontend Core Listeners Connected.");

        // --- Passenger Streams ---
        socket.on("ride:searching", (data) => {
            console.log("🔍 Ride searching:", data);
            setRideStatus("SEARCHING");
            setCurrentRide(prev => ({ ...prev, rideId: data.rideId, driversNotified: data.driversNotified }));
        });

        socket.on("ride:accepted_by_driver", (data) => {
            console.log("🚗 Ride accepted by driver:", data);
            setRideStatus("ACCEPTED");
            setCurrentRide(data);
            if (data?.rideId) {
                socket.emit("join:ride", data.rideId, (response) => {
                    if (response?.success) {
                        setIsTracking(true);
                        console.log("✅ Joined ride room:", data.rideId);
                    }
                });
            }
        });

        // FIXED: Enhanced driver arrived handler with full data
        socket.on("ride:driver_arrived", (data) => {
            console.log("📍 Driver arrived:", data);
            setRideStatus("ARRIVED");
            setEta(0);
            setDistanceToPickup(0);
            // Show browser notification
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("🚗 Driver Arrived!", {
                    body: data?.message || "Your driver has arrived at the pickup location.",
                    icon: "/logo192.png"
                });
            }
        });

        socket.on("drivers:nearby_list", (drivers) => {
            setAvailablePartners(drivers);
        });

        // --- Driver Radar Handler ---
        socket.on("ride:new_request", (payload) => {
            console.log("📢 New request received:", payload);
            setNewRequests((prev) => {
                const isDuplicate = prev.some((req) =>
                    req.rideId === payload.rideId || req._id === payload._id
                );
                if (isDuplicate) return prev;
                return [...prev, payload];
            });
        });

        // --- Global Trip Streams ---
        // FIXED: Enhanced location handler with ETA and distance
        socket.on("location:partner_updated", (coords) => {
            console.log("📍 Live location:", coords);
            setDriverLocation({
                lat: coords.latitude,
                lng: coords.longitude,
                heading: coords.heading || 0,
                accuracy: coords.accuracy || 10,
                timestamp: coords.timestamp
            });
            // NEW: Set ETA and distance from backend calculation
            if (coords.etaMinutes !== undefined && coords.etaMinutes !== null) {
                setEta(coords.etaMinutes);
            }
            if (coords.distanceToPickup !== undefined && coords.distanceToPickup !== null) {
                setDistanceToPickup(coords.distanceToPickup);
            }
            if (coords.rideStatus) {
                setRideStatus(coords.rideStatus);
            }
        });

        // Also listen for broadcast fallback
        socket.on("location:broadcast", (coords) => {
            console.log("📍 Live location (broadcast):", coords);
            setDriverLocation({ lat: coords.latitude, lng: coords.longitude });
        });

        // NEW: Listen for ride status updates
        socket.on("ride:status_updated", (data) => {
            console.log("🔄 Ride status updated:", data);
            if (data.status) {
                setRideStatus(data.status);
            }
        });

        socket.on("ride:started", () => {
            setRideStatus("ONGOING");
        });

        socket.on("ride:finished", (data) => {
            setRideStatus("COMPLETED");
            setCurrentRide(data?.rideDetails);
            setNewRequests([]);
            // eslint-disable-next-line react-hooks/immutability
            stopDriverLocationTracking(); // NEW: Stop tracking on finish
        });

        socket.on("ride:cancelled_by_other_party", (data) => {
            setRideStatus("CANCELLED");
            alert(`Ride cancelled: ${data?.reason || "No reason provided"}`);
            setNewRequests([]);
            setCurrentRide(null);
            stopDriverLocationTracking(); // NEW: Stop tracking on cancel
        });

        // --- Counter Offer (for passenger) ---
        socket.on("ride:partner_counter_offer", (data) => {
            console.log("💰 Counter offer received:", data);
        });

        // --- Error Handler ---
        socket.on("ride:error", (data) => {
            console.error("Socket Error:", data.message);
            setError(data.message);
        });

        // Cleanup
        return () => {
            socket.off("ride:searching");
            socket.off("ride:accepted_by_driver");
            socket.off("ride:driver_arrived");
            socket.off("drivers:nearby_list");
            socket.off("ride:new_request");
            socket.off("location:partner_updated");
            socket.off("location:broadcast");
            socket.off("ride:status_updated");
            socket.off("ride:started");
            socket.off("ride:finished");
            socket.off("ride:cancelled_by_other_party");
            socket.off("ride:partner_counter_offer");
            socket.off("ride:error");
        };
    }, [stopDriverLocationTracking]);

    // =================================================================
    // DRIVER LOCATION TRACKING (NEW - for "Go Online" / active rides)
    // =================================================================

    /**
     * Start sending driver location updates (call when driver accepts ride or goes online)
     * @param {string} rideId - Active ride ID
     */
    const startDriverLocationTracking = useCallback((rideId) => {
        if (!rideId || !socket.connected) {
            console.error("Cannot start tracking: missing rideId or not connected");
            return;
        }

        setIsTracking(true);
        console.log("🚀 Starting driver location tracking for ride:", rideId);

        const sendLocation = (position) => {
            const coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                heading: position.coords.heading || 0,
                accuracy: position.coords.accuracy || 10,
                rideId
            };

            socket.emit("location:update", coords, (response) => {
                if (!response?.success) {
                    console.error("Location update failed:", response?.error);
                }
            });
        };

        const handleError = (error) => {
            console.error("Geolocation error:", error.message);
            setError("Location access denied. Please enable location services.");
        };

        // Use watchPosition for real-time updates
        if (navigator.geolocation) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                sendLocation,
                handleError,
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 5000
                }
            );

            // Backup: Send location every 5 seconds (in case watchPosition is slow)
            locationIntervalRef.current = setInterval(() => {
                navigator.geolocation.getCurrentPosition(sendLocation, handleError);
            }, 5000);
        } else {
            setError("Geolocation is not supported by this browser.");
        }
    }, []);

    /**
     * Stop sending driver location updates (call when ride ends or driver goes offline)
     */
    const stopDriverLocationTracking = useCallback(() => {
        console.log("🛑 Stopping driver location tracking");
        setIsTracking(false);

        if (watchIdRef.current) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        if (locationIntervalRef.current) {
            clearInterval(locationIntervalRef.current);
            locationIntervalRef.current = null;
        }
    }, []);

    // =================================================================
    // ACTION EMITTERS (Your existing + NEW ones)
    // =================================================================

    const emitJoinUser = useCallback((userId) => {
        if (userId) {
            console.log(`➡️ Joining user room: ${userId}`);
            socket.emit("join", userId);
        }
    }, []);

    const emitDriverOnline = useCallback((driverId, lat, lng) => {
        if (driverId) {
            socket.emit("partner:online", { driverId, lat, lng });
        }
    }, []);

    const emitDriverLocationSync = useCallback((driverId, latitude, longitude) => {
        if (driverId && latitude && longitude) {
            socket.emit("partner:location_sync", { driverId, latitude, longitude });
        }
    }, []);

    const emitRequestRide = useCallback((data) => {
        const { rideId, fare, actualFare, distance, duration, vehicleType, passenger, pickupLocation, dropoffLocation } = data;
        if (!passenger?.id || !pickupLocation || !dropoffLocation) {
            console.error("Missing ride request data");
            return;
        }
        socket.emit("ride:request_create", {
            rideId, fare, actualFare, distance, duration, vehicleType, passenger, pickupLocation, dropoffLocation
        });
    }, []);

    const emitDirectAccept = useCallback((rideId, driverId) => {
        if (rideId && driverId) {
            socket.emit("ride:accept_intent", { rideId, driverId });
        }
    }, []);

    const emitCounterOffer = useCallback((rideId, driverId, offeredFare) => {
        if (rideId && driverId && offeredFare) {
            socket.emit("ride:driver_counter_offer", { rideId, driverId, offeredFare });
        }
    }, []);

    // FIXED: Enhanced join ride room with callback
    const emitJoinRideRoom = useCallback((rideId) => {
        if (rideId) {
            socket.emit("join:ride", rideId, (response) => {
                if (response?.success) {
                    setIsTracking(true);
                    console.log("✅ Joined ride room:", rideId);
                    if (response.partnerLocation) {
                        setDriverLocation({
                            lat: response.partnerLocation.latitude,
                            lng: response.partnerLocation.longitude
                        });
                    }
                } else {
                    console.error("Failed to join ride room:", response?.error);
                    setError(response?.error);
                }
            });
        }
    }, []);

    const emitDriverLocationUpdate = useCallback((rideId, latitude, longitude) => {
        if (rideId && latitude && longitude) {
            socket.emit("location:update", { rideId, latitude, longitude });
        }
    }, []);

    const emitGetNearbyDrivers = useCallback((lat, lng) => {
        socket.emit("drivers:get_nearby", { latitude: lat, longitude: lng });
    }, []);

    const emitVerifyOtp = useCallback((rideId, otp) => {
        socket.emit("ride:verify_otp", { rideId, enteredOtp: otp });
    }, []);

    const emitCompleteRide = useCallback((rideId) => {
        socket.emit("ride:complete", { rideId });
    }, []);

    const emitCancelRide = useCallback((rideId) => {
        socket.emit("ride:cancel_by_passenger", { rideId });
    }, []);

    // =================================================================
    // NEW: DRIVER "I ARRIVED" EMITTER
    // =================================================================
    /**
     * Driver marks as arrived at pickup location
     * @param {string} rideId - Current ride ID
     * @returns {Promise} Resolves when server confirms
     */
    const emitDriverArrived = useCallback((rideId) => {
        return new Promise((resolve, reject) => {
            if (!rideId) {
                reject("Ride ID is required");
                return;
            }
            if (!socket.connected) {
                reject("Not connected to server");
                return;
            }

            setIsArrivedLoading(true);
            console.log("📍 Emitting driver:arrived for ride:", rideId);

            socket.emit("driver:arrived", { rideId }, (response) => {
                setIsArrivedLoading(false);
                if (response?.success) {
                    setRideStatus("ARRIVED");
                    stopDriverLocationTracking(); // Stop tracking after arrival
                    resolve(response.data);
                } else {
                    const errMsg = response?.error || "Failed to mark as arrived";
                    setError(errMsg);
                    reject(errMsg);
                }
            });

            // Timeout fallback
            setTimeout(() => {
                setIsArrivedLoading(false);
                reject("Request timeout - please try again");
            }, 10000);
        });
    }, [stopDriverLocationTracking]);

    // =================================================================
    // NEW: REQUEST CURRENT LOCATION (for page refresh)
    // =================================================================
    const emitRequestLocation = useCallback((rideId) => {
        if (rideId) {
            socket.emit("location:request", { rideId }, (response) => {
                if (response?.success && response.data) {
                    setDriverLocation({
                        lat: response.data.latitude,
                        lng: response.data.longitude
                    });
                }
            });
        }
    }, []);

    // =================================================================
    // CLEANUP ON UNMOUNT
    // =================================================================
    useEffect(() => {
        return () => {
            stopDriverLocationTracking();
        };
    }, [stopDriverLocationTracking]);

    return {
        // States
        rideStatus,
        setRideStatus,
        currentRide,
        setCurrentRide,
        driverLocation,
        eta,                          // NEW
        distanceToPickup,             // NEW
        isTracking,                   // NEW
        isConnected,                  // NEW
        isArrivedLoading,             // NEW
        newRequests,
        setNewRequests,
        availablePartners,
        error,

        // Existing Emitters
        emitJoinUser,
        emitDriverOnline,
        emitDriverLocationSync,
        emitRequestRide,
        emitDirectAccept,
        emitCounterOffer,
        emitJoinRideRoom,
        emitDriverLocationUpdate,
        emitGetNearbyDrivers,
        emitVerifyOtp,
        emitCompleteRide,
        emitCancelRide,

        // NEW Emitters
        emitDriverArrived,            // "I Arrived" button
        emitRequestLocation,          // Request current driver location
        startDriverLocationTracking,  // Start GPS tracking
        stopDriverLocationTracking,   // Stop GPS tracking
    };
};

export default useRideSocket;