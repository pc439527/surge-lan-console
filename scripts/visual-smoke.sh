#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:4173}"
OUT_DIR="${VISUAL_OUTPUT_DIR:-artifacts/visual-smoke}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.55.0}"

# Desktop, laptop, tablet and the two phone widths repeatedly reported in
# real-device reviews. Keep this matrix centralized so CI and local runs match.
VIEWPORTS=(
  "1920x1080"
  "1440x900"
  "1366x768"
  "768x1024"
  "430x932"
  "390x844"
)
THEMES=("light" "dark")

# Representative pages cover hero/card composition, dense tables, charts,
# responsive filters and long data views. Visual mode supplies MockSurgeClient.
ROUTES=(
  "dashboard:/"
  "policies:/policies"
  "node-quality:/node-quality"
  "requests:/requests"
  "traffic:/traffic"
  "dns:/dns"
  "rules:/rules"
  "events:/events"
)

mkdir -p "$OUT_DIR"
overflow_failures=()

for viewport in "${VIEWPORTS[@]}"; do
  IFS=x read -r width height <<< "$viewport"
  for theme in "${THEMES[@]}"; do
    for route_spec in "${ROUTES[@]}"; do
      name="${route_spec%%:*}"
      route="${route_spec#*:}"
      output="${OUT_DIR}/${name}-${viewport}-${theme}.png"
      echo "[visual-smoke] ${name} ${viewport} ${theme}"
      pnpm dlx "playwright@${PLAYWRIGHT_VERSION}" screenshot \
        --browser=chromium \
        --viewport-size="${width},${height}" \
        --color-scheme="$theme" \
        --wait-for-timeout=1500 \
        --full-page \
        "${BASE_URL}${route}" \
        "$output"

      # Chromium full-page screenshots expand to the document scroll width when
      # a page leaks horizontally. That gives us a zero-dependency regression
      # check for the exact mobile overflow that previously stretched Rules to
      # 728px at a 390px viewport.
      actual_width="$(file "$output" | sed -nE 's/.*PNG image data, ([0-9]+) x.*/\1/p')"
      if [[ -z "$actual_width" ]]; then
        echo "[visual-smoke] unable to read PNG width: $output" >&2
        exit 1
      fi
      if (( actual_width > width )); then
        overflow_failures+=("${name} ${viewport} ${theme}: screenshot width ${actual_width}px > viewport ${width}px")
      fi
    done
  done
done

count="$(find "$OUT_DIR" -type f -name '*.png' | wc -l | tr -d ' ')"
echo "[visual-smoke] wrote ${count} screenshots to $OUT_DIR"

if (( ${#overflow_failures[@]} > 0 )); then
  echo "[visual-smoke] horizontal overflow detected:" >&2
  printf '  - %s\n' "${overflow_failures[@]}" >&2
  exit 1
fi
