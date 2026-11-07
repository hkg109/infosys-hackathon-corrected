/** 화면의 월 입력(YYYY-MM, 종료 월 포함) ↔ 계약의 [startDate, endDate) 변환 */

export function monthToStartDate(month: string): string {
  return `${month}-01`;
}

/** 종료 월을 포함하므로 다음 달 1일을 endDate(제외)로 쓴다. */
export function monthToEndDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export function startDateToMonth(date: string): string {
  return date.slice(0, 7);
}

export function endDateToMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
