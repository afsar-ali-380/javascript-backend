import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { generateAccessAndRefreshToken } from "../utils/generateAccessAndRefreshToken.js";
import jwt from "jsonwebtoken";
import {
  registerSchema,
  loginSchema,
} from "../validations/user.validations.js";

const registerUser = asyncHandler(async (req, res) => {
  // 1. Validate input data using Zod
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new ApiError(
      400,
      "Validation Failed",
      parsed.error.flatten().fieldErrors
    );
  }

  const { username, email, fullName, password } = parsed.data;

  // 2. Check if user already exists
  const preUser = await User.findOne({
    $or: [{ username: username.toLowerCase() }, { email }],
  });

  if (preUser) {
    throw new ApiError(409, "User already registered with username or email");
  }

  // 3. Upload avatar image
  const avatarLocalPath = req.files?.avatar?.[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar?.url) {
    throw new ApiError(400, "Failed to upload avatar to cloud");
  }

  // 4. Create new user
  const newUser = await User.create({
    username: username.toLowerCase(),
    email,
    fullName,
    password,
    avatar: avatar.url,
  });

  // 5. Fetch the created user without sensitive fields
  const createdUser = await User.findById(newUser._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while fetching user");
  }

  // 6. Return success response
  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    const { fieldErrors, formErrors } = parsed.error.flatten();
    throw new ApiError(400, "Validation failed", {
      ...fieldErrors,
      formErrors,
    });
  }

  const { username, email, password } = parsed.data;

  const user = await User.findOne({ $or: [{ username }, { email }] });

  if (!user) {
    throw new ApiError(401, "Invalid credentials - user not found");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials - wrong password");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const cookieOptions = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logOutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: undefined },
    },
    { new: true }
  );

  const cookieOptions = {
    httpOnly: true,
    secure: true,
  };

  res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Refresh token missing. Unauthorized access.");
  }

  let decodedToken;
  try {
    decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (error) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decodedToken._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (incomingRefreshToken !== user.refreshToken) {
    throw new ApiError(
      403,
      "Refresh token mismatch. Possibly expired or tampered."
    );
  }

  const { accessToken, refreshToken: newRefreshToken } =
    await generateAccessAndRefreshToken(user._id);

  const loggedInUser = await User.findByIdAndUpdate(
    user._id,
    { refreshToken: newRefreshToken },
    { new: true }
  ).select("-password -refreshToken");

  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  };

  res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", newRefreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken: newRefreshToken },
        "Access and refresh tokens refreshed successfully"
      )
    );
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { currPass, newPass } = req.body;

  if (!currPass || !newPass || !currPass.trim() || !newPass.trim()) {
    throw new ApiError(400, "Both current and new passwords are required.");
  }

  if (newPass.length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters long.");
  }

  const user = req.user;

  const isPasswordValid = await user.isPasswordCorrect(currPass);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid password or user");
  }

  user.password = newPass;
  await user.save();

  return res.status(200).json(200, "Password changed successfully");
});

const getCurrUser = asyncHandler(async (req, res) => {
  const user = req.user;

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "fullName and email are required.");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { fullName, email } },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar || !avatar.url) {
    throw new ApiError(500, "Error file uploading on cloudinary");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { avatar: avatar.url } },
    { new: true }
  ).select("-password");

  if (!updatedUser) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: updatedUser },
        "User avatar updated successfully"
      )
    );
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage || !coverImage.url) {
    throw new ApiError(500, "Failed to upload Cover image to Cloudinary");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    { coverImage: coverImage.url },
    { new: true }
  ).select("-password");

  if (!updatedUser) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: updatedUser },
        "Cover image updated successfully"
      )
    );
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const username = req.params.username;

  if (!username || !username.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  const channel = await User.aggregate([
    {
      $match: { username: username.toLowerCase() },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        subscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        username: "1",
        fullName: "1",
        email: "1",
        subscribersCount: "1",
        subscribedToCount: "1",
        isSubscribed: "1",
        avatar: "1",
        coverImage: "1",
      },
    },
  ]);

  console.log(channel[0]);

  if (!channel.length) {
    throw new ApiError(404, "User channel not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { channel: channel[0] }, "ok"));
});

export {
  registerUser,
  loginUser,
  logOutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrUser,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
};
