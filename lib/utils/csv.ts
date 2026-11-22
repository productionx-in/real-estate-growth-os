// lib/utils/csv.ts — CSV export safety. A cell that would start a spreadsheet formula (=, @, a tab or carriage
// return, or + / - not followed by a plain number such as a phone or an amount) gets a leading ' from Papa.unparse,
// so opening an export never runs text that came from a web form or a webhook.
export const CSV_FORMULA = /^(?:[=@\t\r]|[+-](?![\d\s().-]*$))/
