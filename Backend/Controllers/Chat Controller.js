import { Chat } from "../Models/ChatModel.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiResponse } from "../Utils/ApiResponse.js";

export const getChatHistory = asyncHandler(async (req, res) => {
    const { rideId } = req.params;

    // Is ride ki saari chat nikaalo aur purani se nayi ki taraf sort karo
    const history = await Chat.find({ rideId }).sort({ createdAt: 1 });

    return res.status(200).json(
        new ApiResponse(200, history, "Chat history fetched successfully")
    );
});