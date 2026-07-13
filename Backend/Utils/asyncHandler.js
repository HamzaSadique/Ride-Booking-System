// Ye ek function hai jo aapke controller ko argument leta hai
const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next))
        .catch((err) => next(err)); // Agar error aaye to seedha global error handler ko bhej do
    };
};

export { asyncHandler };