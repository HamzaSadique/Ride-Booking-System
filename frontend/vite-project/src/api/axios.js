// src/api/axios.js
import axios from 'axios';
import { API_BASE_URL } from '../utils/constants'; // Tumhare banaye hue constants

const API = axios.create({
    baseURL: API_BASE_URL, // Yahan 'http://localhost:5000/api/v1' khud hi aa jayega
    withCredentials: true, 
});

// Interceptor: Har request ke sath token automatic chala jaye
API.interceptors.request.use((config) => {
    // Hum token direct storage se bhi utha sakte hain persistence ke liye
    const token = localStorage.getItem('token'); 
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default API;