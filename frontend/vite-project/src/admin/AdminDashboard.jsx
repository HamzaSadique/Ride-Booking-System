import React, { useEffect, useState, useCallback } from "react";
import { Users, SteeringWheel, MapPin, Eye, ShieldCheck, Notepad } from "@phosphor-icons/react";
import API from "../api/axios";
import toast from "react-hot-toast";

// --- MODERN SKELETON COMPONENTS ---
const SkeletonCard = () => (
  <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between animate-pulse">
    <div className="space-y-3 w-1/2">
      <div className="h-2.5 bg-white/10 rounded-full w-2/3"></div>
      <div className="h-8 bg-white/10 rounded-xl w-1/3"></div>
    </div>
    <div className="h-14 w-14 bg-white/5 rounded-2xl"></div>
  </div>
);

const SkeletonDashboard = () => (
  <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12 animate-in fade-in duration-300">
    <div className="max-w-7xl mx-auto space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((n) => <SkeletonCard key={n} />)}
      </div>
    </div>
  </div>
);

// --- MAIN PANEL COMPONENT ---
const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [partnersList, setPartnersList] = useState([]); // Will hold unverified/pending/rejected ones
  const [verifiedPartnersList, setVerifiedPartnersList] = useState([]); // Will hold explicitly approved ones
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [partnerFilter, setPartnerFilter] = useState("pending"); // Default view set to pending
  
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedPartner, setSelectedPartner] = useState(null);

  // Core Data Fetch Matrix matching exact original backend pipelines
  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      
      // 1. Stats Data Fetch
      const statsRes = await API.get("/admin/dashboard"); 
      setData(statsRes.data.data);

      // 2. All Users Pipeline
      try {
        const usersRes = await API.get("/admin/all-users");
        setUsersList(usersRes.data.data || []);
      } catch (error) { console.error("User route sync error:", error); }

      // 3. Unverified / Pending KYC Requests (Backend function #2)
      try {
        const kycRes = await API.get("/admin/kyc-requests");
        setPartnersList(kycRes.data.data || []);
      } catch (error) { console.error("KYC request route sync error:", error); }

      // 4. Approved Partners Pipeline (Backend function #5)
      try {
        const verifiedRes = await API.get("/admin/verified-partners");
        setVerifiedPartnersList(verifiedRes.data.data || []);
      } catch (error) { console.error("Verified routes sync error:", error); }

    } catch (error) {
      console.error("Admin Dashboard Fetch Error:", error);
      toast.error("Telemetry failure: Control frame dropped.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchAdminData(); 
  }, [fetchAdminData]);

  // Regular Step Actions (Backend function #1 matching parameter)
  const handleVerification = async (partnerProfileId, status) => {
    if (status === "rejected" && !rejectionReason) {
      return toast.error("Please specify a reason for rejection.");
    }

    try {
      // Direct call mapping to updateKYCStatus backend controller
      await API.put(`/admin/verify-partner/${partnerProfileId}`, { 
        status: status === "approved" ? "APPROVED" : "REJECTED", // Matching backend STATUS.constants
        rejectionReason,
        currentStep: selectedPartner?.currentStep || 1
      });
      
      toast.success(`State updated successfully to: ${status}`);
      setRejectionReason("");
      setSelectedPartner(null);
      fetchAdminData(); 
    } catch (err) {
      toast.error(err.response?.data?.message || "Modification failed.");
    }
  };

  // Document/Data Modification Trigger (Backend function #6)
  const handleForceDataChange = async (partnerId, targetStep) => {
    try {
      await API.put(`/admin/request-update/${partnerId}`, {
        reason: rejectionReason || "Admin requested vehicle/license document update.",
        stepToReset: targetStep
      });

      toast.success(`Rollback operation successful! Moved to Step ${targetStep}`);
      setRejectionReason("");
      setSelectedPartner(null);
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not push change request.");
    }
  };

  // ✨ SMART FRONTEND COMPONENT FILTERING: 
  // Mixes both separate API arrays seamlessly into a single tab interface
  const getDisplayPartners = () => {
    if (partnerFilter === "approved") {
      return verifiedPartnersList;
    }
    if (partnerFilter === "all") {
      return [...partnersList, ...verifiedPartnersList];
    }
    // Returns pending or rejected variants from the core kyc array
    return partnersList.filter(p => p.status?.toLowerCase() === partnerFilter.toLowerCase());
  };

  const displayList = getDisplayPartners();

  if (loading) return <SkeletonDashboard />;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12 selection:bg-[#c4ff00] selection:text-black">
      <div className="max-w-7xl mx-auto">

        {/* Control Terminal Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-4">
          <div>
            <h1 className="text-5xl font-black uppercase italic tracking-tighter">
              Control <span className="text-[#c4ff00]">Center</span>
            </h1>
            <p className="text-gray-500 text-[10px] uppercase tracking-[0.4em] mt-2 font-bold">// System Administrator Panel</p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md">
            {["overview", "users", "partners"].map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                    isActive ? "bg-[#c4ff00] text-black shadow-lg" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab === "partners" ? "partners / kyc" : tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* OVERVIEW CONTENT */}
        {activeTab === "overview" && data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <StatCard title="Total Users" count={data?.users?.total || 0} icon={Users} color="text-blue-500" />
            <StatCard title="Total Partners" count={data?.partners?.total || 0} icon={SteeringWheel} color="text-[#c4ff00]" />
            <StatCard title="Live Rides" count={data?.financials?.totalRides || 0} icon={MapPin} color="text-purple-500" />
          </div>
        )}

        {/* USERS TABLE */}
        {activeTab === "users" && (
          <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in fade-in duration-300">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                  <th className="p-6">User Identity</th>
                  <th className="p-6">Role Matrix</th>
                  <th className="p-6 text-right">Lifecycle Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {usersList.map((u) => (
                  <tr key={u._id} className="hover:bg-white/0.01 transition-colors">
                    <td className="p-6 font-bold uppercase tracking-wide">
                      {u.name} <span className="text-gray-500 text-xs block normal-case font-normal mt-1">{u.email}</span>
                    </td>
                    <td className="p-6">
                      <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-[9px] font-black rounded-lg uppercase tracking-widest border border-blue-500/20">
                        {u.role || "user"}
                      </span>
                    </td>
                    <td className="p-6 text-right font-black text-xs text-[#c4ff00]">
                      {u.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* KYC CONTROL SYSTEM */}
        {activeTab === "partners" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            
            {/* Status Tabs Subnavigation */}
            <div className="flex gap-2 bg-white/5 p-1 rounded-xl w-fit border border-white/5">
              {["all", "pending", "approved", "rejected"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setPartnerFilter(filter); setSelectedPartner(null); }}
                  className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                    partnerFilter === filter ? "bg-white/10 text-[#c4ff00]" : "text-gray-500 hover:text-white"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column List */}
              <div className="lg:col-span-1 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-4">// Compliance Queue</h3>
                {displayList.length > 0 ? (
                  displayList.map((p) => {
                    const isTarget = selectedPartner?._id === p._id;
                    return (
                      <div
                        key={p._id}
                        onClick={() => { setSelectedPartner(p); setRejectionReason(""); }}
                        className={`p-5 rounded-3xl border cursor-pointer transition-all duration-300 ${
                          isTarget ? "bg-[#c4ff00]/5 border-[#c4ff00]" : "bg-[#0a0a0a] border-white/5"
                        }`}
                      >
                        <p className="font-black uppercase text-sm italic tracking-wide">{p.user?.name || "Partner Account"}</p>
                        <div className="flex justify-between items-center mt-3 border-t border-white/5 pt-2 text-[9px]">
                          <span className="text-gray-500 font-bold uppercase">Current Gate:</span>
                          <span className="font-black text-gray-400">Step {p.currentStep || 1}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1 text-[9px]">
                          <span className="text-gray-500 font-bold uppercase">Status State:</span>
                          <span className={`font-black uppercase tracking-widest ${
                            p.status === 'approved' || p.isVerified ? 'text-[#c4ff00]' : 'text-orange-500'
                          }`}>{p.status || (p.isVerified ? "approved" : "pending")}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-gray-500 italic ml-4 py-2">// No partners matching this status filter filter.</p>
                )}
              </div>

              {/* Right Column Details Viewer */}
              <div className="lg:col-span-2">
                {selectedPartner ? (
                  <div className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 space-y-8 shadow-2xl">
                    <div className="flex justify-between items-center border-b border-white/5 pb-6">
                      <div>
                        <h2 className="text-2xl font-black uppercase italic tracking-tight">{selectedPartner.user?.name}</h2>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                          License Core Index: {selectedPartner.licenseNumber || "Not Linked"}
                        </p>
                      </div>
                      <span className="text-xs bg-white/5 border border-white/10 px-4 py-2 rounded-xl uppercase font-black text-[#c4ff00]">
                        {selectedPartner.vehicleType || "Asset Node"}
                      </span>
                    </div>

                    {/* Document Grid Mapping matching original backend profile keys */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <DocRow label="Profile Avatar Scan" url={selectedPartner.profilePic} />
                      <DocRow label="Vehicle Profile Asset Scan" url={selectedPartner.vehicleImage} />
                      <DocRow label="Official Registration Paperwork" url={selectedPartner.registrationBook} />
                      <DocRow label="National CNIC Front Scan" url={selectedPartner.cnicFront} />
                      <DocRow label="National CNIC Back Scan" url={selectedPartner.cnicBack} />
                      <DocRow label="Driving License Front Identity Node" url={selectedPartner.licenseFront} />
                    </div>

                    {/* Actions Panel */}
                    <div className="pt-6 border-t border-white/5 space-y-4">
                      <div className="bg-white/5 border border-white/5 p-1 rounded-2xl">
                        <input
                          placeholder="SPECIFY REJECTION REASON / UPDATE DIRECTIVES"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className="w-full bg-transparent p-4 outline-none text-xs font-bold uppercase text-white tracking-wide placeholder:text-gray-700"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => handleVerification(selectedPartner._id, "rejected")}
                          className="py-4 bg-red-600/10 border border-red-600/20 text-red-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-600 hover:text-white transition-all"
                        >
                          Reject Step
                        </button>
                        <button
                          onClick={() => handleVerification(selectedPartner._id, "approved")}
                          className="py-4 bg-[#c4ff00] text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#b0e600] transition-all"
                        >
                          Approve / Next Step
                        </button>
                      </div>

                      {/* REQUEST MODIFICATIONS SELECTION */}
                      <div className="pt-4 mt-2 border-t border-dashed border-white/5 space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-yellow-500 flex items-center gap-1">
                          ⚡ Request Document Modification (Force Back to Step Mode)
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => handleForceDataChange(selectedPartner._id, 1)}
                            className="py-2.5 bg-yellow-500/5 border border-yellow-500/10 text-yellow-500 rounded-xl font-black uppercase text-[8px] tracking-wider hover:bg-yellow-500 hover:text-black transition-all"
                          >
                            Reset Pic (Step 1)
                          </button>
                          <button
                            onClick={() => handleForceDataChange(selectedPartner._id, 2)}
                            className="py-2.5 bg-orange-500/5 border border-orange-500/10 text-orange-500 rounded-xl font-black uppercase text-[8px] tracking-wider hover:bg-orange-500 hover:text-white transition-all"
                          >
                            Reset CNIC (Step 2)
                          </button>
                          <button
                            onClick={() => handleForceDataChange(selectedPartner._id, 3)}
                            className="py-2.5 bg-red-500/5 border border-red-500/10 text-red-400 rounded-xl font-black uppercase text-[8px] tracking-wider hover:bg-red-500 hover:text-white transition-all"
                          >
                            Reset License/Vehicle (Step 3)
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-400px border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center p-20 text-gray-600">
                    <ShieldCheck size={48} className="mb-4 text-gray-800 animate-pulse" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-center">// Select identity from queue map to view files</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// --- presentation cards ---
// eslint-disable-next-line no-unused-vars
const StatCard = React.memo(({ title, count, icon: Icon, color }) => (
  <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between shadow-xl group hover:border-white/10 transition-all duration-300">
    <div>
      <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-2">{title}</p>
      <h3 className="text-4xl font-black italic tracking-tighter group-hover:text-[#c4ff00]">{count}</h3>
    </div>
    <div className={`p-4 bg-white/5 rounded-2xl ${color}`}>
      <Icon size={28} weight="duotone" />
    </div>
  </div>
));
StatCard.displayName = "StatCard";

const DocRow = React.memo(({ label, url }) => {
  if (!url) return null;
  return (
    <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-[#c4ff00]/20 transition-all">
      <div className="w-2/3">
        <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-1">{label}</p>
        <p className="text-[10px] font-bold uppercase text-white/70 truncate">cloud_asset.png</p>
      </div>
      <button 
        onClick={() => window.open(url, "_blank")} 
        className="p-3 bg-white/5 rounded-xl hover:bg-[#c4ff00] hover:text-black transition-all"
      >
        <Eye size={16} weight="bold" />
      </button>
    </div>
  );
});
DocRow.displayName = "DocRow";

export default AdminDashboard;