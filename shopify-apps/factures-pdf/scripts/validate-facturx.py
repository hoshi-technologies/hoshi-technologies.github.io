"""Valide une facture Factur-X : XSD officiel, schematron EN 16931 et schematron français (BR-FR).

    pip install factur-x saxonche
    python scripts/validate-facturx.py facture.pdf
"""
import os
import re
import sys

import facturx
from facturx import get_facturx_xml_from_pdf, xml_check_xsd
from saxonche import PySaxonProcessor

RULES = {
    "EN 16931": "facturx-en16931/FACTUR-X_EN16931.xslt",
    "France BR-FR": "cii-schematron-fr-ctc/BR-FR-Flux2-Schematron-CII.xslt",
}
BASE = os.path.join(os.path.dirname(facturx.__file__), "xsd_and_schematron")

failed = False
with PySaxonProcessor(license=False) as proc:
    xslt = proc.new_xslt30_processor()
    for pdf in sys.argv[1:]:
        with open(pdf, "rb") as f:
            name, xml = get_facturx_xml_from_pdf(f, check_xsd=False)
        print(f"{pdf} : {name}, XSD {'ok' if xml_check_xsd(xml, flavor='factur-x', level='en16931') else 'KO'}")
        node = proc.parse_xml(xml_text=xml.decode("utf-8"))
        for label, path in RULES.items():
            svrl = xslt.compile_stylesheet(stylesheet_file=os.path.join(BASE, path)).transform_to_string(xdm_node=node)
            errors = re.findall(r'<svrl:failed-assert[^>]*id="([^"]*)"[\s\S]*?<svrl:text>([\s\S]*?)</svrl:text>', svrl)
            failed |= bool(errors)
            print(f"  {label} : {len(errors)} erreur(s)")
            for rule, text in errors:
                print(f"    {rule} : {' '.join(text.split())[:200]}")
sys.exit(1 if failed else 0)
