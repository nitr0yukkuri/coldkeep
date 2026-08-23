import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT_DIR = path.resolve(process.env.OUT_DIR ?? "output");
const DECK_PATH = path.join(OUT_DIR, "ColdKeep-VORN-exhibition-deck.pptx");
const POSTER_PATH = path.join(OUT_DIR, "ColdKeep-VORN-poster.png");
const MONTAGE_PATH = path.join(OUT_DIR, "ColdKeep-VORN-deck-montage.webp");
const SLIDES_DIR = path.join(OUT_DIR, "ColdKeep-VORN-slides");

const C = {
  navy: "#0F1B2D",
  ink: "#142033",
  muted: "#5C6B7A",
  rule: "#C8D3DC",
  pale: "#EEF5F6",
  paleBlue: "#EAF3FF",
  mint: "#60D4B4",
  cyan: "#86D7FF",
  blue: "#3D8DFF",
  red: "#E66B6B",
  white: "#FFFFFF",
};

const W = 1280;
const H = 720;
const M = 80;

async function writeBlob(filePath, blob) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function rect(slide, x, y, w, h, fill, radius = false, line = "none") {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: line === "none" ? 0 : 1 },
    ...(radius ? { borderRadius: "rounded-xl" } : {}),
  });
}

function line(slide, x, y, w, h, color, width = 2) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function text(slide, value, x, y, w, h, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    fontFamily: "Arial",
    fontSize: 18,
    color: C.ink,
    margin: 0,
    ...style,
  };
  return shape;
}

function notes(slide, body) {
  slide.speakerNotes.textFrame.setText(body);
  slide.speakerNotes.setVisible(true);
}

function header(slide, kicker, title, page) {
  text(slide, kicker.toUpperCase(), M, 42, 360, 24, {
    fontSize: 15,
    bold: true,
    color: C.blue,
    letterSpacing: 1.2,
  });
  text(slide, title, M, 78, 980, 58, {
    fontSize: 36,
    bold: true,
    color: C.ink,
  });
  text(slide, String(page).padStart(2, "0"), 1170, 48, 40, 24, {
    fontSize: 16,
    bold: true,
    color: C.muted,
    alignment: "right",
  });
  line(slide, M, 150, W - M * 2, 0, C.rule, 1);
}

function addDot(slide, x, y, r, fill) {
  return slide.shapes.add({
    geometry: "ellipse",
    position: { left: x, top: y, width: r, height: r },
    fill,
    line: { style: "solid", fill, width: 0 },
  });
}

function buildDeck() {
  const p = Presentation.create({ slideSize: { width: W, height: H } });

  // 01 — poster-style cover, also exported as a standalone poster image.
  {
    const s = p.slides.add();
    s.background.fill = C.navy;
    text(s, "COLDKEEP", M, 54, 360, 28, { fontSize: 18, bold: true, color: C.mint, letterSpacing: 2 });
    text(s, "振るだけで、\n水筒の残量を見える化。", M, 125, 650, 170, {
      fontSize: 56,
      bold: true,
      color: C.white,
      lineSpacing: 0.92,
    });
    text(s, "スマホのマイクで水筒の音を読み取り、\n残量の目安をその場で返す音響AIプロトタイプ", M, 330, 610, 82, {
      fontSize: 23,
      color: "#D9E6EF",
      lineSpacing: 1.1,
    });
    rect(s, M, 462, 390, 92, C.mint, true);
    text(s, "体験は30秒。追加センサー不要。", M + 24, 490, 342, 36, {
      fontSize: 22,
      bold: true,
      color: C.navy,
      alignment: "center",
    });
    // A restrained acoustic-wave motif, used as a simple diagram rather than decoration.
    line(s, 770, 196, 0, 164, C.cyan, 5);
    line(s, 792, 146, 0, 214, C.cyan, 5);
    line(s, 814, 96, 0, 264, C.mint, 5);
    line(s, 836, 156, 0, 204, C.cyan, 5);
    line(s, 858, 220, 0, 140, C.cyan, 5);
    line(s, 880, 118, 0, 242, C.mint, 5);
    line(s, 902, 180, 0, 180, C.cyan, 5);
    line(s, 924, 240, 0, 120, C.cyan, 5);
    line(s, 946, 130, 0, 230, C.mint, 5);
    line(s, 968, 196, 0, 164, C.cyan, 5);
    text(s, "音響AI / React Native / Rust", 770, 420, 320, 28, { fontSize: 17, color: "#B8C7D5" });
    text(s, "プロトタイプ｜試験推定", M, 632, 260, 28, { fontSize: 16, bold: true, color: C.cyan });
    text(s, "※現在は残量の目安を表示する段階。学習済みモデルで検証するまで水分量は自動記録しません。", M, 663, 1080, 24, { fontSize: 13, color: "#A9B9C8" });
    notes(s, "[Sources]\n- VORN Challenge公式: https://vorn-challenge.com/\n- ColdKeep実装・制約: README.md, VORN_EVALUATION_REPORT.md\n\n[Presenter note]\n最初の10秒で「振るだけ」「追加センサー不要」「現状は試験推定」の3点を伝える。");
  }

  // 02 — problem and insight.
  {
    const s = p.slides.add();
    s.background.fill = C.white;
    header(s, "Why this matters", "飲んだ量は、本人しかわからない。", 2);
    text(s, "外出・運動・暑い日の水分補給は、\n“飲んだつもり”のまま終わりやすい。", M, 196, 500, 96, { fontSize: 25, color: C.ink, lineSpacing: 1.05 });
    const rows = [
      ["01", "残量が見えない", "水筒を開けるまで、どれだけ残っているか分からない"],
      ["02", "記録が続かない", "毎回の入力は、忙しい日ほど抜ける"],
      ["03", "専用ハードルが高い", "センサー付きボトルへの買い替えは現実的でない"],
    ];
    rows.forEach(([num, title, body], i) => {
      const y = 330 + i * 90;
      text(s, num, M, y, 44, 30, { fontSize: 18, bold: true, color: C.blue });
      text(s, title, M + 64, y - 4, 230, 30, { fontSize: 22, bold: true, color: C.ink });
      text(s, body, M + 330, y, 650, 30, { fontSize: 17, color: C.muted });
      line(s, M + 64, y + 38, 900, 0, C.rule, 1);
    });
    rect(s, 900, 205, 300, 360, C.pale, true);
    text(s, "ColdKeepの視点", 936, 239, 230, 28, { fontSize: 17, bold: true, color: C.blue });
    text(s, "容量を一度登録\n→ 振る\n→ 音響特徴を読む\n→ 残量の目安を返す", 936, 292, 230, 178, { fontSize: 28, bold: true, color: C.ink, lineSpacing: 1.0 });
    text(s, "行動を増やさず、\n“気づける”瞬間をつくる。", 936, 492, 230, 54, { fontSize: 16, color: C.muted });
    notes(s, "[Sources]\n- ColdKeepの課題設定・対象ユーザー: VORN_APPLICATION_DRAFT.md\n- VORN Challenge公式の評価観点: https://vorn-challenge.com/\n\n[Presenter note]\n課題を「水分量を正確に測る」ではなく「残量に気づけず記録も続かない」に絞る。");
  }

  // 03 — demo flow.
  {
    const s = p.slides.add();
    s.background.fill = C.white;
    header(s, "Try it", "30秒で、音が残量の目安に変わる。", 3);
    const x = [M, 445, 810];
    const titles = ["容量を一度だけ入力", "水筒を軽く振る", "結果を確認する"];
    const bodies = ["500 mLなど、\n水筒の大きさだけ登録", "スマホを近づけて\n1秒程度の自然な振り方", "満量 / 半分 / 少量の\n広い残量帯を表示"];
    x.forEach((left, i) => {
      addDot(s, left, 210, 54, i === 1 ? C.mint : C.blue);
      text(s, String(i + 1), left, 223, 54, 30, { fontSize: 22, bold: true, color: C.white, alignment: "center" });
      text(s, titles[i], left, 294, 300, 34, { fontSize: 23, bold: true, color: C.ink });
      text(s, bodies[i], left, 346, 300, 70, { fontSize: 18, color: C.muted, lineSpacing: 1.05 });
      if (i < 2) {
        line(s, left + 95, 235, 215, 0, C.rule, 2);
        text(s, "→", left + 290, 214, 36, 32, { fontSize: 25, bold: true, color: C.blue, alignment: "center" });
      }
    });
    rect(s, M, 482, 1040, 118, C.navy, true);
    text(s, "画面に出るもの", M + 28, 510, 190, 28, { fontSize: 17, bold: true, color: C.cyan });
    text(s, "残量 50%  ｜  試験推定  ｜  信頼度 0.58", M + 260, 507, 640, 38, { fontSize: 28, bold: true, color: C.white });
    text(s, "※学習済みモデルで検証するまで、自動で水分量を記録しない", M + 28, 556, 930, 24, { fontSize: 15, color: "#B6C8D6" });
    notes(s, "[Sources]\n- 実装フロー: App.tsx, publicShakeClassifier.ts\n- 実験アーティファクトの状態: ml/artifacts/shake_fill_level_pilot.json\n\n[Presenter note]\n試験推定を「測定値」と呼ばない。画面の注記まで含めて見せることで、AIの不確実性を設計していることを示す。");
  }

  // 04 — architecture.
  {
    const s = p.slides.add();
    s.background.fill = C.white;
    header(s, "How it works", "処理は端末内。音声を外へ送らない。", 4);
    text(s, "マイク入力から特徴量を作り、\n信頼度ゲートを通った結果だけをUIに返す。", M, 192, 520, 70, { fontSize: 24, color: C.ink, lineSpacing: 1.05 });
    const nodes = [
      [M, 352, 185, "マイク", "録音"],
      [300, 352, 220, "特徴量", "log-mel / energy"],
      [575, 352, 220, "Rust / ML", "分類"],
      [850, 352, 220, "信頼度ゲート", "安全側に倒す"],
    ];
    nodes.forEach(([left, top, width, title, body], i) => {
      rect(s, left, top, width, 122, i === 2 ? C.paleBlue : C.pale, true);
      text(s, title, left + 18, top + 23, width - 36, 30, { fontSize: 22, bold: true, color: C.ink, alignment: "center" });
      text(s, body, left + 18, top + 67, width - 36, 24, { fontSize: 16, color: C.muted, alignment: "center" });
      if (i < nodes.length - 1) {
        text(s, "→", left + width + 24, top + 37, 46, 38, { fontSize: 28, bold: true, color: C.blue, alignment: "center" });
      }
    });
    rect(s, M, 536, 1040, 82, C.navy, true);
    text(s, "学習済みモデルがない間は、試験推定を表示しても自動記録には使わない。", M + 26, 562, 990, 32, { fontSize: 20, bold: true, color: C.white, alignment: "center" });
    text(s, "React Native UI  ×  Rust解析コア  ×  モデル差し替え可能な境界", M, 654, 1040, 24, { fontSize: 16, color: C.muted, alignment: "center" });
    notes(s, "[Sources]\n- アーキテクチャ: VORN_ARCHITECTURE.md\n- セキュリティ方針: VORN_SECURITY_REVIEW.md\n- Rust実装: rust/coldkeep_ml/src/lib.rs\n\n[Presenter note]\n「AIだから送信する」の逆を示す。端末内処理と信頼度ゲートが、実装上の見せ場。");
  }

  // 05 — evidence and limits.
  {
    const s = p.slides.add();
    s.background.fill = C.white;
    header(s, "Evidence & limits", "できることと、まだできないことを分ける。", 5);
    rect(s, M, 196, 500, 390, C.pale, true);
    text(s, "今、体験できること", M + 32, 226, 430, 32, { fontSize: 24, bold: true, color: C.blue });
    const yes = ["容量を一度だけ登録", "振り音から広い残量帯を推定", "不確実なときは“未判定”に戻す", "学習済みモデルを後から差し替える"];
    yes.forEach((v, i) => {
      addDot(s, M + 34, 290 + i * 58, 18, C.mint);
      text(s, "✓", M + 35, 288 + i * 58, 16, 18, { fontSize: 14, bold: true, color: C.navy, alignment: "center" });
      text(s, v, M + 70, 286 + i * 58, 390, 30, { fontSize: 18, color: C.ink });
    });
    rect(s, 700, 196, 500, 390, "#FFF4F2", true);
    text(s, "まだ約束しないこと", 732, 226, 430, 32, { fontSize: 24, bold: true, color: C.red });
    const no = ["正確なmL・温度・氷の個数", "医療・熱中症の診断", "水筒の種類を越えた精度保証", "未検証モデルによる自動摂取記録"];
    no.forEach((v, i) => {
      addDot(s, 734, 290 + i * 58, 18, C.red);
      text(s, "×", 735, 287 + i * 58, 16, 18, { fontSize: 14, bold: true, color: C.white, alignment: "center" });
      text(s, v, 770, 286 + i * 58, 390, 30, { fontSize: 18, color: C.ink });
    });
    text(s, "表示の正直さ自体を、作品の信頼性にする。", M, 638, 1040, 30, { fontSize: 22, bold: true, color: C.ink, alignment: "center" });
    notes(s, "[Sources]\n- 現状の制約・評価: VORN_EVALUATION_REPORT.md\n- モデル状態: ml/artifacts/shake_fill_level_pilot.json\n\n[Presenter note]\nここは弱点の告白ではなく、安全設計の説明。精度を盛らず、測れないものを明示する。");
  }

  // 06 — VORN fit.
  {
    const s = p.slides.add();
    s.background.fill = C.white;
    header(s, "Why VORN", "日常の飲水を、“気づける行動”に変える。", 6);
    text(s, "社会課題", M, 205, 160, 28, { fontSize: 18, bold: true, color: C.blue });
    text(s, "暑さ・運動・長時間作業の中で、\n水分補給の状態は見えにくい。", M, 244, 360, 70, { fontSize: 24, color: C.ink, lineSpacing: 1.05 });
    line(s, 480, 205, 0, 300, C.rule, 1);
    text(s, "新しさ", 540, 205, 160, 28, { fontSize: 18, bold: true, color: C.blue });
    text(s, "専用ボトル不要。\n手元の水筒＋スマホで始める。", 540, 244, 380, 70, { fontSize: 24, color: C.ink, lineSpacing: 1.05 });
    line(s, 960, 205, 0, 300, C.rule, 1);
    text(s, "広がり", 1010, 205, 160, 28, { fontSize: 18, bold: true, color: C.blue });
    text(s, "個人の記録から、\nAPI・OSS・研究データへ。", 1010, 244, 210, 70, { fontSize: 24, color: C.ink, lineSpacing: 1.05 });
    rect(s, M, 548, 1040, 86, C.paleBlue, true);
    text(s, "AIの精度を競うだけでなく、\n“使い続けられる測定体験”を設計する。", M + 28, 565, 980, 52, { fontSize: 24, bold: true, color: C.navy, alignment: "center", lineSpacing: 1.0 });
    text(s, "VORN Challenge 2026｜学生AIピッチコンテスト", M, 670, 1040, 22, { fontSize: 15, color: C.muted, alignment: "center" });
    notes(s, "[Sources]\n- VORN Challenge公式（テーマ・評価観点・応募条件）: https://vorn-challenge.com/\n- ColdKeepの展開案: VORN_APPLICATION_DRAFT.md, VORN_SUBMISSION_PLAN.md\n\n[Presenter note]\nVORN向けには、精度の未完成さを隠すより「社会課題に対して、測定行動を増やさず介入する設計」を主軸にする。");
  }

  // 07 — booth call to action.
  {
    const s = p.slides.add();
    s.background.fill = C.navy;
    text(s, "展示で見てほしいこと", M, 58, 360, 28, { fontSize: 17, bold: true, color: C.cyan, letterSpacing: 1.2 });
    text(s, "触ってください。\n30秒でわかります。", M, 124, 580, 128, { fontSize: 56, bold: true, color: C.white, lineSpacing: 0.92 });
    const steps = ["水筒の容量を入力", "スマホの近くで振る", "残量の目安を見る"];
    steps.forEach((v, i) => {
      const y = 338 + i * 70;
      addDot(s, M, y, 34, i === 1 ? C.mint : C.blue);
      text(s, String(i + 1), M, y + 6, 34, 22, { fontSize: 16, bold: true, color: C.navy, alignment: "center" });
      text(s, v, M + 62, y - 2, 420, 30, { fontSize: 22, color: C.white });
    });
    rect(s, 830, 160, 290, 180, C.white, true);
    text(s, "GitHub / Demo", 860, 190, 230, 28, { fontSize: 18, bold: true, color: C.navy, alignment: "center" });
    rect(s, 907, 238, 86, 86, C.pale, false);
    text(s, "QR", 907, 264, 86, 28, { fontSize: 22, bold: true, color: C.muted, alignment: "center" });
    text(s, "※公開URL確定後に差し替え", 850, 356, 250, 24, { fontSize: 13, color: "#B7C7D4", alignment: "center" });
    text(s, "現状：プロトタイプ / 試験推定\n正確なmL・温度・氷の個数は対象外", 830, 480, 290, 64, { fontSize: 17, color: C.cyan, alignment: "center", lineSpacing: 1.05 });
    text(s, "ColdKeep", M, 665, 220, 24, { fontSize: 16, bold: true, color: C.mint, letterSpacing: 1.5 });
    notes(s, "[Sources]\n- デモ手順: VORN_VIDEO_SCRIPT.md\n- 制約・公開時の注意: VORN_SUBMISSION_README.md, VORN_LICENSES.md\n\n[Presenter note]\nQRは公開リポジトリ・デモ動画のURLが確定してから差し替える。未公開URLを推測して印刷しない。");
  }

  return p;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(SLIDES_DIR, { recursive: true });
  const presentation = buildDeck();
  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(path.join(SLIDES_DIR, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 1 }));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(SLIDES_DIR, `${stem}.layout.json`), await layout.text());
  }
  await writeBlob(MONTAGE_PATH, await presentation.export({ format: "webp", montage: true, scale: 1 }));
  await writeBlob(POSTER_PATH, await presentation.export({ slide: presentation.slides.items[0], format: "png", scale: 1 }));
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(DECK_PATH);
  console.log(JSON.stringify({ deck: DECK_PATH, poster: POSTER_PATH, montage: MONTAGE_PATH, slides: presentation.slides.items.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
