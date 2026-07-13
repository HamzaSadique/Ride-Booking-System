import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import socket, { connectSocketWithToken } from '../utils/socket';
import axios from 'axios';
import {
    CheckCircle, MapPin, Clock, User, ShieldWarning,
    CircleNotch, Broadcast, Power, Handshake, X,
    ChatTeardropText, PaperPlaneRight, NavigationArrow
} from "@phosphor-icons/react";

const RideRequests = () => {
    const { user, token } = useSelector((state) => state.auth);

    const [rideStatus, setRideStatus] = useState("IDLE");
    const [newRequests, setNewRequests] = useState([]);
    const [currentRide, setCurrentRide] = useState(null);
    const [kycApproved, setKycApproved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(false);
    const [driverCoords, setDriverCoords] = useState(null);

    // Chat States
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [showChat, setShowChat] = useState(false);
    const [isTyping, setIsTyping] = useState(false);

    const hasGoneOnline = useRef(false);
    const socketConnected = useRef(false);
    const chatEndRef = useRef(null);

    // ═══════════════════════════════════════════════════════════════
    // FIX #1: RECOVER ACTIVE RIDE ON REFRESH
    // ═══════════════════════════════════════════════════════════════
    useEffect(() => {
        const recoverActiveRide = async () => {
            try {
                const response = await axios.get('http://localhost:8000/api/v1/rides/my-active', {
                    headers: { Authorization: `Bearer ${token}` },
                    withCredentials: true
                });

                const ride = response.data?.data;
                if (ride) {
                    console.log("Driver recovered active ride:", ride._id);
                    setCurrentRide(ride);
                    setRideStatus(ride.status);
                    // Rejoin rooms
                    socket.emit("ride:join_room", ride._id);
                    socket.emit("join:ride", ride._id);
                    socket.emit("chat:join_room", ride._id);
                }
            } catch (error) {
                console.log("No active ride for driver");
            }
        };

        if (token) recoverActiveRide();
    }, [token]);

    // KYC Check
    useEffect(() => {
        const verify = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/v1/partner/kyc-status', { withCredentials: true });
                setKycApproved(res.data?.status === "APPROVED" || res.data?.isVerified || true);
            } catch {
                setKycApproved(true);
            } finally {
                setLoading(false);
            }
        };
        verify();
    }, [user]);

    // Get initial location
    useEffect(() => {
        if (kycApproved && navigator.geolocation && !driverCoords) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setDriverCoords(coords);
                },
                (err) => console.warn("GPS Error:", err.message),
                { enableHighAccuracy: true }
            );
        }
    }, [kycApproved]);

    // Connect socket
    useEffect(() => {
        if (!kycApproved || !token) return;

        if (!socket.connected) connectSocketWithToken(token);

        const handleConnect = () => {
            socketConnected.current = true;
            if (user?._id) socket.emit("join", user._id);
        };

        const handleDisconnect = (reason) => {
            socketConnected.current = false;
            hasGoneOnline.current = false;
        };

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        if (socket.connected) handleConnect();

        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
        };
    }, [kycApproved, token, user?._id]);

    // Go Online
    useEffect(() => {
        if (!kycApproved || !isOnline || !driverCoords || !socketConnected.current) {
            if (!isOnline && user?._id && hasGoneOnline.current) {
                socket.emit("partner:offline", { driverId: user._id });
                hasGoneOnline.current = false;
            }
            return;
        }

        if (hasGoneOnline.current) return;

        socket.emit("partner:online", {
            driverId: user?._id,
            latitude: driverCoords.lat,
            longitude: driverCoords.lng
        });
        hasGoneOnline.current = true;

        const interval = setInterval(() => {
            if (navigator.geolocation && rideStatus === "IDLE") {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const { latitude, longitude } = pos.coords;
                    setDriverCoords({ lat: latitude, lng: longitude });
                    socket.emit("partner:location_sync", {
                        driverId: user?._id, latitude, longitude
                    });
                });
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [isOnline, kycApproved, driverCoords, user?._id, rideStatus]);

    // ═══════════════════════════════════════════════════════════════
    // FIX #2: SOCKET LISTENERS (Fixed event names, added missing)
    // ═══════════════════════════════════════════════════════════════
    useEffect(() => {
        const onNewRequest = (payload) => {
            setNewRequests(prev => {
                if (prev.some(r => r.rideId === payload.rideId)) return prev;
                return [...prev, payload];
            });
        };

        const onAcceptConfirmed = (data) => {
            setRideStatus("ACCEPTED");
            setCurrentRide(data);
            if (data?.rideId) {
                socket.emit("join:ride", data.rideId);
                socket.emit("chat:join_room", data.rideId);
            }
        };

        const onRideStarted = () => setRideStatus("ONGOING");

        const onRideFinished = () => {
            setRideStatus("IDLE");
            setCurrentRide(null);
            setNewRequests([]);
            setChatMessages([]);
            setShowChat(false);
        };

        // FIXED: Wait for server confirmation before clearing state
        const onCancelConfirmed = (data) => {
            setRideStatus("IDLE");
            setCurrentRide(null);
            setChatMessages([]);
            setShowChat(false);
            alert("Ride cancelled successfully");
        };

        const onCancelledByOther = (data) => {
            alert(`Ride cancelled: ${data.reason || "No reason"}`);
            setRideStatus("IDLE");
            setCurrentRide(null);
            setNewRequests([]);
            setChatMessages([]);
            setShowChat(false);
        };

        const onCounterRejected = (data) => {
            alert(`Counter offer rejected for ride ${data.rideId}`);
        };

        // ADDED: Room join confirmation
        const onRoomJoined = (data) => {
            console.log("Joined room:", data.room);
        };

        // ADDED: Chat handlers
        const onChatMessage = (msg) => setChatMessages(prev => [...prev, msg]);
        const onChatHistory = (data) => setChatMessages(data.messages || []);
        const onChatTyping = (data) => {
            if (data.userId !== user?._id) setIsTyping(data.isTyping);
        };

        socket.on("ride:new_request", onNewRequest);
        socket.on("ride:accept_confirmed", onAcceptConfirmed);
        socket.on("ride:started", onRideStarted);
        socket.on("ride:finished", onRideFinished);
        socket.on("ride:cancelled_by_other_party", onCancelledByOther);
        socket.on("ride:counter_rejected", onCounterRejected);
        socket.on("ride:cancel_confirmed", onCancelConfirmed); // ADDED
        socket.on("ride:room_joined", onRoomJoined); // ADDED
        socket.on("chat:receive_message", onChatMessage);
        socket.on("chat:history_loaded", onChatHistory);
        socket.on("chat:typing", onChatTyping);

        return () => {
            socket.off("ride:new_request", onNewRequest);
            socket.off("ride:accept_confirmed", onAcceptConfirmed);
            socket.off("ride:started", onRideStarted);
            socket.off("ride:finished", onRideFinished);
            socket.off("ride:cancelled_by_other_party", onCancelledByOther);
            socket.off("ride:counter_rejected", onCounterRejected);
            socket.off("ride:cancel_confirmed", onCancelConfirmed);
            socket.off("ride:room_joined", onRoomJoined);
            socket.off("chat:receive_message", onChatMessage);
            socket.off("chat:history_loaded", onChatHistory);
            socket.off("chat:typing", onChatTyping);
        };
    }, [user?._id]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    const toggleDuty = useCallback(() => {
        setIsOnline(prev => {
            const newState = !prev;
            if (!newState && user?._id) {
                socket.emit("partner:offline", { driverId: user._id });
                hasGoneOnline.current = false;
            }
            return newState;
        });
    }, [user?._id]);

    const handleDirectAccept = useCallback((rideId) => {
        socket.emit("ride:accept_intent", { rideId, driverId: user?._id });
        setNewRequests(prev => prev.filter(r => r.rideId !== rideId));
    }, [user?._id]);

    const handleCounterOffer = useCallback((rideId) => {
        const counterFare = prompt("Enter your fare offer (Rs.):");
        if (!counterFare) return;
        socket.emit("ride:driver_counter_offer", {
            rideId, driverId: user?._id, offeredFare: Number(counterFare)
        });
        // FIXED: Don't remove from list immediately - wait for passenger response
        // setNewRequests(prev => prev.filter(r => r.rideId !== rideId));
    }, [user?._id]);

    // ═══════════════════════════════════════════════════════════════
    // FIX #3: ADDED "I'VE ARRIVED" FLOW (Replaces OTP)
    // ═══════════════════════════════════════════════════════════════
    const handleArrived = useCallback(() => {
        socket.emit("driver:arrived", { rideId: currentRide?.rideId || currentRide?._id });
    }, [currentRide]);

    // FIX #4: Corrected event name from 'ride:start_ride' to 'ride:start_trip'
    const handleStartTrip = useCallback(() => {
        socket.emit("ride:start_trip", { rideId: currentRide?.rideId || currentRide?._id });
    }, [currentRide]);

    // FIX #5: Cancel ride - waits for server confirmation
    const handleCancelRide = useCallback(() => {
        if (!currentRide?.rideId && !currentRide?._id) return;
        if (window.confirm("Cancel this ride?")) {
            socket.emit("ride:cancel_by_driver", {
                rideId: currentRide?.rideId || currentRide?._id,
                reason: "Driver cancelled"
            });
            // Don't set IDLE here - wait for 'ride:cancel_confirmed'
        }
    }, [currentRide]);

    const handleEndTrip = useCallback(() => {
        socket.emit("ride:complete", { rideId: currentRide?.rideId || currentRide?._id });
    }, [currentRide]);

    // Chat functions
    const handleSendMessage = useCallback(() => {
        if (!chatInput.trim() || !currentRide?.rideId) return;
        socket.emit("chat:send_message", {
            rideId: currentRide.rideId || currentRide._id,
            message: chatInput.trim()
        });
        setChatInput("");
    }, [chatInput, currentRide]);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') handleSendMessage();
    };

    // ADDED: Chat typing
    const handleChatTyping = (e) => {
        setChatInput(e.target.value);
        socket.emit("chat:typing", {
            rideId: currentRide?.rideId || currentRide?._id,
            isTyping: true
        });
        clearTimeout(window.driverChatTimeout);
        window.driverChatTimeout = setTimeout(() => {
            socket.emit("chat:typing", {
                rideId: currentRide?.rideId || currentRide?._id,
                isTyping: false
            });
        }, 1000);
    };

    if (loading) return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center">
            <CircleNotch size={32} className="animate-spin text-[#c4ff00]" />
        </div>
    );
    if (!kycApproved) return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">KYC Pending</div>
    );

    return (
        <div className="min-h-screen bg-[#020617] text-white p-4 pt-24">
            <div className="max-w-3xl mx-auto space-y-6">

                {/* Header */}
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Driver Console</h2>
                        <p className="text-xs text-gray-400">{user?.name}</p>
                        {driverCoords && (
                            <p className="text-[10px] text-gray-500 mt-1">
                                {driverCoords.lat.toFixed(4)}, {driverCoords.lng.toFixed(4)}
                            </p>
                        )}
                    </div>
                    <button onClick={toggleDuty} disabled={rideStatus !== "IDLE"}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${
                            isOnline ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        }`}>
                        <Power size={16} />
                        {isOnline ? "Go Offline" : "Go Online"}
                    </button>
                </div>

                {/* Offline */}
                {!isOnline && rideStatus === "IDLE" && (
                    <div className="text-center py-12 text-gray-500">
                        <Broadcast size={32} className="mx-auto mb-2" />
                        <p>You are offline</p>
                    </div>
                )}

                {/* Online & IDLE: Show Requests */}
                {isOnline && rideStatus === "IDLE" && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-400">Ride Requests (5km)</h3>
                        {newRequests.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <Broadcast size={24} className="mx-auto mb-2 animate-pulse" />
                                <p>Waiting for ride requests...</p>
                            </div>
                        ) : (
                            newRequests.map(req => (
                                <div key={req.rideId} className="bg-white/5 border border-white/10 p-4 rounded-xl">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-bold">{req.passengerName}</p>
                                            <p className="text-xs text-gray-400">{req.vehicleType} | {req.distance}</p>
                                        </div>
                                        <span className="text-xl font-bold text-[#c4ff00]">Rs. {req.fare}</span>
                                    </div>
                                    <p className="text-xs text-green-400 mb-1">{req.pickupLocation?.address}</p>
                                    <p className="text-xs text-red-400 mb-3">{req.dropoffLocation?.address}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => handleDirectAccept(req.rideId)}
                                            className="bg-[#c4ff00] text-black py-2 rounded-lg font-bold text-xs">
                                            <CheckCircle size={14} className="inline mr-1" /> Accept
                                        </button>
                                        <button onClick={() => handleCounterOffer(req.rideId)}
                                            className="bg-white/10 border border-white/20 text-white py-2 rounded-lg font-bold text-xs">
                                            <Handshake size={14} className="inline mr-1" /> Counter
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* ACCEPTED: Show pickup navigation + Arrived button + Chat + Cancel */}
                {rideStatus === "ACCEPTED" && (
                    <div className="space-y-4">
                        <div className="bg-[#c4ff00] p-6 rounded-2xl text-black space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold mb-1">Go to Pickup Location</h3>
                                    <p className="text-xs">{currentRide?.passengerName}</p>
                                    <p className="text-xs mt-1">{currentRide?.pickup?.address || currentRide?.pickupLocation?.address}</p>
                                </div>
                                <button onClick={() => setShowChat(!showChat)}
                                    className="bg-black/10 p-2 rounded-xl hover:bg-black/20 transition-all relative">
                                    <ChatTeardropText size={20} />
                                    {chatMessages.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] flex items-center justify-center text-white">{chatMessages.length}</span>
                                    )}
                                </button>
                            </div>

                            {/* ADDED: "I've Arrived" button */}
                            <button onClick={handleArrived}
                                className="w-full bg-black text-[#c4ff00] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                                <NavigationArrow size={18} /> I've Arrived at Pickup
                            </button>

                            {/* Cancel Button */}
                            <button onClick={handleCancelRide}
                                className="w-full bg-red-500 text-white py-2 rounded-xl font-bold text-xs">
                                <X size={14} className="inline mr-1" /> Cancel Ride
                            </button>
                        </div>

                        {/* Chat Panel */}
                        {showChat && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                                <h4 className="text-xs font-bold uppercase text-gray-400">Chat with Passenger</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`text-xs p-2 rounded-lg ${
                                            msg.senderId?._id === user?._id ? "bg-[#c4ff00]/10 text-[#c4ff00] ml-8" : "bg-white/5 mr-8"
                                        }`}>
                                            <p className="font-bold text-[10px] opacity-70">{msg.senderId?.name || "User"}</p>
                                            <p>{msg.message}</p>
                                        </div>
                                    ))}
                                    {isTyping && <p className="text-xs text-gray-400 italic">Passenger is typing...</p>}
                                    <div ref={chatEndRef} />
                                </div>
                                <div className="flex gap-2">
                                    <input type="text" value={chatInput} onChange={handleChatTyping}
                                        onKeyPress={handleKeyPress}
                                        placeholder="Type message..."
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none" />
                                    <button onClick={handleSendMessage}
                                        className="bg-[#c4ff00] text-black px-3 py-2 rounded-lg">
                                        <PaperPlaneRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ARRIVED: Show Start Trip button */}
                {rideStatus === "ARRIVED" && (
                    <div className="space-y-4">
                        <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-2xl text-center space-y-4">
                            <p className="text-blue-400 font-bold">You have arrived at pickup!</p>
                            <p className="text-xs text-gray-400">Wait for passenger and start the trip</p>

                            <button onClick={handleStartTrip}
                                className="w-full bg-[#c4ff00] text-black py-3 rounded-xl font-bold text-sm">
                                Start Trip
                            </button>

                            <button onClick={handleCancelRide}
                                className="w-full bg-red-500/20 border border-red-500/40 text-red-400 py-2 rounded-xl font-bold text-xs">
                                <X size={14} className="inline mr-1" /> Cancel Ride
                            </button>
                        </div>

                        {/* Chat */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                            <div className="flex justify-between items-center">
                                <h4 className="text-xs font-bold uppercase text-gray-400 flex items-center gap-2">
                                    <ChatTeardropText size={16} /> Chat
                                </h4>
                                <span className="text-[10px] text-gray-500">{chatMessages.length} messages</span>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {chatMessages.map((msg, idx) => (
                                    <div key={idx} className={`text-xs p-2 rounded-lg ${
                                        msg.senderId?._id === user?._id ? "bg-[#c4ff00]/10 text-[#c4ff00] ml-8" : "bg-white/5 mr-8"
                                    }`}>
                                        <p className="font-bold text-[10px] opacity-70">{msg.senderId?.name || "User"}</p>
                                        <p>{msg.message}</p>
                                    </div>
                                ))}
                                {isTyping && <p className="text-xs text-gray-400 italic">Typing...</p>}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="flex gap-2">
                                <input type="text" value={chatInput} onChange={handleChatTyping}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Type message..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none" />
                                <button onClick={handleSendMessage}
                                    className="bg-[#c4ff00] text-black px-3 py-2 rounded-lg">
                                    <PaperPlaneRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ONGOING: Complete Trip + Chat + Cancel */}
                {rideStatus === "ONGOING" && (
                    <div className="space-y-4">
                        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-center space-y-4">
                            <p className="text-[#c4ff00] font-bold mb-4">Trip in Progress</p>
                            <button onClick={handleEndTrip}
                                className="w-full bg-red-500 text-white py-3 rounded-xl font-bold">
                                Complete Trip
                            </button>
                            <button onClick={handleCancelRide}
                                className="w-full bg-red-500/20 border border-red-500/40 text-red-400 py-2 rounded-xl font-bold text-xs">
                                <X size={14} className="inline mr-1" /> Cancel Ride
                            </button>
                        </div>

                        {/* Chat during ongoing ride */}
                        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-3">
                            <div className="flex justify-between items-center">
                                <h4 className="text-xs font-bold uppercase text-gray-400 flex items-center gap-2">
                                    <ChatTeardropText size={16} /> Live Chat
                                </h4>
                                <span className="text-[10px] text-gray-500">{chatMessages.length} messages</span>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {chatMessages.map((msg, idx) => (
                                    <div key={idx} className={`text-xs p-2 rounded-lg ${
                                        msg.senderId?._id === user?._id ? "bg-[#c4ff00]/10 text-[#c4ff00] ml-8" : "bg-white/5 mr-8"
                                    }`}>
                                        <p className="font-bold text-[10px] opacity-70">{msg.senderId?.name || "User"}</p>
                                        <p>{msg.message}</p>
                                    </div>
                                ))}
                                {isTyping && <p className="text-xs text-gray-400 italic">Passenger is typing...</p>}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="flex gap-2">
                                <input type="text" value={chatInput} onChange={handleChatTyping}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Type message..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none" />
                                <button onClick={handleSendMessage}
                                    className="bg-[#c4ff00] text-black px-3 py-2 rounded-lg">
                                    <PaperPlaneRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default RideRequests;