const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// tfliteをアセットとして追加
config.resolver.assetExts.push("tflite");

module.exports = config;