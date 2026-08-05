
import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useSocket, useRideTracking, requestNotificationPermission } from "../hooks/useRideTracking";
import { formatETA } from "../utils/geoUtils";

// Fix Leaflet default icon issue
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom icons
const driverIcon = new L.Icon({
    iconUrl: "/driver-marker.png", // Add your driver icon
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
});

const pickupIcon = new L.Icon({
    iconUrl: "/pickup-marker.png", // Add your pickup icon
    iconSize: [35, 35],
    iconAnchor: [17, 35]
});

// ============================================
// PASSENGER TRACKING PAGE
// ============================================
export const PassengerTrackingPage = ({ rideId, token }) => {
    const { socket, isConnected } = useSocket(token);
    const {
        driverLocation,
        eta,
        rideStatus,
        // eslint-disable-next-line no-unused-vars
        isTracking,
        error
    } = useRideTracking(socket, rideId, "passenger");

    const [pickupLocation] = useState({ lat: 28.6139, lng: 77.2090 }); // Replace with actual
    const defaultCenter = [28.6139, 77.2090];
    const mapRef = useRef(null);

    // Request notification permission on mount
    useEffect(() => {
        requestNotificationPermission();
    }, []);

    // Update map center when driver moves
    useEffect(() => {
        if (driverLocation && mapRef.current) {
            mapRef.current.flyTo(
                [driverLocation.latitude, driverLocation.longitude],
                mapRef.current.getZoom()
            );
        }
    }, [driverLocation]);

    if (error) {
        return (
            <div className="error-container">
                <div className="error-message">⚠️ {error}</div>
                <button onClick={() => window.location.reload()}>Retry</button>
            </div>
        );
    }

    return (
        <div className="tracking-page">
            {/* Connection Status */}
            <div className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
                {isConnected ? "🟢 Live Tracking" : "🔴 Reconnecting..."}
            </div>

            {/* Driver Info Card */}
            <div className="driver-info-card">
                <div className="driver-avatar">🚗</div>
                <div className="driver-details">
                    <h3>{rideStatus === "ARRIVED" ? "Driver Arrived!" : "Driver is on the way"}</h3>
                    <div className="eta-display">
                        {rideStatus === "ARRIVED" ? (
                            <span className="arrived-badge">📍 Arrived at pickup</span>
                        ) : (
                            <>
                                <span className="eta-time">⏱️ {formatETA(eta)}</span>
                                <span className="eta-label">until arrival</span>
                            </>
                        )}
                    </div>
                    {driverLocation && (
                        <div className="location-meta">
                            <small>
                                📍 {driverLocation.latitude.toFixed(4)}, {driverLocation.longitude.toFixed(4)}
                            </small>
                        </div>
                    )}
                </div>
            </div>

            {/* Map */}
            <div className="map-container">
                <MapContainer
                    center={defaultCenter}
                    zoom={15}
                    scrollWheelZoom={true}
                    style={{ height: "100%", width: "100%" }}
                    whenCreated={(mapInstance) => { mapRef.current = mapInstance; }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Pickup Location Marker */}
                    <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={pickupIcon}>
                        <Popup>📍 Your Pickup Location</Popup>
                    </Marker>

                    {/* Driver Location Marker */}
                    {driverLocation && (
                        <>
                            <Marker
                                position={[driverLocation.latitude, driverLocation.longitude]}
                                icon={driverIcon}
                            >
                                <Popup>
                                    🚗 Driver Location<br/>
                                    Updated: {new Date(driverLocation.timestamp).toLocaleTimeString()}
                                </Popup>
                            </Marker>

                            {/* Accuracy circle */}
                            <Circle
                                center={[driverLocation.latitude, driverLocation.longitude]}
                                radius={driverLocation.accuracy || 50}
                                pathOptions={{ color: "blue", fillColor: "blue", fillOpacity: 0.1 }}
                            />
                        </>
                    )}

                    {/* Route line from driver to pickup */}
                    {driverLocation && (
                        <Polyline
                            positions={[
                                [driverLocation.latitude, driverLocation.longitude],
                                [pickupLocation.lat, pickupLocation.lng]
                            ]}
                            color="#4CAF50"
                            weight={4}
                            dashArray="10, 10"
                        />
                    )}
                </MapContainer>
            </div>

            {/* Status Timeline */}
            <div className="status-timeline">
                <div className={`timeline-item ${rideStatus === "ACCEPTED" || rideStatus === "ARRIVED" ? "active" : ""}`}>
                    <div className="timeline-dot">✓</div>
                    <span>Ride Accepted</span>
                </div>
                <div className={`timeline-item ${rideStatus === "ARRIVED" ? "active" : ""}`}>
                    <div className="timeline-dot">{rideStatus === "ARRIVED" ? "✓" : "○"}</div>
                    <span>Driver Arrived</span>
                </div>
                <div className="timeline-item">
                    <div className="timeline-dot">○</div>
                    <span>Trip Started</span>
                </div>
            </div>
        </div>
    );
};

// ============================================
// DRIVER TRACKING PAGE (with "I Arrived" button)
// ============================================
export const DriverTrackingPage = ({ rideId, token, pickupCoords, dropoffCoords }) => {
    const { socket, isConnected } = useSocket(token);
    const {
        driverLocation,
        eta,
        rideStatus,
        startLocationTracking,
        stopLocationTracking,
        markAsArrived
    } = useRideTracking(socket, rideId, "driver");

    const [currentLocation, setCurrentLocation] = useState(null);
    const [isArrivedLoading, setIsArrivedLoading] = useState(false);
    const [arrivedError, setArrivedError] = useState(null);

    // Start location tracking when component mounts
    useEffect(() => {
        if (isConnected && rideStatus !== "ARRIVED") {
            startLocationTracking();
        }
        return () => stopLocationTracking();
    }, [isConnected, rideStatus, startLocationTracking, stopLocationTracking]);

    // Get current location for map center
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setCurrentLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    });
                },
                (err) => console.error("Geolocation error:", err)
            );
        }
    }, []);

    // Handle "I Arrived" button click
    const handleArrived = async () => {
        setIsArrivedLoading(true);
        setArrivedError(null);

        try {
            await markAsArrived();
            stopLocationTracking();
            // Show success message
            alert("✅ You have marked as arrived! Passenger has been notified.");
        } catch (err) {
            setArrivedError(err);
            console.error("Arrived error:", err);
        } finally {
            setIsArrivedLoading(false);
        }
    };

    const mapCenter = currentLocation 
        ? [currentLocation.lat, currentLocation.lng] 
        : [pickupCoords?.lat || 28.6139, pickupCoords?.lng || 77.2090];

    return (
        <div className="driver-tracking-page">
            {/* Connection Status */}
            <div className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
                {isConnected ? "🟢 Online - Broadcasting Location" : "🔴 Reconnecting..."}
            </div>

            {/* Ride Info Card */}
            <div className="ride-info-card">
                <h3>🚗 Active Ride #{rideId?.slice(-6)}</h3>
                <div className="ride-status">
                    Status: <span className={`status-badge ${rideStatus?.toLowerCase()}`}>
                        {rideStatus || "Loading..."}
                    </span>
                </div>
                {eta && (
                    <div className="eta-info">
                        ⏱️ ETA to pickup: {formatETA(eta)}
                    </div>
                )}
            </div>

            {/* Map */}
            <div className="map-container">
                <MapContainer
                    center={mapCenter}
                    zoom={15}
                    scrollWheelZoom={true}
                    style={{ height: "100%", width: "100%" }}
                >
                    <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Pickup Location */}
                    {pickupCoords && (
                        <Marker position={[pickupCoords.lat, pickupCoords.lng]} icon={pickupIcon}>
                            <Popup>📍 Pickup Location</Popup>
                        </Marker>
                    )}

                    {/* Dropoff Location */}
                    {dropoffCoords && (
                        <Marker position={[dropoffCoords.lat, dropoffCoords.lng]}>
                            <Popup>🏁 Dropoff Location</Popup>
                        </Marker>
                    )}

                    {/* Driver Current Location */}
                    {currentLocation && (
                        <Marker position={[currentLocation.lat, currentLocation.lng]} icon={driverIcon}>
                            <Popup>🚗 You are here</Popup>
                        </Marker>
                    )}

                    {/* Route line */}
                    {currentLocation && pickupCoords && (
                        <Polyline
                            positions={[
                                [currentLocation.lat, currentLocation.lng],
                                [pickupCoords.lat, pickupCoords.lng]
                            ]}
                            color="#2196F3"
                            weight={5}
                        />
                    )}
                </MapContainer>
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
                {rideStatus !== "ARRIVED" && (
                    <button
                        className={`arrived-btn ${isArrivedLoading ? "loading" : ""}`}
                        onClick={handleArrived}
                        disabled={isArrivedLoading || !isConnected}
                    >
                        {isArrivedLoading ? (
                            <>
                                <span className="spinner"></span>
                                Updating...
                            </>
                        ) : (
                            <>📍 I Have Arrived</>
                        )}
                    </button>
                )}

                {rideStatus === "ARRIVED" && (
                    <div className="arrived-success">
                        ✅ You have arrived! Waiting for passenger.
                    </div>
                )}

                {arrivedError && (
                    <div className="error-text">⚠️ {arrivedError}</div>
                )}
            </div>

            {/* Location Debug Info */}
            {driverLocation && (
                <div className="debug-info">
                    <small>
                        Broadcasting: {driverLocation.latitude.toFixed(6)}, {driverLocation.longitude.toFixed(6)}
                        <br/>
                        Accuracy: {driverLocation.accuracy}m | Heading: {driverLocation.heading}°
                    </small>
                </div>
            )}
        </div>
    );
};

