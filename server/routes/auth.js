const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();

router.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await User.create({ username, password: hash });
  res.json({ msg: "User created" });
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
