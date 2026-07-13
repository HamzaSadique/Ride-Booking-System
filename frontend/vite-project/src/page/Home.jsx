// src/pages/Home.jsx
import { MapPinAreaIcon, NavigationArrowIcon, PersonSimpleRunIcon, TrainSimpleIcon } from "@phosphor-icons/react";
import React from "react";

const Home = () => {
  return (
    <>
      <div className="relative min-h-[calc(100vh-80px)] bg-[#020617] flex items-center px-6 overflow-hidden">
        {/* Dynamic Background Element */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent opacity-50"></div>

        <div className="relative z-10 mx-auto max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left: Heading */}
          <div className="space-y-6">
            <h1 className="text-7xl xl:text-8xl font-black text-white leading-[0.9] tracking-tighter">
              YOUR PRICE,<br/>
              <span className="text-[#c4ff00]">YOUR RIDE.</span>
            </h1>
            <p className="text-gray-400 text-lg font-medium max-w-md">
              Experience the next generation of ride-hailing. Transparent pricing, top-rated drivers, and instant bookings.
            </p>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                <PersonSimpleRunIcon size={16} className="text-[#c4ff00]" /> 1M+ Users
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                <TrainSimpleIcon size={16} className="text-[#c4ff00]" /> 50+ Cities
              </div>
            </div>
          </div>

          {/* Right: Booking Card (InDrive Style) */}
          <div className="bg-[#0f172a] border border-white/10 p-10 rounded-[3rem] shadow-2xl relative">
            <div className="absolute -top-4 -right-4 bg-[#c4ff00] text-black text-[10px] font-black px-4 py-1.5 rounded-lg shadow-xl uppercase tracking-tighter">
              Fair Price
            </div>

            <div className="space-y-6">
              <div className="relative">
                 {/* Decorative line */}
                <div className="absolute left-23px top-12 bottom-12 w-0.5 bg-dashed border-l border-white/10"></div>
                
                <div className="flex items-center gap-5 bg-white/5 p-5 rounded-2xl border border-white/5 focus-within:border-[#c4ff00]/50 transition-all">
                  <div className="h-3 w-3 rounded-full bg-[#c4ff00]"></div>
                  <input type="text" placeholder="Pickup point" className="bg-transparent w-full outline-none font-bold text-white placeholder:text-gray-600" />
                  <NavigationArrowIcon size={20} className="text-gray-500" weight="bold" />
                </div>

                <div className="mt-4 flex items-center gap-5 bg-white/5 p-5 rounded-2xl border border-white/5 focus-within:border-[#c4ff00]/50 transition-all">
                  <MapPinAreaIcon size={24} weight="fill" className="text-red-500" />
                  <input type="text" placeholder="Drop-off point" className="bg-transparent w-full outline-none font-bold text-white placeholder:text-gray-600" />
                </div>
              </div>

              <div className="flex items-center gap-4 bg-white/5 p-5 rounded-2xl border border-white/5">
                <span className="text-gray-500 font-black text-sm uppercase">Offer Price:</span>
                <input type="text" placeholder="PKR" className="bg-transparent outline-none font-black text-[#c4ff00] text-xl w-full" />
              </div>

              <button className="w-full py-5 bg-[#c4ff00] rounded-2xl font-black text-black flex items-center justify-center gap-3 hover:bg-[#d4ff33] transition-all shadow-lg shadow-[#c4ff00]/10 active:scale-95">
                FIND A DRIVER
              </button>
            </div>
          </div>

        </div>
        
      </div>
      
    </>
  );
};

export default Home;