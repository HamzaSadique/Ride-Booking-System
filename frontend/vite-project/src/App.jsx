import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Toaster } from 'react-hot-toast';

// Pages Imports
import Home from "./page/Home";
import Navbar from './components/Navbar';
import Signup from './page/signup';
import Login from './page/login';
import ForgotPassword from './page/ForgetPassword';
import ResetPassword from './page/ResetPasword';
import VerifyOTP from './page/varifyotp';
import Footer from './page/Footer';
import LoginSuccess from './page/LoginSucess';
import Dashboard from './page/Dashboard';
import BookRide from './page/BookRide';

// Partner Pages
import PartnerDashboard from './partner/PartnerDashboard';
import MyVehicle from './partner/MyVehicle';
import RideRequests from './partner/RideRequest';

// Admin Pages
import AdminKYCManager from './admin/AdminKYCManager';
import AdminDashboard from './admin/AdminDashboard';


const App = () => {
  // Redux se user aur authentication status nikalna
  const { user, isAuthenticated } = useSelector((state) => state.auth);

  return (
    <>
      <Toaster
        position="top-center"
        reverseOrder={false}
        toastOptions={{
          duration: 4000,
          style: {
            background: '#0f172a',
            color: '#fff',
            border: '1px solid rgba(196, 255, 0, 0.2)',
          },
        }}
      />

      <Router>
        <div className="min-h-screen bg-slate-950 text-white">
          <Navbar />

          <Routes>
            {/* --- 1. Public Routes --- */}
            <Route path="/signup" element={!isAuthenticated ? <Signup /> : <Navigate to="/" />} />
            <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/verify-otp" element={<VerifyOTP />} />
            <Route path="/login-success" element={<LoginSuccess />} />

            {/* --- 2. Home Route (Smart Redirection) --- */}
            <Route
              path="/"
              element={
                isAuthenticated ? (
                  user?.role === 'admin'
                    ? <Navigate to="/admin/dashboard-stats" replace />
                    : user?.role === 'partner'
                      ? <Navigate to="/partner-dashboard" replace />
                      : <Home />
                ) : (
                  <Home />
                )
              }
            />

            {/* --- 3. User/Passenger Routes (🔒 STRICT SECURITY BOUNCE INJECTED HERE) --- */}
            <Route
              path="/dashboard"
              element={
                isAuthenticated ? (
                  user?.role === 'admin'
                    ? <Navigate to="/admin/dashboard-stats" replace /> // ✨ Admin ko user dashboard se dhakka dekar bahar nikalो
                    : <Dashboard />
                ) : (
                  <Navigate to="/login" />
                )
              }
            />
            <Route
              path="/bookings"
              element={
                isAuthenticated ? (
                  user?.role === 'admin'
                    ? <Navigate to="/admin/dashboard-stats" replace /> // ✨ Admin ride book karne nahi ja sakta
                    : <BookRide />
                ) : (
                  <Navigate to="/login" />
                )
              }
            />

            {/* --- 4. Partner/Driver Routes --- */}
            <Route
              path="/partner-dashboard"
              element={
                isAuthenticated && user?.role === 'partner'
                  ? <PartnerDashboard />
                  : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/my-vehicle"
              element={
                isAuthenticated && user?.role === 'partner'
                  ? <MyVehicle />
                  : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/ride-requests"
              element={
                isAuthenticated && user?.role === 'partner'
                  ? <RideRequests />
                  : <Navigate to="/login" replace />
              }
            />

            {/* --- 5. Admin Routes --- */}
            <Route
              path="/admin/verify-kyc" //  Navbar ke path se match karne ke liye 'kyc-requests' ko badal kar 'verify-kyc' kar diya
              element={
                isAuthenticated && user?.role === 'admin'
                  ? <AdminKYCManager />
                  : <Navigate to="/" replace />
              }
            />
            <Route
              path="/admin/dashboard-stats"
              element={
                isAuthenticated && user?.role === 'admin'
                  ? <AdminDashboard />
                  : <Navigate to="/" replace />
              }
            />
            {/* --- 6. Fallback --- */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>

          <Footer />
        </div>
      </Router>
    </>
  );
};

export default App;