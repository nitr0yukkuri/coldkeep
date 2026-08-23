import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = path.resolve(process.env.OUT_DIR ?? "output");
const W = 1280;
const H = 720;
const C = {
  paper: "#F8F6F1",
  navy: "#142033",
  muted: "#65727B",
  line: "#D8D7D2",
  mint: "#5FCDB1",
  aqua: "#CFEDE8",
  blue: "#A9DDF3",
  orange: "#F3A36B",
  red: "#D86F6F",
  white: "#FFFFFF",
};
const M = 72;

async function writeBlob(filePath, blob) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function shape(slide, geometry, x, y, w, h, fill, lineFill = "none", radius = false) {
  return slide.shapes.add({
    geometry,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: lineFill, width: lineFill === "none" ? 0 : 1 },
    ...(radius ? { borderRadius: "rounded-xl" } : {}),
  });
}

function text(slide, value, x, y, w, h, style = {}) {
  const s = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = value;
  s.text.style = { fontFamily: "Arial", fontSize: 18, color: C.navy, margin: 0, ...style };
  return s;
}

function line(slide, x, y, w, h, color, width = 2) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function dot(slide, x, y, d, fill) {
  return shape(slide, "ellipse", x, y, d, d, fill);
}

function addNotes(slide, value) {
  slide.speakerNotes.textFrame.setText(value);
  slide.speakerNotes.setVisible(true);
}

async function build() {
  const p = Presentation.create({ slideSize: { width: W, height: H } });

  // 01: product-led poster cover, intentionally free of AI-generated photography.
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    shape(s, "rect", 650, 0, 630, 720, "#EDF3F0");
    text(s, "COLDKEEP", M, 56, 260, 28, { fontSize: 17, bold: true, color: C.mint, letterSpacing: 2 });
    text(s, "水筒を振る。\n残量に気づく。", M, 140, 520, 150, { fontSize: 58, bold: true, color: C.navy, lineSpacing: 0.9 });
    text(s, "スマホのマイクで、水筒の音を読み取る\n音響AIプロトタイプ。", M, 326, 500, 64, { fontSize: 22, color: C.muted, lineSpacing: 1.05 });
    shape(s, "roundRect", M, 442, 430, 94, C.mint, "none", true);
    text(s, "体験は30秒。\n追加センサーはいらない。", M + 24, 463, 382, 56, { fontSize: 23, bold: true, color: C.navy, lineSpacing: 0.95 });
    text(s, "容量を一度登録  →  振る  →  残量の目安", M, 579, 540, 28, { fontSize: 16, bold: true, color: C.navy });
    text(s, "プロトタイプ / 試験推定　※学習済みモデルで検証するまで水分量は自動記録しません", M, 658, 570, 24, { fontSize: 12, color: C.muted });
    shape(s, "roundRect", 724, 154, 224, 494, C.navy, "none", true);
    shape(s, "roundRect", 742, 178, 188, 444, C.paper, "none", true);
    shape(s, "roundRect", 797, 178, 78, 16, C.navy, "none", true);
    text(s, "COLDKEEP", 765, 212, 142, 20, { fontSize: 11, bold: true, color: C.mint, alignment: "center", letterSpacing: 1.2 });
    text(s, "残量", 765, 268, 142, 24, { fontSize: 15, color: C.muted, alignment: "center" });
    text(s, "50%", 765, 302, 142, 60, { fontSize: 45, bold: true, color: C.navy, alignment: "center" });
    shape(s, "roundRect", 765, 396, 142, 46, C.aqua, "none", true);
    text(s, "試験推定", 778, 410, 116, 22, { fontSize: 16, bold: true, color: C.navy, alignment: "center" });
    text(s, "自動記録には未使用", 760, 466, 152, 22, { fontSize: 11, color: C.muted, alignment: "center" });
    shape(s, "roundRect", 765, 520, 142, 48, C.mint, "none", true);
    text(s, "振って測定", 778, 535, 116, 22, { fontSize: 15, bold: true, color: C.navy, alignment: "center" });
    shape(s, "roundRect", 1020, 272, 146, 308, "#D7D7D0", C.navy, true);
    shape(s, "roundRect", 1044, 214, 98, 74, "#A7AAA2", C.navy, true);
    shape(s, "roundRect", 1024, 284, 138, 22, C.mint, C.navy, true);
    text(s, "実機デモ", 1014, 606, 158, 24, { fontSize: 16, bold: true, color: C.navy, alignment: "center" });
    addNotes(s, "[Sources]\n- VORN Challenge公式: https://vorn-challenge.com/\n- ColdKeep実装・制約: README.md, VORN_EVALUATION_REPORT.md\n- Visual: AI生成画像は使用せず、実機デモのための簡潔な模式図を使用\n\n[Presenter note]\n会場では模式図の横に実物の水筒と端末を置く。ポスター単体で完成品に見せるのではなく、実機へ誘導する。");
  }

  // 02: the one action loop.
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    text(s, "体験の流れ", M, 54, 260, 28, { fontSize: 16, bold: true, color: C.mint, letterSpacing: 1.5 });
    text(s, "やることは、3つだけ。", M, 92, 760, 52, { fontSize: 42, bold: true, color: C.navy });
    line(s, M, 168, W - M * 2, 0, C.line, 1);
    const steps = [
      ["01", "容量を登録", "500 mLなど、\n水筒の大きさだけ"],
      ["02", "近くで振る", "1秒程度、\nいつもの動作で"],
      ["03", "残量を見る", "満量 / 半分 / 少量の\n目安を返す"],
    ];
    steps.forEach(([num, title, body], i) => {
      const x = M + i * 320;
      dot(s, x, 246, 58, i === 1 ? C.mint : C.blue);
      text(s, num, x, 260, 58, 24, { fontSize: 17, bold: true, color: C.navy, alignment: "center" });
      text(s, title, x, 332, 260, 32, { fontSize: 25, bold: true, color: C.navy });
      text(s, body, x, 380, 260, 56, { fontSize: 18, color: C.muted, lineSpacing: 1.05 });
      if (i < 2) {
        text(s, "→", x + 244, 255, 56, 34, { fontSize: 30, bold: true, color: C.navy, alignment: "center" });
      }
    });
    shape(s, "roundRect", M, 520, 1136, 110, C.navy, "none", true);
    text(s, "結果の例", M + 28, 547, 150, 28, { fontSize: 16, bold: true, color: C.blue });
    text(s, "残量 50%", M + 250, 542, 220, 38, { fontSize: 30, bold: true, color: C.white });
    text(s, "試験推定", M + 520, 548, 180, 28, { fontSize: 20, bold: true, color: C.mint });
    text(s, "自動記録には未使用", M + 760, 550, 280, 26, { fontSize: 16, color: "#CBD7DF" });
    addNotes(s, "[Sources]\n- 実装フロー: App.tsx, publicShakeClassifier.ts\n- 実験アーティファクト: ml/artifacts/shake_fill_level_pilot.json\n\n[Presenter note]\n展示では、入力項目を容量だけに絞ったことを強調する。結果は測定値ではなく残量帯の目安。");
  }

  // 03: app screen evidence.
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    text(s, "アプリ画面", M, 54, 260, 28, { fontSize: 16, bold: true, color: C.mint, letterSpacing: 1.5 });
    text(s, "画面に出す結果を、1つに絞る。", M, 92, 880, 52, { fontSize: 42, bold: true, color: C.navy });
    text(s, "細かいモデル情報は奥へ。展示では、\n来場者が次に何をすればいいかを前面に出す。", M, 182, 420, 64, { fontSize: 21, color: C.muted, lineSpacing: 1.05 });
    // Phone mockup: a simple evidence diagram, not a decorative UI grid.
    shape(s, "roundRect", 600, 154, 280, 492, C.navy, "none", true);
    shape(s, "roundRect", 616, 178, 248, 444, C.paper, "none", true);
    text(s, "COLDKEEP", 642, 202, 150, 22, { fontSize: 12, bold: true, color: C.mint, letterSpacing: 1.5 });
    text(s, "現在の残量", 642, 252, 190, 24, { fontSize: 15, color: C.muted });
    text(s, "50%", 642, 286, 190, 70, { fontSize: 54, bold: true, color: C.navy });
    shape(s, "roundRect", 642, 392, 196, 50, C.aqua, "none", true);
    text(s, "試験推定", 660, 407, 160, 24, { fontSize: 18, bold: true, color: C.navy, alignment: "center" });
    text(s, "自動記録には未使用", 642, 462, 196, 26, { fontSize: 13, color: C.muted, alignment: "center" });
    shape(s, "roundRect", 642, 518, 196, 54, C.mint, "none", true);
    text(s, "振って測定する", 660, 534, 160, 24, { fontSize: 16, bold: true, color: C.navy, alignment: "center" });
    // Two annotation lines.
    line(s, 900, 330, 180, 0, C.line, 2);
    text(s, "残量の目安", 922, 293, 220, 28, { fontSize: 21, bold: true, color: C.navy });
    text(s, "満量 / 半分 / 少量\nの広い残量帯", 922, 366, 220, 50, { fontSize: 17, color: C.muted, lineSpacing: 1.05 });
    line(s, 390, 522, 154, 0, C.line, 2);
    text(s, "安全側の表示", 280, 486, 240, 28, { fontSize: 21, bold: true, color: C.navy, alignment: "right" });
    text(s, "学習前は“試験推定”。\n信頼度不足なら“未判定”。", 240, 546, 280, 50, { fontSize: 17, color: C.muted, lineSpacing: 1.05, alignment: "right" });
    addNotes(s, "[Sources]\n- 実際の画面コピー: App.tsx\n- 表示ルール: publicShakeClassifier.ts, __tests__/App.test.tsx\n\n[Presenter note]\nこの画面は展示用の見せ方。実アプリでも、結果の注記と未判定への戻りを残す。");
  }

  // 04: trust boundary.
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    text(s, "AIの設計", M, 54, 260, 28, { fontSize: 16, bold: true, color: C.mint, letterSpacing: 1.5 });
    text(s, "AIの価値は、“分からない”と言えること。", M, 92, 1040, 52, { fontSize: 38, bold: true, color: C.navy });
    text(s, "試験推定をそのまま水分量へ流さず、信頼度で止める。", M, 180, 880, 30, { fontSize: 21, color: C.muted });
    const rows = [
      ["学習済みモデル", "表示 + 自動記録", C.mint, "検証済みの信頼度を満たしたときだけ"],
      ["試験推定", "表示のみ", C.blue, "体験を止めずに、学習前の状態を明示"],
      ["低信頼 / 失敗", "未判定", C.orange, "誤った数値を出すより、安全側へ戻す"],
    ];
    rows.forEach(([label, result, fill, body], i) => {
      const y = 262 + i * 106;
      shape(s, "roundRect", M, y, 1136, 78, C.white, C.line, true);
      dot(s, M + 26, y + 25, 28, fill);
      text(s, label, M + 82, y + 20, 250, 28, { fontSize: 21, bold: true, color: C.navy });
      text(s, result, M + 410, y + 20, 220, 28, { fontSize: 21, bold: true, color: C.navy });
      text(s, body, M + 700, y + 22, 390, 28, { fontSize: 16, color: C.muted });
    });
    shape(s, "roundRect", M, 606, 1136, 58, C.navy, "none", true);
    text(s, "未検証の結果を、確定値のように見せない。", M + 24, 622, 1088, 24, { fontSize: 20, bold: true, color: C.white, alignment: "center" });
    addNotes(s, "[Sources]\n- 安全側の評価: VORN_SECURITY_REVIEW.md, VORN_EVALUATION_REPORT.md\n- モデル状態: ml/artifacts/shake_fill_level_pilot.json\n\n[Presenter note]\nこれは弱点の列挙ではなく、AI機能を製品に載せるための境界設計。VORN審査では技術的な誠実さとして説明する。");
  }

  // 05: booth CTA.
  {
    const s = p.slides.add();
    s.background.fill = C.navy;
    text(s, "展示で体験してほしいこと", M, 58, 420, 28, { fontSize: 16, bold: true, color: C.mint, letterSpacing: 1.5 });
    text(s, "30秒で、\n水筒の音が残量の目安になる。", M, 126, 650, 136, { fontSize: 48, bold: true, color: C.white, lineSpacing: 0.92 });
    text(s, "容量を入力 → 水筒を振る → 画面を見る", M, 316, 610, 30, { fontSize: 20, color: "#D3E0E7" });
    shape(s, "roundRect", M, 404, 440, 126, C.mint, "none", true);
    text(s, "触ってください。", M + 32, 428, 380, 36, { fontSize: 28, bold: true, color: C.navy, alignment: "center" });
    text(s, "※試験推定 / 正確なmLではありません", M + 32, 474, 380, 24, { fontSize: 14, color: C.navy, alignment: "center" });
    shape(s, "roundRect", 860, 194, 250, 222, C.white, "none", true);
    text(s, "GitHub / Demo", 885, 222, 200, 26, { fontSize: 18, bold: true, color: C.navy, alignment: "center" });
    shape(s, "rect", 946, 278, 78, 78, C.aqua);
    text(s, "QR", 946, 303, 78, 25, { fontSize: 21, bold: true, color: C.muted, alignment: "center" });
    text(s, "公開URL確定後に差し替え", 875, 444, 220, 22, { fontSize: 13, color: "#B6C7D2", alignment: "center" });
    text(s, "ColdKeep", M, 665, 220, 24, { fontSize: 16, bold: true, color: C.mint, letterSpacing: 1.5 });
    addNotes(s, "[Sources]\n- デモ手順: VORN_VIDEO_SCRIPT.md, EXHIBITION_KIT.md\n- 公開時の注意: VORN_SUBMISSION_README.md, VORN_LICENSES.md\n\n[Presenter note]\nQRはURLが確定してから差し替える。展示当日は、端末と同じ水筒を横に置く。");
  }

  return p;
}

async function main() {
  const p = await build();
  const slideDir = path.join(OUT, "ColdKeep-VORN-slides-v3");
  await fs.mkdir(slideDir, { recursive: true });
  for (const [i, slide] of p.slides.items.entries()) {
    const stem = `slide-${String(i + 1).padStart(2, "0")}`;
    await writeBlob(path.join(slideDir, `${stem}.png`), await p.export({ slide, format: "png", scale: 1 }));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(slideDir, `${stem}.layout.json`), await layout.text());
  }
  const deckPath = path.join(OUT, "ColdKeep-VORN-exhibition-deck-v3.pptx");
  const posterPath = path.join(OUT, "ColdKeep-VORN-poster-v3.png");
  const montagePath = path.join(OUT, "ColdKeep-VORN-deck-montage-v3.webp");
  await writeBlob(montagePath, await p.export({ format: "webp", montage: true, scale: 1 }));
  await writeBlob(posterPath, await p.export({ slide: p.slides.items[0], format: "png", scale: 1 }));
  const pptx = await PresentationFile.exportPptx(p);
  await pptx.save(deckPath);
  console.log(JSON.stringify({ deckPath, posterPath, montagePath, slideCount: p.slides.items.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
