export const errorMiddleware = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // MongoDB Cast Error (Galat ID format)
    if (err.name === "CastError") {
        statusCode = 400;
        message = `Invalid Resource ID: ${err.value}`;
    }

    // Mongoose Validation Error (Missing fields)
    if (err.name === "ValidationError") {
        statusCode = 400;
        message = Object.values(err.errors).map(val => val.message).join(", ");
    }

    res.status(statusCode).json({
        success: false,
        message: message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : null
    });
};