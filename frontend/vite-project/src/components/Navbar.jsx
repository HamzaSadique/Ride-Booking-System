import { Link, NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../redux/slice/authSlice";
import toast from "react-hot-toast";
import {
  House,
  Car,
  ClockCounterClockwise,
  SteeringWheel,
  User,
  SignOut,
  Layout,
  ShieldCheck,
  Money
} from "@phosphor-icons/react";

const Navbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { user, isAuthenticated } = useSelector((state) => state.auth);

  // --- 1. HAR ROLE KE ALAG LINKS ---
  const userLinks = [
    { name: 'Home', path: '/', icon: <House size={20} weight="duotone" /> },
    { name: 'Book Ride', path: '/bookings', icon: <Car size={20} weight="duotone" /> },
    { name: 'History', path: '/history', icon: <ClockCounterClockwise size={20} weight="duotone" /> },
  ];

  const partnerLinks = [
    { name: 'Partner Home', path: '/partner-dashboard', icon: <House size={20} weight="duotone" /> },
    { name: 'My Vehicle', path: '/my-vehicle', icon: <Car size={20} weight="duotone" /> },
    { name: 'Ride Requests', path: '/ride-requests', icon: <SteeringWheel size={20} weight="duotone" /> },
    { name: 'Earnings', path: '/earnings', icon: <Money size={20} weight="duotone" /> },
  ];

  const adminLinks = [
    { name: 'Admin Stats', path: '/admin/dashboard-stats', icon: <Layout size={20} weight="duotone" /> },
    { name: 'Verify KYC', path: '/admin/verify-kyc', icon: <ShieldCheck size={20} weight="duotone" /> },
  ];

  // --- 2. CONDITION TO SELECT MENU ---
  let activeMenu = [];
  if (isAuthenticated) {
    if (user?.role === 'admin') activeMenu = adminLinks;
    else if (user?.role === 'partner') activeMenu = partnerLinks;
    else activeMenu = userLinks; // Normal User
  } else {
    activeMenu = [{ name: 'Home', path: '/', icon: <House size={20} weight="duotone" /> }];
  }

  const handleLogout = () => {
    dispatch(logout());
    toast.success("Logged out successfully");
    navigate('/login');
  };

  // ✨ Helper to determine exact redirect block based on identity role
  const getTargetDashboard = () => {
    if (user?.role === 'admin') return '/admin/dashboard-stats';
    if (user?.role === 'partner') return '/partner-dashboard';
    return '/dashboard';
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#020617]/90 backdrop-blur-md h-20 flex items-center">
      <div className="mx-auto max-w-7xl px-6 w-full flex justify-between items-center">

        {/* Logo */}
        {/* ✨ Admin redirect check injected to prevent fallback to normal user home */}
        <Link 
          to={user?.role === 'admin' ? '/admin/dashboard-stats' : user?.role === 'partner' ? '/partner-dashboard' : '/'} 
          className="flex items-center gap-3 group"
        >
          <div className="h-10 w-10 bg-[#c4ff00] rounded-xl flex items-center justify-center shadow-lg shadow-[#c4ff00]/20 group-hover:rotate-12 transition-all">
            <SteeringWheel size={26} weight="bold" className="text-black" />
          </div>
          <span className="text-2xl font-black text-white uppercase tracking-tighter">Ride<span className="text-[#c4ff00]">Hub</span></span>
        </Link>

        {/* Dynamic Desktop Menu based on Role */}
        <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10">
          {activeMenu.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) => `flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                isActive ? "bg-[#c4ff00] text-black shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {item.icon} {item.name}
            </NavLink>
          ))}
        </div>

        {/* Right Side - Auth Logic */}
        <div className="flex items-center gap-6">
          {isAuthenticated ? (
            <div className="relative group">
              <button className="flex items-center gap-3 bg-white/5 border border-white/10 pl-1 pr-4 py-1 rounded-2xl hover:bg-white/10 transition-all">
                <div className="h-9 w-9 bg-[#c4ff00] rounded-xl flex items-center justify-center text-black">
                  <User size={22} weight="bold" />
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-[10px] font-black text-white uppercase leading-none">{user?.name}</p>
                  <p className="text-[8px] font-bold text-[#c4ff00] uppercase tracking-tighter mt-1">
                    {/* ✨ Added Admin identity token flag */}
                    {user?.role === 'admin' ? 'Admin Active' : user?.role === 'partner' ? 'Partner Verified' : 'User'}
                  </p>
                </div>
              </button>

              <div className="absolute right-0 mt-3 w-52 bg-[#020617] border border-white/10 rounded-2xl shadow-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                {/* ✨ MAIN FIX: Agar logged-in user admin hai toh "My Dashboard" button hide rahega */}
                {user?.role !== 'admin' && (
                  <Link to={getTargetDashboard()} className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-[#c4ff00] hover:bg-white/5 transition-colors text-[10px] font-black uppercase tracking-widest">
                    <Layout size={18} weight="duotone" /> My Dashboard
                  </Link>
                )}

                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-500/10 transition-colors text-[10px] font-black uppercase tracking-widest ${
                    user?.role !== 'admin' && user?.role !== 'partner' ? "rounded-b-2xl" : "rounded-t-2xl"
                  }`}
                >
                  <SignOut size={18} weight="bold" /> Logout
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-xs font-black text-gray-400 hover:text-[#c4ff00] uppercase tracking-widest">Login</Link>
              <Link to="/signup" className="px-7 py-3 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest hover:bg-[#c4ff00] transition-all">SIGN UP</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;