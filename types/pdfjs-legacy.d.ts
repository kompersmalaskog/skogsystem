// pdfjs-dist saknar "exports"-fält, så vi når legacy-bygget (som stödjer äldre
// iOS Safari) via subpath. Typa den subpathen som huvudentréns typer så tsc inte
// klagar (TS7016) — API:t är identiskt, bara transpileringsmålet skiljer.
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}
