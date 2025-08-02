require("dotenv").config();
const User = require("../models/User");
const AdditionalDetails = require("../models/AdditionalDetails");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Otp = require("../models/Otp");
const otpGenerator = require("otp-generator");
const Number = require("../models/Number");

exports.signUp = async (req, res) => {
  try {
    const { name, email, password, phoneNumber, otp , accountType} = req.body;
    if (!name || !email || !password || !otp || !phoneNumber) {
      return res.status(403).json({
        success: false,
        message: "please enter all the details",
      });
    }
    // if user already exist
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "user Already Exist please log in",
      });
    }
    const recentOtp = await Otp.find({ email })
      .sort({ createdAt: -1 })
      .limit(1);

    console.log("recent Otp " + recentOtp);

    if (recentOtp.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Otp Not found",
      });
    } else if (otp !== recentOtp[0].otp) {
      const otpe = recentOtp[0].otp;
      return res.status(400).json({
        success: false,
        otp,
        otpe,
        message: "Invalid Otp",
      });
    }
    let hasshedpassword;
    try {
      // secure the password
      hasshedpassword = await bcrypt.hash(password, 10);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "cannot hash password",
      });
    }
    // entry createing
    const number = await Number.findOne({ number: phoneNumber });
    if (number) {
      const numberExist = await User.findOne({ phoneNumber: number._id });
      if (numberExist)
        return res.status(409).json({
          success: false,
          message: "number Already Exist",
        });
    }
    const newUserNumber = await Number.create({ number: phoneNumber });
    const user = await User.create({
      accountType:accountType||"Customer",
      name,
      email,
      password: hasshedpassword,
      phoneNumber: newUserNumber._id,
    });
    return res.status(200).json({
      success: true,
      data: user,
      message: "user created successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "user cannot be registered",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // check if email and password is not empty
    if (!email || !password) {
      return res.status(401).json({
        success: false,
        message: "please enter all the details",
      });
    }

    // check if user does had an account
    let userExist = await User.findOne({ email });
    if (!userExist) {
      return res.status(402).json({
        success: false,
        message: "please sign in first",
      });
    }

    // check if the password is correct or not
    if (await bcrypt.compare(password, userExist.password)) {
      const payload = {
        email: email,
        id: userExist._id,
        phoneNumber: userExist.phoneNumber,
        role:userExist.accountType,
      };

      // create a token
      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });
      userExist = userExist.toObject();
      //   userExist.token = token;
      userExist.password = undefined;

      const option = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "15m",
      });

      // create a cookie in response and send
      return res.cookie("loginToken", token, option).status(200).json({
        success: true,
        userExist,
        accessToken,
        message: "user logged in successfully",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Incorrect Password",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "user cannot Login",
    });
  }
};

exports.sendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "email is required" });
  }

  try {
    const checkUser = await User.findOne({ email });
    if (checkUser) {
      return res.status(400).json({
        success: false,
        message: "User already present with this email",
      });
    }
    var otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    // check unique otp or not
    let result = await Otp.findOne({ otp: otp });
    while (result) {
      otp = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      });
      result = await Otp.findOne({ otp });
    }

    const otpPayload = { email, otp };

    // Save OTP to MongoDB (your post-save hook will send it via SMS)
    await Otp.create(otpPayload);

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ message: "Failed to send OTP" });
  }
};
exports.refreshAccessToken = (req, res) => {
  try {
    const token = req.cookies?.loginToken;

    if (!token) {
      return res.status(401).json({ message: "No refresh token found" });
    }

    const decode = jwt.verify(token, process.env.JWT_SECRET);

    const payload = {
      email: decode.email,
      id: decode._id,
      phoneNumber: decode.phoneNumber,
      role:decode.role,
    };

    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.log("error in refreshing token");
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};
