import React, { useEffect, useState } from "react";
import KYCCard from "../admin/KYCCard"; // Path check kar lein
import API from "../api/axios";


const AdminKYCManager = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Data Fetching Logic ---
  const fetchRequests = async () => {
  try {
    setLoading(true);
    // Prefix check karlein (aksar /api/v1/admin/ hota hai)
    const { data } = await API.get("/admin/kyc-requests"); 
    setRequests(data.data); 
  } catch (err) {
    console.error("Fetch Error:", err.response?.data?.message || err.message);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    fetchRequests();
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        
        {/* --- Header --- */}
        <div className="mb-10">
          <h1 className="text-3xl font-black uppercase italic tracking-tighter">
            Verification <span className="text-[#c4ff00]">Queue</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1 uppercase font-bold tracking-widest">
            {requests.length} Pending Partner Requests
          </p>
        </div>

        {/* --- Grid Layout --- */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-96 bg-white/5 rounded-[2.5rem] animate-pulse" />
            ))}
          </div>
        ) : requests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {requests.map((request) => (
              <KYCCard 
                key={request._id} 
                request={request} 
                onUpdate={fetchRequests} // Refresh list after approve/reject
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10">
            <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">No pending KYC requests found.</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminKYCManager;