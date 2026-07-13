import React, { useState } from "react";
import {
  Camera, AddressBook, FileArrowUp, Car, FileText,
  CheckCircle, UserCircle
} from "@phosphor-icons/react";
import toast from "react-hot-toast";
import API from "../api/axios";

const KYCCard = ({ request, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);

  const userData = request.user || {};
  const currentStep = request.currentStep || 1;

  const handleAction = async (status) => {
    if (status === "rejected" && !rejectionReason) {
      return toast.error("Please provide a reason");
    }

    setLoading(true);
    try {
      // FIX: currentStep ko backend par bhej rahe hain bina increment kiye
      // Backend controller khud hi approve hone par step barhaye ga
      await API.put(`/admin/update-kyc/${request._id}`, {
        status, // 'approved' or 'rejected'
        rejectionReason: status === "rejected" ? rejectionReason : "",
        currentStep: currentStep
      });

      toast.success(`Phase ${currentStep} ${status === 'approved' ? 'Verified' : 'Rejected'}`);
      setShowRejectBox(false);
      setRejectionReason(""); // Clear reason
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.message || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const MiniDocItem = ({ url, label, icon: Icon, stepNum }) => {
    const isStepDone = currentStep > stepNum;
    const isStepActive = currentStep === stepNum;

    return (
      <div className={`flex flex-col items-center gap-2 transition-all ${isStepActive ? 'opacity-100 scale-110' : 'opacity-30'}`}>
        <div
          className={`w-14 h-14 rounded-2xl border flex items-center justify-center overflow-hidden relative cursor-pointer
          ${isStepActive ? 'border-[#c4ff00] bg-[#c4ff00]/5 shadow-[0_0_15px_rgba(196,255,0,0.2)]' : isStepDone ? 'border-[#c4ff00]/40' : 'border-white/5'}`}
          onClick={() => url && window.open(url, "_blank")}
        >
          {url ? (
            <img src={url} className="w-full h-full object-cover" alt={label} />
          ) : (
            <Icon size={20} className="text-gray-700" />
          )}

          {isStepDone && (
            <div className="absolute inset-0 bg-[#050505]/40 flex items-center justify-center">
              <CheckCircle size={18} weight="fill" className="text-[#c4ff00]" />
            </div>
          )}
        </div>
        <p className={`text-[7px] font-black uppercase tracking-widest ${isStepActive ? 'text-[#c4ff00]' : 'text-gray-600'}`}>
          {label}
        </p>
      </div>
    );
  };

  return (
    <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-6 flex flex-col shadow-xl hover:border-white/10 transition-all">

      {/* 1. Partner Info */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5">
          <UserCircle size={28} className="text-gray-500" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <h3 className="font-black uppercase italic text-sm truncate text-white">{userData.name || "New Partner"}</h3>
          <p className="text-[9px] text-gray-600 font-bold uppercase truncate">{userData.email}</p>
        </div>
        <div className="bg-[#c4ff00]/10 text-[#c4ff00] px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter">
          Phase {currentStep}
        </div>
      </div>

      {/* 2. Documents Strip */}
      {/* --- Documents Strip (In KYCCard.jsx) --- */}
      <div className="bg-black/40 border border-white/5 rounded-3xl p-4 mb-6 overflow-x-auto no-scrollbar">
        <div className="flex items-center justify-between gap-4">
          {/* Phase 1 */}
          <MiniDocItem stepNum={1} label="Profile" icon={Camera} url={request.profilePic} />

          {/* Phase 2 */}
          <MiniDocItem stepNum={2} label="CNIC F" icon={AddressBook} url={request.cnicFront} />
          <MiniDocItem stepNum={2} label="CNIC B" icon={AddressBook} url={request.cnicBack} />

          {/* Phase 3 */}
          <MiniDocItem stepNum={3} label="License" icon={FileArrowUp} url={request.licenseFront} />

          {/* Phase 4 (✨ Yahan Galti Thi, In ko exactly aise likhein) */}
          <MiniDocItem
            stepNum={4}
            label="Vehicle"
            icon={Car}
            url={request.vehicleImage} // ✅ Schema ke mutabiq
          />
          <MiniDocItem
            stepNum={4}
            label="Reg"
            icon={FileText}
            url={request.registrationBook} // ✅ Schema ke mutabiq
          />
        </div>
      </div>
      {/* 3. Action Buttons */}
      <div className="mt-auto">
        {showRejectBox ? (
          <div className="space-y-3">
            <textarea
              className="w-full bg-white/5 border border-red-500/20 rounded-2xl p-4 text-[11px] text-white outline-none focus:border-red-500/40 min-h-80px"
              placeholder="Why reject? (e.g. Blur image)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleAction("rejected")}
                disabled={loading}
                className="flex-1 bg-red-600 text-white font-black uppercase italic py-3 rounded-xl text-[10px] hover:bg-red-700 transition-colors"
              >
                {loading ? "Processing..." : "Confirm Reject"}
              </button>
              <button
                onClick={() => setShowRejectBox(false)}
                className="px-4 bg-white/5 text-gray-500 font-black uppercase py-3 rounded-xl text-[10px]"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => handleAction("approved")}
              disabled={loading}
              className="flex-2 py-4 rounded-2xl bg-[#c4ff00] text-black font-black text-[10px] uppercase italic tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} weight="bold" />
              {loading ? "Approving..." : `Approve Phase ${currentStep}`}
            </button>
            <button
              onClick={() => setShowRejectBox(true)}
              className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/5 text-red-500 font-black text-[10px] uppercase italic transition-all hover:bg-red-500/10"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default KYCCard;