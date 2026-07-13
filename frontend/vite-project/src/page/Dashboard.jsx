import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import socket, { connectSocketWithToken } from '../utils/socket';
import axios from 'axios';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
    NavigationArrow, Compass, Clock, MapPin, User,
    ChatTeardropText, PaperPlaneRight, X, Phone
} from "@phosphor-icons/react";

const Dashboard = () => {
    const GEOAPIFY_API_KEY = "fe5d7b01bcbb455198274bd1b2bf1408";
    const { user, token } = useSelector((state) => state.auth);
    const location = useLocation();
    const navState = location.state || {};

    const [rideStatus, setRideStatus] = useState(navState?.initialStatus || "IDLE");
    const [myCoords, setMyCoords] = useState(null);
    const [driverLiveLocation, setDriverLiveLocation] = useState(null);
    const [currentRide, setCurrentRide] = useState(navState?.activeRide || null);
    const [loading, setLoading] = useState(true);

    // Chat States
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [showChat, setShowChat] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const chatEndRef = useRef(null);

    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const passengerMarkerRef = useRef(null);
    const driverMarkerRef = useRef(null);

    // ═══════════════════════════════════════════════════════════════
    // FIX #1: RECOVER ACTIVE RIDE ON REFRESH
    // ═══════════════════════════════════════════════════════════════
    useEffect(() => {
        const recoverActiveRide = async () => {
            try {
                setLoading(true);
                const response = await axios.get('http://localhost:8000/api/v1/rides/my-active', {
                    headers: { Authorization: `Bearer ${token}` },
                    withCredentials: true
                });

                const ride = response.data?.data;
                if (ride) {
                    console.log("Recovered active ride:", ride._id);
                    setCurrentRide(ride);
                    setRideStatus(ride.status);
                    socket.emit("ride:join_room", ride._id);
                    socket.emit("join:ride", ride._id);
                    socket.emit("chat:join_room", ride._id);
                }
            } catch (error) {
                console.error("Error recovering active ride:", error.message);
                console.log("No active ride found");
            } finally {
                setLoading(false);
            }
        };

        if (token) recoverActiveRide();
        else setLoading(false);
    }, [token]);

    // Connect socket
    useEffect(() => {
        if (token && !socket.connected) {
            connectSocketWithToken(token);
        }

        const handleConnect = () => {
            if (user?._id) socket.emit("join", user._id);
            if (currentRide?._id) {
                socket.emit("ride:join_room", currentRide._id);
                socket.emit("join:ride", currentRide._id);
                socket.emit("chat:join_room", currentRide._id);
            }
        };

        if (socket.connected) handleConnect();
        else socket.on("connect", handleConnect);

        return () => socket.off("connect", handleConnect);
    }, [token, user?._id, currentRide?._id]);

    // GPS
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setMyCoords([pos.coords.longitude, pos.coords.latitude]),
                (err) => console.warn("GPS Error:", err.message),
                { enableHighAccuracy: true }
            );
        }
    }, []);

    // Map
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;
        const baseCenter = myCoords || [74.3587, 31.5204];
        mapRef.current = new maplibregl.Map({
            container: mapContainerRef.current,
            style: `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${GEOAPIFY_API_KEY}`,
            center: baseCenter, zoom: 14, attributionControl: false
        });
        mapRef.current.on('load', () => mapRef.current.resize());
        return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    }, [myCoords, GEOAPIFY_API_KEY]);

    // Markers
    useEffect(() => {
        if (!mapRef.current) return;
        if (myCoords) {
            if (!passengerMarkerRef.current) {
                passengerMarkerRef.current = new maplibregl.Marker({ color: '#00ff66' })
                    .setLngLat(myCoords).addTo(mapRef.current);
            } else passengerMarkerRef.current.setLngLat(myCoords);
        }
        if (driverLiveLocation) {
            const driverLngLat = [driverLiveLocation.lng, driverLiveLocation.lat];
            if (!driverMarkerRef.current) {
                const el = document.createElement('div');
                el.className = 'driver-marker';
                el.style.backgroundImage = "url('https://cdn-icons-png.flaticon.com/512/744/744465.png')";
                el.style.width = '35px'; el.style.height = '35px'; el.style.backgroundSize = 'cover';
                driverMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat(driverLngLat).addTo(mapRef.current);
            } else driverMarkerRef.current.setLngLat(driverLngLat);
            mapRef.current.flyTo({ center: driverLngLat, speed: 0.8, essential: true });
        }
    }, [myCoords, driverLiveLocation]);

    // ═══════════════════════════════════════════════════════════════
    // FIX #2: SOCKET LISTENERS (Removed wrong event, added missing)
    // ═══════════════════════════════════════════════════════════════
    useEffect(() => {
        const handlePartnerLocation = (coords) => {
            if (coords?.latitude && coords?.longitude) {
                setDriverLiveLocation({ lat: coords.latitude, lng: coords.longitude });
            }
        };

        const handleRideStatusUpdate = (data) => {
            if (data?.status) {
                setRideStatus(data.status.toUpperCase());
                if (data.ride) setCurrentRide(data.ride);
            }
        };

        const handleRideStarted = () => setRideStatus("ONGOING");
        const handleRideFinished = () => {
            setRideStatus("COMPLETED");
            setDriverLiveLocation(null);
            setCurrentRide(null);
            setChatMessages([]);
        };

        const handleRideAccepted = (data) => {
            setRideStatus("ACCEPTED");
            setCurrentRide(data);
            if (data?.rideId || data?._id) {
                socket.emit("join:ride", data.rideId || data?._id);
                socket.emit("chat:join_room", data.rideId || data?._id);
            }
        };

        // ADDED: Driver arrived handler
        const handleDriverArrived = (data) => {
            setRideStatus("ARRIVED");
            console.log("Driver arrived:", data.message);
        };

        // ADDED: Driver cancelled handler
        const handleCancelledByDriver = (data) => {
            alert(`Driver cancelled: ${data.reason || "No reason"}`);
            setRideStatus("IDLE");
            setDriverLiveLocation(null);
            setCurrentRide(null);
            setChatMessages([]);
        };

        const handleRideCancelled = () => {
            setRideStatus("CANCELLED");
            setDriverLiveLocation(null);
            setCurrentRide(null);
            setChatMessages([]);
        };

        // ADDED: Chat handlers
        const handleChatMessage = (msg) => setChatMessages(prev => [...prev, msg]);
        const handleChatHistory = (data) => setChatMessages(data.messages || []);
        const handleChatTyping = (data) => {
            if (data.userId !== user?._id) setIsTyping(data.isTyping);
        };

        // FIXED: Removed 'location:broadcast' - wrong event for passenger
        socket.on("location:partner_updated", handlePartnerLocation);
        socket.on("ride:status_updated", handleRideStatusUpdate);
        socket.on("ride:updated", handleRideStatusUpdate);
        socket.on("ride:started", handleRideStarted);
        socket.on("ride:finished", handleRideFinished);
        socket.on("ride:accepted_by_driver", handleRideAccepted);
        socket.on("ride:cancelled_by_other_party", handleRideCancelled);
        socket.on("ride:cancelled_by_driver", handleCancelledByDriver);
        socket.on("ride:driver_arrived", handleDriverArrived);
        socket.on("chat:receive_message", handleChatMessage);
        socket.on("chat:history_loaded", handleChatHistory);
        socket.on("chat:typing", handleChatTyping);

        return () => {
            socket.off("location:partner_updated", handlePartnerLocation);
            socket.off("ride:status_updated", handleRideStatusUpdate);
            socket.off("ride:updated", handleRideStatusUpdate);
            socket.off("ride:started", handleRideStarted);
            socket.off("ride:finished", handleRideFinished);
            socket.off("ride:accepted_by_driver", handleRideAccepted);
            socket.off("ride:cancelled_by_other_party", handleRideCancelled);
            socket.off("ride:cancelled_by_driver", handleCancelledByDriver);
            socket.off("ride:driver_arrived", handleDriverArrived);
            socket.off("chat:receive_message", handleChatMessage);
            socket.off("chat:history_loaded", handleChatHistory);
            socket.off("chat:typing", handleChatTyping);
        };
    }, [user?._id]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    // ADDED: Cancel ride
    const handleCancelRide = useCallback(() => {
        if (!currentRide?._id) return;
        if (window.confirm("Cancel this ride?")) {
            socket.emit("ride:cancel_by_passenger", { rideId: currentRide._id });
        }
    }, [currentRide]);

    // ADDED: Send chat
    const handleSendMessage = useCallback(() => {
        if (!chatInput.trim() || !currentRide?._id) return;
        socket.emit("chat:send_message", { rideId: currentRide._id, message: chatInput.trim() });
        setChatInput("");
    }, [chatInput, currentRide]);

    // ADDED: Chat typing
    const handleChatTyping = (e) => {
        setChatInput(e.target.value);
        socket.emit("chat:typing", { rideId: currentRide?._id, isTyping: true });
        clearTimeout(window.chatTypingTimeout);
        window.chatTypingTimeout = setTimeout(() => {
            socket.emit("chat:typing", { rideId: currentRide?._id, isTyping: false });
        }, 1000);
    };

    const handleRecenter = useCallback(() => {
        if (!mapRef.current) return;
        const targetCenter = driverLiveLocation
            ? [driverLiveLocation.lng, driverLiveLocation.lat]
            : (myCoords || [74.3587, 31.5204]);
        mapRef.current.flyTo({ center: targetCenter, zoom: 15, duration: 1200 });
    }, [driverLiveLocation, myCoords]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-[#c4ff00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-xs uppercase tracking-widest text-gray-400">Loading your ride...</p>
                </div>
            </div>
        );
    }

    const isActive = rideStatus !== "IDLE" && rideStatus !== "COMPLETED" && rideStatus !== "CANCELLED";

    return (
        <div className="min-h-screen bg-[#020617] text-white p-4 lg:p-8 pt-24 flex flex-col justify-between">
            {isActive ? (
                <div className="w-full max-w-6xl mx-auto flex flex-col flex-1 gap-6">
                    {/* Header */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center backdrop-blur-md shadow-xl">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-[#c4ff00]/10 rounded-xl shrink-0">
                                <NavigationArrow size={20} className="text-[#c4ff00] animate-pulse" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Heading to Destination</h3>
                                <p className="text-sm font-bold text-gray-200 truncate max-w-xs sm:max-w-md">
                                    {currentRide?.dropoffLocation?.address || navState?.activeRide?.dropoffLocation?.address || "Loading..."}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5 rounded-full border border-white/5 shrink-0">
                            <span className={`w-2 h-2 rounded-full animate-ping ${
                                rideStatus === "ONGOING" ? "bg-green-500" :
                                rideStatus === "ARRIVED" ? "bg-blue-500" :
                                rideStatus === "ACCEPTED" ? "bg-yellow-500" : "bg-gray-500"
                            }`} />
                            <span className="text-[10px] font-black uppercase text-gray-300 tracking-widest">{rideStatus}</span>
                        </div>
                    </div>

                    {/* ADDED: Driver Info Card */}
                    {(rideStatus === "ACCEPTED" || rideStatus === "ARRIVED" || rideStatus === "ONGOING") && currentRide?.driverName && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#c4ff00]/10 rounded-full flex items-center justify-center">
                                    <User size={20} className="text-[#c4ff00]" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">{currentRide.driverName}</p>
                                    <p className="text-xs text-gray-400">{currentRide.vehicle || "Vehicle"} | {currentRide.driverPhone}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {currentRide.driverPhone && (
                                    <a href={`tel:${currentRide.driverPhone}`}
                                        className="p-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 hover:bg-green-500 hover:text-white transition-all">
                                        <Phone size={18} />
                                    </a>
                                )}
                                <button onClick={() => setShowChat(!showChat)}
                                    className="p-2 bg-[#c4ff00]/10 border border-[#c4ff00]/20 rounded-xl text-[#c4ff00] hover:bg-[#c4ff00] hover:text-black transition-all relative">
                                    <ChatTeardropText size={18} />
                                    {chatMessages.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] flex items-center justify-center text-white">{chatMessages.length}</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Map */}
                    <div className="flex-1 h-125 w-full rounded-[2.5rem] overflow-hidden border border-white/10 relative shadow-2xl z-0">
                        <div ref={mapContainerRef} className="w-full h-full absolute inset-0 bg-slate-950" />
                        {!myCoords && (
                            <div className="absolute inset-0 bg-[#020617]/80 flex flex-col gap-3 items-center justify-center font-bold text-xs text-gray-400 uppercase tracking-widest z-10">
                                <span className="text-xl animate-bounce">📡</span>
                                Getting your location...
                            </div>
                        )}
                        <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end z-50 pointer-events-none">
                            <div className="bg-black/85 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex gap-6 shadow-2xl pointer-events-auto">
                                <div>
                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Fare</p>
                                    <p className="text-lg font-black text-[#c4ff00]">Rs. {currentRide?.fare || "---"}</p>
                                </div>
                                <div className="border-l border-white/10 pl-6">
                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Driver</p>
                                    <p className="text-xs font-bold text-white flex items-center gap-1 mt-1">
                                        <User size={16} className="text-green-400" />
                                        {currentRide?.driverName || "---"}
                                    </p>
                                </div>
                            </div>
                            <button onClick={handleRecenter}
                                className="bg-white text-black p-4 rounded-2xl shadow-2xl hover:scale-105 transition-all pointer-events-auto">
                                <Compass size={22} weight="bold" />
                            </button>
                        </div>
                    </div>

                    {/* ADDED: Chat Panel */}
                    {showChat && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                            <div className="flex justify-between items-center border-b border-white/10 pb-2">
                                <h4 className="text-xs font-bold uppercase text-gray-400 flex items-center gap-2">
                                    <ChatTeardropText size={16} className="text-[#c4ff00]" /> Chat with Driver
                                </h4>
                                <button onClick={() => setShowChat(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {chatMessages.length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-4">No messages yet</p>
                                ) : (
                                    chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`text-xs p-2 rounded-lg ${
                                            msg.senderId?._id === user?._id ? "bg-[#c4ff00]/10 text-[#c4ff00] ml-8" : "bg-white/5 mr-8"
                                        }`}>
                                            <p className="font-bold text-[10px] opacity-70">{msg.senderId?.name || "User"}</p>
                                            <p>{msg.message}</p>
                                            <p className="text-[8px] text-gray-500 mt-1">{new Date(msg.createdAt).toLocaleTimeString()}</p>
                                        </div>
                                    ))
                                )}
                                {isTyping && <p className="text-xs text-gray-400 italic">Driver is typing...</p>}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="flex gap-2 pt-2 border-t border-white/10">
                                <input type="text" value={chatInput} onChange={handleChatTyping}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
                                <button onClick={handleSendMessage}
                                    className="bg-[#c4ff00] text-black px-3 py-2 rounded-xl hover:bg-[#b0e600] transition-all">
                                    <PaperPlaneRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ADDED: Cancel Button */}
                    {rideStatus !== "ONGOING" && (
                        <button onClick={handleCancelRide}
                            className="w-full bg-red-500/10 border border-red-500/20 text-red-400 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                            <X size={14} className="inline mr-2" /> Cancel Ride
                        </button>
                    )}
                </div>
            ) : (
                <div className="w-full max-w-md mx-auto my-auto text-center space-y-6 p-8 bg-white/5 border border-white/10 rounded-[2.5rem] shadow-2xl backdrop-blur-sm">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/5">
                        <Clock size={32} className="text-gray-400" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-black uppercase tracking-tight">No Active Trips</h2>
                        <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                            No active ride found. Book a ride to get started.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;