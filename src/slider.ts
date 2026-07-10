const TIME_BANDS = [0, 60, 120, 180, 240, 360, 480, 720, 1440, 2160, 2880];

export function getTimeBandValue(index: number): number {
  const safeIndex = Math.max(0, Math.min(index, TIME_BANDS.length - 1));
  return TIME_BANDS[safeIndex] ?? 0;
}

export function getTimeLabel(minutes: number): string {
  if (minutes === 0) return "0h";
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
  if (!slider) return;

  const updateTrack = () => {
    const max = Number(slider.max) || TIME_BANDS.length - 1;
    const value = Number(slider.value) || 0;
    const pct = (value / max) * 100;
    slider.style.setProperty("--slider-progress", `${pct}%`);
  };

  const update = () => {
    const idx = parseInt(slider.value);
    const minutes = getTimeBandValue(idx);
    updateTrack();
    updateLegendActive(idx);
    slider.setAttribute("aria-valuetext", formatDurationForAria(minutes));
    onChange(minutes, idx);
  };

  slider.addEventListener("input", update);
  update();
}

function formatDurationForAria(minutes: number): string {
  if (minutes === 0) return "0 hours";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours} ${hours === 1 ? "hour" : "hours"} ${remainder} minutes`;
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
