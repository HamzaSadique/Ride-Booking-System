import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import socket, { connectSocketWithToken } from '../utils/socket';
import axios from 'axios';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { NavigationArrow, Clock, User, ChatTeardropText, PaperPlaneRight, X, Phone, MapPin } from "@phosphor-icons/react";

const Dashboard = () => {
    const GEOAPIFY_API_KEY = "fe5d7b01bcbb455198274bd1b2bf1408";
    const { user, token } = useSelector((state) => state.auth);
    const location = useLocation();
    const navState = location.state || {};

    const [rideStatus, setRideStatus] = useState(navState.initialStatus || "IDLE");
    const [myCoords, setMyCoords] = useState(null);
    const [driverLiveLocation, setDriverLiveLocation] = useState(null);
    const [pickupCoords, setPickupCoords] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [dropoffCoords, setDropoffCoords] = useState(null);
    const [currentRide, setCurrentRide] = useState(navState.activeRide || null);
    const [loading, setLoading] = useState(true);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [showChat, setShowChat] = useState(false);
    const [mapReady, setMapReady] = useState(false);
    const [eta, setEta] = useState(null);
    const [distance, setDistance] = useState(null);
    
    const chatEndRef = useRef(null);
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const passengerMarkerRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const initialized = useRef(false);

    // Helper: Safely get address string
    const getAddress = (loc) => {
        if (!loc) return "Loading...";
        if (typeof loc === 'string') return loc;
        return loc.address || "Unknown location";
    };

    // Helper: Safely get coords [lng, lat]
    const getCoords = (loc) => {
        if (!loc) return null;
        if (loc.coordinates && Array.isArray(loc.coordinates)) {
            return [loc.coordinates[0], loc.coordinates[1]]; // [lng, lat]
        }
        if (loc.lat !== undefined && loc.lng !== undefined) {
            return [loc.lng, loc.lat];
        }
        if (loc.latitude !== undefined && loc.longitude !== undefined) {
            return [loc.longitude, loc.latitude];
        }
        return null;
    };

    const drawRoute = useCallback(async (start, end) => {
        if (!mapRef.current || !start || !end || !mapReady) return;
        try {
            // Remove old route
            if (mapRef.current.getLayer('route-line')) {
                mapRef.current.removeLayer('route-line');
                mapRef.current.removeSource('route-source');
            }

            const url = `https://api.geoapify.com/v1/routing?waypoints=${start[1]},${start[0]}|${end[1]},${end[0]}&mode=drive&apiKey=${GEOAPIFY_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.features?.length > 0) {
                const route = data.features[0];
                mapRef.current.addSource('route-source', { type: 'geojson', data: route });
                mapRef.current.addLayer({
                    id: 'route-line',
                    type: 'line',
                    source: 'route-source',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': '#c4ff00', 'line-width': 4, 'line-opacity': 0.8 }
                });
                
                const coords = route.geometry.coordinates;
                const bounds = new maplibregl.LngLatBounds();
                coords.forEach(c => bounds.extend(c));
                mapRef.current.fitBounds(bounds, { padding: 100, duration: 1000 });
            }
        } catch (err) {
            console.log("Route draw error:", err.message);
        }
    }, [mapReady, GEOAPIFY_API_KEY]);

    // Initialize - fetch active ride
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        
        const authToken = token || localStorage.getItem('token');
        if (!authToken) { setLoading(false); return; }

        (async () => {
            try {
                setLoading(true);
                if (!socket.connected) connectSocketWithToken(authToken);
                
                const res = await axios.get('http://localhost:8000/api/v1/ride/my-active', {
                    headers: { Authorization: `Bearer ${authToken}` },
                    withCredentials: true
                });
                
                const ride = res.data?.data;
                if (ride && ["PENDING","ACCEPTED","ARRIVED","ONGOING"].includes(ride.status)) {
                    setCurrentRide(ride);
                    setRideStatus(ride.status);
                    
                    // Set pickup/dropoff coords
                    const pCoords = getCoords(ride.pickupLocation);
                    const dCoords = getCoords(ride.dropoffLocation);
                    if (pCoords) setPickupCoords(pCoords);
                    if (dCoords) setDropoffCoords(dCoords);
                } else {
                    setCurrentRide(null);
                    setRideStatus("IDLE");
                }
            } catch (err) {
                console.error("Fetch active ride error:", err);
                setCurrentRide(null);
                setRideStatus("IDLE");
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    // Socket connection
    useEffect(() => {
        const handleConnect = () => {
            if (user?._id) socket.emit("join", user._id);
        };
        if (socket.connected) handleConnect();
        socket.on("connect", handleConnect);
        return () => socket.off("connect", handleConnect);
    }, [user?._id]);

    // Join ride room
    useEffect(() => {
        if (!currentRide?._id || !socket.connected) return;
        socket.emit("join:ride", currentRide._id);
        socket.emit("chat:join_room", currentRide._id);
        socket.emit("ride:join_room", currentRide._id);
    }, [currentRide?._id]);

    // Fetch chat history
    useEffect(() => {
        if (!currentRide?._id || !token) return;
        (async () => {
            try {
                const res = await axios.get(`http://localhost:8000/api/v1/chat/history/${currentRide._id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    withCredentials: true
                });
                if (res.data?.data) setChatMessages(res.data.data);
            } catch (err) {
                console.log("Chat history error:", err);
            }
        })();
    }, [currentRide?._id, token]);

    // Main socket listeners
    useEffect(() => {
        const listeners = {
            "ride:accepted_by_driver": (d) => {
                console.log("✅ Ride accepted:", d);
                setRideStatus("ACCEPTED");
                setCurrentRide(prev => ({ ...prev, ...d }));
                if (d?.driverLocation) {
                    const dl = getCoords(d.driverLocation);
                    if (dl) setDriverLiveLocation({ lat: dl[1], lng: dl[0] });
                }
            },
            "location:partner_updated": (c) => {
                if (c?.latitude !== undefined) {
                    setDriverLiveLocation({ lat: c.latitude, lng: c.longitude });
                    if (c.etaMinutes) setEta(c.etaMinutes);
                    if (c.distanceToPickup) setDistance(c.distanceToPickup);
                }
            },
            "driver:location_update": (c) => {
                if (c?.latitude !== undefined) {
                    setDriverLiveLocation({ lat: c.latitude, lng: c.longitude });
                }
            },
            "ride:driver_arrived": () => {
                setRideStatus("ARRIVED");
                setEta(0);
                setDistance(0);
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("🚗 Driver Arrived!", {
                        body: "Your driver has arrived at the pickup location.",
                        icon: "/logo192.png"
                    });
                }
            },
            "ride:started": () => setRideStatus("ONGOING"),
            "ride:finished": () => {
                setRideStatus("COMPLETED");
                setCurrentRide(null);
                setDriverLiveLocation(null);
                setChatMessages([]);
            },
            "ride:cancelled_by_driver": (d) => {
                alert(`Driver cancelled: ${d?.reason || "No reason"}`);
                setRideStatus("CANCELLED");
                setCurrentRide(null);
            },
            "ride:cancelled_by_other_party": () => {
                setRideStatus("CANCELLED");
                setCurrentRide(null);
                setChatMessages([]);
            },
            "ride:status_updated": (d) => {
                if (d?.status) setRideStatus(d.status);
            },
            "chat:receive_message": (m) => {
                setChatMessages(prev => prev.some(x => x._id === m._id) ? prev : [...prev, m]);
            },
        };

        Object.entries(listeners).forEach(([ev, fn]) => socket.on(ev, fn));
        return () => Object.entries(listeners).forEach(([ev, fn]) => socket.off(ev, fn));
    }, []);

    // Send passenger location to driver
    useEffect(() => {
        if (!navigator.geolocation || !currentRide?._id) return;
        
        const sendLocation = (pos) => {
            const coords = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                rideId: currentRide._id
            };
            setMyCoords([pos.coords.longitude, pos.coords.latitude]);
            socket.emit("passenger:location_update", coords);
        };

        navigator.geolocation.getCurrentPosition(sendLocation, () => {}, { enableHighAccuracy: true });
        const iv = setInterval(() => {
            navigator.geolocation.getCurrentPosition(sendLocation, () => {}, { enableHighAccuracy: true });
        }, 8000);
        
        return () => clearInterval(iv);
    }, [currentRide?._id]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    // Map initialization
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;
        
        const center = myCoords || pickupCoords || [74.3587, 31.5204];
        
        mapRef.current = new maplibregl.Map({
            container: mapContainerRef.current,
            style: `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${GEOAPIFY_API_KEY}`,
            center: center,
            zoom: 14,
            attributionControl: false
        });

        mapRef.current.on('load', () => {
            mapRef.current.resize();
            setMapReady(true);
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                passengerMarkerRef.current = null;
                driverMarkerRef.current = null;
                setMapReady(false);
            }
        };
    }, [myCoords, pickupCoords]);

    // Update markers and route
    useEffect(() => {
        if (!mapRef.current || !mapReady) return;

        // Passenger/Pickup marker (GREEN)
        const pLoc = myCoords || pickupCoords;
        if (pLoc && pLoc[0] && pLoc[1]) {
            if (passengerMarkerRef.current) passengerMarkerRef.current.remove();
            const el = document.createElement('div');
            el.style.cssText = 'width:20px;height:20px;background:#00ff66;border-radius:50%;border:3px solid white;box-shadow:0 0 15px #00ff66;';
            passengerMarkerRef.current = new maplibregl.Marker({ element: el })
                .setLngLat(pLoc)
                .setPopup(new maplibregl.Popup().setText('📍 You / Pickup'))
                .addTo(mapRef.current);
        }

        // Driver marker (CAR)
        if (driverLiveLocation?.lat && driverLiveLocation?.lng) {
            if (driverMarkerRef.current) driverMarkerRef.current.remove();
            const dl = [driverLiveLocation.lng, driverLiveLocation.lat];
            const el = document.createElement('div');
            el.innerHTML = '🚗';
            el.style.cssText = 'font-size:36px;filter:drop-shadow(0 0 5px #c4ff00);';
            driverMarkerRef.current = new maplibregl.Marker({ element: el })
                .setLngLat(dl)
                .setPopup(new maplibregl.Popup().setText('🚗 Driver'))
                .addTo(mapRef.current);

            // Draw route driver -> pickup
            if (pickupCoords) drawRoute(dl, pickupCoords);
        }
    }, [myCoords, pickupCoords, driverLiveLocation, mapReady, drawRoute]);

    const handleCancelRide = () => {
        if (currentRide?._id && window.confirm("Cancel this ride?")) {
            socket.emit("ride:cancel_by_passenger", { rideId: currentRide._id });
        }
    };

    const handleSendMessage = () => {
        if (chatInput.trim() && currentRide?._id) {
            socket.emit("chat:send_message", { rideId: currentRide._id, message: chatInput.trim() });
            setChatInput("");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-[#c4ff00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-xs uppercase text-gray-400">Loading...</p>
                </div>
            </div>
        );
    }

    const isActive = currentRide && ["PENDING","ACCEPTED","ARRIVED","ONGOING"].includes(rideStatus);

    return (
        <div className="min-h-screen bg-[#020617] text-white p-4 pt-24">
            {isActive ? (
                <div className="max-w-6xl mx-auto space-y-4">
                    {/* Header Card */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                        <div>
                            <p className="text-[10px] uppercase text-gray-400">Destination</p>
                            <p className="text-sm font-bold truncate">
                                {getAddress(currentRide?.dropoffLocation)}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5 rounded-full">
                            <span className={`w-2 h-2 rounded-full animate-ping ${
                                rideStatus === "ONGOING" ? "bg-green-500" : 
                                rideStatus === "ARRIVED" ? "bg-blue-500" : "bg-yellow-500"
                            }`} />
                            <span className="text-[10px] uppercase text-gray-300">{rideStatus}</span>
                        </div>
                    </div>

                    {/* Driver Info Card */}
                    {["ACCEPTED","ARRIVED","ONGOING"].includes(rideStatus) && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#c4ff00]/10 rounded-full flex items-center justify-center">
                                    <User size={20} className="text-[#c4ff00]" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">
                                        {currentRide?.partner?.name || currentRide?.driverName || "Driver"}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        {currentRide?.vehicleType || "Vehicle"}
                                        {currentRide?.partner?.phone || currentRide?.driverPhone ? ` | ${currentRide.partner?.phone || currentRide.driverPhone}` : ""}
                                        {eta !== null && ` • ⏱️ ${eta} min`}
                                        {distance !== null && ` • ${distance} km`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {(currentRide?.partner?.phone || currentRide?.driverPhone) && (
                                    <a href={`tel:${currentRide.partner?.phone || currentRide.driverPhone}`} 
                                       className="p-2 bg-green-500/10 rounded-xl text-green-400">
                                        <Phone size={18} />
                                    </a>
                                )}
                                <button onClick={() => setShowChat(!showChat)} 
                                        className="p-2 bg-[#c4ff00]/10 rounded-xl text-[#c4ff00] relative">
                                    <ChatTeardropText size={18} />
                                    {chatMessages.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] flex items-center justify-center">
                                            {chatMessages.length}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Map */}
                    <div className="h-112.5 w-full rounded-3xl overflow-hidden border border-white/10 relative">
                        <div ref={mapContainerRef} className="w-full h-full bg-slate-900" />
                    </div>

                    {/* Chat */}
                    {showChat && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                            <div className="flex justify-between">
                                <h4 className="text-xs uppercase text-gray-400">Chat</h4>
                                <button onClick={() => setShowChat(false)} className="text-gray-500">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {chatMessages.map((msg, i) => (
                                    <div key={msg._id || i} 
                                         className={`text-xs p-2 rounded-lg ${
                                             msg.senderId?._id === user?._id || msg.senderRole === "passenger" 
                                             ? "bg-[#c4ff00]/10 text-[#c4ff00] ml-8" 
                                             : "bg-white/5 mr-8"
                                         }`}>
                                        <p className="font-bold text-[10px]">{msg.senderId?.name || "User"}</p>
                                        <p>{msg.message}</p>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="flex gap-2">
                                <input value={chatInput} 
                                       onChange={e => setChatInput(e.target.value)} 
                                       onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
                                       placeholder="Type..." 
                                       className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
                                <button onClick={handleSendMessage} 
                                        className="bg-[#c4ff00] text-black px-3 py-2 rounded-xl">
                                    <PaperPlaneRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Cancel Button */}
                    {rideStatus !== "ONGOING" && (
                        <button onClick={handleCancelRide} 
                                className="w-full bg-red-500/10 border border-red-500/20 text-red-400 py-3 rounded-2xl font-bold text-xs uppercase hover:bg-red-500 hover:text-white transition-all">
                            <X size={14} className="inline mr-2" /> Cancel Ride
                        </button>
                    )}
                </div>
            ) : (
                <div className="max-w-md mx-auto my-auto text-center space-y-6 p-8 bg-white/5 border border-white/10 rounded-[2.5rem]">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto">
                        <MapPin size={32} className="text-gray-400" />
                    </div>
                    <h2 className="text-xl font-black uppercase">No Active Trips</h2>
                    <p className="text-xs text-gray-400">
                        {rideStatus === "COMPLETED" ? "Ride completed successfully." : 
                         rideStatus === "CANCELLED" ? "Ride was cancelled." : 
                         "Book a ride to get started."}
                    </p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;