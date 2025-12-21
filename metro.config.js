const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// tfliteをアセットとして追加（これが無いと赤い画面のエラーになる）
config.resolver.assetExts.push("tflite");

module.exports = config;