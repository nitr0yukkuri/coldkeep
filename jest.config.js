module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '\\.tflite$': '<rootDir>/testAssetMock.js',
    '^react-native-vector-icons/Ionicons$': '<rootDir>/testIconMock.tsx',
  },
};
