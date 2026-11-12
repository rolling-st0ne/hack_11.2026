// RFC 4180 CSV; no spreadsheet formulas or executable content are evaluated.
export function parseCsv(input) {
  const source=String(input).replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(quoted){if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c==='"'){if(cell||closed)throw new Error('Некорректные кавычки CSV');quoted=true;}
    else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&source[i+1]==='\n')i++;rows.push(row);row=[];}}
    else{if(closed)throw new Error('Текст после закрывающей кавычки');cell+=c;}
  }
  if(quoted)throw new Error('Незакрытая кавычка CSV');
  if(cell||row.length||closed)rows.push([...row,cell]);
  if(!rows.length)throw new Error('Пустой CSV');
  const headers=rows.shift();
  if(headers.some(h=>!h||['__proto__','prototype','constructor'].includes(h))||new Set(headers).size!==headers.length)throw new Error('Некорректные или повторяющиеся колонки');
  return {headers,rows:rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`Строка ${i+2}: ожидалось ${headers.length} колонок`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));})};
}
export function writeCsv(rows,headers=Array.from(new Set(rows.flatMap(r=>Object.keys(r))))) {
  const cell=v=>{const s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
  return [headers.map(cell).join(','),...rows.map(r=>headers.map(h=>cell(r[h])).join(','))].join('\r\n')+'\r\n';
}
