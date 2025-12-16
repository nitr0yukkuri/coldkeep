const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    resolver: {
        // ↓ ここで tflite を「画像などの素材」として認識させる
        assetExts: [...assetExts, 'tflite'],
    },
};

module.exports = mergeConfig(defaultConfig, config);