import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('joins headers and rows with CRLF, comma-separated', () => {
    const csv = toCsv(['Nom', 'Montant'], [['Moussa Diallo', 5000]]);
    expect(csv).toContain('Nom,Montant\r\n');
    expect(csv).toContain('Moussa Diallo,5000\r\n');
  });

  it('quotes and escapes a field containing a comma', () => {
    const csv = toCsv(['Description'], [['Vidange, freins']]);
    expect(csv).toContain('"Vidange, freins"');
  });

  it('doubles internal quotes', () => {
    const csv = toCsv(['Notes'], [['Le client a dit "urgent"']]);
    expect(csv).toContain('"Le client a dit ""urgent"""');
  });

  it('quotes a field containing a newline', () => {
    const csv = toCsv(['Notes'], [['Ligne 1\nLigne 2']]);
    expect(csv).toContain('"Ligne 1\nLigne 2"');
  });

  it('renders null/undefined as an empty field', () => {
    const csv = toCsv(['Email'], [[null], [undefined]]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('');
  });

  it('leads with a UTF-8 BOM so Excel renders accented French text correctly', () => {
    const csv = toCsv(['Ville'], [['Dakar']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
