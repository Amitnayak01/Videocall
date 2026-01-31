const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "dlertnsbi",
  api_key: "756355621748838",
  api_secret: "KWpu-PE3kdH0spuSW2puK4qDjUI"
});

module.exports = cloudinary;
