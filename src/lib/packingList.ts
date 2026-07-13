/**
 * Hoja de carga (packing list) del evento en PDF — SPEC §9.
 *
 * Es el documento que el operario se lleva al montaje: se imprime en A4, se lee
 * en blanco y negro y se marca a mano. Por eso no se apoya en color para
 * distinguir nada (el estado va escrito) y lleva una casilla dibujada por línea.
 *
 * Se genera en el cliente con jsPDF + autotable: no hay servidor que renderice
 * PDFs ni hace falta.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Evento } from './domain'
import { formatFecha } from './format'

/** Una línea de material de la hoja de carga. */
export interface LineaPacking {
  producto: string
  categoria: string
  ubicacion: string
  unidades: number
  /** `Reservado` (sigue en el almacén) o `Fuera` (ya salió a este evento). */
  estado: 'Reservado' | 'Fuera'
}

/** `Gala Premios Ondas` → `gala-premios-ondas` (para el nombre del fichero). */
function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita las tildes que NFD ha separado
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

const GRIS_TINTA = 90
const MARGEN = 14

/**
 * Genera la hoja de carga y la descarga. Devuelve el nombre del fichero para
 * poder confirmarlo en un toast.
 */
export function descargarPackingList(
  evento: Evento,
  cliente: string | null,
  lineas: LineaPacking[],
): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()

  // --- Cabecera: marca Suricato + título del documento ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('SURICATO', MARGEN, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(GRIS_TINTA)
  doc.text('· wms ·', MARGEN + 34, 20)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(0)
  doc.text('Hoja de carga', ancho - MARGEN, 20, { align: 'right' })

  doc.setDrawColor(0)
  doc.setLineWidth(0.4)
  doc.line(MARGEN, 24, ancho - MARGEN, 24)

  // --- Datos del evento ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(evento.nombre, MARGEN, 34)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(GRIS_TINTA)
  doc.text(`Cliente: ${cliente ?? 'sin asignar'}`, MARGEN, 41)
  // Guion normal, no raya (—): las fuentes estándar del PDF son WinAnsi y la raya
  // no existe en ese juego — se imprimía como un hueco.
  doc.text(
    `Fechas: ${formatFecha(evento.fecha_inicio)} - ${formatFecha(evento.fecha_fin)}`,
    MARGEN,
    47,
  )
  doc.text(`Generada: ${formatFecha(new Date().toISOString())}`, ancho - MARGEN, 41, {
    align: 'right',
  })
  const unidades = lineas.reduce((s, l) => s + l.unidades, 0)
  doc.text(
    `${lineas.length} referencia${lineas.length === 1 ? '' : 's'} · ${unidades} unidad${unidades === 1 ? '' : 'es'}`,
    ancho - MARGEN,
    47,
    { align: 'right' },
  )

  // --- Tabla de material, con casilla para marcar a mano ---
  autoTable(doc, {
    startY: 54,
    margin: { left: MARGEN, right: MARGEN },
    head: [['', 'Producto', 'Categoría', 'Ubicación', 'Uds.', 'Estado']],
    body: lineas.map((l) => [
      '',
      l.producto,
      l.categoria,
      l.ubicacion,
      String(l.unidades),
      l.estado,
    ]),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 2.6,
      textColor: 0,
      lineColor: 150,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: 235,
      textColor: 0,
      fontStyle: 'bold',
      lineColor: 120,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 24 },
    },
    // La casilla se dibuja (un cuadrado), no se escribe: los glifos de checkbox
    // no existen en las fuentes estándar del PDF.
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      const lado = 4
      const x = data.cell.x + (data.cell.width - lado) / 2
      const y = data.cell.y + (data.cell.height - lado) / 2
      doc.setDrawColor(0)
      doc.setLineWidth(0.3)
      doc.rect(x, y, lado, lado)
    },
  })

  // --- Pie: firma del operario ---
  const finTabla = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const y = Math.min(finTabla + 16, doc.internal.pageSize.getHeight() - 20)
  doc.setFontSize(10)
  doc.setTextColor(GRIS_TINTA)
  doc.text('Preparado por: ______________________', MARGEN, y)
  doc.text('Firma: ______________________', ancho - MARGEN, y, { align: 'right' })

  const fichero = `packing-list-${slug(evento.nombre)}-${evento.fecha_inicio}.pdf`
  doc.save(fichero)
  return fichero
}
