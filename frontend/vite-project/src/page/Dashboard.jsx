import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import socket, { connectSocketWithToken } from '../utils/socket';
import axios from 'axios';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { NavigationArrow, Compass, Clock, User, ChatTeardropText, PaperPlaneRight, X, Phone } from "@phosphor-icons/react";

const Dashboard = () => {
    const GEOAPIFY_API_KEY = "fe5d7b01bcbb455198274bd1b2bf1408";
    const { user, token } = useSelector((state) => state.auth);
    const [rideStatus, setRideStatus] = useState("IDLE");
    const [myCoords, setMyCoords] = useState(null);
    const [driverLiveLocation, setDriverLiveLocation] = useState(null);
    const [currentRide, setCurrentRide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [showChat, setShowChat] = useState(false);
    const chatEndRef = useRef(null);
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const passengerMarkerRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const initialized = useRef(false);

    const getToken = useCallback(() => token || localStorage.getItem('token'), [token]);

    const normalizeRideData = useCallback((rd) => {
        if (!rd) return null;
        return {
            _id: rd._id || rd.rideId, rideId: rd.rideId || rd.frontendRideId,
            fare: rd.fare, status: rd.status, vehicleType: rd.vehicleType || rd.vehicle?.type || "bike",
            pickupLocation: rd.pickupLocation || rd.pickup || {}, dropoffLocation: rd.dropoffLocation || rd.dropoff || {},
            driverName: rd.driverName || rd.partner?.name || "Driver",
            driverPhone: rd.driverPhone || rd.partner?.phone || "",
            driverId: rd.driverId || rd.partner?._id,
            driverLocation: rd.driverLocation || rd.partner?.currentLocation,
        };
    }, []);

    // Initialize
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        const authToken = getToken();
        if (!authToken) { setLoading(false); return; }
        (async () => {
            try {
                setLoading(true);
                if (!socket.connected) connectSocketWithToken(authToken);
                const res = await axios.get('http://localhost:8000/api/v1/ride/my-active', { headers: { Authorization: `Bearer ${authToken}` }, withCredentials: true });
                const ride = res.data?.data;
                if (ride && ["PENDING","ACCEPTED","ARRIVED","ONGOING"].includes(ride.status)) {
                    setCurrentRide(normalizeRideData(ride));
                    setRideStatus(ride.status);
                } else { setCurrentRide(null); setRideStatus("IDLE"); }
            } catch { setCurrentRide(null); setRideStatus("IDLE"); }
            finally { setLoading(false); }
        })();
        return () => { setCurrentRide(null); setRideStatus("IDLE"); initialized.current = false; };
    }, [getToken, normalizeRideData]);

    // Socket connect
    useEffect(() => {
        const h = () => { if (user?._id) socket.emit("join", user._id); socket.emit("ride:get_active"); };
        if (socket.connected) h();
        socket.on("connect", h);
        return () => socket.off("connect", h);
    }, [user?._id]);

    // Join rooms
    useEffect(() => {
        if (!currentRide?._id || !socket.connected) return;
        socket.emit("ride:join_room", currentRide._id);
        socket.emit("chat:join_room", currentRide._id);
        socket.emit("join:ride", currentRide._id);
    }, [currentRide?._id]);

    // Chat history
    useEffect(() => {
        if (!currentRide?._id || !token) return;
        (async () => {
            try {
                const res = await axios.get(`http://localhost:8000/api/v1/chat/history/${currentRide._id}`, { headers: { Authorization: `Bearer ${token}` }, withCredentials: true });
                if (res.data?.data) setChatMessages(res.data.data);
            } catch { /* empty */ }
        })();
    }, [currentRide?._id, token]);

    // Socket listeners
    useEffect(() => {
        const listeners = {
            "location:partner_updated": (c) => { if (c?.latitude) setDriverLiveLocation({ lat: c.latitude, lng: c.longitude }); },
            "ride:accepted_by_driver": (d) => { setCurrentRide(normalizeRideData(d)); setRideStatus("ACCEPTED"); },
            "ride:driver_arrived": () => setRideStatus("ARRIVED"),
            "ride:started": () => setRideStatus("ONGOING"),
            "ride:finished": () => { setRideStatus("COMPLETED"); setCurrentRide(null); setDriverLiveLocation(null); setChatMessages([]); },
            "ride:cancelled_by_driver": (d) => { alert(`Driver cancelled: ${d?.reason||"No reason"}`); setRideStatus("CANCELLED"); setCurrentRide(null); setChatMessages([]); },
            "ride:cancelled_by_other_party": () => { setRideStatus("CANCELLED"); setCurrentRide(null); setChatMessages([]); },
            "ride:active_found": (d) => {
                if (d?.ride && ["PENDING","ACCEPTED","ARRIVED","ONGOING"].includes(d.ride.status)) {
                    setCurrentRide(normalizeRideData(d.ride)); setRideStatus(d.ride.status);
                } else { setCurrentRide(null); setRideStatus("IDLE"); }
            },
            "ride:no_active": () => { setCurrentRide(null); setRideStatus("IDLE"); },
            "chat:receive_message": (m) => setChatMessages(p => p.some(x => x._id === m._id) ? p : [...p, m]),
            "chat:history_loaded": (d) => { if (d.messages) setChatMessages(d.messages); },
        };
        Object.entries(listeners).forEach(([ev, fn]) => socket.on(ev, fn));
        return () => Object.entries(listeners).forEach(([ev, fn]) => socket.off(ev, fn));
    }, [user?._id, normalizeRideData]);

    // GPS - Get location + send to ride room
    useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = [pos.coords.longitude, pos.coords.latitude];
                setMyCoords(coords);
                // Send passenger location to ride room
                if (currentRide?._id) {
                    socket.emit("passenger:location_update", {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        rideId: currentRide._id
                    });
                }
            },
            () => {},
            { enableHighAccuracy: true }
        );
        
        // Update location every 5 seconds during ride
        const iv = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setMyCoords([pos.coords.longitude, pos.coords.latitude]);
                    if (currentRide?._id) {
                        socket.emit("passenger:location_update", {
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude,
                            rideId: currentRide._id
                        });
                    }
                },
                () => {},
                { enableHighAccuracy: true }
            );
        }, 5000);
        
        return () => clearInterval(iv);
    }, [currentRide?._id]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

    // MAP INIT
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;
        const center = myCoords || [74.3587, 31.5204];
        console.log("🗺️ INIT MAP at:", center);
        mapRef.current = new maplibregl.Map({
            container: mapContainerRef.current,
            style: `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${GEOAPIFY_API_KEY}`,
            center: center, zoom: 14, attributionControl: false
        });
        mapRef.current.on('load', () => mapRef.current.resize());
        return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    }, [myCoords, GEOAPIFY_API_KEY]);

    // MARKERS
    useEffect(() => {
        if (!mapRef.current) return;
        
        // Passenger marker (green)
        if (myCoords && myCoords[0] && myCoords[1]) {
            if (!passengerMarkerRef.current) {
                const el = document.createElement('div');
                el.style.backgroundColor = '#00ff66';
                el.style.width = '16px'; el.style.height = '16px';
                el.style.borderRadius = '50%'; el.style.border = '3px solid white';
                passengerMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
                    .setLngLat(myCoords).setPopup(new maplibregl.Popup().setText('You')).addTo(mapRef.current);
            } else {
                passengerMarkerRef.current.setLngLat(myCoords);
            }
        }
        
        // Driver marker (car icon)
        if (driverLiveLocation?.lat && driverLiveLocation?.lng) {
            const dl = [driverLiveLocation.lng, driverLiveLocation.lat];
            if (!driverMarkerRef.current) {
                const el = document.createElement('div');
                el.style.backgroundImage = "url('https://cdn-icons-png.flaticon.com/512/744/744465.png')";
                el.style.width = '40px'; el.style.height = '40px'; el.style.backgroundSize = 'cover';
                driverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
                    .setLngLat(dl).setPopup(new maplibregl.Popup().setText('Driver')).addTo(mapRef.current);
            } else {
                driverMarkerRef.current.setLngLat(dl);
            }
            mapRef.current.flyTo({ center: dl, zoom: 15, speed: 0.8 });
        }
    }, [myCoords, driverLiveLocation]);

    const handleCancelRide = () => { if (currentRide?._id && window.confirm("Cancel this ride?")) socket.emit("ride:cancel_by_passenger", { rideId: currentRide._id }); };
    const handleSendMessage = () => { if (chatInput.trim() && currentRide?._id) { socket.emit("chat:send_message", { rideId: currentRide._id, message: chatInput.trim() }); setChatInput(""); } };

    if (loading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white"><div className="text-center"><div className="w-8 h-8 border-2 border-[#c4ff00] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div><p className="text-xs uppercase text-gray-400">Loading...</p></div></div>;

    const isActive = currentRide && ["PENDING","ACCEPTED","ARRIVED","ONGOING"].includes(rideStatus);

    return (
        <div className="min-h-screen bg-[#020617] text-white p-4 pt-24">
            {isActive ? (
                <div className="max-w-6xl mx-auto space-y-4">
                    {/* Status Header */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                        <div>
                            <p className="text-[10px] uppercase text-gray-400">Destination</p>
                            <p className="text-sm font-bold truncate">{currentRide?.dropoffLocation?.address || "Loading..."}</p>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5 rounded-full">
                            <span className={`w-2 h-2 rounded-full animate-ping ${rideStatus==="ONGOING"?"bg-green-500":rideStatus==="ARRIVED"?"bg-blue-500":"bg-yellow-500"}`} />
                            <span className="text-[10px] uppercase text-gray-300">{rideStatus}</span>
                        </div>
                    </div>

                    {/* Driver Info */}
                    {["ACCEPTED","ARRIVED","ONGOING"].includes(rideStatus) && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#c4ff00]/10 rounded-full flex items-center justify-center"><User size={20} className="text-[#c4ff00]" /></div>
                                <div>
                                    <p className="text-sm font-bold">{currentRide?.driverName || "Driver"}</p>
                                    <p className="text-xs text-gray-400">{currentRide?.vehicleType || "Vehicle"}{currentRide?.driverPhone && ` | ${currentRide.driverPhone}`}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {currentRide?.driverPhone && <a href={`tel:${currentRide.driverPhone}`} className="p-2 bg-green-500/10 rounded-xl text-green-400"><Phone size={18} /></a>}
                                <button onClick={() => setShowChat(!showChat)} className="p-2 bg-[#c4ff00]/10 rounded-xl text-[#c4ff00] relative">
                                    <ChatTeardropText size={18} />
                                    {chatMessages.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] flex items-center justify-center">{chatMessages.length}</span>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* MAP - Always visible */}
                    <div className="h-100 w-full rounded-4xl overflow-hidden border border-white/10 relative">
                        <div ref={mapContainerRef} className="w-full h-full bg-slate-900" />
                        {!myCoords && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                                <p className="text-sm text-gray-400">📍 Getting your location...</p>
                            </div>
                        )}
                        {/* Fare + Driver info overlay */}
                        <div className="absolute bottom-4 left-4 bg-black/85 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex gap-4 z-50">
                            <div><p className="text-[9px] text-gray-500">Fare</p><p className="text-base font-black text-[#c4ff00]">Rs. {currentRide?.fare || "---"}</p></div>
                            <div className="border-l border-white/10 pl-4"><p className="text-[9px] text-gray-500">Driver</p><p className="text-xs font-bold flex items-center gap-1"><User size={14} className="text-green-400" />{currentRide?.driverName || "Waiting..."}</p></div>
                        </div>
                    </div>

                    {/* Chat */}
                    {showChat && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                            <div className="flex justify-between"><h4 className="text-xs uppercase text-gray-400">Chat</h4><button onClick={() => setShowChat(false)} className="text-gray-500"><X size={16} /></button></div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {chatMessages.map((msg, i) => (
                                    <div key={msg._id || i} className={`text-xs p-2 rounded-lg ${msg.senderId?._id === user?._id || msg.senderRole==="passenger" ? "bg-[#c4ff00]/10 text-[#c4ff00] ml-8" : "bg-white/5 mr-8"}`}>
                                        <p className="font-bold text-[10px]">{msg.senderId?.name || "User"}</p><p>{msg.message}</p>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="flex gap-2">
                                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter' && handleSendMessage()} placeholder="Type..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
                                <button onClick={handleSendMessage} className="bg-[#c4ff00] text-black px-3 py-2 rounded-xl"><PaperPlaneRight size={16} /></button>
                            </div>
                        </div>
                    )}

                    {/* Cancel Button */}
                    {rideStatus !== "ONGOING" && (
                        <button onClick={handleCancelRide} className="w-full bg-red-500/10 border border-red-500/20 text-red-400 py-3 rounded-2xl font-bold text-xs uppercase hover:bg-red-500 hover:text-white">
                            <X size={14} className="inline mr-2" /> Cancel Ride
                        </button>
                    )}
                </div>
            ) : (
                <div className="max-w-md mx-auto my-auto text-center space-y-6 p-8 bg-white/5 border border-white/10 rounded-[2.5rem]">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto"><Clock size={32} className="text-gray-400" /></div>
                    <h2 className="text-xl font-black uppercase">No Active Trips</h2>
                    <p className="text-xs text-gray-400">{rideStatus==="COMPLETED"?"Completed.":rideStatus==="CANCELLED"?"Cancelled.":"Book a ride to get started."}</p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;