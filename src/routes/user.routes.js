import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  registerUser,
  loginUser,
  logOutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrUser,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
} from "../controllers/user.controller.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser);

// secured routes
router.route("/logout").post(verifyJWT, logOutUser);

router.route("/refresh-token").post(refreshAccessToken);

router.route("/change-current-password").post(verifyJWT, changeCurrentPassword);

router.route("/current-user").get(verifyJWT, getCurrUser);

router
  .route("/update-user-avatar")
  .post(upload.single("avatar"), updateUserAvatar);

router
  .route("/update-user-cover-image")
  .post(upload.single("coverImage"), updateUserCoverImage);

router.route("/user-channel/:username").get(getUserChannelProfile);

export default router;
