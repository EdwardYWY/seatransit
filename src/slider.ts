const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];

export function getTimeBandValue(index: number): number {
  return TIME_BANDS[Math.min(index, TIME_BANDS.length - 1)] || TIME_BANDS[0];
}

export function getTimeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.round(minutes / 60);
  return `${h}h`;
}

export function setupSlider(onChange: (bandMinutes: number, bandIndex: number) => void): void {
  const slider = document.getElementById("time-slider") as HTMLInputElement;
  const label = document.getElementById("slider-label") as HTMLSpanElement;
  if (!slider || !label) return;

  slider.min = "0";
  slider.max = String(TIME_BANDS.length - 1);
  slider.step = "1";

  const update = () => {
    const idx = parseInt(slider.value);
    const minutes = getTimeBandValue(idx);
    label.textContent = getTimeLabel(minutes);
    onChange(minutes, idx);
  };

  slider.addEventListener("input", update);
  update();
}
