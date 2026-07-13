import React from 'react';
import { Link } from 'react-router-dom';
import { 
  FacebookLogo, 
  InstagramLogo, 
  TwitterLogo, 
  LinkedinLogo, 
  GithubLogo, 
  PaperPlaneTilt,
  MapPin,
  Phone,
  Envelope
} from "@phosphor-icons/react";

const Footer = () => {
  return (
    <footer className="bg-[#020617] border-t border-white/5 pt-20 pb-10 px-6 relative overflow-hidden">
      {/* Background Subtle Glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-500px h-200px bg-[#c4ff00]/5 blur-[120px] rounded-full"></div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10">
        
        {/* Brand Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-[#c4ff00] rounded-xl flex items-center justify-center rotate-3">
              <span className="text-black font-black text-xl italic">R</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic">Ride<span className="text-[#c4ff00]">Hub</span></h2>
          </div>
          <p className="text-gray-500 text-sm font-medium leading-relaxed">
            Revolutionizing the way you travel. Safe, fast, and reliable rides at your fingertips. Your journey, our priority.
          </p>
          <div className="flex gap-4">
            {[FacebookLogo, InstagramLogo, TwitterLogo, LinkedinLogo].map((Icon, idx) => (
              <a key={idx} href="#" className="p-3 bg-white/5 rounded-xl text-gray-400 hover:text-[#c4ff00] hover:bg-white/10 transition-all active:scale-90">
                <Icon size={20} weight="fill" />
              </a>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] mb-8">Navigation</h3>
          <ul className="space-y-4">
            {['Home', 'About Us', 'Services', 'Partners', 'Careers'].map((link) => (
              <li key={link}>
                <Link to={`/${link.toLowerCase().replace(' ', '-')}`} className="text-gray-500 hover:text-[#c4ff00] text-sm font-bold transition-colors flex items-center gap-2 group">
                  <span className="h-1px w-0 bg-[#c4ff00] group-hover:w-4 transition-all"></span>
                  {link}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact Info */}
        <div>
          <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] mb-8">Get in Touch</h3>
          <ul className="space-y-6">
            <li className="flex items-start gap-4">
              <MapPin size={22} weight="duotone" className="text-[#c4ff00] mt-1" />
              <p className="text-gray-500 text-sm font-bold">Gulberg III, Lahore,<br /> Punjab, Pakistan</p>
            </li>
            <li className="flex items-center gap-4">
              <Phone size={22} weight="duotone" className="text-[#c4ff00]" />
              <p className="text-gray-500 text-sm font-bold">+92 300 1234567</p>
            </li>
            <li className="flex items-center gap-4">
              <Envelope size={22} weight="duotone" className="text-[#c4ff00]" />
              <p className="text-gray-500 text-sm font-bold">support@ridehub.dev</p>
            </li>
          </ul>
        </div>

        {/* Newsletter */}
        <div className="space-y-6">
          <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] mb-2">Newsletter</h3>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Stay updated with latest offers</p>
          <div className="relative">
            <input 
              type="email" 
              placeholder="Your email" 
              className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-white text-sm font-bold outline-none focus:border-[#c4ff00]/50 transition-all pr-12"
            />
            <button className="absolute right-2 top-2 h-10 w-10 bg-[#c4ff00] rounded-xl flex items-center justify-center text-black hover:bg-[#d4ff33] transition-all active:scale-95">
              <PaperPlaneTilt size={20} weight="bold" />
            </button>
          </div>
        </div>

      </div>

      {/* Bottom Bar */}
      <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
        <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest">
          © 2026 RideHub Technologies. All Rights Reserved.
        </p>
        <div className="flex gap-8">
          <Link to="/privacy" className="text-gray-600 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="text-gray-600 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">Terms of Service</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;