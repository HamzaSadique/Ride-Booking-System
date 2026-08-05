import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import socket, { connectSocketWithToken } from '../utils/socket';
import axios from 'axios';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CheckCircle, Broadcast, Power, Handshake, X, ChatTeardropText, PaperPlaneRight, NavigationArrow, CircleNotch } from "@phosphor-icons/react";

const RideRequests = () => {
    const GEOAPIFY_API_KEY = "fe5d7b01bcbb455198274bd1b2bf1408";
    const { user, token } = useSelector((state) => state.auth);
    const [rideStatus, setRideStatus] = useState("IDLE");
    const [newRequests, setNewRequests] = useState([]);
    const [currentRide, setCurrentRide] = useState(null);
    const [kycApproved, setKycApproved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(false);
    const [driverCoords, setDriverCoords] = useState(null);
    const [passengerLocation, setPassengerLocation] = useState(null);
    const [pickupLocation, setPickupLocation] = useState(null);
    const [eta, setEta] = useState(null);
    const [distanceToPickup, setDistanceToPickup] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [showChat, setShowChat] = useState(false);
    const [mapReady, setMapReady] = useState(false);
    const hasGoneOnline = useRef(false);
    const chatEndRef = useRef(null);
    const arrivedCalled = useRef(false);
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const passengerMarkerRef = useRef(null);

    const drawRoute = async (start, end) => {
        if (!mapRef.current || !start || !end) return;
        try {
            const url = `https://api.geoapify.com/v1/routing?waypoints=${start[1]},${start[0]}|${end[1]},${end[0]}&mode=drive&apiKey=${GEOAPIFY_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.features?.length > 0) {
                const route = data.features[0];
                if (mapRef.current.getLayer('route')) mapRef.current.removeLayer('route');
                if (mapRef.current.getSource('route')) mapRef.current.removeSource('route');
                mapRef.current.addSource('route', { type: 'geojson', data: route });
                mapRef.current.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#c4ff00', 'line-width': 4, 'line-opacity': 0.7 } });
                const coords = route.geometry.coordinates;
                const bounds = new maplibregl.LngLatBounds();
                coords.forEach(c => bounds.extend(c));
                mapRef.current.fitBounds(bounds, { padding: 80, duration: 1000 });
            }
        } catch (err) { console.log("Route error:", err.message); }
    };

    useEffect(() => { if (!token) return; (async () => { try { const res = await axios.get('http://localhost:8000/api/v1/ride/my-active', { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }); if (res.data?.data) { setCurrentRide(res.data.data); setRideStatus(res.data.data.status); } } catch (e) { console.error("Error fetching active ride:", e); } })(); }, [token]);
    useEffect(() => { (async () => { try { await axios.get('http://localhost:8000/api/v1/partner/kyc-status', { withCredentials: true }); setKycApproved(true); } catch { setKycApproved(true); } finally { setLoading(false); } })(); }, []);
    useEffect(() => { if (kycApproved && navigator.geolocation && !driverCoords) { navigator.geolocation.getCurrentPosition(p => { console.log("📍 Driver GPS:", p.coords.latitude, p.coords.longitude); setDriverCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); }, () => { }, { enableHighAccuracy: true }); } }, [kycApproved, driverCoords]);
    useEffect(() => { if (!kycApproved || !token) return; if (!socket.connected) connectSocketWithToken(token); const h = () => { if (user?._id) socket.emit("join", user._id); socket.emit("ride:get_active"); }; socket.on("connect", h); if (socket.connected) h(); return () => socket.off("connect", h); }, [kycApproved, token, user?._id]);

    useEffect(() => {
        if (!isOnline || !driverCoords) return;
        if (hasGoneOnline.current) return;
        socket.emit("partner:online", { driverId: user?._id, latitude: driverCoords.lat, longitude: driverCoords.lng });
        hasGoneOnline.current = true;
        const iv = setInterval(() => {
            navigator.geolocation.getCurrentPosition(p => {
                const c = { lat: p.coords.latitude, lng: p.coords.longitude };
                setDriverCoords(c);
                socket.emit("partner:location_sync", { driverId: user?._id, latitude: c.lat, longitude: c.lng });
                if (rideStatus !== "IDLE" && currentRide?._id) socket.emit("location:update", { latitude: c.lat, longitude: c.lng, rideId: currentRide._id || currentRide.rideId });
            }, () => { }, { enableHighAccuracy: true });
        }, 5000);
        return () => { clearInterval(iv); hasGoneOnline.current = false; };
    }, [isOnline, driverCoords, user?._id, rideStatus, currentRide]);

    useEffect(() => {
        const listeners = {
            "ride:new_request": (p) => setNewRequests(prev => prev.some(r => r.rideId === p.rideId) ? prev : [...prev, p]),
            "location:partner_updated": (c) => {
                if (c?.etaMinutes !== undefined && c?.etaMinutes !== null) setEta(c.etaMinutes);
                if (c?.distanceToPickup !== undefined && c?.distanceToPickup !== null) setDistanceToPickup(c.distanceToPickup);
            },
            "ride:accept_confirmed": (d) => {
                setRideStatus("ACCEPTED");
                setCurrentRide(d);
                setNewRequests([]);
                if (d?.pickup?.coordinates) {
                    setPickupLocation({
                        lat: d.pickup.coordinates[1],
                        lng: d.pickup.coordinates[0]
                    });
                } else if (d?.pickup?.lat) {
                    setPickupLocation({ lat: d.pickup.lat, lng: d.pickup.lng });
                } else if (d?.pickupLocation?.coordinates) {
                    setPickupLocation({
                        lat: d.pickupLocation.coordinates[1],
                        lng: d.pickupLocation.coordinates[0]
                    });
                }
                if (d?.rideId) {
                    socket.emit("ride:join_room", d.rideId);
                    socket.emit("chat:join_room", d.rideId);
                    socket.emit("join:ride", d.rideId);
                }
            },
            "ride:started": () => setRideStatus("ONGOING"),
            "ride:finished": () => { setRideStatus("IDLE"); setCurrentRide(null); setNewRequests([]); setChatMessages([]); setPassengerLocation(null); setPickupLocation(null); setEta(null); setDistanceToPickup(null); arrivedCalled.current = false; },
            "ride:cancelled_by_other_party": (d) => { const rid = d?.rideId || d?.frontendRideId; setNewRequests(prev => prev.filter(r => r.rideId !== rid && r.frontendRideId !== rid)); if (d?.cancelledBy !== "partner") { setRideStatus("IDLE"); setCurrentRide(null); } setPickupLocation(null); setEta(null); setDistanceToPickup(null); arrivedCalled.current = false; },
            "ride:cancel_confirmed": () => { setRideStatus("IDLE"); setCurrentRide(null); setChatMessages([]); setPickupLocation(null); setEta(null); setDistanceToPickup(null); arrivedCalled.current = false; },
            "ride:status_updated": (d) => { if (d?.status !== "PENDING") { const rid = d?.rideId || d?.frontendRideId; setNewRequests(prev => prev.filter(r => r.rideId !== rid && r.frontendRideId !== rid)); } },
            "ride:active_found": (d) => { if (d?.ride) { setCurrentRide(d.ride); setRideStatus(d.ride.status); if (d.ride.pickupLocation?.coordinates) { setPickupLocation({ lat: d.ride.pickupLocation.coordinates[1], lng: d.ride.pickupLocation.coordinates[0] }); } } },
            "location:passenger_updated": (c) => { if (c?.latitude) { console.log("📍 Passenger live location:", c.latitude, c.longitude); setPassengerLocation({ lat: c.latitude, lng: c.longitude }); } },
            "chat:receive_message": (m) => setChatMessages(p => p.some(x => x._id === m._id) ? p : [...p, m]),
            "chat:history_loaded": (d) => { if (d.messages) setChatMessages(d.messages); },
        };
        Object.entries(listeners).forEach(([ev, fn]) => socket.on(ev, fn));
        return () => Object.entries(listeners).forEach(([ev, fn]) => socket.off(ev, fn));
    }, [user?._id]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

    // MAP INIT
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;
        const center = driverCoords ? [driverCoords.lng, driverCoords.lat] : [74.3587, 31.5204];
        console.log("🗺️ CREATING MAP at:", center);
        mapRef.current = new maplibregl.Map({ container: mapContainerRef.current, style: `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${GEOAPIFY_API_KEY}`, center: center, zoom: 14, attributionControl: false });
        mapRef.current.on('load', () => { console.log("✅ Map loaded"); mapRef.current.resize(); setMapReady(true); });
        return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; driverMarkerRef.current = null; passengerMarkerRef.current = null; setMapReady(false); } };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapContainerRef.current]);

    // MARKERS & ROUTE
    useEffect(() => {
        if (!mapRef.current || !mapReady) return;

        console.log("📍 Updating markers - Driver:", driverCoords, "Pickup:", pickupLocation, "PassengerLive:", passengerLocation);

        // Driver marker (CAR)
        if (driverCoords?.lat && driverCoords?.lng) {
            if (driverMarkerRef.current) driverMarkerRef.current.remove();
            const dl = [driverCoords.lng, driverCoords.lat];
            const el = document.createElement('div');
            el.innerHTML = '🚗';
            el.style.fontSize = '36px';
            el.style.filter = 'drop-shadow(0 0 5px #c4ff00)';
            driverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat(dl)
                .setPopup(new maplibregl.Popup({ offset: 25 }).setText('🚗 You (Driver)'))
                .addTo(mapRef.current);
        }

        // Passenger/Pickup marker (GREEN DOT)
        const targetLoc = passengerLocation || pickupLocation;
        if (targetLoc?.lat && targetLoc?.lng) {
            if (passengerMarkerRef.current) passengerMarkerRef.current.remove();
            const pl = [targetLoc.lng, targetLoc.lat];
            const el = document.createElement('div');
            el.style.backgroundColor = '#00ff66';
            el.style.width = '20px';
            el.style.height = '20px';
            el.style.borderRadius = '50%';
            el.style.border = '3px solid white';
            el.style.boxShadow = '0 0 15px #00ff66';
            passengerMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat(pl)
                .setPopup(new maplibregl.Popup({ offset: 25 }).setText(passengerLocation ? '📍 Passenger (Live)' : '📍 Pickup Location'))
                .addTo(mapRef.current);

            // Draw route from driver to pickup
            if (driverCoords) drawRoute([driverCoords.lng, driverCoords.lat], pl);
        }
    }, [driverCoords, passengerLocation, pickupLocation, mapReady]);

    const toggleDuty = useCallback(() => setIsOnline(p => { if (p) { socket.emit("partner:offline", { driverId: user?._id }); hasGoneOnline.current = false; } return !p; }), [user?._id]);
    const handleDirectAccept = (rideId) => socket.emit("ride:accept_intent", { rideId, driverId: user?._id });
    const handleCounterOffer = (rideId) => { const f = prompt("Enter fare:"); if (f) socket.emit("ride:driver_counter_offer", { rideId, driverId: user?._id, offeredFare: Number(f) }); };
    const handleArrived = useCallback(() => { if (arrivedCalled.current) return; arrivedCalled.current = true; socket.emit("driver:arrived", { rideId: currentRide?._id || currentRide?.rideId }); setTimeout(() => { arrivedCalled.current = false; }, 5000); }, [currentRide]);
    const handleStartTrip = () => socket.emit("ride:start_trip", { rideId: currentRide?._id || currentRide?.rideId });
    const handleCancelRide = () => { if (window.confirm("Cancel?")) socket.emit("ride:cancel_by_driver", { rideId: currentRide?._id || currentRide?.rideId, reason: "Driver cancelled" }); };
    const handleEndTrip = () => socket.emit("ride:complete", { rideId: currentRide?._id || currentRide?.rideId });
    const handleSendMessage = () => { if (chatInput.trim()) { socket.emit("chat:send_message", { rideId: currentRide?._id || currentRide?.rideId, message: chatInput.trim() }); setChatInput(""); } };

    if (loading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center"><CircleNotch size={32} className="animate-spin text-[#c4ff00]" /></div>;

    return (
        <div className="min-h-screen bg-[#020617] text-white p-4 pt-24">
            <div className="max-w-3xl mx-auto space-y-4">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold">Driver Console</h2>
                        <p className="text-xs text-gray-400">{user?.name}</p>
                    </div>
                    <button onClick={toggleDuty} disabled={rideStatus !== "IDLE"} className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${isOnline ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        <Power size={16} />{isOnline ? "Online" : "Offline"}
                    </button>
                </div>

                {(rideStatus === "ACCEPTED" || rideStatus === "ARRIVED" || rideStatus === "ONGOING") && (
                    <div className="h-96 w-full rounded-3xl overflow-hidden border border-white/10 relative">
                        <div ref={mapContainerRef} className="w-full h-full bg-slate-900" />
                    </div>
                )}

                {!isOnline && rideStatus === "IDLE" && <div className="text-center py-12 text-gray-500"><Broadcast size={32} className="mx-auto mb-2" /><p>You are offline</p></div>}

                {isOnline && rideStatus === "IDLE" && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-400">Ride Requests</h3>
                        {newRequests.length === 0 ? <div className="text-center py-8 text-gray-500"><Broadcast size={24} className="mx-auto mb-2 animate-pulse" /><p>Waiting for requests...</p></div> :
                            newRequests.map(req => (
                                <div key={req.rideId} className="bg-white/5 border border-white/10 p-4 rounded-xl">
                                    <div className="flex justify-between mb-2">
                                        <p className="font-bold">{req.passengerName}</p>
                                        <span className="text-xl font-bold text-[#c4ff00]">Rs. {req.fare}</span>
                                    </div>
                                    <p className="text-xs text-green-400 mb-1">{req.pickupLocation?.address}</p>
                                    <p className="text-xs text-red-400 mb-3">{req.dropoffLocation?.address}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => handleDirectAccept(req.rideId)} className="bg-[#c4ff00] text-black py-2 rounded-lg font-bold text-xs">
                                            <CheckCircle size={14} className="inline mr-1" /> Accept
                                        </button>
                                        <button onClick={() => handleCounterOffer(req.rideId)} className="bg-white/10 border border-white/20 py-2 rounded-lg font-bold text-xs">
                                            <Handshake size={14} className="inline mr-1" /> Counter
                                        </button>
                                    </div>
                                </div>
                            ))}
                    </div>
                )}

                {rideStatus === "ACCEPTED" && (
                    <div className="bg-[#c4ff00] p-4 rounded-2xl text-black space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold">Go to Pickup</h3>
                                <p className="text-xs">{currentRide?.pickup?.address || currentRide?.pickupLocation?.address}</p>
                                {eta !== null && (
                                    <p className="text-xs font-bold text-black/70 mt-1">
                                        ⏱️ ETA: {eta} min{eta !== 1 ? 's' : ''}
                                        {distanceToPickup !== null && ` • ${distanceToPickup} km`}
                                    </p>
                                )}
                            </div>
                            <button onClick={() => setShowChat(!showChat)} className="bg-black/10 p-2 rounded-xl relative">
                                <ChatTeardropText size={20} />
                                {chatMessages.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] flex items-center justify-center text-white">{chatMessages.length}</span>}
                            </button>
                        </div>
                        <button onClick={handleArrived} className="w-full bg-black text-[#c4ff00] py-3 rounded-xl font-bold text-sm">
                            <NavigationArrow size={18} className="inline mr-2" />I've Arrived
                        </button>
                        <button onClick={handleCancelRide} className="w-full bg-red-500 text-white py-2 rounded-xl font-bold text-xs">
                            <X size={14} className="inline mr-1" />Cancel
                        </button>
                    </div>
                )}

                {rideStatus === "ARRIVED" && (
                    <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl text-center space-y-3">
                        <p className="text-blue-400 font-bold">You have arrived!</p>
                        <button onClick={handleStartTrip} className="w-full bg-[#c4ff00] text-black py-3 rounded-xl font-bold">Start Trip</button>
                        <button onClick={handleCancelRide} className="w-full bg-red-500/20 text-red-400 py-2 rounded-xl font-bold text-xs">
                            <X size={14} className="inline mr-1" />Cancel
                        </button>
                    </div>
                )}

                {rideStatus === "ONGOING" && (
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center space-y-3">
                        <p className="text-[#c4ff00] font-bold">Trip in Progress</p>
                        <button onClick={handleEndTrip} className="w-full bg-red-500 text-white py-3 rounded-xl font-bold">Complete Trip</button>
                    </div>
                )}

                {showChat && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                        <div className="flex justify-between">
                            <h4 className="text-xs uppercase text-gray-400">Chat</h4>
                            <button onClick={() => setShowChat(false)} className="text-gray-500"><X size={16} /></button>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {chatMessages.map((msg, i) => (
                                <div key={msg._id || i} className={`text-xs p-2 rounded-lg ${msg.senderId?._id === user?._id || msg.senderRole === "partner" ? "bg-[#c4ff00]/10 text-[#c4ff00] ml-8" : "bg-white/5 mr-8"}`}>
                                    <p className="font-bold text-[10px]">{msg.senderId?.name || "User"}</p>
                                    <p>{msg.message}</p>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        <div className="flex gap-2">
                            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Type..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none" />
                            <button onClick={handleSendMessage} className="bg-[#c4ff00] text-black px-3 py-2 rounded-lg">
                                <PaperPlaneRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RideRequests;