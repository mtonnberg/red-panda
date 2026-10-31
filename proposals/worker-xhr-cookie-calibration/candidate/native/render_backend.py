#!/usr/bin/env python3
"""Trusted text rendering backend. Input is DOM text JSON, never HTML or code.

Uses installed Pillow/FreeType and ReportLab, with fixed DejaVu font paths.
Those projects retain their own upstream licenses; no engine code is embedded.
"""
import base64
import io
import json
import math
import os
import re
import sys
import unicodedata


class RenderFailure(Exception):
    def __init__(self, message, code="RENDER_BACKEND_ERROR"):
        super().__init__(message)
        self.code = code


def main(payload):
    try:
        import PIL
        from PIL import Image, ImageDraw, ImageFont
        import reportlab
        import fontTools
        from reportlab.pdfgen import canvas
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont as PDFTTFont
        from fontTools.ttLib import TTFont
    except ImportError as error:
        raise RenderFailure("Missing rendering dependency: " + str(error), "RENDER_BACKEND_UNAVAILABLE") from error
    directory = "/usr/share/fonts/truetype/dejavu"
    files = {}
    for family, stem in [("sans", "DejaVuSans"), ("mono", "DejaVuSansMono")]:
        for style, suffix in [("regular", ""), ("bold", "-Bold"), ("italic", "-Oblique"), ("bolditalic", "-BoldOblique")]:
            path = os.path.join(directory, stem + suffix + ".ttf")
            if not os.path.isfile(path):
                raise RenderFailure("Required fixed render font is missing: " + path, "RENDER_FONT_UNAVAILABLE")
            files[family + "-" + style] = path
    backend = {"name": "Pillow-FreeType/ReportLab", "pillow": PIL.__version__, "reportlab": reportlab.Version, "fonttools": fontTools.__version__,
               "fontFamily": "DejaVu", "fontDirectory": directory}
    if payload.get("mode") == "info":
        return {"backend": backend, "formats": ["png", "pdf"], "fonts": sorted(files)}
    if payload.get("format") not in ("png", "pdf"):
        raise RenderFailure("Unsupported backend format", "RENDER_FORMAT_UNSUPPORTED")
    pdf = payload["format"] == "pdf"
    family = payload.get("fontFamily", "sans")
    if family not in ("sans", "mono"):
        raise RenderFailure("Unsupported fixed font family")
    scale = 0.75 * payload.get("PDFscale", 1) if pdf else 1.0
    factor = 1.375 if pdf else 1.4
    paper_width, paper_height = payload["paperWidth"], payload["paperHeight"]
    if payload.get("landscape"):
        paper_width, paper_height = paper_height, paper_width
    width = paper_width if pdf else payload["width"]
    left = payload["marginLeft"] if pdf else 16
    right = payload["marginRight"] if pdf else 16
    top = payload["marginTop"] if pdf else 16
    bottom = payload["marginBottom"] if pdf else 16
    if width <= left + right:
        raise RenderFailure("Render width leaves no text area", "RENDER_BOUNDS")
    font_cache, cmaps, missing = {}, {}, set()

    def font_key(run):
        actual_family = "mono" if run.get("mono") else family
        style = "bolditalic" if run.get("bold") and run.get("italic") else "bold" if run.get("bold") else "italic" if run.get("italic") else "regular"
        return actual_family + "-" + style

    def get_font(run):
        key = font_key(run)
        size = float(run.get("size", 16)) * scale
        if not (0.1 if pdf else 1) <= size <= 128:
            raise RenderFailure("Font size exceeds render bounds", "RENDER_BOUNDS")
        cache_key = (key, size)
        if cache_key not in font_cache:
            if pdf:
                if key not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(PDFTTFont(key, files[key]))
                font_cache[cache_key] = key
            else:
                font_cache[cache_key] = ImageFont.truetype(files[key], round(size))
        return font_cache[cache_key], size, key

    def measure(value, run):
        font, size, key = get_font(run)
        return pdfmetrics.stringWidth(value, font, size) if pdf else font.getlength(value)

    def coverage(value, key):
        if key not in cmaps:
            with TTFont(files[key], lazy=True) as font:
                cmaps[key] = set(font.getBestCmap())
        for character in value:
            if not character.isspace() and ord(character) not in cmaps[key]:
                missing.add(ord(character))

    def clusters(value):
        result = []
        for character in value:
            if result and (unicodedata.combining(character) or character == "\ufe0f"):
                result[-1] += character
            else:
                result.append(character)
        return result

    lines = []
    for block in payload.get("blocks", []):
        indent = float(block.get("indent", 0)) * scale
        available = width - left - right - indent
        if available < 1:
            raise RenderFailure("Indent leaves no text area", "RENDER_BOUNDS")
        current, advance, line_height = [], 0.0, float(block.get("size", 16)) * scale * factor

        def finish_line(force=False):
            nonlocal current, advance, line_height
            while current and not block.get("pre") and current[-1]["text"].isspace():
                current.pop()
            if current or force:
                lines.append({"runs": current, "height": line_height, "indent": indent, "after": 0})
            current, advance = [], 0.0
            line_height = float(block.get("size", 16)) * scale * factor

        for run in block.get("runs", []):
            font, size, key = get_font(run)
            value = run.get("text", "")
            coverage(value, key)
            for token in re.findall(r"\n|[^\S\n]+|[^\s]+", value):
                if token == "\n":
                    finish_line(True)
                    continue
                space = token.isspace()
                if space:
                    token = token.replace("\t", "    ") if block.get("pre") else " "
                    if not current and not block.get("pre"):
                        continue
                amount = measure(token, run)
                if current and advance + amount > available:
                    finish_line()
                    if space and not block.get("pre"):
                        continue
                if amount > available:
                    for character in clusters(token):
                        char_width = measure(character, run)
                        if current and advance + char_width > available:
                            finish_line()
                        current.append({"text": character, "font": font, "fontKey": key, "size": size, "width": char_width})
                        advance += char_width
                        line_height = max(line_height, size * factor)
                else:
                    current.append({"text": token, "font": font, "fontKey": key, "size": size, "width": amount})
                    advance += amount
                    line_height = max(line_height, size * factor)
        finish_line()
        if lines:
            lines[-1]["after"] = float(block.get("after", 12)) * scale
        if len(lines) > 30000:
            raise RenderFailure("Render exceeds 30000 lines", "RENDER_BOUNDS")
    if lines:
        lines[-1]["after"] = 0
    output = io.BytesIO()
    content_height = top + bottom + sum(line["height"] + line["after"] for line in lines)
    if not pdf:
        natural = max(1, math.floor(content_height))
        requested_height = natural if payload.get("fullPage", True) else payload["height"]
        clip = payload.get("clip")
        source_width = width
        if clip:
            ratio = clip["scale"]
            width = max(1, math.ceil(clip["width"] * ratio))
            height = max(1, math.ceil(clip["height"] * ratio))
            offset_x, offset_y = clip["x"], clip["y"]
            if width > 8192 or height > 32768:
                raise RenderFailure("Screenshot clip exceeds pixel dimensions", "RENDER_BOUNDS")
        else:
            ratio, offset_x, offset_y = 1, 0, 0
            if requested_height > payload["maxHeight"] and not payload.get("clipToBounds"):
                raise RenderFailure("Full PNG height exceeds 32768 pixels", "RENDER_BOUNDS")
            height = min(requested_height, payload["maxHeight"])
        if width * height > payload["maxPixels"]:
            raise RenderFailure("PNG exceeds 32Mi pixels", "RENDER_BOUNDS")
        image = Image.new("RGBA", (int(width), int(height)), (255, 255, 255, 255))
        drawing = ImageDraw.Draw(image)
        scaled_fonts = {}
        y = top
        for line in lines:
            x = left + line["indent"]
            if y + line["height"] >= offset_y and (y - offset_y) * ratio < height:
                for run in line["runs"]:
                    font = run["font"]
                    if ratio != 1:
                        key = (run["fontKey"], max(1, round(run["size"] * ratio)))
                        if key not in scaled_fonts:
                            scaled_fonts[key] = ImageFont.truetype(files[key[0]], key[1])
                        font = scaled_fonts[key]
                    drawing.text(((x - offset_x) * ratio, (y - offset_y) * ratio), run["text"], font=font, fill=(34, 34, 34, 255))
                    x += run["width"]
            y += line["height"] + line["after"]
        image.save(output, format="PNG", compress_level=9)
        return {"data": base64.b64encode(output.getvalue()).decode("ascii"), "width": int(width), "height": int(height),
                "contentHeight": natural, "lineCount": len(lines), "pageCount": 1,
                "sourceWidth": source_width, "clip": clip,
                "clipped": bool(clip) or height < natural, "missingGlyphs": sorted(missing), "backend": backend}
    height = paper_height
    if height <= top + bottom:
        raise RenderFailure("Paper height leaves no text area", "RENDER_BOUNDS")
    pages, page_lines, y = [], [], top
    for line in lines:
        if y + line["height"] > height - bottom and y > top:
            pages.append(page_lines)
            page_lines, y = [], top
        page_lines.append((line, y))
        y += line["height"] + line["after"]
    pages.append(page_lines)
    if len(pages) > 200:
        raise RenderFailure("PDF exceeds 200 pages", "RENDER_BOUNDS")

    def select_pages(spec, total):
        if not spec.strip():
            return list(range(total))
        chosen = set()
        for part in spec.split(","):
            part = part.strip()
            if re.fullmatch(r"[0-9]+", part):
                start = end = int(part)
            else:
                match = re.fullmatch(r"([0-9]*)-([0-9]*)", part)
                if not match or not (match.group(1) or match.group(2)):
                    raise RenderFailure("Invalid page range syntax", "RENDER_PAGE_RANGE_SYNTAX")
                start = int(match.group(1)) if match.group(1) else 1
                end = int(match.group(2)) if match.group(2) else total
                if match.group(2) and end < start:
                    raise RenderFailure("Invalid page range", "RENDER_PAGE_RANGE_INVALID")
            if start < 1 or end < 1:
                raise RenderFailure("Invalid page range", "RENDER_PAGE_RANGE_INVALID")
            if start <= total:
                chosen.update(range(start - 1, min(end, total)))
        if not chosen:
            raise RenderFailure("Page range exceeds page count", "RENDER_PAGE_RANGE_EXCEEDS_COUNT")
        return sorted(chosen)

    selected = select_pages(payload.get("pageRanges", ""), len(pages))
    document = canvas.Canvas(output, pagesize=(width, height), pageCompression=1, invariant=1, pdfVersion=(1, 4))
    document.setTitle("")
    document.setAuthor("")
    document.setSubject("")
    document.setCreator("")
    for index, page_index in enumerate(selected):
        if index:
            document.showPage()
        document.setFillColorRGB(34 / 255, 34 / 255, 34 / 255)
        for line, y in pages[page_index]:
            x = left + line["indent"]
            for run in line["runs"]:
                document.setFont(run["font"], run["size"])
                # Standard ActualText preserves Unicode selection even where a
                # subset font lacks a visual glyph or an astral CMap mapping.
                actual = "FEFF" + run["text"].encode("utf-16-be").hex().upper()
                document.addLiteral("/Span << /ActualText <" + actual + "> >> BDC")
                baseline = y + run["size"] * (31 / 32 if run["size"] >= 24 else 1)
                document.drawString(x, height - baseline, run["text"])
                document.addLiteral("EMC")
                x += run["width"]
    document.save()
    return {"data": base64.b64encode(output.getvalue()).decode("ascii"), "width": width, "height": height,
            "contentHeight": content_height, "lineCount": len(lines), "pageCount": len(selected),
            "totalPageCount": len(pages), "selectedPages": [index + 1 for index in selected],
            "clipped": False, "missingGlyphs": sorted(missing), "backend": backend}


if __name__ == "__main__":
    try:
        encoded = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
        if len(encoded) > 8 * 1024 * 1024:
            raise RenderFailure("Render input exceeds 8MiB", "RENDER_BOUNDS")
        result = main(json.loads(encoded))
        sys.stdout.write(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    except Exception as error:
        sys.stdout.write(json.dumps({"error": {"code": getattr(error, "code", "RENDER_BACKEND_ERROR"), "message": str(error)}}))
        sys.exit(1)
