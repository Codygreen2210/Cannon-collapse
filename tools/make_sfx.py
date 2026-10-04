#!/usr/bin/env python3
"""Make the game's sound effects with plain numpy. Run from the repo root:
    python3 tools/make_sfx.py [--mp3]
Writes WAVs + one joined check file to tools/sfx-build/ (ignored by git) and, with --mp3, mp3s to sfx/.
Check the joined file before anything goes in: python3 tools/listen.py tools/sfx-build/all-effects.wav --out notes/
SFX_PEAK (sample peak per effect) and SFX_GLASS_TOP (highest glass and ice partial, Hz) are the two knobs used to fix what it flags.
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

def at(x, sec, y):                                    # mix y into x starting at sec
    n0 = int(sec * SR); n = min(len(y), len(x) - n0); x[n0:n0 + n] += y[:n]; return x
def launch():                                         # cannon: low boom with body, a short bark of powder on top
    d = 0.46
    x = sweep(d, 175, 44, 14) * env(d, 0.11) + 0.55 * np.sin(2 * np.pi * 58 * t(d)) * env(d, 0.16)
    x += 0.5 * lp(nz(d), 1100) * env(d, 0.045) + 0.22 * bp(nz(d), 900, 2600) * env(d, 0.012)
    x += 0.5 * bp(nz(d), 260, 900) * env(d, 0.06) + 0.3 * sweep(d, 520, 210, 22) * env(d, 0.05)      # the part a phone speaker can play
    return fin(np.tanh(1.3 * x))
def reload():                                         # soft click-clack: the next ball is ready
    d = 0.16; x = np.zeros(int(d * SR))
    for sec, f, a in [(0.0, 1500, 0.7), (0.07, 1050, 1.0)]:
        k = 0.06; at(x, sec, a * (bp(nz(k), f * 0.7, f * 1.9) * env(k, 0.007) + 0.6 * np.sin(2 * np.pi * f * 0.28 * t(k)) * env(k, 0.014)))
    return fin(x, PEAK * 0.5)
def wood():                                           # thunk
    d = 0.18
    x = sum(a * np.sin(2 * np.pi * f * t(d)) * env(d, dc) for f, a, dc in [(235, 1, .04), (410, .8, .03), (760, .4, .02), (1240, .2, .012)])
    return fin(x + 0.3 * bp(nz(d), 600, 2400) * env(d, 0.006))
def woodcrack():                                      # thunk, then the crack and a couple of splinter snaps
    d = 0.3; x = np.zeros(int(d * SR)); at(x, 0, 0.8 * wood() / PEAK)
    for sec, a, f in [(0.012, 1.0, 1700), (0.06, 0.5, 2300), (0.095, 0.35, 2000), (0.14, 0.2, 2600)]:
        k = 0.07; at(x, sec, a * bp(nz(k), f * 0.55, min(f * 1.9, GLASS_TOP)) * env(k, 0.009))
    return fin(x)
def stone():
    d = 0.3
    return fin(sweep(d, 130, 62, 30) * env(d, 0.07) + 0.6 * lp(nz(d), 500) * env(d, 0.045) + 0.12 * bp(nz(d), 900, 2200) * env(d, 0.01)
               + 0.45 * sweep(d, 420, 250, 30) * env(d, 0.035) + 0.3 * bp(nz(d), 300, 800) * env(d, 0.03))
def glass():
    d = 0.5; x = np.zeros(int(d * SR))
    for f in [1900, 2650, 3300, 4100, 4750]:
        f = min(f, GLASS_TOP); dl = rng.uniform(0, 0.07); n0 = int(dl * SR)
        seg = np.sin(2 * np.pi * f * t(d - dl)) * env(d - dl, rng.uniform(0.05, 0.12)) * rng.uniform(.4, 1)
        x[n0:n0 + len(seg)] += seg[:len(x) - n0]
    x += 0.8 * bp(nz(d), 1500, GLASS_TOP) * env(d, 0.035)
    x += 0.5 * np.sin(2 * np.pi * 620 * t(d)) * env(d, 0.03)
    return fin(lp(x, GLASS_TOP + 800), PEAK * 0.8)
def clink():                                          # glass knocked but not broken
    d = 0.24; x = np.zeros(int(d * SR))
    for f, a, dc in [(1650, 1, .05), (2480, .6, .04), (3700, .3, .025)]:
        x += a * np.sin(2 * np.pi * min(f, GLASS_TOP) * t(d)) * env(d, dc)
    x += 0.35 * bp(nz(d), 1800, GLASS_TOP) * env(d, 0.004) + 0.3 * np.sin(2 * np.pi * 700 * t(d)) * env(d, 0.015)
    return fin(lp(x, GLASS_TOP + 800), PEAK * 0.7)
def ice():                                            # dry crack with a short cold ring
    d = 0.28; x = np.zeros(int(d * SR))
    for sec, a in [(0.0, 1.0), (0.045, 0.45), (0.1, 0.25)]:
        k = 0.1; at(x, sec, a * (bp(nz(k), 1500, GLASS_TOP) * env(k, 0.007) + 0.5 * bp(nz(k), 500, 1400) * env(k, 0.012)))
    for f, a, dc in [(1180, .5, .035), (1950, .3, .03)]:
        x += a * np.sin(2 * np.pi * f * t(d)) * env(d, dc)
    return fin(lp(x, GLASS_TOP + 800), PEAK * 0.85)
def rumble():                                         # a lot coming down at once: low, short, uneven
    d = 0.9; tt = t(d)
    shape = np.minimum(1, tt / 0.05) * np.exp(-tt / 0.3) * (0.75 + 0.25 * np.sin(2 * np.pi * 11 * tt + 1))
    x = 1.0 * lp(nz(d), 170) * 6 + 0.5 * sweep(d, 78, 36, 4) + 0.9 * bp(nz(d), 200, 700)
    for sec in [0.06, 0.2, 0.33, 0.5]:
        k = 0.2; at(x, sec, 0.9 * sweep(k, 120, 50, 25) * env(k, 0.05) + 0.5 * sweep(k, 380, 230, 25) * env(k, 0.03))
    return fin(np.tanh(0.9 * x * shape / np.max(np.abs(x))* 2.2))
def star():                                           # one bright chime per star
    d = 0.5
    x = sum(a * np.sin(2 * np.pi * f * t(d)) * env(d, dc) for f, a, dc in [(1047, 1, .17), (2094, .32, .1), (3141, .1, .05)])
    return fin(x, PEAK * 0.7)
def tnt():
    d = 0.7
    x = sweep(d, 150, 40, 9) * env(d, 0.16) + 0.9 * lp(nz(d), 700) * env(d, 0.12) + 0.25 * bp(nz(d), 700, 2500) * env(d, 0.03)
    x += 0.55 * bp(nz(d), 280, 1100) * env(d, 0.09) + 0.3 * sweep(d, 600, 200, 14) * env(d, 0.06)
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

FX = dict(launch=launch, reload=reload, wood=wood, woodcrack=woodcrack, stone=stone, clink=clink, glass=glass, ice=ice, tnt=tnt, rumble=rumble, star=star, clear=clear, near=near)
gap = np.zeros(int(0.35 * SR)); parts = [gap]
for name, fn in FX.items():
    x = fn(); sf.write(os.path.join(BUILD, name + '.wav'), x, SR)
    parts += [x, gap]
sf.write(os.path.join(BUILD, 'all-effects.wav'), np.concatenate(parts), SR)
if '--mp3' in sys.argv:
    for name in FX:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(BUILD, name + '.wav'),
                        '-ac', '1', '-b:a', '80k', os.path.join(OUT, name + '.mp3')], check=True)
print('ok', list(FX))
