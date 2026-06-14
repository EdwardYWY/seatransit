const TIME_BANDS = [60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];

export function getTimeBandValue(index: number): number {
  return TIME_BANDS[Math.min(index, TIME_BANDS.length - 1)] || TIME_BANDS[0];
}

export function getTimeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.round(minutes / 60);
  return `${h}h`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function setupSlider(onChange: (bandMinutes: number, bandIndex: number) => void): void {
  const slider = document.getElementById("time-slider") as HTMLInputElement;
  const valueEl = document.getElementById("slider-value") as HTMLDivElement;
  if (!slider || !valueEl) return;

  const update = () => {
    const idx = parseInt(slider.value);
    const minutes = getTimeBandValue(idx);
    const label = getTimeLabel(minutes);
    slider.value = String(idx);
    updateLegendActive(idx);
    onChange(minutes, idx);
  };

  slider.addEventListener("input", update);
  update();
}

export function updateLegendActive(bandIndex: number): void {
  const legend = document.getElementById("legend");
  if (!legend) return;
  legend.querySelectorAll(".row").forEach((row) => {
    const rowBand = parseInt((row as HTMLElement).dataset.band || "");
    row.classList.toggle("active", rowBand === bandIndex);
  });
}

export function updateSliderValue(text: string): void {
  const valueEl = document.getElementById("slider-value") as HTMLDivElement;
  if (valueEl) valueEl.textContent = text;
}
