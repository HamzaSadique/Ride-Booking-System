import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import API from '../../api/axios';
import { AUTH_ROUTES } from '../../utils/constants';

// --- Thunks ---
export const registerUser = createAsyncThunk('auth/register', async (data, { rejectWithValue }) => {
    try {
        const response = await API.post(AUTH_ROUTES.REGISTER, data);
        return response.data; 
    } catch (error) {
        return rejectWithValue(error.response?.data?.message || "Registration Failed");
    }
});

export const loginUser = createAsyncThunk('auth/login', async (data, { rejectWithValue }) => {
    try {
        const response = await API.post(AUTH_ROUTES.LOGIN, data);
        return response.data.data; 
    } catch (error) {
        return rejectWithValue(error.response?.data?.message || "Login Failed");
    }
});

export const verifyOTP = createAsyncThunk('auth/verifyOTP', async ({ email, otp }, { rejectWithValue }) => {
    try {
        console.log("=== SENDING TO BACKEND ===", { email, otp }); // Yeh console check karein
        
        // ✨ FIXED: Payload ko strictly destructure karke explicit object bana kar bhej rahe hain
        const response = await API.post(AUTH_ROUTES.VERIFY_OTP, { 
            email, 
            otp: otp.toString() // Double safety layer for backend string check
        });
        
        return response.data;
    } catch (error) {
        // Safe backend response message extraction
        return rejectWithValue(error.response?.data?.message || "OTP Verification Failed");
    }
});
export const resendOTP = createAsyncThunk('auth/resendOTP', async (data, { rejectWithValue }) => {
    try {
        // Standardized route approach prevents production API prefix routing mismatches
        const response = await API.post(AUTH_ROUTES.RESEND_OTP || '/auth/resend-otp', data); 
        return response.data;
    } catch (error) {
        return rejectWithValue(error.response?.data || { message: "Failed to resend OTP" });
    }
});

export const forgotPassword = createAsyncThunk('auth/forgotPassword', async (email, { rejectWithValue }) => {
    try {
        const response = await API.post('/auth/forgot-password', { email });
        return response.data;
    } catch (error) {
        return rejectWithValue(error.response?.data?.message || "Failed to send reset link");
    }
});

// authSlice.js
export const resetPassword = createAsyncThunk('auth/resetPassword', async ({ token, password }, { rejectWithValue }) => {
    try {
        // Token URL mein hona chahiye (/reset-password/TOKEN_ID)
        const response = await API.put(`/auth/reset-password/${token}`, { password }); 
        return response.data;
    } catch (error) {
        return rejectWithValue(error.response?.data?.message || "Reset failed");
    }
});
// --- Slice ---
const authSlice = createSlice({
    name: 'auth',
    initialState: {
        // Refresh par data bachane ke liye localStorage check karein
        user: JSON.parse(localStorage.getItem("user")) || null,
        token: localStorage.getItem("token") || null,
        loading: false,
        error: null,
        isAuthenticated: !!localStorage.getItem("token") || !!localStorage.getItem("user"),
        isPendingPartner: false,
    },
    reducers: {
        // ✨ GOOGLE LOGIN KE LIYE YE ZAROORI HAI
        setCredentials: (state, action) => {
            const { user } = action.payload;
            state.user = user;
            state.isAuthenticated = true;
            state.error = null;
            // LocalStorage update karein taake refresh par data na jaye
            localStorage.setItem("user", JSON.stringify(user));
        },

        logout: (state) => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;
            state.isPendingPartner = false;
            state.error = null;
            // LocalStorage saaf karein
            localStorage.removeItem("user");
            localStorage.removeItem("token");
        },
        clearErrors: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Login
            .addCase(loginUser.pending, (state) => { 
                state.loading = true; 
                state.error = null; 
            })
            .addCase(loginUser.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload.user;
                state.token = action.payload.token;
                state.isPendingPartner = action.payload.isPendingPartner;
                state.isAuthenticated = true;
                
                // Manual login ka data bhi save karein
                localStorage.setItem("user", JSON.stringify(action.payload.user));
                localStorage.setItem("token", action.payload.token);
            })
            .addCase(loginUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
                state.isAuthenticated = false;
            })
            
            // Register & OTP cases (Same as before)
            .addCase(registerUser.pending, (state) => { state.loading = true; })
            .addCase(registerUser.fulfilled, (state) => { state.loading = false; })
            .addCase(registerUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(verifyOTP.pending, (state) => { state.loading = true; })
            .addCase(verifyOTP.fulfilled, (state) => { state.loading = false; })
            .addCase(verifyOTP.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

//  setCredentials
export const { logout, clearErrors, setCredentials, } = authSlice.actions;
export default authSlice.reducer;