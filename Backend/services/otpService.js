export const generateOTP = () => {
    // 6-digit random number
    return Math.floor(100000 + Math.random() * 900000).toString();
};

export const getOTPExpiry = (minutes = 10) => {
    // Default 10 mins expiry
    return new Date(Date.now() + minutes * 60 * 1000);
};