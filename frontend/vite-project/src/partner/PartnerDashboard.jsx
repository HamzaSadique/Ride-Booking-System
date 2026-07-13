import React, { useState, useEffect, useCallback } from "react";
import { 
  Camera, AddressBook, FileArrowUp, Car, FileText, 
  CheckCircle, Clock, PaperPlaneRight, XCircle 
} from "@phosphor-icons/react";
import toast from "react-hot-toast";
import API from "../api/axios";

const PartnerDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [initialFetching, setInitialFetching] = useState(true); // ✨ Skeleton Trigger State
  const [kycData, setKycData] = useState(null);
  const [files, setFiles] = useState({});

  // Real Input States
  const [vehicleType, setVehicleType] = useState("car");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");

  const status = kycData?.status || "none";
  const isVerified = kycData?.isVerified || false;
  const currentStep = kycData?.currentStep || 1;

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await API.get("/partner/kyc-status");
      if (data.data) {
        setKycData(data.data);
        setVehicleType(data.data.vehicleType || "car");
        setVehicleModel(data.data.vehicleModel || "");
        setVehicleNumber(data.data.vehicleNumber || "");
      }
    } catch (e) { 
      console.error(e); 
    } finally {
      setInitialFetching(false); // ✅ Turn off skeleton layers
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleFile = (e) => setFiles({ ...files, [e.target.name]: e.target.files[0] });

  const onSubmit = async (e) => {
    e.preventDefault();
    
    if (!isVerified && (!vehicleModel || !vehicleNumber)) {
      return toast.error("Please enter vehicle Model and Plate Number.");
    }

    setLoading(true);
    const data = new FormData();
    
    // Append Files securely
    Object.keys(files).forEach(k => { if (files[k]) data.append(k, files[k]); });
    
    // Append Vehicle Metadata safely
    data.append("vehicleType", vehicleType);
    data.append("vehicleModel", vehicleModel);
    data.append("vehicleNumber", vehicleNumber);

    try {
      // 🚨 REAL ENGINE BUG FIX: Explicitly enforce Multipart Content-Type Boundary
      await API.post("/partner/submit-kyc", data, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      toast.success("KYC Assets Deployed Successfully!");
      setFiles({});
      fetchStatus();
    } catch (err) { 
      toast.error(err.response?.data?.message || "Upload Failed"); 
    } finally { setLoading(false); }
  };

  // eslint-disable-next-line no-unused-vars
  const DocItem = ({ name, label, icon: Icon, statusField, stepNum }) => {
    const isAlreadyUploaded = kycData && kycData[name];
    const itemStatus = kycData ? kycData[statusField] : "pending"; 
    const isStepRejected = status === "rejected" && currentStep === stepNum;
    const isStepApproved = itemStatus === "approved" || currentStep > stepNum;
    const isLocked = (status === "pending" && !isStepRejected) || isVerified || isStepApproved;

    // ✨ Professional Asset Box Skeleton Component
    if (initialFetching) {
      return (
        <div className="flex flex-col items-center min-w-150px">
          <div className="w-28 h-28 rounded-[2.5rem] bg-white/5 border border-white/5 animate-pulse flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse" />
          </div>
          <div className="h-2 w-16 bg-white/5 rounded mt-4 animate-pulse" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center min-w-150px group">
        <label className={`relative transition-all ${isLocked ? 'cursor-not-allowed opacity-44 grayscale' : 'cursor-pointer hover:scale-105'}`}>
          {!isLocked && <input type="file" name={name} className="hidden" onChange={handleFile} />}
          
          <div className={`w-28 h-28 rounded-[2.5rem] border-2 flex items-center justify-center overflow-hidden transition-all duration-300
            ${files[name] ? 'border-[#c4ff00] bg-[#c4ff00]/10 shadow-[0_0_20px_rgba(196,255,0,0.2)]' :
              isStepRejected ? 'border-red-600 bg-red-600/10 shadow-[0_0_15px_rgba(220,38,38,0.3)] animate-pulse' :
              isStepApproved ? 'border-[#c4ff00]/30 bg-[#c4ff00]/5' : 
              'border-white/10 bg-white/5 hover:border-[#c4ff00]/40'}`}>

            {files[name] ? (
              <img src={URL.createObjectURL(files[name])} className="w-full h-full object-cover" alt="" />
            ) : isAlreadyUploaded ? (
              <div className="relative w-full h-full">
                 <img src={kycData[name]} className="w-full h-full object-cover opacity-20" alt="" />
                 <div className="absolute inset-0 flex items-center justify-center">
                    {isStepApproved ? <CheckCircle size={32} weight="fill" className="text-[#c4ff00]" /> : 
                     isStepRejected ? <XCircle size={32} weight="fill" className="text-red-600" /> : 
                     <Clock size={32} className="text-gray-500" />}
                 </div>
              </div>
            ) : (
              <Icon size={35} className="text-gray-600" />
            )}
          </div>
        </label>
        
        <p className={`text-[9px] mt-4 font-black uppercase tracking-[0.2em] transition-colors ${isStepRejected ? 'text-red-500' : 'text-gray-500 group-hover:text-white'}`}>
          {isStepRejected ? "Re-upload" : label}
        </p>

        {isStepRejected && kycData.rejectionReason && (
          <div className="mt-3 w-full max-w-130px p-2 bg-red-600/5 border border-red-600/20 rounded-xl text-center">
             <p className="text-[8px] text-red-400 leading-tight font-bold italic">"{kycData.rejectionReason}"</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        
        {/* --- Header --- */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 border-b border-white/5 pb-10">
          <div>
            <h1 className="text-5xl font-black uppercase italic tracking-tighter">Partner <span className="text-[#c4ff00]">Portal</span></h1>
            <p className="text-gray-500 text-[9px] uppercase tracking-[0.4em] mt-2 italic">
              {isVerified ? "// Verification Complete" : "// Identity & Vehicle Check"}
            </p>
          </div>

          {initialFetching ? (
            <div className="w-32 h-10 rounded-2xl bg-white/5 animate-pulse" />
          ) : (
            <div className={`px-6 py-3 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest flex items-center gap-3
              ${status === "pending" ? 'border-[#c4ff00] text-[#c4ff00] bg-[#c4ff00]/5' : 
                status === "rejected" ? 'border-red-600 text-red-600 bg-red-600/5' : 'border-white/10 text-gray-500'}`}>
              {status === "pending" && <Clock size={16} className="animate-spin" />}
              {status === "pending" ? "In Review" : status === "rejected" ? "Action Needed" : isVerified ? "Verified" : "New Account"}
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-8">
          
          {/* --- ✨ VEHICLE DATA INPUTS / WITH SKELETON LAYER --- */}
          {initialFetching ? (
            <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-2 w-16 bg-white/5 rounded animate-pulse" />
                  <div className="h-12 w-full bg-white/5 rounded-xl animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            (!isVerified && status !== "pending") && (
              <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-xl">
                <div>
                  <p className="text-[8px] font-black uppercase text-gray-600 tracking-widest mb-2 ml-2">Vehicle Type</p>
                  <select 
                    value={vehicleType} 
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="w-full bg-[#050505] border border-white/5 p-4 rounded-xl outline-none text-gray-400 font-bold uppercase text-xs focus:border-[#c4ff00]/40"
                  >
                    <option value="car">Car</option>
                    <option value="bike">Bike</option>
                    <option value="rickshaw">Rickshaw</option>
                  </select>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase text-gray-600 tracking-widest mb-2 ml-2">Vehicle Model</p>
                  <input 
                    type="text" required placeholder="e.g., Civic 2024" value={vehicleModel} 
                    onChange={(e) => setVehicleModel(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 p-4 rounded-xl outline-none text-white font-bold text-xs uppercase focus:border-[#c4ff00]/40"
                  />
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase text-gray-600 tracking-widest mb-2 ml-2">Plate ID / Number</p>
                  <input 
                    type="text" required placeholder="e.g., LE-14-9923" value={vehicleNumber} 
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 p-4 rounded-xl outline-none text-white font-bold text-xs uppercase focus:border-[#c4ff00]/40"
                  />
                </div>
              </div>
            )
          )}

          {/* --- Documents Scroller --- */}
          <div className="bg-[#0a0a0a] border border-white/5 rounded-[4rem] p-12 md:p-16 shadow-2xl overflow-x-auto no-scrollbar">
            <div className="flex items-start justify-between gap-8 min-w-max">
              <DocItem name="profilePic" statusField="profilePicStatus" stepNum={1} label="01. Profile" icon={Camera} />
              <DocItem name="cnicFront" statusField="cnicStatus" stepNum={2} label="02. CNIC Front" icon={AddressBook} />
              <DocItem name="cnicBack" statusField="cnicStatus" stepNum={2} label="03. CNIC Back" icon={AddressBook} />
              <DocItem name="licenseFront" statusField="licenseStatus" stepNum={3} label="04. License" icon={FileArrowUp} />
              <DocItem name="vehicleImage" statusField="vehicleStatus" stepNum={4} label="05. Vehicle" icon={Car} />
              <DocItem name="registrationBook" statusField="vehicleStatus" stepNum={4} label="06. Reg Book" icon={FileText} />
            </div>
          </div>

          {/* --- Submit Action --- */}
          <div className="flex justify-center">
            {initialFetching ? (
              <div className="w-48 h-14 rounded-2xl bg-white/5 animate-pulse" />
            ) : (
              <button
                type="submit"
                disabled={loading || (status === "pending" && status !== "rejected") || isVerified}
                className={`px-14 py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 transition-all duration-500
                  ${(status === "pending" && status !== "rejected") || isVerified 
                    ? 'bg-white/5 text-gray-700 cursor-not-allowed' 
                    : 'bg-[#c4ff00] text-black hover:shadow-[0_0_40px_rgba(196,255,0,0.4)] hover:-translate-y-1 active:scale-95'}`}
              >
                {loading ? <Clock size={20} className="animate-spin" /> : <PaperPlaneRight size={20} weight="bold" />}
                {status === "rejected" ? "Update Rejected Step" : "Sync Profile"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default PartnerDashboard;