"""Render a Maya reply on the workspace CPU. Input is UTF-8, output is PCM WAV."""
import argparse
import io
import re
import sys
import wave
from pathlib import Path


def speech_text(words, language):
    words = re.sub(r"\[([^\]]+)\]\(https?://[^)]+\)", r"\1", words)
    words = re.sub(r"https?://\S+", "", words)
    words = re.sub(r"[*#`]", "", words)
    if language == "zh-CN":
        words = re.sub(r"(?<![A-Za-z])Maya(?![A-Za-z])", "玛雅", words, flags=re.IGNORECASE)
    # Keep short stock symbols and initialisms intelligible at conversation speed.
    words = re.sub(r"(?<![A-Za-z])[A-Z]{2,5}(?![A-Za-z])", lambda m: " ".join(m.group()), words)
    return words.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True, type=Path)
    parser.add_argument("--language", required=True, choices=["zh-CN", "en-US"])
    parser.add_argument("--speaker", type=int)
    parser.add_argument("--speed", type=float)
    parser.add_argument("--stream", action="store_true")
    args = parser.parse_args()
    words = sys.stdin.buffer.read(12000).decode("utf-8").strip()
    if not words or len(words) > 2400:
        raise ValueError("Invalid reply length")
    sys.path.insert(0, str(args.home / "narration"))
    import numpy as np
    import sherpa_onnx

    folder = args.home / "models" / "kokoro-int8-multi-lang-v1_1"
    model = sherpa_onnx.OfflineTtsKokoroModelConfig(
        model=str(folder / "model.int8.onnx"), tokens=str(folder / "tokens.txt"),
        voices=str(folder / "voices.bin"), data_dir=str(folder / "espeak-ng-data"),
        lexicon=",".join(str(folder / f) for f in ["lexicon-us-en.txt", "lexicon-zh.txt"]),
    )
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(kokoro=model, num_threads=3),
        rule_fsts=",".join(str(folder / f) for f in ["date-zh.fst", "number-zh.fst", "phone-zh.fst"]),
        max_num_sentences=1, silence_scale=0.75,
    )
    speaker, speed = (8, 0.98) if args.language == "zh-CN" else (0, 0.99)
    voice = sherpa_onnx.OfflineTts(config)
    speaker = speaker if args.speaker is None else args.speaker
    speed = speed if args.speed is None else args.speed
    text = speech_text(words, args.language)
    if args.stream:
        # Keep punctuation and decimal prices intact while producing the first phrase early.
        parts = re.split(r"(?<=[，。！？；])|(?<=[.!?,;])(?=\s)|[\n]+", text)
        phrase = ""
        sent = False
        for i, part in enumerate(parts):
            phrase += part
            if not phrase.strip() or (len(phrase.strip()) < (12 if args.language == "zh-CN" else 30) and i < len(parts)-1):
                continue
            chunk = np.asarray(voice.generate(phrase.strip(), sid=speaker, speed=speed).samples)
            if chunk.size and np.all(np.isfinite(chunk)):
                sys.stdout.buffer.write((np.clip(chunk, -1, 1) * 32767).astype("<i2").tobytes())
                sys.stdout.buffer.flush()
                sent = True
            phrase = ""
        if not sent:
            raise ValueError("No usable speech")
        return
    recording = voice.generate(text, sid=speaker, speed=speed)
    samples = np.asarray(recording.samples, dtype=np.float32)
    if samples.size == 0 or not np.all(np.isfinite(samples)):
        raise ValueError("No usable audio returned")
    with io.BytesIO() as output:
        with wave.open(output, "wb") as audio:
            audio.setparams((1, 2, recording.sample_rate, 0, "NONE", "not compressed"))
            audio.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        sys.stdout.buffer.write(output.getvalue())


if __name__ == "__main__":
    main()
