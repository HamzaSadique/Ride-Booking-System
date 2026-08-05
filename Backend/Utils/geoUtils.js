/**
 * Geographic utility functions for ride tracking
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;

    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const toRad = (value) => (value * Math.PI) / 180;

/**
 * Calculate ETA based on distance and average speed
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} avgSpeedKmh - Average speed in km/h (default: 25 for city traffic)
 * @returns {number} ETA in minutes
 */
export const calculateETA = (distanceKm, avgSpeedKmh = 25) => {
    if (!distanceKm || distanceKm <= 0) return null;
    return (distanceKm / avgSpeedKmh) * 60; // Returns minutes
};

/**
 * Format ETA for display (e.g., "10 min" or "1 hr 30 min")
 * @param {number} minutes - ETA in minutes
 * @returns {string} Formatted ETA string
 */
export const formatETA = (minutes) => {
    if (!minutes || minutes <= 0) return "Arriving now";
    if (minutes < 1) return "Less than a minute";
    if (minutes < 60) return `${Math.ceil(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.ceil(minutes % 60);
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
};

/**
 * Check if driver has arrived at pickup (within threshold)
 * @param {number} driverLat - Driver latitude
 * @param {number} driverLng - Driver longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} pickupLng - Pickup longitude
 * @param {number} thresholdMeters - Arrival threshold in meters (default: 100)
 * @returns {boolean} True if driver has arrived
 */
export const hasDriverArrived = (driverLat, driverLng, pickupLat, pickupLng, thresholdMeters = 100) => {
    const distance = calculateDistance(driverLat, driverLng, pickupLat, pickupLng);
    if (!distance) return false;
    return (distance * 1000) <= thresholdMeters; // Convert km to meters
};

/**
 * Generate route points for map polyline (simplified)
 * In production, use Google Maps Directions API or Mapbox
 */
export const generateRoutePoints = (startLat, startLng, endLat, endLng, points = 10) => {
    const route = [];
    for (let i = 0; i <= points; i++) {
        const ratio = i / points;
        route.push({
            latitude: startLat + (endLat - startLat) * ratio,
            longitude: startLng + (endLng - startLng) * ratio
        });
    }
    return route;
};