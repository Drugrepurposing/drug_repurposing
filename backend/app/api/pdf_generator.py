"""
PDF Research Report Generator for Autonomous Drug Repurposing Discovery Pipeline.
Generates publication-ready PDF reports with tables, metrics, and docking summaries using ReportLab.
"""

import io
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

def generate_pipeline_pdf_report(disease_name: str, disease_category: str, candidates: list) -> bytes:
    """Generates PDF binary stream for drug repurposing search results."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0F172A'),
        fontName='Helvetica-Bold'
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#475569'),
        fontName='Helvetica'
    )

    heading2_style = ParagraphStyle(
        'Heading2Custom',
        parent=styles['Heading2'],
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#1E293B'),
        fontName='Helvetica-Bold',
        spaceBefore=12,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        'BodyCustom',
        parent=styles['BodyText'],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        fontName='Helvetica'
    )

    elements = []

    # Title & Subtitle
    elements.append(Paragraph("Autonomous Drug Repurposing Discovery Pipeline", title_style))
    elements.append(Paragraph("AI-Driven Multi-Omics, GNN Topological Prediction & Biophysical Docking Report", subtitle_style))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph("Authors: R. Manoj Kumar, M. Faizuddin Uzair, U. Abhishek | Guide: Mr. K. Sandeep (GRIET Hyderabad)", subtitle_style))
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#2563EB'), spaceAfter=12))

    # Executive Summary Section
    elements.append(Paragraph(f"Executive Summary — Target Disease: {disease_name} ({disease_category})", heading2_style))
    exec_summary_text = (
        f"This report presents top AI-predicted drug repurposing candidates for <b>{disease_name}</b>. "
        f"The pipeline integrated 4 data modalities (genomic expression, PPI networks, chemical fingerprints, and clinical trial records) "
        f"and evaluated candidates using Graph Neural Network (GNN) interaction models, LINCS L1000 gene signature reversal, "
        f"AutoDock Vina biophysical docking (\u0394G in kcal/mol), and SciBERT literature text mining."
    )
    elements.append(Paragraph(exec_summary_text, body_style))
    elements.append(Spacer(1, 12))

    # Candidates Table
    elements.append(Paragraph("Top Ranked Repurposing Candidates", heading2_style))
    
    table_data = [
        ["Rank", "Drug Name", "Target Gene", "GNN Score", "Docking \u0394G", "Safety Score", "Overall Score", "Validation"]
    ]

    for c in candidates[:8]:
        table_data.append([
            str(c.get("rank", "-")),
            c.get("name", "Unknown"),
            c.get("target_gene", "-"),
            f"{c.get('gnn_dti_score', 0):.3f}",
            f"{c.get('docking_delta_g', 0):.1f} kcal/mol",
            f"{c.get('safety_score', 0):.2f}",
            f"{c.get('overall_score', 0):.3f}",
            "PASSED" if c.get("validation_passed", True) else "PENALIZED"
        ])

    cand_table = Table(table_data, colWidths=[35, 95, 70, 65, 80, 65, 65, 65])
    cand_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
    ]))
    
    elements.append(cand_table)
    elements.append(Spacer(1, 14))

    # Top Candidate Mechanism Breakdown
    if candidates:
        top_c = candidates[0]
        elements.append(Paragraph(f"Top Candidate Detail — {top_c.get('name')} (Rank #1)", heading2_style))
        narrative = top_c.get("explainability_narrative", "Detailed biophysical and multi-omics explanation.")
        elements.append(Paragraph(f"<b>Mechanism & Explainability:</b> {narrative}", body_style))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(f"<b>SMILES Structure:</b> <font name='Courier'>{top_c.get('smiles', 'N/A')}</font>", body_style))
        elements.append(Paragraph(f"<b>PDB Binding Pocket:</b> {top_c.get('pdb_id')} | <b>Est. Ki:</b> {top_c.get('estimated_ki_nm')} nM | <b>Safety Profile:</b> {top_c.get('safety_profile')}", body_style))

    elements.append(Spacer(1, 14))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#E2E8F0'), spaceAfter=8))
    elements.append(Paragraph("Generated by Autonomous Drug Repurposing Discovery Pipeline Engine | GRIET Hyderabad", subtitle_style))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
