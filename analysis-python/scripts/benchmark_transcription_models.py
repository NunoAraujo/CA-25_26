import argparse
import csv
import json
import sys
from pathlib import Path

from jiwer import cer, wer

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from app.services.transcription import (  # noqa: E402
    list_available_asr_models,
    transcribe_audio,
)


def load_references(reference_csv: str | None) -> dict[str, str]:
    if not reference_csv:
        return {}

    references: dict[str, str] = {}
    with open(reference_csv, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            filename = (row.get("filename") or "").strip()
            text = (row.get("reference") or row.get("text") or "").strip()
            if filename and text:
                references[filename] = text
    return references


def resolve_model_keys(raw: str) -> list[str]:
    available = [item["key"] for item in list_available_asr_models()]
    if raw.strip().lower() == "all":
        return available
    values = [value.strip() for value in raw.split(",") if value.strip()]
    return values or available


def collect_audio_files(audio_dir: str) -> list[Path]:
    root = Path(audio_dir)
    patterns = ["*.wav", "*.mp3", "*.ogg", "*.webm", "*.m4a"]
    results: list[Path] = []
    for pattern in patterns:
        results.extend(sorted(root.glob(pattern)))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark several STT models on the project's audio files.",
    )
    parser.add_argument("--audio-dir", required=True, help="Directory with audio files")
    parser.add_argument(
        "--models",
        default="whisper_small,whisper_medium,whisper_large_v3_turbo",
        help="Comma-separated model keys or 'all'",
    )
    parser.add_argument("--language", default="pt-PT", help="Language hint for ASR")
    parser.add_argument(
        "--references",
        default=None,
        help="Optional CSV with columns filename,reference for WER/CER",
    )
    parser.add_argument(
        "--output",
        default="transcription_benchmark_results.json",
        help="Output JSON file",
    )
    args = parser.parse_args()

    audio_files = collect_audio_files(args.audio_dir)
    if not audio_files:
        print("Nenhum ficheiro de áudio encontrado.")
        return 1

    references = load_references(args.references)
    model_keys = resolve_model_keys(args.models)

    results: list[dict] = []
    summary: dict[str, dict[str, float]] = {}

    for model_key in model_keys:
        model_entries: list[dict] = []
        for audio_file in audio_files:
            transcription = transcribe_audio(
                str(audio_file),
                args.language,
                model_key=model_key,
            )
            record = {
                "file": audio_file.name,
                "model_key": transcription.model_key,
                "model_id": transcription.model_id,
                "provider": transcription.provider,
                "latency_ms": round(transcription.latency_ms, 2),
                "used_fallback": transcription.used_fallback,
                "transcription": transcription.text,
            }

            reference_text = references.get(audio_file.name)
            if reference_text:
                record["reference"] = reference_text
                record["wer"] = wer(reference_text, transcription.text)
                record["cer"] = cer(reference_text, transcription.text)

            results.append(record)
            model_entries.append(record)
            print(f"[{transcription.model_key}] {audio_file.name}: {transcription.text}")

        avg_latency = sum(item["latency_ms"] for item in model_entries) / len(model_entries)
        summary[model_key] = {
            "avg_latency_ms": round(avg_latency, 2),
            "files_tested": len(model_entries),
        }

        wer_values = [item["wer"] for item in model_entries if "wer" in item]
        cer_values = [item["cer"] for item in model_entries if "cer" in item]
        if wer_values:
            summary[model_key]["avg_wer"] = round(sum(wer_values) / len(wer_values), 4)
        if cer_values:
            summary[model_key]["avg_cer"] = round(sum(cer_values) / len(cer_values), 4)

    output_payload = {
        "language": args.language,
        "models": model_keys,
        "summary": summary,
        "results": results,
    }

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(output_payload, handle, ensure_ascii=False, indent=2)

    print(f"Resultados guardados em {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
