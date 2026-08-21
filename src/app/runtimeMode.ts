declare const process: { env: Record<string, string | undefined> };

const configuredMode =
  typeof process === 'undefined'
    ? undefined
    : process.env.EXPO_PUBLIC_APP_MODE;

export const isCollectionMode = configuredMode === 'collector';
