// Small, genuine PDFs for offline screening and integration tests.
export function makeBookPdf(pages: string[][], script?: string): Buffer {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const scriptId = 4 + pages.length * 2;
  objects.push(
    `<< /Type /Catalog /Pages 2 0 R${
      script ? ` /Names << /JavaScript << /Names [(test) ${scriptId} 0 R] >> >>` : ''
    } >>`
  );
  objects.push(
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>`
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const escape = (line: string) => line.replace(/([\\()])/g, '\\$1');
  for (const [index, lines] of pages.entries()) {
    const id = pageIds[index];
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${
        id + 1
      } 0 R >>`
    );
    const stream = `BT /F1 12 Tf 40 750 Td 16 TL\n${lines
      .map((line) => `(${escape(line)}) Tj T*`)
      .join('\n')}\nET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  if (script) objects.push(`<< /S /JavaScript /JS (${escape(script)}) >>`);
  let data = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(data));
    data += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(data);
  data += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  data += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  data += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(data);
}

export function makeScannedBookPdf(jpeg: Buffer, width: number, height: number): Buffer {
  const drawing = Buffer.from('q 612 0 0 792 0 0 cm /Scan Do Q');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>'
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${drawing.length} >>\nstream\n`),
      drawing,
      Buffer.from('\nendstream'),
    ]),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
      ),
      jpeg,
      Buffer.from('\nendstream'),
    ]),
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = parts[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const part = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(part);
    length += part.length;
  }
  parts.push(
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
        .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`
    )
  );
  return Buffer.concat(parts);
}
