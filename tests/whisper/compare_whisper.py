from pathlib import Path
import json
import time
import gc

import torch
import whisper


# Modelos a testar.
# No openai-whisper, "turbo" corresponde ao large-v3-turbo.
MODELS = [
    ("whisper small", "small"),
    ("whisper medium", "medium"),
    ("whisper large-v3-turbo", "turbo"),
]

AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"}

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_TXT = SCRIPT_DIR / "resultados_whisper.txt"
OUTPUT_JSON = SCRIPT_DIR / "resultados_whisper.json"


def find_audio_files():
    audio_files = [
        file for file in SCRIPT_DIR.iterdir()
        if file.is_file() and file.suffix.lower() in AUDIO_EXTENSIONS
    ]

    return sorted(audio_files, key=lambda p: p.name.lower())


def transcribe_audio(model, audio_path):
    result = model.transcribe(
        str(audio_path),
        language="pt",
        task="transcribe",
        temperature=0,
        fp16=torch.cuda.is_available(),
        verbose=False,
        condition_on_previous_text=False,
    )

    return result["text"].strip()


def main():
    audio_files = find_audio_files()

    if not audio_files:
        print("Não encontrei áudios na mesma pasta do script.")
        print("Mete ficheiros tipo audio1.wav e audio2.wav nesta pasta e volta a correr.")
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"

    print(f"Dispositivo usado: {device}")
    print("Áudios encontrados:")
    for audio in audio_files:
        print(f" - {audio.name}")

    print("\nA começar transcrições...\n")

    all_results = {}

    for audio_path in audio_files:
        all_results[audio_path.name] = {}

    for model_label, model_name in MODELS:
        print("=" * 80)
        print(f"A carregar modelo: {model_label} ({model_name})")
        print("=" * 80)

        start_model_time = time.time()

        model = whisper.load_model(model_name, device=device)

        for audio_path in audio_files:
            print(f"\nA transcrever {audio_path.name} com {model_label}...")

            start_audio_time = time.time()

            try:
                transcription = transcribe_audio(model, audio_path)
                elapsed = time.time() - start_audio_time

                all_results[audio_path.name][model_label] = {
                    "transcricao": transcription,
                    "tempo_segundos": round(elapsed, 2),
                }

                print(f"{model_label}: {transcription}")
                print(f"Tempo: {elapsed:.2f}s")

            except Exception as e:
                all_results[audio_path.name][model_label] = {
                    "erro": str(e)
                }
                print(f"Erro ao transcrever {audio_path.name} com {model_label}: {e}")

        total_model_time = time.time() - start_model_time
        print(f"\nTempo total com {model_label}: {total_model_time:.2f}s\n")

        # Libertar memória antes de carregar o próximo modelo.
        del model
        gc.collect()

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    # Guardar em TXT legível.
    with OUTPUT_TXT.open("w", encoding="utf-8") as f:
        for audio_name, model_results in all_results.items():
            f.write(f"{audio_name}\n")
            f.write("-" * len(audio_name) + "\n")

            for model_label, result in model_results.items():
                if "transcricao" in result:
                    f.write(f"{model_label}: {result['transcricao']}\n")
                    f.write(f"tempo: {result['tempo_segundos']}s\n")
                else:
                    f.write(f"{model_label}: ERRO - {result['erro']}\n")

                f.write("\n")

            f.write("\n")

    # Guardar também em JSON para análise futura.
    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 80)
    print("RESULTADO FINAL")
    print("=" * 80)

    for audio_name, model_results in all_results.items():
        print(f"\n{audio_name}")
        print("-" * len(audio_name))

        for model_label, result in model_results.items():
            if "transcricao" in result:
                print(f"{model_label}: {result['transcricao']}")
                print(f"tempo: {result['tempo_segundos']}s")
            else:
                print(f"{model_label}: ERRO - {result['erro']}")

            print()

    print(f"Resultados guardados em: {OUTPUT_TXT.name}")
    print(f"Resultados JSON guardados em: {OUTPUT_JSON.name}")


if __name__ == "__main__":
    main()