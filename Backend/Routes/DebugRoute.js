// Add this route to debug the issue in real-time
// Routes/DebugRoute.js
import express from 'express';
import User from '../Models/ModelUser.js';

const router = express.Router();

// GET /api/v1/debug/driver-status
router.get('/driver-status', async (req, res) => {
    try {
        const { lat, lng, vehicleType } = req.query;

        const results = {
            query: { lat, lng, vehicleType },
            indexes: {},
            counts: {},
            drivers: [],
            issues: []
        };

        // 1. Check indexes
        const indexes = await User.collection.getIndexes();
        results.indexes = Object.keys(indexes);

        if (!indexes['currentLocation_2dsphere']) {
            results.issues.push("❌ Missing 2dsphere index on currentLocation");
        }

        // 2. Count total online drivers
        results.counts.totalOnline = await User.countDocuments({
            role: 'partner',
            isOnline: true,
            currentStatus: 'available'
        });

        // 3. Count matching vehicle type
        results.counts.matchingVehicle = await User.countDocuments({
            role: 'partner',
            isOnline: true,
            currentStatus: 'available',
            'vehicle.type': vehicleType
        });

        // 4. Count with valid location
        results.counts.withLocation = await User.countDocuments({
            role: 'partner',
            isOnline: true,
            currentStatus: 'available',
            'vehicle.type': vehicleType,
            currentLocation: { $exists: true, $ne: null }
        });

        // 5. Try geospatial query
        if (lat && lng) {
            try {
                results.counts.nearby = await User.countDocuments({
                    role: 'partner',
                    isOnline: true,
                    currentStatus: 'available',
                    'vehicle.type': vehicleType,
                    currentLocation: {
                        $near: {
                            $geometry: {
                                type: "Point",
                                coordinates: [Number(lng), Number(lat)]
                            },
                            $maxDistance: 5000
                        }
                    }
                });
            } catch (geoErr) {
                results.issues.push(`❌ Geospatial query failed: ${geoErr.message}`);
                results.counts.nearby = 0;
            }
        }

        // 6. Get actual driver details (limit 5)
        results.drivers = await User.find({
            role: 'partner',
            isOnline: true
        }).select("name vehicle.type currentLocation isOnline currentStatus").limit(5);

        // 7. Analyze issues
        if (results.counts.totalOnline === 0) {
            results.issues.push("❌ No drivers are online");
        }
        if (results.counts.matchingVehicle === 0) {
            results.issues.push(`❌ No drivers with vehicle type '${vehicleType}'`);
        }
        if (results.counts.withLocation === 0) {
            results.issues.push("❌ Online drivers have no location data");
        }
        if (results.counts.nearby === 0 && results.counts.withLocation > 0) {
            results.issues.push("❌ Drivers with location are outside 5km radius");
        }

        res.json({
            success: true,
            message: "Driver status diagnostic",
            data: results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;