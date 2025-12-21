// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// .tflite をアセットとして明示的に追加
config.resolver.assetExts.push('tflite');

module.exports = config;