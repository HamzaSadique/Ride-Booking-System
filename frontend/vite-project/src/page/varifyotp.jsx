import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { verifyOTP, resendOTP } from '../redux/slice/authSlice'; 
import toast from 'react-hot-toast';
import { ShieldCheck, ArrowClockwise, SteeringWheel } from "@phosphor-icons/react";

const VerifyOtp = () => {
    const [otp, setOtp] = useState('');
    const location = useLocation();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { isLoading } = useSelector((state) => state.auth);

    const email = location.state?.email;

    const triggerVerification = useCallback(async (currentOtp) => {
        if (!currentOtp || currentOtp.length < 6) return;
        
        try {
            console.log("🚀 TRIGGERING VERIFICATION WITH:", currentOtp);
            const resultAction = await dispatch(verifyOTP({ email, otp: currentOtp }));
            
            if (verifyOTP.fulfilled.match(resultAction)) {
                toast.success("Account verified! Now you can login.");
                navigate('/login');
            } else {
                const errorMsg = resultAction.payload?.message || resultAction.payload || "Invalid OTP";
                toast.error(errorMsg);
                setOtp(''); // Clear string input state instantly on failure
            }
        } catch (error) {
            console.error("Verification Error:", error);
            toast.error("Verification failed");
        }
    }, [email, dispatch, navigate]);

    useEffect(() => {
        if (!email) {
            toast.error("Invalid access. Please signup again.");
            navigate('/signup');
        }
    }, [email, navigate]);

    // ✨ AUTO-SUBMIT SYNCHRONIZATION
    useEffect(() => {
        if (otp.length === 6) {
            const t = setTimeout(() => {
                triggerVerification(otp);
            }, 100); // 100ms mini buffer layout sync
            return () => clearTimeout(t);
        }
    }, [otp, triggerVerification]);

    const handleVerify = (e) => {
        e.preventDefault();
        if (otp.length < 6) return toast.error("Please enter 6-digit OTP");
        triggerVerification(otp);
    };

    const handleResend = async () => {
        try {
            setOtp(''); // ✨ CRITICAL FIX: Resend par dabaate hi pehle input box khali hoga
            const resultAction = await dispatch(resendOTP({ email }));
            
            if (resendOTP.fulfilled.match(resultAction)) {
                toast.success("New OTP sent to your email!");
            } else {
                toast.error(resultAction.payload?.message || "Could not resend OTP");
            }
        } catch (error) {
            console.error("Resend OTP Error:", error);
            toast.error("Could not resend OTP");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 transition-all duration-300">
                <div className="max-w-md w-full border border-white/5 bg-white/5 rounded-[3rem] backdrop-blur-xl p-10 flex flex-col items-center gap-4 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                    <div className="h-16 w-16 bg-[#c4ff00] rounded-2xl flex items-center justify-center text-black animate-spin shadow-lg shadow-[#c4ff00]/20">
                        <SteeringWheel size={32} weight="bold" />
                    </div>
                    <div className="text-center space-y-1.5 mt-2">
                        <p className="text-xs font-black uppercase tracking-widest text-[#c4ff00]">Verifying Token Node</p>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.3em]">// Handshaking with secure auth service</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-6 bg-[#020617]">
            <div className="max-w-md w-full bg-white/5 border border-white/10 p-10 rounded-[3rem] backdrop-blur-xl text-center relative overflow-hidden group">
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#c4ff00]/10 blur-[80px] rounded-full" />
                
                <div className="h-16 w-16 bg-[#c4ff00] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#c4ff00]/20 rotate-3 group-hover:rotate-12 transition-all duration-500">
                    <ShieldCheck size={32} weight="bold" className="text-black" />
                </div>
                
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Verify OTP</h2>
                <p className="text-gray-500 text-xs mt-2 uppercase tracking-widest font-bold">
                    Code sent to: <span className="text-white block mt-1 normal-case font-medium opacity-80">{email}</span>
                </p>

                <form onSubmit={handleVerify} className="mt-8 space-y-6">
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength="6"
                        value={otp}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^[0-9\b]+$/.test(val)) {
                                setOtp(val);
                            }
                        }}
                        placeholder="000000"
                        className="w-full bg-white/5 border border-white/5 p-5 rounded-2xl text-center text-3xl font-black tracking-[0.5em] text-[#c4ff00] outline-none focus:border-[#c4ff00]/50 transition-all placeholder:opacity-20"
                        autoFocus
                    />

                    <button
                        type="submit"
                        className="w-full py-5 bg-[#c4ff00] text-black rounded-2xl font-black uppercase tracking-widest hover:bg-[#d4ff33] transition-all shadow-lg active:scale-[0.98]"
                    >
                        Confirm Code
                    </button>
                </form>

                <button 
                    onClick={handleResend}
                    className="mt-6 flex items-center justify-center gap-2 mx-auto text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                >
                    <ArrowClockwise size={14} weight="bold" /> Resend Code
                </button>
            </div>
        </div>
    );
};

export default VerifyOtp;