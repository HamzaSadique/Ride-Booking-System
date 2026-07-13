import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { forgotPassword } from '../redux/slice/authSlice';
import toast from 'react-hot-toast';
import { Envelope, PaperPlaneTilt, ArrowLeft } from "@phosphor-icons/react";
import { Link } from 'react-router-dom';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const dispatch = useDispatch();
    const { loading } = useSelector((state) => state.auth);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const result = await dispatch(forgotPassword(email));
        if (forgotPassword.fulfilled.match(result)) {
            toast.success("Reset link send to your email!");
        } else {
            toast.error(result.payload);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-6 bg-[#020617]">
            <div className="max-w-md w-full bg-white/5 border border-white/10 p-10 rounded-[3rem] backdrop-blur-xl text-center">
                <div className="h-16 w-16 bg-[#c4ff00] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#c4ff00]/20">
                    <PaperPlaneTilt size={32} weight="bold" className="text-black" />
                </div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Forgot Password?</h2>
                <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-widest font-bold">We'll send you a reset link</p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Email Address</label>
                        <div className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                            <Envelope size={22} className="text-gray-500" />
                            <input 
                                type="email" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                className="bg-transparent outline-none w-full text-sm font-bold text-white"
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="w-full py-5 bg-[#c4ff00] rounded-2xl font-black text-black uppercase tracking-widest hover:bg-[#d4ff33] transition-all active:scale-95 disabled:opacity-50">
                        {loading ? "Sending..." : "Send Reset Link"}
                    </button>
                </form>

                <Link to="/login" className="mt-8 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
                    <ArrowLeft size={14} weight="bold" /> Back to Login
                </Link>
            </div>
        </div>
    );
};

export default ForgotPassword;