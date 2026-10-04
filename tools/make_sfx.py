#!/usr/bin/env python3
"""Make the game's sound effects with plain numpy. Run from the repo root:
    python3 daily/2026-10-04-cannon-collapse/tools/make_sfx.py
Writes WAVs + one joined check file to tools/sfx-build/ (ignored by git) and mp3s to sfx/.
"""
import os, subprocess, sys
import numpy as np, soundfile as sf
from scipy import signal as sg

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'sfx-build'); OUT = os.path.join(HERE, '..', 'sfx')
os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)
PEAK = float(os.environ.get('SFX_PEAK', '0.6'))      # sample peak target per effect
GLASS_TOP = float(os.environ.get('SFX_GLASS_TOP', '5200'))

def t(d): return np.arange(int(d * SR)) / SR
def env(d, dec): return np.exp(-t(d) / dec)
def lp(x, f): return sg.sosfilt(sg.butter(2, f, 'low', fs=SR, output='sos'), x)
def hp(x, f): return sg.sosfilt(sg.butter(2, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b): return sg.sosfilt(sg.butter(2, [a, b], 'bandpass', fs=SR, output='sos'), x)
def nz(d): return rng.standard_normal(int(d * SR))
def sweep(d, f0, f1, k=18):
    f = f1 + (f0 - f1) * np.exp(-t(d) * k)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)
def fin(x, peak=None):
    n = len(x); f = min(int(0.012 * SR), n // 4)
    x = x.copy(); x[:32] *= np.linspace(0, 1, 32); x[-f:] *= np.linspace(1, 0, f)
    return x / np.max(np.abs(x)) * (peak or PEAK)

def launch():
    d = 0.32
    return fin(sweep(d, 190, 48) * env(d, 0.09) + 0.35 * lp(nz(d), 900) * env(d, 0.03))
def wood():
    d = 0.16
    x = sum(a * np.sin(2 * np.pi * f * t(d)) * env(d, dc) for f, a, dc in [(410, 1, .03), (760, .5, .02), (1240, .25, .012)])
    return fin(x + 0.3 * bp(nz(d), 600, 2400) * env(d, 0.006))
def stone():
    d = 0.3
    return fin(sweep(d, 130, 62, 30) * env(d, 0.07) + 0.6 * lp(nz(d), 500) * env(d, 0.045) + 0.12 * bp(nz(d), 900, 2200) * env(d, 0.01))
def glass():
    d = 0.5; x = np.zeros(int(d * SR))
    for f in [1900, 2650, 3300, 4100, 4750]:
        f = min(f, GLASS_TOP); dl = rng.uniform(0, 0.07); n0 = int(dl * SR)
        seg = np.sin(2 * np.pi * f * t(d - dl)) * env(d - dl, rng.uniform(0.05, 0.12)) * rng.uniform(.4, 1)
        x[n0:n0 + len(seg)] += seg[:len(x) - n0]
    x += 0.8 * bp(nz(d), 1500, GLASS_TOP) * env(d, 0.035)
    x += 0.5 * np.sin(2 * np.pi * 620 * t(d)) * env(d, 0.03)
    return fin(lp(x, GLASS_TOP + 800), PEAK * 0.8)
def tnt():
    d = 0.7
    x = sweep(d, 150, 40, 9) * env(d, 0.16) + 0.9 * lp(nz(d), 700) * env(d, 0.12) + 0.25 * bp(nz(d), 700, 2500) * env(d, 0.03)
    return fin(np.tanh(1.6 * x))
def note(f, d, dec):
    return (np.sin(2 * np.pi * f * t(d)) + 0.3 * np.sin(2 * np.pi * 2 * f * t(d))) * env(d, dec)
def tune(freqs, gap, d, dec):
    x = np.zeros(int((gap * len(freqs) + d) * SR))
    for i, f in enumerate(freqs):
        n0 = int(i * gap * SR); s = note(f, d, dec); s[:64] *= np.linspace(0, 1, 64); x[n0:n0 + len(s)] += s
    return fin(x, PEAK * 0.85)
def clear(): return tune([392, 494, 587, 784], 0.085, 0.45, 0.16)
def near(): return tune([330, 294, 233], 0.16, 0.5, 0.2)

FX = dict(launch=launch, wood=wood, stone=stone, glass=glass, tnt=tnt, clear=clear, near=near)
gap = np.zeros(int(0.35 * SR)); parts = [gap]
for name, fn in FX.items():
    x = fn(); sf.write(os.path.join(BUILD, name + '.wav'), x, SR)
    parts += [x, gap]
sf.write(os.path.join(BUILD, 'all-effects.wav'), np.concatenate(parts), SR)
if '--mp3' in sys.argv:
    for name in FX:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(BUILD, name + '.wav'),
                        '-ac', '1', '-b:a', '96k', os.path.join(OUT, name + '.mp3')], check=True)
print('ok', list(FX))
