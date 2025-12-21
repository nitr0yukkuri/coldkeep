// declarations.d.ts
declare module "*.tflite" {
    const value: number; // アセットIDとして扱われる
    export default value;
}