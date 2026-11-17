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

            curr = res.invoice.metadata.currency or "INR"
            item_count = len(res.invoice.line_items)
            print(f"    [SUCCESS] Extracted via {res.provider} in {res.latency_ms:.0f}ms", flush=True)
            print(f"    Supplier:   {res.invoice.supplier.name} (Tax ID / GSTIN: {res.invoice.supplier.gstin})", flush=True)
            print(f"    Invoice No: {res.invoice.metadata.invoice_number} | Date: {res.invoice.metadata.invoice_date}", flush=True)
            print(f"    Items:      {item_count} line items extracted", flush=True)
            print(f"    Grand Total: {curr} {res.invoice.grand_total:,.2f} | Math Valid: {res.validation_passed}", flush=True)
            print(f"    Saved JSON: {output_file}", flush=True)

            results_summary.append({
                "file": filename,
                "status": "SUCCESS",
                "supplier": res.invoice.supplier.name or "N/A",
                "invoice_no": res.invoice.metadata.invoice_number or "N/A",
                "currency": curr,
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
            print(f"    [FAILED] {res.error_message or res.validation_errors}", flush=True)
            results_summary.append({
                "file": filename,
                "status": "FAILED",
                "supplier": "N/A",
                "invoice_no": "N/A",
                "currency": "N/A",
                "items": 0,
                "total": 0.0,
                "valid": False,
                "json_path": str(output_file)
            })

        import time
        time.sleep(1.0)

    print("\n" + "=" * 95, flush=True)
    print("EXTRACTION BATCH RUN COMPLETE - SUMMARY", flush=True)
    print("=" * 95, flush=True)
    print(f"{'File':<32} | {'Supplier':<25} | {'Invoice #':<12} | {'Items':<5} | {'Total':<16} | {'Valid'}", flush=True)
    print("-" * 105, flush=True)
    for r in results_summary:
        tot_str = f"{r.get('currency', '')} {r['total']:,.2f}"
        print(f"{r['file'][:32]:<32} | {r['supplier'][:25]:<25} | {r['invoice_no'][:12]:<12} | {r['items']:<5} | {tot_str:<16} | {r['valid']}", flush=True)
    print("=" * 95, flush=True)


if __name__ == "__main__":
    run_extraction_on_samples()
