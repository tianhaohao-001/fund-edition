"""Transcribe one temporary PCM recording with an explicitly local Whisper model."""

import argparse
import json
import math
from pathlib import Path
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--language', default='zh-CN')
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    sys.path.insert(0, str(Path(args.runtime)))
    from faster_whisper import WhisperModel
    import numpy as np
    import av

    started = time.monotonic()
    samples = []
    count = 0
    with av.open(args.input) as recording:
        if not any(name in recording.format.name.split(',') for name in ['wav', 'mov', 'mp4', 'm4a', 'aac']):
            raise ValueError('Unsupported audio container.')
        streams = recording.streams.audio
        if len(streams) != 1:
            raise ValueError('A single audio track is required.')
        stream = streams[0]
        if stream.codec_context.channels > 2 or stream.codec_context.sample_rate > 192000:
            raise ValueError('Unsupported recording format.')
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
        for frame in recording.decode(stream):
            for normalized in resampler.resample(frame):
                chunk = normalized.to_ndarray().reshape(-1)
                count += chunk.size
                if count > 480000:
                    raise ValueError('Recording exceeds 30 seconds.')
                samples.append(chunk)
        for normalized in resampler.resample(None):
            chunk = normalized.to_ndarray().reshape(-1)
            count += chunk.size
            if count > 480000:
                raise ValueError('Recording exceeds 30 seconds.')
            samples.append(chunk)
    if count == 0:
        raise ValueError('The recording has no samples.')
    audio = np.concatenate(samples).astype(np.float32)
    model = WhisperModel(args.model, device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
    segments, info = model.transcribe(
        audio, language=args.language.split('-')[0], beam_size=5,
        temperature=0, condition_on_previous_text=False, vad_filter=True,
        initial_prompt=(
            '基金经理，惠灵顿基金，股债平衡，风险适中，中等风险，回撤，再平衡，现金，资产配置。'
            if args.language.startswith('zh')
            else 'Fund managers, Wellington Fund, portfolio allocation, VWELX, ARKK, FCNTX, JEPI, JEPQ, AGTHX, BOND, IVOL, PSTKX.'
        ),
    )
    results = list(segments)
    text = ''.join(segment.text for segment in results).strip()
    confidence = sum(math.exp(segment.avg_logprob) for segment in results) / len(results) if results else 0
    print(json.dumps({
        'text': text, 'confidence': confidence, 'language': args.language,
        'source': 'Whisper small · local CPU int8',
        'seconds': round(count / 16000, 3),
        'processingSeconds': round(time.monotonic() - started, 3),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
