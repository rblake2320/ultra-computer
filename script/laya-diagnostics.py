"""Optional local classifier. It receives structured text, has no action authority."""
import json
import os
import sys
import time
import warnings
from pathlib import Path

os.environ["USE_TF"] = "0"
os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parents[1] / "data" / "laya-cache"))

REPO = "convaiinnovations/laya"
REVISION = "7b928d828b7b0e022f929d9bd2e44165aa270148"

def main():
    import laya
    from huggingface_hub import snapshot_download
    started = time.perf_counter()
    model_path = snapshot_download(REPO, revision=REVISION, allow_patterns=[
        "rl_agent_config.json", "model.safetensors", "tokenizer/*", "encoder/*"
    ])
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        agent = laya.load(model_path, device="cpu")
    questions = {"route": {"type": "choice", "instructions": "Which team should handle this report?",
        "criteria": {"A": "technical support for software bugs and installation errors",
                     "B": "billing for invoices and duplicate charges",
                     "C": "sales for product pricing and purchase questions"}}}
    cases = [
        ("The installer cannot open the database and exits with an error.", "A"),
        ("The AI server stopped responding and requests time out.", "A"),
        ("The program crashes after I upload a file.", "A"),
        ("My invoice has two charges for the same subscription. Please refund one.", "B"),
        ("Why was my credit card charged twice this month?", "B"),
        ("Please send me a receipt for the payment on my invoice.", "B"),
        ("How much does the enterprise subscription cost?", "C"),
        ("Can your sales team give me a quote for twenty seats?", "C"),
    ]
    if len(sys.argv) > 1:
        text = Path(sys.argv[1]).read_text(encoding="utf-8")
        if len(text) > 65536:
            raise ValueError("Structured diagnostics must be at most 64 KiB")
        state = json.loads(text)
        allowed = {"phase", "status", "errorCode", "summary"}
        if not isinstance(state, dict) or set(state) - allowed:
            raise ValueError("Use phase, status, errorCode and summary fields only; omit secrets and raw logs")
        result = agent.predict(state, questions)
        print(json.dumps({"model": REPO, "revision": REVISION, "authority": "advisory", "inputKind": "structured text", "result": result,
            "warnings": [str(w.message) for w in caught]}))
        return
    results = []
    for text, expected in cases:
        t = time.perf_counter()
        answer = agent.predict({"summary": text}, questions)["answers"]["route"]
        results.append({"expected": expected, "actual": answer["choice"], "worked": answer["choice"] == expected,
            "confidence": answer["confidence"], "latencyMs": round((time.perf_counter() - t) * 1000, 2)})
    print(json.dumps({"model": REPO, "revision": REVISION, "device": "cpu", "authority": "advisory", "inputKind": "structured text",
        "correct": sum(r["worked"] for r in results), "cases": len(results), "totalSeconds": round(time.perf_counter()-started, 2),
        "warnings": [str(w.message) for w in caught], "results": results}))

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "Failed", "errorType": type(error).__name__, "error": str(error)}))
        sys.exit(1)
