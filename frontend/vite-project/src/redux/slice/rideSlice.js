import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from "../../api/axios";

// 1. Request Ride (Passenger ke liye)
export const requestRideAction = createAsyncThunk(
    "ride/request",
    async (rideData, { rejectWithValue }) => {
        try {
            const response = await API.post("/ride/request", rideData); 
            return response.data.data; 
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || "Booking failed");
        }
    }
);

// 2. Fetch Partner Rides (Driver ko apni rides dikhane ke liye)
export const fetchPartnerRides = createAsyncThunk(
    "ride/fetchPartnerRides",
    async (_, { rejectWithValue }) => {
        try {
            const response = await API.get("/ride/partner-rides");
            return response.data.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || "Failed to fetch rides");
        }
    }
);

// 3. Cancel Ride
export const cancelRideAction = createAsyncThunk(
    "ride/cancel",
    async (rideId, { rejectWithValue }) => {
        try {
            const response = await API.patch(`/ride/cancel/${rideId}`);
            return response.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || "Cancellation failed");
        }
    }
);

const rideSlice = createSlice({
    name: "ride",
    initialState: {
        currentRide: null,
        allRides: [], // Admin ya Partner ki saari rides ke liye
        loading: false,
        error: null,
    },
    reducers: {
        clearCurrentRide: (state) => {
            state.currentRide = null;
        },
        clearRideError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // --- Request Ride ---
            .addCase(requestRideAction.pending, (state) => { 
                state.loading = true; 
                state.error = null;
            })
            .addCase(requestRideAction.fulfilled, (state, action) => {
                state.loading = false;
                state.currentRide = action.payload; 
            })
            .addCase(requestRideAction.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            // --- Fetch Partner Rides (New) ---
            .addCase(fetchPartnerRides.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchPartnerRides.fulfilled, (state, action) => {
                state.loading = false;
                state.allRides = action.payload; // List bhar di
            })
            .addCase(fetchPartnerRides.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            // --- Cancel Ride ---
            .addCase(cancelRideAction.fulfilled, (state) => {
                state.currentRide = null;
            });
    }
});

export const { clearCurrentRide, clearRideError } = rideSlice.actions;
export default rideSlice.reducer;