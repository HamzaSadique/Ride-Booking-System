import React, { useState } from 'react'; // 1. useState add kiya
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux'; // 2. Redux hooks
// eslint-disable-next-line no-unused-vars
import { loginUser,setCredentials } from '../redux/slice/authSlice'; // Path check kar lena
import toast from 'react-hot-toast'; // 3. Toast import
import { Envelope, Lock, SignIn, ArrowRight, GoogleLogo } from "@phosphor-icons/react";

const Login = () => {
  // --- Functionality Starts Here ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading } = useSelector((state) => state.auth);

  const handleLogin = async (e) => {
  e.preventDefault();
  
  if (!email || !password) {
    return toast.error("Email and pasword required");
  }

  try {
    const resultAction = await dispatch(loginUser({ email, password }));

    if (loginUser.fulfilled.match(resultAction)) {
      toast.success("Login successful.");

      // Data nikalna
      const user = resultAction.payload?.user;
      const userRole = user?.role?.toLowerCase(); // Case-insensitive check ke liye
      const userStatus = user?.status?.toLowerCase();
      const isPendingPartner = resultAction.payload?.isPendingPartner; 

      // --- Smart Redirection Logic ---
      
      // 1. Admin Logic
      if (userRole === 'admin') {
        return navigate('/admin/kyc-requests');
      } 
      
      // 2. Partner Logic
      if (userRole === 'partner') {
        // Agar admin ne reject kiya ho ya abhi tak pending ho
        if (isPendingPartner === true || userStatus === 'pending' || userStatus === 'rejected') {
          return navigate('/partner/submit-kyc'); 
        } 
        
        // Agar user verified aur approved hai
        if (userStatus === 'approved') {
          return navigate('/partner-dashboard');
        }

        // Fallback: Agar status samajh nahi aa raha toh KYC page safe hai
        return navigate('/partner/submit-kyc');
      } 

      // 3. Normal User/Passenger Logic
      navigate('/dashboard');

    } else {
      // Backend se jo error message aye wahi dikhayein
      const errorMsg = resultAction.payload?.message || resultAction.error?.message || "Login failed.";
      toast.error(errorMsg);
    }
  } catch (error) {
    console.error("Login Error:", error);
    toast.error("Network or server down.");
  }
};
  const handleGoogleLogin = () => {
  // Double ;; hata kar single ; kar dein
  window.location.href = "http://localhost:8000/api/v1/auth/google"; 
};
  // --- Functionality Ends Here ---

  return (
    <div className="min-h-[90vh] flex items-center justify-center px-6 bg-[#020617]">
      <div className="max-w-md w-full bg-white/5 border border-white/10 p-10 rounded-[3rem] backdrop-blur-xl shadow-2xl relative overflow-hidden group">
        
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#c4ff00]/10 blur-[80px] rounded-full"></div>

        <div className="text-center mb-8 relative">
          <div className="h-16 w-16 bg-[#c4ff00] rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-3 group-hover:rotate-12 transition-all duration-500 shadow-lg shadow-[#c4ff00]/20">
            <SignIn size={32} weight="bold" className="text-black" />
          </div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase">Login</h2>
          <p className="text-gray-500 font-bold text-[10px] mt-2 uppercase tracking-[0.2em]">Enter details to continue</p>
        </div>

        <div className="space-y-4">
          <button 
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-white font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
          >
            <GoogleLogo size={20} weight="bold" className="text-[#c4ff00]" /> Continue with Google
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="h-[1px w-full bg-white/5"></div>
            <span className="text-[10px] font-black text-gray-600 uppercase">OR</span>
            <div className="h-1px w-full bg-white/5"></div>
          </div>

          {/* Form me onSubmit add kiya */}
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Email Address</label>
              <div className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                <Envelope size={22} weight="duotone" className="text-gray-500" />
                <input 
                  type="email" 
                  value={email} // Controlled Input
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com" 
                  className="b-transparent outline-none w-full text-sm font-bold text-white placeholder:text-gray-700" 
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Password</label>
                <Link to="/forgot-password" className="text-[9px] font-black text-[#c4ff00] uppercase hover:underline">
                    Forgot?
                </Link>
              </div>
              <div className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                <Lock size={22} weight="duotone" className="text-gray-500" />
                <input 
                  type="password" 
                  value={password} // Controlled Input
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="bg-transparent outline-none w-full text-sm font-bold text-white placeholder:text-gray-700" 
                  required
                />
              </div>
            </div>

            {/* Button Loading State handle ki */}
            <button 
              type="submit"
              disabled={isLoading}
              className={`w-full py-5 bg-[#c4ff00] rounded-2xl font-black text-black flex items-center justify-center gap-3 hover:bg-[#d4ff33] transition-all shadow-lg mt-6 group/btn uppercase tracking-widest text-xs ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? "Signing In..." : (
                <>
                  Sign In <ArrowRight size={18} weight="bold" className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">
            No account? <Link to="/signup" className="text-white hover:text-[#c4ff00] transition-colors underline underline-offset-4">Create One</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;