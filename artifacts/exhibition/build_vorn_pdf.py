from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


ROOT = Path(__file__).resolve().parents[2]
SLIDES = ROOT / "output" / "ColdKeep-VORN-slides-v3"
OUT = ROOT / "output" / "pdf"
PDF_PATH = OUT / "ColdKeep-VORN-exhibition-v3.pdf"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    slide_paths = sorted(SLIDES.glob("slide-*.png"))
    if len(slide_paths) != 5:
        raise SystemExit(f"expected 5 rendered slides, found {len(slide_paths)}")

    page_size = (1280, 720)
    pdf = canvas.Canvas(str(PDF_PATH), pagesize=page_size, pageCompression=1)
    for slide_path in slide_paths:
        pdf.drawImage(
            ImageReader(str(slide_path)),
            0,
            0,
            width=page_size[0],
            height=page_size[1],
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )
        pdf.showPage()
    pdf.save()
    print(PDF_PATH)


if __name__ == "__main__":
    main()
