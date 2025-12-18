
# 🧊 ColdKeep (AI水筒アシスタント)

> **Hardware is Heavy, Software is Eating the World.**

高価なIoTデバイスはもう要らない。  
スマホのマイクと物理演算だけで、あなたの水筒を「スマートボトル」へ進化させる。

<p align="center">
  <img src="https://via.placeholder.com/800x400?text=ColdKeep+App+Demo" alt="ColdKeep App Demo" width="100%">
</p>

---

## 📖 概要 (Overview)

**ColdKeep** は、スマートフォンのマイクを入力センサーとして活用し、  
ステンレスボトルの内部状態（**氷の有無・残量・温度**）を**非破壊で推定**する  
**Soft Sensing（ソフトセンシング）アプリケーション**です。

従来の「スマート水筒」が抱えていた  
**高価・重い・充電が必要** というハードウェアの課題を、  

- 信号処理（DSP）
- エッジAI（Edge AI）
- 物理シミュレーション  

の組み合わせにより、**ソフトウェアのみで解決**しました。

---

## 💡 解決する課題 (The Problem)

- **ブラックボックス化**  
  水筒の中身は見えず、「飲んだら熱すぎた」「いつの間にかぬるい」という体験損失が発生

- **ハードウェアの限界**  
  既存IoT水筒は専用デバイス必須で、充電・コスト・E-Wasteの問題がある

- **健康管理の欠如**  
  最適な水分補給の「量」と「温度」を感覚に頼っている

---

## 🚀 技術的アプローチ (Technical Approach)

ColdKeep は  
**「アクティブ・センシング」 × 「パッシブ・シミュレーション」**  
のハイブリッドアーキテクチャを採用しています。

---

### 1. 🔊 音響解析による初期状態推定 (Active Sensing)

ユーザーがボトルを振った際（または注水時）の  
**衝突音・流体音** をスマートフォンのマイクで集音し、内部状態を推定します。

- **Signal Processing**  
  PCM 生波形を FFT（高速フーリエ変換）でスペクトログラム化

- **Edge AI**  
  TensorFlow Lite による軽量モデルで  
  端末内リアルタイム推論（氷量・水量）

- **JSI (JavaScript Interface)**  
  React Native のブリッジを介さず  
  **C++ レイヤーで直接信号処理**を行い、低遅延・高パフォーマンスを実現

---

### 2. 🌡️ 物理モデルによるリアルタイム予測 (Passive Simulation)

一度内部状態を特定した後は、  
**ニュートンの冷却法則**に基づく物理モデルをバックグラウンドで実行します。

```math
\frac{dT(t)}{dt} = -k (T(t) - T_{\text{env}})

This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
