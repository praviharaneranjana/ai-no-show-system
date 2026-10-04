import os
import sys
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_page_margins(section):
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.25)
    section.right_margin = Inches(1.0)

def add_p(doc, text="", align=WD_ALIGN_PARAGRAPH.LEFT, space_before=0, space_after=6, bold=False, italic=False, size=12):
    p = doc.add_paragraph()
    p.alignment = align
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    if text:
        run = p.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.name = 'Times New Roman'
        run.font.size = Pt(size)
    return p

def add_h1(doc, text):
    # Chapter: Bold capital Font 12 (e.g. 1 INTRODUCTION)
    return add_p(doc, text.upper(), space_before=18, space_after=8, bold=True, size=12)

def add_h2(doc, text):
    # Sub-section: Bold Simple Font 12 (e.g. 1.1 Justification)
    return add_p(doc, text, space_before=14, space_after=6, bold=True, size=12)

def add_h3(doc, text):
    # Sub-sub-section: Simple Font 12 (Only first letter capitalized)
    return add_p(doc, text, space_before=10, space_after=4, bold=False, size=12)

def add_h4(doc, text):
    # Sub-sub-sub-section: Simple Font 12
    return add_p(doc, text, space_before=8, space_after=4, bold=False, size=12)

def add_callout(doc, text, prefix="NOTE:"):
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.left_indent = Inches(0.5)
    p.paragraph_format.right_indent = Inches(0.5)
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(6)
    r1 = p.add_run(f"[{prefix}] ")
    r1.bold = True
    r1.font.name = 'Times New Roman'
    r1.font.size = Pt(11)
    r2 = p.add_run(text)
    r2.italic = True
    r2.font.name = 'Times New Roman'
    r2.font.size = Pt(11)
    return p

def add_caption_table(doc, number_str, title_str):
    # Caption above table, font 12
    return add_p(doc, f"Table {number_str}: {title_str}", space_before=12, space_after=4, bold=False, size=12)

def add_caption_figure(doc, number_str, title_str):
    # Caption below figure, font 12
    return add_p(doc, f"Figure {number_str}: {title_str}", space_before=6, space_after=12, bold=False, size=12)

def add_figure_image(doc, img_path, width_inches=5.8):
    if os.path.exists(img_path):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run()
        run.add_picture(img_path, width=Inches(width_inches))
        return True
    return False

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(r'<w:tcMar %s><w:top w:w="%d" w:type="dxa"/><w:bottom w:w="%d" w:type="dxa"/><w:left w:w="%d" w:type="dxa"/><w:right w:w="%d" w:type="dxa"/></w:tcMar>' % (nsdecls('w'), top, bottom, left, right))
    tcPr.append(tcMar)

def set_table_borders(table):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        r'<w:tblBorders %s>'
        r'  <w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
        r'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
        r'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>'
        r'  <w:insideV w:val="none"/>'
        r'  <w:left w:val="none"/>'
        r'  <w:right w:val="none"/>'
        r'</w:tblBorders>' % nsdecls('w')
    )
    tblPr.append(borders)

def format_custom_table(table, col_widths=None):
    set_table_borders(table)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(table.rows):
        # Tr height
        trPr = row._tr.get_or_add_trPr()
        trPr.append(parse_xml(r'<w:cantSplit %s/>' % nsdecls('w')))
        if i == 0:
            trPr.append(parse_xml(r'<w:tblHeader %s/>' % nsdecls('w')))
        for j, cell in enumerate(row.cells):
            set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
            if col_widths and j < len(col_widths):
                cell.width = Inches(col_widths[j])
            for p in cell.paragraphs:
                p.paragraph_format.line_spacing = 1.15
                p.paragraph_format.space_before = Pt(2)
                p.paragraph_format.space_after = Pt(2)
                for run in p.runs:
                    run.font.name = 'Times New Roman'
                    run.font.size = Pt(11)
                    if i == 0:
                        run.bold = True
