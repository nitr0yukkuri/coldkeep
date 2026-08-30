const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const expoGo = path.join(root, 'expo-go');
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const child = spawn(command, ['expo', 'start'], {
  cwd: expoGo,
  env: {
    ...process.env,
    EXPO_PUBLIC_APP_MODE: 'demo',
    EXPO_PUBLIC_ML_PREVIEW: 'research',
  },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Expo Go demo could not start: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 1;
  }
});
