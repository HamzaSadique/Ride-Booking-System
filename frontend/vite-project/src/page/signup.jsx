import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { registerUser } from '../redux/slice/authSlice'; // Path confirm kar lena
import toast from 'react-hot-toast';
import { User, Envelope, Lock, Phone, UserPlus, ArrowRight, GoogleLogo, SteeringWheel } from "@phosphor-icons/react";

const Signup = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.auth);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    password: '',
    role: 'user' // Default role
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRoleChange = (selectedRole) => {
    setFormData({ ...formData, role: selectedRole });
  };

  const handleSignup = async (e) => {
    console.log("Data will come :", formData);
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.password || !formData.phoneNumber) {
      return toast.error("Please fill in all fields!");
    }

    try {
      const resultAction = await dispatch(registerUser(formData));

      if (registerUser.fulfilled.match(resultAction)) {
        toast.success("Registration successful! Check your email.");
        // Email ko state mein pass karein
        navigate('/verify-otp', { state: { email: formData.email } });
      } else {
        toast.error(resultAction.payload || "Registration failed. Please try again.");
      }
      
    } catch (error) {
      console.error("Signup Error:", error);
      toast.error("Something went wrong. Please try again.");
    }
  };

  const handleGoogleSignup = () => {
    window.location.href = "http://localhost:8000/api/v1/auth/google";
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[#020617] py-20">
      <div className="max-w-md w-full bg-white/0.03 border border-white/10 p-10 rounded-[3rem] backdrop-blur-xl shadow-2xl relative overflow-hidden group">

        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full"></div>

        <div className="text-center mb-8">
          <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 -rotate-3 group-hover:rotate-0 transition-all duration-500 shadow-lg">
            <UserPlus size={32} weight="bold" className="text-black" />
          </div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">Register</h2>
          <p className="text-gray-500 font-bold text-[10px] mt-2 uppercase tracking-[0.2em]">Join the community</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleGoogleSignup}
            className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-white font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            <GoogleLogo size={20} weight="bold" className="text-blue-400" /> Signup with Google
          </button>

          <div className="flex items-center gap-4 my-4">
            <div className="h-1px w-full bg-white/5"></div>
            <span className="text-[10px] font-black text-gray-600">OR</span>
            <div className="h-1px w-full bg-white/5"></div>
          </div>

          <form onSubmit={handleSignup} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-2">Full Name</label>
                <div className="flex items-center gap-3 bg-white/5 border border-white/5 p-3.5 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                  <User size={18} className="text-gray-500" />
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    type="text"
                    placeholder="Hamza"
                    className="bg-transparent outline-none w-full text-xs font-bold text-white"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-2">Phone</label>
                <div className="flex items-center gap-3 bg-white/5 border border-white/5 p-3.5 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                  <Phone size={18} className="text-gray-500" />
                  <input
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    type="text"
                    placeholder="+92..."
                    className="bg-transparent outline-none w-full text-xs font-bold text-white"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-2">Email Address</label>
              <div className="flex items-center gap-3 bg-white/5 border border-white/5 p-3.5 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                <Envelope size={18} className="text-gray-500" />
                <input
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  type="email"
                  placeholder="name@email.com"
                  className="bg-transparent outline-none w-full text-xs font-bold text-white"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-2">Register As</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRoleChange('user')}
                  className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl font-black text-[10px] uppercase tracking-tighter transition-all ${formData.role === 'user' ? 'bg-[#c4ff00] text-black shadow-lg shadow-[#c4ff00]/10' : 'bg-white/5 border border-white/10 text-gray-400'}`}
                >
                  Passenger
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleChange('partner')}
                  className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl font-black text-[10px] uppercase tracking-tighter transition-all ${formData.role === 'partner' ? 'bg-[#c4ff00] text-black shadow-lg shadow-[#c4ff00]/10' : 'bg-white/5 border border-white/10 text-gray-400'}`}
                >
                  <SteeringWheel size={16} /> Partner
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-2">Password</label>
              <div className="flex items-center gap-3 bg-white/5 border border-white/5 p-3.5 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                <Lock size={18} className="text-gray-500" />
                <input
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  type="password"
                  placeholder="••••••••"
                  className="bg-transparent outline-none w-full text-xs font-bold text-white"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-5 bg-white text-black rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-[#c4ff00] transition-all mt-4 group/btn shadow-xl active:scale-95 text-xs uppercase tracking-widest ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? "Processing..." : "Join Now"} <ArrowRight size={18} weight="bold" />
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-gray-500 text-[10px] font-black uppercase tracking-widest">
          Already a member? <Link to="/login" className="text-white hover:text-[#c4ff00] transition-colors underline underline-offset-4">Log In</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;