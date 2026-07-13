import jwt from "jsonwebtoken";

export const googleAuthSuccess = (req, res) => {
    if (req.user) {
        // 1. Token Create karein
        const token = jwt.sign(
            { id: req.user._id, role: req.user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: "1d" }
        );

        // 2. Cookie options
        const cookieOptions = {
            httpOnly: true, 
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax', // Cross-site issues se bachne ke liye
            maxAge: 24 * 60 * 60 * 1000 
        };

        // 3. Cookie set karein
        res.cookie("token", token, cookieOptions);

        // 4. Redirect: User data ko stringify karke URL mein bhej dein taake 
        // Frontend Redux state update kar sake
        const userData = encodeURIComponent(JSON.stringify({
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            avatar: req.user.avatar,
            role: req.user.role
        }));

        res.redirect(`${process.env.CLIENT_URL}/login-success?user=${userData}`);
    } else {
        res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }
};

export const logout = (req, res) => {
    // Passport session khatam karein
    req.logout((err) => {
        if (err) return res.status(500).json({ message: "Logout failed" });
        
        // Cookie saaf karein
        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax'
        });

        res.status(200).json({ success: true, message: "Logged out successfully" });
    });
};