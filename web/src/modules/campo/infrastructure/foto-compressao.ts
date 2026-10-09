import { dimensoesReduzidas, escolherEnvio, QUALIDADE_JPEG } from '../domain/foto';

/** Reduz no aparelho (~300–500 KB). `createImageBitmap` respeita a rotação EXIF da câmera. */
async function reduzir(arquivo: File): Promise<Blob | null> {
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    const { largura, altura } = dimensoesReduzidas(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, largura, altura);
    return await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALIDADE_JPEG));
  } catch {
    return null; // HEIC em navegador sem suporte, arquivo corrompido…
  } finally {
    bmp?.close();
  }
}

export async function prepararFoto(arquivo: File): Promise<Blob> {
  const reduzida = await reduzir(arquivo);
  const escolha = escolherEnvio({ tipo: arquivo.type, bytes: arquivo.size }, reduzida ? { bytes: reduzida.size } : null);
  if ('erro' in escolha) throw new Error(escolha.erro);
  return escolha.usar === 'reduzida' && reduzida ? reduzida : arquivo;
}
