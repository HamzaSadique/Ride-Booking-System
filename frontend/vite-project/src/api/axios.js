// src/api/axios.js
import axios from 'axios';

const API = axios.create({
    baseURL: 'http://localhost:8000/api/v1', // Make sure this matches your backend
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Interceptor: Add token to every request
API.interceptors.request.use(
    (config) => {
        // Try multiple sources for the token
        const token = localStorage.getItem('token') || 
                     localStorage.getItem('authToken') ||
                     sessionStorage.getItem('token');
        
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log('📤 Request with token to:', config.url);
        } else {
            console.warn('⚠️ No token found for request to:', config.url);
        }
        
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Interceptor: Handle response errors
API.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        if (error.response?.status === 401) {
            console.warn('🔒 401 Unauthorized for:', error.config?.url);
            // Don't redirect here, let the component handle it
        }
        return Promise.reject(error);
    }
);

export default API;