import { Router } from "express";
import {  
  getAdminStats,  
  getKYCRequests, 
  updateKYCStatus, 
  toggleBlockStatus,
  getVerifiedPartners,
  requestPartnerUpdate,
  getAllUsersWithStats,
  getPartnerDetails

} from "../Controllers/AdminController.js";
import { isAuthenticated, authorizeRoles } from "../Middlewares/authMiddleware.js";
import { ROLES } from "../Utils/constants.js";

const router = Router();

router.use(isAuthenticated, authorizeRoles(ROLES.ADMIN));

// --- Dashboard & Requests ---
router.route("/dashboard").get(getAdminStats);
router.route("/kyc-requests").get(getKYCRequests);
router.route("/all-users").get(getAllUsersWithStats); // isAdmin nikal diya kyunki upar global laga hai
router.route("/partner-details/:partnerId").get(getPartnerDetails); // isAdmin nikal diya kyunki upar global laga hai

// --- Verified Partners Management ---
router.get("/verified-partners", getVerifiedPartners); // isAdmin nikal diya kyunki upar global laga hai
router.put("/request-update/:partnerId", requestPartnerUpdate);

// --- Actions ---
router.route("/update-kyc/:partnerProfileId").put(updateKYCStatus);
router.route("/toggle-block/:id").patch(toggleBlockStatus);

export default router;