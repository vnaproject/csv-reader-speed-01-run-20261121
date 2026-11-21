// Fast drop-in for make.fun's csv-reader 1.0.0: returns exactly its {columns, rows, errors}
// for every input {text, header}. Written from the RULES.txt policy + the reference
// reader's behaviour; no code copied from any public CSV library.
//
// Strategy: most records are plain lines (no quotes, no stray CR). Those go through a
// native split(',') fast path. Any record whose first line holds a quote (or a stray CR)
// takes a field-by-field slow path that still avoids per-character string building:
// unquoted fields are taken with indexOf + slice (the next line break is cached per
// record, so the newline scan runs once a line, not once a field), quoted fields with
// indexOf('"') + slice, and CR normalisation / line counting only happens for quoted
// content that actually holds a line break. Field results travel in shared variables,
// not fresh objects, to keep GC pressure down. Sliced strings stay cheap (no copies)
// until serialised.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: header).
  let recordLine = 1;
  let recordRow = null;

  // Last field read: its value, how it ended, and how many characters readUnquoted
  // kept beyond its prefix (for the quote_junk check).
  let fValue = '';
  let fEnded = 0;
  let fAdded = 0;

  // Index of the next LF at or after pos, or n when there is none; -1 means unknown.
  // Recomputed whenever pos moves past it (a quoted field may span lines).
  let nlCache = -1;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Push one stray_cr error per CR in `seg` and return `seg` with every CR dropped.
  function stripStrayCRs(seg) {
    let out = seg;
    let at = out.indexOf('\r');
    while (at !== -1) {
      error('stray_cr');
      out = out.slice(0, at) + out.slice(at + 1);
      at = out.indexOf('\r', at);
    }
    return out;
  }

  // Reads unquoted characters onto `pre` up to the next comma or line break; a CR not
  // followed by LF is dropped (stray_cr). Results in fValue / fEnded / fAdded.
  function readUnquoted(pre) {
    if (nlCache === -1 || pos > nlCache) {
      const i = text.indexOf('\n', pos);
      nlCache = i === -1 ? n : i;
    }
    const nl = nlCache;
    const comma = text.indexOf(',', pos);
    let end;
    let ended;
    if (comma !== -1 && comma < nl) {
      end = comma;
      ended = COMMA;
    } else if (nl < n) {
      end = nl;
      ended = LINE_BREAK;
    } else {
      end = n;
      ended = END;
    }
    let value = pre;
    if (ended === LINE_BREAK && end > pos && text.charCodeAt(end - 1) === 13) {
      // CRLF ends the field; any other CR before it is stray.
      const seg = text.slice(pos, end - 1);
      value += seg.indexOf('\r') === -1 ? seg : stripStrayCRs(seg);
      pos = end + 1;
      line += 1;
    } else {
      const seg = text.slice(pos, end);
      value += seg.indexOf('\r') === -1 ? seg : stripStrayCRs(seg);
      if (ended === COMMA) {
        pos = end + 1;
      } else if (ended === LINE_BREAK) {
        pos = end + 1;
        line += 1;
      } else {
        pos = n;
      }
    }
    fValue = value;
    fEnded = ended;
    fAdded = value.length - pre.length;
  }

  // Reads a quoted field whose opening quote is at pos. Results in fValue / fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = pos + 1;
    let value = '';
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is
        // read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        value += text.slice(p, q) + '"';
        p = q + 2;
        continue;
      }
      value += text.slice(p, q);
      // CRLF and lone CRs inside quotes each read as one LF; count the line breaks.
      if (value.indexOf('\r') !== -1 || value.indexOf('\n') !== -1) {
        let norm = '';
        let breaks = 0;
        let s = 0;
        for (;;) {
          const cr = value.indexOf('\r', s);
          const lf = value.indexOf('\n', s);
          if (cr === -1 && lf === -1) {
            norm += value.slice(s);
            break;
          }
          if (lf !== -1 && (cr === -1 || lf < cr)) {
            norm += value.slice(s, lf) + '\n';
            breaks += 1;
            s = lf + 1;
          } else {
            norm += value.slice(s, cr) + '\n';
            breaks += 1;
            s = cr + (value.charCodeAt(cr + 1) === 10 ? 2 : 1);
          }
        }
        value = norm;
        line += breaks;
      }
      pos = q + 1;
      if (pos >= n) {
        fValue = value;
        fEnded = END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fValue = value;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the next comma
      // or line break.
      readUnquoted(value);
      if (fAdded > 0) error('quote_junk');
      return;
    }
  }

  while (pos < n) {
    // Lines with no characters are no records.
    let c = text.charCodeAt(pos);
    while (c === 10 || (c === 13 && text.charCodeAt(pos + 1) === 10)) {
      pos += c === 10 ? 1 : 2;
      line += 1;
      if (pos >= n) break;
      c = text.charCodeAt(pos);
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record's first line holds no quote. A sliced line is a cheap
    // view, so probe it, then split it natively.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    const lineStr = text.slice(pos, lineEnd);
    let body = lineStr;
    if (nl !== -1 && lineStr.charCodeAt(lineStr.length - 1) === 13) body = lineStr.slice(0, -1);
    if (body.indexOf('"') === -1 && body.indexOf('\r') === -1) {
      const fields = body.split(',');
      pos = nl === -1 ? n : nl + 1;
      line += 1;
      if (fields.length === 1 && fields[0] === '') continue; // an empty line: no record
      if (width < 0) width = fields.length;
      if (header && columns === null) {
        columns = fields;
        continue;
      }
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
      }
      rows.push(fields);
      continue;
    }

    // Slow path: the record holds a quote (or a stray CR) on its first line.
    nlCache = nl === -1 ? n : nl;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its
    // stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
