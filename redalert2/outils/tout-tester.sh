#!/usr/bin/env bash
# Charge chaque mission de campagne sur le banc (mode RA2) et résume erreurs + état.
cd "$(dirname "$0")/.."
OUT=${SORTIE:-/tmp/ra2-campagne}; mkdir -p $OUT
DUREE=${DUREE:-70000}
for f in ../campagne/${CARTES:-cartes}/${FILTRE:-*}.map; do
  m=$(basename $f)
  BANC_LOG=$OUT/${m%.map}.log BANC_JOURNAL=$OUT/${m%.map}.live.log node outils/banc.mjs "/?shell=1&moteur=${MOTEUR:-ra2}&mission=$m" $DUREE ${SONDE:-outils/sonde-mission.js} $OUT/${m%.map}.png > /dev/null 2>&1
  err=$(grep -cE "PAGEERROR|Handled error|Failed to load game" $OUT/${m%.map}.log)
  ign=$(grep -c "ignorée pour l'instant\|pas encore géré" $OUT/${m%.map}.log)
  ev=$(grep -E "^\[EVAL" $OUT/${m%.map}.log | cut -c1-400)
  echo "$m erreurs=$err ignorés=$ign $ev"
done
