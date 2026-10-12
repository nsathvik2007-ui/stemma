/* "1 assignment" / "2 assignments". English regular plurals only — pass the
   plural form explicitly for anything irregular. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
