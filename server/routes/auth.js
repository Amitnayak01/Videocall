const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const multer = require("multer");
const cloudinary = require("../cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");




const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: "profiles" }
});
const upload = multer({ storage });


router.post("/upload-profile", authMiddleware, upload.single("image"), async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { profilePic: req.file.path });
  res.json({ url: req.file.path });
});

router.get("/user/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "username profilePic bio createdAt"
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});



router.post("/remove-profile", authMiddleware, async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { profilePic: "" });
  res.json({ msg: "Profile picture removed" });
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id)
    .select("username profilePic");
  res.json(user);
});



router.get("/users", authMiddleware, async (req, res) => {
  const users = await User.find().select("username profilePic");
  res.json(users);
});


router.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await User.create({ username, password: hash });
  res.json({ msg: "User created" });
});


// Update bio endpoint
router.put("/update-bio", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { bio } = req.body;
    
    // Validate bio length
    if (bio && bio.length > 200) {
      return res.status(400).json({ message: "Bio must be 200 characters or less" });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    user.bio = bio;
    await user.save();
    
    res.json({ 
      message: "Bio updated successfully",
      user: {
        id: user._id,
        username: user.username,
        bio: user.bio,
        profilePic: user.profilePic
      }
    });
  } catch (error) {
    console.error("Error updating bio:", error);
    res.status(500).json({ message: "Server error while updating bio" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ msg: "User not found" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ msg: "Wrong password" });

  const token = jwt.sign({ id: user._id }, "secretkey");
  res.json({ token });
});

module.exports = router;
