import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { resetPassword } from '../redux/slice/authSlice';
import toast from 'react-hot-toast';
import { Lock, ShieldCheck } from "@phosphor-icons/react";

const ResetPassword = () => {
    const { token } = useParams();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { loading } = useSelector((state) => state.auth);

    const handleReset = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) return toast.error("Passwords match nahi ho rahe!");

        const result = await dispatch(resetPassword({ token, password }));
        if (resetPassword.fulfilled.match(result)) {
            toast.success("Password kamyabi se change ho gaya!");
            navigate('/login');
        } else {
            toast.error(result.payload);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-6 bg-[#020617]">
            <div className="max-w-md w-full bg-white/5 border border-white/10 p-10 rounded-[3rem] backdrop-blur-xl">
                <div className="text-center mb-8">
                    <div className="h-16 w-16 bg-[#c4ff00] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <ShieldCheck size={32} weight="bold" className="text-black" />
                    </div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Set New Password</h2>
                </div>

                <form onSubmit={handleReset} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">New Password</label>
                        <div className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                            <Lock size={22} className="text-gray-500" />
                            <input 
                                type="password" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="bg-transparent outline-none w-full text-sm font-bold text-white"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Confirm Password</label>
                        <div className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl focus-within:border-[#c4ff00]/50 transition-all">
                            <Lock size={22} className="text-gray-500" />
                            <input 
                                type="password" 
                                value={confirmPassword} 
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                className="bg-transparent outline-none w-full text-sm font-bold text-white"
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="w-full py-5 bg-[#c4ff00] rounded-2xl font-black text-black uppercase tracking-widest hover:bg-[#d4ff33] transition-all mt-4">
                        {loading ? "Updating..." : "Update Password"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;