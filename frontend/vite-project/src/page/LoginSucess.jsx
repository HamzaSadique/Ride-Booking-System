import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux"; // 1. Dispatch import kiya
import { setCredentials } from "../redux/slice/authSlice"; // 2. Action import kiya

const LoginSuccess = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const dispatch = useDispatch(); // 3. Dispatch initialize kiya

    useEffect(() => {
        const userData = searchParams.get("user");

        if (userData) {
            try {
                // URL se user data nikaala
                const user = JSON.parse(decodeURIComponent(userData));
                
                // ✨ DISPATCH CHALAYA (Redux state update karne ke liye)
                dispatch(setCredentials({ user })); 
                
                // Dashboard par bhej diya
                navigate("/dashboard");
            } catch (error) {
                console.error("Login Error:", error);
                navigate("/login");
            }
        } else {
            navigate("/login");
        }
    }, [searchParams, dispatch, navigate]);

    return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center">
            <div className="text-[#c4ff00] font-black uppercase tracking-widest animate-pulse">
                Processing Login...
            </div>
        </div>
    );
};

export default LoginSuccess;