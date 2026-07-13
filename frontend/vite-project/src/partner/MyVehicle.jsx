import React, { useEffect, useState } from "react";
import { 
  Car, Notepad, CloudArrowUp, CheckCircle, 
  XCircle, Clock, PencilLine, Eye, ArrowLeft 
} from "@phosphor-icons/react";
import API from "../api/axios";
import toast from "react-hot-toast";

const MyVehicle = () => {
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({ 
    vehicleModel: "", 
    vehicleNumber: "", // 🚨 FIX: licenseNumber ko vehicleNumber kar diya database sync ke liye
    vehicleType: "car",
    brand: "" 
  });
  const [files, setFiles] = useState({ vehicleImage: null, registrationBook: null });
  const [previews, setPreviews] = useState({ vehicleImage: null, registrationBook: null });

  const fetchVehicle = async () => {
    try {
      // 🔍 Backend se direct PartnerProfile ka telemetry status data mangwayein
      const { data } = await API.get("/partner/kyc-status");
      
      if (data.data) {
        const profileData = data.data;
        setVehicle(profileData);
        
        setFormData({
          vehicleModel: profileData.vehicleModel || "",
          vehicleNumber: profileData.vehicleNumber || "", // 🚨 FIX: direct flat schema key mapping
          vehicleType: profileData.vehicleType || "car",
          brand: profileData.brand || ""
        });
      }
    } catch (err) {
      console.error("Fetch Error:", err);
      setVehicle(null);
    } finally { 
      setTimeout(() => setLoading(false), 800); 
    }
  };

  useEffect(() => { fetchVehicle(); }, []);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFiles({ ...files, [e.target.name]: file });
      setPreviews({ ...previews, [e.target.name]: URL.createObjectURL(file) });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    
    // 🚨 FIX LAYER: Append straight backend keys
    data.append("vehicleModel", formData.vehicleModel);
    data.append("vehicleNumber", formData.vehicleNumber);
    data.append("vehicleType", formData.vehicleType);
    data.append("brand", formData.brand);
    data.append("currentStep", "5"); // Next step register processing trigger

    if (files.vehicleImage) data.append("vehicleImage", files.vehicleImage);
    if (files.registrationBook) data.append("registrationBook", files.registrationBook);

    setSubmitting(true);
    try {
      await API.post("/partner/submit-kyc", data, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      toast.success("Vehicle Asset Synced Successfully!");
      setIsEditing(false);
      fetchVehicle();
    } catch (err) {
      toast.error(err.response?.data?.message || "Action failed");
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12 animate-pulse">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-start mb-12 border-b border-white/5 pb-6">
            <div className="space-y-3">
              <div className="h-12 w-64 bg-white/5 rounded-xl"></div>
              <div className="h-3 w-40 bg-white/5 rounded-md"></div>
            </div>
            <div className="h-10 w-28 bg-white/5 rounded-xl"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 h-380px bg-white/5 border border-white/5 rounded-[3.5rem] p-10 flex flex-col justify-end space-y-4">
              <div className="h-6 w-24 bg-white/5 rounded-md"></div>
              <div className="h-14 w-80 bg-white/5 rounded-2xl"></div>
              <div className="h-4 w-48 bg-white/5 rounded-md"></div>
            </div>
            <div className="lg:col-span-4 space-y-4">
              <div className="h-24 bg-white/5 border border-white/5 rounded-3xl"></div>
              <div className="h-60 bg-white/5 border border-white/5 rounded-[2.5rem]"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if driver has car fields in profile database layout
  const hasVehicle = vehicle && vehicle.vehicleModel;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        
        {/* --- Header --- */}
        <div className="flex justify-between items-start mb-12 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-none">
              My <span className="text-[#c4ff00]">{isEditing ? "Editor" : "Garage"}</span>
            </h1>
            <p className="text-gray-500 text-[10px] uppercase tracking-[0.4em] mt-3 font-bold italic">
              {hasVehicle ? `// Status: ${vehicle.vehicleStatus || 'pending'}` : "// Deploy your first vehicle"}
            </p>
          </div>
          {isEditing && (
            <button onClick={() => setIsEditing(false)} className="p-4 bg-white/5 rounded-2xl hover:text-red-500 transition-colors">
              <ArrowLeft size={24} weight="bold" />
            </button>
          )}
        </div>

        {/* --- Logic UI Renderer --- */}
        {(!hasVehicle || isEditing) ? (
          
          /* --- VIEW 1: ADD / EDIT FORM --- */
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-10 bg-[#0a0a0a] border border-white/5 p-8 md:p-12 rounded-[3rem] shadow-2xl">
            <div className="space-y-6">
              <h3 className="text-[#c4ff00] text-[10px] font-black uppercase tracking-widest italic">// Specifications</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Brand" name="brand" value={formData.brand} onChange={(v)=>setFormData({...formData, brand: v})} />
                <Input label="Model" name="vehicleModel" value={formData.vehicleModel} onChange={(v)=>setFormData({...formData, vehicleModel: v})} />
              </div>
              <Input label="Plate Number" name="vehicleNumber" value={formData.vehicleNumber} onChange={(v)=>setFormData({...formData, vehicleNumber: v})} />
              <select 
                value={formData.vehicleType}
                onChange={(e)=>setFormData({...formData, vehicleType: e.target.value})} 
                className="w-full bg-white/5 border border-white/5 p-5 rounded-2xl outline-none text-gray-400 font-bold uppercase text-sm focus:border-[#c4ff00]/40 transition-all"
              >
                <option value="car">Car</option>
                <option value="bike">Bike</option>
                <option value="rickshaw">Rickshaw</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <UploadBox label="Vehicle Photo" name="vehicleImage" preview={previews.vehicleImage || vehicle?.vehicleImage} onChange={handleFile} />
               <UploadBox label="Reg Book" name="registrationBook" preview={previews.registrationBook || vehicle?.registrationBook} onChange={handleFile} />
               <button type="submit" disabled={submitting} className="col-span-2 bg-[#c4ff00] text-black h-20 rounded-3xl font-black uppercase italic tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 shadow-[0_10px_30px_rgba(196,255,0,0.15)]">
                {submitting ? "Processing Asset..." : isEditing ? "Save Corrections" : "Deploy Vehicle"}
               </button>
            </div>
          </form>

        ) : (

          /* --- VIEW 2: DISPLAY GARAGE --- */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 bg-[#0a0a0a] border border-white/5 rounded-[3.5rem] overflow-hidden relative shadow-2xl group">
              <div className="aspect-video bg-white/5">
                {vehicle.vehicleImage ? (
                  <img src={vehicle.vehicleImage} className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-700" alt="Vehicle" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700 bg-white/5"><Car size={64} /></div>
                )}
              </div>
              <div className="absolute inset-0 bg-linear-to-t from-black via-black/70 to-transparent p-10 flex flex-col justify-end">
                <div className="flex justify-between items-end z-10">
                   <div>
                    {/* 🚨 FIX: vehicle.status ki jagah vehicle.vehicleStatus read karein */}
                    <div className={`mb-4 px-4 py-1.5 rounded-full border text-[8px] font-black uppercase tracking-widest inline-flex items-center gap-2 
                      ${vehicle.vehicleStatus === 'approved' ? 'border-[#c4ff00] text-[#c4ff00]' : vehicle.vehicleStatus === 'rejected' ? 'border-red-500 text-red-500' : 'border-orange-500 text-orange-500'}`}>
                      {vehicle.vehicleStatus === 'approved' ? <CheckCircle size={12} weight="fill" /> : vehicle.vehicleStatus === 'rejected' ? <XCircle size={12} weight="fill" /> : <Clock size={12} className="animate-spin" />}
                      {vehicle.vehicleStatus || 'pending'}
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black uppercase italic leading-tight text-white drop-shadow-md">
                      {vehicle.brand || "HONDA"} <br/>
                      <span className="text-[#c4ff00]">{vehicle.vehicleType || "UNKNOWN TYPE"}</span>
                    </h2>
                    <p className="text-white/60 text-xs font-bold uppercase mt-1">Model: {vehicle.vehicleModel || "NOT PROVIDED"}</p>
                   </div>
                   <div className="text-right">
                      <p className="text-[#c4ff00] text-[10px] font-black uppercase italic mb-1 tracking-widest">Plate ID</p>
                      <p className="text-2xl md:text-3xl font-black italic tracking-tighter text-[#c4ff00] bg-black/40 px-3 py-1 rounded-xl border border-[#c4ff00]/20">
                        {vehicle.vehicleNumber || "NO NUM"}
                      </p>
                   </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-4">
              {vehicle.registrationBook && (
                <DocView label="Registration Certificate" url={vehicle.registrationBook} />
              )}
              
              <div className={`p-8 rounded-[2.5rem] border ${vehicle.vehicleStatus === 'rejected' ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/10'}`}>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#c4ff00] mb-4 italic">// System Response</h4>
                <p className="text-[10px] text-gray-400 leading-relaxed font-bold uppercase italic">
                  {vehicle.vehicleStatus === 'rejected' ? (
                    <span className="text-red-400">"{vehicle.rejectionReason || "Details mismatch. Please re-upload documents."}"</span>
                  ) : (
                    "Your vehicle data is dynamically sync-locked. Changes are disabled during validation."
                  )}
                </p>
                
                <button 
                  onClick={() => setIsEditing(true)}
                  disabled={vehicle.vehicleStatus !== 'rejected'}
                  className={`w-full mt-8 py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3
                    ${vehicle.vehicleStatus === 'rejected' 
                      ? "bg-white text-black hover:bg-[#c4ff00] hover:scale-105" 
                      : "bg-white/5 text-gray-700 cursor-not-allowed border border-white/5"}`}
                >
                  <PencilLine size={18} weight="bold" />
                  {vehicle.vehicleStatus === 'rejected' ? "Fix Details" : "Edit Locked"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Input = ({ label, placeholder, name, value, onChange }) => (
  <div className="space-y-2 flex-1">
    <p className="text-[8px] font-black uppercase text-gray-600 tracking-widest ml-2">{label}</p>
    <input 
      required 
      placeholder={placeholder} 
      name={name} 
      value={value}
      onChange={(e) => onChange(e.target.value)} 
      className="w-full bg-white/5 border border-white/5 p-4 rounded-xl outline-none focus:border-[#c4ff00]/40 transition-all uppercase font-bold text-xs text-white" 
    />
  </div>
);

const UploadBox = ({ label, preview, onChange, name }) => (
  <div className="relative h-44 bg-white/5 border-2 border-dashed border-white/10 rounded-2rem overflow-hidden group hover:border-[#c4ff00]/30 transition-all">
    {preview ? <img src={preview} className="w-full h-full object-cover" alt={label} /> : 
    <div className="flex flex-col items-center justify-center h-full text-gray-600 group-hover:text-white transition-colors">
      <CloudArrowUp size={32} />
      <p className="text-[8px] font-black uppercase mt-3 tracking-widest">{label}</p>
    </div>}
    <input type="file" name={name} onChange={onChange} className="absolute inset-0 opacity-0 cursor-pointer" />
  </div>
);

const DocView = ({ label, url }) => (
  <div className="p-6 bg-[#0a0a0a] border border-white/5 rounded-3xl flex items-center justify-between group hover:border-[#c4ff00]/20 transition-all">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-gray-500 group-hover:text-[#c4ff00] transition-colors"><Notepad size={22} /></div>
      <div>
        <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-1">{label}</p>
        <p className="text-[10px] font-bold text-white uppercase italic">verified_file.png</p>
      </div>
    </div>
    <button onClick={() => window.open(url, "_blank")} className="p-3 bg-white/5 rounded-xl hover:bg-[#c4ff00] hover:text-black transition-all"><Eye size={20} weight="bold" /></button>
  </div>
);

export default MyVehicle;