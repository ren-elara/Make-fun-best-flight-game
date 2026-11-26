/* Small, deterministic display formatters shared by the dashboard views. */
(function () {
  'use strict';

  var fullUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  function compactUsd(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    var amount = Math.abs(value);
    if (amount >= 1e12) return '$' + (value / 1e12).toFixed(digits === undefined ? 2 : digits) + 'T';
    if (amount >= 1e9) return '$' + (value / 1e9).toFixed(digits === undefined ? 2 : digits) + 'B';
    if (amount >= 1e6) return '$' + (value / 1e6).toFixed(digits === undefined ? 1 : digits) + 'M';
    if (amount >= 1e3) return '$' + (value / 1e3).toFixed(digits === undefined ? 0 : digits) + 'K';
    return fullUsd.format(value);
  }

  function percent(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  }

  function ratio(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return value.toFixed(value >= 10 ? 1 : 2) + '×';
  }

  function duration(days) {
    if (days === null || days === undefined || !Number.isFinite(days)) return 'Unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 60) return Math.round(days / 30) + 'mo';
    return whole.format(days) + 'd';
  }

  function date(value, options) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
    return new Intl.DateTimeFormat('en-US', options || { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
  }

  window.RadarFormat = { compactUsd: compactUsd, percent: percent, ratio: ratio, duration: duration, date: date, whole: whole };
}());
