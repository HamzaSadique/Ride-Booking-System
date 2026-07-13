// src/hooks/useRideSocket.js
import { useEffect, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import socket, { connectSocketWithToken } from "../utils/socket"; 

export const useRideSocket = () => {
    const { user, token } = useSelector((state) => state.auth);

    const [rideStatus, setRideStatus] = useState("IDLE"); 
    const [currentRide, setCurrentRide] = useState(null);
    const [driverLocation, setDriverLocation] = useState(null);
    const [newRequests, setNewRequests] = useState([]); 
    const [availablePartners, setAvailablePartners] = useState([]); 
    const [error, setError] = useState(null);

    // CRITICAL FIX: Connect with token, not bare connect()
    useEffect(() => {
        if (token && !socket.connected) {
            console.log("🔌 useRideSocket connecting with token...");
            connectSocketWithToken(token);
        }

        const handleConnect = () => {
            console.log("✅ useRideSocket connected!");
            if (user?._id) {
                socket.emit("join", user._id);
            }
        };

        if (socket.connected) {
            handleConnect();
        } else {
            socket.on("connect", handleConnect);
        }

        return () => {
            socket.off("connect", handleConnect);
        };
    }, [token, user?._id]);

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
                socket.emit("join:ride", data.rideId);
            }
        });

        socket.on("ride:driver_arrived", () => {
            setRideStatus("ARRIVED");
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
        socket.on("location:partner_updated", (coords) => {
            console.log("📍 Live location:", coords);
            setDriverLocation({ lat: coords.latitude, lng: coords.longitude });
        });

        // Also listen for broadcast fallback
        socket.on("location:broadcast", (coords) => {
            console.log("📍 Live location (broadcast):", coords);
            setDriverLocation({ lat: coords.latitude, lng: coords.longitude });
        });

        socket.on("ride:started", () => {
            setRideStatus("ONGOING");
        });

        socket.on("ride:finished", (data) => {
            setRideStatus("COMPLETED");
            setCurrentRide(data?.rideDetails);
            setNewRequests([]); 
        });

        socket.on("ride:cancelled_by_other_party", (data) => {
            setRideStatus("CANCELLED");
            alert(`Ride cancelled: ${data?.reason || "No reason provided"}`);
            setNewRequests([]);
            setCurrentRide(null);
        });

        // --- Counter Offer (for passenger) ---
        socket.on("ride:partner_counter_offer", (data) => {
            console.log("💰 Counter offer received:", data);
            // Store in state or handle in component
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
            socket.off("ride:started");
            socket.off("ride:finished");
            socket.off("ride:cancelled_by_other_party");
            socket.off("ride:partner_counter_offer");
            socket.off("ride:error");
        };
    }, []);

    // =================================================================
    // ACTION EMITTERS
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

    // FIXED: Added direct accept emitter
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

    const emitJoinRideRoom = useCallback((rideId) => {
        if (rideId) {
            socket.emit("join:ride", rideId);
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

    return { 
        rideStatus, 
        setRideStatus, 
        currentRide, 
        setCurrentRide,
        driverLocation, 
        newRequests, 
        setNewRequests,
        availablePartners,
        error,
        // Emitters
        emitJoinUser,
        emitDriverOnline,
        emitDriverLocationSync,
        emitRequestRide,
        emitDirectAccept,      // NEW
        emitCounterOffer,      // NEW
        emitJoinRideRoom,
        emitDriverLocationUpdate,
        emitGetNearbyDrivers,
        emitVerifyOtp,
        emitCompleteRide,
        emitCancelRide
    };
};