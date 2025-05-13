import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { generateAccessAndRefreshToken } from "../utils/generateAccessAndRefreshToken.js";
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

export { registerUser, loginUser, logOutUser };
