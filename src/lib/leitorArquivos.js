// Transforma o arquivo recebido em texto, tudo no navegador (sem custo):
//  - PDF com texto: extrai o texto (pdf.js), mantendo colunas com TAB
//  - PDF escaneado e fotos/prints: OCR (Tesseract.js, mesmo do AMP DRE)
//  - Excel/CSV: lê a planilha (SheetJS)
// As bibliotecas são carregadas só quando usadas (não pesam no app).

const IMG = /^image\//
const PLANILHA = /\.(xlsx|xls|ods|csv)$/i

export function tipoArquivo(file) {
  if (!file) return null
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  if (IMG.test(file.type) || /\.(png|jpe?g|webp|bmp|heic)$/i.test(file.name)) return 'imagem'
  if (PLANILHA.test(file.name) || /spreadsheet|excel|csv/.test(file.type)) return 'planilha'
  if (file.type.startsWith('text/') || /\.txt$/i.test(file.name)) return 'texto'
  return null
}

/**
 * @param {File} file
 * @param {(p:{etapa:string, pct?:number})=>void} progresso
 * @returns {Promise<{texto:string, origem:'pdf'|'imagem'|'planilha'|'texto', ocr:boolean}>}
 */
export async function lerArquivo(file, progresso = () => {}) {
  const tipo = tipoArquivo(file)
  if (!tipo) throw new Error('Formato não suportado. Envie PDF, foto (JPG/PNG), Excel ou CSV.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 15 MB).')

  if (tipo === 'texto') return { texto: await file.text(), origem: 'texto', ocr: false }
  if (tipo === 'planilha') return { texto: await lerPlanilha(file), origem: 'planilha', ocr: false }
  if (tipo === 'imagem') {
    progresso({ etapa: 'Preparando a imagem...' })
    const canvas = await preparar(await carregarImagem(file))
    return { texto: await ocr([canvas], progresso), origem: 'imagem', ocr: true }
  }
  // PDF
  progresso({ etapa: 'Abrindo o PDF...' })
  const { texto, paginasSemTexto } = await textoDoPdf(file)
  if (paginasSemTexto.length === 0) return { texto, origem: 'pdf', ocr: false }
  // escaneado: OCR nas páginas sem texto (até 5)
  const canvases = []
  for (const pg of paginasSemTexto.slice(0, 5)) canvases.push(await preparar(pg))
  const lido = await ocr(canvases, progresso)
  return { texto: [texto, lido].filter(Boolean).join('\n'), origem: 'pdf', ocr: true }
}

// ------------------------------------------------------------------ planilha
async function lerPlanilha(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false })
  return linhas.map((r) => r.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t')).join('\n')
}

// ------------------------------------------------------------------ PDF
async function textoDoPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const partes = []
  const paginasSemTexto = []
  const total = Math.min(doc.numPages, 20)
  for (let n = 1; n <= total; n++) {
    const pagina = await doc.getPage(n)
    const conteudo = await pagina.getTextContent()
    const texto = montarLinhas(conteudo.items)
    if (texto.replace(/\s/g, '').length < 15) {
      // página sem texto (escaneada): renderiza para o OCR
      const vp = pagina.getViewport({ scale: 2.2 })
      const c = document.createElement('canvas')
      c.width = vp.width; c.height = vp.height
      await pagina.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise
      paginasSemTexto.push(c)
    } else partes.push(texto)
  }
  return { texto: partes.join('\n'), paginasSemTexto }
}

// Agrupa os pedaços de texto do PDF em linhas (mesma altura) e coloca TAB
// onde há um espaço grande entre eles (colunas de tabela)
function montarLinhas(items) {
  const pedacos = items.filter((i) => i.str && i.str.trim()).map((i) => ({
    x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 10, s: i.str,
  }))
  pedacos.sort((a, b) => b.y - a.y || a.x - b.x)
  const linhas = []
  for (const p of pedacos) {
    const l = linhas.find((ln) => Math.abs(ln.y - p.y) < Math.max(3, p.h * 0.45))
    if (l) l.p.push(p); else linhas.push({ y: p.y, p: [p] })
  }
  return linhas.map((l) => {
    l.p.sort((a, b) => a.x - b.x)
    let out = ''
    let fim = null
    for (const p of l.p) {
      if (fim != null) {
        const gap = p.x - fim
        out += gap > p.h * 1.6 ? '\t' : gap > p.h * 0.15 ? ' ' : ''
      }
      out += p.s
      fim = p.x + p.w
    }
    return out.trim()
  }).filter(Boolean).join('\n')
}

// ------------------------------------------------------------------ imagem / OCR
function carregarImagem(file) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); ok(img) }
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não consegui abrir a imagem. Tente JPG ou PNG.')) }
    img.src = url
  })
}

// Escala, tons de cinza e contraste (Otsu) — melhora muito o OCR de foto de celular
function preparar(fonte) {
  const w0 = fonte.naturalWidth || fonte.width, h0 = fonte.naturalHeight || fonte.height
  const escala = Math.min(2.5, Math.max(1, 1800 / Math.max(w0, h0) * (Math.max(w0, h0) < 1200 ? 1.5 : 1)))
  const lim = 3200 / Math.max(w0, h0)
  const k = Math.min(escala, lim)
  const c = document.createElement('canvas')
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(fonte, 0, 0, c.width, c.height)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  const hist = new Array(256).fill(0)
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0
    d[i] = d[i + 1] = d[i + 2] = g
    hist[g]++
  }
  // limiar de Otsu
  const total = c.width * c.height
  let soma = 0
  for (let t = 0; t < 256; t++) soma += t * hist[t]
  let sB = 0, wB = 0, max = 0, limiar = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue
    const wF = total - wB; if (!wF) break
    sB += t * hist[t]
    const mB = sB / wB, mF = (soma - sB) / wF
    const v = wB * wF * (mB - mF) ** 2
    if (v > max) { max = v; limiar = t }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > limiar ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return c
}

async function ocr(canvases, progresso) {
  const { createWorker } = await import('tesseract.js')
  progresso({ etapa: 'Baixando o leitor de texto (só na 1ª vez)...' })
  let atual = 0
  const worker = await createWorker('por', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(((atual + m.progress) / canvases.length) * 100)
        progresso({ etapa: canvases.length > 1 ? `Lendo página ${atual + 1} de ${canvases.length}...` : 'Lendo o texto da imagem...', pct })
      }
    },
  })
  try {
    // PSM 6 = bloco de texto uniforme (listas); preserva espaços entre colunas
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
    const textos = []
    for (atual = 0; atual < canvases.length; atual++) {
      const { data } = await worker.recognize(canvases[atual])
      textos.push(data.text || '')
    }
    // espaços longos entre colunas viram TAB (tabela fotografada)
    return textos.join('\n').split('\n').map((l) => l.replace(/ {3,}/g, '\t')).join('\n')
  } finally {
    await worker.terminate()
  }
}
