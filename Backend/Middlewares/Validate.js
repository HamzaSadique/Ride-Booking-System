export const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        const msg = error.details.map(el => el.message).join(',');
        return res.status(400).json({ success: false, message: msg });
    }
    next();
};