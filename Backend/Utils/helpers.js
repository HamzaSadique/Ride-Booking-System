/**
 * Response se sensitive fields (password, otp) hatane ke liye
 */
export const removeSensitiveFields = (userObject) => {
    const user = userObject.toObject ? userObject.toObject() : { ...userObject };
    delete user.password;
    delete user.otp;
    delete user.otpExpire;
    return user;
};

/**
 * Phone number format validate karne ke liye (Simple regex)
 */
export const isValidPhone = (phone) => {
    const phoneRegex = /^((\+92)|(0092))-{0,1}\d{3}-{0,1}\d{7}$|^\d{11}$|^\d{4}-\d{7}$/;
    return phoneRegex.test(phone);
};

/**
 * Random string generate karne ke liye (e.g. for referral codes)
 */
export const generateRandomString = (length = 6) => {
    return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
};