const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Generated research/build files are not application dependencies. Excluding
// them also keeps Metro from traversing protected native Python wheels under
// tmp/python-deps on Windows during release/preview bundling.
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const generatedTmp = escapeRegExp(path.resolve(__dirname, 'tmp'));
config.resolver.blockList = [new RegExp(`${generatedTmp}[\\\\/].*`)];

// 既存の設定を維持しつつ、tfliteとbinを追加する
config.resolver.assetExts.push('tflite');
config.resolver.assetExts.push('bin');

module.exports = mergeConfig(config, {});
