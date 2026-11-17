"""
Batch runner script to execute AI extraction on all sample invoices in the samples/ folder.
Outputs formatted JSON files into outputs/ and displays a structured summary.
"""
import json
import logging
import sys
from pathlib import Path
from backend.app.services.extraction_service import ExtractionService

# Configure logging to keep output readable
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("run_samples")

def run_extraction_on_samples():
    samples_dir = Path("samples")
    output_dir = Path("outputs")
    output_dir.mkdir(parents=True, exist_ok=True)

    if not samples_dir.exists():
        print(f"Error: Directory '{samples_dir}' does not exist.")
        return

    sample_files = sorted([f for f in samples_dir.iterdir() if f.is_file()])
    if not sample_files:
        print(f"No files found in '{samples_dir}'.")
        return

    print("=" * 80)
    print(f"STARTING AI INVOICE EXTRACTION ON {len(sample_files)} SAMPLE DOCUMENTS")
    print("=" * 80)

    service = ExtractionService()
    results_summary = []

    for file_path in sample_files:
        filename = file_path.name
        print(f"\n--> Processing: {filename} ({file_path.stat().st_size:,} bytes)...")

        file_bytes = file_path.read_bytes()
        res = service.process_and_extract(filename, file_bytes)

        output_file = output_dir / f"{file_path.stem}_extracted.json"

        if res.success and res.invoice:
            inv_dict = res.invoice.model_dump()
            full_output = {
                "file_name": filename,
                "provider": res.provider,
                "model_name": res.model_name,
                "latency_ms": round(res.latency_ms, 2),
                "validation_passed": res.validation_passed,
                "validation_errors": res.validation_errors,
                "extracted_invoice": inv_dict
            }
            output_file.write_text(json.dumps(full_output, indent=2, ensure_ascii=False), encoding="utf-8")

            item_count = len(res.invoice.line_items)
            print(f"    [SUCCESS] Extracted via {res.provider} in {res.latency_ms:.0f}ms")
            print(f"    Supplier:   {res.invoice.supplier.name} (GSTIN: {res.invoice.supplier.gstin})")
            print(f"    Invoice No: {res.invoice.metadata.invoice_number} | Date: {res.invoice.metadata.invoice_date}")
            print(f"    Items:      {item_count} line items extracted")
            print(f"    Grand Total: INR {res.invoice.grand_total:,.2f} | Math Valid: {res.validation_passed}")
            print(f"    Saved JSON: {output_file}")

            results_summary.append({
                "file": filename,
                "status": "SUCCESS",
                "supplier": res.invoice.supplier.name,
                "invoice_no": res.invoice.metadata.invoice_number,
                "items": item_count,
                "total": res.invoice.grand_total,
                "valid": res.validation_passed,
                "json_path": str(output_file)
            })
        else:
            err_output = {
                "file_name": filename,
                "status": "FAILED",
                "error": res.error_message or res.validation_errors
            }
            output_file.write_text(json.dumps(err_output, indent=2), encoding="utf-8")
            print(f"    [FAILED] {res.error_message or res.validation_errors}")
            results_summary.append({
                "file": filename,
                "status": "FAILED",
                "supplier": "N/A",
                "invoice_no": "N/A",
                "items": 0,
                "total": 0.0,
                "valid": False,
                "json_path": str(output_file)
            })

        import time
        time.sleep(1.0)

    print("\n" + "=" * 80)
    print("EXTRACTION BATCH RUN COMPLETE - SUMMARY")
    print("=" * 80)
    print(f"{'File':<35} | {'Supplier':<25} | {'Invoice #':<15} | {'Items':<5} | {'Total (INR)':<12} | {'Valid'}")
    print("-" * 110)
    for r in results_summary:
        print(f"{r['file'][:35]:<35} | {r['supplier'][:25]:<25} | {r['invoice_no'][:15]:<15} | {r['items']:<5} | {r['total']:<12.2f} | {r['valid']}")
    print("=" * 80)


if __name__ == "__main__":
    run_extraction_on_samples()
