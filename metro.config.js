// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 既存の設定を維持しつつ、tfliteとbinを追加する
config.resolver.assetExts.push('tflite');
config.resolver.assetExts.push('bin');

module.exports = config;