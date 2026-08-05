// src/hooks/useRideTracking.js
// SEPARATE from useRideSocket.js - takes socket as prop
// Use this when you ONLY need tracking (location + map + "I Arrived")
// Use useRideSocket.js when you need FULL ride lifecycle (request, accept, cancel, etc.)

import { useEffect, useState, useCallback, useRef } from "react";

/**
 * useRideTracking - Focused tracking hook (NO socket creation)
 * 
 * @param {Object} socket - Socket instance from useRideSocket.js or your socket util
 * @param {string} rideId - Current active ride ID
 * @param {string} userRole - "driver" or "passenger"
 * 
 * Usage:
 *   const { socket } = useRideSocket();  // Get socket from main hook
 *   const { driverLocation, eta, emitDriverArrived } = useRideTracking(socket, rideId, "driver");
 */
export const useRideTracking = (socket, rideId, userRole) => {
    const [driverLocation, setDriverLocation] = useState(null);
    const [eta, setEta] = useState(null);
    const [distanceToPickup, setDistanceToPickup] = useState(null);
    const [rideStatus, setRideStatus] = useState(null);
    const [isTracking, setIsTracking] = useState(false);
    const [isArrivedLoading, setIsArrivedLoading] = useState(false);
    const [error, setError] = useState(null);
    const watchIdRef = useRef(null);
    const locationIntervalRef = useRef(null);

    // ============================================
    // JOIN RIDE ROOM & LISTEN FOR UPDATES
    // ============================================
    useEffect(() => {
        if (!socket || !rideId || !socket.connected) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsTracking(true);
        setError(null);

        // Join ride room with acknowledgment
        socket.emit("join:ride", rideId, (response) => {
            if (response?.success) {
                console.log("✅ useRideTracking: Joined ride room:", rideId);
                setRideStatus(response.currentStatus);
                if (response.partnerLocation) {
                    setDriverLocation({
                        lat: response.partnerLocation.latitude,
                        lng: response.partnerLocation.longitude,
                        name: response.partnerLocation.name,
                        phone: response.partnerLocation.phone
                    });
                }
            } else {
                setError(response?.error || "Failed to join ride room");
                setIsTracking(false);
            }
        });

        // Listen for driver location updates
        const handleLocationUpdate = (data) => {
            setDriverLocation({
                lat: data.latitude,
                lng: data.longitude,
                heading: data.heading || 0,
                accuracy: data.accuracy || 10,
                timestamp: data.timestamp
            });

            if (data.etaMinutes !== undefined && data.etaMinutes !== null) {
                setEta(data.etaMinutes);
            }
            if (data.distanceToPickup !== undefined && data.distanceToPickup !== null) {
                setDistanceToPickup(data.distanceToPickup);
            }
            if (data.rideStatus) {
                setRideStatus(data.rideStatus);
            }
        };

        // Listen for ride status updates
        const handleStatusUpdate = (data) => {
            setRideStatus(data.status);
            if (data.status === "ARRIVED") {
                setEta(0);
                setDistanceToPickup(0);
            }
        };

        // Listen for driver arrival
        const handleDriverArrived = (data) => {
            setRideStatus("ARRIVED");
            setEta(0);
            setDistanceToPickup(0);
            // Show notification to passenger
            if (userRole === "passenger" && "Notification" in window && Notification.permission === "granted") {
                new Notification("🚗 Driver Arrived!", {
                    body: data?.message || "Your driver has arrived at the pickup location.",
                    icon: "/logo192.png"
                });
            }
        };

        socket.on("location:partner_updated", handleLocationUpdate);
        socket.on("driver:location_update", handleLocationUpdate);
        socket.on("ride:status_updated", handleStatusUpdate);
        socket.on("ride:driver_arrived", handleDriverArrived);

        return () => {
            socket.off("location:partner_updated", handleLocationUpdate);
            socket.off("driver:location_update", handleLocationUpdate);
            socket.off("ride:status_updated", handleStatusUpdate);
            socket.off("ride:driver_arrived", handleDriverArrived);
            socket.emit("leave:ride", rideId);
        };
    }, [socket, rideId, userRole]);

    // ============================================
    // DRIVER: START GPS LOCATION TRACKING
    // ============================================
    const startLocationTracking = useCallback(() => {
        if (!socket || !rideId || userRole !== "driver") return;

        console.log("🚀 useRideTracking: Starting GPS tracking for ride:", rideId);

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

        if (navigator.geolocation) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                sendLocation,
                handleError,
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
            );

            // Backup interval every 5 seconds
            locationIntervalRef.current = setInterval(() => {
                navigator.geolocation.getCurrentPosition(sendLocation, handleError);
            }, 5000);
        } else {
            setError("Geolocation is not supported by this browser.");
        }
    }, [socket, rideId, userRole]);

    // ============================================
    // DRIVER: STOP GPS TRACKING
    // ============================================
    const stopLocationTracking = useCallback(() => {
        console.log("🛑 useRideTracking: Stopping GPS tracking");
        if (watchIdRef.current) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        if (locationIntervalRef.current) {
            clearInterval(locationIntervalRef.current);
            locationIntervalRef.current = null;
        }
    }, []);

    // ============================================
    // DRIVER: "I HAVE ARRIVED" BUTTON
    // ============================================
    const emitDriverArrived = useCallback(() => {
        return new Promise((resolve, reject) => {
            if (!socket || !rideId) {
                reject("Socket or rideId missing");
                return;
            }

            setIsArrivedLoading(true);
            console.log("📍 useRideTracking: Emitting driver:arrived for ride:", rideId);

            socket.emit("driver:arrived", { rideId }, (response) => {
                setIsArrivedLoading(false);
                if (response?.success) {
                    setRideStatus("ARRIVED");
                    stopLocationTracking();
                    resolve(response.data);
                } else {
                    const err = response?.error || "Failed to mark as arrived";
                    setError(err);
                    reject(err);
                }
            });

            setTimeout(() => {
                setIsArrivedLoading(false);
                reject("Request timeout");
            }, 10000);
        });
    }, [socket, rideId, stopLocationTracking]);

    // ============================================
    // REQUEST CURRENT LOCATION (page refresh)
    // ============================================
    const requestLocation = useCallback(() => {
        if (!socket || !rideId) return;
        socket.emit("location:request", { rideId }, (response) => {
            if (response?.success && response.data) {
                setDriverLocation({
                    lat: response.data.latitude,
                    lng: response.data.longitude
                });
            }
        });
    }, [socket, rideId]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopLocationTracking();
    }, [stopLocationTracking]);

    return {
        // States
        driverLocation,
        eta,
        distanceToPickup,
        rideStatus,
        isTracking,
        isArrivedLoading,
        error,

        // Actions
        startLocationTracking,
        stopLocationTracking,
        emitDriverArrived,
        requestLocation
    };
};

export default useRideTracking;