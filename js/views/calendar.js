import { buildCalendarWeeks } from '../lib/calendar.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

// container に月カレンダーを描画。trainedDates の日はマーク、タップで onSelect(date)。
export function renderCalendar(container, { trainedDates = new Set(), initialDate = new Date(), onSelect } = {}) {
  let year = initialDate.getFullYear();
  let month = initialDate.getMonth() + 1; // 1-12
  const todayStr = `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, '0')}-${String(initialDate.getDate()).padStart(2, '0')}`;
  let selected = null;

  function draw() {
    const weeks = buildCalendarWeeks(year, month);
    container.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-nav="-1">‹</button>
        <strong>${year}年${month}月</strong>
        <button type="button" class="cal-nav" data-nav="1">›</button>
      </div>
      <div class="cal-grid cal-wd">${WD.map((w) => `<div class="cal-wdcell">${w}</div>`).join('')}</div>
      <div class="cal-grid">
        ${weeks.flat().map((d) => {
          if (!d) return '<div class="cal-cell cal-empty"></div>';
          const day = Number(d.slice(8, 10));
          const cls = ['cal-cell'];
          if (trainedDates.has(d)) cls.push('cal-trained');
          if (d === todayStr) cls.push('cal-today');
          if (d === selected) cls.push('cal-sel');
          return `<button type="button" class="${cls.join(' ')}" data-date="${d}">${day}</button>`;
        }).join('')}
      </div>`;

    container.querySelectorAll('.cal-nav').forEach((b) =>
      b.addEventListener('click', () => {
        month += Number(b.dataset.nav);
        if (month < 1) { month = 12; year -= 1; }
        else if (month > 12) { month = 1; year += 1; }
        draw();
      }));
    container.querySelectorAll('[data-date]').forEach((b) =>
      b.addEventListener('click', () => {
        selected = b.dataset.date;
        draw();
        onSelect && onSelect(selected);
      }));
  }

  draw();
}
