import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import socket, { connectSocketWithToken } from '../utils/socket';
import axios from 'axios'; 
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine'; 
import {
  MapPin, MapPinLine, Car,
  Clock, CircleNotch, Broadcast, GpsFix,
  Bicycle, Scooter, XCircle, Handshake, Check, X,
  ChatTeardropText, PaperPlaneRight
} from "@phosphor-icons/react";
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

const GEOAPIFY_API_KEY = "fe5d7b01bcbb455198274bd1b2bf1408";

const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/744/744465.png',
  iconSize: [35, 35],
  iconAnchor: [17, 17],
});

const RoutingMachine = ({ pickup, dropoff, onRouteCalculated }) => {
  const map = useMap();
  const routingControlRef = useRef(null);

  useEffect(() => {
    if (!map || !pickup || !dropoff) return;
    if (routingControlRef.current) map.removeControl(routingControlRef.current);

    try {
      routingControlRef.current = L.Routing.control({
        waypoints: [L.latLng(pickup[0], pickup[1]), L.latLng(dropoff[0], dropoff[1])],
        lineOptions: { styles: [{ color: '#c4ff00', weight: 5, opacity: 0.8 }] },
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false 
      }).addTo(map);

      routingControlRef.current.on('routesfound', (e) => {
        const routes = e.routes;
        if (routes && routes[0]) {
          const summary = routes[0].summary; 
          const realDistanceKm = (summary.totalDistance / 1000).toFixed(1); 
          const realDurationMin = Math.round(summary.totalTime / 60); 
          onRouteCalculated({ 
            distance: `${realDistanceKm} km`, 
            duration: `${realDurationMin} min`, 
            rawDistance: parseFloat(realDistanceKm) 
          });
        }
      });
    } catch (error) {
      console.error("Routing machine execution failed:", error);
    }

    return () => {
      if (routingControlRef.current && map) map.removeControl(routingControlRef.current);
    };
  }, [map, pickup, dropoff, onRouteCalculated]);

  return null;
};

const ChangeMapCenter = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, 14, { animate: true, duration: 1 });
    }
  }, [map, center]);
  return null;
};

// eslint-disable-next-line no-unused-vars
const MapClickHandler = ({ selectingMode, setPickupCoords, setDropoffCoords, setMapCenter, setPickup, setDropoff, fetchAddressName, fetchNearbyDrivers, setSelectingMode, setSuggestions, setSearchFocused }) => {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (selectingMode === 'pickup') {
        setPickupCoords([lat, lng]);
        setMapCenter([lat, lng]);
        fetchAddressName(lat, lng, 'pickup');
        fetchNearbyDrivers(lat, lng); 
        setSelectingMode('dropoff'); 
      } else {
        setDropoffCoords([lat, lng]);
        fetchAddressName(lat, lng, 'dropoff');
      }
      setSuggestions([]);
      setSearchFocused(null);
    },
  });
  return null;
};

const BookRide = () => {
  const navigate = useNavigate();
  const { user, token } = useSelector((state) => state.auth);

  // Layout Location States
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [mapCenter, setMapCenter] = useState([31.5204, 74.3587]);
  const [selectedVehicle, setSelectedVehicle] = useState('bike');
  const [selectingMode, setSelectingMode] = useState('pickup');
  
  const [suggestions, setSuggestions] = useState([]);
  const [searchFocused, setSearchFocused] = useState(null); 
  const [searchLoading, setSearchLoading] = useState(false);

  const [routeStats, setRouteStats] = useState({ distance: "0 km", duration: "0 min", rawDistance: 0 });
  const [addressLoading, setAddressLoading] = useState(false);
  const [driversLoading, setDriversLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);

  const [rideStatus, setRideStatus] = useState("IDLE");
  const [activeRideId, setActiveRideId] = useState(null);
  const [liveDriverCoords, setLiveDriverCoords] = useState(null);
  
  const [customOfferFare, setCustomOfferFare] = useState(0);
  const [incomingCounterOffer, setIncomingCounterOffer] = useState(null);

  // Chat States
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef(null);

  // Connect socket with token on mount
  useEffect(() => {
    console.log("🚀 BookRide mounted. Token:", token ? "YES" : "NO");
    
    if (token && !socket.connected) {
      console.log("🔌 Connecting passenger socket with token...");
      connectSocketWithToken(token);
    }

    const handleConnect = () => {
      console.log("✅ Passenger socket connected! Joining room:", user?._id);
      if (user?._id) socket.emit("join", user._id);
    };

    if (socket.connected) handleConnect();
    else socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, [token, user?._id]);

  // Socket listeners
  useEffect(() => {
    console.log("📡 Setting up socket listeners...");

    const handleRideSearching = (data) => {
      console.log("🔍 ride:searching received:", data);
      setRideStatus("SEARCHING");
    };

    const handleRideAccepted = (rideData) => {
      console.log("🚗 ride:accepted_by_driver received:", rideData);
      setRideStatus("ACCEPTED");
      setIncomingCounterOffer(null);
      // Join chat room
      if (rideData?.rideId) {
        socket.emit("chat:join_room", rideData.rideId);
      }
      setTimeout(() => {
        navigate("/dashboard", {
          state: { activeRide: rideData, pickupCoords, dropoffCoords, routeStats, initialStatus: "ACCEPTED" }
        });
      }, 1500);
    };

    const handleCounterOffer = (counterData) => {
      console.log("💰 ride:partner_counter_offer received:", counterData);
      setIncomingCounterOffer(counterData);
    };

    const handleDriverLocation = (coords) => {
      console.log("📍 location:partner_updated received:", coords);
      if (coords.latitude && coords.longitude) {
        setLiveDriverCoords([coords.latitude, coords.longitude]);
      }
    };

    const handleRideError = (data) => {
      console.error("❌ ride:error received:", data);
      alert(data.message || "Something went wrong");
      setRideStatus("IDLE");
    };

    // Chat listener
    const handleChatMessage = (msg) => {
      setChatMessages(prev => [...prev, msg]);
    };

    socket.on("ride:searching", handleRideSearching);
    socket.on("ride:accepted_by_driver", handleRideAccepted);
    socket.on("ride:partner_counter_offer", handleCounterOffer);
    socket.on("location:partner_updated", handleDriverLocation);
    socket.on("ride:error", handleRideError);
    socket.on("chat:receive_message", handleChatMessage);

    return () => {
      console.log("🧹 Cleaning up socket listeners");
      socket.off("ride:searching", handleRideSearching);
      socket.off("ride:accepted_by_driver", handleRideAccepted);
      socket.off("ride:partner_counter_offer", handleCounterOffer);
      socket.off("location:partner_updated", handleDriverLocation);
      socket.off("ride:error", handleRideError);
      socket.off("chat:receive_message", handleChatMessage);
    };
  }, [navigate, pickupCoords, dropoffCoords, routeStats]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const vehicleTypes = useMemo(() => [
    { id: 'bike', name: 'Bike', basePrice: 30, kmRate: 15, eta: '2 min', icon: <Bicycle size={24} />, color: 'bg-orange-500' },
    { id: 'car', name: 'Car (Eco)', basePrice: 80, kmRate: 35, eta: '4 min', icon: <Car size={24} />, color: 'bg-[#c4ff00]' },
    { id: 'rickshaw', name: 'Rickshaw', basePrice: 50, kmRate: 22, eta: '3 min', icon: <Scooter size={24} />, color: 'bg-green-500' },
  ], []);

  const standardFare = useMemo(() => {
    const currentVehicle = vehicleTypes.find(v => v.id === selectedVehicle);
    if (!currentVehicle) return 0;
    const distanceFactor = routeStats.rawDistance || 0;
    return Math.round(currentVehicle.basePrice + (distanceFactor * currentVehicle.kmRate));
  }, [routeStats.rawDistance, selectedVehicle, vehicleTypes]);

  const minNegotiationLimit = useMemo(() => Math.round(standardFare * 0.85), [standardFare]);

  useEffect(() => {
    setCustomOfferFare(standardFare);
  }, [standardFare]);

  const fetchNearbyDrivers = useCallback(async (lat, lng) => {
    setDriversLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/v1/partner/nearby?lat=${lat}&lng=${lng}`, { withCredentials: true });
      if (res.data.success) setNearbyDrivers(res.data.drivers);
    } catch (err) {
      console.error("Geofence lookup error:", err.message);
    } finally {
      setDriversLoading(false);
    }
  }, []);

  const handleQuerySearchChange = useCallback(async (queryText, modeType) => {
    if (modeType === 'pickup') setPickup(queryText);
    else setDropoff(queryText);

    if (!queryText.trim() || queryText.length < 3) {
      setSuggestions([]);
      setSearchFocused(null);
      return;
    }

    setSearchLoading(true);
    setSearchFocused(modeType);

    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(queryText)}&filter=countrycode:pk&limit=5&apiKey=${GEOAPIFY_API_KEY}`
      );
      if (!response.ok) throw new Error("Geoapify network response blocked.");
      const data = await response.json();
      
      if (data && data.features) {
        const mappedSuggestions = data.features.map(feature => ({
          display_name: feature.properties.formatted,
          lat: feature.properties.lat,
          lon: feature.properties.lon
        }));
        setSuggestions(mappedSuggestions);
      }
    } catch (err) {
      console.warn("Geoapify search failed:", err.message);
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSelectLocation = useCallback((item, modeType) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    if (modeType === 'pickup') {
      setPickupCoords([lat, lon]);
      setMapCenter([lat, lon]);
      setPickup(item.display_name.split(',').slice(0, 3).join(','));
      fetchNearbyDrivers(lat, lon);
      setSelectingMode('dropoff');
    } else {
      setDropoffCoords([lat, lon]);
      setDropoff(item.display_name.split(',').slice(0, 3).join(','));
    }
    setSuggestions([]);
    setSearchFocused(null);
  }, [fetchNearbyDrivers]);

  const fetchAddressName = useCallback(async (lat, lng, targetMode) => {
    setAddressLoading(true);
    const fallbackAddress = `Pinned Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${GEOAPIFY_API_KEY}`
      );
      if (!response.ok) throw new Error("Geoapify reverse response blocked.");
      const data = await response.json();
      
      if (data && data.features && data.features.length > 0) {
        const readableAddress = data.features[0].properties.formatted;
        if (targetMode === 'pickup') setPickup(readableAddress);
        else setDropoff(readableAddress);
      } else {
        if (targetMode === 'pickup') setPickup(fallbackAddress);
        else setDropoff(fallbackAddress);
      }
    // eslint-disable-next-line no-unused-vars
    } catch (error) {
      if (targetMode === 'pickup') setPickup(fallbackAddress);
      else setDropoff(fallbackAddress);
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const handleGpsTrigger = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Device location not supported.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const currentGpsCoords = [latitude, longitude];
        setPickupCoords(currentGpsCoords);
        setMapCenter(currentGpsCoords);
        fetchAddressName(latitude, longitude, 'pickup');
        fetchNearbyDrivers(latitude, longitude);
        setSelectingMode('dropoff');
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
        alert("GPS Signal Blocked.");
      },
      { enableHighAccuracy: true }
    );
  }, [fetchAddressName, fetchNearbyDrivers]);

  const handleRouteUpdate = useCallback((stats) => {
    setRouteStats(stats);
  }, []);

  const handleConfirmBooking = useCallback(() => {
    if (!pickupCoords || !dropoffCoords) {
      alert("Please select pickup and dropoff locations");
      return;
    }

    const generatedId = "ride_" + Date.now();
    setActiveRideId(generatedId);
    setRideStatus("SEARCHING");

    const payload = {
      rideId: generatedId,
      fare: customOfferFare,
      actualFare: standardFare,
      distance: routeStats.distance,
      duration: routeStats.duration,
      vehicleType: selectedVehicle,
      passenger: {
        id: user?._id,
        name: user?.name || "Passenger"
      },
      pickupLocation: { 
        address: pickup, 
        lat: pickupCoords[0], 
        lng: pickupCoords[1] 
      },
      dropoffLocation: { 
        address: dropoff, 
        lat: dropoffCoords[0], 
        lng: dropoffCoords[1] 
      }
    };

    console.log("📤 Emitting ride:request_create:", payload);
    socket.emit("ride:request_create", payload);
  }, [pickup, dropoff, pickupCoords, dropoffCoords, customOfferFare, standardFare, routeStats, user, selectedVehicle]);

  const handleCancelBooking = useCallback(() => {
    if (activeRideId) {
      console.log("📤 Cancelling ride:", activeRideId);
      socket.emit("ride:cancel_by_passenger", { rideId: activeRideId });
    }
    setRideStatus("IDLE");
    setActiveRideId(null);
    setIncomingCounterOffer(null);
    setChatMessages([]);
  }, [activeRideId]);

  const handleAcceptCounterOffer = useCallback(() => {
    if (!incomingCounterOffer) return;
    socket.emit("ride:passenger_accept_counter", {
      rideId: activeRideId,
      driverId: incomingCounterOffer.driverId,
      finalFare: incomingCounterOffer.offeredFare
    });
    setIncomingCounterOffer(null);
  }, [incomingCounterOffer, activeRideId]);

  const handleRejectCounterOffer = useCallback(() => {
    socket.emit("ride:passenger_reject_counter", {
      rideId: activeRideId,
      driverId: incomingCounterOffer?.driverId
    });
    setIncomingCounterOffer(null);
  }, [incomingCounterOffer, activeRideId]);

  // Chat functions
  const handleSendMessage = useCallback(() => {
    if (!chatInput.trim() || !activeRideId) return;
    socket.emit("chat:send_message", {
      rideId: activeRideId,
      message: chatInput.trim()
    });
    setChatInput("");
  }, [chatInput, activeRideId]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSendMessage();
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-4 lg:p-8 pt-24">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">

        {/* LEFT COMPONENT LAYER */}
        <div className="lg:col-span-7 space-y-6 relative">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">
              Book Your <span className="text-[#c4ff00]">Ride</span>
            </h1>
          </div>

          <div className="space-y-4 relative z-50">
            {/* PICKUP BOX */}
            <div className="relative">
              <div className="flex gap-3 items-center">
                <div className={`relative flex-1 rounded-2xl border transition-all flex items-center bg-white/5 ${selectingMode === 'pickup' ? 'border-[#c4ff00]/60' : 'border-white/5'}`}>
                  <div className="absolute left-5"><MapPin size={22} weight="fill" className="text-[#c4ff00]" /></div>
                  <input
                    type="text"
                    placeholder="Type pickup address..."
                    className="w-full bg-transparent py-5 pl-14 pr-10 outline-none font-bold text-sm text-gray-200"
                    value={pickup}
                    onChange={(e) => handleQuerySearchChange(e.target.value, 'pickup')}
                    onFocus={() => setSelectingMode('pickup')}
                  />
                </div>
                <button type="button" onClick={handleGpsTrigger} className="p-5 rounded-2xl bg-[#c4ff00] text-black hover:scale-95 transition-all">
                  <GpsFix size={22} weight="bold" className={gpsLoading ? "animate-spin" : ""} />
                </button>
              </div>
              {searchFocused === 'pickup' && (suggestions.length > 0 || searchLoading) && (
                <div className="absolute top-16 left-0 right-14 bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50">
                  {searchLoading ? (
                    <div className="p-4 text-xs text-gray-300">Searching locations...</div>
                  ) : (
                    suggestions.map((item, idx) => (
                      <div key={idx} onClick={() => handleSelectLocation(item, 'pickup')} className="p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer text-xs text-gray-300">
                        {item.display_name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* DROPOFF BOX */}
            <div className="relative">
              <div className={`relative rounded-2xl border transition-all flex items-center bg-white/5 ${selectingMode === 'dropoff' ? 'border-red-500/60' : 'border-white/5'}`}>
                <div className="absolute left-5"><MapPinLine size={22} weight="fill" className="text-red-500" /></div>
                <input
                  type="text"
                  placeholder="Type destination dropoff..."
                  className="w-full bg-transparent py-5 pl-14 pr-10 outline-none font-bold text-sm text-gray-200"
                  value={dropoff}
                  onChange={(e) => handleQuerySearchChange(e.target.value, 'dropoff')}
                  onFocus={() => setSelectingMode('dropoff')}
                />
              </div>
              {searchFocused === 'dropoff' && (suggestions.length > 0 || searchLoading) && (
                <div className="absolute top-16 left-0 right-0 bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50">
                  {searchLoading ? (
                    <div className="p-4 text-xs text-gray-300">Searching locations...</div>
                  ) : (
                    suggestions.map((item, idx) => (
                      <div key={idx} onClick={() => handleSelectLocation(item, 'dropoff')} className="p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer text-xs text-gray-300">
                        {item.display_name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* LEAFLET MAP */}
          <div className="h-80 w-full rounded-[2.5rem] overflow-hidden border border-white/10 relative z-10">
            <MapContainer center={mapCenter} zoom={12} className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapClickHandler 
                selectingMode={selectingMode}
                setPickupCoords={setPickupCoords}
                setDropoffCoords={setDropoffCoords}
                setMapCenter={setMapCenter}
                setPickup={setPickup}
                setDropoff={setDropoff}
                fetchAddressName={fetchAddressName}
                fetchNearbyDrivers={fetchNearbyDrivers}
                setSelectingMode={setSelectingMode}
                setSuggestions={setSuggestions}
                setSearchFocused={setSearchFocused}
              />
              <ChangeMapCenter center={mapCenter} />
              {pickupCoords && <Marker position={pickupCoords} />}
              {dropoffCoords && <Marker position={dropoffCoords} />}
              {liveDriverCoords && <Marker position={liveDriverCoords} icon={driverIcon} />}
              {nearbyDrivers.map((driver) => (
                <Marker key={driver._id} position={[driver.location.coordinates[1], driver.location.coordinates[0]]} icon={driverIcon} />
              ))}
              <RoutingMachine pickup={pickupCoords} dropoff={dropoffCoords} onRouteCalculated={handleRouteUpdate} />
            </MapContainer>
          </div>

          {/* FLEET PANEL */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Available Fleet Packages</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {vehicleTypes.map((v) => (
                <div
                  key={v.id}
                  onClick={() => setSelectedVehicle(v.id)}
                  className={`cursor-pointer p-4 rounded-3xl border-2 transition-all ${selectedVehicle === v.id ? 'border-[#c4ff00] bg-[#c4ff00]/5' : 'border-white/5 bg-white/5'}`}
                >
                  <div className={`${v.color} w-10 h-10 rounded-xl flex items-center justify-center text-black mb-3`}>{v.icon}</div>
                  <h4 className="font-black text-xs uppercase">{v.name}</h4>
                  <p className="text-[10px] text-gray-500 mb-1 italic">{v.eta} away</p>
                  <span className="text-md font-black text-[#c4ff00]">
                    Rs. {routeStats.rawDistance > 0 ? Math.round(v.basePrice + (routeStats.rawDistance * v.kmRate)) : v.basePrice}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT MONITOR TERMINAL PANELS */}
        <div className="lg:col-span-5 relative z-20">
          <div className="sticky top-24 bg-white/5 border border-white/10 rounded-[2.5rem] p-6 space-y-6 backdrop-blur-sm">
            {rideStatus === "IDLE" && (
              <>
                <h2 className="text-lg font-black uppercase tracking-tighter">Fare Terminal Summary</h2>
                
                {/* BIDDING/NEGOTIATION COMPONENT */}
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                      <Handshake size={16} /> Negotiate Your Offer
                    </span>
                    <span className="text-[10px] text-gray-500">Min limit: Rs. {minNegotiationLimit}</span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4">
                    <button 
                      onClick={() => setCustomOfferFare(prev => Math.max(minNegotiationLimit, prev - 10))}
                      className="px-4 py-2 bg-white/5 rounded-xl text-sm font-bold active:scale-95 transition-all"
                    >
                      -10
                    </button>
                    <div className="text-center">
                      <span className="text-2xl font-black text-[#c4ff00]">Rs. {customOfferFare}</span>
                      <p className="text-[9px] text-gray-500">Actual: Rs. {standardFare}</p>
                    </div>
                    <button 
                      onClick={() => setCustomOfferFare(prev => prev + 10)}
                      className="px-4 py-2 bg-white/5 rounded-xl text-sm font-bold active:scale-95 transition-all"
                    >
                      +10
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <Clock size={20} className="text-[#c4ff00]" />
                    <div>
                      <p className="text-sm font-bold text-gray-200">{routeStats.distance} ({routeStats.duration})</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleConfirmBooking}
                  disabled={!pickupCoords || !dropoffCoords || addressLoading || driversLoading || gpsLoading}
                  className="w-full bg-[#c4ff00] text-black py-5 rounded-2xl font-black text-sm uppercase tracking-widest disabled:opacity-20 transition-all"
                >
                  Request Ride with Rs. {customOfferFare}
                </button>
              </>
            )}

            {rideStatus === "SEARCHING" && (
              <div className="text-center py-6 space-y-6">
                <Broadcast size={40} className="animate-ping mx-auto text-[#c4ff00]" />
                <h3 className="text-md font-black uppercase tracking-tighter">Finding Drivers & Bids...</h3>
                <p className="text-xs text-gray-400">Your Initial Offer: <span className="text-white font-bold">Rs. {customOfferFare}</span></p>

                {/* DRIVER COUNTER OFFER */}
                {incomingCounterOffer && (
                  <div className="bg-[#0f172a] border-2 border-[#c4ff00]/80 p-4 rounded-2xl shadow-2xl text-left space-y-4 animate-bounce">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Driver Counter Offer</h4>
                        <p className="text-sm font-bold text-white">{incomingCounterOffer.driverName || "Nearby Driver"}</p>
                      </div>
                      <span className="text-xl font-black text-[#c4ff00]">Rs. {incomingCounterOffer.offeredFare}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button 
                        onClick={handleRejectCounterOffer}
                        className="flex items-center justify-center gap-1 bg-red-500/10 border border-red-500/30 text-red-400 py-3 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-red-500 hover:text-white transition-all"
                      >
                        <X size={14} weight="bold" /> Decline
                      </button>
                      <button 
                        onClick={handleAcceptCounterOffer}
                        className="flex items-center justify-center gap-1 bg-[#c4ff00] text-black py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:scale-[1.02] transition-all"
                      >
                        <Check size={14} weight="bold" /> Accept
                      </button>
                    </div>
                  </div>
                )}

                {/* Live Chat During Searching */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase text-gray-400 flex items-center gap-2">
                      <ChatTeardropText size={16} /> Chat
                    </h4>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} className={`text-xs p-2 rounded-lg ${
                        msg.senderId?._id === user?._id ? "bg-[#c4ff00]/10 text-[#c4ff00] ml-4" : "bg-white/5 mr-4"
                      }`}>
                        <p className="font-bold text-[10px] opacity-70">{msg.senderId?.name || "User"}</p>
                        <p>{msg.message}</p>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Message driver..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none" />
                    <button onClick={handleSendMessage}
                      className="bg-[#c4ff00] text-black px-3 py-2 rounded-lg">
                      <PaperPlaneRight size={16} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleCancelBooking}
                  className="w-full mt-4 bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <XCircle size={18} weight="bold" /> Cancel Ride
                </button>
              </div>
            )}

            {rideStatus === "ACCEPTED" && (
              <div className="text-center py-6 space-y-4">
                <Check size={40} className="text-[#c4ff00] mx-auto" />
                <h3 className="text-lg font-black uppercase tracking-tighter">Driver Found!</h3>
                <p className="text-xs text-gray-400">
                  Driver is on the way. Redirecting to tracking...
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default BookRide;