module.exports = function (api) {
  const nativeBundle = process.env.COLDKEEP_NATIVE_BUNDLE === '1';
  const appMode = process.env.EXPO_PUBLIC_APP_MODE;
  const mlPreview = process.env.EXPO_PUBLIC_ML_PREVIEW;
  api.cache.using(() => `${nativeBundle}:${appMode ?? ''}:${mlPreview ?? ''}`);

  const inlineNativeColdKeepMode = function ({ types: t }) {
    const values = {
      EXPO_PUBLIC_APP_MODE: appMode,
      EXPO_PUBLIC_ML_PREVIEW: mlPreview,
    };

    return {
      visitor: {
        MemberExpression(path) {
          const object = path.node.object;
          const property = path.node.property;
          if (
            !t.isMemberExpression(object) ||
            !t.isIdentifier(object.object, { name: 'process' }) ||
            !t.isIdentifier(object.property, { name: 'env' }) ||
            !t.isIdentifier(property) ||
            !(property.name in values)
          ) {
            return;
          }

          const value = values[property.name];
          path.replaceWith(
            value === undefined ? t.identifier('undefined') : t.stringLiteral(value),
          );
        },
      },
    };
  };

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: nativeBundle ? [inlineNativeColdKeepMode] : [],
  };
};
