#!/usr/bin/env python3
"""listen: turn a piece of audio into something I can perceive, a picture and a plain-words account.

    python3 studio/senses/listen.py song.wav [--out dir] [--start 10 --end 40] [--name label]

Works on .wav/.flac/.ogg directly and on anything ffmpeg can read (mp3, mp4, mov...).

Writes <out>/<name>.listen.png and <name>.listen.txt (and .json). The picture has five panels:
  1. loudness over time (short-term LUFS) over the waveform envelope
  2. spectrogram on a musical (log) frequency axis, with note names, beat lines and section marks
  3. chromagram: how much of each of the 12 pitch classes is sounding, with the chords it implies
  4. where the energy sits: sub / bass / low-mid / high-mid / air, stacked, over time
  5. rhythm: onset strength (hits) with the tracked beats

The text says: tempo, key, loudness, true peak, clipping, stereo, band balance, chords by bar,
sections and how they differ, and anything that sounds wrong (clipping, mud, harshness, silence gaps).
Numbers only; no taste. Taste is my job, this just gives me ears.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from scipy import signal as sg

SR = 22050            # analysis rate
NFFT = 4096
HOP = 512
NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


# ----------------------------------------------------------------------------- loading
def load(path: str, start: float | None = None, end: float | None = None):
    """Return (stereo float array shape (2, n) at native rate, native rate)."""
    try:
        x, sr = sf.read(path, always_2d=True)
    except Exception:
        tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False).name
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-vn', '-ac', '2', '-ar', '44100', tmp], check=True)
        x, sr = sf.read(tmp, always_2d=True)
        os.unlink(tmp)
    x = x.T.astype(np.float64)
    if x.shape[0] == 1:
        x = np.vstack([x, x])
    x = x[:2]
    a = int((start or 0) * sr)
    b = int(end * sr) if end else x.shape[1]
    return x[:, a:b], sr


def to_analysis_rate(x: np.ndarray, sr: int) -> np.ndarray:
    mono = x.mean(0)
    if sr == SR:
        return mono
    from math import gcd
    g = gcd(sr, SR)
    return sg.resample_poly(mono, SR // g, sr // g)


# ----------------------------------------------------------------------------- core features
def stft_mag(y: np.ndarray) -> np.ndarray:
    _, _, Z = sg.stft(y, fs=SR, window='hann', nperseg=NFFT, noverlap=NFFT - HOP, boundary=None, padded=True)
    return np.abs(Z)  # (bins, frames)


def semitone_spectrum(mag: np.ndarray, lo: int = 24, hi: int = 120) -> tuple[np.ndarray, np.ndarray]:
    """Map linear STFT bins onto semitone bands (MIDI lo..hi-1). Returns (power, midi numbers)."""
    freqs = np.arange(mag.shape[0]) * SR / NFFT
    pw = mag ** 2
    midis = np.arange(lo, hi)
    out = np.zeros((len(midis), mag.shape[1]))
    for i, m in enumerate(midis):
        f0 = 440 * 2 ** ((m - 69 - 0.5) / 12)
        f1 = 440 * 2 ** ((m - 69 + 0.5) / 12)
        sel = (freqs >= f0) & (freqs < f1)
        if sel.any():
            out[i] = pw[sel].sum(0)
        else:  # band narrower than a bin: interpolate from the nearest bin
            fc = 440 * 2 ** ((m - 69) / 12)
            k = fc / (SR / NFFT)
            k0 = int(np.floor(k)); w = k - k0
            out[i] = (1 - w) * pw[k0] + w * pw[min(k0 + 1, pw.shape[0] - 1)]
            out[i] *= (f1 - f0) / (SR / NFFT)
    return out, midis


def chroma_from(semi: np.ndarray, midis: np.ndarray) -> np.ndarray:
    # Pitch classes from the musically useful range (C2..C7), log-compressed so one loud note doesn't own it.
    sel = (midis >= 36) & (midis < 96)
    s = np.log1p(semi[sel] * 1e3)
    c = np.zeros((12, semi.shape[1]))
    for m, row in zip(midis[sel], s):
        c[m % 12] += row
    c /= (np.linalg.norm(c, axis=0, keepdims=True) + 1e-9)
    return c


NFFT_ON = 1024  # short window for timing: the 4096 window above is for pitch, and smears hits by ~90 ms


def frame_times(n_frames: int, nfft: int) -> np.ndarray:
    """Centre time of each STFT frame (frames start at k*HOP; the middle of the window is nfft/2 later)."""
    return (np.arange(n_frames) * HOP + nfft / 2) / SR


def onset_curve(y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Spectral-flux onset strength on log-spaced bands. Returns (strength 0..1, times in s)."""
    _, _, Z = sg.stft(y, fs=SR, window='hann', nperseg=NFFT_ON, noverlap=NFFT_ON - HOP, boundary=None, padded=True)
    P = np.abs(Z) ** 2
    freqs = np.arange(P.shape[0]) * SR / NFFT_ON
    edges = np.geomspace(30, SR / 2 * 0.95, 41)
    B = np.array([P[(freqs >= a) & (freqs < b)].sum(0) for a, b in zip(edges[:-1], edges[1:])])
    L = np.log1p(B * 1e4)
    flux = np.concatenate([[0], np.maximum(0, np.diff(L, axis=1)).sum(0)])
    flux = np.maximum(flux - sg.medfilt(flux, 9) * 0.5, 0)
    # the rise between frame k-1 and k happens between their centres
    t = frame_times(len(flux), NFFT_ON) - HOP / SR / 2
    return flux / (flux.max() + 1e-9), t


def tempo_and_beats(onset: np.ndarray) -> tuple[float, np.ndarray, float]:
    """Autocorrelation tempo with a gentle prior around 120 BPM, then dynamic-programming beat tracking.
    Returns (bpm, beat frame indices, confidence 0..1)."""
    fps = SR / HOP
    o = onset - onset.mean()
    ac = np.correlate(o, o, mode='full')[len(o) - 1:]
    ac /= ac[0] + 1e-9
    lags = np.arange(len(ac))
    bpm_of = lambda lag: 60 * fps / lag
    valid = (lags > 0) & (bpm_of(np.maximum(lags, 1)) >= 55) & (bpm_of(np.maximum(lags, 1)) <= 210)
    prior = np.exp(-0.5 * (np.log2(bpm_of(np.maximum(lags, 1)) / 120) / 0.9) ** 2)
    score = np.where(valid, ac * prior, -np.inf)
    lag = int(np.argmax(score))
    # refine with parabolic interpolation
    if 1 <= lag < len(ac) - 1:
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        d = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
        lagf = lag + float(np.clip(d, -0.5, 0.5))
    else:
        lagf = float(lag)
    bpm = bpm_of(lagf)
    conf = float(np.clip(ac[lag] / (np.max(ac[valid]) + 1e-9), 0, 1)) * float(np.clip(ac[lag] * 3, 0, 1))

    # Ellis-style DP beat tracker
    period = lagf
    n = len(onset)
    cum = onset.copy()
    back = np.full(n, -1)
    tight = 100.0
    for i in range(n):
        lo = int(i - 2 * period); hi = int(i - period / 2)
        if hi <= 0:
            continue
        lo = max(lo, 0)
        prev = np.arange(lo, hi)
        pen = -tight * (np.log((i - prev) / period)) ** 2
        j = int(np.argmax(cum[prev] + pen))
        cum[i] = onset[i] + cum[prev][j] + pen[j]
        back[i] = prev[j]
    # start from the best of the last period
    tail = np.arange(max(0, n - int(period)), n)
    i = int(tail[np.argmax(cum[tail])])
    beats = []
    while i >= 0:
        beats.append(i)
        i = back[i]
    return bpm, np.array(beats[::-1]), conf


# ----------------------------------------------------------------------------- melody
def melody_line(semi: np.ndarray, midis: np.ndarray, onset_frames=None, lo: int = 55, hi: int = 96) -> np.ndarray:
    """The most salient pitch per frame in the melody register (harmonic sum), or nan when nothing stands out.
    A held chord spreads its energy over several pitches; a melody note sticks up above them."""
    idx = {m: i for i, m in enumerate(midis)}
    L = np.log1p(semi * 1e4)
    # whiten over time: subtract each pitch's running floor so sustained pad notes fade from salience
    floor = sg.medfilt(L, [1, 31])
    Lw = np.maximum(L - floor * 0.85, 0)
    cands = [m for m in range(lo, hi) if m in idx]
    sal = np.zeros((len(cands), semi.shape[1]))
    for j, m in enumerate(cands):
        acc = Lw[idx[m]].copy()
        for h, w in ((12, 0.5), (19, 0.33), (24, 0.25)):
            if m + h in idx:
                acc += w * Lw[idx[m + h]]
        if m - 12 in idx and m - 12 >= lo - 12:  # energy an octave below means this is probably its overtone
            acc -= 1.1 * Lw[idx[m - 12]]
        if m - 19 in idx:                        # ...or the 3rd harmonic of a note a 12th below
            acc -= 0.5 * Lw[idx[m - 19]]
        sal[j] = acc
    best = np.argmax(sal, 0)
    top = sal[best, np.arange(sal.shape[1])]
    second = np.partition(sal, -2, axis=0)[-2]
    voiced = (top > np.percentile(top, 55)) & (top > 1.25 * np.maximum(second, 1e-9))
    pitch = np.array(cands, float)[best]
    # octave check: walk down while the octave below has real (whitened) energy of its own. The lowest octave
    # with energy is the note; the ones above it are its overtones.
    for f in np.nonzero(voiced)[0]:
        m = int(pitch[f])
        while m - 12 >= lo and (m - 12) in idx and Lw[idx[m - 12], f] >= 0.3 * Lw[idx[m], f] and Lw[idx[m - 12], f] > 0.2:
            m -= 12
        pitch[f] = m
    line = np.where(voiced, pitch, np.nan)
    # steady within notes: a 5-frame median over voiced frames, then drop one-frame blips
    out = line.copy()
    for i in range(len(line)):
        w = line[max(0, i - 2):i + 3]
        w = w[~np.isnan(w)]
        if not np.isnan(line[i]) and len(w) >= 3:
            out[i] = float(np.median(w))
    for i in range(1, len(out) - 1):
        if not np.isnan(out[i]) and np.isnan(out[i - 1]) and np.isnan(out[i + 1]):
            out[i] = np.nan
    return np.round(out)


def melody_notes(semi: np.ndarray, midis: np.ndarray, ftimes: np.ndarray, onset: np.ndarray, otimes: np.ndarray,
                 lo: int = 55, hi: int = 96) -> list[tuple[float, float, int]]:
    """Melody by attacks: at each onset, look only at the energy that just APPEARED (spectrum after minus before).
    A held pad or chord doesn't change at the attack, so it drops out; the new note's harmonic series stands out.
    Name the note by harmonic sum over that difference, then take the lowest octave that has new energy of its own.
    Returns (start, end, midi) with each note lasting until the next attack or until it fades."""
    idx = {m: i for i, m in enumerate(midis)}
    L = np.log1p(semi * 1e4)
    pk, _ = sg.find_peaks(onset, height=0.12, prominence=0.08, distance=max(2, int(0.08 * SR / HOP)))
    A = np.sqrt(semi)                                   # amplitude: added energy, not added log-energy
    notes = []
    frames = L.shape[1]
    for p in pk:
        t = otimes[p]
        f = int(np.clip(round((t * SR - NFFT / 2) / HOP), 0, frames - 1))
        after = A[:, min(frames - 1, f + 2):min(frames, f + 6)].max(1)
        before = A[:, max(0, f - 5):max(1, f - 2)].mean(1)
        d = np.maximum(after - 1.15 * before, 0)
        d = d / (d.max() + 1e-12)
        best, bestv = None, 0.0
        for m in range(lo, hi):
            if m not in idx:
                continue
            v = d[idx[m]] + sum(w * d[idx[m + h]] for h, w in ((12, 0.5), (19, 0.33), (24, 0.25), (28, 0.2)) if m + h in idx)
            if v > bestv:
                best, bestv = m, v
        if best is None or d[idx[best]] < 0.2:
            continue
        m = best
        # Missing fundamental: energy at 1.5x this pitch (a fifth above) can only be the 3rd harmonic of the
        # note an octave down, so that lower note is the real one even if its own fundamental is hidden
        # (masked by a held chord tone, or just weak, as in FM pianos).
        while m - 12 >= lo and (d[idx[m - 12]] >= 0.35 * d[idx[m]] or (m + 7 in idx and d[idx[m + 7]] >= 0.35 * d[idx[m]])):
            m -= 12
        # how long it lasts: until its own band falls back near where it started, or the next attack
        start_level = before[idx[m]]
        peak_level = after[idx[m]]
        end_f = f + 2
        while end_f < frames - 1 and A[idx[m], end_f] > start_level + 0.25 * (peak_level - start_level):
            end_f += 1
        notes.append([float(t), float(ftimes[end_f]), int(m)])
    for i in range(len(notes) - 1):
        notes[i][1] = min(notes[i][1], notes[i + 1][0])
    return [tuple(n) for n in notes if n[1] - n[0] > 0.04]


def notes_to_line(notes, ftimes):
    line = np.full(len(ftimes), np.nan)
    for a, b, m in notes:
        line[(ftimes >= a) & (ftimes < b)] = m
    return line


# ----------------------------------------------------------------------------- harmony
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def estimate_key(chroma: np.ndarray) -> tuple[str, float, str]:
    total = chroma.sum(1)
    best = []
    for tonic in range(12):
        for mode, prof in (('major', MAJOR_PROFILE), ('minor', MINOR_PROFILE)):
            r = np.corrcoef(total, np.roll(prof, tonic))[0, 1]
            best.append((r, f'{NOTE_NAMES[tonic]} {mode}'))
    best.sort(reverse=True)
    return best[0][1], float(best[0][0]), best[1][1]


def chord_templates():
    names, T = [], []
    for root in range(12):
        for q, ivs in (('', (0, 4, 7)), ('m', (0, 3, 7))):
            t = np.zeros(12)
            for iv in ivs:
                t[(root + iv) % 12] = 1
            t[root] += 0.3  # root a little stronger
            names.append(NOTE_NAMES[root] + q)
            T.append(t / np.linalg.norm(t))
    names.append('N')  # no chord
    T.append(np.ones(12) / np.sqrt(12))
    return names, np.array(T)


def chords_over(chroma: np.ndarray, energy: np.ndarray, segs: list[tuple[int, int]]) -> list[str]:
    """Label each segment (frame ranges) with a chord, smoothed with a Viterbi pass that prefers staying put."""
    names, T = chord_templates()
    feats = []
    for a, b in segs:
        c = chroma[:, a:max(b, a + 1)].mean(1)
        feats.append(c / (np.linalg.norm(c) + 1e-9))
    feats = np.array(feats)
    sim = feats @ T.T                                    # (segments, chords)
    quiet = np.array([energy[a:max(b, a + 1)].mean() for a, b in segs]) < 0.02 * (energy.max() + 1e-12)
    sim[:, -1] = np.where(quiet, 2.0, 0.55)              # "no chord" only wins in near-silence or mush
    logp = np.log(np.clip(sim, 1e-3, None)) * 8
    stay = 1.5
    n, k = logp.shape
    V = logp[0].copy(); B = np.zeros((n, k), int)
    for i in range(1, n):
        trans = V[:, None] + np.where(np.eye(k, dtype=bool), stay, 0.0)
        B[i] = np.argmax(trans, 0)
        V = trans[B[i], np.arange(k)] + logp[i]
    path = [int(np.argmax(V))]
    for i in range(n - 1, 0, -1):
        path.append(B[i][path[-1]])
    return [names[j] for j in path[::-1]]


# ----------------------------------------------------------------------------- loudness, bands, stereo
def loudness_stats(x: np.ndarray, sr: int) -> dict:
    import pyloudnorm as pyln
    meter = pyln.Meter(sr)
    out = {}
    try:
        out['integrated_lufs'] = float(meter.integrated_loudness(x.T))
    except Exception:
        out['integrated_lufs'] = float('nan')
    # short-term (3 s window, 0.5 s hop)
    win, hop = int(3 * sr), int(0.5 * sr)
    st, times = [], []
    for a in range(0, max(1, x.shape[1] - win + 1), hop):
        seg = x[:, a:a + win]
        try:
            v = meter.integrated_loudness(seg.T) if seg.shape[1] >= int(0.4 * sr) else -70
        except Exception:
            v = -70
        st.append(max(v, -70)); times.append((a + win / 2) / sr)
    out['short_term'] = (np.array(times), np.array(st))
    up = np.vstack([sg.resample_poly(x[c], 4, 1) for c in range(2)])
    tp = float(np.max(np.abs(up)))
    out['true_peak_dbtp'] = 20 * np.log10(tp + 1e-12)
    out['sample_peak_db'] = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
    out['clipped_samples'] = int(np.sum(np.abs(x) >= 0.999))
    loud = out['short_term'][1]
    loud = loud[loud > -60]
    out['loudness_range_lu'] = float(np.percentile(loud, 95) - np.percentile(loud, 10)) if len(loud) > 2 else 0.0
    rms = np.sqrt(np.mean(x ** 2)) + 1e-12
    out['crest_db'] = 20 * np.log10(np.max(np.abs(x)) / rms + 1e-12)
    return out


BANDS = [('sub', 20, 60), ('bass', 60, 250), ('low-mid', 250, 2000), ('high-mid', 2000, 6000), ('air', 6000, 11000)]


def band_energy(mag: np.ndarray) -> np.ndarray:
    freqs = np.arange(mag.shape[0]) * SR / NFFT
    pw = mag ** 2
    return np.array([pw[(freqs >= lo) & (freqs < hi)].sum(0) for _, lo, hi in BANDS])


def stereo_stats(x: np.ndarray) -> dict:
    L, R = x[0], x[1]
    mid, side = (L + R) / 2, (L - R) / 2
    e_mid, e_side = np.sum(mid ** 2) + 1e-12, np.sum(side ** 2)
    corr = float(np.corrcoef(L, R)[0, 1]) if np.std(L) > 0 and np.std(R) > 0 else 1.0
    return {'side_to_mid_db': float(10 * np.log10(e_side / e_mid + 1e-12)), 'correlation': corr}


# ----------------------------------------------------------------------------- structure
def sections(feat: np.ndarray, beat_times: np.ndarray, min_beats: int = 8) -> list[int]:
    """Boundaries (indices into beats) from a checkerboard kernel over a beat-synchronous self-similarity matrix."""
    n = feat.shape[1]
    if n < 2 * min_beats:
        return [0, n]
    F = feat / (np.linalg.norm(feat, axis=0, keepdims=True) + 1e-9)
    S = F.T @ F
    k = min_beats
    g = np.outer(np.hanning(2 * k), np.hanning(2 * k))
    ker = g * np.block([[np.ones((k, k)), -np.ones((k, k))], [-np.ones((k, k)), np.ones((k, k))]])
    nov = np.zeros(n)
    Sp = np.pad(S, k, mode='edge')
    for i in range(n):
        nov[i] = np.sum(Sp[i:i + 2 * k, i:i + 2 * k] * ker)
    nov = np.maximum(nov, 0)
    if nov.max() > 0:
        nov /= nov.max()
    peaks, _ = sg.find_peaks(nov, height=0.25, distance=min_beats)
    return [0] + [int(p) for p in peaks] + [n]


def label_sections(feat: np.ndarray, bounds: list[int]) -> list[str]:
    means = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        v = feat[:, a:b].mean(1)
        means.append(v / (np.linalg.norm(v) + 1e-9))
    labels, protos = [], []
    for v in means:
        sims = [float(v @ p) for p in protos]
        if sims and max(sims) > 0.985:
            labels.append(chr(65 + int(np.argmax(sims))))
        else:
            protos.append(v)
            labels.append(chr(64 + len(protos)))
    # mark repeats: A, B, A'
    seen = {}
    out = []
    for l in labels:
        seen[l] = seen.get(l, 0) + 1
        out.append(l + "'" * (seen[l] - 1))
    return out


# ----------------------------------------------------------------------------- words
def describe_balance(pct: dict) -> list[str]:
    notes = []
    low = pct['sub'] + pct['bass']
    if low > 70: notes.append('very bottom-heavy: over 70% of the energy is below 250 Hz')
    elif low > 55: notes.append('bass-forward')
    elif low < 30: notes.append('thin low end: under 30% of the energy is below 250 Hz')
    if pct['low-mid'] > 45: notes.append('crowded low-mids (250 Hz to 2 kHz), can sound muddy or boxy')
    if pct['high-mid'] > 22: notes.append('a lot of 2 to 6 kHz, can sound harsh or tiring')
    if pct['air'] < 0.6: notes.append('dark: almost nothing above 6 kHz')
    elif pct['air'] > 10: notes.append('very bright top end')
    return notes


def fmt_t(s: float) -> str:
    return f'{int(s // 60)}:{s % 60:04.1f}'


# ----------------------------------------------------------------------------- main
def analyse(path: str, start=None, end=None) -> dict:
    x, sr = load(path, start, end)
    dur = x.shape[1] / sr
    y = to_analysis_rate(x, sr)
    mag = stft_mag(y)
    frames = mag.shape[1]
    ftimes = frame_times(frames, NFFT)
    semi, midis = semitone_spectrum(mag)
    chroma = chroma_from(semi, midis)
    onset, otimes = onset_curve(y)
    bpm, beats, conf = tempo_and_beats(onset)
    beat_times = otimes[beats] if len(beats) else np.array([])
    to_frame = lambda t: int(np.clip(round((t * SR - NFFT / 2) / HOP), 0, frames - 1))
    mel_notes = melody_notes(semi, midis, ftimes, onset, otimes)
    mel = notes_to_line(mel_notes, ftimes)
    bands = band_energy(mag)
    energy = bands.sum(0)
    tot = bands.sum(1)
    pct = {name: float(100 * v / (tot.sum() + 1e-12)) for (name, _, _), v in zip(BANDS, tot)}
    key, key_r, key_alt = estimate_key(chroma)

    # beat-synchronous segments (one chord label per beat, then merged)
    if len(beats) >= 4:
        edges = sorted(set([0] + [to_frame(t) for t in beat_times])) + [frames]
        segs = [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]
    else:
        step = int(0.5 * SR / HOP)
        segs = [(a, min(a + step, frames)) for a in range(0, frames, step)]
    chords = chords_over(chroma, energy, segs)
    seg_times = [ftimes[min(a, frames - 1)] for a, _ in segs]
    chord_runs = []
    for t, c in zip(seg_times, chords):
        if chord_runs and chord_runs[-1][1] == c:
            continue
        chord_runs.append((float(t), c))

    # sections from beat-synchronous chroma + band shape + loudness
    if len(segs) >= 16:
        logb = np.log1p(bands / (bands.max() + 1e-12) * 1e3)
        bs_feat = np.array([np.concatenate([chroma[:, a:max(b, a + 1)].mean(1),
                                            0.6 * logb[:, a:max(b, a + 1)].mean(1) / (logb.max() + 1e-9),
                                            [0.8 * np.log1p(energy[a:max(b, a + 1)].mean() / (energy.max() + 1e-12) * 100) / 5]])
                            for a, b in segs]).T
        bnd = sections(bs_feat, np.array(seg_times))
        labels = label_sections(bs_feat, bnd)
        secs = [(float(seg_times[a]) if a < len(seg_times) else dur, float(seg_times[b]) if b < len(seg_times) else dur, l)
                for (a, b), l in zip(zip(bnd[:-1], bnd[1:]), labels)]
    else:
        secs = [(0.0, dur, 'A')]

    L = loudness_stats(x, sr)
    st_t, st_v = L['short_term']
    centroid = (mag * (np.arange(mag.shape[0]) * SR / NFFT)[:, None]).sum(0) / (mag.sum(0) + 1e-9)

    sec_info = []
    for a, b, l in secs:
        fa, fb = int(a * SR / HOP), max(int(b * SR / HOP), int(a * SR / HOP) + 1)
        sel = (st_t >= a) & (st_t < b)
        cs = [c for t, c in chord_runs if a - 1e-6 <= t < b and c != 'N']
        osel = (otimes >= a) & (otimes < b)
        onsets_per_s = float(sg.find_peaks(onset[osel], height=0.15, distance=3)[0].size / max(b - a, 1e-3)) if osel.sum() > 3 else 0.0
        sec_info.append({
            'label': l, 'start': a, 'end': b,
            'loudness_lufs': float(np.mean(st_v[sel])) if sel.any() else float('nan'),
            'brightness_hz': float(np.median(centroid[fa:fb])),
            'hits_per_second': onsets_per_s,
            'chords': cs[:16],
        })

    # silence gaps (> 0.3 s below -50 dBFS inside the piece)
    env = np.sqrt(sg.lfilter([1 / 441] * 441, [1], x.mean(0) ** 2))
    quiet = env < 10 ** (-50 / 20)
    gaps = []
    i = 0
    n = len(quiet)
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if (j - i) / sr > 0.3 and i > 0 and j < n:
                gaps.append((i / sr, j / sr))
            i = j
        else:
            i += 1

    warnings = []
    if L['clipped_samples'] > 0: warnings.append(f"{L['clipped_samples']} clipped samples (at or over full scale)")
    if L['true_peak_dbtp'] > -1.0: warnings.append(f"true peak {L['true_peak_dbtp']:.1f} dBTP, over -1: may distort after MP3/AAC encoding")
    if L['loudness_range_lu'] < 3 and dur > 20: warnings.append(f"very flat dynamics (loudness range {L['loudness_range_lu']:.1f} LU)")
    for a, b in gaps: warnings.append(f'silence gap {fmt_t(a)}–{fmt_t(b)}')
    s2m = stereo_stats(x)
    if s2m['correlation'] < 0.2: warnings.append(f"stereo correlation {s2m['correlation']:.2f}: may partly cancel on a phone speaker (mono)")
    if conf < 0.25: warnings.append('no steady beat found (tempo is a guess)')

    return {
        'file': path, 'duration': dur, 'sr': sr,
        'tempo_bpm': float(bpm), 'tempo_confidence': conf, 'beats': beat_times.tolist(),
        'key': key, 'key_fit': key_r, 'key_runner_up': key_alt,
        'loudness': {k: v for k, v in L.items() if k != 'short_term'},
        'stereo': s2m,
        'bands_pct': pct, 'balance_notes': describe_balance(pct),
        'chords': chord_runs, 'sections': sec_info, 'warnings': warnings, 'melody': mel_notes,
        '_plot': {'mel': mel, 'mag': mag, 'semi': semi, 'midis': midis, 'chroma': chroma, 'onset': onset, 'ftimes': ftimes,
                  'otimes': otimes, 'bands': bands, 'st': (st_t, st_v), 'x': x, 'sr': sr, 'secs': secs, 'chord_runs': chord_runs, 'offset': start or 0},
    }


def chords_by_bar(r: dict, beats_per_bar: int = 4) -> list[str]:
    beats = r['beats']
    if len(beats) < beats_per_bar * 2:
        return []
    runs = r['chords']
    def chord_at(t):
        c = 'N'
        for tt, name in runs:
            if tt <= t + 1e-6:
                c = name
            else:
                break
        return c
    bars = []
    for i in range(0, len(beats) - beats_per_bar + 1, beats_per_bar):
        names = [chord_at(beats[i + k] + 0.05) for k in range(beats_per_bar)]
        uniq = []
        for n in names:
            if not uniq or uniq[-1] != n:
                uniq.append(n)
        bars.append(' '.join(uniq))
    return bars


def words(r: dict) -> str:
    L = r['loudness']
    lines = []
    lines.append(f"{os.path.basename(r['file'])}: {fmt_t(r['duration'])} long")
    lines.append(f"tempo {r['tempo_bpm']:.1f} BPM (confidence {r['tempo_confidence']:.2f}); key {r['key']} (fit {r['key_fit']:.2f}, runner-up {r['key_runner_up']})")
    lines.append(f"loudness {L['integrated_lufs']:.1f} LUFS integrated, true peak {L['true_peak_dbtp']:.1f} dBTP, loudness range {L['loudness_range_lu']:.1f} LU, crest {L['crest_db']:.1f} dB")
    lines.append(f"stereo: side {r['stereo']['side_to_mid_db']:.1f} dB below mid, correlation {r['stereo']['correlation']:.2f}")
    b = r['bands_pct']
    lines.append('energy: ' + ', '.join(f'{k} {v:.0f}%' for k, v in b.items()) + (('  (' + '; '.join(r['balance_notes']) + ')') if r['balance_notes'] else ''))
    bars = chords_by_bar(r)
    if bars:
        lines.append('')
        lines.append('chords by bar (4 beats):')
        row = []
        for i, bar in enumerate(bars):
            row.append(f'{bar:<9}')
            if len(row) == 8:
                lines.append('  | ' + '| '.join(row)); row = []
        if row:
            lines.append('  | ' + '| '.join(row))
    if r.get('melody'):
        mn = r['melody']
        ps = [m for _, _, m in mn]
        from collections import Counter
        steps = [b - a for a, b in zip(ps, ps[1:])]
        leaps = sum(1 for x in steps if abs(x) >= 5)
        lines.append('')
        lines.append(f"melody (top line): {len(mn)} notes, range {NOTE_NAMES[min(ps) % 12]}{min(ps) // 12 - 1}–{NOTE_NAMES[max(ps) % 12]}{max(ps) // 12 - 1} ({max(ps) - min(ps)} semitones), "
                     f"{leaps} leaps of a 4th or more, most used: {', '.join(NOTE_NAMES[p % 12] for p, _ in Counter(ps).most_common(3))}")
        shape = ''.join('^' if x > 0 else 'v' if x < 0 else '-' for x in steps)
        lines.append(f"  contour: {shape[:80]}")
        lines.append('  notes: ' + ' '.join(f"{NOTE_NAMES[m % 12]}{m // 12 - 1}" for _, _, m in mn[:40]))
    lines.append('')
    lines.append('sections:')
    for s in r['sections']:
        lines.append(f"  {s['label']:<3} {fmt_t(s['start'])}–{fmt_t(s['end'])}  {s['loudness_lufs']:6.1f} LUFS  brightness {s['brightness_hz']:5.0f} Hz  {s['hits_per_second']:4.1f} hits/s  chords: {' '.join(s['chords'][:8])}")
    if r['warnings']:
        lines.append('')
        lines.append('listen out for:')
        for w in r['warnings']:
            lines.append('  - ' + w)
    return '\n'.join(lines)


def picture(r: dict, out_png: str, title: str):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    P = r['_plot']
    off = P['offset']
    ft = P['ftimes'] + off
    dur = r['duration']
    fig, ax = plt.subplots(5, 1, figsize=(18, 15), sharex=True, gridspec_kw={'height_ratios': [1.1, 3.2, 1.6, 1.2, 0.9]})
    fig.patch.set_facecolor('#111')
    for a in ax:
        a.set_facecolor('#111'); a.tick_params(colors='#bbb', labelsize=9)
        for s in a.spines.values(): s.set_color('#444')

    # 1 waveform envelope + loudness
    x, sr = P['x'], P['sr']
    m = x.mean(0)
    px = 2000
    step = max(1, len(m) // px)
    mm = m[:len(m) // step * step].reshape(-1, step)
    tx = np.arange(mm.shape[0]) * step / sr + off
    ax[0].fill_between(tx, mm.min(1), mm.max(1), color='#3a6ea5', lw=0)
    ax2 = ax[0].twinx()
    st_t, st_v = P['st']
    ax2.plot(st_t + off, st_v, color='#ffb000', lw=1.8)
    ax2.set_ylim(-45, -3); ax2.tick_params(colors='#ffb000', labelsize=8)
    ax2.set_ylabel('LUFS (3 s)', color='#ffb000', fontsize=8)
    ax[0].set_ylim(-1, 1); ax[0].set_ylabel('wave', color='#bbb', fontsize=9)

    # 2 log-frequency spectrogram
    semi, midis = P['semi'], P['midis']
    D = 10 * np.log10(semi + 1e-10)
    D -= D.max()
    ax[1].imshow(np.clip(D, -80, 0), aspect='auto', origin='lower', cmap='magma',
                 extent=[ft[0] - HOP / SR / 2, ft[-1] + HOP / SR / 2, midis[0] - 0.5, midis[-1] + 0.5], interpolation='nearest')
    yt = [m for m in midis if m % 12 == 0]
    ax[1].plot(ft, P['mel'], color='#00e5ff', lw=2.2, alpha=0.95, solid_capstyle='butt')
    ax[1].set_yticks(yt)
    ax[1].set_yticklabels([f'C{m // 12 - 1}\n{440 * 2 ** ((m - 69) / 12):.0f}Hz' for m in yt], fontsize=7)
    ax[1].set_ylabel('pitch / frequency', color='#bbb', fontsize=9)

    # 3 chromagram + chord labels
    ax[2].imshow(P['chroma'], aspect='auto', origin='lower', cmap='viridis',
                 extent=[ft[0] - HOP / SR / 2, ft[-1] + HOP / SR / 2, -0.5, 11.5], interpolation='nearest')
    ax[2].set_yticks(range(12)); ax[2].set_yticklabels(NOTE_NAMES, fontsize=7)
    runs = P['chord_runs']
    for i, (t, c) in enumerate(runs):
        t1 = runs[i + 1][0] if i + 1 < len(runs) else dur
        if c == 'N' or t1 - t < 0.2:
            continue
        ax[2].axvline(t + off, color='white', lw=0.5, alpha=0.5)
        ax[2].text(t + off + 0.03, 11.2, c, color='white', fontsize=8, va='top', weight='bold', clip_on=True,
                   bbox=dict(facecolor='#000', alpha=0.55, pad=1, lw=0))

    # 4 band energy share
    bands = P['bands']
    k = 8
    bsm = sg.lfilter(np.ones(k) / k, [1], bands, axis=1)
    share = bsm / (bsm.sum(0, keepdims=True) + 1e-12)
    cols = ['#5b2a86', '#2a6f97', '#2c9c6a', '#e09f3e', '#e5e5e5']
    ax[3].stackplot(ft, share, colors=cols, labels=[b[0] for b in BANDS])
    ax[3].set_ylim(0, 1); ax[3].set_ylabel('energy share', color='#bbb', fontsize=9)
    ax[3].legend(loc='upper left', fontsize=7, ncol=5, facecolor='#222', labelcolor='#ddd', framealpha=0.8)

    # 5 onsets + beats
    ax[4].plot(P['otimes'] + off, P['onset'], color='#9ad1d4', lw=0.8)
    for bt in r['beats']:
        ax[4].axvline(bt + off, color='#ff5a5f', lw=0.6, alpha=0.6)
    ax[4].set_ylabel('hits / beats', color='#bbb', fontsize=9)
    ax[4].set_xlabel('seconds', color='#bbb')

    # sections across all panels
    for a0, b0, l in P['secs']:
        for a in ax[:1]:
            a.text(a0 + off + 0.1, 0.85, l, color='white', fontsize=13, weight='bold', transform=a.get_xaxis_transform())
        for a in ax:
            a.axvline(a0 + off, color='white', lw=1.4, alpha=0.8)
    for bt in r['beats'][::4]:
        ax[1].axvline(bt + off, color='white', lw=0.4, alpha=0.25)
    ax[-1].set_xlim(off, off + dur)
    fig.suptitle(title, color='white', fontsize=13, x=0.01, ha='left')
    fig.tight_layout(rect=[0, 0, 1, 0.97])
    fig.savefig(out_png, dpi=90, facecolor=fig.get_facecolor())
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('file')
    ap.add_argument('--out', default='.')
    ap.add_argument('--start', type=float)
    ap.add_argument('--end', type=float)
    ap.add_argument('--name')
    ap.add_argument('--no-picture', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    name = a.name or os.path.splitext(os.path.basename(a.file))[0]
    r = analyse(a.file, a.start, a.end)
    text = words(r)
    base = os.path.join(a.out, name)
    open(base + '.listen.txt', 'w').write(text + '\n')
    js = {k: v for k, v in r.items() if k != '_plot'}
    json.dump(js, open(base + '.listen.json', 'w'), indent=1, default=float)
    if not a.no_picture:
        L = r['loudness']
        picture(r, base + '.listen.png', f"{name}   {r['tempo_bpm']:.0f} BPM   {r['key']}   {L['integrated_lufs']:.1f} LUFS   peak {L['true_peak_dbtp']:.1f} dBTP")
    print(text)
    print(f'\nwrote {base}.listen.txt' + ('' if a.no_picture else f' and {base}.listen.png'))


if __name__ == '__main__':
    main()


def roll(r: dict, out_png: str, title: str = '', lo: int = 52, hi: int = 96, size=(10, 3.6)):
    """Compact melody view: spectrogram of just the melody register, heard notes drawn as bars with names,
    chords along the bottom. For comparing tunes side by side."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    P = r['_plot']
    ft = P['ftimes'] + P['offset']
    semi, midis = P['semi'], P['midis']
    sel = (midis >= lo) & (midis < hi)
    D = 10 * np.log10(semi[sel] + 1e-10); D -= D.max()
    fig, ax = plt.subplots(figsize=size)
    fig.patch.set_facecolor('#111'); ax.set_facecolor('#111')
    ax.imshow(np.clip(D, -60, 0), aspect='auto', origin='lower', cmap='magma', alpha=0.55,
              extent=[ft[0], ft[-1], lo - 0.5, hi - 0.5], interpolation='nearest')
    for a, b, m in r['melody']:
        if lo <= m < hi:
            ax.add_patch(plt.Rectangle((a, m - 0.4), b - a, 0.8, color='#00e5ff'))
            ax.text(a, m + 0.7, NOTE_NAMES[m % 12], color='#9ff', fontsize=7)
    for t, c in r['chords']:
        if c != 'N':
            ax.text(t, lo + 0.3, c, color='#ffcc66', fontsize=7)
    for m in range(lo, hi):
        if m % 12 == 0:
            ax.axhline(m - 0.5, color='#444', lw=0.6)
    ax.set_yticks([m for m in range(lo, hi) if m % 12 == 0])
    ax.set_yticklabels([f'C{m // 12 - 1}' for m in range(lo, hi) if m % 12 == 0], color='#aaa', fontsize=8)
    ax.tick_params(colors='#aaa', labelsize=8)
    ax.set_xlim(ft[0], ft[-1]); ax.set_ylim(lo - 0.5, hi - 0.5)
    ax.set_title(title, color='white', fontsize=9, loc='left')
    fig.tight_layout()
    fig.savefig(out_png, dpi=100, facecolor=fig.get_facecolor())
    plt.close(fig)
