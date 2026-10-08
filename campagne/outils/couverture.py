#!/usr/bin/env python3
"""Couverture de la campagne : pour chaque carte, événements / actions / ordres de script
utilisés et ceux que le moteur ne gère pas (ou ignore). Lit le code source pour savoir ce qui est géré."""
import re, os, sys, glob
from collections import Counter, defaultdict
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'redalert2/src')
FA = os.path.expanduser('~/ra2-retail/FinalAlert2/FAData.ini')

def enum(path):
    return {int(v): k for k, v in re.findall(r'^\s+(\w+) = (\d+)', open(path).read(), re.M)}
EV = enum(f'{SRC}/data/map/trigger/TriggerEventType.ts')
AC = enum(f'{SRC}/data/map/trigger/TriggerActionType.ts')
cond_src = open(f'{SRC}/game/trigger/TriggerConditionFactory.ts').read()
exec_src = open(f'{SRC}/game/trigger/TriggerExecutorFactory.ts').read()
ev_ok = {n for n, k in EV.items() if f'TriggerEventType.{k}:' in cond_src}
ac_cases = re.findall(r'case TriggerActionType\.(\w+):', exec_src)
noop_block = re.split(r'return new \w+\([^)]*\);', exec_src.split('return new CampaignNoopExecutor')[0])[-1]
ac_noop = {n for n, k in AC.items() if f'TriggerActionType.{k}:' in noop_block}
ac_ok = {n for n, k in AC.items() if k in ac_cases} - ac_noop
tm = open(f'{SRC}/game/campaign/teams/TeamManager.ts').read()
sa_enum = {int(v): k for k, v in re.findall(r'^\s+(\w+) = (\d+),', tm.split('export enum ScriptAction')[1].split('}')[0], re.M)}
step = tm.split('private step(')[1].split('private adoptUnloadedPassengers')[0]
sa_ok = {n for n, k in sa_enum.items() if f'ScriptAction.{k}:' in step}
fa = open(FA, encoding='latin-1').read().replace('\r', '')
def fanames(sec):
    body = re.split(r'^\[' + sec + r'\]\s*$', fa, flags=re.M)[1].split('\n[')[0]
    return {int(k): v.split(',')[0] for k, v in re.findall(r'^(\d+)=(.*)$', body, re.M)}
EVN, ACN = fanames('EventsRA2'), fanames('ActionsRA2')

def sections(m):
    out = {}
    for name, body in re.findall(r'^\[([^\]]+)\]\s*$\n(.*?)(?=^\[|\Z)', m, re.M | re.S):
        out[name] = dict(l.split('=', 1) for l in body.splitlines() if '=' in l and not l.startswith(';'))
    return out

tot_ev, tot_ac, tot_sa = Counter(), Counter(), Counter()
where = defaultdict(set)
for path in sorted(glob.glob(os.path.join(ROOT, 'campagne', sys.argv[1] if len(sys.argv) > 1 else 'cartes', '*.map'))):
    name = os.path.basename(path)
    s = sections(open(path, encoding='latin-1').read())
    for k, v in s.get('Events', {}).items():
        p = v.split(','); i = 1
        for _ in range(int(p[0])):
            t = int(p[i]); tot_ev[t] += 1; where[('e', t)].add(name); i += 4 if p[i + 1] == '2' else 3
    for k, v in s.get('Actions', {}).items():
        p = v.split(',')
        for j in range(int(p[0])):
            t = int(p[1 + j * 8]); tot_ac[t] += 1; where[('a', t)].add(name)
    for sid in s.get('ScriptTypes', {}).values():
        for k, v in s.get(sid, {}).items():
            if k.isdigit():
                t = int(v.split(',')[0]); tot_sa[t] += 1; where[('s', t)].add(name)

def show(title, tot, ok, names, kind, noop=set()):
    print(f'\n== {title}')
    for t, c in sorted(tot.items(), key=lambda x: -x[1]):
        state = 'OK  ' if t in ok else ('vide' if t in noop else 'MANQ')
        if state != 'OK  ':
            print(f'  {state} {t:3} x{c:4} {names.get(t, "?")[:40]:40} {len(where[(kind, t)])} cartes')
show('Événements', tot_ev, ev_ok, EVN, 'e')
show('Actions', tot_ac, ac_ok, ACN, 'a', ac_noop)
SAN = {v: k for k, v in sa_enum.items()}
show('Ordres de script', tot_sa, sa_ok, {k: v for k, v in sa_enum.items()}, 's')
